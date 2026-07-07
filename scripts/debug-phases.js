#!/usr/bin/env node
// Phase-level timing on big IFC: fetch → decode → parse → index → styles → geometry.
// Logs progress so a timeout still reveals the stuck phase.
// Usage: node scripts/debug-phases.js <path-to-ifc>
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
if (!ifcPath || !existsSync(ifcPath)) { console.error('usage: debug-phases.js <ifc>'); process.exit(1); }

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
    await new Promise(r => server.listen(8769, r));
    const browser = await puppeteer.launch({
        headless: 'new', executablePath: '/usr/bin/chromium-browser',
        protocolTimeout: 3000000,
        args: ['--no-sandbox', '--disable-gpu', '--js-flags=--max-old-space-size=6144']
    });
    try {
        const page = await browser.newPage();
        page.on('console', m => console.log(`${new Date().toISOString().slice(11, 19)} [${m.type()}] ${m.text().slice(0, 250)}`));
        page.on('pageerror', e => console.log(`[pageerror] ${e.message.slice(0, 250)}`));
        await page.goto('http://localhost:8769/pages/3d-viewer.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
        const res = await page.evaluate(async () => {
            const T = () => Math.round(performance.now());
            const mem = () => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + 'MB' : '?';
            try {
                let t = T();
                const resp = await fetch('/__sample.ifc');
                const text = await resp.text();
                console.log(`fetch+text done ${T() - t}ms len=${text.length} heap=${mem()}`);

                t = T();
                const { parseStepText, splitParams } = await import('/assets/js/3d/ifc-engine/parser/step-parser.js');
                const { EntityIndex } = await import('/assets/js/3d/ifc-engine/parser/entity-index.js');
                const { parseRef, parseRefList } = await import('/assets/js/3d/ifc-engine/geometry/step-helpers.js');
                const { entities, schema } = parseStepText(text);
                console.log(`parse done ${T() - t}ms entities=${entities.size} heap=${mem()}`);

                t = T();
                const index = new EntityIndex(entities);
                console.log(`index done ${T() - t}ms heap=${mem()}`);

                t = T();
                const styledMod = await import('/assets/js/3d/ifc-engine/geometry/styled-items.js');
                index._styleIndex = styledMod.buildStyleIndex(index);
                console.log(`styleIndex done ${T() - t}ms size=${index._styleIndex?.size} heap=${mem()}`);

                t = T();
                const geo = await import('/assets/js/3d/ifc-engine/geometry/geometry-core.js');
                let products = 0, meshed = 0, items = 0;
                for (const ty of index.types()) {
                    for (const e of index.byType(ty)) {
                        const parts = splitParams(e.params);
                        const repRef = parseRef(parts[6]);
                        if (!repRef) continue;
                        const shape = index.byExpressId(repRef);
                        if (!shape || shape.type !== 'IFCPRODUCTDEFINITIONSHAPE') continue;
                        products++;
                        let r = null;
                        try { r = geo.buildEntityGeometry(index, e.expressId); } catch (err) { /* count as empty */ }
                        if (r && r.items && r.items.length) { meshed++; items += r.items.length; }
                        if (products % 5000 === 0) console.log(`geometry progress ${products} products ${T() - t}ms heap=${mem()}`);
                    }
                }
                console.log(`geometry done ${T() - t}ms products=${products} meshed=${meshed} items=${items} heap=${mem()}`);
                return { ok: true, schema, entities: entities.size, products, meshed, items };
            } catch (e) {
                return { ok: false, error: e.message, stack: (e.stack || '').split('\n').slice(0, 6).join(' | ') };
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
