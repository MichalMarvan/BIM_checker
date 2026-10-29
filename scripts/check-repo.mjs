#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

function fail(message) {
    errors.push(message);
}

function localPath(owner, reference) {
    if (!reference || /^(?:[a-z]+:|#|\/\/)/i.test(reference)) return null;
    const clean = reference.split(/[?#]/, 1)[0];
    if (!clean || clean.includes('${')) return null;
    return clean.startsWith('/')
        ? resolve(root, clean.slice(1))
        : resolve(dirname(owner), clean);
}

function verifyReference(owner, reference, kind) {
    const path = localPath(owner, reference);
    if (path && !existsSync(path)) {
        fail(`${kind} reference is missing: ${reference} (${owner.slice(root.length + 1)})`);
    }
}

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));

if (existsSync(resolve(root, 'src-tauri'))) fail('src-tauri must not be present');
if (existsSync(resolve(root, 'dist'))) fail('dist must be generated externally, not stored in the repository');
if (Object.keys(packageJson.scripts || {}).some(name => name.startsWith('tauri'))) {
    fail('package.json still contains a Tauri script');
}

const htmlFiles = [
    'index.html',
    'pages/ids-parser-visualizer.html',
    'pages/ids-ifc-validator.html',
    'pages/ifc-viewer-multi-file.html',
    'pages/3d-viewer.html'
].map(file => resolve(root, file));

for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
        verifyReference(file, match[1], 'HTML');
    }
}

const moduleRoots = [resolve(root, 'assets/js/3d/viewer-page.js')];
const requiredVendorFiles = [
    'proj4.js', 'jszip.js', 'geotiff.js', 'html2canvas.js', 'dxf.js', 'jspdf.js',
    'transformers.web.min.js', 'ort-wasm-simd-threaded.mjs',
    'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.asyncify.mjs',
    'ort-wasm-simd-threaded.asyncify.wasm', 'ort.webgpu.bundle.min.mjs'
];
for (const file of requiredVendorFiles) {
    if (!existsSync(resolve(root, 'assets/js/vendor/optional', file))) fail(`Optional vendor artifact is missing: ${file}`);
}
const visited = new Set();
function visitModule(file) {
    if (visited.has(file) || !existsSync(file)) return;
    visited.add(file);
    const source = readFileSync(file, 'utf8');
    const importPattern = /(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"']+)["']/g;
    for (const match of source.matchAll(importPattern)) {
        const reference = match[1];
        if (/^https?:\/\//i.test(reference)) {
            fail(`Runtime JavaScript import must be local: ${reference} (${file.slice(root.length + 1)})`);
            continue;
        }
        if (!reference.startsWith('.') && !reference.startsWith('/')) continue;
        const imported = localPath(file, reference);
        if (!imported || !existsSync(imported)) {
            fail(`JavaScript module is missing: ${reference} (${file.slice(root.length + 1)})`);
        } else if (extname(imported) === '.js') {
            visitModule(imported);
        }
    }
}
moduleRoots.forEach(visitModule);

// Czech and English dictionaries must be exact key-set peers, and every
// statically referenced production key must exist in both.
const translationPath = resolve(root, 'assets/js/common/translations.js');
const translationSource = readFileSync(translationPath, 'utf8');
const context = {};
vm.runInNewContext(`${translationSource}\nglobalThis.__translations = translations;`, context);
const dictionaries = context.__translations;
const csKeys = new Set(Object.keys(dictionaries.cs || {}));
const enKeys = new Set(Object.keys(dictionaries.en || {}));
for (const key of csKeys) if (!enKeys.has(key)) fail(`English translation is missing: ${key}`);
for (const key of enKeys) if (!csKeys.has(key)) fail(`Czech translation is missing: ${key}`);

const productionSources = [...htmlFiles];
function collectSources(folder) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
        const path = resolve(folder, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== 'vendor') collectSources(path);
        } else if (extname(path) === '.js') productionSources.push(path);
    }
}
collectSources(resolve(root, 'assets/js'));
const usedKeys = new Set();
for (const sourcePath of productionSources) {
    const source = readFileSync(sourcePath, 'utf8');
    if (extname(sourcePath) === '.html') {
        for (const match of source.matchAll(/data-i18n(?:-(?:title|placeholder|aria-label|content))?=["']([^"']+)["']/g)) usedKeys.add(match[1]);
    }
    for (const match of source.matchAll(/(?:\bt|\.t)\(\s*["']([a-z][\w.-]+)["']\s*(?=[,)])/gi)) usedKeys.add(match[1]);
}
for (const key of usedKeys) {
    if (!csKeys.has(key) || !enKeys.has(key)) fail(`Referenced translation key is missing: ${key}`);
}

const swPath = resolve(root, 'sw.js');
const sw = readFileSync(swPath, 'utf8');
const list = sw.match(/const ASSETS_TO_CACHE\s*=\s*\[([\s\S]*?)\];/)?.[1] || '';
for (const match of list.matchAll(/["'](\.[^"']+)["']/g)) {
    verifyReference(swPath, match[1], 'Service worker cache');
}

const corpus = JSON.parse(readFileSync(resolve(root, 'config/buildingsmart-ids-corpus.json'), 'utf8'));
const ciWorkflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
if (!ciWorkflow.includes(corpus.commit)) {
    fail(`CI workflow does not pin the IDS corpus commit from config/buildingsmart-ids-corpus.json (${corpus.commit})`);
}
if (!ciWorkflow.includes(corpus.testCasesPath)) {
    fail(`CI workflow does not use the IDS corpus test cases path from config/buildingsmart-ids-corpus.json (${corpus.testCasesPath})`);
}

if (errors.length) {
    console.error(`Repository check failed with ${errors.length} problem(s):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
} else {
    console.log(`Repository check OK: ${htmlFiles.length} pages, ${visited.size} 3D modules, ${requiredVendorFiles.length} optional vendor artifacts, ${usedKeys.size} translated UI keys, package metadata and offline assets.`);
}
