/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
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
            info[field] = el ? el.textContent.trim() : '';
        }
        return info;
    }
    function extractSpecifications(xmlDoc) {
        const result = [];
        const specEls = xmlDoc.querySelectorAll('specification');
        specEls.forEach((spec, index) => {
            const applicabilityEl = spec.querySelector(':scope > applicability');
            const requirementsEl = spec.querySelector(':scope > requirements');
            result.push({
                name: spec.getAttribute('name') || `Specification ${index + 1}`,
                ifcVersion: spec.getAttribute('ifcVersion') || '',
                identifier: spec.getAttribute('identifier') || '',
                description: spec.getAttribute('description') || '',
                instructions: spec.getAttribute('instructions') || '',
                minOccurs: applicabilityEl?.getAttribute('minOccurs') ?? undefined,
                maxOccurs: applicabilityEl?.getAttribute('maxOccurs') ?? undefined,
                applicability: extractFacets(applicabilityEl),
                requirements: extractFacets(requirementsEl)
            });
        });
        return result;
    }
    function extractFacets(facetsElement) {
        if (!facetsElement) return [];
        const facets = [];
        const types = ['entity', 'partOf', 'classification', 'attribute', 'property', 'material'];
        for (const type of types) {
            const elements = facetsElement.querySelectorAll(type);
            for (const el of elements) {
                if (el.parentNode !== facetsElement) continue;  // direct children only
                facets.push(extractFacet(el, type));
            }
        }
        return facets;
    }

    function extractFacet(element, type) {
        const facet = { type };

        if (type === 'property') {
            const baseNameElem = element.querySelector(':scope > baseName');
            if (baseNameElem) facet.baseName = extractValue(baseNameElem);
        } else {
            const nameElem = element.querySelector(':scope > name');
            if (nameElem) facet.name = extractValue(nameElem);
        }

        const valueElem = element.querySelector(':scope > value');
        if (valueElem) facet.value = extractValue(valueElem);

        if (type === 'property') {
            const psetElem = element.querySelector(':scope > propertySet, :scope > propertyset');
            if (psetElem) facet.propertySet = extractValue(psetElem);
        }

        if (type === 'partOf') {
            const relElem = element.querySelector(':scope > relation');
            if (relElem) facet.relation = extractValue(relElem);
        }

        if (type === 'classification') {
            const sysElem = element.querySelector(':scope > system');
            if (sysElem) facet.system = extractValue(sysElem);
        }

        const predefElem = element.querySelector(':scope > predefinedType');
        if (predefElem) facet.predefinedType = extractValue(predefElem);

        facet.cardinality = element.getAttribute('cardinality') || 'required';

        const uri = element.getAttribute('uri');
        if (uri) facet.uri = uri;

        return facet;
    }
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
            // Direct-child match against any namespace
            const direct = Array.from(restriction.children).filter(el => {
                if (el.localName === name) return true;
                // Fallback for older DOM impls without localName
                const tag = el.tagName || '';
                return tag === name || tag.endsWith(':' + name);
            });
            if (direct.length) return direct;
            return Array.from(restriction.getElementsByTagNameNS(ns, name));
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
