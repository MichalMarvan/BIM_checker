/**
 * IDSParser — pure parsing of IDS 1.0 XML documents.
 * No DOM mutations, no event listeners. Safe to load on any page.
 */
window.IDSParser = (function() {
    'use strict';

    function parse(xmlString) {
        const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
        const errEl = doc.querySelector('parsererror');
        if (errEl) {
            return { info: {}, specifications: [], error: { message: errEl.textContent } };
        }
        return parseDocument(doc);
    }

    function parseDocument(xmlDoc) {
        return {
            info: extractInfo(xmlDoc),
            specifications: extractSpecifications(xmlDoc),
            error: null
        };
    }

    function extractInfo(xmlDoc) {
        const info = {};
        const infoEl = xmlDoc.querySelector('info');
        if (!infoEl) return info;
        const fields = ['title', 'copyright', 'version', 'description', 'author', 'date', 'purpose', 'milestone'];
        for (const field of fields) {
            const el = infoEl.querySelector(field);
            if (el) info[field] = el.textContent.trim();
        }
        return info;
    }
    function extractSpecifications(_xmlDoc) { return []; }
    function extractFacets(_facetsElement) { return []; }
    function extractFacet(_element, type) { return { type }; }
    function extractValue(_element) { return null; }
    function extractRestriction(_restriction) { return { type: 'restriction' }; }

    return {
        parse, parseDocument,
        extractInfo, extractSpecifications,
        extractFacets, extractFacet,
        extractValue, extractRestriction
    };
})();
