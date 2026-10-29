/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * IDS Excel Parser
 * Parses Excel files into IDS data structure
 */

const IDSExcelParser = (function() {

    // Required sheets that must be present
    const REQUIRED_SHEETS = ['info', 'specifications'];

    // All recognized sheets
    const ALL_SHEETS = ['info', 'specifications', 'applicability', 'requirements', 'psets_lookup', 'element_psets'];

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
        const requirementsData = _sheetToJson(workbook, 'requirements');
        const psetsLookupData = _sheetToJson(workbook, 'psets_lookup');
        const elementPsetsData = _sheetToJson(workbook, 'element_psets');

        const format = IDSExcelFormat.inspect(infoData);
        if (format.marked && format.id !== IDSExcelFormat.ID) {
            throw _fatal(`Unsupported Excel format '${format.id}'`, 'EXCEL_FORMAT_UNSUPPORTED');
        }
        if (format.version === null || format.version < IDSExcelFormat.LEGACY_VERSION) {
            throw _fatal('Invalid IDS Excel format version', 'EXCEL_FORMAT_VERSION_INVALID');
        }
        if (format.version > IDSExcelFormat.CURRENT_VERSION) {
            throw _fatal(
                `This workbook uses newer IDS Excel format ${format.version}; this version supports up to ${IDSExcelFormat.CURRENT_VERSION}`,
                'EXCEL_FORMAT_TOO_NEW'
            );
        }
        if (!format.marked) {
            warnings.push('Legacy unversioned workbook imported as format 1');
        } else if (format.version < IDSExcelFormat.CURRENT_VERSION) {
            warnings.push(`Workbook format ${format.version} migrated to ${IDSExcelFormat.CURRENT_VERSION} during import`);
        }
        const unknownSheets = workbook.SheetNames.filter(name => !ALL_SHEETS.includes(name));
        if (unknownSheets.length) {
            warnings.push(`Unknown sheets were ignored: ${unknownSheets.join(', ')}`);
        }

        // Convert to IDS structure
        const info = _parseInfoSheet(infoData);
        const specifications = _parseSpecificationsSheet(specificationsData);
        const seenSpecIds = new Set();
        for (const specification of specifications) {
            if (seenSpecIds.has(specification.spec_id)) {
                throw new Error(`Duplicate spec_id: ${specification.spec_id}`);
            }
            seenSpecIds.add(specification.spec_id);
        }

        // Add applicability to specifications
        _addApplicabilityToSpecs(specifications, applicabilityData, warnings);

        // Add requirements from requirements sheet (all facet types)
        _addRequirementsFromSheet(specifications, requirementsData, warnings);

        // Add requirements from legacy psets_lookup + element_psets (property-only)
        _addRequirementsToSpecs(specifications, psetsLookupData, elementPsetsData, warnings);

        // Build final IDS data
        const idsData = {
            title: info.title || 'Untitled',
            copyright: info.copyright || '',
            version: info.version || '1.0',
            description: info.description || '',
            author: info.author || '',
            date: _normaliseDate(info.date) || new Date().toISOString().split('T')[0],
            purpose: info.purpose || '',
            milestone: info.milestone || '',
            specifications: specifications.map(spec => ({
                name: spec.name,
                ifcVersion: spec.ifcVersion || 'IFC4',
                ifcVersions: (spec.ifcVersion || 'IFC4').trim().split(/\s+/).filter(Boolean),
                identifier: spec.spec_id || '',
                description: spec.description || '',
                instructions: spec.instructions || '',
                minOccurs: spec.minOccurs,
                maxOccurs: spec.maxOccurs,
                requirementsDescription: spec.requirementsDescription || '',
                applicability: spec.applicability || [],
                requirements: spec.requirements || []
            }))
        };

        const importedFacets = idsData.specifications.reduce((summary, specification) => {
            summary.applicability += specification.applicability.length;
            summary.requirements += specification.requirements.length;
            return summary;
        }, { applicability: 0, requirements: 0 });
        const report = {
            status: warnings.length ? 'warning' : 'ok',
            sourceFormatVersion: format.version,
            targetFormatVersion: IDSExcelFormat.CURRENT_VERSION,
            migrated: !format.marked || format.version < IDSExcelFormat.CURRENT_VERSION,
            idsSchemaVersion: format.idsSchemaVersion || IDSExcelFormat.IDS_SCHEMA_VERSION,
            unknownSheets,
            rows: {
                info: infoData.length,
                specifications: specificationsData.length,
                applicability: applicabilityData.length,
                requirements: requirementsData.length,
                psets_lookup: psetsLookupData.length,
                element_psets: elementPsetsData.length
            },
            imported: {
                specifications: idsData.specifications.length,
                ...importedFacets
            },
            skippedRows: warnings.filter(warning => /\bskipped\b/i.test(warning)).length
        };

        return { data: idsData, warnings, report };
    }

    /**
     * Create an auditable report for one parsed workbook and validate its IDS XML.
     * @param {{data: Object, warnings: string[], report: Object}} result
     * @param {{name: string, size: number, lastModified?: number}} file
     * @returns {Promise<Object>}
     */
    async function createImportReport(result, file) {
        const xsd = {
            available: typeof IDSXMLGenerator !== 'undefined'
                && Boolean(window.IDSXSDValidator)
                && typeof window.IDSXSDValidator.validate === 'function',
            checked: false,
            valid: null,
            errorCount: 0,
            errors: [],
            runtimeError: null
        };
        if (xsd.available) {
            try {
                const xml = new IDSXMLGenerator().generateIDS(result.data);
                const validation = await window.IDSXSDValidator.validate(xml);
                xsd.checked = true;
                xsd.valid = validation.valid;
                xsd.errors = validation.errors || [];
                xsd.errorCount = xsd.errors.length;
            } catch (error) {
                xsd.runtimeError = error.message;
                xsd.errors = [{ line: null, column: null, severity: 'error', message: error.message }];
                xsd.errorCount = 1;
            }
        }

        return {
            ...result.report,
            format: 'BIM_CHECKER_IDS_EXCEL_IMPORT_REPORT',
            formatVersion: 1,
            importedAt: new Date().toISOString(),
            source: {
                name: file.name,
                size: file.size,
                lastModified: file.lastModified || null
            },
            status: xsd.runtimeError
                ? 'validation-error'
                : (xsd.checked && !xsd.valid ? 'invalid' : result.report.status),
            warnings: [...result.warnings],
            xsd
        };
    }

    function _fatal(message, code) {
        const error = new Error(message);
        error.code = code;
        error.fatal = true;
        return error;
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
            .map(row => {
                const ifcVersion = String(row.ifcVersion || row.ifc_version || 'IFC4').trim();
                return {
                    spec_id: String(row.spec_id).trim(),
                    name: row.name || '',
                    description: row.description || '',
                    ifcVersion,
                    ifcVersions: ifcVersion.split(/\s+/).filter(Boolean),
                    instructions: row.instructions || '',
                    minOccurs: _optionalString(row.minOccurs ?? row.min_occurs),
                    maxOccurs: _optionalString(row.maxOccurs ?? row.max_occurs),
                    requirementsDescription: row.requirements_description || row.requirementsDescription || '',
                    applicability: [],
                    requirements: []
                };
            });
    }

    function _optionalString(value) {
        return value === undefined || value === null || value === '' ? undefined : String(value).trim();
    }

    function _normaliseDate(value) {
        if (!value) {
            return '';
        }
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return value.toISOString().slice(0, 10);
        }
        if (typeof value === 'number' && typeof XLSX !== 'undefined' && XLSX.SSF?.parse_date_code) {
            const date = XLSX.SSF.parse_date_code(value);
            if (date) {
                return `${String(date.y).padStart(4, '0')}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
            }
        }
        return String(value).trim();
    }

    function _parseJsonValue(row, column, warnings, context) {
        const raw = row[column];
        if (raw === undefined || raw === null || raw === '') {
            return undefined;
        }
        try {
            return typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch {
            warnings.push(`${context}: Invalid JSON in '${column}' - readable columns were used instead`);
            return undefined;
        }
    }

    function _simpleValue(value) {
        if (value === undefined || value === null || value === '') {
            return null;
        }
        return { type: 'simple', value: String(value) };
    }

    function _readValue(row, jsonColumn, legacyValue, legacyType, warnings, context) {
        const exact = _parseJsonValue(row, jsonColumn, warnings, context);
        if (exact !== undefined) {
            return exact;
        }
        return _parseValueFromExcel(legacyValue, legacyType || 'simple');
    }

    function _valueText(value) {
        if (typeof value === 'string') {
            return value;
        }
        if (value?.type === 'simple' || value?.type === 'simpleValue') {
            return String(value.value ?? '');
        }
        return '';
    }

    function _parseFacetRow(row, facetType, isRequirement, warnings, context) {
        let facet;
        if (facetType === 'entity') {
            facet = {
                type: 'entity',
                name: _readValue(row, 'name_json', row.entity_name, 'simple', warnings, context),
                predefinedType: _readValue(row, 'predefined_type_json', row.predefinedType || row.predefined_type, 'simple', warnings, context)
            };
        } else if (facetType === 'partof' || facetType === 'part_of') {
            let entity = _parseJsonValue(row, 'entity_json', warnings, context);
            if (typeof entity === 'string') {
                entity = { type: 'entity', name: _simpleValue(entity) };
            }
            if (!entity) {
                entity = {
                    type: 'entity',
                    name: _readValue(row, 'name_json', row.entity_name, 'simple', warnings, context),
                    predefinedType: _readValue(row, 'predefined_type_json', row.predefinedType || row.predefined_type, 'simple', warnings, context)
                };
            }
            facet = { type: 'partOf', entity, relation: String(row.relation || '').trim() };
        } else if (facetType === 'property') {
            facet = {
                type: 'property',
                propertySet: _readValue(row, 'property_set_json', row.pset_name, 'simple', warnings, context),
                baseName: _readValue(row, 'base_name_json', row.property_name, 'simple', warnings, context),
                value: _readValue(row, 'value_json', row.property_value, row.value_type || 'simple', warnings, context),
                dataType: row.dataType || row.data_type || undefined
            };
        } else if (facetType === 'attribute') {
            facet = {
                type: 'attribute',
                name: _readValue(row, 'name_json', row.attribute_name, 'simple', warnings, context),
                value: _readValue(row, 'value_json', row.attribute_value, row.value_type || 'simple', warnings, context)
            };
        } else if (facetType === 'classification') {
            facet = {
                type: 'classification',
                system: _readValue(row, 'system_json', row.classification_system, 'simple', warnings, context),
                value: _readValue(row, 'value_json', row.classification_value, row.value_type || 'simple', warnings, context)
            };
        } else if (facetType === 'material') {
            facet = {
                type: 'material',
                value: _readValue(row, 'value_json', row.material_value, row.value_type || 'simple', warnings, context)
            };
        } else {
            warnings.push(`${context}: Unknown facet_type '${facetType}' - skipped`);
            return null;
        }

        const requiredValue = facet.type === 'partOf' ? facet.entity?.name
            : facet.type === 'property' ? facet.propertySet && facet.baseName
                : facet.type === 'classification' ? facet.system
                    : facet.type === 'material' ? true : facet.name;
        if (!requiredValue) {
            warnings.push(`${context}: Required ${facet.type} value is missing - skipped`);
            return null;
        }

        if (isRequirement && facet.type !== 'entity') {
            let cardinality = String(row.cardinality || 'required').toLowerCase();
            const allowed = facet.type === 'partOf'
                ? ['required', 'prohibited']
                : ['required', 'optional', 'prohibited'];
            if (!allowed.includes(cardinality)) {
                warnings.push(`${context}: Invalid cardinality '${cardinality}' changed to 'required'`);
                cardinality = 'required';
            }
            facet.cardinality = cardinality;
        }
        if (isRequirement && row.instructions) {
            facet.instructions = String(row.instructions);
        }
        if (isRequirement && row.uri && ['property', 'classification', 'material'].includes(facet.type)) {
            facet.uri = String(row.uri);
        }
        return facet;
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

            if (!specId) {
                continue;
            }

            if (!specMap.has(specId)) {
                warnings.push(`Row ${i + 2} in applicability: Unknown spec_id '${specId}' - skipped`);
                continue;
            }

            const facetType = (row.facet_type || 'entity').toLowerCase();
            const spec = specMap.get(specId);

            const facet = _parseFacetRow(row, facetType, false, warnings, `Row ${i + 2} in applicability`);
            if (facet) {
                spec.applicability.push(facet);
            }
        }
    }

    /**
     * Add requirements from the requirements sheet (all facet types)
     * @private
     */
    function _addRequirementsFromSheet(specifications, requirementsData, warnings) {
        if (!requirementsData || requirementsData.length === 0) {
            return;
        }

        const specMap = new Map(specifications.map(s => [s.spec_id, s]));

        for (let i = 0; i < requirementsData.length; i++) {
            const row = requirementsData[i];
            const specId = String(row.spec_id || '').trim();

            if (!specId) {
                continue;
            }

            if (!specMap.has(specId)) {
                warnings.push(`Row ${i + 2} in requirements: Unknown spec_id '${specId}' - skipped`);
                continue;
            }

            const spec = specMap.get(specId);
            const facetType = (row.facet_type || '').toLowerCase();
            const facet = _parseFacetRow(row, facetType, true, warnings, `Row ${i + 2} in requirements`);
            if (facet) {
                spec.requirements.push(facet);
            }
        }
    }

    /**
     * Add requirements to specifications from psets_lookup + element_psets (legacy)
     * @private
     */
    function _addRequirementsToSpecs(specifications, psetsLookupData, elementPsetsData, warnings) {
        const specMap = new Map(specifications.map(s => [s.spec_id, s]));

        // Build pset catalog. New workbooks scope entries by spec_id; old global
        // catalogs are still accepted for backwards compatibility.
        const psetCatalog = new Map();
        for (const row of psetsLookupData) {
            const psetName = String(row.pset_name || '').trim();
            const propName = String(row.property_name || '').trim();

            if (!psetName || !propName) {
                continue;
            }

            const catalogSpecId = String(row.spec_id || '').trim();
            const key = `${catalogSpecId}|${psetName}`;
            if (!psetCatalog.has(key)) {
                psetCatalog.set(key, []);
            }
            psetCatalog.get(key).push({
                name: propName,
                dataType: row.dataType || row.data_type || '',
                valueType: row.value_type || 'simple',
                value: row.value || '',
                uri: row.uri || ''
            });
        }

        // Map element_psets to specifications
        for (let i = 0; i < elementPsetsData.length; i++) {
            const row = elementPsetsData[i];
            const specId = String(row.spec_id || '').trim();
            const psetName = String(row.pset_name || '').trim();

            if (!specId || !psetName) {
                continue;
            }

            if (!specMap.has(specId)) {
                warnings.push(`Row ${i + 2} in element_psets: Unknown spec_id '${specId}' - skipped`);
                continue;
            }

            const catalogKey = psetCatalog.has(`${specId}|${psetName}`)
                ? `${specId}|${psetName}`
                : `|${psetName}`;
            if (!psetCatalog.has(catalogKey)) {
                warnings.push(`Row ${i + 2} in element_psets: Property set '${psetName}' not found in catalog - skipped`);
                continue;
            }

            const spec = specMap.get(specId);
            const hasDirectProperties = spec.requirements.some(requirement =>
                requirement.type === 'property' && _valueText(requirement.propertySet) === psetName
            );
            if (hasDirectProperties) {
                continue;
            }

            const properties = psetCatalog.get(catalogKey);
            const valueOverride = row.value_override || '';
            // Validate/normalize like the facet path so invalid values surface as an
            // import warning here instead of an export-time throw in the XML generator.
            let cardinality = String(row.cardinality || 'required').toLowerCase();
            if (!['required', 'optional', 'prohibited'].includes(cardinality)) {
                warnings.push(`Row ${i + 2} in element_psets: Invalid cardinality '${cardinality}' changed to 'required'`);
                cardinality = 'required';
            }

            // Add each property as a requirement
            for (const prop of properties) {
                const valueStr = valueOverride || prop.value;
                const valueType = valueOverride ? 'simple' : prop.valueType;

                let dataType = prop.dataType ? String(prop.dataType).toUpperCase() : null;
                if (dataType && !/^[A-Z0-9]+$/.test(dataType)) {
                    warnings.push(`Row ${i + 2} in element_psets: Invalid dataType '${prop.dataType}' for '${prop.name}' - dropped`);
                    dataType = null;
                }

                const reqFacet = {
                    type: 'property',
                    propertySet: { type: 'simple', value: psetName },
                    baseName: { type: 'simple', value: prop.name },
                    value: _parseValueFromExcel(valueStr, valueType),
                    dataType: dataType,
                    cardinality: cardinality
                };
                if (prop.uri) {
                    reqFacet.uri = prop.uri;
                }
                spec.requirements.push(reqFacet);
            }
        }
    }

    /**
     * Parse value from Excel format back to IDS value object
     * @private
     */
    function _parseValueFromExcel(valueStr, valueType) {
        if (valueStr === undefined || valueStr === null || valueStr === '') {
            return null;
        }

        const stringValue = String(valueStr);

        switch (valueType) {
            case 'pattern':
                return {
                    type: 'restriction',
                    base: 'xs:string',
                    pattern: stringValue,
                    patterns: [stringValue],
                    facets: [{ type: 'pattern', value: stringValue }],
                    isRegex: true
                };

            case 'enumeration': {
                const values = stringValue.split('|').map(s => s.trim()).filter(s => s);
                return {
                    type: 'enumeration',
                    base: 'xs:string',
                    values,
                    facets: values.map(value => ({ type: 'enumeration', value }))
                };
            }

            case 'range': {
                const parts = stringValue.split('..');
                const result = { type: 'restriction', base: 'xs:decimal', facets: [] };
                if (parts[0]) {
                    result.minInclusive = parts[0];
                    result.facets.push({ type: 'minInclusive', value: parts[0] });
                }
                if (parts[1]) {
                    result.maxInclusive = parts[1];
                    result.facets.push({ type: 'maxInclusive', value: parts[1] });
                }
                return result;
            }

            case 'length': {
                const parts = stringValue.split('..');
                const result = { type: 'restriction', base: 'xs:string', facets: [] };
                if (parts[0]) {
                    result.minLength = parts[0];
                    result.facets.push({ type: 'minLength', value: parts[0] });
                }
                if (parts[1]) {
                    result.maxLength = parts[1];
                    result.facets.push({ type: 'maxLength', value: parts[1] });
                }
                return result;
            }

            case 'simple':
            default:
                return { type: 'simple', value: stringValue };
        }
    }

    // Public API
    return {
        FORMAT_VERSION: IDSExcelFormat.CURRENT_VERSION,
        REQUIRED_SHEETS,
        ALL_SHEETS,
        parse,
        createImportReport,
        // Expose private methods for testing
        _parseInfoSheet,
        _parseSpecificationsSheet,
        _addApplicabilityToSpecs,
        _addRequirementsFromSheet,
        _addRequirementsToSpecs
    };
})();

// Export for browser
if (typeof window !== 'undefined') {
    window.IDSExcelParser = IDSExcelParser;
}
