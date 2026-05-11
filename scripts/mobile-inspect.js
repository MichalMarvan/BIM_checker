#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Inspect computed sizes of key mobile elements to find layout issues. */

import puppeteer from 'puppeteer';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
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

const PORT = 8780;
(async () => {
    const server = await startServer(PORT);
    const browser = await puppeteer.launch({
        headless: 'new', executablePath: '/usr/bin/chromium-browser',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

        // VALIDATOR
        await page.goto(`http://localhost:${PORT}/pages/ids-ifc-validator.html`, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 500));

        const validatorReport = await page.evaluate(() => {
            const out = {};
            const measure = (sel) => {
                const el = document.querySelector(sel);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                const s = getComputedStyle(el);
                return {
                    sel,
                    rect: { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) },
                    styles: {
                        height: s.height, minHeight: s.minHeight, padding: s.padding,
                        fontSize: s.fontSize, display: s.display, flexDirection: s.flexDirection,
                        size: el.size, tag: el.tagName
                    }
                };
            };
            out.presetSelect = measure('#presetSelect');
            out.presetsPanelControls = measure('.presets-panel__controls');
            out.h2Title = measure('h2[data-i18n="validator.groups"]');
            out.addBtn = measure('button[onclick="addValidationGroup()"]');
            out.titleRow = measure('h2[data-i18n="validator.groups"]')?.styles ? (() => {
                const h2 = document.querySelector('h2[data-i18n="validator.groups"]');
                const parent = h2.parentElement;
                const r = parent.getBoundingClientRect();
                return { w: r.width, h: r.height, top: r.top, classes: parent.className, inlineStyle: parent.getAttribute('style') };
            })() : null;
            out.launcher = measure('.chat-launcher');
            return out;
        });
        console.log('=== VALIDATOR phone-375 ===');
        console.log(JSON.stringify(validatorReport, null, 2));

        // HOMEPAGE
        await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 500));
        const homeReport = await page.evaluate(() => {
            const measure = (sel) => {
                const el = document.querySelector(sel);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { sel, rect: { w: Math.round(r.width), h: Math.round(r.height) }, classes: el.className };
            };
            return {
                fileTree0: measure('.file-tree-modern'),
                storageCard0: measure('.storage-card'),
                dropZone0: measure('.drop-zone-modern'),
                cardHeader0: measure('.card-header'),
                cardActions0: measure('.card-actions'),
                btnIcon0: measure('.btn-icon-modern')
            };
        });
        console.log('=== HOMEPAGE phone-375 ===');
        console.log(JSON.stringify(homeReport, null, 2));

        // PARSER
        await page.goto(`http://localhost:${PORT}/pages/ids-parser-visualizer.html`, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 500));
        const parserReport = await page.evaluate(() => {
            const measure = (sel) => {
                const el = document.querySelector(sel);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { sel, rect: { w: Math.round(r.width), h: Math.round(r.height) } };
            };
            return {
                body: measure('body'),
                main: measure('main') || measure('.page-container'),
                footer: measure('footer') || measure('.footer-modern')
            };
        });
        console.log('=== PARSER phone-375 ===');
        console.log(JSON.stringify(parserReport, null, 2));
    } finally {
        await browser.close();
        server.close();
    }
})();
