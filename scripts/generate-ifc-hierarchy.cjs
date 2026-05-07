#!/usr/bin/env node
/**
 * Generate IFC class hierarchy + PredefinedType attribute index from EXPRESS schemas.
 * Usage: node scripts/generate-ifc-hierarchy.cjs --version IFC4 --output assets/data/
 *
 * URL sources used:
 *   IFC2X3: https://standards.buildingsmart.org/IFC/RELEASE/IFC2x3/TC1/EXPRESS/IFC2X3_TC1.exp
 *   IFC4:   https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2/EXPRESS/IFC4_ADD2.exp
 *   IFC4X3: https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/IFC4X3_ADD2.exp
 */
const fs = require('fs');
const https = require('https');
const path = require('path');

const SCHEMA_URLS = {
    'IFC2X3': 'https://standards.buildingsmart.org/IFC/RELEASE/IFC2x3/TC1/EXPRESS/IFC2X3_TC1.exp',
    'IFC4':   'https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2/EXPRESS/IFC4_ADD2.exp',
    'IFC4X3': 'https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/IFC4X3_ADD2.exp'
};

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) return fetchUrl(res.headers.location).then(resolve, reject);
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function parseExpress(text) {
    const classes = {};
    const entityRe = /ENTITY\s+(\w+)([^;]*?)(?:SUBTYPE\s+OF\s*\(\s*(\w+)\s*\))?\s*;([\s\S]*?)END_ENTITY/gi;
    let match;
    while ((match = entityRe.exec(text)) !== null) {
        const [, name, _supertypeBlock, parent, body] = match;
        const className = name.toUpperCase();
        const entry = {
            parent: parent ? parent.toUpperCase() : null,
            predefinedTypeIndex: null,
            objectTypeIndex: null
        };

        // Extract attribute list (lines like "AttrName : OPTIONAL Type;" before WHERE/UNIQUE/INVERSE)
        const attrSection = body.split(/\b(?:WHERE|UNIQUE|INVERSE|DERIVE)\b/i)[0];
        const attrRe = /(\w+)\s*:\s*(?:OPTIONAL\s+)?[^;]+;/g;
        const attrs = [];
        let ar;
        while ((ar = attrRe.exec(attrSection)) !== null) attrs.push(ar[1]);

        const pdIdx = attrs.findIndex(a => a.toLowerCase() === 'predefinedtype');
        if (pdIdx >= 0) entry.predefinedTypeIndex = pdIdx;
        const otIdx = attrs.findIndex(a => a.toLowerCase() === 'objecttype');
        if (otIdx >= 0 && pdIdx >= 0) entry.objectTypeIndex = otIdx;

        classes[className] = entry;
    }

    // Build a map of own-attr lists per class (name → string[])
    function getOwnAttrs(className) {
        const re = new RegExp(`ENTITY\\s+${className}\\b[\\s\\S]*?END_ENTITY`, 'i');
        const m = text.match(re);
        if (!m) return [];
        const body = m[0].split(/\b(?:WHERE|UNIQUE|INVERSE|DERIVE)\b/i)[0];
        // Remove SUPERTYPE/SUBTYPE preamble before the first ';' (the entity header ends with ';')
        const afterHeader = body.split(';').slice(1).join(';');
        const attrRe2 = /(\w+)\s*:\s*(?:OPTIONAL\s+)?[^;]+;/g;
        const attrs = [];
        let ar2;
        while ((ar2 = attrRe2.exec(afterHeader)) !== null) attrs.push(ar2[1].toLowerCase());
        return attrs;
    }

    // Build full ordered attr list (inherited first, then own) for a class
    function getFullAttrList(name, visited = new Set()) {
        if (visited.has(name)) return [];
        visited.add(name);
        const cls = classes[name];
        if (!cls) return [];
        const parentAttrs = cls.parent ? getFullAttrList(cls.parent, visited) : [];
        return parentAttrs.concat(getOwnAttrs(name));
    }

    // Recompute predefinedTypeIndex and objectTypeIndex using full attr list
    for (const [name, entry] of Object.entries(classes)) {
        const full = getFullAttrList(name);
        const pdIdx = full.findIndex(a => a === 'predefinedtype');
        entry.predefinedTypeIndex = pdIdx >= 0 ? pdIdx : null;
        if (entry.predefinedTypeIndex !== null) {
            const otIdx = full.findIndex(a => a === 'objecttype');
            entry.objectTypeIndex = otIdx >= 0 ? otIdx : null;
        } else {
            entry.objectTypeIndex = null;
        }
    }

    return classes;
}

async function main() {
    const args = process.argv.slice(2);
    const versionIdx = args.indexOf('--version');
    const outputIdx = args.indexOf('--output');
    if (versionIdx < 0 || outputIdx < 0) {
        console.error('Usage: node generate-ifc-hierarchy.cjs --version IFC4 --output assets/data/');
        process.exit(1);
    }
    const version = args[versionIdx + 1];
    const outputDir = args[outputIdx + 1];
    const url = SCHEMA_URLS[version];
    if (!url) { console.error(`Unknown version: ${version}`); process.exit(1); }

    console.log(`Fetching ${url}...`);
    const text = await fetchUrl(url);
    console.log(`Parsing ${text.length} bytes...`);
    const classes = parseExpress(text);
    console.log(`Found ${Object.keys(classes).length} classes`);

    const output = {
        schemaVersion: version,
        generatedFrom: url,
        generatedAt: new Date().toISOString(),
        classes
    };

    const outPath = path.join(outputDir, `ifc-hierarchy-${version}.json`);
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`Wrote ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
