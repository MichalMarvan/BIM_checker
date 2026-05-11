/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Shared helpers for Phase 8 tools.
 *  - getCurrentPageId: URL-path heuristic for the active BIM_checker page
 *  - LRU cache for parsed IFC files (max 3) using window.IFCParserCore
 *  - validateArgs: simple JSON Schema-lite check
 */

let _testPageOverride = null;

export function getCurrentPageId() {
    if (_testPageOverride) return _testPageOverride;
    const path = location.pathname;
    if (path.endsWith('/') || path.endsWith('/index.html')) return 'home';
    if (path.includes('ids-ifc-validator')) return 'validator';
    if (path.includes('ids-parser-visualizer')) return 'parser';
    if (path.includes('ifc-viewer-multi-file')) return 'viewer';
    return 'unknown';
}

export function _setCurrentPageForTest(id) { _testPageOverride = id; }

const _ifcParseCache = new Map();
const MAX_CACHE = 3;

export async function getParsedIfc(filename) {
    if (_ifcParseCache.has(filename)) {
        const v = _ifcParseCache.get(filename);
        _ifcParseCache.delete(filename);
        _ifcParseCache.set(filename, v);
        return v.entities;
    }
    if (typeof window.BIMStorage === 'undefined') {
        throw new Error('BIMStorage not available');
    }
    if (typeof window.IFCParserCore === 'undefined') {
        throw new Error('IFCParserCore not available on this page');
    }
    await window.BIMStorage.init();
    const meta = await window.BIMStorage.getFile('ifc', filename);
    if (!meta) throw new Error(`File not found: ${filename}`);
    const content = await window.BIMStorage.getFileContent('ifc', meta.id);
    const entities = window.IFCParserCore.parseIFCContent(content, filename);

    if (_ifcParseCache.size >= MAX_CACHE) {
        const oldest = _ifcParseCache.keys().next().value;
        _ifcParseCache.delete(oldest);
    }
    _ifcParseCache.set(filename, { entities, parsedAt: Date.now() });
    return entities;
}

export function _clearIfcCacheForTest() { _ifcParseCache.clear(); }
export function _ifcCacheSizeForTest() { return _ifcParseCache.size; }

export function validateArgs(args, schema) {
    if (!args || typeof args !== 'object') {
        throw new Error('Arguments object missing');
    }
    for (const [key, def] of Object.entries(schema)) {
        if (def.required && (args[key] === undefined || args[key] === null)) {
            throw new Error(`Missing required arg: ${key}`);
        }
        if (args[key] !== undefined && def.enum && !def.enum.includes(args[key])) {
            throw new Error(`Invalid value for ${key}: must be one of ${def.enum.join(', ')}`);
        }
    }
}
