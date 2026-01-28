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
                    { type: 'property', propertySet: { type: 'simple', value: 'Pset_WallCommon' }, baseName: { type: 'simple', value: 'IsExternal' }, value: null }
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

    it('should generate psets lookup with all properties', () => {
        const lookup = IDSExcelTemplate.generatePsetsLookup();
        expect(lookup.length).toBeGreaterThan(50);
        expect(lookup[0].pset_name).toBe('Pset_WallCommon');
    });

    it('should preserve applicability through roundtrip', () => {
        const originalData = {
            title: 'Roundtrip Test',
            author: '',
            version: '1.0',
            date: '2026-01-26',
            description: '',
            purpose: '',
            copyright: '',
            milestone: '',
            specifications: [{
                identifier: 'SPEC_01',
                name: 'Test Spec',
                ifcVersion: 'IFC4',
                description: '',
                instructions: '',
                applicability: [
                    { type: 'entity', name: { type: 'simple', value: 'IFCWALL' }, predefinedType: { type: 'simple', value: 'SOLIDWALL' } }
                ],
                requirements: []
            }]
        };

        const buffer = IDSExcelGenerator.generate(originalData);
        const result = IDSExcelParser.parse(buffer);

        expect(result.data.specifications[0].applicability.length).toBe(1);
        expect(result.data.specifications[0].applicability[0].name.value).toBe('IFCWALL');
    });

    it('should preserve requirements through roundtrip', () => {
        const originalData = {
            title: 'Requirements Test',
            author: '',
            version: '1.0',
            date: '2026-01-26',
            description: '',
            purpose: '',
            copyright: '',
            milestone: '',
            specifications: [{
                identifier: 'SPEC_01',
                name: 'Test Spec',
                ifcVersion: 'IFC4',
                description: '',
                instructions: '',
                applicability: [],
                requirements: [
                    { type: 'property', propertySet: { type: 'simple', value: 'Pset_WallCommon' }, baseName: { type: 'simple', value: 'IsExternal' }, value: { type: 'simple', value: 'true' } },
                    { type: 'property', propertySet: { type: 'simple', value: 'Pset_WallCommon' }, baseName: { type: 'simple', value: 'LoadBearing' }, value: null }
                ]
            }]
        };

        const buffer = IDSExcelGenerator.generate(originalData);
        const result = IDSExcelParser.parse(buffer);

        expect(result.data.specifications[0].requirements.length).toBe(2);
    });

});
