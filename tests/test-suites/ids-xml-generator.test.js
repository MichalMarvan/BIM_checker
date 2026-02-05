// =======================
// IDS XML GENERATOR TESTS
// =======================

describe('IDS XML Generator', () => {
    let generator;

    beforeEach(() => {
        generator = new IDSXMLGenerator();
    });

    // --- Bug #1: Default namespace ---

    it('should use default namespace xmlns without prefix', () => {
        const xml = generator.generateIDS({ title: 'Test' });
        expect(xml).toContain('xmlns="http://standards.buildingsmart.org/IDS"');
    });

    it('should NOT use prefixed xmlns:ids namespace', () => {
        const xml = generator.generateIDS({ title: 'Test' });
        expect(xml.includes('xmlns:ids=')).toBe(false);
    });

    // --- Bug #3: Info element order ---

    it('should output info elements in schema-defined order', () => {
        const xml = generator.generateIDS({
            title: 'Test',
            description: 'Desc',
            version: '1.0',
            author: 'a@b.com',
            date: '2025-01-01',
            purpose: 'Testing',
            copyright: 'Copyright',
            milestone: 'Design'
        });
        const titleIdx = xml.indexOf('<title>');
        const copyrightIdx = xml.indexOf('<copyright>');
        const versionIdx = xml.indexOf('<version>');
        const descIdx = xml.indexOf('<description>');
        const authorIdx = xml.indexOf('<author>');
        const dateIdx = xml.indexOf('<date>');
        const purposeIdx = xml.indexOf('<purpose>');
        const milestoneIdx = xml.indexOf('<milestone>');

        // Order: title, copyright, version, description, author, date, purpose, milestone
        expect(titleIdx).toBeLessThan(copyrightIdx);
        expect(copyrightIdx).toBeLessThan(versionIdx);
        expect(versionIdx).toBeLessThan(descIdx);
        expect(descIdx).toBeLessThan(authorIdx);
        expect(authorIdx).toBeLessThan(dateIdx);
        expect(dateIdx).toBeLessThan(purposeIdx);
        expect(purposeIdx).toBeLessThan(milestoneIdx);
    });

    // --- Bug #4: Cardinality only in requirements ---

    it('should NOT add cardinality to facets in applicability section', () => {
        const xml = generator.generateIDS({
            title: 'Test',
            specifications: [{
                name: 'Spec',
                ifcVersion: 'IFC4',
                applicability: [
                    { type: 'entity', name: 'IFCWALL' },
                    { type: 'property', propertySet: 'Pset_WallCommon', baseName: 'IsExternal', cardinality: 'required' }
                ],
                requirements: [
                    { type: 'property', propertySet: 'Pset_WallCommon', baseName: 'LoadBearing', cardinality: 'required' }
                ]
            }]
        });

        // Extract applicability section
        const applicabilityStart = xml.indexOf('<applicability');
        const applicabilityEnd = xml.indexOf('</applicability>');
        const applicabilityXml = xml.substring(applicabilityStart, applicabilityEnd);

        // Entity in applicability should NOT have cardinality
        expect(applicabilityXml.includes('cardinality=')).toBe(false);

        // Requirements section SHOULD have cardinality
        const reqStart = xml.indexOf('<requirements>');
        const reqEnd = xml.indexOf('</requirements>');
        const reqXml = xml.substring(reqStart, reqEnd);
        expect(reqXml).toContain('cardinality="required"');
    });

    it('should add cardinality to facets in requirements section', () => {
        const xml = generator.generateIDS({
            title: 'Test',
            specifications: [{
                name: 'Spec',
                ifcVersion: 'IFC4',
                applicability: [{ type: 'entity', name: 'IFCWALL' }],
                requirements: [
                    { type: 'property', propertySet: 'PSet', baseName: 'Prop', cardinality: 'optional' },
                    { type: 'attribute', name: 'Name', cardinality: 'required' },
                    { type: 'classification', system: 'Uniclass', cardinality: 'required' },
                    { type: 'material', value: 'Concrete', cardinality: 'required' },
                    { type: 'partOf', entity: 'IFCBUILDINGSTOREY', cardinality: 'required' }
                ]
            }]
        });

        const reqStart = xml.indexOf('<requirements>');
        const reqEnd = xml.indexOf('</requirements>');
        const reqXml = xml.substring(reqStart, reqEnd);
        expect(reqXml).toContain('cardinality="optional"');
        expect(reqXml).toContain('cardinality="required"');
    });

    it('should NOT add cardinality to entity facets even in requirements', () => {
        const xml = generator.generateIDS({
            title: 'Test',
            specifications: [{
                name: 'Spec',
                ifcVersion: 'IFC4',
                applicability: [{ type: 'entity', name: 'IFCWALL' }],
                requirements: [
                    { type: 'entity', name: 'IFCWALL' }
                ]
            }]
        });

        const reqStart = xml.indexOf('<requirements>');
        const reqEnd = xml.indexOf('</requirements>');
        const reqXml = xml.substring(reqStart, reqEnd);
        expect(reqXml.includes('cardinality=')).toBe(false);
    });

    it('should generate valid XML structure', () => {
        const xml = generator.generateIDS({
            title: 'Test',
            specifications: [{
                name: 'Spec',
                ifcVersion: 'IFC4',
                applicability: [{ type: 'entity', name: 'IFCWALL' }],
                requirements: []
            }]
        });
        expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        expect(xml).toContain('<ids ');
        expect(xml).toContain('</ids>');
        expect(xml).toContain('<info>');
        expect(xml).toContain('</info>');
        expect(xml).toContain('<specifications>');
        expect(xml).toContain('</specifications>');
    });
});
