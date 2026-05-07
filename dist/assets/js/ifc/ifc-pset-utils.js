/**
 * IfcPsetUtils — pure utilities for IFC property set / quantity set parsing and manipulation.
 * No DOM mutations, no global state beyond namespace export.
 */
window.IfcPsetUtils = (function() {
    'use strict';

    function parsePsetHasProperties(_params) { return []; }
    function addPropertyIdToPset(_line, _newPropId) { return _line; }
    function parsePropertyName(_line) { return null; }
    function findPsetOnElement(_entityId, _psetName, _relDefinesMap, _propertySetMap) { return null; }

    return { parsePsetHasProperties, addPropertyIdToPset, parsePropertyName, findPsetOnElement };
})();
