#!/usr/bin/env node
/**
 * Build script for Tauri - copies frontend assets to dist folder
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

// Files and directories to copy
const ITEMS_TO_COPY = [
    'index.html',
    'favicon.svg',
    'favicon.ico',
    'assets',
    'pages',
    '.htaccess'
];

// Directories to exclude
const EXCLUDE_DIRS = ['node_modules', 'src-tauri', 'dist', '.git', '.claude', 'tests', 'test-data', 'docs', 'examples', 'podklady', 'podpora'];

function copyRecursive(src, dest) {
    const stat = fs.statSync(src);

    if (stat.isDirectory()) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        const entries = fs.readdirSync(src);
        for (const entry of entries) {
            // Skip excluded directories
            if (EXCLUDE_DIRS.includes(entry)) continue;

            copyRecursive(
                path.join(src, entry),
                path.join(dest, entry)
            );
        }
    } else {
        // Copy file
        fs.copyFileSync(src, dest);
    }
}

function cleanDist() {
    if (fs.existsSync(DIST_DIR)) {
        fs.rmSync(DIST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(DIST_DIR, { recursive: true });
}

function build() {
    console.log('Building dist folder for Tauri...');

    // Clean dist directory
    cleanDist();
    console.log('  Cleaned dist directory');

    // Copy items
    for (const item of ITEMS_TO_COPY) {
        const srcPath = path.join(ROOT_DIR, item);
        const destPath = path.join(DIST_DIR, item);

        if (fs.existsSync(srcPath)) {
            copyRecursive(srcPath, destPath);
            console.log(`  Copied: ${item}`);
        } else {
            console.log(`  Skipped (not found): ${item}`);
        }
    }

    console.log('Build complete!');
}

build();
