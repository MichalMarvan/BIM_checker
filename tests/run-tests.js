#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * Headless test runner using Puppeteer
 * Spouští testy v headless Chrome a vypisuje výsledky do konzole
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

// MIME types
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
    '.wasm': 'application/wasm'
};

// Simple HTTP server
function startServer(port) {
    return new Promise((resolve) => {
        const server = createServer((req, res) => {
            let filePath = join(projectRoot, req.url === '/' ? 'index.html' : req.url);

            // Remove query string
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
            } catch (err) {
                res.writeHead(500);
                res.end('Server error');
            }
        });

        server.listen(port, () => {
            resolve(server);
        });
    });
}

// Browser resolution: explicit env override first. On x64 (GitHub CI) puppeteer's
// bundled Chrome wins — ubuntu-latest's snap-wrapped /usr/bin/chromium-browser
// never exposes the WS endpoint. On ARM Linux (Raspberry Pi) system chromium wins —
// puppeteer's "linux_arm" download is an unusable x64 binary.
function resolveBrowserPath() {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
    const armLinux = process.platform === 'linux' && process.arch.startsWith('arm');
    const candidates = [];
    if (!armLinux) {
        try { candidates.push(puppeteer.executablePath()); } catch (e) { /* no bundled browser */ }
    }
    candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
    return candidates.find(p => p && existsSync(p));
}

async function runTests() {
    const port = 8765;
    let server;
    let browser;

    try {
        // Start server
        console.log('Starting HTTP server...');
        server = await startServer(port);
        console.log(`Server running at http://localhost:${port}`);

        // Launch browser
        console.log('Launching headless browser...');
        const executablePath = resolveBrowserPath();
        console.log(`Browser: ${executablePath || 'puppeteer default'}`);
        browser = await puppeteer.launch({
            headless: true,
            ...(executablePath ? { executablePath } : {}),
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
        });

        const page = await browser.newPage();

        // Capture console output
        page.on('console', msg => {
            const type = msg.type();
            const text = msg.text();
            if (type === 'error') {
                console.error('  [ERROR]', text);
            } else if (type === 'warn') {
                console.warn('  [WARN]', text);
            }
        });

        // Navigate to test runner
        console.log('Loading test runner...');
        await page.goto(`http://localhost:${port}/tests/test-runner.html`, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        // Click the run tests button
        console.log('Clicking run tests button...');
        await page.click('.btn-primary');

        // Wait for tests to complete (look for results)
        console.log('Running tests...\n');

        await page.waitForFunction(
            () => {
                const totalEl = document.getElementById('totalTests');
                const total = parseInt(totalEl?.textContent || '0');
                // Wait until tests have run (total > 0) and progress is complete
                const progressFill = document.getElementById('progressFill');
                const progress = progressFill?.style.width;
                return total > 0 && progress === '100%';
            },
            { timeout: 300000 }
        );
        // The progress callback reaches 100% just before the final DOM render.
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get results
        const results = await page.evaluate(() => {
            const source = window.testRunner.results;
            return {
                suites: source.suites.map(suite => ({
                    name: suite.name,
                    tests: suite.tests.map(test => ({
                        name: test.description,
                        passed: test.passed,
                        error: test.error,
                        stack: test.stack
                    }))
                })),
                total: source.total,
                passed: source.passed,
                failed: source.failed
            };
        });

        // Print results
        console.log('='.repeat(60));
        console.log('TEST RESULTS');
        console.log('='.repeat(60));

        for (const suite of results.suites) {
            if (process.env.TEST_REPORT === 'failures' && suite.tests.every(test => test.passed)) {
                continue;
            }
            console.log(`\n${suite.name}`);
            console.log('-'.repeat(40));

            for (const test of suite.tests) {
                if (process.env.TEST_REPORT === 'failures' && test.passed) continue;
                const status = test.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
                console.log(`  [${status}] ${test.name}`);
                if (test.error) {
                    console.log(`         \x1b[31m${test.error}\x1b[0m`);
                    if (process.env.TEST_REPORT === 'failures' && test.stack) {
                        console.log(test.stack.split('\n').slice(0, 3).join('\n'));
                    }
                }
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log(`SUMMARY: ${results.passed}/${results.total} tests passed`);

        if (results.failed > 0) {
            console.log(`\x1b[31m${results.failed} tests FAILED\x1b[0m`);
        } else {
            console.log('\x1b[32mAll tests passed!\x1b[0m');
        }
        console.log('='.repeat(60));

        // Exit with appropriate code
        process.exitCode = results.failed > 0 ? 1 : 0;

    } catch (error) {
        console.error('Test runner error:', error.message);
        process.exitCode = 1;
    } finally {
        if (browser) await browser.close();
        if (server) server.close();
    }
}

runTests();
