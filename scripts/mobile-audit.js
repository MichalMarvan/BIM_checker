#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Detailed mobile audit — viewport-sized snapshots + scrolled views + interactive states. */

import puppeteer from 'puppeteer';
import { createServer } from 'http';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const mimeTypes = {
    '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
    '.css': 'text/css', '.json': 'application/json', '.ifc': 'text/plain',
    '.ids': 'application/xml', '.xml': 'application/xml', '.xsd': 'application/xml',
    '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
};

function startServer(port) {
    return new Promise((resolve) => {
        const s = createServer((req, res) => {
            let filePath = join(projectRoot, req.url === '/' ? 'index.html' : req.url);
            filePath = filePath.split('?')[0];
            if (!existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
            const ext = extname(filePath);
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
            res.end(readFileSync(filePath));
        });
        s.listen(port, () => resolve(s));
    });
}

const PAGES = [
    { name: 'homepage', path: '/index.html' },
    { name: 'validator', path: '/pages/ids-ifc-validator.html' },
    { name: 'parser', path: '/pages/ids-parser-visualizer.html' },
    { name: 'viewer', path: '/pages/ifc-viewer-multi-file.html' }
];

const VIEWPORTS = [
    { name: 'phone-375', width: 375, height: 812 },
    { name: 'tablet-768', width: 768, height: 1024 }
];

const PORT = 8779;

async function snap(page, outPath, fullPage = false) {
    await page.screenshot({ path: outPath, fullPage });
}

async function capture(browser, vp, pageDef) {
    const dir = join(projectRoot, 'tmp', 'mobile-audit', vp.name);
    mkdirSync(dir, { recursive: true });

    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

    const url = `http://localhost:${PORT}${pageDef.path}`;
    console.log(`[${vp.name}] ${pageDef.name}`);
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
    } catch (e) {
        console.warn('  goto warn:', e.message);
    }
    await new Promise(r => setTimeout(r, 700));

    // 1) Viewport at top (most important — what user sees first)
    await snap(page, join(dir, `${pageDef.name}-1-top.png`), false);

    // 2) Bottom of page — see footer + tab bar + final content
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 300));
    await snap(page, join(dir, `${pageDef.name}-2-bottom.png`), false);

    // 3) Full page stitched (for overview)
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 200));
    await snap(page, join(dir, `${pageDef.name}-3-full.png`), true);

    await page.close();
}

(async () => {
    const server = await startServer(PORT);
    const browser = await puppeteer.launch({
        headless: 'new', executablePath: '/usr/bin/chromium-browser',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
    try {
        for (const vp of VIEWPORTS) {
            for (const pg of PAGES) await capture(browser, vp, pg);
        }
    } finally {
        await browser.close();
        server.close();
        console.log('Done. Output in tmp/mobile-audit/');
    }
})();
