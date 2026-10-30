#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Memory/time probe of the REAL IfcEngine (parser worker + EntityIndex +
// viewer geometry) in headless Chromium, phase by phase:
//   fetched → parsed (worker result) → indexed → beforeCompact → afterCompact → loaded
// Each phase records the renderer JS heap (after a forced GC) and the sampled
// RSS of the whole browser process tree (ArrayBuffers live outside the V8
// heap, so RSS is the honest number for the file bytes).
//
//   node scripts/ifc-diag/engine-memory-probe.mjs <file.ifc> [--heap=8192] [--merged] [--out=file.json] [--timeout=1800]
//   cat big.ifc | node scripts/ifc-diag/engine-memory-probe.mjs --stdin=big.ifc ...
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
const heapMb = Number(opt('heap', 8192));
const timeoutS = Number(opt('timeout', 1800));
const outFile = opt('out', null);
const stdinName = opt('stdin', null);
const file = args.find(a => !a.startsWith('--'));
if (!file && !stdinName) {
  console.error('usage: engine-memory-probe.mjs <file.ifc> | --stdin=name [--heap=MB] [--merged] [--out=json] [--timeout=s]');
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
console.log(`[probe] ${name}: ${input.length} B (${(input.length / 1048576).toFixed(1)} MiB), heap flag ${heapMb} MB, merged=${merged}`);

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
window.probe = async ({ merged }) => {
  try {
    await mark('start');
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
    const id = await engine.loadIfc(buf, { name: 'probe.ifc' });
    buf = null;
    const loadMs = performance.now() - t0;
    const meta = engine._models.get(id).meta;
    await mark('loaded', { loadMs: Math.round(loadMs), compactMs: Math.round(compactMs), entityCount: meta.entityCount, geometry: meta.geometry || null });
    phases.push({ phase: 'beforeCompact', ...window.__beforeCompact });
    phases.push({ phase: 'afterCompact', ...window.__afterCompact });
    // Sanity: nothing may keep the file bytes alive after compact().
    const rec = engine._models.get(id);
    const storeGone = rec.index._store === null && rec.index._byId instanceof Map;
    const guidCount = rec.index.stats().guidCount;
    return { ok: true, phases, storeGone, guidCount, meta };
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
    if (url.pathname === '/__probe.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE); return; }
    if (url.pathname === '/__ifc') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': input.length });
      res.end(input); return;
    }
    if (url.pathname === '/__mark') {
      const rss = treeRss(browser?.process()?.pid);
      marks.push({ phase: url.searchParams.get('phase'), rss });
      res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(String(rss)); return;
    }
    const f = realpathSync(path.resolve(root, '.' + decodeURIComponent(url.pathname)));
    if (!f.startsWith(root + path.sep) || !statSync(f).isFile()) { res.writeHead(404).end(); return; }
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
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
  result = await Promise.race([page.evaluate(opts => window.probe(opts), { merged }), crash, timeout]);
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
result.engineRoot = root;
const mb = b => (b == null ? 'n/a' : (b / 1048576).toFixed(0) + ' MiB');
console.log(`[probe] ok=${result.ok}${result.error ? ' error=' + result.error : ''} wall=${result.wallMs} ms peakRss=${mb(peakRss)}`);
for (const p of result.phases || []) {
  const extra = Object.entries(p).filter(([k]) => !['phase', 't', 'heapBytes', 'rssBytes'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ');
  console.log(`  ${p.phase.padEnd(14)} t=${String(p.t).padStart(7)} ms heap=${mb(p.heapBytes).padStart(9)} rss=${mb(p.rssBytes).padStart(9)} ${extra}`);
}
if (result.ok) console.log(`[probe] storeGone=${result.storeGone} guidCount=${result.guidCount}`);
if (outFile) writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n');
process.exitCode = result.ok ? 0 : 1;
