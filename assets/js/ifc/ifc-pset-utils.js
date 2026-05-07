/**
 * IfcPsetUtils — pure utilities for IFC property set / quantity set parsing and manipulation.
 * No DOM mutations, no global state beyond namespace export.
 */
window.IfcPsetUtils = (function() {
    'use strict';

    function parsePsetHasProperties(params) {
        if (!params) return [];
        // HasProperties is the LAST tuple in the params: "...,(#1,#2,#3)"
        const match = params.match(/\(([^()]*)\)\s*$/);
        if (!match) return [];
        const inside = match[1];
        if (!inside.trim()) return [];
        return inside.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }
    function addPropertyIdToPset(line, newPropId) {
        // Find the HasProperties tuple: the last "(...)" whose content is ONLY #refs, digits, commas, spaces.
        // This avoids matching the outer entity parentheses which contain string literals.
        const match = line.match(/^(.*\()([#\d,\s]*)((?:\)[^()]*)+)$/);
        if (!match) return line;
        const [, prefix, inside, suffix] = match;
        const trimmed = inside.trim();
        const newInside = trimmed.length === 0 ? `#${newPropId}` : `${inside},#${newPropId}`;
        return prefix + newInside + suffix;
    }
    function parsePropertyName(line) {
        if (!line) return null;
        // Find the FIRST quoted string in the entity body (after the "(")
        const bodyMatch = line.match(/\(([^]*)/);
        if (!bodyMatch) return null;
        const body = bodyMatch[1];
        const nameMatch = body.match(/^'((?:[^']|'')*)'/);
        if (!nameMatch) return null;
        return nameMatch[1].replace(/''/g, "'");
    }
    function findPsetOnElement(_entityId, _psetName, _relDefinesMap, _propertySetMap) { return null; }

    return { parsePsetHasProperties, addPropertyIdToPset, parsePropertyName, findPsetOnElement };
})();
