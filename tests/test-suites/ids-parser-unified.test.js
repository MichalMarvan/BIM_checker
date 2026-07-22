/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
describe('IDSParser', () => {
    it('should expose IDSParser namespace globally', () => {
        expect(typeof window.IDSParser).toBe('object');
        const expected = ['parse', 'parseDocument', 'extractInfo', 'extractSpecifications', 'extractFacets', 'extractFacet', 'extractValue', 'extractRestriction'];
        for (const fn of expected) {
            expect(typeof window.IDSParser[fn]).toBe('function');
        }
    });
});

describe('IDSParser.extractInfo', () => {
    it('should extract info element fields', () => {
        const xml = `<?xml version="1.0"?>
            <ids xmlns="http://standards.buildingsmart.org/IDS">
                <info>
                    <title>Test IDS</title>
                    <author>test@example.com</author>
                    <version>1.0</version>
                    <date>2026-01-01</date>
                </info>
                <specifications/>
            </ids>`;
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const info = IDSParser.extractInfo(doc);
        expect(info.title).toBe('Test IDS');
        expect(info.author).toBe('test@example.com');
        expect(info.version).toBe('1.0');
        expect(info.date).toBe('2026-01-01');
    });

    it('should return empty object when info element missing', () => {
        const xml = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS"/>`;
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const info = IDSParser.extractInfo(doc);
        expect(info.title).toBeUndefined();
    });
});

describe('IDSParser.extractValue', () => {
    function parseValue(xml) {
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        return IDSParser.extractValue(doc.documentElement);
    }

    it('should extract simpleValue', () => {
        const v = parseValue('<value xmlns="x"><simpleValue>IFCWALL</simpleValue></value>');
        expect(v.type).toBe('simple');
        expect(v.value).toBe('IFCWALL');
    });

    it('should extract xs:enumeration restriction', () => {
        const v = parseValue(`<value xmlns="x" xmlns:xs="http://www.w3.org/2001/XMLSchema">
            <xs:restriction base="xs:string">
                <xs:enumeration value="A"/>
                <xs:enumeration value="B"/>
            </xs:restriction>
        </value>`);
        expect(v.type).toBe('enumeration');
        expect(v.values).toEqual(['A', 'B']);
    });

    it('should extract xs:pattern restriction with isRegex', () => {
        const v = parseValue(`<value xmlns="x" xmlns:xs="http://www.w3.org/2001/XMLSchema">
            <xs:restriction base="xs:string">
                <xs:pattern value="^IFC.*"/>
            </xs:restriction>
        </value>`);
        expect(v.type).toBe('restriction');
        expect(v.pattern).toBe('^IFC.*');
        expect(v.isRegex).toBe(true);
    });

    it('should extract xs:minInclusive/maxInclusive bounds', () => {
        const v = parseValue(`<value xmlns="x" xmlns:xs="http://www.w3.org/2001/XMLSchema">
            <xs:restriction base="xs:double">
                <xs:minInclusive value="0"/>
                <xs:maxInclusive value="100"/>
            </xs:restriction>
        </value>`);
        expect(v.type).toBe('restriction');
        expect(v.minInclusive).toBe('0');
        expect(v.maxInclusive).toBe('100');
        expect(v.base).toBe('xs:double');
        expect(v.facets).toEqual([
            { type: 'minInclusive', value: '0' },
            { type: 'maxInclusive', value: '100' }
        ]);
    });
});

describe('IDSParser.extractFacet', () => {
    function parseSpec(xml) {
        return new DOMParser().parseFromString(xml, 'text/xml');
    }

    it('should extract entity facet with simple name', () => {
        const doc = parseSpec(`<applicability xmlns="x"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability>`);
        const facet = IDSParser.extractFacet(doc.querySelector('entity'), 'entity');
        expect(facet.type).toBe('entity');
        expect(facet.name.type).toBe('simple');
        expect(facet.name.value).toBe('IFCWALL');
        expect(facet.cardinality).toBeUndefined();
    });

    it('should extract entity facet with predefinedType', () => {
        const doc = parseSpec(`<applicability xmlns="x"><entity>
            <name><simpleValue>IFCWALL</simpleValue></name>
            <predefinedType><simpleValue>STANDARD</simpleValue></predefinedType>
        </entity></applicability>`);
        const facet = IDSParser.extractFacet(doc.querySelector('entity'), 'entity');
        expect(facet.predefinedType.value).toBe('STANDARD');
    });

    it('should extract property facet with propertySet + baseName', () => {
        const doc = parseSpec(`<requirements xmlns="x"><property cardinality="required">
            <propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet>
            <baseName><simpleValue>FireRating</simpleValue></baseName>
        </property></requirements>`);
        const facet = IDSParser.extractFacet(doc.querySelector('property'), 'property');
        expect(facet.type).toBe('property');
        expect(facet.propertySet.value).toBe('Pset_WallCommon');
        expect(facet.baseName.value).toBe('FireRating');
        expect(facet.cardinality).toBe('required');
    });

    it('should extract uri attribute when present', () => {
        const doc = parseSpec(`<applicability xmlns="x"><classification uri="https://bsdd/x"><name><simpleValue>OmniClass</simpleValue></name></classification></applicability>`);
        const facet = IDSParser.extractFacet(doc.querySelector('classification'), 'classification');
        expect(facet.uri).toBe('https://bsdd/x');
    });

    it('should NOT set facet.name for property facets (only baseName)', () => {
        const xml = `<requirements xmlns="x"><property>
            <propertySet><simpleValue>Pset</simpleValue></propertySet>
            <baseName><simpleValue>FireRating</simpleValue></baseName>
        </property></requirements>`;
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const facet = IDSParser.extractFacet(doc.querySelector('property'), 'property');
        expect(facet.baseName.value).toBe('FireRating');
        expect(facet.name).toBeUndefined();
    });
});

describe('IDSParser.extractFacets', () => {
    it('should extract all facet types from a parent element', () => {
        const xml = `<applicability xmlns="x">
            <entity><name><simpleValue>IFCWALL</simpleValue></name></entity>
            <property><propertySet><simpleValue>Pset</simpleValue></propertySet><baseName><simpleValue>P</simpleValue></baseName></property>
        </applicability>`;
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const facets = IDSParser.extractFacets(doc.querySelector('applicability'));
        expect(facets.length).toBe(2);
        expect(facets[0].type).toBe('entity');
        expect(facets[1].type).toBe('property');
    });

    it('should return empty array when element is null', () => {
        expect(IDSParser.extractFacets(null)).toEqual([]);
    });
});

describe('IDSParser.extractSpecifications', () => {
    it('should extract spec attributes + applicability minOccurs/maxOccurs', () => {
        const xml = `<?xml version="1.0"?>
            <ids xmlns="x">
                <specifications>
                    <specification name="Walls" ifcVersion="IFC4" identifier="W-001" description="Wall checks">
                        <applicability minOccurs="0" maxOccurs="unbounded">
                            <entity><name><simpleValue>IFCWALL</simpleValue></name></entity>
                        </applicability>
                        <requirements>
                            <property><propertySet><simpleValue>Pset</simpleValue></propertySet><baseName><simpleValue>P</simpleValue></baseName></property>
                        </requirements>
                    </specification>
                </specifications>
            </ids>`;
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const specs = IDSParser.extractSpecifications(doc);
        expect(specs.length).toBe(1);
        expect(specs[0].name).toBe('Walls');
        expect(specs[0].ifcVersion).toBe('IFC4');
        expect(specs[0].identifier).toBe('W-001');
        expect(specs[0].description).toBe('Wall checks');
        expect(specs[0].minOccurs).toBe('0');
        expect(specs[0].maxOccurs).toBe('unbounded');
        expect(specs[0].applicability.length).toBe(1);
        expect(specs[0].requirements.length).toBe(1);
    });

    it('should default minOccurs/maxOccurs to undefined when absent', () => {
        const xml = `<?xml version="1.0"?>
            <ids xmlns="x"><specifications><specification name="X" ifcVersion="IFC4">
                <applicability/><requirements/>
            </specification></specifications></ids>`;
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const specs = IDSParser.extractSpecifications(doc);
        expect(specs[0].minOccurs).toBeUndefined();
        expect(specs[0].maxOccurs).toBeUndefined();
    });
});

describe('IDSParser.parse', () => {
    it('should parse complete IDS xmlString', () => {
        const xml = `<?xml version="1.0"?>
            <ids xmlns="http://standards.buildingsmart.org/IDS">
                <info><title>Test</title></info>
                <specifications>
                    <specification name="S1" ifcVersion="IFC4">
                        <applicability minOccurs="0" maxOccurs="unbounded">
                            <entity><name><simpleValue>IFCWALL</simpleValue></name></entity>
                        </applicability>
                        <requirements/>
                    </specification>
                </specifications>
            </ids>`;
        const result = IDSParser.parse(xml);
        expect(result.error).toBeNull();
        expect(result.info.title).toBe('Test');
        expect(result.specifications.length).toBe(1);
    });

    it('should return error object on malformed XML', () => {
        const result = IDSParser.parse('<not valid xml');
        expect(result.error).toBeDefined();
        expect(result.error.message).toBeDefined();
        expect(result.specifications).toEqual([]);
    });

    it('should reject a non-IDS root element', () => {
        const result = IDSParser.parse('<root xmlns="http://standards.buildingsmart.org/IDS"/>');
        expect(result.error).toBeDefined();
        expect(result.specifications).toEqual([]);
    });

    it('should reject a wrong IDS namespace', () => {
        const result = IDSParser.parse('<ids xmlns="http://standards.buildingsmart.org/IDS/1.0/ids.xsd"/>');
        expect(result.error).toBeDefined();
        expect(result.specifications).toEqual([]);
    });
});

describe('IDSParser IDS 1.0 metadata', () => {
    it('preserves requirements description and requirement facet attributes', () => {
        const xml = `<?xml version="1.0"?>
            <ids xmlns="http://standards.buildingsmart.org/IDS">
                <info><title>T</title></info>
                <specifications>
                    <specification name="S" ifcVersion="IFC4">
                        <applicability><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability>
                        <requirements description="Author note">
                            <property dataType="IFCLABEL" cardinality="optional" instructions="Fill this value" uri="https://example.test/p">
                                <propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet>
                                <baseName><simpleValue>Reference</simpleValue></baseName>
                            </property>
                        </requirements>
                    </specification>
                </specifications>
            </ids>`;
        const result = IDSParser.parse(xml);
        const spec = result.specifications[0];
        expect(spec.requirementsDescription).toBe('Author note');
        expect(spec.requirements[0].dataType).toBe('IFCLABEL');
        expect(spec.requirements[0].instructions).toBe('Fill this value');
        expect(spec.requirements[0].uri).toBe('https://example.test/p');
        expect(spec.requirements[0].cardinality).toBe('optional');
    });
});

describe('IDSParser.extractFacet other types', () => {
    function parseDoc(xml) {
        return new DOMParser().parseFromString(xml, 'text/xml');
    }

    it('should extract attribute facet with name + value', () => {
        const doc = parseDoc(`<requirements xmlns="x">
            <attribute><name><simpleValue>Tag</simpleValue></name><value><simpleValue>SR-001</simpleValue></value></attribute>
        </requirements>`);
        const facet = IDSParser.extractFacet(doc.querySelector('attribute'), 'attribute');
        expect(facet.type).toBe('attribute');
        expect(facet.name.value).toBe('Tag');
        expect(facet.value.value).toBe('SR-001');
    });

    it('should extract material facet with value', () => {
        const doc = parseDoc(`<requirements xmlns="x">
            <material><value><simpleValue>Concrete</simpleValue></value></material>
        </requirements>`);
        const facet = IDSParser.extractFacet(doc.querySelector('material'), 'material');
        expect(facet.type).toBe('material');
        expect(facet.value.value).toBe('Concrete');
    });

    it('should extract partOf facet with relation', () => {
        const doc = parseDoc(`<applicability xmlns="x">
            <partOf relation="IFCRELAGGREGATES"><entity><name><simpleValue>IFCBUILDING</simpleValue></name></entity></partOf>
        </applicability>`);
        const facet = IDSParser.extractFacet(doc.querySelector('partOf'), 'partOf');
        expect(facet.type).toBe('partOf');
        expect(facet.entity.name.value).toBe('IFCBUILDING');
        expect(facet.relation).toBe('IFCRELAGGREGATES');
    });

    it('should extract partOf entity predefinedType', () => {
        const doc = parseDoc(`<applicability xmlns="x">
            <partOf>
                <entity>
                    <name><simpleValue>IFCBUILDING</simpleValue></name>
                    <predefinedType><simpleValue>ELEMENT</simpleValue></predefinedType>
                </entity>
            </partOf>
        </applicability>`);
        const facet = IDSParser.extractFacet(doc.querySelector('partOf'), 'partOf');
        expect(facet.entity.predefinedType.value).toBe('ELEMENT');
    });

    it('should extract classification facet with system', () => {
        const doc = parseDoc(`<requirements xmlns="x">
            <classification>
                <value><simpleValue>OmniClass-23-13-22</simpleValue></value>
                <system><simpleValue>OmniClass</simpleValue></system>
            </classification>
        </requirements>`);
        const facet = IDSParser.extractFacet(doc.querySelector('classification'), 'classification');
        expect(facet.type).toBe('classification');
        expect(facet.value.value).toBe('OmniClass-23-13-22');
        expect(facet.system.value).toBe('OmniClass');
    });
});

describe('IDSParser.extractSpecifications — ifcVersion list', () => {
    function parseSpec(ifcVersionAttr) {
        const xml = `<?xml version="1.0"?>
            <ids xmlns="http://standards.buildingsmart.org/IDS">
                <specifications>
                    <specification name="S1" ifcVersion="${ifcVersionAttr}">
                        <applicability/>
                        <requirements/>
                    </specification>
                </specifications>
            </ids>`;
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        return IDSParser.extractSpecifications(doc)[0];
    }

    it('derives ifcVersions=["IFC4"] from single value', () => {
        const spec = parseSpec('IFC4');
        expect(spec.ifcVersion).toBe('IFC4');
        expect(Array.isArray(spec.ifcVersions)).toBe(true);
        expect(spec.ifcVersions.length).toBe(1);
        expect(spec.ifcVersions[0]).toBe('IFC4');
    });

    it('derives ifcVersions=["IFC4","IFC4X3_ADD2"] from space-separated list', () => {
        const spec = parseSpec('IFC4 IFC4X3_ADD2');
        expect(spec.ifcVersion).toBe('IFC4 IFC4X3_ADD2');
        expect(spec.ifcVersions.length).toBe(2);
        expect(spec.ifcVersions[0]).toBe('IFC4');
        expect(spec.ifcVersions[1]).toBe('IFC4X3_ADD2');
    });

    it('handles multiple internal spaces and tabs', () => {
        const spec = parseSpec('IFC4  \t IFC4X3_ADD2');
        expect(spec.ifcVersions.length).toBe(2);
        expect(spec.ifcVersions[0]).toBe('IFC4');
        expect(spec.ifcVersions[1]).toBe('IFC4X3_ADD2');
    });

    it('returns empty array for missing/empty attribute', () => {
        const xml = `<?xml version="1.0"?>
            <ids xmlns="http://standards.buildingsmart.org/IDS">
                <specifications><specification name="S1"><applicability/><requirements/></specification></specifications>
            </ids>`;
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const spec = IDSParser.extractSpecifications(doc)[0];
        expect(spec.ifcVersion).toBe('');
        expect(Array.isArray(spec.ifcVersions)).toBe(true);
        expect(spec.ifcVersions.length).toBe(0);
    });

    it('keeps unknown values verbatim (parser does not filter)', () => {
        const spec = parseSpec('IFC4X3');
        expect(spec.ifcVersions.length).toBe(1);
        expect(spec.ifcVersions[0]).toBe('IFC4X3');
    });

    it('round-trip: parseIfcVersionList(spec.ifcVersion) equals spec.ifcVersions', () => {
        const spec = parseSpec('IFC4 IFC4X3_ADD2');
        const reparsed = IDSParser.parseIfcVersionList(spec.ifcVersion);
        expect(reparsed.length).toBe(spec.ifcVersions.length);
        expect(reparsed[0]).toBe(spec.ifcVersions[0]);
        expect(reparsed[1]).toBe(spec.ifcVersions[1]);
    });
});

describe('IDSParser.parseIfcVersionList helper', () => {
    it('is exposed on the IDSParser namespace', () => {
        expect(typeof window.IDSParser.parseIfcVersionList).toBe('function');
    });

    it('splits on any whitespace and drops empties', () => {
        expect(IDSParser.parseIfcVersionList('IFC4  IFC4X3_ADD2 ')).toEqual(['IFC4', 'IFC4X3_ADD2']);
    });

    it('returns [] for null/undefined/empty', () => {
        expect(IDSParser.parseIfcVersionList(null).length).toBe(0);
        expect(IDSParser.parseIfcVersionList(undefined).length).toBe(0);
        expect(IDSParser.parseIfcVersionList('').length).toBe(0);
        expect(IDSParser.parseIfcVersionList('   ').length).toBe(0);
    });
});
