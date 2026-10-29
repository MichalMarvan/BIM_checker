#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOptionalVendor } from './build-optional-vendor.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedDir = resolve(root, 'assets/js/vendor/optional');
const generatedDir = mkdtempSync(resolve(tmpdir(), 'bim-checker-vendor-'));
const files = ['proj4.js', 'jszip.js', 'geotiff.js', 'html2canvas.js', 'dxf.js', 'jspdf.js'];

try {
    await buildOptionalVendor(generatedDir);
    const changed = files.filter(file => !readFileSync(resolve(expectedDir, file)).equals(readFileSync(resolve(generatedDir, file))));
    if (changed.length) {
        console.error(`Vendor bundles are stale: ${changed.join(', ')}. Run npm run build:vendor.`);
        process.exitCode = 1;
    } else {
        console.log(`Vendor bundle check OK: ${files.length} reproducible lazy bundles.`);
    }
} finally {
    rmSync(generatedDir, { recursive: true, force: true });
}
