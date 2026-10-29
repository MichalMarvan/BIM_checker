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
        expect(result.warnings).toEqual([]);
        expect(result.report.status).toBe('ok');
        expect(result.report.sourceFormatVersion).toBe(2);
        expect(result.report.imported.specifications).toBe(1);
    });

    it('should migrate an unversioned legacy workbook with an explicit report', () => {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
            { Field: 'title', Value: 'Legacy IDS' },
            { Field: 'version', Value: '1.0' }
        ]), 'info');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
            { spec_id: 'LEGACY', name: 'Legacy', ifcVersion: 'IFC4' }
        ]), 'specifications');

        const result = IDSExcelParser.parse(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
        expect(result.data.title).toBe('Legacy IDS');
        expect(result.report.sourceFormatVersion).toBe(1);
        expect(result.report.migrated).toBe(true);
        expect(result.warnings[0]).toMatch(/Legacy unversioned workbook/);
    });

    it('should refuse a newer workbook instead of silently losing data', () => {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
            { Field: '_bim_checker_format', Value: IDSExcelFormat.ID },
            { Field: '_bim_checker_format_version', Value: IDSExcelFormat.CURRENT_VERSION + 1 },
            { Field: 'title', Value: 'Future' }
        ]), 'info');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
            { spec_id: 'FUTURE', name: 'Future', ifcVersion: 'IFC4' }
        ]), 'specifications');
        const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });

        expect(() => IDSExcelParser.parse(buffer)).toThrow('newer IDS Excel format');
    });

    it('should report ignored sheets and skipped rows', () => {
        const workbook = XLSX.read(IDSExcelGenerator.generate(IDSExcelTemplate.generateTemplateData()), { type: 'array' });
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ future: 'value' }]), 'future_data');
        const applicability = XLSX.utils.sheet_to_json(workbook.Sheets.applicability, { defval: '' });
        applicability.push({ spec_id: 'MISSING', facet_type: 'entity', entity_name: 'IFCWALL' });
        workbook.Sheets.applicability = XLSX.utils.json_to_sheet(applicability);

        const result = IDSExcelParser.parse(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
        expect(result.report.unknownSheets).toEqual(['future_data']);
        expect(result.report.skippedRows).toBe(1);
        expect(result.report.status).toBe('warning');
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

    it('should create a versioned import report with automatic XSD validation', async () => {
        const parsed = IDSExcelParser.parse(IDSExcelGenerator.generate(IDSExcelTemplate.generateTemplateData()));
        const report = await IDSExcelParser.createImportReport(parsed, {
            name: 'requirements.xlsx',
            size: 1234,
            lastModified: 1700000000000
        });

        expect(report.format).toBe('BIM_CHECKER_IDS_EXCEL_IMPORT_REPORT');
        expect(report.formatVersion).toBe(1);
        expect(report.source.name).toBe('requirements.xlsx');
        expect(report.imported.specifications).toBe(parsed.data.specifications.length);
        expect(report.xsd.checked).toBe(true);
        expect(report.xsd.valid).toBe(true);
        expect(report.xsd.errorCount).toBe(0);
        expect(report.status).toBe(parsed.report.status);
    }, 10000);

    it('should preserve all IDS 1.0 facet semantics through XML, Excel and XML', async () => {
        const source = {
            title: 'All facets',
            version: '1.0',
            date: '2026-07-22',
            specifications: [{
                identifier: 'ALL-FACETS',
                name: 'All facets',
                ifcVersion: 'IFC2X3 IFC4 IFC4X3_ADD2',
                minOccurs: '0',
                maxOccurs: 'unbounded',
                requirementsDescription: 'Semantic roundtrip',
                applicability: [{
                    type: 'entity',
                    name: { type: 'restriction', base: 'xs:string', facets: [{ type: 'pattern', value: 'IFC.*' }] },
                    predefinedType: { type: 'simple', value: 'USERDEFINED' }
                }],
                requirements: [
                    {
                        type: 'partOf', relation: 'IFCRELAGGREGATES', cardinality: 'required',
                        entity: { type: 'entity', name: { type: 'simple', value: 'IFCBUILDING' } }
                    },
                    {
                        type: 'classification', cardinality: 'optional', uri: 'https://example.test/class',
                        system: { type: 'simple', value: 'Uniclass' },
                        value: { type: 'enumeration', base: 'xs:string', values: ['A', 'B'], facets: [{ type: 'enumeration', value: 'A' }, { type: 'enumeration', value: 'B' }] }
                    },
                    {
                        type: 'attribute', cardinality: 'required', instructions: 'Set tag',
                        name: { type: 'simple', value: 'Tag' },
                        value: { type: 'restriction', base: 'xs:string', facets: [{ type: 'minLength', value: '2' }, { type: 'pattern', value: '[A-Z]+' }] }
                    },
                    {
                        type: 'property', cardinality: 'prohibited', dataType: 'IFCLABEL', uri: 'https://example.test/property',
                        propertySet: { type: 'simple', value: 'Pset_Test' },
                        baseName: { type: 'simple', value: 'Forbidden' },
                        value: { type: 'simple', value: '=still data' }
                    },
                    {
                        type: 'material', cardinality: 'required', uri: 'https://example.test/material',
                        value: { type: 'restriction', base: 'xs:string', facets: [{ type: 'pattern', value: 'Concrete.*' }] }
                    }
                ]
            }]
        };
        const generator = new IDSXMLGenerator();
        const sourceXml = generator.generateIDS(source);
        const parsedSource = IDSParser.parse(sourceXml);
        const workbookData = { ...parsedSource.info, specifications: parsedSource.specifications };
        const imported = IDSExcelParser.parse(IDSExcelGenerator.generate(workbookData));
        const roundtripXml = generator.generateIDS(imported.data);
        const parsedRoundtrip = IDSParser.parse(roundtripXml);

        expect(parsedRoundtrip.info).toEqual(parsedSource.info);
        expect(parsedRoundtrip.specifications).toEqual(parsedSource.specifications);
        const xsd = await IDSXSDValidator.validate(roundtripXml);
        expect(xsd.valid).toBe(true);
    }, 10000);

});
