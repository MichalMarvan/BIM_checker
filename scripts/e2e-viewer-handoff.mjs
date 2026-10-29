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
const oldRevision = fixture
    .replace('2O2Fr$t4X7Zf8NOew3FLKr', 'OLD-REVISION-WALL-A')
    .replace('0Btm5o6XL0IhurFcbfxOQ7', 'OLD-REVISION-WALL-B');
const fileName = 'same-name-revision.ifc';
const targetGuids = ['2O2Fr$t4X7Zf8NOew3FLKr', '0Btm5o6XL0IhurFcbfxOQ7'];
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
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    response.end(readFileSync(path));
});
await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
});

const origin = `http://127.0.0.1:${server.address().port}`;
const failures = [];
const timings = {};
let browser;

function check(condition, message) {
    if (!condition) failures.push(message);
}

try {
    mkdirSync(outputDir, { recursive: true });
    browser = await puppeteer.launch({
        headless: true,
        executablePath: existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
    });
    const source = await browser.newPage();
    const browserErrors = [];
    source.on('pageerror', error => browserErrors.push(`source pageerror: ${error.message}`));
    await source.goto(`${origin}/pages/ifc-viewer-multi-file.html`, { waitUntil: 'networkidle0' });

    const ids = await source.evaluate(async ({ current, old, name }) => {
        await window.BIMStorage.init();
        const first = await window.BIMStorage.saveFile('ifc', { name, content: old, size: old.length }, 'root', { allowDuplicate: true });
        const second = await window.BIMStorage.saveFile('ifc', { name, content: current, size: current.length }, 'root', { allowDuplicate: true });
        return { first, second };
    }, { current: fixture, old: oldRevision, name: fileName });
    check(ids.first !== ids.second, 'Storage did not preserve two same-name revisions with distinct fileId values');

    await source.evaluate(({ name, fileId, guid }) => {
        const row = { fileName: name, fileId, guid, ifcId: 20, entity: 'IFCWALL', name: 'Wall A', layer: '', propertySets: {} };
        window.ViewerState.allData = [row];
        window.ViewerState.filteredData = [row];
        window.ViewerState.loadedFiles = [{ fileName: name, fileId, color: '#667eea' }];
        window.ViewerState.pageSize = 500;
        window.renderTable();
    }, { name: fileName, fileId: ids.second, guid: targetGuids[0] });

    const popupTarget = browser.waitForTarget(target =>
        target.opener() === source.target() && target.url().includes('/pages/3d-viewer.html'),
    { timeout: 30000 });
    const started = Date.now();
    // The table shell starts visually collapsed until a file is parsed. Move
    // the real button (with its production listener) into the visible page and
    // let Puppeteer perform a trusted click so popup/user-activation behaviour
    // is tested as it is in the browser.
    await source.$eval('.view3d-btn', button => {
        button.style.cssText = 'position:fixed;left:20px;top:20px;width:44px;height:44px;z-index:99999';
        document.body.appendChild(button);
    });
    await source.click('.view3d-btn');
    const target = await popupTarget;
    const viewer = await target.page();
    const viewerMessages = [];
    viewer.on('pageerror', error => browserErrors.push(`viewer pageerror: ${error.message}`));
    viewer.on('console', message => {
        viewerMessages.push(`${message.type()}: ${message.text()}`);
        if (message.type() === 'error') browserErrors.push(`viewer console.error: ${message.text()}`);
    });
    await viewer.waitForFunction(() => location.pathname.endsWith('/pages/3d-viewer.html'), { timeout: 10000 });
    try {
        await viewer.waitForFunction(() => window.__engine?.getSelectedEntities?.().length === 1, { timeout: 30000 });
    } catch (error) {
        const state = await viewer.evaluate(() => ({
            href: location.href,
            handoffKeys: Object.keys(sessionStorage).filter(key => key.startsWith('bim-3d-viewer-handoff:')),
            localHandoffKeys: Object.keys(localStorage).filter(key => key.startsWith('bim-3d-viewer-handoff:')),
            status: document.getElementById('viewer3dStatus')?.textContent || '',
            models: window.__engine?.getModels?.() || [],
            selected: window.__engine?.getSelectedEntities?.() || [],
        })).catch(() => null);
        console.error('Viewer failed to finish the boot handoff:', state, browserErrors, viewerMessages);
        throw error;
    }
    timings.bootHandoffMs = Date.now() - started;

    const single = await viewer.evaluate(guid => {
        const models = window.__engine.getModels();
        const selected = window.__engine.getSelectedEntities();
        const resolved = models.length ? window.__engine.resolveGuids(models[0].modelId, [guid]).get(guid) : null;
        const geometry = models.length ? window.__engine.getStats(models[0].modelId)?.geometry : null;
        return { modelCount: models.length, selected, resolved, geometry, status: document.getElementById('viewer3dStatus')?.textContent || '' };
    }, targetGuids[0]);
    check(single.modelCount === 1, `Boot handoff loaded ${single.modelCount} models instead of the exact fileId revision`);
    check(single.selected[0]?.expressId === single.resolved, 'Single-row handoff did not select the target GUID');
    check(single.geometry?.productCount >= 2, 'Geometry diagnostics did not count IFC products');
    check(single.geometry?.renderedElementCount >= 2, 'Geometry diagnostics did not count rendered elements');
    check(Array.isArray(single.geometry?.unsupportedRepresentationTypes), 'Geometry diagnostics did not expose unsupported representation types');

    // A real user returns to the table before sending another selection. Keep
    // that foreground behaviour explicit; Chromium throttles callbacks in a
    // fully backgrounded test page much more aggressively than normal tabs.
    await source.bringToFront();
    await source.evaluate(({ name, fileId, guids }) => {
        const rows = guids.map((guid, index) => ({
            fileName: name, fileId, guid, ifcId: index ? 30 : 20,
            entity: 'IFCWALL', name: `Wall ${index + 1}`, layer: '', propertySets: {}
        }));
        window.ViewerState.allData = rows;
        window.ViewerState.filteredData = rows;
        window.ViewerState.selectedEntities = new Set(rows.map(row => window.viewerEntityKey(row)));
        window.updateView3dSelectionButton();
        document.getElementById('view3dSelectionBtn').click();
    }, { name: fileName, fileId: ids.second, guids: targetGuids });
    await viewer.waitForFunction(() => window.__engine?.getSelectedEntities?.().length === 2, { timeout: 15000 });
    await source.waitForFunction(() => Boolean(document.getElementById('view3dStatus')?.textContent), { timeout: 5000 });
    const liveText = await source.$eval('#view3dStatus', element => element.textContent);
    check(Boolean(liveText), 'Live BroadcastChannel handoff did not return feedback to the IFC table');

    const validationResult = await source.evaluate(async ({ name, fileId, guids }) => {
        const payload = window.ViewerLink.buildValidationPayload({
            source: 'validator',
            title: 'E2E validation',
            files: [{ fileName: name, fileId }],
            items: [
                { fileName: name, fileId, guid: guids[0], status: 'pass' },
                { fileName: name, fileId, guid: guids[1], status: 'fail' }
            ]
        });
        return window.ViewerLink.send(payload);
    }, { name: fileName, fileId: ids.second, guids: targetGuids });
    check(validationResult === 'live', `Validator handoff used '${validationResult}' instead of the live viewer`);
    await viewer.waitForFunction(() => document.querySelector('.v3d-validation-chip')?.textContent.includes('1 ✓ · 1 ✗'), { timeout: 10000 });

    await source.evaluate(async () => {
        const payload = window.ViewerLink.buildElementPayload({
            source: 'ifc-viewer', fileName: 'missing.ifc', fileId: 'missing-file-id', guid: 'missing-guid'
        });
        await window.ViewerLink.send(payload);
    });
    await viewer.waitForFunction(() => document.getElementById('viewer3dStatus')?.textContent.includes('Storage'), { timeout: 10000 });
    const missingState = await viewer.evaluate(() => ({
        status: document.getElementById('viewer3dStatus')?.textContent || '',
        drawerOpen: !document.getElementById('v3dDrawer')?.hidden,
        storageRailActive: document.querySelector('[data-rail="storage"]')?.classList.contains('active') || false
    }));
    check(missingState.drawerOpen && missingState.storageRailActive, 'Missing-file handoff did not open the manual Storage recovery path');

    await viewer.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    const mobile = await viewer.evaluate(() => {
        const load = document.querySelector('.v3d-st-load');
        const drawer = document.getElementById('v3dDrawer');
        const rect = load?.getBoundingClientRect();
        return {
            horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
            drawerWidth: drawer?.getBoundingClientRect().width || 0,
            loadReachable: Boolean(load && rect && rect.width > 0 && rect.height >= 32)
        };
    });
    check(!mobile.horizontalOverflow, '3D viewer has horizontal overflow at 390px viewport');
    check(mobile.drawerWidth <= 390, `3D Storage drawer is wider than the mobile viewport (${mobile.drawerWidth}px)`);
    check(mobile.loadReachable, 'Mobile Storage recovery does not expose a reachable load control');

    await viewer.screenshot({ path: resolve(outputDir, 'viewer-handoff-mobile.png'), fullPage: true });
    await viewer.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await viewer.screenshot({ path: resolve(outputDir, 'viewer-handoff-desktop.png'), fullPage: true });
    const metrics = await viewer.metrics();
    timings.jsHeapUsedBytes = metrics.JSHeapUsedSize;
    check(timings.bootHandoffMs < 30000, `Fixture handoff exceeded 30s (${timings.bootHandoffMs}ms)`);
    check(metrics.JSHeapUsedSize < 512 * 1024 * 1024, `Fixture used more than 512 MiB JS heap (${metrics.JSHeapUsedSize})`);
    check(browserErrors.length === 0, browserErrors.join('; '));
} finally {
    if (browser) await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}

const report = { passed: failures.length === 0, timings, failures };
writeFileSync(resolve(outputDir, 'viewer-handoff.json'), JSON.stringify(report, null, 2) + '\n');
if (failures.length) {
    for (const failure of failures) console.error(`FAIL: ${failure}`);
    process.exitCode = 1;
} else {
    console.log(`Viewer handoff E2E OK: boot ${timings.bootHandoffMs} ms, heap ${(timings.jsHeapUsedBytes / 1048576).toFixed(1)} MiB.`);
}
