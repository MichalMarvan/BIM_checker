/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * IDS Excel Generator
 * Generates Excel files from IDS data structure
 */

const IDSExcelGenerator = (function() {

    /**
     * Generate Excel file from IDS data
     * @param {Object} idsData - IDS data structure
     * @returns {ArrayBuffer} Excel file as ArrayBuffer
     */
    function generate(idsData) {
        // Create workbook
        const workbook = XLSX.utils.book_new();

        // Generate sheet data
        const infoData = _generateInfoSheet(idsData);
        const specificationsData = _generateSpecificationsSheet(idsData.specifications || []);
        const applicabilityData = _generateApplicabilitySheet(idsData.specifications || []);
        const requirementsData = _generateRequirementsSheet(idsData.specifications || []);
        const psetsLookupData = _generatePsetsLookupSheet(idsData.specifications || []);
        const elementPsetsData = _generateElementPsetsSheet(idsData.specifications || []);

        // Create sheets
        const infoSheet = XLSX.utils.json_to_sheet(infoData);
        const specificationsSheet = XLSX.utils.json_to_sheet(specificationsData);
        const applicabilitySheet = XLSX.utils.json_to_sheet(applicabilityData);
        const requirementsSheet = XLSX.utils.json_to_sheet(requirementsData);
        const psetsLookupSheet = XLSX.utils.json_to_sheet(psetsLookupData);
        const elementPsetsSheet = XLSX.utils.json_to_sheet(elementPsetsData);

        // Add sheets to workbook
        XLSX.utils.book_append_sheet(workbook, infoSheet, 'info');
        XLSX.utils.book_append_sheet(workbook, specificationsSheet, 'specifications');
        XLSX.utils.book_append_sheet(workbook, applicabilitySheet, 'applicability');
        XLSX.utils.book_append_sheet(workbook, requirementsSheet, 'requirements');
        XLSX.utils.book_append_sheet(workbook, psetsLookupSheet, 'psets_lookup');
        XLSX.utils.book_append_sheet(workbook, elementPsetsSheet, 'element_psets');

        // Generate buffer
        const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });

        return buffer;
    }

    /**
     * Generate info sheet data
     * @private
     */
    function _generateInfoSheet(idsData) {
        return [
            { Field: 'title', Value: idsData.title || '' },
            { Field: 'author', Value: idsData.author || '' },
            { Field: 'version', Value: idsData.version || '' },
            { Field: 'date', Value: idsData.date || '' },
            { Field: 'description', Value: idsData.description || '' },
            { Field: 'purpose', Value: idsData.purpose || '' },
            { Field: 'copyright', Value: idsData.copyright || '' },
            { Field: 'milestone', Value: idsData.milestone || '' }
        ];
    }

    /**
     * Generate specifications sheet data
     * @private
     */
    function _generateSpecificationsSheet(specifications) {
        return specifications.map((spec, index) => ({
            spec_id: spec.identifier || `SPEC_${String(index + 1).padStart(2, '0')}`,
            name: spec.name || '',
            description: spec.description || '',
            ifcVersion: Array.isArray(spec.ifcVersion)
                ? spec.ifcVersion.join(' ')
                : (spec.ifcVersion || (spec.ifcVersions || []).join(' ') || 'IFC4'),
            instructions: spec.instructions || '',
            minOccurs: spec.minOccurs ?? '',
            maxOccurs: spec.maxOccurs ?? '',
            requirements_description: spec.requirementsDescription || ''
        }));
    }

    function _json(value) {
        if (value === undefined || value === null) return '';
        if (typeof value !== 'object' || value.type === 'simple' || value.type === 'simpleValue') return '';
        return JSON.stringify(value);
    }

    function _displayValue(value) {
        if (value === undefined || value === null) return '';
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
        if (value.type === 'simple' || value.type === 'simpleValue') return value.value ?? '';
        return _extractValueInfo(value).value;
    }

    function _facetToRow(facet, specId, isRequirement) {
        const entity = facet.entity && typeof facet.entity === 'object' ? facet.entity : null;
        const row = {
            spec_id: specId,
            facet_type: facet.type || '',
            entity_name: facet.type === 'partOf'
                ? _displayValue(entity?.name || facet.entity)
                : _displayValue(facet.name),
            predefinedType: _displayValue(facet.type === 'partOf' ? entity?.predefinedType : facet.predefinedType),
            pset_name: _displayValue(facet.propertySet),
            property_name: _displayValue(facet.baseName || (facet.type === 'property' ? facet.name : null)),
            property_value: facet.type === 'property' ? _displayValue(facet.value) : '',
            attribute_name: facet.type === 'attribute' ? _displayValue(facet.name) : '',
            attribute_value: facet.type === 'attribute' ? _displayValue(facet.value) : '',
            classification_system: facet.type === 'classification' ? _displayValue(facet.system) : '',
            classification_value: facet.type === 'classification' ? _displayValue(facet.value) : '',
            material_value: facet.type === 'material' ? _displayValue(facet.value) : '',
            value_type: _extractValueInfo(facet.value).type,
            relation: facet.relation || '',
            dataType: facet.dataType || '',
            uri: isRequirement ? (facet.uri || '') : '',
            instructions: isRequirement ? (facet.instructions || '') : '',
            name_json: _json(facet.type === 'partOf' ? entity?.name : facet.name),
            predefined_type_json: _json(facet.type === 'partOf' ? entity?.predefinedType : facet.predefinedType),
            property_set_json: _json(facet.propertySet),
            base_name_json: _json(facet.baseName),
            value_json: _json(facet.value),
            system_json: _json(facet.system),
            entity_json: ''
        };
        if (isRequirement) row.cardinality = facet.type === 'entity' ? '' : (facet.cardinality || 'required');
        return row;
    }

    /**
     * Generate applicability sheet data
     * @private
     */
    function _generateApplicabilitySheet(specifications) {
        const rows = [];

        for (let index = 0; index < specifications.length; index++) {
            const spec = specifications[index];
            const specId = spec.identifier || `SPEC_${String(index + 1).padStart(2, '0')}`;

            for (const facet of (spec.applicability || [])) {
                rows.push(_facetToRow(facet, specId, false));
            }
        }

        // Ensure at least headers exist
        if (rows.length === 0) {
            rows.push(_facetToRow({}, '', false));
        }

        return rows;
    }

    /**
     * Generate requirements sheet data (all facet types)
     * @private
     */
    function _generateRequirementsSheet(specifications) {
        const rows = [];

        for (let index = 0; index < specifications.length; index++) {
            const spec = specifications[index];
            const specId = spec.identifier || `SPEC_${String(index + 1).padStart(2, '0')}`;

            for (const facet of (spec.requirements || [])) {
                rows.push(_facetToRow(facet, specId, true));
            }
        }

        if (rows.length === 0) {
            rows.push(_facetToRow({}, '', true));
        }

        return rows;
    }

    /**
     * Generate psets_lookup sheet data (deduplicated catalog)
     * @private
     */
    function _generatePsetsLookupSheet(specifications) {
        const seen = new Set();
        const rows = [];

        for (let index = 0; index < specifications.length; index++) {
            const spec = specifications[index];
            const specId = spec.identifier || `SPEC_${String(index + 1).padStart(2, '0')}`;
            for (const req of (spec.requirements || [])) {
                if (req.type !== 'property') continue;

                const psetName = req.propertySet?.value || '';
                const propName = req.baseName?.value || req.name?.value || '';
                const key = `${specId}|${psetName}|${propName}`;

                if (!psetName || !propName || seen.has(key)) continue;

                seen.add(key);

                // Determine value type and extract value
                const valueInfo = _extractValueInfo(req.value);

                rows.push({
                    spec_id: specId,
                    pset_name: psetName,
                    property_name: propName,
                    dataType: req.dataType || '',
                    value_type: valueInfo.type,
                    value: valueInfo.value,
                    uri: req.uri || ''
                });
            }
        }

        // Ensure at least headers exist
        if (rows.length === 0) {
            rows.push({ spec_id: '', pset_name: '', property_name: '', dataType: '', value_type: '', value: '', uri: '' });
        }

        return rows;
    }

    /**
     * Extract value type and string representation from IDS value object
     * @private
     */
    function _extractValueInfo(valueObj) {
        if (!valueObj) {
            return { type: '', value: '' };
        }

        // Simple value (editor format: {type: 'simple', value: 'x'} or {type: 'simpleValue', value: 'x'})
        if (valueObj.type === 'simple' || valueObj.type === 'simpleValue') {
            return { type: 'simple', value: valueObj.value || '' };
        }

        // Pattern (editor format: {type: 'pattern', value: 'regex'})
        if (valueObj.type === 'pattern') {
            return { type: 'pattern', value: valueObj.value || '' };
        }

        // Enumeration (editor format: {type: 'enumeration', values: ['a', 'b']})
        if (valueObj.type === 'enumeration') {
            const values = valueObj.values || valueObj.options || [];
            return { type: 'enumeration', value: values.join('|') };
        }

        // Bounds/Range (editor format: {type: 'bounds', minInclusive: x, maxInclusive: y})
        if (valueObj.type === 'bounds') {
            const min = valueObj.minInclusive ?? '';
            const max = valueObj.maxInclusive ?? '';
            return { type: 'range', value: `${min}..${max}` };
        }

        // Restriction (parser format: {type: 'restriction', ...})
        if (valueObj.type === 'restriction') {
            // Regex pattern
            if (valueObj.isRegex && valueObj.pattern) {
                return { type: 'pattern', value: valueObj.pattern };
            }

            // Pattern without isRegex flag
            if (valueObj.pattern) {
                return { type: 'pattern', value: valueObj.pattern };
            }

            // Enumeration (options)
            if (valueObj.options && valueObj.options.length > 0) {
                return { type: 'enumeration', value: valueObj.options.join('|') };
            }

            // Enumeration alternative format
            if (valueObj.enumeration && valueObj.enumeration.length > 0) {
                return { type: 'enumeration', value: valueObj.enumeration.join('|') };
            }

            // Range (min/max)
            if (valueObj.minInclusive !== undefined || valueObj.maxInclusive !== undefined) {
                const min = valueObj.minInclusive ?? '';
                const max = valueObj.maxInclusive ?? '';
                return { type: 'range', value: `${min}..${max}` };
            }

            // Length restriction
            if (valueObj.minLength !== undefined || valueObj.maxLength !== undefined) {
                const min = valueObj.minLength ?? '0';
                const max = valueObj.maxLength ?? '';
                return { type: 'length', value: `${min}..${max}` };
            }
        }

        // Fallback to simple value
        return { type: 'simple', value: valueObj.value || '' };
    }

    /**
     * Generate element_psets sheet data
     * @private
     */
    function _generateElementPsetsSheet(specifications) {
        const rows = [];

        for (let index = 0; index < specifications.length; index++) {
            const spec = specifications[index];
            const specId = spec.identifier || `SPEC_${String(index + 1).padStart(2, '0')}`;
            const seenPsets = new Set();

            for (const req of (spec.requirements || [])) {
                if (req.type !== 'property') continue;

                const psetName = req.propertySet?.value || '';
                if (!psetName || seenPsets.has(psetName)) continue;

                seenPsets.add(psetName);
                rows.push({
                    spec_id: specId,
                    pset_name: psetName,
                    cardinality: req.cardinality || 'required',
                    value_override: ''
                });
            }
        }

        // Ensure at least headers exist
        if (rows.length === 0) {
            rows.push({ spec_id: '', pset_name: '', cardinality: '', value_override: '' });
        }

        return rows;
    }

    /**
     * Download Excel file
     * @param {Object} idsData - IDS data structure
     * @param {string} filename - Filename without extension
     */
    function download(idsData, filename) {
        const buffer = generate(idsData);
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename || 'ids-export'}.xlsx`;
        link.click();

        URL.revokeObjectURL(url);
    }

    // Public API
    return {
        generate,
        download,
        // Expose private methods for testing
        _generateInfoSheet,
        _generateSpecificationsSheet,
        _generateApplicabilitySheet,
        _generateRequirementsSheet,
        _generatePsetsLookupSheet,
        _generateElementPsetsSheet
    };
})();

// Export for browser
if (typeof window !== 'undefined') {
    window.IDSExcelGenerator = IDSExcelGenerator;
}
