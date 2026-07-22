/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
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

    it('should preserve IDS 1.0 occurrences, metadata, partOf and exact restrictions', () => {
        const originalData = {
            title: 'Lossless',
            version: '1.0',
            date: '2026-07-22',
            specifications: [{
                identifier: 'LOSSLESS',
                name: 'Lossless spec',
                ifcVersion: 'IFC4 IFC4X3_ADD2',
                minOccurs: '0',
                maxOccurs: '1',
                requirementsDescription: 'Keep this description',
                applicability: [{
                    type: 'partOf',
                    relation: 'IFCRELAGGREGATES',
                    entity: {
                        type: 'entity',
                        name: { type: 'simple', value: 'IFCBUILDING' },
                        predefinedType: { type: 'simple', value: 'ELEMENT' }
                    }
                }],
                requirements: [{
                    type: 'property',
                    propertySet: { type: 'simple', value: 'Pset_WallCommon' },
                    baseName: { type: 'simple', value: 'Reference' },
                    value: {
                        type: 'restriction',
                        base: 'xs:string',
                        facets: [
                            { type: 'minLength', value: '2' },
                            { type: 'pattern', value: '[A-Z]+' }
                        ]
                    },
                    dataType: 'IFCLABEL',
                    cardinality: 'optional',
                    instructions: 'Provide a code',
                    uri: 'https://example.test/property'
                }]
            }]
        };

        const result = IDSExcelParser.parse(IDSExcelGenerator.generate(originalData));
        const spec = result.data.specifications[0];
        const partOf = spec.applicability[0];
        const property = spec.requirements[0];
        expect(spec.minOccurs).toBe('0');
        expect(spec.maxOccurs).toBe('1');
        expect(spec.requirementsDescription).toBe('Keep this description');
        expect(partOf.entity.name.value).toBe('IFCBUILDING');
        expect(partOf.entity.predefinedType.value).toBe('ELEMENT');
        expect(partOf.relation).toBe('IFCRELAGGREGATES');
        expect(property.value.base).toBe('xs:string');
        expect(property.value.facets).toEqual(originalData.specifications[0].requirements[0].value.facets);
        expect(property.dataType).toBe('IFCLABEL');
        expect(property.cardinality).toBe('optional');
        expect(property.instructions).toBe('Provide a code');
    });

    it('should not cross-contaminate properties between specifications', () => {
        const data = {
            title: 'Scoped properties',
            specifications: [
                {
                    identifier: 'A', name: 'A', ifcVersion: 'IFC4', applicability: [],
                    requirements: [{
                        type: 'property',
                        propertySet: { type: 'simple', value: 'Pset_Common' },
                        baseName: { type: 'simple', value: 'OnlyA' },
                        cardinality: 'required'
                    }]
                },
                {
                    identifier: 'B', name: 'B', ifcVersion: 'IFC4', applicability: [],
                    requirements: [{
                        type: 'property',
                        propertySet: { type: 'simple', value: 'Pset_Common' },
                        baseName: { type: 'simple', value: 'OnlyB' },
                        cardinality: 'prohibited'
                    }]
                }
            ]
        };
        const specs = IDSExcelParser.parse(IDSExcelGenerator.generate(data)).data.specifications;
        expect(specs[0].requirements.length).toBe(1);
        expect(specs[0].requirements[0].baseName.value).toBe('OnlyA');
        expect(specs[0].requirements[0].cardinality).toBe('required');
        expect(specs[1].requirements.length).toBe(1);
        expect(specs[1].requirements[0].baseName.value).toBe('OnlyB');
        expect(specs[1].requirements[0].cardinality).toBe('prohibited');
    });

    it('should import only the four explicit template requirements', () => {
        const template = IDSExcelTemplate.generateTemplateData();
        const specs = IDSExcelParser.parse(IDSExcelGenerator.generate(template)).data.specifications;
        expect(specs[0].requirements.length).toBe(2);
        expect(specs[1].requirements.length).toBe(1);
        expect(specs[2].requirements.length).toBe(1);
    });

    it('should produce XSD-valid IDS after an Excel roundtrip', async () => {
        const originalData = IDSExcelTemplate.generateTemplateData();
        const excelData = IDSExcelParser.parse(IDSExcelGenerator.generate(originalData)).data;
        const xml = new IDSXMLGenerator().generateIDS(excelData);
        const validation = await IDSXSDValidator.validate(xml);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toEqual([]);
    }, 10000);

});
