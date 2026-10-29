#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */

import puppeteer from 'puppeteer';
import { AxePuppeteer } from '@axe-core/puppeteer';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const routes = [
    '/',
    '/pages/ids-parser-visualizer.html',
    '/pages/ids-ifc-validator.html',
    '/pages/ifc-viewer-multi-file.html',
    '/pages/3d-viewer.html'
];
const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 }
];
const themes = ['light', 'dark'];
const mime = {
    '.css': 'text/css', '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
    '.mjs': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
    '.xml': 'application/xml', '.xsd': 'application/xml'
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

let browser;
const scans = [];
const blocking = [];
async function scanPage(page, { route, viewport, theme, state = 'base' }) {
    const results = await new AxePuppeteer(page)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
    const violations = results.violations.map(violation => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        helpUrl: violation.helpUrl,
        targets: violation.nodes.map(node => node.target.join(' '))
    }));
    scans.push({ route, viewport, theme, state, violations });
    const currentBlocking = violations.filter(violation => violation.impact === 'critical' || violation.impact === 'serious');
    for (const violation of currentBlocking) blocking.push({ route, viewport, theme, state, ...violation });
    console.log(`${currentBlocking.length ? 'FAIL' : 'PASS'} ${theme} ${viewport} ${route} [${state}] (${violations.length} axe findings)`);
}
try {
    browser = await puppeteer.launch({
        headless: true,
        executablePath: existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
    for (const viewport of viewports) {
        for (const route of routes) {
            for (const theme of themes) {
                const page = await browser.newPage();
                await page.setViewport(viewport);
                await page.evaluateOnNewDocument(selectedTheme => {
                    localStorage.setItem('theme', selectedTheme);
                }, theme);
                await page.goto(`http://127.0.0.1:${server.address().port}${route}`, { waitUntil: 'networkidle0', timeout: 30000 });
                await page.evaluate(selectedTheme => document.documentElement.setAttribute('data-theme', selectedTheme), theme);
                await scanPage(page, { route, viewport: viewport.name, theme });

                // On desktop also scan every modal independently in its
                // visible/focusable state. Hidden dialogs are intentionally
                // ignored by Axe and otherwise leave a large blind spot.
                if (viewport.name === 'desktop') {
                    const modalIds = await page.$$eval('.modal-overlay', nodes => nodes.map((node, index) => {
                        if (!node.id) node.id = `a11y-modal-${index}`;
                        return node.id;
                    }));
                    for (const modalId of modalIds) {
                        await page.evaluate(id => {
                            document.querySelectorAll('.modal-overlay').forEach(node => { node.style.display = 'none'; });
                            const modal = document.getElementById(id);
                            if (modal) modal.style.display = 'flex';
                        }, modalId);
                        await scanPage(page, { route, viewport: viewport.name, theme, state: `modal:${modalId}` });
                    }
                }
                await page.close();
            }
        }
    }
} finally {
    if (browser) await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}

const outputDir = resolve(root, 'test-results');
mkdirSync(outputDir, { recursive: true });
writeFileSync(resolve(outputDir, 'accessibility.json'), JSON.stringify({ blocking: blocking.length, scans }, null, 2) + '\n');
if (blocking.length) {
    for (const violation of blocking) {
        console.error(`${violation.theme} ${violation.viewport} ${violation.route} [${violation.state}]: ${violation.id} (${violation.impact}) — ${violation.targets.join(', ')}`);
    }
    process.exitCode = 1;
} else {
    console.log(`Accessibility check OK: ${scans.length} page/viewport scans, no serious or critical violations.`);
}
