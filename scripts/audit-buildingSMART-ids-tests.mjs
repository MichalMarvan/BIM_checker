#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * Run BIM Checker's IDS parser/validator against the official buildingSMART
 * IDS 1.0 implementer test cases.
 *
 * Usage:
 *   node scripts/audit-buildingSMART-ids-tests.mjs /path/to/IDS/Documentation/testcases
 */
import puppeteer from 'puppeteer';
import { createServer } from 'http';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { dirname, extname, join, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';

// Neshody, které nelze v IEEE-754 float64 odstranit. Jakákoli jiná neshoda shodí běh.
const KNOWN_MISMATCHES = new Map([
    ['tolerance/fail_comparison_tolerance_for_floating_point_negative_high_number_lower_bound.ids',
        'the pass and fail literals (-1000001.0000010000 vs -1000001.00000100001) differ by 1e-11, '
        + 'below the float64 ULP (~2.3e-10) at 1e6, so both parse to the same double'],
]);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const cli = { positional: [] };
for (let index = 2; index < process.argv.length; index++) {
    const argument = process.argv[index];
    if (argument.startsWith('--')) {
        const [rawName, inlineValue] = argument.slice(2).split('=', 2);
        const value = inlineValue ?? process.argv[++index];
        cli[rawName] = value;
    } else {
        cli.positional.push(argument);
    }
}
const referenceRoot = resolve(cli.positional[0] || '');

if (!cli.positional[0] || !existsSync(referenceRoot)) {
    console.error('Provide the buildingSMART IDS 1.0 TestCases directory.');
    console.error('Optional: --json <path> --markdown <path> --source-ref <ref> --source-commit <sha>');
    process.exit(2);
}

const skipped = [];
function collectPairs(directory, pairs = []) {
    for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) {
            collectPairs(path, pairs);
            continue;
        }
        if (extname(entry).toLowerCase() !== '.ids') continue;
        const relativeIds = relative(referenceRoot, path).split(sep).join('/');
        const ifcPath = path.slice(0, -4) + '.ifc';
        if (!existsSync(ifcPath)) {
            skipped.push({ relativeIds, reason: 'missing sibling .ifc' });
            continue;
        }
        const name = entry.toLowerCase();
        // Upstream mixes pass-/fail- and pass_/fail_ naming (e.g. testcases/tolerance).
        const expected = /^pass[-_]/.test(name) ? 'pass'
            : (/^fail[-_]/.test(name) ? 'fail' : (/^invalid[-_]/.test(name) ? 'invalid' : null));
        if (expected) {
            pairs.push({
                relativeIds,
                relativeIfc: relative(referenceRoot, ifcPath).split(sep).join('/'),
                expected
            });
        } else {
            skipped.push({ relativeIds, reason: 'no pass/fail/invalid prefix' });
        }
    }
    return pairs;
}

const pairs = collectPairs(referenceRoot).sort((a, b) => (a.relativeIds < b.relativeIds ? -1 : (a.relativeIds > b.relativeIds ? 1 : 0)));
for (const entry of skipped) {
    console.warn(`[skip] ${entry.relativeIds} (${entry.reason})`);
}
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
                output.push({ ...pair, actual: 'error', stage: 'xsd-runtime', xsdValid: false, details: `XSD runtime: ${error.message}` });
                continue;
            }
            if (!xsd.valid) {
                output.push({
                    ...pair,
                    actual: 'xsd-invalid', stage: 'xsd', xsdValid: false,
                    details: (xsd.errors || []).slice(0, 2).map(error => error.message).join('; ')
                });
                continue;
            }
            const parsed = IDSParser.parse(idsText);
            if (parsed.error) {
                output.push({ ...pair, actual: 'error', stage: 'parser', xsdValid: true, parserValid: false, details: `IDS parse: ${parsed.error.message}` });
                continue;
            }
            const entities = IFCParserCore.parseIFCContent(ifcText, pair.relativeIfc);
            const ifcSchema = IFCParserCore.detectSchema(ifcText);
            const specResults = [];
            for (const specification of parsed.specifications) {
                specResults.push(await ValidationEngine.validateBatch(entities, specification, { ifcSchema }));
            }
            const applicabilityPass = specResults.every(result => result.occurrence?.status === 'pass');
            const requirementsPass = specResults.every(result =>
                (result.entityResults || []).every(entity => entity.status === 'pass')
            );
            const actual = specResults.every(result => result.status === 'pass') ? 'pass' : 'fail';
            output.push({
                ...pair,
                actual,
                stage: 'validation',
                xsdValid: true,
                parserValid: true,
                applicabilityPass,
                requirementsPass,
                specifications: specResults.map(result => ({
                    name: result.specification,
                    status: result.status,
                    applicableCount: result.applicableCount ?? 0,
                    occurrence: result.occurrence,
                    passCount: result.passCount,
                    failCount: result.failCount,
                    warnings: result.warnings || []
                })),
                details: specResults.map(result => `${result.specification}: ${result.status} (${result.applicableCount ?? 0})`).join('; ')
            });
        }
        return output;
    }, pairs);

    const annotatedResults = results.map(result => {
        const expectedActual = result.expected === 'invalid' ? 'fail' : result.expected;
        return {
            ...result,
            category: result.relativeIds.split('/')[0] || 'root',
            expectedActual,
            matched: result.actual === expectedActual
        };
    });
    const mismatches = annotatedResults.filter(result => !result.matched);
    const unexpectedMismatches = mismatches.filter(result => !KNOWN_MISMATCHES.has(result.relativeIds));
    const counts = results.reduce((summary, result) => {
        summary[result.expected] = (summary[result.expected] || 0) + 1;
        return summary;
    }, {});
    console.log(`buildingSMART IDS 1.0: ${results.length - mismatches.length}/${results.length} matched expected outcomes`);
    console.log(`Expected: ${JSON.stringify(counts)}`);
    for (const mismatch of mismatches) {
        const expectedOutcome = mismatch.expected === 'invalid' ? 'fail (audit-invalid)' : mismatch.expected;
        const known = KNOWN_MISMATCHES.get(mismatch.relativeIds);
        console.log(`${known ? 'KNOWN MISMATCH' : 'MISMATCH'} ${expectedOutcome} -> ${mismatch.actual}: ${mismatch.relativeIds}`);
        if (known) console.log(`  Accepted: ${known}`);
        if (mismatch.details) console.log(`  ${mismatch.details}`);
    }
    const categories = {};
    for (const result of annotatedResults) {
        const category = categories[result.category] ||= { total: 0, matched: 0, pass: 0, fail: 0, invalid: 0 };
        category.total++;
        if (result.matched) category.matched++;
        category[result.expected]++;
    }
    const report = {
        formatVersion: 1,
        generatedAt: new Date().toISOString(),
        source: {
            repository: 'https://github.com/buildingSMART/IDS',
            ref: cli['source-ref'] || null,
            commit: cli['source-commit'] || null,
            testCases: referenceRoot
        },
        summary: {
            total: annotatedResults.length,
            matched: annotatedResults.length - mismatches.length,
            mismatched: mismatches.length,
            expected: counts,
            stages: annotatedResults.reduce((summary, result) => {
                summary[result.stage] = (summary[result.stage] || 0) + 1;
                return summary;
            }, {}),
            categories
        },
        results: annotatedResults
    };

    function writeReport(path, contents) {
        if (!path) return;
        const target = resolve(path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, contents);
        console.log(`Report: ${target}`);
    }

    writeReport(cli.json, JSON.stringify(report, null, 2) + '\n');
    if (cli.markdown) {
        const lines = [
            '# buildingSMART IDS 1.0 conformance',
            '',
            `- Source: \`${report.source.ref || 'unspecified'}\` (\`${report.source.commit || 'unspecified'}\`)`,
            `- Result: **${report.summary.matched}/${report.summary.total}** expected outcomes matched`,
            `- Generated: ${report.generatedAt}`,
            '',
            '| Category | Matched | Total | Pass | Fail | Invalid |',
            '|---|---:|---:|---:|---:|---:|',
            ...Object.entries(categories).sort(([a], [b]) => (a < b ? -1 : (a > b ? 1 : 0))).map(([name, value]) =>
                `| ${name} | ${value.matched} | ${value.total} | ${value.pass} | ${value.fail} | ${value.invalid} |`
            ),
            '',
            '## Mismatches',
            '',
            ...(mismatches.length
                ? mismatches.map(result => `- \`${result.relativeIds}\`: expected ${result.expectedActual}, got ${result.actual}${result.details ? ` — ${result.details}` : ''}`)
                : ['None.'])
        ];
        writeReport(cli.markdown, lines.join('\n') + '\n');
    }
    process.exitCode = unexpectedMismatches.length ? 1 : 0;
} finally {
    if (browser) await browser.close();
    await new Promise(resolveServer => server.close(resolveServer));
}
