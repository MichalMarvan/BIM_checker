#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Real UI: homepage file input -> gzip/IndexedDB -> viewer Storage/Load.
// Run on ThinkPad, one input per fresh browser. Artifacts default to /tmp.
import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { createReadStream, readFileSync, writeFileSync, statSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (name, fallback) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const file = args.find(a => !a.startsWith('--'));
if (!file) {
  console.error('usage: viewer-ui-probe.mjs file.ifc [--heap=8192] [--timeout=1800] [--out=/tmp/ui.json] [--screenshot=/tmp/ui.png]');
  process.exit(2);
}
const input = { path: path.resolve(file), name: path.basename(file), bytes: statSync(file).size };
const heapMb = Number(opt('heap', 8192));
const timeoutMs = Number(opt('timeout', 1800)) * 1000;
const out = path.resolve(opt('out', `/tmp/viewer-ui-${process.pid}.json`));
const screenshot = path.resolve(opt('screenshot', out.replace(/\.json$/, '') + '.png'));
if (!(heapMb > 0 && Number.isFinite(heapMb) && timeoutMs > 0 && Number.isFinite(timeoutMs))) {
  throw new Error('heap and timeout must be positive finite numbers');
}

// Same browser-tree RSS metric and 250 ms sampling as engine-memory-probe.
// Shared pages may be counted more than once; Node and filesystem cache excluded.
function treeRss(pid, seen = new Set()) {
  if (!pid || seen.has(String(pid))) return 0;
  seen.add(String(pid));
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const own = Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0) * 1024;
    const children = readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim();
    return own + (children ? children.split(/\s+/).reduce((sum, child) => sum + treeRss(child, seen), 0) : 0);
  } catch { return 0; }
}

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const f = realpathSync(path.resolve(root, '.' + decodeURIComponent(url.pathname)));
    if (!f.startsWith(root + path.sep) || !statSync(f).isFile()) { res.writeHead(404).end(); return; }
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
      '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.wasm': 'application/wasm' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    createReadStream(f).on('error', () => res.destroy()).pipe(res);
  } catch { res.writeHead(404).end(); }
});

const result = { ok: false, input, heapFlagMb: heapMb, timeoutMs, startedAt: new Date().toISOString(),
  route: ['pages/3d-viewer.html', 'index.html#ifcFileInput', 'pages/3d-viewer.html [data-load-file]'],
  phases: [], pageErrors: [], consoleErrors: [], consoleWarnings: [], pageLog: [], requestFailures: [] };
let browser, page, sampler, watchdog;
let peakRss = 0;
let phase = 'startup';
let uploadStarted, loadStarted;
const started = performance.now();
const elapsed = () => Math.round(performance.now() - started);
const sample = () => {
  const rss = treeRss(browser?.process()?.pid);
  peakRss = Math.max(peakRss, rss);
  return rss;
};
const mark = (name, extra = {}) => {
  result.phases.push({ phase: name, tMs: elapsed(), rssBytes: sample(), ...extra });
  console.error(`[ui-probe] ${name} ${JSON.stringify(extra)}`);
};

// Observe existing calls; do not replace UI handlers, file data or storage results.
async function instrumentStorage(page) {
  await page.evaluate(() => {
    const wrap = (target, method, label, summarizeArgs, summarizeResult) => {
      const original = target[method];
      target[method] = async function (...args) {
        window.__uiMark(label + ':start', summarizeArgs?.(args) || {});
        try {
          const value = await original.apply(this, args);
          window.__uiMark(label + ':done', summarizeResult?.(value) || {});
          return value;
        } catch (e) {
          window.__uiMark(label + ':error', { error: String(e), stack: e.stack });
          throw e;
        }
      };
    };
    wrap(window.Compression, 'compress', 'gzip', a => ({ inputType: typeof a[0], chars: a[0]?.length ?? null }),
      v => ({ bytes: v.byteLength, gzipMagic: window.Compression.isGzipped(v) }));
    wrap(window.Compression, 'decompressToBytes', 'gunzip', a => ({ bytes: a[0]?.byteLength ?? null }),
      v => ({ bytes: v.byteLength }));
    wrap(window.BIMStorage, 'getFileBytes', 'getFileBytes', null, v => ({ bytes: v?.byteLength ?? null }));
  });
}

async function snapshot() {
  return page.evaluate(() => {
    const engine = window.__engine;
    const viewer = engine?._viewer;
    const models = [...(engine?._models?.values() || [])].map(m => m.meta);
    let meshCount = 0, visibleMeshes = 0, triangles = 0;
    for (const model of viewer?._models?.values() || []) {
      model.group.traverse(obj => {
        if (!obj.isMesh) return;
        meshCount++;
        let visible = true;
        for (let p = obj; p; p = p.parent) visible &&= p.visible;
        if (!visible) return;
        visibleMeshes++;
        const g = obj.geometry;
        triangles += (g.index?.count ?? g.attributes.position?.count ?? 0) / 3;
      });
    }
    const status = document.querySelector('#viewer3dStatus');
    return { modelCount: models.length, models, productCount: models.reduce((n, m) => n + (m.geometry?.productCount || 0), 0),
      renderedElementCount: models.reduce((n, m) => n + (m.geometry?.renderedElementCount || 0), 0),
      meshCount, visibleMeshes, triangles, sceneNonempty: visibleMeshes > 0 && triangles > 0,
      rendererFrame: viewer?._renderer?.info.render.frame ?? null,
      contextLost: viewer?._renderer?.getContext().isContextLost() ?? null,
      status: status ? { text: status.textContent, kind: status.dataset.kind, hidden: status.hidden } : null,
      loadingOverlay: document.querySelector('#loadingOverlay')?.classList.contains('show') ?? false,
      loadingText: document.querySelector('#loadingSubtext')?.textContent ?? null,
      fileTree: document.querySelector('#ifcFileTree')?.innerText ?? null,
      heapBytes: performance.memory?.usedJSHeapSize ?? null };
  });
}

try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await puppeteer.launch({ headless: true, protocolTimeout: timeoutMs + 60000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      `--js-flags=--max-old-space-size=${heapMb} --expose-gc`] });
  result.browser = await browser.version();
  result.node = process.version;
  sampler = setInterval(sample, 250);
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  page.setDefaultTimeout(timeoutMs);
  await page.setBypassServiceWorker(true);
  page.on('pageerror', e => result.pageErrors.push({ tMs: elapsed(), message: e.message, stack: e.stack }));
  page.on('console', m => {
    const entry = { tMs: elapsed(), text: m.text(), location: m.location() };
    if (m.type() === 'error') result.consoleErrors.push(entry);
    else if (m.type() === 'warn') result.consoleWarnings.push(entry);
    else if (/3d-viewer|ifc-engine|\[viewer\]/i.test(m.text())) result.pageLog.push(entry);
  });
  page.on('requestfailed', r => result.requestFailures.push({ url: r.url(), error: r.failure()?.errorText }));
  page.on('dialog', async d => { mark('native-dialog', { message: d.message() }); await d.accept(); });
  await page.exposeFunction('__uiProbeEvent', (name, data) => mark(name, data));
  await page.evaluateOnNewDocument(() => {
    // Only suppress onboarding; backend, cache and viewer defaults stay intact.
    localStorage.setItem('localFolderOnboarding', JSON.stringify({ state: 'disabled' }));
    window.__uiEvents = [];
    window.__uiMark = (name, data = {}) => {
      const entry = { name, ...data, heapBytes: performance.memory?.usedJSHeapSize ?? null };
      window.__uiEvents.push(entry);
      void window.__uiProbeEvent(name, entry);
    };
    const read = FileReader.prototype.readAsText;
    FileReader.prototype.readAsText = function (blob, ...rest) {
      window.__uiMark('FileReader.readAsText:start', { bytes: blob.size });
      this.addEventListener('load', () => window.__uiMark('FileReader.readAsText:load', {
        resultType: typeof this.result, chars: this.result?.length ?? null, error: this.error?.message ?? null }), { once: true });
      this.addEventListener('error', () => window.__uiMark('FileReader.readAsText:error', {
        error: this.error?.message ?? 'FileReader error' }), { once: true });
      return read.call(this, blob, ...rest);
    };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, ...rest) {
      const key = String(value?.key || '');
      const content = key.startsWith('ifc_files_file_');
      if (content) window.__uiMark('idb-content-put:start', { key, bytes: value.value?.byteLength ?? null });
      const request = put.call(this, value, ...rest);
      if (content) {
        this.transaction.addEventListener('complete', () => window.__uiMark('idb-content-put:committed', { key }), { once: true });
        this.transaction.addEventListener('abort', () => window.__uiMark('idb-content-put:error', { key, error: this.transaction.error?.message }), { once: true });
      }
      return request;
    };
    window.addEventListener('storage:fileAdded', e => window.__uiMark('storage:fileAdded', { fileName: e.detail.fileName }));
    window.addEventListener('unhandledrejection', e => window.__uiMark('unhandledrejection', { error: String(e.reason), stack: e.reason?.stack }));
  });
  const crash = new Promise((_, reject) => page.once('error', e => reject(new Error(`renderer crash: ${e.message}`))));
  const timeout = new Promise((_, reject) => {
    watchdog = setTimeout(() => reject(new Error(`UI timeout after ${timeoutMs} ms (${phase})`)), timeoutMs);
  });
  const run = async () => {
    phase = 'viewer-initial';
    await page.goto(`${origin}/pages/3d-viewer.html`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => typeof window.__loadIfcFromStorage === 'function');
    mark('viewer-opened', { fileInputs: await page.$$eval('input[type=file]', els => els.length) });
    // The viewer has no upload input. Use the application's real homepage UI.
    phase = 'upload';
    await page.goto(`${origin}/index.html`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => typeof filePanel_ifc !== 'undefined' && filePanel_ifc?.storage?.ready
      && typeof filePanel_ifc.handleOutsideClick === 'function');
    await instrumentStorage(page);
    uploadStarted = performance.now();
    mark('upload-start');
    await (await page.$('#ifcFileInput')).uploadFile(input.path);
    if (input.bytes > 50 * 1048576) {
      await page.waitForSelector('.toast-btn-confirm', { visible: true });
      await page.click('.toast-btn-confirm');
      mark('large-file-confirmed');
    }
    await page.waitForFunction(() => window.__uiEvents.some(e => ['storage:fileAdded', 'unhandledrejection', 'FileReader.readAsText:error'].includes(e.name)));
    const failure = await page.evaluate(() => window.__uiEvents.find(e => ['unhandledrejection', 'FileReader.readAsText:error'].includes(e.name)));
    if (failure) throw new Error(`${failure.name}: ${failure.error}`);
    await page.waitForFunction(() => !document.querySelector('#loadingOverlay').classList.contains('show'));
    result.uploadMs = Math.round(performance.now() - uploadStarted);
    mark('upload-complete');
    phase = 'viewer-load';
    await page.goto(`${origin}/pages/3d-viewer.html`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => typeof window.__loadIfcFromStorage === 'function');
    await instrumentStorage(page);
    // boot() opens Storage automatically on an empty scene; clicking it again
    // would close the drawer. Wait for that actual UI instead.
    await page.waitForSelector('[data-load-file]', { visible: true });
    result.storageBackend = await page.evaluate(() => window.BIMStorage.backend.kind);
    loadStarted = performance.now();
    mark('viewer-load-click');
    await page.click('[data-load-file]');
    await page.waitForFunction(() => ['success', 'error'].includes(document.querySelector('#viewer3dStatus')?.dataset.kind));
    result.loadMs = Math.round(performance.now() - loadStarted);
    // Wait for two actual renderer frames after page-level success/fitAll.
    const frame = await page.evaluate(() => window.__engine?._viewer?._renderer.info.render.frame ?? null);
    if (frame !== null) await page.waitForFunction(f => window.__engine._viewer._renderer.info.render.frame >= f + 2, {}, frame);
    result.scene = await snapshot();
    result.ok = result.scene.status?.kind === 'success' && result.scene.modelCount > 0
      && result.scene.sceneNonempty && result.scene.contextLost === false
      && !result.pageErrors.length && !result.consoleErrors.length;
    if (!result.ok) result.error = result.scene.status?.text || 'Empty scene or browser errors';
    mark('viewer-finished', { ok: result.ok });
  };
  await Promise.race([run(), crash, timeout]);
} catch (e) {
  result.error = e.message;
  result.stack = e.stack;
} finally {
  clearTimeout(watchdog);
  result.failedPhase = result.ok ? null : phase;
  result.uiWallMs = elapsed();
  if (page && !page.isClosed()) {
    // Bound post-failure diagnostics too (a hung renderer must not block cleanup).
    const bounded = async task => {
      let timer;
      try { return await Promise.race([task, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('diagnostic timeout')), 15000); })]); }
      finally { clearTimeout(timer); }
    };
    try { result.scene ??= await bounded(snapshot()); } catch (e) { result.snapshotError = e.message; }
    try {
      await bounded(page.screenshot({ path: screenshot, fullPage: false }));
      result.screenshot = screenshot;
    } catch (e) { result.screenshotError = e.message; }
  }
  sample();
  clearInterval(sampler);
  await browser?.close().catch(() => {});
  server.closeAllConnections();
  server.close();
}
result.wallMs = elapsed();
result.peakRssBytes = peakRss;
result.peakRssMiB = Number((peakRss / 1048576).toFixed(2));
result.memoryMetric = 'sum browser process-tree VmRSS, sampled every 250 ms; no forced GC; includes screenshot; excludes Node';
writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.ok ? 0 : 1;
