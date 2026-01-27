# IDS Excel Import/Export - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Excel import/export functionality to the IDS editor for easier specification creation.

**Architecture:** Excel files with 5 sheets (info, specifications, applicability, psets_lookup, element_psets) are parsed via SheetJS and converted to IDS data structure. Bidirectional conversion allows export back to Excel.

**Tech Stack:** SheetJS (xlsx.full.min.js - already in project), Vanilla JavaScript

**Test command:** `npm test`

**Design document:** `docs/plans/2026-01-26-ids-excel-import-design.md`

---

## Fáze 1: Excel Parser

---

### Task 1.1: Excel Parser - Sheet Reading

**Files:**
- Create: `assets/js/ids/ids-excel-parser.js`
- Test: `tests/test-suites/ids-excel-parser.test.js`

**Step 1: Write the test file**

Create `tests/test-suites/ids-excel-parser.test.js`:
```javascript
// =======================
// IDS EXCEL PARSER TESTS
// =======================

describe('IDS Excel Parser', () => {

    describe('Sheet Reading', () => {

        it('should be defined', () => {
            expect(IDSExcelParser).toBeDefined();
        });

        it('should have parse method', () => {
            expect(typeof IDSExcelParser.parse).toBe('function');
        });

        it('should have required sheet names constant', () => {
            expect(IDSExcelParser.REQUIRED_SHEETS).toContain('info');
            expect(IDSExcelParser.REQUIRED_SHEETS).toContain('specifications');
        });

        it('should have all sheet names constant', () => {
            expect(IDSExcelParser.ALL_SHEETS).toContain('info');
            expect(IDSExcelParser.ALL_SHEETS).toContain('specifications');
            expect(IDSExcelParser.ALL_SHEETS).toContain('applicability');
            expect(IDSExcelParser.ALL_SHEETS).toContain('psets_lookup');
            expect(IDSExcelParser.ALL_SHEETS).toContain('element_psets');
        });

    });

    describe('Info Sheet Parsing', () => {

        it('should parse info sheet to metadata', () => {
            const mockInfoData = [
                { Field: 'title', Value: 'Test IDS' },
                { Field: 'author', Value: 'John Doe' },
                { Field: 'version', Value: '1.0' },
                { Field: 'date', Value: '2026-01-26' },
                { Field: 'description', Value: 'Test description' }
            ];

            const result = IDSExcelParser._parseInfoSheet(mockInfoData);

            expect(result.title).toBe('Test IDS');
            expect(result.author).toBe('John Doe');
            expect(result.version).toBe('1.0');
        });

        it('should handle missing optional fields', () => {
            const mockInfoData = [
                { Field: 'title', Value: 'Test IDS' }
            ];

            const result = IDSExcelParser._parseInfoSheet(mockInfoData);

            expect(result.title).toBe('Test IDS');
            expect(result.author).toBe('');
            expect(result.version).toBe('');
        });

    });

    describe('Specifications Sheet Parsing', () => {

        it('should parse specifications to array', () => {
            const mockSpecData = [
                { spec_id: 'SPEC_01', name: 'Wall Check', description: 'Check walls', ifcVersion: 'IFC4' },
                { spec_id: 'SPEC_02', name: 'Door Check', description: 'Check doors', ifcVersion: 'IFC4' }
            ];

            const result = IDSExcelParser._parseSpecificationsSheet(mockSpecData);

            expect(result.length).toBe(2);
            expect(result[0].spec_id).toBe('SPEC_01');
            expect(result[0].name).toBe('Wall Check');
        });

        it('should skip rows without spec_id', () => {
            const mockSpecData = [
                { spec_id: 'SPEC_01', name: 'Wall Check' },
                { spec_id: '', name: 'Empty' },
                { name: 'No ID' }
            ];

            const result = IDSExcelParser._parseSpecificationsSheet(mockSpecData);

            expect(result.length).toBe(1);
        });

    });

});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - "IDSExcelParser is not defined"

**Step 3: Write the implementation**

Create `assets/js/ids/ids-excel-parser.js`:
```javascript
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
                        name: { type: 'simple', value: row.property_name },
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

            // Add each property as a requirement
            for (const prop of properties) {
                const value = valueOverride || prop.value;

                spec.requirements.push({
                    type: 'property',
                    propertySet: { type: 'simple', value: psetName },
                    name: { type: 'simple', value: prop.name },
                    value: value ? { type: 'simple', value: value } : null,
                    dataType: prop.dataType || null
                });
            }
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
```

**Step 4: Add script to test runner HTML**

Modify `tests/test-runner.html` - add before the closing `</body>`:
```html
<script src="../assets/js/vendor/xlsx.full.min.js"></script>
<script src="../assets/js/ids/ids-excel-parser.js"></script>
<script src="test-suites/ids-excel-parser.test.js"></script>
```

**Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS - all Excel parser tests green

**Step 6: Commit**

```bash
git add assets/js/ids/ids-excel-parser.js tests/test-suites/ids-excel-parser.test.js tests/test-runner.html
git commit -m "feat: add IDSExcelParser for Excel to IDS conversion"
```

---

### Task 1.2: Excel Parser - Complete Test Coverage

**Files:**
- Modify: `tests/test-suites/ids-excel-parser.test.js`

**Step 1: Add more tests for applicability and requirements parsing**

Add to `tests/test-suites/ids-excel-parser.test.js`:
```javascript
    describe('Applicability Parsing', () => {

        it('should add entity facet to specification', () => {
            const specs = [{ spec_id: 'SPEC_01', applicability: [], requirements: [] }];
            const applicabilityData = [
                { spec_id: 'SPEC_01', facet_type: 'entity', entity_name: 'IFCWALL' }
            ];
            const warnings = [];

            IDSExcelParser._addApplicabilityToSpecs(specs, applicabilityData, warnings);

            expect(specs[0].applicability.length).toBe(1);
            expect(specs[0].applicability[0].type).toBe('entity');
            expect(specs[0].applicability[0].name.value).toBe('IFCWALL');
        });

        it('should warn on unknown spec_id', () => {
            const specs = [{ spec_id: 'SPEC_01', applicability: [], requirements: [] }];
            const applicabilityData = [
                { spec_id: 'SPEC_99', facet_type: 'entity', entity_name: 'IFCWALL' }
            ];
            const warnings = [];

            IDSExcelParser._addApplicabilityToSpecs(specs, applicabilityData, warnings);

            expect(warnings.length).toBe(1);
            expect(warnings[0]).toContain('SPEC_99');
        });

        it('should parse property facet', () => {
            const specs = [{ spec_id: 'SPEC_01', applicability: [], requirements: [] }];
            const applicabilityData = [
                { spec_id: 'SPEC_01', facet_type: 'property', pset_name: 'Pset_WallCommon', property_name: 'IsExternal', property_value: 'true' }
            ];
            const warnings = [];

            IDSExcelParser._addApplicabilityToSpecs(specs, applicabilityData, warnings);

            expect(specs[0].applicability[0].type).toBe('property');
            expect(specs[0].applicability[0].propertySet.value).toBe('Pset_WallCommon');
        });

    });

    describe('Requirements Parsing', () => {

        it('should add requirements from psets_lookup and element_psets', () => {
            const specs = [{ spec_id: 'SPEC_01', applicability: [], requirements: [] }];
            const psetsLookup = [
                { pset_name: 'Pset_WallCommon', property_name: 'IsExternal', dataType: 'boolean' },
                { pset_name: 'Pset_WallCommon', property_name: 'FireRating', dataType: 'string' }
            ];
            const elementPsets = [
                { spec_id: 'SPEC_01', pset_name: 'Pset_WallCommon', cardinality: 'required' }
            ];
            const warnings = [];

            IDSExcelParser._addRequirementsToSpecs(specs, psetsLookup, elementPsets, warnings);

            expect(specs[0].requirements.length).toBe(2);
            expect(specs[0].requirements[0].name.value).toBe('IsExternal');
            expect(specs[0].requirements[1].name.value).toBe('FireRating');
        });

        it('should apply value_override', () => {
            const specs = [{ spec_id: 'SPEC_01', applicability: [], requirements: [] }];
            const psetsLookup = [
                { pset_name: 'Pset_WallCommon', property_name: 'IsExternal', value: '' }
            ];
            const elementPsets = [
                { spec_id: 'SPEC_01', pset_name: 'Pset_WallCommon', value_override: 'true' }
            ];
            const warnings = [];

            IDSExcelParser._addRequirementsToSpecs(specs, psetsLookup, elementPsets, warnings);

            expect(specs[0].requirements[0].value.value).toBe('true');
        });

        it('should warn on unknown pset', () => {
            const specs = [{ spec_id: 'SPEC_01', applicability: [], requirements: [] }];
            const psetsLookup = [];
            const elementPsets = [
                { spec_id: 'SPEC_01', pset_name: 'Unknown_Pset' }
            ];
            const warnings = [];

            IDSExcelParser._addRequirementsToSpecs(specs, psetsLookup, elementPsets, warnings);

            expect(warnings.length).toBe(1);
            expect(warnings[0]).toContain('Unknown_Pset');
        });

    });
```

**Step 2: Run tests**

Run: `npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/test-suites/ids-excel-parser.test.js
git commit -m "test: add complete test coverage for IDSExcelParser"
```

---

## Fáze 2: Excel Generator

---

### Task 2.1: Excel Generator - Core Implementation

**Files:**
- Create: `assets/js/ids/ids-excel-generator.js`
- Test: `tests/test-suites/ids-excel-generator.test.js`

**Step 1: Write the test file**

Create `tests/test-suites/ids-excel-generator.test.js`:
```javascript
// =======================
// IDS EXCEL GENERATOR TESTS
// =======================

describe('IDS Excel Generator', () => {

    const mockIdsData = {
        title: 'Test IDS',
        author: 'John Doe',
        version: '1.0',
        date: '2026-01-26',
        description: 'Test description',
        purpose: '',
        copyright: '',
        milestone: '',
        specifications: [
            {
                name: 'Wall Check',
                identifier: 'SPEC_01',
                ifcVersion: 'IFC4',
                description: 'Check walls',
                applicability: [
                    { type: 'entity', name: { type: 'simple', value: 'IFCWALL' } }
                ],
                requirements: [
                    {
                        type: 'property',
                        propertySet: { type: 'simple', value: 'Pset_WallCommon' },
                        name: { type: 'simple', value: 'IsExternal' },
                        value: null
                    }
                ]
            }
        ]
    };

    it('should be defined', () => {
        expect(IDSExcelGenerator).toBeDefined();
    });

    it('should have generate method', () => {
        expect(typeof IDSExcelGenerator.generate).toBe('function');
    });

    it('should generate info sheet data', () => {
        const result = IDSExcelGenerator._generateInfoSheet(mockIdsData);

        expect(result.length).toBeGreaterThan(0);
        expect(result.find(r => r.Field === 'title').Value).toBe('Test IDS');
        expect(result.find(r => r.Field === 'author').Value).toBe('John Doe');
    });

    it('should generate specifications sheet data', () => {
        const result = IDSExcelGenerator._generateSpecificationsSheet(mockIdsData.specifications);

        expect(result.length).toBe(1);
        expect(result[0].spec_id).toBe('SPEC_01');
        expect(result[0].name).toBe('Wall Check');
    });

    it('should generate applicability sheet data', () => {
        const result = IDSExcelGenerator._generateApplicabilitySheet(mockIdsData.specifications);

        expect(result.length).toBe(1);
        expect(result[0].spec_id).toBe('SPEC_01');
        expect(result[0].facet_type).toBe('entity');
        expect(result[0].entity_name).toBe('IFCWALL');
    });

    it('should generate psets_lookup from requirements', () => {
        const result = IDSExcelGenerator._generatePsetsLookupSheet(mockIdsData.specifications);

        expect(result.length).toBe(1);
        expect(result[0].pset_name).toBe('Pset_WallCommon');
        expect(result[0].property_name).toBe('IsExternal');
    });

    it('should generate element_psets mapping', () => {
        const result = IDSExcelGenerator._generateElementPsetsSheet(mockIdsData.specifications);

        expect(result.length).toBe(1);
        expect(result[0].spec_id).toBe('SPEC_01');
        expect(result[0].pset_name).toBe('Pset_WallCommon');
    });

    it('should deduplicate psets_lookup entries', () => {
        const specsWithDuplicates = [
            {
                identifier: 'SPEC_01',
                requirements: [
                    { type: 'property', propertySet: { value: 'Pset_WallCommon' }, name: { value: 'IsExternal' } }
                ]
            },
            {
                identifier: 'SPEC_02',
                requirements: [
                    { type: 'property', propertySet: { value: 'Pset_WallCommon' }, name: { value: 'IsExternal' } }
                ]
            }
        ];

        const result = IDSExcelGenerator._generatePsetsLookupSheet(specsWithDuplicates);

        expect(result.length).toBe(1); // Deduplicated
    });

});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - "IDSExcelGenerator is not defined"

**Step 3: Write the implementation**

Create `assets/js/ids/ids-excel-generator.js`:
```javascript
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
        const psetsLookupData = _generatePsetsLookupSheet(idsData.specifications || []);
        const elementPsetsData = _generateElementPsetsSheet(idsData.specifications || []);

        // Create sheets
        const infoSheet = XLSX.utils.json_to_sheet(infoData);
        const specificationsSheet = XLSX.utils.json_to_sheet(specificationsData);
        const applicabilitySheet = XLSX.utils.json_to_sheet(applicabilityData);
        const psetsLookupSheet = XLSX.utils.json_to_sheet(psetsLookupData);
        const elementPsetsSheet = XLSX.utils.json_to_sheet(elementPsetsData);

        // Add sheets to workbook
        XLSX.utils.book_append_sheet(workbook, infoSheet, 'info');
        XLSX.utils.book_append_sheet(workbook, specificationsSheet, 'specifications');
        XLSX.utils.book_append_sheet(workbook, applicabilitySheet, 'applicability');
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
            ifcVersion: spec.ifcVersion || 'IFC4',
            instructions: spec.instructions || ''
        }));
    }

    /**
     * Generate applicability sheet data
     * @private
     */
    function _generateApplicabilitySheet(specifications) {
        const rows = [];

        for (const spec of specifications) {
            const specId = spec.identifier || '';

            for (const facet of (spec.applicability || [])) {
                const row = {
                    spec_id: specId,
                    facet_type: facet.type || 'entity'
                };

                if (facet.type === 'entity') {
                    row.entity_name = facet.name?.value || '';
                    row.predefinedType = facet.predefinedType?.value || '';
                } else if (facet.type === 'property') {
                    row.pset_name = facet.propertySet?.value || '';
                    row.property_name = facet.name?.value || '';
                    row.property_value = facet.value?.value || '';
                } else if (facet.type === 'attribute') {
                    row.attribute_name = facet.name?.value || '';
                    row.attribute_value = facet.value?.value || '';
                }

                rows.push(row);
            }
        }

        // Ensure at least headers exist
        if (rows.length === 0) {
            rows.push({
                spec_id: '',
                facet_type: '',
                entity_name: '',
                predefinedType: '',
                pset_name: '',
                property_name: '',
                property_value: '',
                attribute_name: '',
                attribute_value: ''
            });
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

        for (const spec of specifications) {
            for (const req of (spec.requirements || [])) {
                if (req.type !== 'property') continue;

                const psetName = req.propertySet?.value || '';
                const propName = req.name?.value || '';
                const key = `${psetName}|${propName}`;

                if (!psetName || !propName || seen.has(key)) continue;

                seen.add(key);
                rows.push({
                    pset_name: psetName,
                    property_name: propName,
                    dataType: req.dataType || '',
                    value: req.value?.value || ''
                });
            }
        }

        // Ensure at least headers exist
        if (rows.length === 0) {
            rows.push({ pset_name: '', property_name: '', dataType: '', value: '' });
        }

        return rows;
    }

    /**
     * Generate element_psets sheet data
     * @private
     */
    function _generateElementPsetsSheet(specifications) {
        const rows = [];

        for (const spec of specifications) {
            const specId = spec.identifier || '';
            const seenPsets = new Set();

            for (const req of (spec.requirements || [])) {
                if (req.type !== 'property') continue;

                const psetName = req.propertySet?.value || '';
                if (!psetName || seenPsets.has(psetName)) continue;

                seenPsets.add(psetName);
                rows.push({
                    spec_id: specId,
                    pset_name: psetName,
                    cardinality: 'required',
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
        _generatePsetsLookupSheet,
        _generateElementPsetsSheet
    };
})();

// Export for browser
if (typeof window !== 'undefined') {
    window.IDSExcelGenerator = IDSExcelGenerator;
}
```

**Step 4: Add script to test runner HTML**

Modify `tests/test-runner.html`:
```html
<script src="../assets/js/ids/ids-excel-generator.js"></script>
<script src="test-suites/ids-excel-generator.test.js"></script>
```

**Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 6: Commit**

```bash
git add assets/js/ids/ids-excel-generator.js tests/test-suites/ids-excel-generator.test.js tests/test-runner.html
git commit -m "feat: add IDSExcelGenerator for IDS to Excel conversion"
```

---

## Fáze 3: Excel Template

---

### Task 3.1: Create Static Excel Template

**Files:**
- Create: `assets/templates/IDS_Template.xlsx`
- Create: `assets/js/ids/ids-excel-template.js` (for programmatic template generation if needed)

**Step 1: Create template generator helper**

Create `assets/js/ids/ids-excel-template.js`:
```javascript
/**
 * IDS Excel Template
 * Generates sample Excel template with Top 20 IFC4 psets
 */

const IDSExcelTemplate = (function() {

    // Top 20 most common IFC4 property sets with their properties
    const TOP_PSETS = [
        { pset: 'Pset_WallCommon', properties: ['Reference', 'Status', 'IsExternal', 'ThermalTransmittance', 'LoadBearing', 'FireRating', 'AcousticRating'] },
        { pset: 'Pset_DoorCommon', properties: ['Reference', 'Status', 'IsExternal', 'FireRating', 'AcousticRating', 'SecurityRating', 'HandicapAccessible'] },
        { pset: 'Pset_WindowCommon', properties: ['Reference', 'Status', 'IsExternal', 'ThermalTransmittance', 'GlazingAreaFraction', 'FireRating', 'AcousticRating'] },
        { pset: 'Pset_SlabCommon', properties: ['Reference', 'Status', 'IsExternal', 'LoadBearing', 'FireRating', 'AcousticRating', 'Combustible'] },
        { pset: 'Pset_BeamCommon', properties: ['Reference', 'Status', 'Span', 'Slope', 'LoadBearing', 'FireRating'] },
        { pset: 'Pset_ColumnCommon', properties: ['Reference', 'Status', 'Slope', 'LoadBearing', 'FireRating'] },
        { pset: 'Pset_RoofCommon', properties: ['Reference', 'Status', 'IsExternal', 'ThermalTransmittance', 'FireRating', 'AcousticRating'] },
        { pset: 'Pset_StairCommon', properties: ['Reference', 'Status', 'NumberOfRisers', 'NumberOfTreads', 'RiserHeight', 'TreadLength', 'HandicapAccessible'] },
        { pset: 'Pset_RampCommon', properties: ['Reference', 'Status', 'IsExternal', 'FireRating', 'HandicapAccessible'] },
        { pset: 'Pset_CoveringCommon', properties: ['Reference', 'Status', 'IsExternal', 'FireRating', 'AcousticRating', 'FlammabilityRating'] },
        { pset: 'Pset_CurtainWallCommon', properties: ['Reference', 'Status', 'IsExternal', 'ThermalTransmittance', 'FireRating', 'AcousticRating'] },
        { pset: 'Pset_PlateCommon', properties: ['Reference', 'Status', 'IsExternal', 'LoadBearing', 'FireRating'] },
        { pset: 'Pset_RailingCommon', properties: ['Reference', 'Status', 'IsExternal', 'Height'] },
        { pset: 'Pset_BuildingElementProxyCommon', properties: ['Reference', 'Status'] },
        { pset: 'Pset_SpaceCommon', properties: ['Reference', 'IsExternal', 'GrossPlannedArea', 'NetPlannedArea', 'PubliclyAccessible', 'HandicapAccessible'] },
        { pset: 'Pset_ZoneCommon', properties: ['Reference', 'IsExternal', 'GrossPlannedArea', 'NetPlannedArea'] },
        { pset: 'Pset_BuildingCommon', properties: ['Reference', 'BuildingID', 'IsPermanentID', 'YearOfConstruction', 'IsLandmarked'] },
        { pset: 'Pset_SiteCommon', properties: ['Reference', 'BuildableArea', 'TotalArea', 'BuildingHeightLimit'] },
        { pset: 'Pset_BuildingStoreyCommon', properties: ['Reference', 'EntranceLevel', 'AboveGround', 'SprinklerProtection', 'GrossAreaPlanned', 'NetAreaPlanned'] },
        { pset: 'Pset_MemberCommon', properties: ['Reference', 'Status', 'Span', 'Slope', 'LoadBearing', 'FireRating'] }
    ];

    /**
     * Generate template IDS data
     */
    function generateTemplateData() {
        return {
            title: '[Your IDS Title]',
            author: '[Your Name]',
            version: '1.0',
            date: new Date().toISOString().split('T')[0],
            description: '[Description of your IDS requirements]',
            purpose: '',
            copyright: '',
            milestone: '',
            specifications: [
                {
                    identifier: 'SPEC_walls',
                    name: 'Wall Requirements',
                    description: 'All walls must have basic properties defined',
                    ifcVersion: 'IFC4',
                    applicability: [{ type: 'entity', name: { value: 'IFCWALL' } }],
                    requirements: [
                        { type: 'property', propertySet: { value: 'Pset_WallCommon' }, name: { value: 'IsExternal' } },
                        { type: 'property', propertySet: { value: 'Pset_WallCommon' }, name: { value: 'LoadBearing' } }
                    ]
                },
                {
                    identifier: 'SPEC_doors',
                    name: 'Door Requirements',
                    description: 'All doors must have fire rating',
                    ifcVersion: 'IFC4',
                    applicability: [{ type: 'entity', name: { value: 'IFCDOOR' } }],
                    requirements: [
                        { type: 'property', propertySet: { value: 'Pset_DoorCommon' }, name: { value: 'FireRating' } }
                    ]
                },
                {
                    identifier: 'SPEC_windows',
                    name: 'Window Requirements',
                    description: 'All windows must have thermal properties',
                    ifcVersion: 'IFC4',
                    applicability: [{ type: 'entity', name: { value: 'IFCWINDOW' } }],
                    requirements: [
                        { type: 'property', propertySet: { value: 'Pset_WindowCommon' }, name: { value: 'ThermalTransmittance' } }
                    ]
                }
            ]
        };
    }

    /**
     * Generate psets_lookup with Top 20 psets
     */
    function generatePsetsLookup() {
        const rows = [];

        for (const pset of TOP_PSETS) {
            for (const prop of pset.properties) {
                rows.push({
                    pset_name: pset.pset,
                    property_name: prop,
                    dataType: '',
                    value: ''
                });
            }
        }

        return rows;
    }

    /**
     * Generate and download template
     */
    function downloadTemplate() {
        const templateData = generateTemplateData();

        // Create workbook
        const workbook = XLSX.utils.book_new();

        // Info sheet
        const infoData = [
            { Field: 'title', Value: templateData.title },
            { Field: 'author', Value: templateData.author },
            { Field: 'version', Value: templateData.version },
            { Field: 'date', Value: templateData.date },
            { Field: 'description', Value: templateData.description },
            { Field: 'purpose', Value: '' },
            { Field: 'copyright', Value: '' },
            { Field: 'milestone', Value: '' }
        ];
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(infoData), 'info');

        // Specifications sheet
        const specsData = [
            { spec_id: 'SPEC_walls', name: 'Wall Requirements', description: 'All walls must have basic properties defined', ifcVersion: 'IFC4' },
            { spec_id: 'SPEC_doors', name: 'Door Requirements', description: 'All doors must have fire rating', ifcVersion: 'IFC4' },
            { spec_id: 'SPEC_windows', name: 'Window Requirements', description: 'All windows must have thermal properties', ifcVersion: 'IFC4' }
        ];
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(specsData), 'specifications');

        // Applicability sheet
        const applicabilityData = [
            { spec_id: 'SPEC_walls', facet_type: 'entity', entity_name: 'IFCWALL', predefinedType: '' },
            { spec_id: 'SPEC_doors', facet_type: 'entity', entity_name: 'IFCDOOR', predefinedType: '' },
            { spec_id: 'SPEC_windows', facet_type: 'entity', entity_name: 'IFCWINDOW', predefinedType: '' }
        ];
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(applicabilityData), 'applicability');

        // Psets lookup with Top 20
        const psetsData = generatePsetsLookup();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(psetsData), 'psets_lookup');

        // Element psets
        const elementPsetsData = [
            { spec_id: 'SPEC_walls', pset_name: 'Pset_WallCommon', cardinality: 'required', value_override: '' },
            { spec_id: 'SPEC_doors', pset_name: 'Pset_DoorCommon', cardinality: 'required', value_override: '' },
            { spec_id: 'SPEC_windows', pset_name: 'Pset_WindowCommon', cardinality: 'required', value_override: '' }
        ];
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(elementPsetsData), 'element_psets');

        // Download
        const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'IDS_Template.xlsx';
        link.click();

        URL.revokeObjectURL(url);
    }

    return {
        TOP_PSETS,
        generateTemplateData,
        generatePsetsLookup,
        downloadTemplate
    };
})();

// Export for browser
if (typeof window !== 'undefined') {
    window.IDSExcelTemplate = IDSExcelTemplate;
}
```

**Step 2: Commit**

```bash
git add assets/js/ids/ids-excel-template.js
git commit -m "feat: add IDSExcelTemplate with Top 20 IFC4 psets catalog"
```

---

## Fáze 4: UI Integration

---

### Task 4.1: Add Excel Buttons to Editor

**Files:**
- Modify: `pages/ids-parser-visualizer.html`
- Modify: `assets/css/ids-editor-styles.css`

**Step 1: Add buttons to HTML**

In `pages/ids-parser-visualizer.html`, find the editor tab buttons (around line 120-124) and add Excel buttons:

Find:
```html
<div style="display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #e9ecef;">
    <button class="btn btn-secondary" id="createNewIdsBtn" data-i18n="parser.createNew">✨ Vytvořit nový IDS</button>
    <button class="btn btn-primary" id="toggleEditBtn" data-i18n="parser.editMode">✏️ Editační režim</button>
    <button class="btn btn-success" id="downloadIdsBtn" data-i18n="parser.download">💾 Stáhnout IDS</button>
</div>
```

Replace with:
```html
<div style="display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #e9ecef; flex-wrap: wrap;">
    <button class="btn btn-secondary" id="createNewIdsBtn" data-i18n="parser.createNew">✨ Vytvořit nový IDS</button>
    <button class="btn btn-primary" id="toggleEditBtn" data-i18n="parser.editMode">✏️ Editační režim</button>
    <button class="btn btn-success" id="downloadIdsBtn" data-i18n="parser.download">💾 Stáhnout IDS</button>
    <span class="btn-divider"></span>
    <button class="btn btn-excel" id="downloadTemplateBtn" data-i18n="parser.downloadTemplate">📋 Stáhnout šablonu</button>
    <button class="btn btn-excel" id="importExcelBtn" data-i18n="parser.importExcel">📥 Import z Excelu</button>
    <button class="btn btn-excel" id="exportExcelBtn" data-i18n="parser.exportExcel">📤 Export do Excelu</button>
</div>
<input type="file" id="excelFileInput" accept=".xlsx,.xls" style="display: none;">
```

**Step 2: Add CSS for Excel buttons**

Add to `assets/css/ids-editor-styles.css`:
```css
/* Excel button styles */
.btn-excel {
    background: linear-gradient(135deg, #217346 0%, #185c37 100%);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s ease;
}

.btn-excel:hover {
    background: linear-gradient(135deg, #185c37 0%, #0d4226 100%);
    transform: translateY(-1px);
}

.btn-divider {
    width: 1px;
    background: var(--border-color, #e9ecef);
    margin: 0 5px;
}

/* Warning dialog styles */
.excel-warning-dialog {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
}

.excel-warning-content {
    background: white;
    border-radius: 12px;
    padding: 24px;
    max-width: 500px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
}

.excel-warning-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
    color: #856404;
    font-weight: 600;
}

.excel-warning-list {
    background: #fff3cd;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 16px;
    max-height: 200px;
    overflow-y: auto;
}

.excel-warning-list li {
    margin-bottom: 8px;
    font-size: 0.9rem;
    color: #664d03;
}

.excel-warning-summary {
    font-weight: 500;
    margin-bottom: 16px;
    color: #28a745;
}

.excel-warning-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}
```

**Step 3: Commit**

```bash
git add pages/ids-parser-visualizer.html assets/css/ids-editor-styles.css
git commit -m "feat: add Excel import/export buttons to IDS editor UI"
```

---

### Task 4.2: Add Excel Scripts and Event Handlers

**Files:**
- Modify: `pages/ids-parser-visualizer.html`
- Modify: `assets/js/ids/ids-editor-core.js`

**Step 1: Add script includes to HTML**

In `pages/ids-parser-visualizer.html`, add before `</body>` (after other ids scripts):
```html
<script src="../assets/js/ids/ids-excel-parser.js"></script>
<script src="../assets/js/ids/ids-excel-generator.js"></script>
<script src="../assets/js/ids/ids-excel-template.js"></script>
```

**Step 2: Add Excel methods to IDSEditorCore**

Add to `assets/js/ids/ids-editor-core.js` in the `setupEventListeners` method (after existing listeners):
```javascript
        // Excel buttons
        const downloadTemplateBtn = document.getElementById('downloadTemplateBtn');
        if (downloadTemplateBtn) {
            downloadTemplateBtn.addEventListener('click', () => this.downloadExcelTemplate());
        }

        const importExcelBtn = document.getElementById('importExcelBtn');
        if (importExcelBtn) {
            importExcelBtn.addEventListener('click', () => this.importExcel());
        }

        const exportExcelBtn = document.getElementById('exportExcelBtn');
        if (exportExcelBtn) {
            exportExcelBtn.addEventListener('click', () => this.exportExcel());
        }

        const excelFileInput = document.getElementById('excelFileInput');
        if (excelFileInput) {
            excelFileInput.addEventListener('change', (e) => this.handleExcelFile(e));
        }
```

**Step 3: Add Excel methods to IDSEditorCore class**

Add to `assets/js/ids/ids-editor-core.js` (as class methods):
```javascript
    /**
     * Download Excel template
     */
    downloadExcelTemplate() {
        if (typeof IDSExcelTemplate !== 'undefined') {
            IDSExcelTemplate.downloadTemplate();
            this.showMessage(t('editor.templateDownloaded') || 'Template downloaded', 'success');
        } else {
            this.showMessage('Excel template not available', 'error');
        }
    }

    /**
     * Import Excel file
     */
    importExcel() {
        const input = document.getElementById('excelFileInput');
        if (input) {
            input.click();
        }
    }

    /**
     * Handle Excel file selection
     */
    async handleExcelFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Reset input
        event.target.value = '';

        // Check unsaved changes
        if (this.hasUnsavedChanges) {
            if (!confirm(t('editor.unsavedChanges'))) {
                return;
            }
        }

        try {
            const buffer = await file.arrayBuffer();
            const result = IDSExcelParser.parse(buffer);

            // Show warnings if any
            if (result.warnings.length > 0) {
                this.showExcelWarnings(result.warnings, result.data);
            } else {
                this.loadExcelData(result.data);
            }
        } catch (error) {
            this.showMessage(`Import error: ${error.message}`, 'error');
        }
    }

    /**
     * Show Excel import warnings dialog
     */
    showExcelWarnings(warnings, data) {
        const dialog = document.createElement('div');
        dialog.className = 'excel-warning-dialog';
        dialog.innerHTML = `
            <div class="excel-warning-content">
                <div class="excel-warning-header">
                    ⚠️ ${t('editor.importWarnings') || 'Import completed with warnings'}
                </div>
                <ul class="excel-warning-list">
                    ${warnings.map(w => `<li>• ${w}</li>`).join('')}
                </ul>
                <div class="excel-warning-summary">
                    ${t('editor.imported') || 'Imported'}: ${data.specifications.length} ${t('editor.specifications') || 'specifications'}
                </div>
                <div class="excel-warning-actions">
                    <button class="btn btn-secondary" onclick="this.closest('.excel-warning-dialog').remove()">
                        ${t('btn.cancel') || 'Cancel'}
                    </button>
                    <button class="btn btn-primary" id="continueImportBtn">
                        ${t('editor.continueToEditor') || 'Continue to Editor'}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        document.getElementById('continueImportBtn').addEventListener('click', () => {
            dialog.remove();
            this.loadExcelData(data);
        });
    }

    /**
     * Load Excel data into editor
     */
    loadExcelData(data) {
        this.idsData = data;
        this.hasUnsavedChanges = true;
        this.renderIDS();
        this.enableEditMode();
        this.showMessage(t('editor.excelImported') || 'Excel imported successfully', 'success');
    }

    /**
     * Export to Excel
     */
    exportExcel() {
        if (!this.idsData) {
            this.showMessage(t('editor.noDataToExport') || 'No data to export', 'error');
            return;
        }

        if (typeof IDSExcelGenerator !== 'undefined') {
            const filename = (this.idsData.title || 'ids-export').replace(/[^a-zA-Z0-9]/g, '_');
            IDSExcelGenerator.download(this.idsData, filename);
            this.showMessage(t('editor.excelExported') || 'Exported to Excel', 'success');
        } else {
            this.showMessage('Excel generator not available', 'error');
        }
    }
```

**Step 4: Run existing tests**

Run: `npm test`
Expected: PASS

**Step 5: Manual testing**

Open `pages/ids-parser-visualizer.html` in browser:
1. Click "Stáhnout šablonu" → should download IDS_Template.xlsx
2. Click "Import z Excelu" → upload the template → should load in editor
3. Click "Export do Excelu" → should download filled Excel

**Step 6: Commit**

```bash
git add pages/ids-parser-visualizer.html assets/js/ids/ids-editor-core.js
git commit -m "feat: integrate Excel import/export with IDS editor"
```

---

## Fáze 5: Translations & Polish

---

### Task 5.1: Add Translations

**Files:**
- Modify: `assets/js/common/translations.js`

**Step 1: Add translation keys**

Add to Czech translations in `assets/js/common/translations.js`:
```javascript
    // Excel import/export
    'parser.downloadTemplate': 'Stáhnout šablonu',
    'parser.importExcel': 'Import z Excelu',
    'parser.exportExcel': 'Export do Excelu',
    'editor.templateDownloaded': 'Šablona stažena',
    'editor.excelImported': 'Excel úspěšně importován',
    'editor.excelExported': 'Exportováno do Excelu',
    'editor.importWarnings': 'Import dokončen s varováními',
    'editor.imported': 'Importováno',
    'editor.specifications': 'specifikací',
    'editor.continueToEditor': 'Pokračovat do editoru',
    'editor.noDataToExport': 'Žádná data k exportu',
```

Add to English translations:
```javascript
    // Excel import/export
    'parser.downloadTemplate': 'Download Template',
    'parser.importExcel': 'Import from Excel',
    'parser.exportExcel': 'Export to Excel',
    'editor.templateDownloaded': 'Template downloaded',
    'editor.excelImported': 'Excel imported successfully',
    'editor.excelExported': 'Exported to Excel',
    'editor.importWarnings': 'Import completed with warnings',
    'editor.imported': 'Imported',
    'editor.specifications': 'specifications',
    'editor.continueToEditor': 'Continue to Editor',
    'editor.noDataToExport': 'No data to export',
```

**Step 2: Commit**

```bash
git add assets/js/common/translations.js
git commit -m "feat: add translations for Excel import/export"
```

---

### Task 5.2: Integration Tests

**Files:**
- Create: `tests/test-suites/ids-excel-integration.test.js`

**Step 1: Write integration tests**

Create `tests/test-suites/ids-excel-integration.test.js`:
```javascript
// =======================
// IDS EXCEL INTEGRATION TESTS
// =======================

describe('IDS Excel Integration', () => {

    it('should have all Excel modules available', () => {
        expect(IDSExcelParser).toBeDefined();
        expect(IDSExcelGenerator).toBeDefined();
        expect(IDSExcelTemplate).toBeDefined();
    });

    it('should roundtrip IDS data through Excel', () => {
        // Create sample IDS data
        const originalData = {
            title: 'Test IDS',
            author: 'Test Author',
            version: '1.0',
            date: '2026-01-26',
            description: 'Test',
            purpose: '',
            copyright: '',
            milestone: '',
            specifications: [{
                identifier: 'SPEC_01',
                name: 'Wall Check',
                ifcVersion: 'IFC4',
                description: '',
                instructions: '',
                applicability: [
                    { type: 'entity', name: { type: 'simple', value: 'IFCWALL' } }
                ],
                requirements: [
                    { type: 'property', propertySet: { type: 'simple', value: 'Pset_WallCommon' }, name: { type: 'simple', value: 'IsExternal' }, value: null }
                ]
            }]
        };

        // Generate Excel buffer
        const buffer = IDSExcelGenerator.generate(originalData);
        expect(buffer).toBeDefined();
        expect(buffer.byteLength).toBeGreaterThan(0);

        // Parse back
        const result = IDSExcelParser.parse(buffer);
        expect(result.data.title).toBe('Test IDS');
        expect(result.data.specifications.length).toBe(1);
        expect(result.data.specifications[0].name).toBe('Wall Check');
    });

    it('should have Top 20 psets in template', () => {
        expect(IDSExcelTemplate.TOP_PSETS.length).toBe(20);
        expect(IDSExcelTemplate.TOP_PSETS[0].pset).toBe('Pset_WallCommon');
    });

});
```

**Step 2: Add to test runner**

Add to `tests/test-runner.html`:
```html
<script src="test-suites/ids-excel-integration.test.js"></script>
```

**Step 3: Run all tests**

Run: `npm test`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add tests/test-suites/ids-excel-integration.test.js tests/test-runner.html
git commit -m "test: add IDS Excel integration tests"
```

---

### Task 5.3: Final Commit

**Step 1: Create summary commit**

```bash
git add -A
git commit -m "feat: complete IDS Excel import/export implementation

Features:
- Import IDS from Excel (5-sheet format)
- Export IDS to Excel
- Download template with Top 20 IFC4 psets
- Warning dialog for import issues
- Bidirectional conversion preserves data

New files:
- assets/js/ids/ids-excel-parser.js
- assets/js/ids/ids-excel-generator.js
- assets/js/ids/ids-excel-template.js

See docs/plans/2026-01-26-ids-excel-import-design.md for design details."
```

---

## Summary

| Fáze | Úkolů | Popis |
|------|-------|-------|
| 1 | 2 | Excel Parser (Excel → IDS) |
| 2 | 1 | Excel Generator (IDS → Excel) |
| 3 | 1 | Excel Template s Top 20 psets |
| 4 | 2 | UI Integration (buttons, handlers) |
| 5 | 3 | Translations, tests, polish |

**Celkem: 9 úkolů**

Každý úkol má:
- Přesné cesty k souborům
- Kompletní kód (copy-paste ready)
- Test příkazy
- Commit messages
