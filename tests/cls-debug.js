#!/usr/bin/env node
/**
 * One-shot CLS diagnostic. Loads a page in headless Chromium, captures every
 * `layout-shift` PerformanceObserver entry along with its source elements,
 * and prints a per-element breakdown sorted by impact.
 *
 * Usage: node tests/cls-debug.js [path]   (default: /index.html)
 */

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
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.wasm': 'application/wasm'
};

function startServer(port) {
    return new Promise((resolve) => {
        const server = createServer((req, res) => {
            let filePath = join(projectRoot, req.url === '/' ? 'index.html' : req.url);
            filePath = filePath.split('?')[0];
            if (!existsSync(filePath)) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            const ext = extname(filePath);
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            try {
                const content = readFileSync(filePath);
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            } catch {
                res.writeHead(500);
                res.end('Server error');
            }
        });
        server.listen(port, () => resolve(server));
    });
}

async function diagnose(targetPath) {
    const port = 8766;
    const server = await startServer(port);
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: '/usr/bin/chromium-browser',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 412, height: 823, deviceScaleFactor: 2 });

        // Register the PerformanceObserver BEFORE any page script runs
        await page.evaluateOnNewDocument(() => {
            window.__clsEntries = [];
            window.__mutations = [];
            const describe = (node) => {
                if (!node) return '<no-node>';
                if (node.nodeType !== 1) return `<${node.nodeName}>`;
                let sel = node.tagName.toLowerCase();
                if (node.id) sel += `#${node.id}`;
                if (node.className && typeof node.className === 'string' && node.className.trim()) {
                    sel += '.' + node.className.trim().split(/\s+/).slice(0, 3).join('.');
                }
                return sel;
            };
            const t0 = performance.now();
            window.__heights = [];
            // Track body scrollHeight via RAF
            const sampleHeight = () => {
                if (document.body) {
                    const t = Math.round(performance.now() - t0);
                    const h = document.body.scrollHeight;
                    const last = window.__heights[window.__heights.length - 1];
                    if (!last || last.h !== h) {
                        window.__heights.push({ t, h });
                    }
                }
                requestAnimationFrame(sampleHeight);
            };
            requestAnimationFrame(sampleHeight);

            // MutationObserver covers DOM tree changes + style attr changes
            const startMutationWatch = () => {
                if (window.__moStarted) return;
                window.__moStarted = true;
                const mo = new MutationObserver((records) => {
                    for (const r of records) {
                        const t = Math.round(performance.now() - t0);
                        if (r.type === 'childList') {
                            const added = [...r.addedNodes].filter(n => n.nodeType === 1).map(describe);
                            const removed = [...r.removedNodes].filter(n => n.nodeType === 1).map(describe);
                            if (added.length || removed.length) {
                                window.__mutations.push({ t, kind: 'childList', target: describe(r.target), added, removed });
                            }
                        } else if (r.type === 'attributes') {
                            window.__mutations.push({
                                t, kind: 'attr', target: describe(r.target),
                                attr: r.attributeName,
                                oldValue: r.oldValue,
                                newValue: r.target.getAttribute ? r.target.getAttribute(r.attributeName) : null
                            });
                        }
                    }
                });
                mo.observe(document.documentElement, {
                    childList: true, subtree: true,
                    attributes: true, attributeOldValue: true,
                    attributeFilter: ['style', 'class', 'hidden']
                });
            };
            // Try immediately, and again as soon as documentElement appears
            if (document.documentElement) startMutationWatch();
            const tryInterval = setInterval(() => {
                if (document.documentElement) {
                    startMutationWatch();
                    clearInterval(tryInterval);
                }
            }, 1);
            const obs = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    const sources = (entry.sources || []).map(s => ({
                        selector: describe(s.node),
                        prev: s.previousRect ? {
                            x: Math.round(s.previousRect.x),
                            y: Math.round(s.previousRect.y),
                            w: Math.round(s.previousRect.width),
                            h: Math.round(s.previousRect.height)
                        } : null,
                        curr: s.currentRect ? {
                            x: Math.round(s.currentRect.x),
                            y: Math.round(s.currentRect.y),
                            w: Math.round(s.currentRect.width),
                            h: Math.round(s.currentRect.height)
                        } : null
                    }));
                    window.__clsEntries.push({
                        value: entry.value,
                        startTime: Math.round(entry.startTime),
                        hadRecentInput: entry.hadRecentInput,
                        sources
                    });
                }
            });
            obs.observe({ type: 'layout-shift', buffered: true });
        });

        page.on('pageerror', err => console.error('  [pageerror]', err.message));
        page.on('console', msg => {
            if (msg.type() === 'error') console.error('  [console.error]', msg.text());
        });

        const url = `http://localhost:${port}${targetPath}`;
        console.log(`Loading ${url}`);
        // Take a screenshot at t=300ms (before first shift) and t=700ms (after both)
        const screenshotEarly = process.env.CLS_SHOTS ? 'tests/cls-shot-early.png' : null;
        const screenshotLate  = process.env.CLS_SHOTS ? 'tests/cls-shot-late.png'  : null;
        const navP = page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
        if (screenshotEarly) {
            setTimeout(() => page.screenshot({ path: screenshotEarly, fullPage: true }).catch(() => {}), 300);
            setTimeout(() => page.screenshot({ path: screenshotLate,  fullPage: true }).catch(() => {}), 1500);
        }
        await navP;

        // Give late shifts (post-load JS, fonts, deferred work) time to settle
        await new Promise(r => setTimeout(r, 8000));

        const heights = await page.evaluate(() => ({
            scrollHeight: document.documentElement.scrollHeight,
            body: document.body.scrollHeight,
            uploadSection: (document.querySelector('.upload-section') || {}).getBoundingClientRect ?
                document.querySelector('.upload-section').getBoundingClientRect() : null,
            validationGroups: document.getElementById('validationGroups') ?
                document.getElementById('validationGroups').getBoundingClientRect() : null,
            validateBtn: document.querySelector('.validate-button-container') ?
                document.querySelector('.validate-button-container').getBoundingClientRect() : null,
            footer: document.querySelector('footer.footer-modern') ?
                document.querySelector('footer.footer-modern').getBoundingClientRect() : null
        }));
        console.log('\nFinal layout (after settle):', JSON.stringify(heights, null, 2));

        const entries = await page.evaluate(() => window.__clsEntries || []);
        const mutations = await page.evaluate(() => window.__mutations || []);
        const heightTrace = await page.evaluate(() => window.__heights || []);

        // Aggregate by selector
        const total = entries
            .filter(e => !e.hadRecentInput)
            .reduce((sum, e) => sum + e.value, 0);

        const bySelector = new Map();
        for (const e of entries) {
            if (e.hadRecentInput) continue;
            // Distribute the entry's score evenly across its sources (rough proxy)
            const share = e.sources.length ? e.value / e.sources.length : e.value;
            const list = e.sources.length ? e.sources : [{ selector: '<no-source>', prev: null, curr: null }];
            for (const src of list) {
                const cur = bySelector.get(src.selector) || { score: 0, occurrences: 0, examples: [] };
                cur.score += share;
                cur.occurrences += 1;
                if (cur.examples.length < 2) cur.examples.push({ prev: src.prev, curr: src.curr, t: e.startTime });
                bySelector.set(src.selector, cur);
            }
        }

        const ranked = [...bySelector.entries()]
            .sort((a, b) => b[1].score - a[1].score);

        console.log(`\n=== CLS Report for ${targetPath} ===`);
        console.log(`Total CLS (no-input shifts): ${total.toFixed(3)}`);
        console.log(`Layout-shift entries:        ${entries.length}\n`);
        if (ranked.length === 0) {
            console.log('(no layout shifts recorded)');
        } else {
            console.log('Top contributors (selector — score — occurrences):');
            for (const [sel, data] of ranked.slice(0, 12)) {
                console.log(`  ${data.score.toFixed(3).padStart(6)}  ${String(data.occurrences).padStart(2)}x  ${sel}`);
                for (const ex of data.examples) {
                    const p = ex.prev ? `${ex.prev.w}x${ex.prev.h}@(${ex.prev.x},${ex.prev.y})` : '—';
                    const c = ex.curr ? `${ex.curr.w}x${ex.curr.h}@(${ex.curr.x},${ex.curr.y})` : '—';
                    console.log(`             t=${ex.t}ms  prev=${p}  →  curr=${c}`);
                }
            }
        }

        console.log('\nRaw entries:');
        for (const e of entries) {
            console.log(`  t=${e.startTime}ms  value=${e.value.toFixed(4)}  hadRecentInput=${e.hadRecentInput}  sources=${e.sources.length}`);
        }

        console.log('\nbody.scrollHeight timeline (only changes):');
        for (const h of heightTrace.slice(0, 30)) {
            console.log(`  t=${h.t}ms  scrollHeight=${h.h}px`);
        }
        if (heightTrace.length > 30) console.log(`  ... and ${heightTrace.length - 30} more`);

        // For each shift, dump mutations in [shiftTime - 200ms, shiftTime + 50ms]
        console.log('\nMutations near each shift:');
        for (const e of entries) {
            const lo = e.startTime - 200, hi = e.startTime + 50;
            const window_ = mutations.filter(m => m.t >= lo && m.t <= hi);
            console.log(`\n  -- shift @ t=${e.startTime}ms (value ${e.value.toFixed(3)}) — ${window_.length} mutations in [${lo},${hi}]ms --`);
            const filtered = window_.filter(m => !(m.kind === 'childList' && m.target === 'body' && m.added.every(a => a === 'script') && m.removed.length === 0));
            for (const m of filtered.slice(0, 50)) {
                if (m.kind === 'childList') {
                    const a = m.added.length ? ` +[${m.added.join(', ')}]` : '';
                    const r = m.removed.length ? ` -[${m.removed.join(', ')}]` : '';
                    console.log(`    t=${m.t}ms  childList in ${m.target}${a}${r}`);
                } else {
                    const truncate = (s) => s == null ? '∅' : (String(s).length > 60 ? String(s).slice(0, 57) + '...' : String(s));
                    console.log(`    t=${m.t}ms  attr ${m.attr} on ${m.target}: ${truncate(m.oldValue)} → ${truncate(m.newValue)}`);
                }
            }
            if (filtered.length > 50) console.log(`    ... and ${filtered.length - 50} more (filtered out script-tag inserts)`);
        }
    } finally {
        await browser.close();
        server.close();
    }
}

const target = process.argv[2] || '/index.html';
diagnose(target).catch(err => {
    console.error(err);
    process.exit(1);
});
