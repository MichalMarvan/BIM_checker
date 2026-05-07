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
    function addPropertyIdToPset(_line, _newPropId) { return _line; }
    function parsePropertyName(_line) { return null; }
    function findPsetOnElement(_entityId, _psetName, _relDefinesMap, _propertySetMap) { return null; }

    return { parsePsetHasProperties, addPropertyIdToPset, parsePropertyName, findPsetOnElement };
})();
