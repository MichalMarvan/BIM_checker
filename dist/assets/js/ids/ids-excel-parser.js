/**
 * IDS Excel Parser
 * Parses Excel files into IDS data structure
 */

const IDSExcelParser = (function() {

    // Required sheets that must be present
    const REQUIRED_SHEETS = ['info', 'specifications'];

    // All recognized sheets
    const ALL_SHEETS = ['info', 'specifications', 'applicability', 'psets_lookup', 'element_psets'];

    /**
     * Parse Excel file buffer to IDS data
     * @param {ArrayBuffer} buffer - Excel file as ArrayBuffer
     * @returns {Object} { data: IDS data, warnings: array of warnings }
     */
    function parse(buffer) {
        const warnings = [];

        // Read workbook
        const workbook = XLSX.read(buffer, { type: 'array' });

        // Validate required sheets
        for (const sheet of REQUIRED_SHEETS) {
            if (!workbook.SheetNames.includes(sheet)) {
                throw new Error(`Missing required sheet: ${sheet}`);
            }
        }

        // Parse each sheet
        const infoData = _sheetToJson(workbook, 'info');
        const specificationsData = _sheetToJson(workbook, 'specifications');
        const applicabilityData = _sheetToJson(workbook, 'applicability');
        const psetsLookupData = _sheetToJson(workbook, 'psets_lookup');
        const elementPsetsData = _sheetToJson(workbook, 'element_psets');

        // Convert to IDS structure
        const info = _parseInfoSheet(infoData);
        const specifications = _parseSpecificationsSheet(specificationsData);

        // Add applicability to specifications
        _addApplicabilityToSpecs(specifications, applicabilityData, warnings);

        // Add requirements to specifications
        _addRequirementsToSpecs(specifications, psetsLookupData, elementPsetsData, warnings);

        // Build final IDS data
        const idsData = {
            title: info.title || 'Untitled',
            copyright: info.copyright || '',
            version: info.version || '1.0',
            description: info.description || '',
            author: info.author || '',
            date: info.date || new Date().toISOString().split('T')[0],
            purpose: info.purpose || '',
            milestone: info.milestone || '',
            specifications: specifications.map(spec => ({
                name: spec.name,
                ifcVersion: spec.ifcVersion || 'IFC4',
                identifier: spec.spec_id || '',
                description: spec.description || '',
                instructions: spec.instructions || '',
                minOccurs: '1',
                maxOccurs: 'unbounded',
                cardinality: 'required',
                applicability: spec.applicability || [],
                requirements: spec.requirements || []
            }))
        };

        return { data: idsData, warnings };
    }

    /**
     * Convert sheet to JSON array
     * @private
     */
    function _sheetToJson(workbook, sheetName) {
        if (!workbook.SheetNames.includes(sheetName)) {
            return [];
        }
        const sheet = workbook.Sheets[sheetName];
        return XLSX.utils.sheet_to_json(sheet, { defval: '' });
    }

    /**
     * Parse info sheet to metadata object
     * @private
     */
    function _parseInfoSheet(data) {
        const info = {
            title: '',
            author: '',
            version: '',
            date: '',
            description: '',
            purpose: '',
            copyright: '',
            milestone: ''
        };

        for (const row of data) {
            const field = (row.Field || row.field || '').toLowerCase().trim();
            const value = row.Value || row.value || '';

            if (field && info.hasOwnProperty(field)) {
                info[field] = value;
            }
        }

        return info;
    }

    /**
     * Parse specifications sheet
     * @private
     */
    function _parseSpecificationsSheet(data) {
        return data
            .filter(row => row.spec_id && String(row.spec_id).trim())
            .map(row => ({
                spec_id: String(row.spec_id).trim(),
                name: row.name || '',
                description: row.description || '',
                ifcVersion: row.ifcVersion || row.ifc_version || 'IFC4',
                instructions: row.instructions || '',
                applicability: [],
                requirements: []
            }));
    }

    /**
     * Add applicability facets to specifications
     * @private
     */
    function _addApplicabilityToSpecs(specifications, applicabilityData, warnings) {
        const specMap = new Map(specifications.map(s => [s.spec_id, s]));

        for (let i = 0; i < applicabilityData.length; i++) {
            const row = applicabilityData[i];
            const specId = String(row.spec_id || '').trim();

            if (!specId) continue;

            if (!specMap.has(specId)) {
                warnings.push(`Row ${i + 2} in applicability: Unknown spec_id '${specId}' - skipped`);
                continue;
            }

            const facetType = (row.facet_type || 'entity').toLowerCase();
            const spec = specMap.get(specId);

            if (facetType === 'entity') {
                if (row.entity_name) {
                    spec.applicability.push({
                        type: 'entity',
                        name: { type: 'simple', value: row.entity_name },
                        predefinedType: row.predefinedType ? { type: 'simple', value: row.predefinedType } : null
                    });
                }
            } else if (facetType === 'property') {
                if (row.pset_name && row.property_name) {
                    spec.applicability.push({
                        type: 'property',
                        propertySet: { type: 'simple', value: row.pset_name },
                        baseName: { type: 'simple', value: row.property_name },
                        value: row.property_value ? { type: 'simple', value: row.property_value } : null
                    });
                }
            } else if (facetType === 'attribute') {
                if (row.attribute_name) {
                    spec.applicability.push({
                        type: 'attribute',
                        name: { type: 'simple', value: row.attribute_name },
                        value: row.attribute_value ? { type: 'simple', value: row.attribute_value } : null
                    });
                }
            }
        }
    }

    /**
     * Add requirements to specifications from psets_lookup + element_psets
     * @private
     */
    function _addRequirementsToSpecs(specifications, psetsLookupData, elementPsetsData, warnings) {
        const specMap = new Map(specifications.map(s => [s.spec_id, s]));

        // Build pset catalog: pset_name -> [properties]
        const psetCatalog = new Map();
        for (const row of psetsLookupData) {
            const psetName = String(row.pset_name || '').trim();
            const propName = String(row.property_name || '').trim();

            if (!psetName || !propName) continue;

            if (!psetCatalog.has(psetName)) {
                psetCatalog.set(psetName, []);
            }
            psetCatalog.get(psetName).push({
                name: propName,
                dataType: row.dataType || row.data_type || '',
                valueType: row.value_type || 'simple',
                value: row.value || ''
            });
        }

        // Map element_psets to specifications
        for (let i = 0; i < elementPsetsData.length; i++) {
            const row = elementPsetsData[i];
            const specId = String(row.spec_id || '').trim();
            const psetName = String(row.pset_name || '').trim();

            if (!specId || !psetName) continue;

            if (!specMap.has(specId)) {
                warnings.push(`Row ${i + 2} in element_psets: Unknown spec_id '${specId}' - skipped`);
                continue;
            }

            if (!psetCatalog.has(psetName)) {
                warnings.push(`Row ${i + 2} in element_psets: Property set '${psetName}' not found in catalog - skipped`);
                continue;
            }

            const spec = specMap.get(specId);
            const properties = psetCatalog.get(psetName);
            const valueOverride = row.value_override || '';
            const cardinality = row.cardinality || 'required';

            // Add each property as a requirement
            for (const prop of properties) {
                const valueStr = valueOverride || prop.value;
                const valueType = valueOverride ? 'simple' : prop.valueType;

                spec.requirements.push({
                    type: 'property',
                    propertySet: { type: 'simple', value: psetName },
                    baseName: { type: 'simple', value: prop.name },
                    value: _parseValueFromExcel(valueStr, valueType),
                    dataType: prop.dataType || null,
                    cardinality: cardinality
                });
            }
        }
    }

    /**
     * Parse value from Excel format back to IDS value object
     * @private
     */
    function _parseValueFromExcel(valueStr, valueType) {
        if (!valueStr) {
            return null;
        }

        switch (valueType) {
            case 'pattern':
                return {
                    type: 'restriction',
                    pattern: valueStr,
                    isRegex: true
                };

            case 'enumeration':
                return {
                    type: 'restriction',
                    options: valueStr.split('|').map(s => s.trim()).filter(s => s)
                };

            case 'range': {
                const parts = valueStr.split('..');
                const result = { type: 'restriction' };
                if (parts[0]) {
                    result.minInclusive = parts[0];
                }
                if (parts[1]) {
                    result.maxInclusive = parts[1];
                }
                return result;
            }

            case 'length': {
                const parts = valueStr.split('..');
                const result = { type: 'restriction' };
                if (parts[0]) {
                    result.minLength = parts[0];
                }
                if (parts[1]) {
                    result.maxLength = parts[1];
                }
                return result;
            }

            case 'simple':
            default:
                return { type: 'simple', value: valueStr };
        }
    }

    // Public API
    return {
        REQUIRED_SHEETS,
        ALL_SHEETS,
        parse,
        // Expose private methods for testing
        _parseInfoSheet,
        _parseSpecificationsSheet,
        _addApplicabilityToSpecs,
        _addRequirementsToSpecs
    };
})();

// Export for browser
if (typeof window !== 'undefined') {
    window.IDSExcelParser = IDSExcelParser;
}
