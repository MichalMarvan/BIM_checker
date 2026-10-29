#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */

import puppeteer from 'puppeteer';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(root, 'test-results', 'visual-viewer');
const fixture = readFileSync(resolve(root, 'tests/fixtures/handoff-wall.ifc'), 'utf8');
const guids = ['2O2Fr$t4X7Zf8NOew3FLKr', '0Btm5o6XL0IhurFcbfxOQ7'];
const mime = {
    '.css': 'text/css', '.html': 'text/html', '.ifc': 'text/plain', '.js': 'application/javascript',
    '.json': 'application/json', '.mjs': 'application/javascript', '.png': 'image/png',
    '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.xml': 'application/xml', '.xsd': 'application/xml'
};

function safePath(urlPath) {
    const pathname = decodeURIComponent(new URL(urlPath, 'http://127.0.0.1').pathname);
    const path = resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
    return path === root || path.startsWith(root + sep) ? path : null;
}

const server = createServer((request, response) => {
    const path = safePath(request.url || '/');
    if (!path || !existsSync(path) || statSync(path).isDirectory()) {
        response.writeHead(404).end('Not found');
        return;
    }
    response.writeHead(200, {
        'Content-Type': mime[extname(path)] || 'application/octet-stream',
        'Cache-Control': path.endsWith('sw.js') ? 'no-cache' : 'public, max-age=0'
    });
    response.end(readFileSync(path));
});
await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
});

const origin = `http://127.0.0.1:${server.address().port}`;
const failures = [];
const states = [];
const browserErrors = [];
let browser;

function check(value, message) {
    if (!value) failures.push(message);
}

try {
    mkdirSync(outputDir, { recursive: true });
    browser = await puppeteer.launch({
        headless: true,
        executablePath: existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    page.on('pageerror', error => browserErrors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() === 'error') browserErrors.push(`console.error: ${message.text()}`);
    });
    page.on('requestfailed', request => {
        if (request.url().startsWith(origin)) browserErrors.push(`requestfailed: ${request.url()} (${request.failure()?.errorText || 'unknown'})`);
    });

    await page.goto(`${origin}/pages/ifc-viewer-multi-file.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    const setup = await page.evaluate(async ({ content, targetGuids }) => {
        await window.BIMStorage.init();
        const fileId = await window.BIMStorage.saveFile(
            'ifc', { name: 'visual-wall.ifc', content, size: content.length }, 'root', { allowDuplicate: true }
        );
        const key = `bim-3d-viewer-handoff:visual-${Date.now()}`;
        const payload = {
            version: 1,
            mode: 'element',
            source: 'visual-test',
            element: { fileName: 'visual-wall.ifc', fileId, guid: targetGuids[0] },
            files: [{ fileName: 'visual-wall.ifc', fileId }]
        };
        sessionStorage.setItem(key, JSON.stringify(payload));
        localStorage.setItem(key, JSON.stringify(payload));
        return { key, fileId };
    }, { content: fixture, targetGuids: guids });

    await page.goto(`${origin}/pages/3d-viewer.html?handoff=${encodeURIComponent(setup.key)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.__engine?.getSelectedEntities?.().length === 1, { timeout: 60000 });

    async function capture(name) {
        await new Promise(resolveWait => setTimeout(resolveWait, 450));
        const png = await page.screenshot({ path: resolve(outputDir, `${name}.png`) });
        const diagnostics = await page.evaluate(() => {
            const viewer = window.__engine?._viewer;
            const renderer = viewer?._renderer;
            const canvas = renderer?.domElement;
            const rect = canvas?.getBoundingClientRect();
            return {
                projection: window.__engine?.getCameraOrientation?.()?.projection || viewer?.getProjection?.() || null,
                renderCalls: renderer?.info?.render?.calls || 0,
                triangles: renderer?.info?.render?.triangles || 0,
                contextLost: renderer?.getContext?.().isContextLost?.() ?? true,
                canvasWidth: rect?.width || 0,
                canvasHeight: rect?.height || 0,
                selected: window.__engine?.getSelectedEntities?.().length || 0,
                hidden: window.__engine?.getHiddenEntityIds?.().length || 0,
                sectionPlanes: window.__engine?.getSectionPlanes?.().length || 0,
                measurements: window.__engine?.getMeasurements?.().length || 0,
                horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
                theme: document.documentElement.getAttribute('data-theme') || 'light',
            };
        });
        states.push({ name, sha256: createHash('sha256').update(png).digest('hex'), bytes: png.byteLength, ...diagnostics });
        check(diagnostics.renderCalls > 0 && diagnostics.triangles > 0, `${name}: WebGL frame contains no model geometry`);
        check(!diagnostics.contextLost, `${name}: WebGL context is lost`);
        check(diagnostics.canvasWidth > 100 && diagnostics.canvasHeight > 100, `${name}: viewer canvas is not visible`);
    }

    await capture('01-selected-light-perspective');

    await page.evaluate(() => {
        const item = window.__engine.getSelectedEntities()[0];
        window.__engine.isolateEntities([item]);
        window.__engine.focusEntity(item.modelId, item.expressId);
    });
    await capture('02-isolated');
    check(states.at(-1).hidden >= 1, 'Isolation did not hide any IFC element');

    await page.evaluate(() => {
        window.__engine.showAll();
        window.__engine.addSectionPlane([1, 0, 0], [1, 0, 0]);
    });
    await capture('03-section-plane');
    check(states.at(-1).sectionPlanes === 1, 'Section plane state was not registered');

    await page.evaluate(() => {
        window.__engine.clearSectionPlanes();
        const modelId = window.__engine.getModels()[0].modelId;
        window.__engine.addMeasurement({ type: 'distance', points: [[0, 0, 0], [2, 0, 0]], modelId, label: '2.00 m' });
    });
    await capture('04-measurement');
    check(states.at(-1).measurements === 1, 'Measurement state was not registered');

    await page.evaluate(() => window.__engine.setProjection('orthographic'));
    await capture('05-orthographic');
    check(states.at(-1).projection === 'orthographic', 'Orthographic projection was not applied');

    await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    });
    await capture('06-dark');
    check(states.at(-1).theme === 'dark', 'Dark theme was not applied');

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await capture('07-mobile');
    check(!states.at(-1).horizontalOverflow, 'Mobile viewer has horizontal overflow');

    check(new Set(states.map(state => state.sha256)).size >= 5, 'Visual states did not produce distinct screenshots');
    check(browserErrors.length === 0, browserErrors.join('; '));
} finally {
    if (browser) await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}

const report = { passed: failures.length === 0, states, failures, browserErrors };
mkdirSync(outputDir, { recursive: true });
writeFileSync(resolve(outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
if (failures.length) {
    for (const failure of failures) console.error(`FAIL: ${failure}`);
    process.exitCode = 1;
} else {
    console.log(`Viewer visual states OK: ${states.length} screenshots, ${new Set(states.map(state => state.sha256)).size} distinct renders.`);
}
