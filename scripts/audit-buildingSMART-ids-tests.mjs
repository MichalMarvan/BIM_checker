#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * Run BIM Checker's IDS parser/validator against the official buildingSMART
 * IDS 1.0 implementer test cases.
 *
 * Usage:
 *   node scripts/audit-buildingSMART-ids-tests.mjs /path/to/IDS/Documentation/ImplementersDocumentation/TestCases
 */
import puppeteer from 'puppeteer';
import { createServer } from 'http';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { dirname, extname, join, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const referenceRoot = resolve(process.argv[2] || '');

if (!process.argv[2] || !existsSync(referenceRoot)) {
    console.error('Provide the buildingSMART IDS 1.0 TestCases directory.');
    process.exit(2);
}

function collectPairs(directory, pairs = []) {
    for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) {
            collectPairs(path, pairs);
            continue;
        }
        if (extname(entry).toLowerCase() !== '.ids') continue;
        const ifcPath = path.slice(0, -4) + '.ifc';
        if (!existsSync(ifcPath)) continue;
        const name = entry.toLowerCase();
        const expected = name.startsWith('pass-') ? 'pass'
            : (name.startsWith('fail-') ? 'fail' : (name.startsWith('invalid-') ? 'invalid' : null));
        if (expected) {
            pairs.push({
                relativeIds: relative(referenceRoot, path).split(sep).join('/'),
                relativeIfc: relative(referenceRoot, ifcPath).split(sep).join('/'),
                expected
            });
        }
    }
    return pairs;
}

const pairs = collectPairs(referenceRoot).sort((a, b) => a.relativeIds.localeCompare(b.relativeIds));
const mimeTypes = {
    '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
    '.wasm': 'application/wasm', '.xsd': 'application/xml', '.ids': 'application/xml',
    '.ifc': 'text/plain', '.dtd': 'application/xml'
};

function safeFile(root, requested) {
    const path = resolve(root, requested.replace(/^\/+/, ''));
    return path === root || path.startsWith(root + sep) ? path : null;
}

const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/audit.html') {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end('<!doctype html><html><head><meta charset="utf-8"></head><body>IDS audit</body></html>');
        return;
    }
    const route = url.pathname.startsWith('/official/')
        ? { root: referenceRoot, requested: decodeURIComponent(url.pathname.slice('/official/'.length)) }
        : { root: projectRoot, requested: decodeURIComponent(url.pathname) };
    const file = safeFile(route.root, route.requested);
    if (!file || !existsSync(file) || statSync(file).isDirectory()) {
        response.writeHead(404);
        response.end('Not found');
        return;
    }
    response.writeHead(200, { 'Content-Type': mimeTypes[extname(file).toLowerCase()] || 'application/octet-stream' });
    response.end(readFileSync(file));
});

await new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
const address = server.address();
let browser;

try {
    browser = await puppeteer.launch({
        headless: true,
        executablePath: existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/audit.html`, { waitUntil: 'domcontentloaded' });
    for (const source of [
        '/assets/js/common/regex-cache.js',
        '/assets/js/common/property-set-index.js',
        '/assets/js/common/ifc-parser-core.js',
        '/assets/js/common/ids-parser.js',
        '/assets/js/common/ifc-hierarchy.js',
        '/assets/js/common/ifc-params.js',
        '/assets/js/common/validation-engine.js',
        '/assets/js/common/ids-xsd-validator.js'
    ]) {
        await page.addScriptTag({ url: `http://127.0.0.1:${address.port}${source}` });
    }

    const results = await page.evaluate(async testPairs => {
        const output = [];
        for (const pair of testPairs) {
            const idsUrl = '/official/' + pair.relativeIds.split('/').map(encodeURIComponent).join('/');
            const ifcUrl = '/official/' + pair.relativeIfc.split('/').map(encodeURIComponent).join('/');
            const [idsText, ifcText] = await Promise.all([
                fetch(idsUrl).then(response => response.text()),
                fetch(ifcUrl).then(response => response.text())
            ]);
            let xsd;
            try {
                xsd = await IDSXSDValidator.validate(idsText);
            } catch (error) {
                output.push({ ...pair, actual: 'error', details: `XSD runtime: ${error.message}` });
                continue;
            }
            if (!xsd.valid) {
                output.push({
                    ...pair,
                    actual: 'xsd-invalid',
                    details: (xsd.errors || []).slice(0, 2).map(error => error.message).join('; ')
                });
                continue;
            }
            const parsed = IDSParser.parse(idsText);
            if (parsed.error) {
                output.push({ ...pair, actual: 'error', details: `IDS parse: ${parsed.error.message}` });
                continue;
            }
            const entities = IFCParserCore.parseIFCContent(ifcText, pair.relativeIfc);
            const ifcSchema = IFCParserCore.detectSchema(ifcText);
            const specResults = [];
            for (const specification of parsed.specifications) {
                specResults.push(await ValidationEngine.validateBatch(entities, specification, { ifcSchema }));
            }
            const actual = specResults.every(result => result.status === 'pass') ? 'pass' : 'fail';
            output.push({
                ...pair,
                actual,
                details: specResults.map(result => `${result.specification}: ${result.status} (${result.applicableCount ?? 0})`).join('; ')
            });
        }
        return output;
    }, pairs);

    const mismatches = results.filter(result => result.actual !== (result.expected === 'invalid' ? 'fail' : result.expected));
    const counts = results.reduce((summary, result) => {
        summary[result.expected] = (summary[result.expected] || 0) + 1;
        return summary;
    }, {});
    console.log(`buildingSMART IDS 1.0: ${results.length - mismatches.length}/${results.length} matched expected outcomes`);
    console.log(`Expected: ${JSON.stringify(counts)}`);
    for (const mismatch of mismatches) {
        const expectedOutcome = mismatch.expected === 'invalid' ? 'fail (audit-invalid)' : mismatch.expected;
        console.log(`MISMATCH ${expectedOutcome} -> ${mismatch.actual}: ${mismatch.relativeIds}`);
        if (mismatch.details) console.log(`  ${mismatch.details}`);
    }
    process.exitCode = mismatches.length ? 1 : 0;
} finally {
    if (browser) await browser.close();
    await new Promise(resolveServer => server.close(resolveServer));
}
