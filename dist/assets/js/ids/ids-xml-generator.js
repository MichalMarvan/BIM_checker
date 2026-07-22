/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * IDS XML Generator
 * Generates IDS XML from JavaScript objects
 */

class IDSXMLGenerator {
    constructor() {
        this.nsIds = 'http://standards.buildingsmart.org/IDS';
        this.nsXs = 'http://www.w3.org/2001/XMLSchema';
        this.nsXsi = 'http://www.w3.org/2001/XMLSchema-instance';
    }

    /**
     * Generate complete IDS XML document
     */
    generateIDS(idsData) {
        if (!idsData.specifications || idsData.specifications.length === 0) {
            throw new Error('IDS must contain at least one specification.');
        }

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<ids xmlns="http://standards.buildingsmart.org/IDS" ';
        xml += 'xmlns:xs="http://www.w3.org/2001/XMLSchema" ';
        xml += 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ';
        xml += 'xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">\n';

        // Add info section
        xml += '  <info>\n';
        xml += `    <title>${this.escapeXml(idsData.title || 'IDS Specification')}</title>\n`;
        if (idsData.copyright) {
            xml += `    <copyright>${this.escapeXml(idsData.copyright)}</copyright>\n`;
        }
        if (idsData.version) {
            xml += `    <version>${this.escapeXml(idsData.version)}</version>\n`;
        }
        if (idsData.description) {
            xml += `    <description>${this.escapeXml(idsData.description)}</description>\n`;
        }
        if (idsData.author) {
            if (!/^[^@]+@[^.]+\..+$/.test(idsData.author)) {
                throw new Error(`IDS author must be an email address: ${idsData.author}`);
            }
            xml += `    <author>${this.escapeXml(idsData.author)}</author>\n`;
        }
        if (idsData.date) {
            const dateMatch = String(idsData.date).match(/^(\d{4})-(\d{2})-(\d{2})(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))?$/);
            const parsedDate = dateMatch
                ? new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])))
                : null;
            if (!dateMatch || parsedDate.getUTCFullYear() !== Number(dateMatch[1]) ||
                parsedDate.getUTCMonth() !== Number(dateMatch[2]) - 1 || parsedDate.getUTCDate() !== Number(dateMatch[3])) {
                throw new Error(`Invalid IDS date: ${idsData.date}`);
            }
            xml += `    <date>${this.escapeXml(idsData.date)}</date>\n`;
        }
        if (idsData.purpose) {
            xml += `    <purpose>${this.escapeXml(idsData.purpose)}</purpose>\n`;
        }
        if (idsData.milestone) {
            xml += `    <milestone>${this.escapeXml(idsData.milestone)}</milestone>\n`;
        }
        xml += '  </info>\n';

        // Add specifications
        xml += '  <specifications>\n';
        if (idsData.specifications && Array.isArray(idsData.specifications)) {
            for (const spec of idsData.specifications) {
                xml += this.generateSpecificationString(spec, '    ');
            }
        }
        xml += '  </specifications>\n';
        xml += '</ids>';

        return xml;
    }

    /**
     * Generate a specification as string
     */
    generateSpecificationString(specData, indent = '') {
        let xml = `${indent}<specification`;
        xml += ` name="${this.escapeXml(specData.name || 'Unnamed Specification')}"`;
        const versionStr = Array.isArray(specData.ifcVersion)
            ? specData.ifcVersion.join(' ')
            : (specData.ifcVersion || 'IFC4');
        const allowedVersions = new Set(['IFC2X3', 'IFC4', 'IFC4X3_ADD2']);
        const versions = String(versionStr).trim().split(/\s+/).filter(Boolean);
        if (!versions.length || versions.some(version => !allowedVersions.has(version))) {
            throw new Error(`Invalid IDS ifcVersion: ${versionStr}`);
        }
        xml += ` ifcVersion="${this.escapeXml(versionStr)}"`;

        if (specData.identifier) {
            xml += ` identifier="${this.escapeXml(specData.identifier)}"`;
        }
        if (specData.description) {
            xml += ` description="${this.escapeXml(specData.description)}"`;
        }
        if (specData.instructions) {
            xml += ` instructions="${this.escapeXml(specData.instructions)}"`;
        }
        xml += '>\n';

        // Applicability. IDS 1.0 defaults are minOccurs="1" and maxOccurs="1",
        // so omitted values must stay omitted to preserve the source semantics.
        this.validateOccurrences(specData.minOccurs, specData.maxOccurs);
        xml += `${indent}  <applicability`;
        if (specData.minOccurs !== undefined && specData.minOccurs !== null && specData.minOccurs !== '') {
            xml += ` minOccurs="${this.escapeXml(specData.minOccurs)}"`;
        }
        if (specData.maxOccurs !== undefined && specData.maxOccurs !== null && specData.maxOccurs !== '') {
            xml += ` maxOccurs="${this.escapeXml(specData.maxOccurs)}"`;
        }
        xml += '>\n';
        if (specData.applicability && specData.applicability.length > 0) {
            const entities = specData.applicability.filter(facet => facet.type === 'entity');
            if (entities.length > 1) throw new Error('Applicability can contain at most one entity facet.');
            for (const facet of this.orderFacets(specData.applicability)) {
                xml += this.generateFacetString(facet, indent + '    ', false);
            }
        }
        xml += `${indent}  </applicability>\n`;

        // Requirements
        if (specData.requirements && specData.requirements.length > 0) {
            xml += `${indent}  <requirements`;
            if (specData.requirementsDescription) {
                xml += ` description="${this.escapeXml(specData.requirementsDescription)}"`;
            }
            xml += '>\n';
            for (const facet of this.orderFacets(specData.requirements)) {
                xml += this.generateFacetString(facet, indent + '    ', true);
            }
            xml += `${indent}  </requirements>\n`;
        }

        xml += `${indent}</specification>\n`;
        return xml;
    }

    /**
     * Generate a facet as string
     */
    generateFacetString(facetData, indent = '', isRequirement = false) {
        const type = facetData.type;

        switch (type) {
            case 'entity':
                return this.generateEntityFacetString(facetData, indent, isRequirement);
            case 'property':
                return this.generatePropertyFacetString(facetData, indent, isRequirement);
            case 'attribute':
                return this.generateAttributeFacetString(facetData, indent, isRequirement);
            case 'classification':
                return this.generateClassificationFacetString(facetData, indent, isRequirement);
            case 'material':
                return this.generateMaterialFacetString(facetData, indent, isRequirement);
            case 'partOf':
                return this.generatePartOfFacetString(facetData, indent, isRequirement);
            default:
                throw new Error(`Unsupported IDS facet type: ${type || '(empty)'}`);
        }
    }

    orderFacets(facets) {
        const order = ['entity', 'partOf', 'classification', 'attribute', 'property', 'material'];
        return facets
            .map((facet, index) => ({ facet, index }))
            .sort((a, b) => {
                const aOrder = order.indexOf(a.facet.type);
                const bOrder = order.indexOf(b.facet.type);
                return (aOrder === -1 ? order.length : aOrder) - (bOrder === -1 ? order.length : bOrder) || a.index - b.index;
            })
            .map(item => item.facet);
    }

    /**
     * Generate entity facet as string
     */
    generateEntityFacetString(data, indent, isRequirement = false) {
        if (!data.name) throw new Error('Entity facet must contain a name.');
        let xml = `${indent}<entity`;
        if (isRequirement && data.instructions) {
            xml += ` instructions="${this.escapeXml(data.instructions)}"`;
        }
        xml += '>\n';
        if (data.name) {
            xml += this.addRestrictionString(data.name, 'name', indent + '  ');
        }
        if (data.predefinedType) {
            xml += this.addRestrictionString(data.predefinedType, 'predefinedType', indent + '  ');
        }
        xml += `${indent}</entity>\n`;
        return xml;
    }

    /**
     * Generate property facet as string
     */
    generatePropertyFacetString(data, indent, isRequirement = false) {
        if (!data.propertySet || !data.baseName) {
            throw new Error('Property facet must contain propertySet and baseName.');
        }
        let xml = `${indent}<property`;
        if (data.dataType) {
            if (!/^[A-Z]+$/.test(data.dataType)) throw new Error(`Invalid IDS property dataType: ${data.dataType}`);
            xml += ` dataType="${this.escapeXml(data.dataType)}"`;
        }
        if (isRequirement && data.uri) {
            xml += ` uri="${this.escapeXml(data.uri)}"`;
        }
        if (isRequirement) {
            xml += this.requirementAttributes(data);
        }
        xml += '>\n';
        if (data.propertySet) {
            xml += this.addRestrictionString(data.propertySet, 'propertySet', indent + '  ');
        }
        if (data.baseName) {
            xml += this.addRestrictionString(data.baseName, 'baseName', indent + '  ');
        }
        if (data.value) {
            xml += this.addRestrictionString(data.value, 'value', indent + '  ');
        }
        xml += `${indent}</property>\n`;
        return xml;
    }

    /**
     * Generate attribute facet as string
     */
    generateAttributeFacetString(data, indent, isRequirement = false) {
        if (!data.name) throw new Error('Attribute facet must contain a name.');
        let xml = `${indent}<attribute`;
        if (isRequirement) {
            xml += this.requirementAttributes(data);
        }
        xml += '>\n';
        if (data.name) {
            xml += this.addRestrictionString(data.name, 'name', indent + '  ');
        }
        if (data.value) {
            xml += this.addRestrictionString(data.value, 'value', indent + '  ');
        }
        xml += `${indent}</attribute>\n`;
        return xml;
    }

    /**
     * Generate classification facet as string
     */
    generateClassificationFacetString(data, indent, isRequirement = false) {
        if (!data.system) throw new Error('Classification facet must contain a system.');
        let xml = `${indent}<classification`;
        if (isRequirement && data.uri) {
            xml += ` uri="${this.escapeXml(data.uri)}"`;
        }
        if (isRequirement) {
            xml += this.requirementAttributes(data);
        }
        xml += '>\n';
        if (data.value) {
            xml += this.addRestrictionString(data.value, 'value', indent + '  ');
        }
        if (data.system) {
            xml += this.addRestrictionString(data.system, 'system', indent + '  ');
        }
        xml += `${indent}</classification>\n`;
        return xml;
    }

    /**
     * Generate material facet as string
     */
    generateMaterialFacetString(data, indent, isRequirement = false) {
        let xml = `${indent}<material`;
        if (isRequirement && data.uri) {
            xml += ` uri="${this.escapeXml(data.uri)}"`;
        }
        if (isRequirement) {
            xml += this.requirementAttributes(data);
        }
        xml += '>\n';
        if (data.value) {
            xml += this.addRestrictionString(data.value, 'value', indent + '  ');
        }
        xml += `${indent}</material>\n`;
        return xml;
    }

    /**
     * Generate partOf facet as string
     */
    generatePartOfFacetString(data, indent, isRequirement = false) {
        if (!data.entity) throw new Error('partOf facet must contain an entity.');
        let xml = `${indent}<partOf`;
        if (data.relation) {
            const relations = [
                'IFCRELAGGREGATES',
                'IFCRELASSIGNSTOGROUP',
                'IFCRELCONTAINEDINSPATIALSTRUCTURE',
                'IFCRELNESTS',
                'IFCRELVOIDSELEMENT IFCRELFILLSELEMENT'
            ];
            if (!relations.includes(data.relation)) throw new Error(`Invalid IDS partOf relation: ${data.relation}`);
            xml += ` relation="${this.escapeXml(data.relation)}"`;
        }
        if (isRequirement) {
            xml += this.requirementAttributes(data, true);
        }
        xml += '>\n';
        if (data.entity) {
            const entity = typeof data.entity === 'string'
                ? { name: data.entity }
                : data.entity;
            if (!entity.name) throw new Error('partOf entity must contain a name.');
            xml += `${indent}  <entity>\n`;
            if (entity.name) {
                xml += this.addRestrictionString(entity.name, 'name', indent + '    ');
            }
            if (entity.predefinedType) {
                xml += this.addRestrictionString(entity.predefinedType, 'predefinedType', indent + '    ');
            }
            xml += `${indent}  </entity>\n`;
        }
        xml += `${indent}</partOf>\n`;
        return xml;
    }

    /**
     * Add a restriction element as string
     */
    addRestrictionString(restrictionData, elementName, indent) {
        let xml = `${indent}<${elementName}>\n`;

        if (typeof restrictionData === 'string') {
            // Simple value
            xml += `${indent}  <simpleValue>${this.escapeXml(restrictionData)}</simpleValue>\n`;
        } else if (restrictionData && (
            restrictionData.type === 'simpleValue' ||
            restrictionData.type === 'simple' ||
            (!restrictionData.type && Object.prototype.hasOwnProperty.call(restrictionData, 'value'))
        )) {
            xml += `${indent}  <simpleValue>${this.escapeXml(restrictionData.value)}</simpleValue>\n`;
        } else if (restrictionData) {
            const facets = this.restrictionFacets(restrictionData);
            xml += `${indent}  <xs:restriction base="${this.escapeXml(restrictionData.base || 'xs:string')}">\n`;
            for (const facet of facets) {
                xml += `${indent}    <xs:${facet.type} value="${this.escapeXml(facet.value)}"/>\n`;
            }
            xml += `${indent}  </xs:restriction>\n`;
        }

        xml += `${indent}</${elementName}>\n`;
        return xml;
    }

    restrictionFacets(data) {
        const supported = new Set([
            'length', 'minLength', 'maxLength', 'pattern', 'enumeration', 'whiteSpace',
            'maxInclusive', 'maxExclusive', 'minInclusive', 'minExclusive',
            'totalDigits', 'fractionDigits'
        ]);
        if (Array.isArray(data.facets)) {
            return data.facets
                .filter(facet => facet && supported.has(facet.type) && facet.value !== undefined)
                .map(facet => ({ type: facet.type, value: facet.value }));
        }

        if (data.type === 'enumeration') {
            const values = data.values || data.options || data.enumeration || [];
            return values.map(value => ({ type: 'enumeration', value }));
        }
        if (data.type === 'pattern') {
            return [{ type: 'pattern', value: data.value ?? data.pattern ?? '' }];
        }

        const facets = [];
        const patterns = data.patterns || (data.pattern !== undefined ? [data.pattern] : []);
        for (const pattern of patterns) facets.push({ type: 'pattern', value: pattern });
        for (const name of supported) {
            if (name === 'pattern' || name === 'enumeration') continue;
            if (data[name] !== undefined) facets.push({ type: name, value: data[name] });
        }
        return facets;
    }

    requirementAttributes(data, simpleCardinality = false) {
        const cardinality = data.cardinality || 'required';
        const allowed = simpleCardinality
            ? ['required', 'prohibited']
            : ['required', 'optional', 'prohibited'];
        if (!allowed.includes(cardinality)) {
            throw new Error(`Invalid ${simpleCardinality ? 'partOf ' : ''}requirement cardinality: ${cardinality}`);
        }
        let attributes = ` cardinality="${cardinality}"`;
        if (data.instructions) {
            attributes += ` instructions="${this.escapeXml(data.instructions)}"`;
        }
        return attributes;
    }

    validateOccurrences(minOccurs, maxOccurs) {
        const isNonNegativeInteger = value => /^\d+$/.test(String(value));
        if (minOccurs !== undefined && minOccurs !== null && minOccurs !== '' && !isNonNegativeInteger(minOccurs)) {
            throw new Error(`Invalid IDS minOccurs: ${minOccurs}`);
        }
        if (maxOccurs !== undefined && maxOccurs !== null && maxOccurs !== '' && maxOccurs !== 'unbounded' && !isNonNegativeInteger(maxOccurs)) {
            throw new Error(`Invalid IDS maxOccurs: ${maxOccurs}`);
        }
        if (isNonNegativeInteger(minOccurs) && isNonNegativeInteger(maxOccurs) && Number(maxOccurs) < Number(minOccurs)) {
            throw new Error(`IDS maxOccurs (${maxOccurs}) cannot be lower than minOccurs (${minOccurs}).`);
        }
    }

    /**
     * Escape XML special characters
     */
    escapeXml(text) {
        if (text === undefined || text === null) {
            return '';
        }
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * Download IDS as XML file
     */
    downloadIDS(idsData, filename = 'specification.ids') {
        const xml = this.generateIDS(idsData);
        const blob = new Blob([xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Export for use in other modules
window.IDSXMLGenerator = IDSXMLGenerator;
