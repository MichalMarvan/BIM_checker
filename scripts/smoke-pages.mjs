#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */

import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
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
const mimeTypes = {
    '.css': 'text/css', '.dtd': 'application/xml', '.html': 'text/html',
    '.ico': 'image/x-icon', '.ifc': 'text/plain', '.ids': 'application/xml',
    '.js': 'application/javascript', '.json': 'application/json', '.mjs': 'application/javascript', '.png': 'image/png',
    '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.xml': 'application/xml',
    '.xsd': 'application/xml'
};

function readGlobalHeaders() {
    const lines = readFileSync(resolve(root, '_headers'), 'utf8').split(/\r?\n/);
    const start = lines.findIndex(line => line.trim() === '/*');
    const headers = {};
    for (let i = start + 1; i < lines.length && /^\s+/.test(lines[i]); i++) {
        const separator = lines[i].indexOf(':');
        if (separator > 0) headers[lines[i].slice(0, separator).trim()] = lines[i].slice(separator + 1).trim();
    }
    return headers;
}

const globalHeaders = readGlobalHeaders();

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
    response.writeHead(200, {
        ...globalHeaders,
        'Content-Type': mimeTypes[extname(path)] || 'application/octet-stream'
    });
    response.end(readFileSync(path));
});

await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
});

const port = server.address().port;
let browser;
const failures = [];

try {
    browser = await puppeteer.launch({
        headless: true,
        executablePath: existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    for (const route of routes) {
        const page = await browser.newPage();
        const localFailures = [];
        page.on('console', message => {
            if (message.type() === 'error') localFailures.push(`console.error: ${message.text()}`);
        });
        page.on('pageerror', error => localFailures.push(`pageerror: ${error.message}`));
        page.on('requestfailed', request => {
            if (request.url().startsWith(`http://127.0.0.1:${port}`)) {
                localFailures.push(`requestfailed: ${request.url()} (${request.failure()?.errorText || 'unknown'})`);
            }
        });
        page.on('response', response => {
            if (response.url().startsWith(`http://127.0.0.1:${port}`) && response.status() >= 400) {
                localFailures.push(`HTTP ${response.status()}: ${response.url()}`);
            }
        });

        const response = await page.goto(`http://127.0.0.1:${port}${route}`, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        const state = await page.evaluate(() => ({
            title: document.title.trim(),
            bodyText: document.body?.innerText?.trim() || ''
        }));
        if (route === '/pages/3d-viewer.html') {
            try {
                const vendorState = await page.evaluate(async () => {
                    const base = new URL('../assets/js/vendor/optional/', location.href);
                    const [proj4, jszip, geotiff, html2canvas, dxf, jspdf, transformers] = await Promise.all([
                        import(new URL('proj4.js', base)),
                        import(new URL('jszip.js', base)),
                        import(new URL('geotiff.js', base)),
                        import(new URL('html2canvas.js', base)),
                        import(new URL('dxf.js', base)),
                        import(new URL('jspdf.js', base)),
                        import(new URL('transformers.web.min.js', base))
                    ]);
                    return {
                        proj4: typeof proj4.default,
                        jszip: typeof jszip.default,
                        geotiff: typeof geotiff.fromArrayBuffer,
                        html2canvas: typeof html2canvas.default,
                        dxf: typeof dxf.DxfWriter,
                        jspdf: typeof jspdf.jsPDF,
                        transformers: typeof transformers.pipeline
                    };
                });
                for (const [name, type] of Object.entries(vendorState)) {
                    if (type !== 'function') localFailures.push(`optional vendor export unavailable: ${name} (${type})`);
                }
            } catch (error) {
                localFailures.push(`optional vendor import failed: ${error.message}`);
            }
        }
        if (!response?.ok()) localFailures.push(`navigation status ${response?.status()}`);
        const csp = response?.headers()['content-security-policy'] || '';
        if (!csp.includes("object-src 'none'") || !csp.includes("frame-ancestors 'none'")) {
            localFailures.push('security CSP header missing or incomplete');
        }
        if (!state.title) localFailures.push('missing document title');
        if (!state.bodyText) localFailures.push('empty document body');
        if (localFailures.length) failures.push({ route, issues: localFailures });
        console.log(`${localFailures.length ? 'FAIL' : 'PASS'} ${route}`);
        await page.close();
    }
} finally {
    if (browser) await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}

if (failures.length) {
    for (const failure of failures) {
        console.error(`\n${failure.route}`);
        for (const issue of failure.issues) console.error(`- ${issue}`);
    }
    process.exitCode = 1;
} else {
    console.log(`Smoke test OK: ${routes.length}/${routes.length} pages loaded without local browser errors.`);
}
