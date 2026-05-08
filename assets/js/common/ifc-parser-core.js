/**
 * IFCParserCore — pure synchronous IFC content → entities[] parser.
 * Single source of truth, used by:
 *   - assets/js/workers/ifc-parser.worker.js (worker context, self.IFCParserCore)
 *   - assets/js/validator.js (main thread fallback when Worker unavailable)
 *
 * Output shape matches existing parseIFCFileAsync exactly:
 *   { guid, entity, name, propertySets, fileName, attributes: { Name, GlobalId } }
 */
(function(global) {
    'use strict';

    function parseIFCContent(_content, _fileName) {
        // Stub — implemented in subsequent tasks
        return [];
    }

    global.IFCParserCore = { parseIFCContent };
})(typeof self !== 'undefined' ? self : window);
