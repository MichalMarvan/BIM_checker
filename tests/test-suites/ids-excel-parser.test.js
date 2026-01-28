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
            expect(specs[0].requirements[0].baseName.value).toBe('IsExternal');
            expect(specs[0].requirements[1].baseName.value).toBe('FireRating');
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

});
