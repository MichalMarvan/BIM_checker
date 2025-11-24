/**
 * IDS XML Generator
 * Generates IDS XML from JavaScript objects
 */

class IDSXMLGenerator {
    constructor() {
        this.nsIds = "http://standards.buildingsmart.org/IDS";
        this.nsXs = "http://www.w3.org/2001/XMLSchema";
        this.nsXsi = "http://www.w3.org/2001/XMLSchema-instance";
    }

    /**
     * Generate complete IDS XML document
     */
    generateIDS(idsData) {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<ids xmlns:xs="http://www.w3.org/2001/XMLSchema" ';
        xml += 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ';
        xml += 'xmlns:ids="http://standards.buildingsmart.org/IDS" ';
        xml += 'xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">\n';

        // Add info section
        xml += '  <info>\n';
        xml += `    <title>${this.escapeXml(idsData.title || 'IDS Specification')}</title>\n`;
        if (idsData.copyright) xml += `    <copyright>${this.escapeXml(idsData.copyright)}</copyright>\n`;
        if (idsData.version) xml += `    <version>${this.escapeXml(idsData.version)}</version>\n`;
        if (idsData.description) xml += `    <description>${this.escapeXml(idsData.description)}</description>\n`;
        if (idsData.author) xml += `    <author>${this.escapeXml(idsData.author)}</author>\n`;
        if (idsData.date) xml += `    <date>${this.escapeXml(idsData.date)}</date>\n`;
        if (idsData.purpose) xml += `    <purpose>${this.escapeXml(idsData.purpose)}</purpose>\n`;
        if (idsData.milestone) xml += `    <milestone>${this.escapeXml(idsData.milestone)}</milestone>\n`;
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
        if (specData.ifcVersion) xml += ` ifcVersion="${this.escapeXml(specData.ifcVersion)}"`;
        if (specData.minOccurs !== undefined) xml += ` minOccurs="${specData.minOccurs}"`;
        if (specData.maxOccurs !== undefined) xml += ` maxOccurs="${specData.maxOccurs}"`;
        if (specData.identifier) xml += ` identifier="${this.escapeXml(specData.identifier)}"`;
        if (specData.description) xml += ` description="${this.escapeXml(specData.description)}"`;
        if (specData.instructions) xml += ` instructions="${this.escapeXml(specData.instructions)}"`;
        xml += '>\n';

        // Applicability
        if (specData.applicability && specData.applicability.length > 0) {
            const minOccurs = specData.minOccurs !== undefined ? specData.minOccurs : '0';
            const maxOccurs = specData.maxOccurs !== undefined ? specData.maxOccurs : 'unbounded';
            xml += `${indent}  <applicability minOccurs="${minOccurs}" maxOccurs="${maxOccurs}">\n`;
            for (const facet of specData.applicability) {
                xml += this.generateFacetString(facet, indent + '    ');
            }
            xml += `${indent}  </applicability>\n`;
        }

        // Requirements
        if (specData.requirements && specData.requirements.length > 0) {
            xml += `${indent}  <requirements>\n`;
            for (const facet of specData.requirements) {
                xml += this.generateFacetString(facet, indent + '    ');
            }
            xml += `${indent}  </requirements>\n`;
        }

        xml += `${indent}</specification>\n`;
        return xml;
    }

    /**
     * Generate a specification element (OLD - kept for compatibility)
     */
    generateSpecification(doc, specData) {
        const spec = doc.createElementNS(this.nsIds, "specification");

        spec.setAttribute("name", specData.name || "Unnamed Specification");
        if (specData.ifcVersion) spec.setAttribute("ifcVersion", specData.ifcVersion);
        if (specData.minOccurs !== undefined) spec.setAttribute("minOccurs", specData.minOccurs);
        if (specData.maxOccurs !== undefined) spec.setAttribute("maxOccurs", specData.maxOccurs);
        if (specData.identifier) spec.setAttribute("identifier", specData.identifier);
        if (specData.description) spec.setAttribute("description", specData.description);
        if (specData.instructions) spec.setAttribute("instructions", specData.instructions);

        // Applicability
        if (specData.applicability && specData.applicability.length > 0) {
            const applicability = doc.createElementNS(this.nsIds, "applicability");
            for (const facet of specData.applicability) {
                const facetElement = this.generateFacet(doc, facet);
                if (facetElement) applicability.appendChild(facetElement);
            }
            spec.appendChild(applicability);
        }

        // Requirements
        if (specData.requirements && specData.requirements.length > 0) {
            const requirements = doc.createElementNS(this.nsIds, "requirements");
            for (const facet of specData.requirements) {
                const facetElement = this.generateFacet(doc, facet);
                if (facetElement) requirements.appendChild(facetElement);
            }
            spec.appendChild(requirements);
        }

        return spec;
    }

    /**
     * Generate a facet as string
     */
    generateFacetString(facetData, indent = '') {
        const type = facetData.type;

        switch (type) {
            case 'entity':
                return this.generateEntityFacetString(facetData, indent);
            case 'property':
                return this.generatePropertyFacetString(facetData, indent);
            case 'attribute':
                return this.generateAttributeFacetString(facetData, indent);
            case 'classification':
                return this.generateClassificationFacetString(facetData, indent);
            case 'material':
                return this.generateMaterialFacetString(facetData, indent);
            case 'partOf':
                return this.generatePartOfFacetString(facetData, indent);
            default:
                return '';
        }
    }

    /**
     * Generate entity facet as string
     */
    generateEntityFacetString(data, indent) {
        let xml = `${indent}<entity cardinality="required">\n`;
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
    generatePropertyFacetString(data, indent) {
        const cardinality = data.cardinality || 'required';
        let xml = `${indent}<property cardinality="${cardinality}">\n`;
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
    generateAttributeFacetString(data, indent) {
        const cardinality = data.cardinality || 'required';
        let xml = `${indent}<attribute cardinality="${cardinality}">\n`;
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
    generateClassificationFacetString(data, indent) {
        const cardinality = data.cardinality || 'required';
        let xml = `${indent}<classification cardinality="${cardinality}">\n`;
        if (data.system) {
            xml += this.addRestrictionString(data.system, 'system', indent + '  ');
        }
        if (data.value) {
            xml += this.addRestrictionString(data.value, 'value', indent + '  ');
        }
        xml += `${indent}</classification>\n`;
        return xml;
    }

    /**
     * Generate material facet as string
     */
    generateMaterialFacetString(data, indent) {
        const cardinality = data.cardinality || 'required';
        let xml = `${indent}<material cardinality="${cardinality}">\n`;
        if (data.value) {
            xml += this.addRestrictionString(data.value, 'value', indent + '  ');
        }
        xml += `${indent}</material>\n`;
        return xml;
    }

    /**
     * Generate partOf facet as string
     */
    generatePartOfFacetString(data, indent) {
        const cardinality = data.cardinality || 'required';
        let xml = `${indent}<partOf`;
        if (data.relation) {
            xml += ` relation="${this.escapeXml(data.relation)}"`;
        }
        xml += ` cardinality="${cardinality}">\n`;
        if (data.entity) {
            xml += this.addRestrictionString(data.entity, 'entity', indent + '  ');
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
        } else if (restrictionData.type === 'simpleValue') {
            xml += `${indent}  <simpleValue>${this.escapeXml(restrictionData.value)}</simpleValue>\n`;
        } else if (restrictionData.type === 'pattern') {
            xml += `${indent}  <xs:restriction base="xs:string">\n`;
            xml += `${indent}    <xs:pattern value="${this.escapeXml(restrictionData.value)}"/>\n`;
            xml += `${indent}  </xs:restriction>\n`;
        } else if (restrictionData.type === 'enumeration') {
            xml += `${indent}  <xs:restriction base="xs:string">\n`;
            for (const value of restrictionData.values) {
                xml += `${indent}    <xs:enumeration value="${this.escapeXml(value)}"/>\n`;
            }
            xml += `${indent}  </xs:restriction>\n`;
        } else if (restrictionData.type === 'bounds') {
            xml += `${indent}  <xs:restriction base="${restrictionData.base || 'xs:decimal'}">\n`;
            if (restrictionData.minInclusive !== undefined) {
                xml += `${indent}    <xs:minInclusive value="${restrictionData.minInclusive}"/>\n`;
            }
            if (restrictionData.maxInclusive !== undefined) {
                xml += `${indent}    <xs:maxInclusive value="${restrictionData.maxInclusive}"/>\n`;
            }
            if (restrictionData.minExclusive !== undefined) {
                xml += `${indent}    <xs:minExclusive value="${restrictionData.minExclusive}"/>\n`;
            }
            if (restrictionData.maxExclusive !== undefined) {
                xml += `${indent}    <xs:maxExclusive value="${restrictionData.maxExclusive}"/>\n`;
            }
            xml += `${indent}  </xs:restriction>\n`;
        }

        xml += `${indent}</${elementName}>\n`;
        return xml;
    }

    /**
     * Escape XML special characters
     */
    escapeXml(text) {
        if (!text) return '';
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
