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
    function extractValue(element) {
        const simple = element.querySelector('simpleValue');
        if (simple) return { type: 'simple', value: simple.textContent.trim() };

        let restriction = element.querySelector('restriction');
        if (!restriction) {
            restriction = element.getElementsByTagNameNS('http://www.w3.org/2001/XMLSchema', 'restriction')[0];
        }
        if (restriction) return extractRestriction(restriction);

        return { type: 'simple', value: element.textContent.trim() };
    }

    function extractRestriction(restriction) {
        const result = { type: 'restriction' };
        const ns = 'http://www.w3.org/2001/XMLSchema';
        const findChildren = (name) => {
            let nodes = restriction.querySelectorAll(name);
            if (!nodes.length) nodes = restriction.getElementsByTagNameNS(ns, name);
            return Array.from(nodes);
        };

        const patterns = findChildren('pattern');
        if (patterns.length) {
            result.pattern = patterns[0].getAttribute('value') || patterns[0].textContent.trim();
            result.isRegex = true;
        }

        const enums = findChildren('enumeration');
        if (enums.length) {
            result.type = 'enumeration';
            result.values = enums.map(e => e.getAttribute('value'));
        }

        for (const tag of ['minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive', 'minLength', 'maxLength', 'length']) {
            const els = findChildren(tag);
            if (els.length) result[tag] = els[0].getAttribute('value') || els[0].textContent.trim();
        }

        return result;
    }

    return {
        parse, parseDocument,
        extractInfo, extractSpecifications,
        extractFacets, extractFacet,
        extractValue, extractRestriction
    };
})();
