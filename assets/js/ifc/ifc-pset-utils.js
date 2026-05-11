/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * IfcPsetUtils — pure utilities for IFC property set / quantity set parsing and manipulation.
 * No DOM mutations, no global state beyond namespace export.
 */
window.IfcPsetUtils = (function() {
    'use strict';

    // ISO 10303-21 / IFC string encoding decoder.
    // Handles \X\HH (Latin-1), \X2\HHHH...\X0\ (UTF-16), \X4\HHHHHHHH...\X0\ (UTF-32),
    // and \S\X (Latin-1 supplement). Idempotent on already-decoded strings.
    function decodeIfcString(str) {
        if (!str) return str;
        str = str.replace(/\\S\\(.)/g, (_, ch) => String.fromCharCode(ch.charCodeAt(0) + 128));
        str = str.replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (_, hex) => {
            let out = '';
            for (let i = 0; i < hex.length; i += 4) {
                out += String.fromCharCode(parseInt(hex.substr(i, 4), 16));
            }
            return out;
        });
        str = str.replace(/\\X4\\([0-9A-F]+)\\X0\\/gi, (_, hex) => {
            let out = '';
            for (let i = 0; i < hex.length; i += 8) {
                out += String.fromCodePoint(parseInt(hex.substr(i, 8), 16));
            }
            return out;
        });
        str = str.replace(/\\X\\([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        return str;
    }

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
        return decodeIfcString(nameMatch[1].replace(/''/g, "'"));
    }
    function findPsetOnElement(entityId, psetName, relDefinesMap, propertySetMap) {
        // IFCRELDEFINESBYPROPERTIES params: 'guid', $, $, $, (relatedObjects...), #relatingPset
        // Iterate rels, find ones whose RelatedObjects contains entityId
        for (const [_relId, relInfo] of relDefinesMap) {
            if (!relInfo.params) continue;
            // Match all "(...)" then extract IDs
            // Last #N reference outside the tuple is the pset ID
            const tupleMatch = relInfo.params.match(/\(([^()]*)\)\s*,\s*(#\d+)\s*$/);
            if (!tupleMatch) continue;
            const objIds = tupleMatch[1].split(',').map(s => s.trim().replace(/^#/, '')).filter(s => s.length);
            if (!objIds.includes(String(entityId))) continue;
            const psetId = tupleMatch[2].replace(/^#/, '');
            const pset = propertySetMap.get(psetId);
            if (!pset) continue;
            // Check pset name (3rd quoted string in params: 'guid', $, 'Name', ...)
            const nameMatch = pset.params.match(/'(?:[^']|'')*'\s*,\s*\$?[^,]*,\s*'((?:[^']|'')*)'/);
            if (!nameMatch) continue;
            const foundName = decodeIfcString(nameMatch[1].replace(/''/g, "'"));
            if (foundName === psetName) {
                return { id: psetId, ...pset };
            }
        }
        return null;
    }

    return { parsePsetHasProperties, addPropertyIdToPset, parsePropertyName, findPsetOnElement, decodeIfcString };
})();
