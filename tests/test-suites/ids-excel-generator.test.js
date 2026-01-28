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
                        baseName: { type: 'simple', value: 'IsExternal' },
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
                applicability: [],
                requirements: [
                    { type: 'property', propertySet: { value: 'Pset_WallCommon' }, baseName: { value: 'IsExternal' } }
                ]
            },
            {
                identifier: 'SPEC_02',
                applicability: [],
                requirements: [
                    { type: 'property', propertySet: { value: 'Pset_WallCommon' }, baseName: { value: 'IsExternal' } }
                ]
            }
        ];

        const result = IDSExcelGenerator._generatePsetsLookupSheet(specsWithDuplicates);

        expect(result.length).toBe(1); // Deduplicated
    });

});
