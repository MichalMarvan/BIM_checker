#!/usr/bin/env node
// Coverage analyzer: which IFC geometry the engine can/cannot mesh, per model.
// Parses in-page (import map resolves 'three'), walks representations BEFORE
// any compaction, tallies unsupported leaf types + failed profiles + units.
// Usage: node scripts/analyze-ifc-coverage.js <model1.ifc> [model2.ifc ...]

import puppeteer from 'puppeteer';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const mimeTypes = {
    '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
    '.css': 'text/css', '.json': 'application/json', '.ifc': 'text/plain',
    '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
};

let currentIfc = null;
function startServer(port) {
    return new Promise((resolve) => {
        const server = createServer((req, res) => {
            const urlPath = decodeURIComponent(req.url.split('?')[0]);
            if (urlPath === '/__sample.ifc') {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(readFileSync(currentIfc));
                return;
            }
            const filePath = join(projectRoot, urlPath === '/' ? 'index.html' : urlPath);
            if (!existsSync(filePath)) { res.writeHead(404); res.end('404'); return; }
            res.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream' });
            res.end(readFileSync(filePath));
        });
        server.listen(port, () => resolve(server));
    });
}

async function analyzeInPage(page) {
    return page.evaluate(async () => {
        const { parseStepText, splitParams } = await import('/assets/js/3d/ifc-engine/parser/step-parser.js');
        const { EntityIndex } = await import('/assets/js/3d/ifc-engine/parser/entity-index.js');
        const { parseRef, parseRefList } = await import('/assets/js/3d/ifc-engine/geometry/step-helpers.js');
        const geo = await import('/assets/js/3d/ifc-engine/geometry/geometry-core.js');

        const text = await fetch('/__sample.ifc').then(r => r.text());
        const { entities, schema } = parseStepText(text);
        const index = new EntityIndex(entities);

        // --- units: report EVERY length unit inside IfcUnitAssignment ---
        const units = [];
        for (const ua of (index.byType('IFCUNITASSIGNMENT') || [])) {
            for (const uref of parseRefList(splitParams(ua.params)[0])) {
                const u = index.byExpressId(uref);
                if (!u) continue;
                const p = splitParams(u.params);
                if (u.type === 'IFCSIUNIT' && (p[1] || '').trim() === '.LENGTHUNIT.') {
                    units.push({ kind: 'SI', prefix: (p[2] || '').trim(), name: (p[3] || '').trim() });
                } else if (u.type === 'IFCCONVERSIONBASEDUNIT') {
                    const dimRef = parseRef(p[0]);
                    // Unit type at p[1], name p[2], ConversionFactor p[3] → IFCMEASUREWITHUNIT(Value, Unit)
                    if ((p[1] || '').trim() === '.LENGTHUNIT.') {
                        let factor = null;
                        const mwuRef = parseRef(p[3]);
                        const mwu = mwuRef ? index.byExpressId(mwuRef) : null;
                        if (mwu) {
                            const mp = splitParams(mwu.params);
                            const m = mp[0].match(/\(([-0-9.Ee+]+)\)/) || mp[0].match(/([-0-9.Ee+]+)/);
                            if (m) factor = parseFloat(m[1]);
                        }
                        units.push({ kind: 'CONV', name: (p[2] || '').trim(), factor });
                    }
                }
            }
        }

        // --- walk products ---
        const SUPPORTED = new Set(['IFCTRIANGULATEDFACESET', 'IFCFACETEDBREP', 'IFCSHELLBASEDSURFACEMODEL',
            'IFCPOLYGONALFACESET', 'IFCEXTRUDEDAREASOLID', 'IFCREVOLVEDAREASOLID', 'IFCSWEPTDISKSOLID']);
        const unsupportedLeaf = {};   // leafType -> count
        const skippedReps = {};       // "repId/repType" -> count (filtered by geometry-core)
        const failedSupported = {};   // leafType(+profile) -> count (supported type but 0 items produced)
        const byProduct = {};         // productType -> {products, withRep, meshed, empty}
        let boolSecondOps = 0;

        const leafTally = (index2, itemRefs, out, depth = 0) => {
            if (depth > 8) return;
            for (const ref of itemRefs) {
                const it = index2.byExpressId(ref);
                if (!it) continue;
                if (it.type === 'IFCMAPPEDITEM') {
                    const p = splitParams(it.params);
                    const srcRef = parseRef(p[0]);
                    const src = srcRef ? index2.byExpressId(srcRef) : null;
                    if (src) {
                        const sp = splitParams(src.params);
                        const repRef = parseRef(sp[1]);
                        const rep = repRef ? index2.byExpressId(repRef) : null;
                        if (rep) leafTally(index2, parseRefList(splitParams(rep.params)[3]), out, depth + 1);
                    }
                    continue;
                }
                if (it.type === 'IFCBOOLEANRESULT' || it.type === 'IFCBOOLEANCLIPPINGRESULT') {
                    const p = splitParams(it.params);
                    const first = parseRef(p[1]);
                    if (parseRef(p[2])) boolSecondOps++;
                    if (first) leafTally(index2, [first], out, depth + 1);
                    continue;
                }
                out.push(it);
            }
        };

        for (const t of index.types()) {
            for (const e of index.byType(t)) {
                const parts = splitParams(e.params);
                const repRef = parseRef(parts[6]);
                if (!repRef) continue;
                const shape = index.byExpressId(repRef);
                if (!shape || shape.type !== 'IFCPRODUCTDEFINITIONSHAPE') continue;
                byProduct[t] = byProduct[t] || { products: 0, meshed: 0, empty: 0 };
                byProduct[t].products++;

                // tally leaves + skipped reps
                const leaves = [];
                for (const srRef of parseRefList(splitParams(shape.params)[2])) {
                    const sr = index.byExpressId(srRef);
                    if (!sr || sr.type !== 'IFCSHAPEREPRESENTATION') continue;
                    const sp = splitParams(sr.params);
                    const repId = (sp[1] || '').trim(), repType = (sp[2] || '').trim();
                    if (/'Axis'|'FootPrint'|'Box'|'Annotation'|'Profile'/.test(repId) ||
                        /'BoundingBox'|'Curve2D'/.test(repType)) {
                        const k = repId + '/' + repType;
                        skippedReps[k] = (skippedReps[k] || 0) + 1;
                        continue;
                    }
                    leafTally(index, parseRefList(sp[3]), leaves);
                }

                let res = null;
                try { res = geo.buildEntityGeometry(index, e.expressId); } catch (err) { res = { items: [], err: err.message }; }
                const produced = res && res.items ? res.items.length : 0;
                if (produced > 0) byProduct[t].meshed++; else byProduct[t].empty++;

                for (const leaf of leaves) {
                    if (!SUPPORTED.has(leaf.type)) {
                        unsupportedLeaf[leaf.type] = (unsupportedLeaf[leaf.type] || 0) + 1;
                    }
                }
                // attribute failures: supported leaves but nothing produced
                if (produced === 0 && leaves.length > 0) {
                    for (const leaf of leaves) {
                        if (!SUPPORTED.has(leaf.type)) continue;
                        let key = leaf.type;
                        if (leaf.type === 'IFCEXTRUDEDAREASOLID' || leaf.type === 'IFCREVOLVEDAREASOLID') {
                            const pr = parseRef(splitParams(leaf.params)[0]);
                            const prof = pr ? index.byExpressId(pr) : null;
                            if (prof) {
                                key += ':' + prof.type;
                                if (prof.type === 'IFCARBITRARYCLOSEDPROFILEDEF' || prof.type === 'IFCARBITRARYPROFILEDEFWITHVOIDS') {
                                    const cr = parseRef(splitParams(prof.params)[2]);
                                    const curve = cr ? index.byExpressId(cr) : null;
                                    if (curve) key += ':' + curve.type;
                                }
                            }
                        }
                        failedSupported[key] = (failedSupported[key] || 0) + 1;
                    }
                }
            }
        }

        // prune byProduct to interesting rows (some empty)
        const productSummary = {};
        let totProducts = 0, totMeshed = 0, totEmpty = 0;
        for (const [t, v] of Object.entries(byProduct)) {
            totProducts += v.products; totMeshed += v.meshed; totEmpty += v.empty;
            if (v.empty > 0) productSummary[t] = v;
        }
        return {
            schema, units,
            totals: { products: totProducts, meshed: totMeshed, empty: totEmpty },
            emptyByProductType: productSummary,
            unsupportedLeaf, failedSupported, skippedReps, boolSecondOps
        };
    });
}

(async () => {
    const files = process.argv.slice(2).filter(existsSync);
    if (!files.length) { console.error('usage: analyze-ifc-coverage.js <ifc...>'); process.exit(1); }
    const port = 8767;
    const server = await startServer(port);
    const browser = await puppeteer.launch({ headless: 'new', executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox', '--disable-gpu'] });
    try {
        const page = await browser.newPage();
        page.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`));
        await page.goto(`http://localhost:${port}/pages/3d-viewer.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        for (const f of files) {
            currentIfc = f;
            try {
                const r = await analyzeInPage(page);
                console.log(`\n===== ${f}`);
                console.log(JSON.stringify(r, null, 1));
            } catch (e) {
                console.log(`\n===== ${f}\nANALYZE FAILED: ${e.message}`);
            }
        }
    } finally {
        await browser.close();
        server.close();
    }
})();
