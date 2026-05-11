#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Deep inspection: find any overflow, anything wider than viewport, weird gaps. */

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

const PAGES = [
    { name: 'homepage', path: '/index.html' },
    { name: 'validator', path: '/pages/ids-ifc-validator.html' },
    { name: 'parser', path: '/pages/ids-parser-visualizer.html' },
    { name: 'viewer', path: '/pages/ifc-viewer-multi-file.html' }
];

const PORT = 8780;
(async () => {
    const server = await startServer(PORT);
    const browser = await puppeteer.launch({
        headless: 'new', executablePath: '/usr/bin/chromium-browser',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
    try {
        for (const pg of PAGES) {
            const page = await browser.newPage();
            await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
            await page.goto(`http://localhost:${PORT}${pg.path}`, { waitUntil: 'networkidle2' });
            await new Promise(r => setTimeout(r, 500));

            const report = await page.evaluate(() => {
                const VW = window.innerWidth;
                // Find every element whose right edge exceeds viewport
                const all = document.querySelectorAll('body *');
                const overflowers = [];
                for (const el of all) {
                    if (!el.offsetParent && el.tagName !== 'BODY') continue;
                    const r = el.getBoundingClientRect();
                    if (r.width === 0 || r.height === 0) continue;
                    if (r.right > VW + 1) {
                        const id = el.id ? `#${el.id}` : '';
                        const cls = el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).slice(0, 3).join('.') : '';
                        overflowers.push({
                            tag: el.tagName,
                            id, cls,
                            rect: { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) },
                            overflowBy: Math.round(r.right - VW)
                        });
                    }
                }
                // Top 10 widest elements that exceed
                overflowers.sort((a, b) => b.overflowBy - a.overflowBy);

                // Get key wrapper widths
                const measure = (sel) => {
                    const el = document.querySelector(sel);
                    if (!el) return null;
                    const r = el.getBoundingClientRect();
                    const s = getComputedStyle(el);
                    return { w: Math.round(r.width), pad: s.padding, margin: s.margin, left: Math.round(r.left), right: Math.round(r.right) };
                };

                return {
                    viewport: VW,
                    docScrollWidth: document.documentElement.scrollWidth,
                    bodyScrollWidth: document.body.scrollWidth,
                    overflowers: overflowers.slice(0, 15),
                    wrappers: {
                        body: measure('body'),
                        page: measure('.page-container'),
                        hero: measure('.hero'),
                        heroContainer: measure('.hero-container'),
                        mainContainer: measure('.main-container'),
                        storageSection: measure('#uloziste, .storage-section'),
                        storageGrid: measure('.storage-grid'),
                        storageCard: measure('.storage-card'),
                        uploadSection: measure('.upload-section'),
                        validatorHeader: measure('.validator-page-header'),
                        controls: measure('.controls'),
                        tableContainer: measure('.table-container'),
                        footer: measure('footer.footer-modern, footer')
                    }
                };
            });

            console.log(`\n=== ${pg.name} (viewport ${report.viewport}px) ===`);
            console.log(`docScrollWidth: ${report.docScrollWidth}  bodyScrollWidth: ${report.bodyScrollWidth}`);
            if (report.docScrollWidth > report.viewport) {
                console.log(`⚠️  HORIZONTAL OVERFLOW: ${report.docScrollWidth - report.viewport}px past viewport`);
            }
            console.log('\nWrappers:');
            for (const [k, v] of Object.entries(report.wrappers)) {
                if (v) console.log(`  ${k.padEnd(20)} w=${v.w}  left=${v.left}  right=${v.right}  pad=${v.pad}  m=${v.margin}`);
            }
            console.log('\nElements wider than viewport (top 10):');
            if (report.overflowers.length === 0) {
                console.log('  (none) ✓');
            } else {
                for (const o of report.overflowers.slice(0, 10)) {
                    console.log(`  +${o.overflowBy}px  ${o.tag}${o.id}${o.cls}  width=${o.rect.width}`);
                }
            }

            await page.close();
        }
    } finally {
        await browser.close();
        server.close();
    }
})();
