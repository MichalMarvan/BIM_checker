#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Smoke test for the geometry worker prerequisites, in headless Chromium:
//   - geometry-core.js (and three.module.js through its relative import)
//     loads inside a `type: 'module'` worker without an import map;
//   - the main thread sees ONE three.js instance: geometry built by the engine
//     is `instanceof` the import-map `three`;
//   - with COOP/COEP (default) the page is crossOriginIsolated, and the byte
//     lexer / TextDecoder / String.fromCharCode work over SharedArrayBuffer views.
//
//   node scripts/ifc-diag/worker-smoke.mjs [--no-isolation]
//
// Exit code 0 only when every check passes for the chosen mode.
import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { createReadStream, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const isolation = !process.argv.includes('--no-isolation');

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{"imports":{"three":"/assets/js/vendor/three/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';
import { buildEntityGeometry } from '/assets/js/3d/ifc-engine/geometry/geometry-core.js';
import { parseStepText } from '/assets/js/3d/ifc-engine/parser/step-parser.js';
import { EntityIndex } from '/assets/js/3d/ifc-engine/parser/entity-index.js';
window.smoke = () => new Promise((resolve) => {
  const main = { crossOriginIsolated: window.crossOriginIsolated === true, sabAvailable: typeof SharedArrayBuffer === 'function' };
  try {
    const { entities } = parseStepText("ISO-10303-21;\\nDATA;\\n#1=IFCCARTESIANPOINT((0.,0.,0.));\\n#2=IFCDIRECTION((0.,0.,1.));\\n#3=IFCAXIS2PLACEMENT3D(#1,#2,$);\\n#4=IFCLOCALPLACEMENT($,#3);\\n#5=IFCRECTANGLEPROFILEDEF(.AREA.,$,#6,1.,2.);\\n#6=IFCAXIS2PLACEMENT2D(#7,$);\\n#7=IFCCARTESIANPOINT((0.,0.));\\n#8=IFCEXTRUDEDAREASOLID(#5,#3,#2,3.);\\n#9=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#8));\\n#10=IFCPRODUCTDEFINITIONSHAPE($,$,(#9));\\n#11=IFCWALL('g',$,'W',$,$,#4,#10,$,$);\\nENDSEC;\\nEND-ISO-10303-21;");
    const r = buildEntityGeometry(new EntityIndex(entities), 11);
    main.sameThreeInstance = r.matrix instanceof THREE.Matrix4 && r.items[0].bufferGeometry instanceof THREE.BufferGeometry;
  } catch (e) {
    main.error = e.message;
  }
  const worker = new Worker('/scripts/ifc-diag/worker-smoke.worker.js', { type: 'module' });
  const timer = setTimeout(() => resolve({ main, worker: { ok: false, error: 'timeout' } }), 30000);
  worker.onmessage = (e) => { clearTimeout(timer); resolve({ main, worker: e.data }); worker.terminate(); };
  worker.onerror = (e) => { clearTimeout(timer); resolve({ main, worker: { ok: false, error: e.message || 'worker error' } }); };
  let sab = null;
  if (main.crossOriginIsolated && main.sabAvailable) {
    const plain = new TextEncoder().encode("ISO-10303-21;\\nHEADER;\\nFILE_SCHEMA(('IFC4'));\\nENDSEC;\\nDATA;\\n#1=IFCCARTESIANPOINT((0.,0.,0.));\\n#2=IFCDIRECTION((0.,0.,1.));\\n#3=IFCAXIS2PLACEMENT3D(#1,#2,$);\\n#4=IFCLOCALPLACEMENT($,#3);\\n#5=IFCRECTANGLEPROFILEDEF(.AREA.,$,#6,1.,2.);\\n#6=IFCAXIS2PLACEMENT2D(#7,$);\\n#7=IFCCARTESIANPOINT((0.,0.));\\n#8=IFCEXTRUDEDAREASOLID(#5,#3,#2,3.);\\n#9=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#8));\\n#10=IFCPRODUCTDEFINITIONSHAPE($,$,(#9));\\n#11=IFCWALL('2abcdefghijklmnopqrstu',$,'Zeď ''ž''',$,$,#4,#10,$,$);\\n#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#3,$);\\nENDSEC;\\nEND-ISO-10303-21;");
    sab = new SharedArrayBuffer(plain.byteLength);
    new Uint8Array(sab).set(plain);
  }
  worker.postMessage({ sab });
});
window.__ready = true;
</script></head><body></body></html>`;

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const headers = isolation
      ? { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' }
      : {};
    if (url.pathname === '/__smoke.html') {
      res.writeHead(200, { 'Content-Type': 'text/html', ...headers });
      res.end(PAGE);
      return;
    }
    const f = realpathSync(path.resolve(root, '.' + decodeURIComponent(url.pathname)));
    if (!f.startsWith(root + path.sep) || !statSync(f).isFile()) { res.writeHead(404).end(); return; }
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store', ...headers });
    createReadStream(f).pipe(res);
  } catch (e) {
    if (!res.headersSent) res.writeHead(500);
    res.end(String(e.message));
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
let result;
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log(`  [pageerror] ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') console.log(`  [${m.type()}] ${m.text()}`); });
  await page.goto(`${origin}/__smoke.html`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__ready === true', { timeout: 60000 });
  result = await page.evaluate(() => window.smoke());
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  server.close();
}
console.log(JSON.stringify({ isolation, ...result }, null, 2));
const w = result.worker || {};
const c = w.checks || {};
const okCommon = result.main.sameThreeInstance === true && w.ok === true && c.buildEntityGeometry === 'function'
  && c.items === 1 && c.positions > 0 && c.matrixIsArray16 === 16 && c.count === 12;
// textDecoderOnSab is informational: Chromium rejects TextDecoder over a shared
// view (decodeRange copies for that case), so only the lexer result over SAB
// bytes (count, non-ASCII params) and the shared columns are required.
const okIso = !isolation || (result.main.crossOriginIsolated && c.crossOriginIsolated && c.bytesShared && c.idsShared
  && c.fromCharCodeOnSab === 'ISO-10303-21' && c.name === "'2abcdefghijklmnopqrstu',$,'Zeď ''ž''',$");
console.log(okCommon && okIso ? 'worker-smoke OK' : 'worker-smoke FAILED');
process.exitCode = okCommon && okIso ? 0 : 1;
