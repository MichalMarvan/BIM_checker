#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */

import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(root, 'test-results');
const supplied = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const files = (supplied.length ? supplied : ['tests/fixtures/handoff-wall.ifc']).map(path => resolve(path));
for (const path of files) {
    if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`IFC performance input does not exist: ${path}`);
}
const maxHeapBytes = Number(process.env.PERF_MAX_HEAP_MB || 1024) * 1048576;
const maxFixtureLoadMs = Number(process.env.PERF_MAX_FIXTURE_LOAD_MS || 30000);
const mime = {
    '.css': 'text/css', '.dtd': 'application/xml', '.html': 'text/html', '.ico': 'image/x-icon',
    '.ifc': 'text/plain; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json',
    '.mjs': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm', '.xml': 'application/xml', '.xsd': 'application/xml'
};

function safePath(urlPath) {
    const pathname = decodeURIComponent(new URL(urlPath, 'http://127.0.0.1').pathname);
    const path = resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
    return path === root || path.startsWith(root + sep) ? path : null;
}

const server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const perfMatch = url.pathname.match(/^\/__perf_ifc__\/(\d+)$/);
    const path = perfMatch ? files[Number(perfMatch[1])] : safePath(request.url || '/');
    if (!path || !existsSync(path) || statSync(path).isDirectory()) {
        response.writeHead(404).end('Not found');
        return;
    }
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    response.end(readFileSync(path));
});
await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
});

const origin = `http://127.0.0.1:${server.address().port}`;
const failures = [];
const report = {
    generatedAt: new Date().toISOString(),
    environment: {},
    inputs: files.map(path => ({ name: basename(path), bytes: statSync(path).size })),
    loads: [],
    aggregate: {}
};
let browser;

function profileLimit(bytes) {
    if (bytes <= 10 * 1048576) return maxFixtureLoadMs;
    if (bytes <= 75 * 1048576) return Number(process.env.PERF_MAX_50MB_LOAD_MS || 180000);
    if (bytes <= 200 * 1048576) return Number(process.env.PERF_MAX_150MB_LOAD_MS || 360000);
    return Number(process.env.PERF_MAX_500MB_LOAD_MS || 900000);
}

try {
    browser = await puppeteer.launch({
        headless: true,
        executablePath: existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
    await page.goto(`${origin}/`, { waitUntil: 'networkidle0', timeout: 30000 });
    const metas = await page.evaluate(async inputs => {
        await window.BIMStorage.init();
        const saved = [];
        for (const input of inputs) {
            const content = await fetch(input.url).then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}: ${input.url}`);
                return response.text();
            });
            const id = await window.BIMStorage.saveFile('ifc', { name: input.name, size: input.bytes, content }, 'root', { allowDuplicate: true });
            saved.push({ id, name: input.name, size: input.bytes });
        }
        return saved;
    }, report.inputs.map((input, index) => ({ ...input, url: `${origin}/__perf_ifc__/${index}` })));

    await page.goto(`${origin}/pages/3d-viewer.html?cache=1`, { waitUntil: 'networkidle0', timeout: 30000 });
    report.environment = await page.evaluate(() => ({
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency || null,
        deviceMemoryGiB: navigator.deviceMemory || null,
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio }
    }));

    for (const meta of metas) {
        const result = await page.evaluate(async file => {
            const start = performance.now();
            const modelId = await window.__loadIfcFromStorage(file);
            const loadMs = performance.now() - start;
            await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
            const engine = window.__engine;
            const viewer = engine._viewer;
            const rendererInfo = viewer?._renderer?.info?.render || {};
            const record = engine._models.get(modelId);
            const ids = record ? [...record.index._byId.keys()].slice(0, 40) : [];
            const selectionStart = performance.now();
            for (let i = 0; i < 100 && ids.length; i++) {
                engine.selectEntities([{ modelId, expressId: ids[i % ids.length] }], 'replace');
            }
            engine.clearSelection();
            const selection100Ms = performance.now() - selectionStart;
            const frameStart = performance.now();
            await new Promise(resolveFrames => {
                let frames = 0;
                const tick = () => (++frames >= 30 ? resolveFrames() : requestAnimationFrame(tick));
                requestAnimationFrame(tick);
            });
            const frameMs = performance.now() - frameStart;
            return {
                modelId,
                loadMs,
                stats: engine.getStats(modelId),
                renderer: {
                    drawCalls: rendererInfo.calls || 0,
                    triangles: rendererInfo.triangles || 0,
                    lines: rendererInfo.lines || 0,
                    points: rendererInfo.points || 0
                },
                selection100Ms,
                fps30FrameSample: frameMs > 0 ? 30000 / frameMs : null,
                softwareGL: Boolean(viewer?._softwareGL),
                heapBytes: performance.memory?.usedJSHeapSize || null
            };
        }, meta);
        report.loads.push({ name: meta.name, bytes: meta.size, ...result });
        if (result.loadMs > profileLimit(meta.size)) failures.push(`${meta.name} load ${Math.round(result.loadMs)} ms exceeded ${profileLimit(meta.size)} ms`);
        if (result.heapBytes && result.heapBytes > maxHeapBytes) failures.push(`${meta.name} heap ${(result.heapBytes / 1048576).toFixed(1)} MiB exceeded ${maxHeapBytes / 1048576} MiB`);
        console.log(`${meta.name}: ${(result.loadMs / 1000).toFixed(2)} s, ${result.renderer.drawCalls} draw calls, ${result.fps30FrameSample.toFixed(1)} FPS sample`);
    }

    const beforeUnload = await page.metrics();
    const aggregate = await page.evaluate(async () => {
        const engine = window.__engine;
        const modelIds = engine.getModels().map(model => model.modelId);
        for (const modelId of modelIds) engine.unloadModel(modelId);
        if (typeof gc === 'function') gc();
        await new Promise(resolveWait => setTimeout(resolveWait, 100));
        const { cacheStats } = await import('./../assets/js/3d/ifc-engine/cache/cache-store.js');
        return { remainingModels: engine.getModels().length, cache: await cacheStats() };
    });
    const afterUnload = await page.metrics();
    report.aggregate = {
        ...aggregate,
        heapBeforeUnloadBytes: beforeUnload.JSHeapUsedSize,
        heapAfterUnloadBytes: afterUnload.JSHeapUsedSize,
        heapReleasedBytes: Math.max(0, beforeUnload.JSHeapUsedSize - afterUnload.JSHeapUsedSize)
    };
    if (aggregate.remainingModels !== 0) failures.push(`${aggregate.remainingModels} models remained after unload`);
} finally {
    if (browser) await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}

report.passed = failures.length === 0;
report.failures = failures;
mkdirSync(outputDir, { recursive: true });
writeFileSync(resolve(outputDir, 'performance-ifc.json'), JSON.stringify(report, null, 2) + '\n');
if (failures.length) {
    for (const failure of failures) console.error(`FAIL: ${failure}`);
    process.exitCode = 1;
} else {
    console.log(`IFC performance OK: ${report.loads.length} model(s), cache ${(report.aggregate.cache.bytes / 1048576).toFixed(1)} MiB, heap released ${(report.aggregate.heapReleasedBytes / 1048576).toFixed(1)} MiB.`);
}
