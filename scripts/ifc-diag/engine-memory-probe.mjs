#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Memory/time probe of the REAL IfcEngine (parser worker + EntityIndex +
// viewer geometry) in headless Chromium, phase by phase:
//   fetched → parsed (worker result) → indexed → beforeCompact → afterCompact → loaded
// Each phase records the renderer JS heap (after a forced GC) and the sampled
// RSS of the whole browser process tree (ArrayBuffers live outside the V8
// heap, so RSS is the honest number for the file bytes).
//
//   node scripts/ifc-diag/engine-memory-probe.mjs <file.ifc> [--heap=8192] [--merged] [--profile] [--out=file.json] [--timeout=1800] [--geometry=main|workers] [--hash]
//   cat big.ifc | node scripts/ifc-diag/engine-memory-probe.mjs --stdin=big.ifc ...
//
// --profile turns on the opt-in geometry-build profile (loadIfc options.profile
// → viewer-core summarizeGeometryProfile): build / outlier / bake / edges /
// finalize split, per-product percentiles, top-10 share, plus the byte
// index lookupKind (dense/map). Pure measurement, no engine behaviour change.
//
// --geometry=workers serves the page with COOP/COEP (cross-origin isolated →
// SharedArrayBuffer): the file is read into a SharedArrayBuffer, the parser
// worker builds shared columns and addModel runs the geometry worker pool.
// --geometry=main keeps today's path (no isolation, transfer, main thread).
// --hash (merged mode) prints SHA-256 of the merged position/normal/color/
// index buffers, the edge buffer, the range tables and the .bimcache payload
// (modelId masked), so two runs can be compared bit for bit.
//
// --stdin keeps large inputs off the disk (they are streamed from another
// host); the bytes are held in this Node process and served to the page once.
import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { createReadStream, readFileSync, writeFileSync, statSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const a = args.find(x => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
};
const merged = args.includes('--merged');
const profile = args.includes('--profile');
const wantHash = args.includes('--hash');
const geometry = opt('geometry', 'main');
if (!['main', 'workers'].includes(geometry)) {
  console.error(`--geometry must be main or workers, not ${geometry}`);
  process.exit(2);
}
const isolationHeaders = geometry === 'workers'
  ? { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } : {};
const heapMb = Number(opt('heap', 8192));
const timeoutS = Number(opt('timeout', 1800));
const outFile = opt('out', null);
const stdinName = opt('stdin', null);
const file = args.find(a => !a.startsWith('--'));
if (!file && !stdinName) {
  console.error('usage: engine-memory-probe.mjs <file.ifc> | --stdin=name [--heap=MB] [--merged] [--profile] [--out=json] [--timeout=s]');
  process.exit(2);
}

async function readAllStdin() {
  const chunks = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
    total += chunk.length;
  }
  return Buffer.concat(chunks, total);
}
const input = stdinName ? await readAllStdin() : readFileSync(file);
const name = stdinName || path.basename(file);
console.log(`[probe] ${name}: ${input.length} B (${(input.length / 1048576).toFixed(1)} MiB), heap flag ${heapMb} MB, merged=${merged} profile=${profile} geometry=${geometry} hash=${wantHash}`);

function treeRss(pid, seen = new Set()) {
  if (!pid || seen.has(pid)) return 0;
  seen.add(pid);
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const own = Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0) * 1024;
    const children = readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim();
    return own + (children ? children.split(/\s+/).reduce((sum, child) => sum + treeRss(child, seen), 0) : 0);
  } catch { return 0; }
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{"imports":{
 "three":"/assets/js/vendor/three/three.module.js",
 "three/examples/jsm/controls/OrbitControls.js":"/assets/js/vendor/three/examples/jsm/controls/OrbitControls.js",
 "three/examples/jsm/environments/RoomEnvironment.js":"/assets/js/vendor/three/examples/jsm/environments/RoomEnvironment.js",
 "three/examples/jsm/exporters/GLTFExporter.js":"/assets/js/vendor/three/examples/jsm/exporters/GLTFExporter.js",
 "three-mesh-bvh":"/assets/js/vendor/three-mesh-bvh/index.module.js"}}</script>
<script type="module">
const phases = [];
const heap = () => { if (window.gc) window.gc(); return performance.memory ? performance.memory.usedJSHeapSize : null; };
async function mark(phase, extra = {}) {
  const t = performance.now();
  const h = heap();
  const r = await fetch('/__mark?phase=' + phase);
  const rss = Number(await r.text());
  phases.push({ phase, t: Math.round(t), heapBytes: h, rssBytes: rss, ...extra });
}
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha = async (arr) => {
  if (!arr) return null;
  const u8 = arr instanceof ArrayBuffer ? new Uint8Array(arr) : new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  return hex(await crypto.subtle.digest('SHA-256', u8));
};
const shaText = s => sha(new TextEncoder().encode(s));
async function hashModel(engine, id) {
  const vm = engine._viewer._models.get(id);
  if (!vm || !vm.merged || !vm.meshes || vm.meshes.length !== 1) return { note: 'not a merged model' };
  const geom = vm.meshes[0].geometry;
  const edgeGeom = vm.featureEdges && vm.featureEdges[0] ? vm.featureEdges[0].geometry : null;
  const out = {
    position: await sha(geom.getAttribute('position')?.array),
    normal: await sha(geom.getAttribute('normal')?.array),
    color: await sha(geom.getAttribute('color')?.array),
    index: await sha(geom.index?.array),
    edgePositions: await sha(edgeGeom ? edgeGeom.getAttribute('position').array : null),
    anchor: vm.meshes[0].matrix.elements.slice(12, 15),
    table: await shaText(JSON.stringify(vm.mergedTable)),
    edgesTable: await shaText(JSON.stringify(vm.mergedEdgesTable)),
    elementInfo: await shaText(JSON.stringify([...vm.elementInfo])),
    vertexCount: geom.getAttribute('position')?.count ?? 0,
    triangleCount: geom.index ? geom.index.count / 3 : 0,
    edgeVertexCount: edgeGeom ? edgeGeom.getAttribute('position').count : 0,
    tableRows: vm.mergedTable.length,
  };
  // .bimcache: everything except the volatile modelId (and the geometryStats
  // copy of meta, which is identical by construction and hashed via buffers).
  const cacheBuf = await engine.exportModelCache(id);
  if (cacheBuf) {
    const mc = await import('/assets/js/3d/ifc-engine/cache/model-cache.js');
    const p = mc.deserializeModelCache(cacheBuf);
    const meta = { ...p.meta, modelId: null };
    const json = JSON.stringify({ meta, lengthScale: p.lengthScale, productTypes: p.productTypes, anchor: p.anchor,
      table: p.table, elementInfo: p.elementInfo, elementsByType: p.elementsByType, edgesTable: p.edgesTable,
      entities: p.entities, layerIndex: p.layerIndex, coords: p.coords });
    out.bimcacheJson = await shaText(json);
    out.bimcachePosition = await sha(p.position);
    out.bimcacheIndex = await sha(p.index);
    out.bimcacheEdges = await sha(p.edgePositions);
    out.bimcacheBytes = cacheBuf.byteLength;
  }
  return out;
}
window.probe = async ({ merged, profile, geometry, wantHash }) => {
  try {
    await mark('start', { crossOriginIsolated: window.crossOriginIsolated === true });
    const resp = await fetch('/__ifc');
    let buf = await resp.arrayBuffer();
    await mark('fetched', { bytes: buf.byteLength });
    const [mod, ei] = await Promise.all([import('/assets/js/3d/ifc-engine/parser/entity-index.js'), import('/assets/js/3d/ifc-engine/index.js')]);
    const { EntityIndex } = mod;
    const origCompact = EntityIndex.prototype.compact;
    let compactMs = 0;
    // compact() is synchronous in the engine; record around it without changing its result.
    EntityIndex.prototype.compact = function () {
      const before = performance.now();
      window.__beforeCompact = { heapBytes: heap(), t: Math.round(before) };
      // compact() drops the byte store — read the lookup flavour before it goes.
      window.__lookupKind = this._store?.index?.lookupKind ?? 'none(legacy Map)';
      const dropped = origCompact.call(this);
      compactMs = performance.now() - before;
      window.__afterCompact = { heapBytes: heap(), t: Math.round(performance.now()), dropped, kept: this.stats().entityCount };
      return dropped;
    };
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 480;
    document.body.appendChild(canvas);
    const engine = new ei.IfcEngine({ canvas, mergedGeometry: merged });
    const origParse = engine._parseInWorker.bind(engine);
    let parseMs = 0;
    engine._parseInWorker = async (x) => {
      const t = performance.now();
      const r = await origParse(x);
      parseMs = performance.now() - t;
      await mark('parsed', { parseMs: Math.round(parseMs) });
      return r;
    };
    const t0 = performance.now();
    const id = await engine.loadIfc(buf, { name: 'probe.ifc', profile, geometry });
    buf = null;
    const loadMs = performance.now() - t0;
    const meta = engine._models.get(id).meta;
    const geometryBuild = engine._viewer._models.get(id)?.geometryBuild || null;
    await mark('loaded', { loadMs: Math.round(loadMs), compactMs: Math.round(compactMs), entityCount: meta.entityCount, geometry: meta.geometry || null, geometryBuild });
    const hashes = wantHash ? await hashModel(engine, id) : null;
    phases.push({ phase: 'beforeCompact', ...window.__beforeCompact });
    phases.push({ phase: 'afterCompact', ...window.__afterCompact });
    // Sanity: nothing may keep the file bytes alive after compact().
    const rec = engine._models.get(id);
    const storeGone = rec.index._store === null && rec.index._byId instanceof Map;
    const guidCount = rec.index.stats().guidCount;
    let geometryProfile = null;
    const raw = engine._viewer._models.get(id)?.geometryProfile;
    if (raw) {
      const vc = await import('/assets/js/3d/ifc-engine/viewer/viewer-core.js');
      geometryProfile = vc.summarizeGeometryProfile(raw);
      // ms per product in 0.5 ms bins up to 100 ms, last bin = overflow
      const hist = new Array(201).fill(0);
      for (const p of raw.products) hist[Math.min(200, Math.floor(p.ms * 2))] += 1;
      geometryProfile.histogramHalfMs = hist;
    }
    return { ok: true, phases, storeGone, guidCount, meta, lookupKind: window.__lookupKind, geometryProfile, geometryBuild, hashes };
  } catch (e) {
    return { ok: false, error: e.message, stack: (e.stack || '').split('\\n').slice(0, 6).join(' | '), phases };
  }
};
window.__ready = true;
</script></head><body></body></html>`;

let browser;
const marks = [];
const server = createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/__probe.html') { res.writeHead(200, { 'Content-Type': 'text/html', ...isolationHeaders }); res.end(PAGE); return; }
    if (url.pathname === '/__ifc') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': input.length, ...isolationHeaders });
      res.end(input); return;
    }
    if (url.pathname === '/__mark') {
      const rss = treeRss(browser?.process()?.pid);
      marks.push({ phase: url.searchParams.get('phase'), rss });
      res.writeHead(200, { 'Content-Type': 'text/plain', ...isolationHeaders }); res.end(String(rss)); return;
    }
    const f = realpathSync(path.resolve(root, '.' + decodeURIComponent(url.pathname)));
    if (!f.startsWith(root + path.sep) || !statSync(f).isFile()) { res.writeHead(404).end(); return; }
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store', ...isolationHeaders });
    createReadStream(f).pipe(res);
  } catch (e) {
    if (!res.headersSent) res.writeHead(500);
    res.end(String(e.message));
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
browser = await puppeteer.launch({
  headless: true, protocolTimeout: timeoutS * 1000 + 60000,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--js-flags=--max-old-space-size=${heapMb} --expose-gc`],
});
let peakRss = 0;
const sampler = setInterval(() => { peakRss = Math.max(peakRss, treeRss(browser.process()?.pid)); }, 250);
const started = performance.now();
let result;
try {
  const page = await browser.newPage();
  page.on('console', m => { const t = m.text(); if (/ifc-engine|error|warn/i.test(t)) console.log(`  [page] ${t.slice(0, 240)}`); });
  page.on('pageerror', e => console.log(`  [pageerror] ${e.message.slice(0, 240)}`));
  const crash = new Promise((_, reject) => page.once('error', e => reject(Object.assign(new Error(`renderer crash: ${e.message}`), { code: 'CRASH' }))));
  await page.goto(`${origin}/__probe.html`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__ready === true', { timeout: 60000 });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout ${timeoutS}s`)), timeoutS * 1000).unref());
  result = await Promise.race([page.evaluate(opts => window.probe(opts), { merged, profile, geometry, wantHash }), crash, timeout]);
} catch (e) {
  result = { ok: false, error: e.message, code: e.code || null, phases: [] };
} finally {
  clearInterval(sampler);
  peakRss = Math.max(peakRss, treeRss(browser.process()?.pid));
  await browser.close().catch(() => {});
  server.closeAllConnections();
  server.close();
}
result.wallMs = Math.round(performance.now() - started);
result.peakRssBytes = peakRss;
result.input = { name, bytes: input.length };
result.heapFlagMb = heapMb;
result.merged = merged;
result.geometry = geometry;
result.engineRoot = root;
const mb = b => (b == null ? 'n/a' : (b / 1048576).toFixed(0) + ' MiB');
console.log(`[probe] ok=${result.ok}${result.error ? ' error=' + result.error : ''} wall=${result.wallMs} ms peakRss=${mb(peakRss)}`);
for (const p of result.phases || []) {
  const extra = Object.entries(p).filter(([k]) => !['phase', 't', 'heapBytes', 'rssBytes'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ');
  console.log(`  ${p.phase.padEnd(14)} t=${String(p.t).padStart(7)} ms heap=${mb(p.heapBytes).padStart(9)} rss=${mb(p.rssBytes).padStart(9)} ${extra}`);
}
if (result.ok) console.log(`[probe] storeGone=${result.storeGone} guidCount=${result.guidCount} lookupKind=${result.lookupKind} geometryBuild=${JSON.stringify(result.geometryBuild)}`);
if (result.hashes) {
  console.log('[hash] ' + Object.entries(result.hashes).map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 16) : JSON.stringify(v)}`).join(' '));
}
if (result.geometryProfile) {
  const g = result.geometryProfile;
  console.log(`[profile] total=${g.totalMs} ms (yield ${g.yieldMs}) | build=${g.phases.buildMs} outlier=${g.phases.outlierMs} bake=${g.phases.bakeMs} edges=${g.phases.edgesMs} finalize=${g.phases.finalizeMs} other=${g.phases.otherMs}`);
  console.log(`[profile] products=${g.productCount} ms/product mean=${g.productMs.mean} p50=${g.productMs.p50} p90=${g.productMs.p90} p99=${g.productMs.p99} max=${g.productMs.max} | top10=${(g.top10ShareOfBuild * 100).toFixed(1)}% top100=${(g.top100ShareOfBuild * 100).toFixed(1)}% of build`);
  for (const t of g.top10) console.log(`  #${t.expressId} ${t.ifcType} ${t.ms} ms (${t.items} items)`);
}
if (outFile) writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n');
process.exitCode = result.ok ? 0 : 1;
