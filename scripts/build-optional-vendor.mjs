#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */

import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundles = [
    ['proj4.js', "import proj4 from 'proj4'; export default proj4; export { proj4 };"],
    ['jszip.js', "import JSZip from 'jszip'; export default JSZip; export { JSZip };"],
    ['geotiff.js', "export * from 'geotiff';"],
    ['html2canvas.js', "import html2canvas from 'html2canvas'; export default html2canvas; export { html2canvas };"],
    ['dxf.js', "export * from '@tarikjabiri/dxf';"],
    ['jspdf.js', "export { jsPDF } from 'jspdf';"]
];

export async function buildOptionalVendor(outputPath = 'assets/js/vendor/optional') {
    const outputDir = resolve(root, outputPath);
    await mkdir(outputDir, { recursive: true });
    for (const [file, contents] of bundles) {
        await build({
            stdin: { contents, resolveDir: root, sourcefile: `vendor-entry-${file}` },
            outfile: resolve(outputDir, file),
            bundle: true,
            format: 'esm',
            platform: 'browser',
            target: ['es2022'],
            minify: true,
            legalComments: 'eof',
            sourcemap: false,
            logLevel: 'warning'
        });
    }
    return { outputDir, count: bundles.length };
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
    const result = await buildOptionalVendor(process.argv[2]);
    console.log(`Built ${result.count} optional browser bundles in ${result.outputDir}`);
}
