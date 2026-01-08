#!/usr/bin/env node
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
    '.css': 'text/css',
    '.json': 'application/json',
    '.ifc': 'text/plain',
    '.ids': 'application/xml',
    '.xml': 'application/xml'
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
        browser = await puppeteer.launch({
            headless: true,
            executablePath: '/usr/bin/chromium-browser',
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
            { timeout: 120000 }
        );

        // Get results
        const results = await page.evaluate(() => {
            const suites = [];
            const suiteElements = document.querySelectorAll('.test-suite');

            suiteElements.forEach(suite => {
                const name = suite.querySelector('.suite-name')?.textContent || 'Unknown';
                const tests = [];

                suite.querySelectorAll('.test-case').forEach(test => {
                    const testName = test.querySelector('.test-name')?.textContent || '';
                    const passed = test.classList.contains('passed');
                    const error = test.querySelector('.test-error')?.textContent || null;
                    tests.push({ name: testName, passed, error });
                });

                suites.push({ name, tests });
            });

            // Get summary
            const summaryText = document.querySelector('.test-results')?.textContent || '';
            const totalMatch = summaryText.match(/Total:\s*(\d+)/);
            const passedMatch = summaryText.match(/Passed:\s*(\d+)/);
            const failedMatch = summaryText.match(/Failed:\s*(\d+)/);

            return {
                suites,
                total: totalMatch ? parseInt(totalMatch[1]) : 0,
                passed: passedMatch ? parseInt(passedMatch[1]) : 0,
                failed: failedMatch ? parseInt(failedMatch[1]) : 0
            };
        });

        // Print results
        console.log('='.repeat(60));
        console.log('TEST RESULTS');
        console.log('='.repeat(60));

        for (const suite of results.suites) {
            console.log(`\n${suite.name}`);
            console.log('-'.repeat(40));

            for (const test of suite.tests) {
                const status = test.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
                console.log(`  [${status}] ${test.name}`);
                if (test.error) {
                    console.log(`         \x1b[31m${test.error}\x1b[0m`);
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
