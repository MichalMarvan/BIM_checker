/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * IDSParser — pure parsing of IDS 1.0 XML documents.
 * No DOM mutations, no event listeners. Safe to load on any page.
 */
window.IDSParser = (function() {
    'use strict';

    const IDS_NAMESPACE = 'http://standards.buildingsmart.org/IDS';
    const XSD_NAMESPACE = 'http://www.w3.org/2001/XMLSchema';

    function errorResult(message) {
        return { info: {}, specifications: [], error: { message } };
    }

    function parseIfcVersionList(str) {
        if (!str || typeof str !== 'string') return [];
        // .filter(Boolean) drops empty tokens from leading/trailing/multiple whitespace
        return str.trim().split(/\s+/).filter(Boolean);
    }

    function parse(xmlString) {
        const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
        const errEl = doc.querySelector('parsererror');
        if (errEl) {
            return errorResult(errEl.textContent);
        }
        return parseDocument(doc);
    }

    function parseDocument(xmlDoc) {
        const root = xmlDoc?.documentElement;
        if (!root || root.localName !== 'ids') {
            return errorResult('The document root must be an <ids> element.');
        }
        if (root.namespaceURI !== IDS_NAMESPACE) {
            return errorResult(`The <ids> element must use the IDS 1.0 namespace ${IDS_NAMESPACE}.`);
        }
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
            const ifcVersion = spec.getAttribute('ifcVersion') || '';
            result.push({
                name: spec.getAttribute('name') || `Specification ${index + 1}`,
                ifcVersion,
                ifcVersions: parseIfcVersionList(ifcVersion),
                identifier: spec.getAttribute('identifier') || '',
                description: spec.getAttribute('description') || '',
                instructions: spec.getAttribute('instructions') || '',
                minOccurs: applicabilityEl?.getAttribute('minOccurs') ?? undefined,
                maxOccurs: applicabilityEl?.getAttribute('maxOccurs') ?? undefined,
                requirementsDescription: requirementsEl?.getAttribute('description') ?? '',
                applicability: extractFacets(applicabilityEl),
                requirements: extractFacets(requirementsEl)
            });
        });
        return result;
    }
    function extractFacets(facetsElement) {
        if (!facetsElement) return [];
        const types = ['entity', 'partOf', 'classification', 'attribute', 'property', 'material'];
        return Array.from(facetsElement.children)
            .filter(element => types.includes(element.localName))
            .map(element => extractFacet(element, element.localName));
    }

    function extractFacet(element, type) {
        const facet = { type };

        if (type === 'partOf') {
            const entityElem = element.querySelector(':scope > entity');
            if (entityElem) {
                facet.entity = { type: 'entity' };
                const nameElem = entityElem.querySelector(':scope > name');
                if (nameElem) facet.entity.name = extractValue(nameElem);
                const predefinedTypeElem = entityElem.querySelector(':scope > predefinedType');
                if (predefinedTypeElem) facet.entity.predefinedType = extractValue(predefinedTypeElem);
            }
            const relation = element.getAttribute('relation');
            if (relation) facet.relation = relation;
        } else if (type === 'property') {
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

        if (type === 'classification') {
            const sysElem = element.querySelector(':scope > system');
            if (sysElem) facet.system = extractValue(sysElem);
        }

        const predefElem = element.querySelector(':scope > predefinedType');
        if (predefElem) facet.predefinedType = extractValue(predefElem);

        const cardinality = element.getAttribute('cardinality');
        if (cardinality) facet.cardinality = cardinality;
        else if (element.parentElement?.localName === 'requirements' && type !== 'entity') facet.cardinality = 'required';

        const uri = element.getAttribute('uri');
        if (uri) facet.uri = uri;
        const dataType = element.getAttribute('dataType');
        if (dataType) facet.dataType = dataType;
        const instructions = element.getAttribute('instructions');
        if (instructions) facet.instructions = instructions;

        return facet;
    }
    function extractValue(element) {
        const simple = Array.from(element.children).find(child => child.localName === 'simpleValue');
        if (simple) return { type: 'simple', value: simple.textContent.trim() };

        let restriction = Array.from(element.children).find(child => child.localName === 'restriction');
        if (!restriction) {
            restriction = element.getElementsByTagNameNS('http://www.w3.org/2001/XMLSchema', 'restriction')[0];
        }
        if (restriction) return extractRestriction(restriction);

        return { type: 'simple', value: element.textContent.trim() };
    }

    function extractRestriction(restriction) {
        const result = {
            type: 'restriction',
            base: restriction.getAttribute('base') || 'xs:string',
            facets: []
        };
        const findChildren = (name) => {
            // Direct-child match against any namespace
            const direct = Array.from(restriction.children).filter(el => {
                if (el.localName === name) return true;
                // Fallback for older DOM impls without localName
                const tag = el.tagName || '';
                return tag === name || tag.endsWith(':' + name);
            });
            if (direct.length) return direct;
            return Array.from(restriction.getElementsByTagNameNS(XSD_NAMESPACE, name));
        };

        for (const child of Array.from(restriction.children)) {
            if (child.namespaceURI && child.namespaceURI !== XSD_NAMESPACE) continue;
            const value = child.getAttribute('value') ?? child.textContent.trim();
            result.facets.push({ type: child.localName, value });
        }

        const patterns = findChildren('pattern');
        if (patterns.length) {
            result.pattern = patterns[0].getAttribute('value') || patterns[0].textContent.trim();
            result.patterns = patterns.map(pattern => pattern.getAttribute('value') ?? pattern.textContent.trim());
            result.isRegex = true;
        }

        const enums = findChildren('enumeration');
        if (enums.length) {
            if (result.facets.every(facet => facet.type === 'enumeration')) result.type = 'enumeration';
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
        extractValue, extractRestriction,
        parseIfcVersionList
    };
})();
