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
        expect(facet.cardinality).toBe('required');
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
            <partOf relation="IFCRELAGGREGATES"><name><simpleValue>IFCBUILDING</simpleValue></name></partOf>
        </applicability>`);
        const facet = IDSParser.extractFacet(doc.querySelector('partOf'), 'partOf');
        expect(facet.type).toBe('partOf');
        expect(facet.name.value).toBe('IFCBUILDING');
    });

    it('should extract partOf facet with relation child element', () => {
        const doc = parseDoc(`<applicability xmlns="x">
            <partOf>
                <name><simpleValue>IFCBUILDING</simpleValue></name>
                <relation><simpleValue>IFCRELAGGREGATES</simpleValue></relation>
            </partOf>
        </applicability>`);
        const facet = IDSParser.extractFacet(doc.querySelector('partOf'), 'partOf');
        expect(facet.relation.value).toBe('IFCRELAGGREGATES');
    });

    it('should extract classification facet with system', () => {
        const doc = parseDoc(`<requirements xmlns="x">
            <classification>
                <name><simpleValue>OmniClass-23-13-22</simpleValue></name>
                <system><simpleValue>OmniClass</simpleValue></system>
            </classification>
        </requirements>`);
        const facet = IDSParser.extractFacet(doc.querySelector('classification'), 'classification');
        expect(facet.type).toBe('classification');
        expect(facet.name.value).toBe('OmniClass-23-13-22');
        expect(facet.system.value).toBe('OmniClass');
    });
});
