#!/usr/bin/env node
import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { createReadStream, readFileSync, appendFileSync, writeFileSync, mkdirSync,
  readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STATES = ['OK_EXACT', 'OK_APPROXIMATED', 'PARTIAL', 'UNSUPPORTED_GEOMETRY',
  'NO_REPRESENTATION', 'FAILED_GEOMETRY', 'NOT_APPLICABLE'];
const counts = () => Object.fromEntries(STATES.map(s => [s, 0]));
const rank = obj => Object.entries(obj).map(([type, count]) => ({ type, count }))
  .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
const usage = 'node scripts/ifc-diag/geometry-diagnose.mjs <file|directory>... [--out=directory] [--timeout=120] [--limit=N] [--parser=bytes|text] [--geometry=main|workers]';

function argumentsFrom(argv) {
  // parser: 'bytes' = production path (byte lexer + EntityStore), 'text' = legacy parseStepText oracle.
  // geometry: 'main' = build on the page's main thread; 'workers' = geometry worker pool over a
  // SharedArrayBuffer index (the page is then served with COOP/COEP so it is cross-origin isolated).
  const options = { inputs: [], out: 'test-results/ifc-diagnostics/geometry', timeout: 120, limit: Infinity, parser: 'bytes', geometry: 'main' };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') { console.log(usage); return null; }
    if (arg.startsWith('--out=')) options.out = arg.slice(6);
    else if (arg.startsWith('--timeout=')) options.timeout = Number(arg.slice(10));
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice(8));
    else if (arg.startsWith('--parser=')) options.parser = arg.slice(9);
    else if (arg.startsWith('--geometry=')) options.geometry = arg.slice(11);
    else if (arg.startsWith('-')) throw new Error(`Unknown argument: ${arg}`);
    else options.inputs.push(arg);
  }
  if (!options.inputs.length) throw new Error(usage);
  if (!options.out || !Number.isFinite(options.timeout) || options.timeout <= 0 ||
      !(options.limit === Infinity || (Number.isInteger(options.limit) && options.limit > 0)) ||
      !['bytes', 'text'].includes(options.parser) || !['main', 'workers'].includes(options.geometry)) {
    throw new Error('Expected a nonempty --out, positive --timeout, positive integer --limit, --parser=bytes|text and --geometry=main|workers.');
  }
  if (options.geometry === 'workers' && options.parser !== 'bytes') throw new Error('--geometry=workers needs --parser=bytes.');
  options.out = path.resolve(options.out);
  return options;
}

function collect(inputs) {
  const files = new Set(), directories = new Set();
  const walk = input => {
    const p = realpathSync(input);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (directories.has(p)) return;
      directories.add(p);
      for (const entry of readdirSync(p).sort()) walk(path.join(p, entry));
    } else if (st.isFile() && /\.ifc$/i.test(p)) files.add(p);
  };
  for (const input of inputs) walk(input);
  return [...files].sort();
}

// Linux process-tree RSS is sampled, not a precise allocation peak; shared pages
// may be counted twice. Includes browser, renderers and utility subprocesses.
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

function markdown(report) {
  const escape = s => String(s).replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
  const lines = ['# IFC geometry diagnostics', '',
    `Files: ${report.files.length}; completed: ${report.totals.completedFiles}; FILE_ERROR: ${report.totals.fileErrors}; elapsed: ${(report.elapsedMs / 1000).toFixed(2)} s.`, '',
    'Products = viewer detectProductTypes + HIDDEN_PRODUCT_TYPES. No compaction or outlier filter.',
    '% OK = (OK_EXACT + OK_APPROXIMATED) / processed products excluding NOT_APPLICABLE and NO_REPRESENTATION; PARTIAL is not OK. Empty denominator = —.',
    'FILE_ERROR rows and aggregate counts include only the products already written; product totals are known only after parsing.', '',
    `| File | Schema | Products / processed | % OK | ${STATES.join(' | ')} | File status |`,
    `| --- | --- | ---: | ---: | ${STATES.map(() => '---:').join(' | ')} | --- |`];
  for (const f of report.files) {
    const n = f.processedProducts - f.counts.NOT_APPLICABLE - f.counts.NO_REPRESENTATION;
    const pct = n ? (100 * (f.counts.OK_EXACT + f.counts.OK_APPROXIMATED) / n).toFixed(2) : '—';
    lines.push(`| ${escape(f.file)} | ${escape(f.schema || '—')} | ${f.productCount ?? '?'} / ${f.processedProducts} | ${pct} | ${STATES.map(s => f.counts[s]).join(' | ')} | ${f.status}${f.error ? ': ' + escape(f.error.message) : ''} |`);
  }
  lines.push('', '## Unsupported types reported by the engine', '',
    'Count = affected products, once per type per product (not mesh instances). This is the failure ranking, not every type encountered in Representation. A listed type may also mean a failed supported builder. Wrapper types are retained when the engine cannot resolve them.', '',
    '| Type | Products |', '| --- | ---: |');
  for (const x of report.totals.unsupportedTypes) lines.push(`| ${x.type} | ${x.count} |`);
  lines.push('', `Nonfinite position components: ${report.totals.nanCount}; degenerate triangles: ${report.totals.degenerateTriangles}.`,
    `Peak sampled browser process-tree RSS: ${(report.totals.peakBrowserRssBytes / 2 ** 20).toFixed(1)} MiB.`, '');
  return lines.join('\n');
}

async function run(options) {
  const files = collect(options.inputs).slice(0, options.limit);
  if (!files.length) throw new Error('No IFC files found.');
  mkdirSync(options.out, { recursive: true });
  const started = performance.now();
  const report = { version: 1, startedAt: new Date().toISOString(), options: { ...options, limit: Number.isFinite(options.limit) ? options.limit : null },
    productSelection: 'detectProductTypes(index) union HIDDEN_PRODUCT_TYPES',
    engineSourceRoot: root,
    engineSha256: Object.fromEntries(['parser/step-parser.js', 'parser/byte-lexer.js', 'parser/entity-store.js', 'parser/entity-index.js',
      'parser/product-detect.js', 'geometry/geometry-core.js', 'geometry/mesh-types.js', 'constants.js']
      .map(file => [file, createHash('sha256').update(readFileSync(path.join(root, 'assets/js/3d/ifc-engine', file))).digest('hex')])),
    files: [], totals: {}, elapsedMs: 0 };
  let active = null, browser;
  // COOP/COEP only for the worker mode: the main-thread mode keeps today's (non-isolated) environment.
  const isolationHeaders = options.geometry === 'workers'
    ? { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } : {};
  const checkpoint = () => {
    const unsupported = {};
    const totals = { completedFiles: 0, fileErrors: 0, productCount: 0, processedProducts: 0,
      counts: counts(), nanCount: 0, degenerateTriangles: 0, parseMs: 0, geometryMs: 0, peakBrowserRssBytes: 0 };
    for (const f of report.files) {
      totals[f.status === 'FILE_ERROR' ? 'fileErrors' : 'completedFiles']++;
      for (const k of ['productCount', 'processedProducts', 'nanCount', 'degenerateTriangles', 'parseMs', 'geometryMs']) totals[k] += f[k] || 0;
      totals.peakBrowserRssBytes = Math.max(totals.peakBrowserRssBytes, f.peakBrowserRssBytes);
      for (const s of STATES) totals.counts[s] += f.counts[s];
      for (const { type, count } of f.unsupportedTypes) unsupported[type] = (unsupported[type] || 0) + count;
    }
    totals.unsupportedTypes = rank(unsupported);
    report.totals = totals;
    report.elapsedMs = performance.now() - started;
    writeFileSync(path.join(options.out, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
    writeFileSync(path.join(options.out, 'summary.md'), markdown(report));
  };
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const current = active;
      if (req.method === 'POST' && current && pathname === `/__report/${current.token}`) {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 16 * 1024 * 1024) throw new Error('Report batch too large');
        }
        if (active !== current) { res.writeHead(410).end(); return; }
        const data = JSON.parse(body), summary = current.summary;
        if (data.metadata) Object.assign(summary, data.metadata);
        if (data.geometryMs !== undefined) summary.geometryMs = data.geometryMs;
        summary.peakJsHeapBytes = Math.max(summary.peakJsHeapBytes, data.heapBytes || 0);
        if (data.rows?.length) {
          appendFileSync(current.output, data.rows.map(row => JSON.stringify(row)).join('\n') + '\n');
          for (const row of data.rows) {
            summary.processedProducts++;
            summary.counts[row.status]++;
            summary.nanCount += row.nanCount;
            summary.degenerateTriangles += row.degenerateTriangles;
            for (const type of new Set(row.diag.unsupported)) current.unsupported[type] = (current.unsupported[type] || 0) + 1;
          }
        }
        res.writeHead(204).end(); return;
      }
      let file;
      if (req.method !== 'GET') { res.writeHead(405).end(); return; }
      if (current && pathname === `/__ifc/${current.token}`) file = current.summary.file;
      else {
        // Serve only the diagnostic page and engine/vendor imports, on loopback.
        if (!pathname.startsWith('/assets/') && !pathname.startsWith('/scripts/ifc-diag/')) { res.writeHead(404).end(); return; }
        file = realpathSync(path.resolve(root, '.' + pathname));
        if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      }
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'text/plain', 'Cache-Control': 'no-store', ...isolationHeaders });
      const stream = createReadStream(file);
      stream.on('error', error => res.destroy(error));
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      if (!res.headersSent) res.writeHead(500);
      res.end(String(error.message));
    }
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await puppeteer.launch({ headless: true, protocolTimeout: Math.max(180000, options.timeout * 1000 + 10000),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info'] });
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const [i, file] of files.entries()) {
      const name = `${String(i + 1).padStart(4, '0')}-${path.basename(file).replace(/[^a-zA-Z0-9_.-]/g, '_')}-${createHash('sha256').update(file).digest('hex').slice(0, 10)}.jsonl`;
      const summary = { file, jsonl: name, bytes: null, status: 'COMPLETE', schema: null,
        productCount: null, processedProducts: 0, counts: counts(), unsupportedTypes: [], nanCount: 0,
        degenerateTriangles: 0, parseMs: null, geometryMs: 0, elapsedMs: 0, peakJsHeapBytes: 0,
        peakBrowserRssBytes: 0, error: null };
      const output = path.join(options.out, name);
      writeFileSync(output, '');
      active = { token: randomUUID(), summary, output, unsupported: {} };
      const token = active.token;
      const fileStart = performance.now();
      let page, timer, sampling, finished = false;
      const sample = () => { summary.peakBrowserRssBytes = Math.max(summary.peakBrowserRssBytes, treeRss(browser.process()?.pid)); };
      try {
        summary.bytes = statSync(file).size;
        const failure = new Promise((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error(`timeout:${options.timeout}s`), { code: 'TIMEOUT' })), options.timeout * 1000);
        });
        const work = async () => {
          page = await browser.newPage();
          if (finished) { await page.close().catch(() => {}); return; }
          // A crashed renderer rejects immediately, without waiting for timeout.
          const crash = new Promise((_, reject) => {
            page.once('error', error => reject(Object.assign(error, { code: 'PAGE_CRASH' })));
            page.once('pageerror', error => reject(Object.assign(error, { code: 'PAGE_ERROR' })));
          });
          const load = async () => {
            await page.goto(`${origin}/scripts/ifc-diag/diag-page.html`, { waitUntil: 'load', timeout: options.timeout * 1000 });
            await page.waitForFunction('typeof window.diagnose === "function"', { timeout: options.timeout * 1000 });
            await page.evaluate((token, parser, geometry) => window.diagnose(token, { parser, geometry }), token, options.parser, options.geometry);
          };
          return Promise.race([load(), crash]);
        };
        sampling = setInterval(sample, 500);
        sample();
        await Promise.race([work(), failure]);
        if (summary.productCount !== summary.processedProducts) throw new Error('Incomplete product report');
      } catch (error) {
        summary.status = 'FILE_ERROR';
        summary.error = { code: error.code || 'FILE_FAILURE', message: String(error.message || error) };
      } finally {
        finished = true;
        clearTimeout(timer); clearInterval(sampling); sample();
        summary.elapsedMs = performance.now() - fileStart;
        summary.unsupportedTypes = rank(active.unsupported);
        active = null; // Reject late HTTP batches from a timed-out page.
        // Closing the target also terminates synchronous geometry stuck in JS.
        if (page) await page.close().catch(() => {});
      }
      report.files.push(summary);
      checkpoint();
      console.log(`[${i + 1}/${files.length}] ${summary.status} ${path.basename(file)} products=${summary.processedProducts}/${summary.productCount ?? '?'} ${(summary.elapsedMs / 1000).toFixed(2)}s`);
    }
    report.finishedAt = new Date().toISOString();
    checkpoint();
    console.log(`Reports: ${options.out}\nFiles=${files.length} errors=${report.totals.fileErrors} products=${report.totals.processedProducts} elapsed=${(report.elapsedMs / 1000).toFixed(2)}s`);
    if (report.totals.fileErrors) process.exitCode = 2;
  } finally {
    await browser?.close().catch(() => {});
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

try {
  const options = argumentsFrom(process.argv.slice(2));
  if (options) await run(options);
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
