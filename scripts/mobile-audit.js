#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * Mobile screenshot audit — captures every page at phone + tablet viewports.
 * Run: node scripts/mobile-audit.js
 * Output: tmp/mobile-audit/<viewport>/<page>.png
 */

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
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.ifc': 'text/plain',
    '.ids': 'application/xml',
    '.xml': 'application/xml',
    '.xsd': 'application/xml',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
};

function startServer(port) {
    return new Promise((resolve) => {
        const server = createServer((req, res) => {
            let filePath = join(projectRoot, req.url === '/' ? 'index.html' : req.url);
            filePath = filePath.split('?')[0];
            if (!existsSync(filePath)) {
                res.writeHead(404); res.end('Not found'); return;
            }
            const ext = extname(filePath);
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            try {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(readFileSync(filePath));
            } catch (err) {
                res.writeHead(500); res.end(err.message);
            }
        });
        server.listen(port, () => resolve(server));
    });
}

const VIEWPORTS = [
    { name: 'phone-375', width: 375, height: 667, deviceScaleFactor: 2 },
    { name: 'tablet-768', width: 768, height: 1024, deviceScaleFactor: 2 }
];

const PAGES = [
    { name: 'homepage', path: '/index.html' },
    { name: 'validator', path: '/pages/ids-ifc-validator.html' },
    { name: 'parser', path: '/pages/ids-parser-visualizer.html' },
    { name: 'viewer', path: '/pages/ifc-viewer-multi-file.html' }
];

const PORT = 8779;

async function snap(page, outPath) {
    await page.screenshot({ path: outPath, fullPage: true });
    console.log('  saved', outPath);
}

async function captureStates(browser, vp, pageDef) {
    const dir = join(projectRoot, 'tmp', 'mobile-audit', vp.name);
    mkdirSync(dir, { recursive: true });

    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.deviceScaleFactor, isMobile: true, hasTouch: true });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

    const url = `http://localhost:${PORT}${pageDef.path}`;
    console.log(`[${vp.name}] ${pageDef.name} → ${url}`);
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
    } catch (e) {
        console.warn('  goto warning:', e.message);
    }

    // Wait for any deferred JS to settle
    await new Promise(r => setTimeout(r, 700));

    // 1) baseline (top)
    await snap(page, join(dir, `${pageDef.name}.png`));

    // 2) open the chat launcher popover (every page has it)
    const launcherClicked = await page.evaluate(() => {
        const btn = document.querySelector('.chat-launcher');
        if (btn) { btn.click(); return true; }
        return false;
    });
    if (launcherClicked) {
        await new Promise(r => setTimeout(r, 400));
        await snap(page, join(dir, `${pageDef.name}-launcher-open.png`));
        // dismiss
        await page.evaluate(() => {
            const popover = document.querySelector('.chat-launcher-popover');
            if (popover) popover.classList.remove('is-open');
        });
    }

    // 3) force chat panel open (and seed dummy content so it renders something)
    const chatOpened = await page.evaluate(() => {
        const panel = document.querySelector('.chat-panel');
        if (!panel) return false;
        panel.classList.add('is-open');
        // Force visibility regardless of internal state
        panel.style.display = 'flex';
        return true;
    });
    if (chatOpened) {
        await new Promise(r => setTimeout(r, 400));
        await snap(page, join(dir, `${pageDef.name}-chat-open.png`));
        await page.evaluate(() => {
            const panel = document.querySelector('.chat-panel');
            if (panel) { panel.classList.remove('is-open'); panel.style.display = ''; }
        });
    }

    // 4) open a modal — different per page; try AI settings (works on all 4)
    const modalOpened = await page.evaluate(() => {
        document.dispatchEvent(new CustomEvent('ai:openSettings'));
        return true;
    });
    await new Promise(r => setTimeout(r, 600));
    const hasModalOpen = await page.evaluate(() => {
        return !!document.querySelector('.modal-overlay.show, .modal-overlay.active');
    });
    if (hasModalOpen) {
        await snap(page, join(dir, `${pageDef.name}-modal-settings.png`));
    }

    await page.close();
}

(async () => {
    console.log('Starting server on', PORT);
    const server = await startServer(PORT);

    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: '/usr/bin/chromium-browser',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    try {
        for (const vp of VIEWPORTS) {
            for (const pg of PAGES) {
                await captureStates(browser, vp, pg);
            }
        }
    } finally {
        await browser.close();
        server.close();
        console.log('Done. Output in tmp/mobile-audit/');
    }
})();
