#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */

import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(root, 'test-results');
const fixture = readFileSync(resolve(root, 'tests/fixtures/handoff-wall.ifc'), 'utf8');
const guid = '2O2Fr$t4X7Zf8NOew3FLKr';
const routes = ['/', '/pages/ids-parser-visualizer.html', '/pages/ids-ifc-validator.html', '/pages/ifc-viewer-multi-file.html'];
const mime = {
    '.css': 'text/css', '.dtd': 'application/xml', '.html': 'text/html', '.ico': 'image/x-icon',
    '.js': 'application/javascript', '.json': 'application/json', '.mjs': 'application/javascript',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.xml': 'application/xml',
    '.xsd': 'application/xml'
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
const scans = [];
let browser;

function check(condition, message) {
    if (!condition) failures.push(message);
}

try {
    browser = await puppeteer.launch({
        headless: true,
        executablePath: existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage();
    const localFailures = [];
    page.on('pageerror', error => localFailures.push(`pageerror: ${error.message}`));
    page.on('requestfailed', request => {
        if (request.url().startsWith(origin)) {
            localFailures.push(`requestfailed: ${request.url()} (${request.failure()?.errorText || 'unknown'})`);
        }
    });

    await page.goto(`${origin}/`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), { timeout: 60000 });
    const onlineSetup = await page.evaluate(async ({ content, targetGuid }) => {
        await window.BIMStorage.init();
        const fileId = await window.BIMStorage.saveFile(
            'ifc',
            { name: 'offline-wall.ifc', content, size: content.length },
            'root',
            { allowDuplicate: true }
        );
        const key = 'bim-3d-viewer-handoff:offline-test';
        sessionStorage.setItem(key, JSON.stringify({
            version: 1,
            mode: 'element',
            source: 'offline-test',
            element: { fileName: 'offline-wall.ifc', fileId, guid: targetGuid },
            files: [{ fileName: 'offline-wall.ifc', fileId }]
        }));
        const cacheNames = await caches.keys();
        const entries = await Promise.all(cacheNames.map(async name => ({ name, count: (await caches.open(name).then(cache => cache.keys())).length })));
        return { fileId, key, entries };
    }, { content: fixture, targetGuid: guid });
    check(onlineSetup.entries.some(entry => entry.name.startsWith('bim-checker-core-') && entry.count > 100), 'Core precache was not populated');

    await page.setOfflineMode(true);
    for (const route of routes) {
        const response = await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const state = await page.evaluate(() => ({
            title: document.title.trim(),
            body: document.body?.innerText?.trim() || '',
            controlled: Boolean(navigator.serviceWorker.controller)
        }));
        check(response?.ok(), `Offline navigation failed for ${route} (${response?.status()})`);
        check(state.title && state.body, `Offline page shell is empty for ${route}`);
        check(state.controlled, `Service worker does not control ${route}`);
        scans.push({ route, status: response?.status(), controlled: state.controlled });
        console.log(`PASS offline ${route}`);
    }

    const viewerRoute = `/pages/3d-viewer.html?handoff=${encodeURIComponent(onlineSetup.key)}`;
    const started = Date.now();
    const viewerResponse = await page.goto(`${origin}${viewerRoute}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(targetGuid => {
        const selected = window.__engine?.getSelectedEntities?.() || [];
        const models = window.__engine?.getModels?.() || [];
        if (models.length !== 1 || selected.length !== 1) return false;
        return window.__engine.resolveGuids(models[0].modelId, [targetGuid]).get(targetGuid) === selected[0].expressId;
    }, { timeout: 60000 }, guid);
    const viewerState = await page.evaluate(() => ({
        controlled: Boolean(navigator.serviceWorker.controller),
        models: window.__engine.getModels().length,
        selected: window.__engine.getSelectedEntities().length
    }));
    check(viewerResponse?.ok(), `Offline 3D navigation failed (${viewerResponse?.status()})`);
    check(viewerState.controlled && viewerState.models === 1 && viewerState.selected === 1, 'Offline IFC handoff did not load and select the stored element');
    scans.push({ route: '/pages/3d-viewer.html', status: viewerResponse?.status(), controlled: viewerState.controlled, bootMs: Date.now() - started });
    check(localFailures.length === 0, localFailures.join('; '));
    console.log(`PASS offline /pages/3d-viewer.html (IFC engine + GUID selection, ${Date.now() - started} ms)`);
} finally {
    if (browser) await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(resolve(outputDir, 'offline.json'), JSON.stringify({ passed: failures.length === 0, scans, failures }, null, 2) + '\n');
if (failures.length) {
    for (const failure of failures) console.error(`FAIL: ${failure}`);
    process.exitCode = 1;
} else {
    console.log(`Offline test OK: ${scans.length}/${scans.length} routes, including stored IFC in the 3D engine.`);
}
