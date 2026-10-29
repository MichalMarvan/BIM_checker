#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseline = JSON.parse(await readFile(resolve(root, 'quality-baseline.json'), 'utf8'));
const eslint = new ESLint({ cwd: root });
const results = await eslint.lintFiles(['assets/js/']);
const errors = results.reduce((sum, result) => sum + result.errorCount, 0);
const warnings = results.reduce((sum, result) => sum + result.warningCount, 0);

console.log(`ESLint: ${errors} errors, ${warnings} warnings (baseline ${baseline.eslintWarnings})`);

if (errors > 0) {
    const formatter = await eslint.loadFormatter('stylish');
    console.error(await formatter.format(results.filter(result => result.errorCount > 0)));
    process.exitCode = 1;
} else if (warnings > baseline.eslintWarnings) {
    console.error(`Lint warning count increased by ${warnings - baseline.eslintWarnings}.`);
    process.exitCode = 1;
} else if (warnings < baseline.eslintWarnings) {
    console.log(`Warning debt decreased by ${baseline.eslintWarnings - warnings}; lower quality-baseline.json.`);
}
