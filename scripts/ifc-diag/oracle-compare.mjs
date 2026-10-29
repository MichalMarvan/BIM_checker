#!/usr/bin/env node
import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { createReadStream, readFileSync, writeFileSync, mkdirSync, readdirSync,
  realpathSync, statSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const usage = 'node scripts/ifc-diag/oracle-compare.mjs <file|directory>... [--sample=50] [--manifest=files.json] [--out=directory] [--timeout=300] [--threshold=0.01]';
const hash = value => createHash('sha256').update(value).digest('hex');
const json = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
const hasGeometry = row => row.triangles > 0 && Array.isArray(row.bboxWorld);
const validGeometry = row => row.status === 'GEOMETRY' && hasGeometry(row) && row.bboxWorld.every(Number.isFinite);

export function bboxDeviation(ours, reference, threshold = 0.01) {
  const diagonal = box => Math.hypot(...box.slice(3).map((v, i) => v - box[i]));
  const center = box => box.slice(0, 3).map((v, i) => v + (box[i + 3] - v) / 2);
  const referenceDiagonal = diagonal(reference), oursDiagonal = diagonal(ours);
  const oursCenter = center(ours), referenceCenter = center(reference);
  const diagonalDelta = Math.abs(oursDiagonal - referenceDiagonal);
  const centerDistance = Math.hypot(...oursCenter.map((v, i) => v - referenceCenter[i]));
  // A point reference has no relative scale. Report absolute deviations and
  // mark it unscorable; never silently use an arbitrary metre as denominator.
  const diagonalRelative = referenceDiagonal > 0 ? diagonalDelta / referenceDiagonal : null;
  const centerRelative = referenceDiagonal > 0 ? centerDistance / referenceDiagonal : null;
  return { referenceDiagonal, oursDiagonal, diagonalDelta, centerDistance,
    diagonalRelative, centerRelative,
    score: referenceDiagonal > 0 ? Math.max(diagonalRelative, centerRelative) : null,
    exceedsThreshold: referenceDiagonal > 0 ? Math.max(diagonalRelative, centerRelative) > threshold : null };
}

export function compareProducts(ours, reference, threshold = 0.01) {
  const group = rows => {
    const groups = new Map();
    for (const row of rows) if (row.guid) groups.set(row.guid, [...(groups.get(row.guid) || []), row]);
    return groups;
  };
  const a = group(ours), b = group(reference);
  const result = { matched: [], onlyOurs: [], onlyWebIfc: [], ambiguousGuids: [],
    missingGuids: { ours: ours.filter(r => !r.guid && hasGeometry(r)), webIfc: reference.filter(r => !r.guid && hasGeometry(r)) },
    invalid: { ours: ours.filter(r => r.status === 'PRODUCT_ERROR' || r.status === 'INVALID_GEOMETRY'),
      webIfc: reference.filter(r => r.status === 'PRODUCT_ERROR' || r.status === 'INVALID_GEOMETRY') } };
  // Match strictly within a file; duplicate GlobalIds never become arbitrary pairs.
  for (const guid of new Set([...a.keys(), ...b.keys()])) {
    const aa = a.get(guid) || [], bb = b.get(guid) || [];
    if (!aa.some(hasGeometry) && !bb.some(hasGeometry)) continue;
    if (aa.length > 1 || bb.length > 1) { result.ambiguousGuids.push({ guid, ours: aa, webIfc: bb }); continue; }
    const ar = aa[0], br = bb[0];
    if ((ar && !validGeometry(ar) && hasGeometry(ar)) || (br && !validGeometry(br) && hasGeometry(br)) ||
        ar?.status === 'PRODUCT_ERROR' || br?.status === 'PRODUCT_ERROR') continue;
    if (ar && validGeometry(ar) && br && validGeometry(br)) {
      result.matched.push({ guid, ifcType: ar.ifcType, webIfcType: br.ifcType,
        ours: ar, webIfc: br, ...bboxDeviation(ar.bboxWorld, br.bboxWorld, threshold) });
    } else if (ar && validGeometry(ar)) result.onlyOurs.push({ ...ar, counterpart: br || null });
    else if (br && validGeometry(br)) result.onlyWebIfc.push({ ...br, counterpart: ar || null });
  }
  result.matched.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.guid.localeCompare(b.guid));
  return result;
}

function argumentsFrom(argv) {
  const o = { inputs: [], out: 'test-results/ifc-diagnostics/oracle', timeout: 300, threshold: 0.01, sample: null };
  for (const arg of argv) {
    if (['--help', '-h'].includes(arg)) { console.log(usage); return null; }
    if (arg.startsWith('--out=')) o.out = arg.slice(6);
    else if (arg.startsWith('--manifest=')) o.manifest = path.resolve(arg.slice(11));
    else if (arg.startsWith('--timeout=')) o.timeout = Number(arg.slice(10));
    else if (arg.startsWith('--threshold=')) o.threshold = Number(arg.slice(12));
    else if (arg.startsWith('--sample=')) o.sample = Number(arg.slice(9));
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else o.inputs.push(path.resolve(arg));
  }
  if (!o.inputs.length && !o.manifest) throw new Error(usage);
  if (!o.out || !Number.isFinite(o.timeout) || o.timeout <= 0 || !Number.isFinite(o.threshold) || o.threshold < 0 ||
    (o.sample !== null && (!Number.isInteger(o.sample) || o.sample < 1))) throw new Error('Invalid numeric options');
  o.out = path.resolve(o.out);
  return o;
}

function collect(inputs) {
  const files = new Set(), seen = new Set();
  function walk(input) {
    const p = realpathSync(input), st = statSync(p);
    if (st.isDirectory()) {
      if (seen.has(p)) return;
      seen.add(p);
      for (const entry of readdirSync(p).sort()) walk(path.join(p, entry));
    } else if (st.isFile() && /\.ifc$/i.test(p)) files.add(p);
  }
  inputs.forEach(walk);
  return [...files].sort();
}

function selectFiles(options) {
  if (options.manifest) {
    const entries = JSON.parse(readFileSync(options.manifest, 'utf8'));
    if (!Array.isArray(entries) || !entries.every(x => typeof x === 'string')) throw new Error('Manifest must be a JSON array of paths');
    return collect([...options.inputs, ...entries.map(f => path.resolve(path.dirname(options.manifest), f))]);
  }
  const selected = [];
  for (const input of options.inputs) {
    const files = collect([input]);
    if (!options.sample || !statSync(input).isDirectory()) { selected.push(...files); continue; }
    const groups = new Map();
    for (const file of files) {
      const folder = path.relative(realpathSync(input), file).split(path.sep)[0];
      if (!groups.has(folder)) groups.set(folder, []);
      groups.get(folder).push(file);
    }
    // Deterministic round-robin over first-level folders, not the first 50 names.
    const sample = [];
    for (let i = 0; sample.length < Math.min(options.sample, files.length); i++) {
      for (const group of groups.values()) if (group[i] && sample.length < options.sample) sample.push(group[i]);
    }
    selected.push(...sample);
  }
  return [...new Set(selected)].sort();
}

function webIfc(file, output, log, timeout) {
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(log);
    const child = spawn(process.execPath, [path.join(root, 'scripts/ifc-diag/oracle-web-ifc.mjs'), file, output],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(stream, { end: false }); child.stderr.pipe(stream, { end: false });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeout * 1000);
    child.once('error', reject);
    child.once('close', code => {
      clearTimeout(timer); stream.end();
      if (timedOut) reject(new Error(`web-ifc timeout:${timeout}s (see ${path.basename(log)})`));
      else if (code !== 0) reject(new Error(`web-ifc exit:${code} (see ${path.basename(log)})`));
      else {
        try { resolve(JSON.parse(readFileSync(output, 'utf8'))); } catch (error) { reject(error); }
      }
    });
  });
}

const compact = row => ({ guid: row.guid, ifcType: row.ifcType, expressId: row.ours.expressId,
  webIfcExpressId: row.webIfc.expressId, diagonalRelative: row.diagonalRelative,
  centerRelative: row.centerRelative, centerDistance: row.centerDistance, score: row.score,
  exceedsThreshold: row.exceedsThreshold });

function aggregate(files) {
  const totals = { files: files.length, completedFiles: 0, fileErrors: 0, matched: 0, overThreshold: 0,
    onlyOurs: 0, onlyWebIfc: 0, ambiguousGuids: 0, missingGuids: 0, invalidProducts: 0, zeroDiagonal: 0 };
  const types = new Map(), ranked = [];
  for (const f of files) {
    if (f.status !== 'COMPLETE') { totals.fileErrors++; continue; }
    totals.completedFiles++;
    for (const key of ['matched', 'overThreshold', 'onlyOurs', 'onlyWebIfc', 'ambiguousGuids', 'missingGuids', 'invalidProducts', 'zeroDiagonal']) totals[key] += f.counts[key];
    for (const row of f.ranking) {
      ranked.push({ file: f.file, ...row });
      if (!types.has(row.ifcType)) types.set(row.ifcType, { ifcType: row.ifcType, matched: 0, overThreshold: 0, maxScore: null, worst: null });
      const t = types.get(row.ifcType); t.matched++; t.overThreshold += row.exceedsThreshold === true ? 1 : 0;
      if (row.score !== null && (t.maxScore === null || row.score > t.maxScore)) { t.maxScore = row.score; t.worst = { file: f.file, ...row }; }
    }
  }
  ranked.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.file.localeCompare(b.file) || a.guid.localeCompare(b.guid));
  return { totals, byIfcType: [...types.values()].sort((a, b) => (b.maxScore ?? -1) - (a.maxScore ?? -1)), topDeviations: ranked.slice(0, 100) };
}

function markdown(report, details) {
  const esc = s => String(s ?? '—').replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
  const pct = n => n === null ? '—' : (n * 100).toFixed(5);
  const t = report.totals;
  const lines = ['# Independent IFC oracle', '',
    `Files: ${t.files}; complete: ${t.completedFiles}; FILE_ERROR: ${t.fileErrors}.`,
    `Matched: ${t.matched}; above ${report.options.threshold * 100}%: ${t.overThreshold}; only ours: ${t.onlyOurs}; only web-ifc: ${t.onlyWebIfc}.`,
    `Ambiguous GUIDs: ${t.ambiguousGuids}; missing GUIDs: ${t.missingGuids}; invalid products: ${t.invalidProducts}; zero reference diagonal: ${t.zeroDiagonal}.`, '',
    'Coordinates: IFC Z-up, metres, after product placement; no recentering, MapConversion, CRS reprojection, federation or outlier filter.',
    'Relative diagonal = abs(d_ours - d_web) / d_web; relative centre = distance(c_ours, c_web) / d_web. Flag if either is strictly above threshold.',
    'This compares bounding boxes, not surface accuracy. Triangle counts may differ because tessellation/Boolean handling differ. Only COMPLETE files enter aggregates.', '',
    '| File | Matched | Above threshold | Only ours | Only web-ifc | Status |', '| --- | ---: | ---: | ---: | ---: | --- |'];
  for (const f of report.files) lines.push(`| ${esc(f.file)} | ${f.counts?.matched ?? '—'} | ${f.counts?.overThreshold ?? '—'} | ${f.counts?.onlyOurs ?? '—'} | ${f.counts?.onlyWebIfc ?? '—'} | ${esc(f.status + (f.errors.length ? ': ' + f.errors.join('; ') : ''))} |`);
  lines.push('', '## Ranking by IfcType', '', '| Type | Matched | Above threshold | Maximum deviation % |', '| --- | ---: | ---: | ---: |');
  for (const t of report.byIfcType) lines.push(`| ${t.ifcType} | ${t.matched} | ${t.overThreshold} | ${pct(t.maxScore)} |`);
  lines.push('', '## Largest deviations (top 100)', '', '| File | IfcType | GlobalId | ExpressId ours / web-ifc | Diagonal % | Centre % |', '| --- | --- | --- | --- | ---: | ---: |');
  for (const r of report.topDeviations) lines.push(`| ${esc(r.file)} | ${r.ifcType} | ${esc(r.guid)} | ${r.expressId} / ${r.webIfcExpressId} | ${pct(r.diagonalRelative)} | ${pct(r.centerRelative)} |`);
  for (const side of ['onlyOurs', 'onlyWebIfc']) {
    lines.push('', `## ${side}`, '', '| File | IfcType | GlobalId | ExpressId | Counterpart status |', '| --- | --- | --- | ---: | --- |');
    for (const f of details) for (const r of f.comparison?.[side] || []) lines.push(`| ${esc(f.file)} | ${r.ifcType} | ${esc(r.guid)} | ${r.expressId} | ${esc(r.counterpart?.status || 'NOT_SELECTED_OR_ABSENT')} |`);
  }
  lines.push('', '## Limits', '',
    '- web-ifc is an independent implementation, not certified ground truth. Preview schema aliases are rejected.',
    '- Our product selection follows geometry-page.mjs; hidden types are recorded without building geometry. Reference selection includes all schema IfcProduct subtypes.',
    '- Duplicate/missing GUIDs and invalid products are reported separately, never paired arbitrarily. Zero-diagonal references have null relative deviations.',
    '- Bbox centre/diagonal agreement does not prove equal extents, topology, openings, volume, normals, or surfaces.', '');
  return lines.join('\n');
}

async function run(options) {
  const files = selectFiles(options);
  if (!files.length) throw new Error('No IFC files found');
  mkdirSync(options.out, { recursive: true });
  json(path.join(options.out, 'manifest.json'), files);
  const sourceFiles = collectSource(path.join(root, 'assets/js/3d/ifc-engine'));
  const report = { version: 1, startedAt: new Date().toISOString(), options, nodeVersion: process.version,
    coordinateSystem: 'IFC Z-up, metres, product world placements; no map conversion/recentring',
    engineSha256: Object.fromEntries(sourceFiles.map(f => [path.relative(root, f), hash(readFileSync(f))])),
    harnessSha256: Object.fromEntries(['oracle-compare.mjs', 'oracle-page.mjs', 'oracle-web-ifc.mjs'].map(f => [f, hash(readFileSync(path.join(root, 'scripts/ifc-diag', f)))])), files: [] };
  const details = [];
  let active, browser;
  const server = createServer((req, res) => {
    try {
      if (req.method !== 'GET') { res.writeHead(405).end(); return; }
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/oracle.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/assets/js/vendor/three/three.module.js"}}</script><script type="module">import {diagnoseOracle} from "/scripts/ifc-diag/oracle-page.mjs"; window.diagnoseOracle=diagnoseOracle;</script>'); return;
      }
      let file;
      if (active && pathname === `/__ifc/${active.token}`) file = active.file;
      else {
        if (!pathname.startsWith('/assets/') && !pathname.startsWith('/scripts/ifc-diag/')) { res.writeHead(404).end(); return; }
        file = realpathSync(path.resolve(root, '.' + pathname));
        if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      }
      res.writeHead(200, { 'Content-Type': /\.m?js$/.test(file) ? 'text/javascript' : 'text/plain', 'Cache-Control': 'no-store' });
      const stream = createReadStream(file); stream.on('error', e => res.destroy(e)); res.on('close', () => stream.destroy()); stream.pipe(res);
    } catch (error) { if (!res.headersSent) res.writeHead(500); res.end(String(error)); }
  });
  const checkpoint = () => {
    Object.assign(report, aggregate(report.files));
    json(path.join(options.out, 'summary.json'), report);
    writeFileSync(path.join(options.out, 'summary.md'), markdown(report, details));
  };
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await puppeteer.launch({ headless: true, protocolTimeout: options.timeout * 1000 + 10000,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
    report.chromiumVersion = await browser.version();
    for (const [i, file] of files.entries()) {
      const start = performance.now(), stem = `${String(i + 1).padStart(4, '0')}-${path.basename(file)}-${hash(file).slice(0, 8)}`;
      const detail = { file, sha256: hash(readFileSync(file)), bytes: statSync(file).size, status: 'COMPLETE', errors: [] };
      const ours = { rows: [] };
      let reference, page, timer, finished = false;
      active = { file, token: randomUUID() };
      const current = active;
      try {
        const task = async () => {
          page = await browser.newPage();
          if (finished) { await page.close(); return; }
          const crash = new Promise((_, reject) => {
            page.once('error', reject); page.once('pageerror', reject);
          });
          const load = async () => {
            await page.exposeFunction('oracleReport', rows => { if (!finished) ours.rows.push(...rows); });
            await page.goto(`http://127.0.0.1:${server.address().port}/oracle.html`, { timeout: options.timeout * 1000 });
            await page.waitForFunction('typeof window.diagnoseOracle === "function"', { timeout: options.timeout * 1000 });
            const metadata = await page.evaluate(token => window.diagnoseOracle(token), current.token);
            if (!finished) ours.metadata = metadata;
          };
          await Promise.race([load(), crash]);
        };
        await Promise.race([task(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`browser timeout:${options.timeout}s`)), options.timeout * 1000); })]);
      } catch (error) { detail.errors.push(String(error.message)); }
      finally { finished = true; clearTimeout(timer); active = null; await page?.close().catch(() => {}); }
      json(path.join(options.out, stem + '.ours.json'), ours);
      try { reference = await webIfc(file, path.join(options.out, stem + '.web-ifc.json'), path.join(options.out, stem + '.web-ifc.log'), options.timeout); }
      catch (error) { detail.errors.push(String(error.message)); }
      if (detail.errors.length) detail.status = 'FILE_ERROR';
      else {
        detail.comparison = compareProducts(ours.rows, reference.rows, options.threshold);
        detail.oursMetadata = ours.metadata; detail.webIfcMetadata = reference.metadata;
        const c = detail.comparison;
        detail.counts = { matched: c.matched.length, overThreshold: c.matched.filter(r => r.exceedsThreshold).length,
          onlyOurs: c.onlyOurs.length, onlyWebIfc: c.onlyWebIfc.length, ambiguousGuids: c.ambiguousGuids.length,
          missingGuids: c.missingGuids.ours.length + c.missingGuids.webIfc.length,
          invalidProducts: c.invalid.ours.length + c.invalid.webIfc.length, zeroDiagonal: c.matched.filter(r => r.score === null).length };
        detail.ranking = c.matched.map(compact);
      }
      detail.elapsedMs = performance.now() - start;
      json(path.join(options.out, stem + '.comparison.json'), detail);
      const { comparison, ...summary } = detail;
      summary.artifacts = { comparison: stem + '.comparison.json', ours: stem + '.ours.json', webIfc: stem + '.web-ifc.json', log: stem + '.web-ifc.log' };
      report.files.push(summary); details.push(detail); checkpoint();
      console.log(`[${i + 1}/${files.length}] ${detail.status} ${path.basename(file)} matched=${detail.counts?.matched ?? '?'} >threshold=${detail.counts?.overThreshold ?? '?'} ${(detail.elapsedMs / 1000).toFixed(2)}s`);
    }
    report.finishedAt = new Date().toISOString(); checkpoint();
    console.log(JSON.stringify(report.totals)); console.log(`Reports: ${options.out}`);
    if (report.totals.fileErrors) process.exitCode = 2;
  } finally {
    await browser?.close().catch(() => {});
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
}

function collectSource(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? collectSource(path.join(dir, e.name)) : /\.js$/.test(e.name) ? [path.join(dir, e.name)] : []).sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const options = argumentsFrom(process.argv.slice(2)); if (options) await run(options); }
  catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
