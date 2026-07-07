#!/usr/bin/env node
// Minimal big-file load test: measures loadIfc on large IFC, catches OOM/crash.
// Usage: node scripts/debug-bigload.js <path-to-ifc>
import puppeteer from 'puppeteer';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const mimeTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.ifc': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const ifcPath = process.argv[2];
if (!ifcPath || !existsSync(ifcPath)) { console.error('usage: debug-bigload.js <ifc>'); process.exit(1); }

const server = createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/__sample.ifc') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(readFileSync(ifcPath));
        return;
    }
    const filePath = join(projectRoot, urlPath === '/' ? 'index.html' : urlPath);
    if (!existsSync(filePath)) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream' });
    res.end(readFileSync(filePath));
});

(async () => {
    await new Promise(r => server.listen(8768, r));
    const browser = await puppeteer.launch({
        headless: 'new', executablePath: '/usr/bin/chromium-browser',
        protocolTimeout: 570000,
        args: ['--no-sandbox', '--disable-gpu', '--js-flags=--max-old-space-size=6144']
    });
    try {
        const page = await browser.newPage();
        page.on('console', m => console.log(`[${m.type()}] ${m.text().slice(0, 300)}`));
        page.on('pageerror', e => console.log(`[pageerror] ${e.message.slice(0, 300)}`));
        page.on('error', e => console.log(`[CRASH] ${e.message}`));
        await page.goto('http://localhost:8768/pages/3d-viewer.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
        const res = await page.evaluate(async () => {
            const t0 = performance.now();
            try {
                const resp = await fetch('/__sample.ifc');
                const buf = await resp.arrayBuffer();
                const tFetch = performance.now();
                const container = document.getElementById('viewerContainer');
                const canvas = document.createElement('canvas');
                canvas.width = 800; canvas.height = 600;
                container.appendChild(canvas);
                const mod = await import('/assets/js/3d/ifc-engine/index.js');
                const eng = new mod.IfcEngine({ canvas });
                const id = await eng.loadIfc(buf, { name: 'big.ifc' });
                const tLoad = performance.now();
                const vm = eng._viewer?._models?.get(id);
                const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
                return {
                    ok: true, fetchMs: Math.round(tFetch - t0), loadMs: Math.round(tLoad - tFetch),
                    meshes: vm?.meshes?.length, heapMB: mem,
                    lengthScale: eng._models.get(id)?.meta?.lengthScale,
                    entityCount: eng._models.get(id)?.meta?.entityCount
                };
            } catch (e) {
                return { ok: false, error: e.message, stack: (e.stack || '').split('\n').slice(0, 5).join(' | ') };
            }
        });
        console.log('RESULT:', JSON.stringify(res));
    } catch (e) {
        console.log('HARNESS ERROR:', e.message);
    } finally {
        await browser.close();
        server.close();
    }
})();
