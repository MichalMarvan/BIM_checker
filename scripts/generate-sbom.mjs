#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const lockText = readFileSync(resolve(root, 'package-lock.json'), 'utf8');
const lock = JSON.parse(lockText);
const directProd = new Set(Object.keys(pkg.dependencies || {}));
const directDev = new Set(Object.keys(pkg.devDependencies || {}));
const byNameVersion = new Map();

for (const [path, entry] of Object.entries(lock.packages || {})) {
    if (!path.startsWith('node_modules/') || !entry.version) continue;
    const name = entry.name || path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const key = `${name}@${entry.version}`;
    if (byNameVersion.has(key)) continue;
    const scope = directProd.has(name) ? 'required' : directDev.has(name) || entry.dev ? 'excluded' : 'optional';
    byNameVersion.set(key, {
        type: 'library',
        'bom-ref': `pkg:npm/${encodeURIComponent(name)}@${entry.version}`,
        name,
        version: entry.version,
        scope,
        purl: `pkg:npm/${encodeURIComponent(name)}@${entry.version}`,
        licenses: entry.license ? [{ license: { id: entry.license } }] : undefined
    });
}

const manualComponents = [
    ['SheetJS xlsx', '0.18.5', 'Apache-2.0'],
    ['xmllint-wasm', 'vendored', 'MIT OR LGPL-3.0-only'],
    ['three', '0.182.0', 'MIT'],
    ['three-mesh-bvh', 'vendored', 'MIT'],
    ['@huggingface/transformers', '4.2.0', 'Apache-2.0'],
    ['onnxruntime-web', '1.26.0-dev.20260416-b7804b056c', 'MIT']
].map(([name, version, license]) => ({
    type: 'library',
    'bom-ref': `vendored:${name}@${version}`,
    name,
    version,
    scope: 'required',
    licenses: [{ license: { id: license } }],
    properties: [{ name: 'bim-checker:distribution', value: 'vendored-browser-artifact' }]
}));

const digest = createHash('sha256').update(lockText).digest('hex');
const uuid = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:${uuid}`,
    version: 1,
    metadata: {
        component: {
            type: 'application',
            name: pkg.name,
            version: pkg.version,
            licenses: [{ license: { id: pkg.license } }]
        },
        tools: { components: [{ type: 'application', name: 'BIM Checker built-in SBOM generator', version: '1' }] }
    },
    components: [...byNameVersion.values(), ...manualComponents]
        .sort((a, b) => {
            const left = a.purl || a['bom-ref'];
            const right = b.purl || b['bom-ref'];
            return left < right ? -1 : (left > right ? 1 : 0);
        })
};

writeFileSync(resolve(root, 'sbom.cdx.json'), JSON.stringify(sbom, null, 2) + '\n');
console.log(`Generated CycloneDX SBOM with ${sbom.components.length} npm components.`);
