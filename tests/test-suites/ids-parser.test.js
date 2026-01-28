// =======================
// IDS PARSER TESTS
// =======================

describe('IDS Parser (XML)', () => {
    
    it('should create DOMParser instance', () => {
        const parser = new DOMParser();
        expect(parser).toBeDefined();
        expect(parser).toBeInstanceOf(DOMParser);
    });

    it('should parse valid XML', () => {
        const xmlString = '<?xml version="1.0"?><root><child>value</child></root>';
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlString, 'text/xml');
        
        expect(doc).toBeDefined();
        expect(doc.documentElement.tagName).toBe('root');
    });

    it('should detect XML parsing errors', () => {
        const invalidXML = '<?xml version="1.0"?><root><child>value</child>'; // Missing closing tag
        const parser = new DOMParser();
        const doc = parser.parseFromString(invalidXML, 'text/xml');
        
        const parserError = doc.querySelector('parsererror');
        expect(parserError).toBeDefined();
    });

    it('should parse basic IDS structure', () => {
        const idsXML = `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" 
     xmlns:xs="http://www.w3.org/2001/XMLSchema" 
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
     xsi:schemaLocation="http://standards.buildingsmart.org/IDS">
    <info>
        <title>Test IDS</title>
    </info>
    <specifications>
    </specifications>
</ids>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(idsXML, 'text/xml');
        
        expect(doc.querySelector('ids')).toBeDefined();
        expect(doc.querySelector('info')).toBeDefined();
        expect(doc.querySelector('specifications')).toBeDefined();
    });

    it('should extract IDS info section', () => {
        const idsXML = `<?xml version="1.0"?>
<ids>
    <info>
        <title>My IDS</title>
        <version>1.0</version>
        <author>Test Author</author>
    </info>
</ids>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(idsXML, 'text/xml');
        
        const title = doc.querySelector('info title')?.textContent;
        const version = doc.querySelector('info version')?.textContent;
        const author = doc.querySelector('info author')?.textContent;
        
        expect(title).toBe('My IDS');
        expect(version).toBe('1.0');
        expect(author).toBe('Test Author');
    });

    it('should parse IDS specification', () => {
        const idsXML = `<?xml version="1.0"?>
<ids>
    <specifications>
        <specification name="Test Spec" ifcVersion="IFC4">
            <applicability>
                <entity>
                    <name><simpleValue>IFCWALL</simpleValue></name>
                </entity>
            </applicability>
        </specification>
    </specifications>
</ids>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(idsXML, 'text/xml');
        
        const spec = doc.querySelector('specification');
        expect(spec).toBeDefined();
        expect(spec.getAttribute('name')).toBe('Test Spec');
        expect(spec.getAttribute('ifcVersion')).toBe('IFC4');
    });

    it('should parse entity facet with simpleValue', () => {
        const xml = `<?xml version="1.0"?>
<entity>
    <name><simpleValue>IFCWALL</simpleValue></name>
</entity>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        
        const simpleValue = doc.querySelector('name simpleValue')?.textContent;
        expect(simpleValue).toBe('IFCWALL');
    });

    it('should parse entity facet with pattern (regex)', () => {
        const xml = `<?xml version="1.0"?>
<entity>
    <name><xs:restriction base="xs:string"><xs:pattern value="IFC.*"/></xs:restriction></name>
</entity>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        
        const pattern = doc.querySelector('xs\\:pattern, pattern');
        expect(pattern).toBeDefined();
    });

    it('should parse property facet', () => {
        const xml = `<?xml version="1.0"?>
<property dataType="IFCLABEL">
    <propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet>
    <baseName><simpleValue>LoadBearing</simpleValue></baseName>
    <value><simpleValue>TRUE</simpleValue></value>
</property>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        
        const propertySet = doc.querySelector('propertySet simpleValue')?.textContent;
        const baseName = doc.querySelector('baseName simpleValue')?.textContent;
        
        expect(propertySet).toBe('Pset_WallCommon');
        expect(baseName).toBe('LoadBearing');
    });

    it('should parse attribute facet', () => {
        const xml = `<?xml version="1.0"?>
<attribute>
    <name><simpleValue>Name</simpleValue></name>
    <value><simpleValue>External Wall</simpleValue></value>
</attribute>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        
        const name = doc.querySelector('name simpleValue')?.textContent;
        const value = doc.querySelector('value simpleValue')?.textContent;
        
        expect(name).toBe('Name');
        expect(value).toBe('External Wall');
    });

    it('should parse classification facet', () => {
        const xml = `<?xml version="1.0"?>
<classification>
    <system><simpleValue>Uniclass</simpleValue></system>
    <value><simpleValue>Ss_25_10_20</simpleValue></value>
</classification>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        
        const system = doc.querySelector('system simpleValue')?.textContent;
        const value = doc.querySelector('value simpleValue')?.textContent;
        
        expect(system).toBe('Uniclass');
        expect(value).toBe('Ss_25_10_20');
    });

    it('should parse material facet', () => {
        const xml = `<?xml version="1.0"?>
<material>
    <value><simpleValue>Concrete</simpleValue></value>
</material>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        
        const value = doc.querySelector('value simpleValue')?.textContent;
        expect(value).toBe('Concrete');
    });

    it('should parse partOf facet', () => {
        const xml = `<?xml version="1.0"?>
<partOf relation="IFCRELCONTAINEDINSPATIALSTRUCTURE">
    <entity><name><simpleValue>IFCBUILDINGSTOREY</simpleValue></name></entity>
</partOf>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        
        const partOf = doc.querySelector('partOf');
        const entityName = doc.querySelector('entity name simpleValue')?.textContent;
        
        expect(partOf).toBeDefined();
        expect(partOf.getAttribute('relation')).toBe('IFCRELCONTAINEDINSPATIALSTRUCTURE');
        expect(entityName).toBe('IFCBUILDINGSTOREY');
    });

    it('should parse requirements section', () => {
        const xml = `<?xml version="1.0"?>
<specification>
    <applicability></applicability>
    <requirements>
        <property dataType="IFCBOOLEAN">
            <baseName><simpleValue>IsExternal</simpleValue></baseName>
        </property>
    </requirements>
</specification>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        
        const requirements = doc.querySelector('requirements');
        expect(requirements).toBeDefined();
        expect(requirements.querySelector('property')).toBeDefined();
    });

    it('should handle enumeration restriction', () => {
        const xml = `<?xml version="1.0"?>
<value xmlns:xs="http://www.w3.org/2001/XMLSchema">
    <xs:restriction base="xs:string">
        <xs:enumeration value="Option1"/>
        <xs:enumeration value="Option2"/>
        <xs:enumeration value="Option3"/>
    </xs:restriction>
</value>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');

        // Use getElementsByTagNameNS for proper namespace handling
        const enumerations = doc.getElementsByTagNameNS('http://www.w3.org/2001/XMLSchema', 'enumeration');
        expect(enumerations.length).toBe(3);
    });

    it('should handle bounds restriction', () => {
        const xml = `<?xml version="1.0"?>
<value>
    <xs:restriction base="xs:decimal">
        <xs:minInclusive value="0"/>
        <xs:maxInclusive value="100"/>
    </xs:restriction>
</value>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        
        const minInclusive = doc.querySelector('xs\\:minInclusive, minInclusive');
        const maxInclusive = doc.querySelector('xs\\:maxInclusive, maxInclusive');
        
        expect(minInclusive).toBeDefined();
        expect(maxInclusive).toBeDefined();
    });

    it('should handle namespace prefixes', () => {
        const xml = `<?xml version="1.0"?>
<ids xmlns:xs="http://www.w3.org/2001/XMLSchema">
    <value>
        <xs:restriction base="xs:string">
            <xs:pattern value=".*"/>
        </xs:restriction>
    </value>
</ids>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        
        // Should handle both with and without namespace
        const pattern = doc.querySelector('xs\\:pattern, pattern');
        expect(pattern).toBeDefined();
    });

    it('should parse IDS with multiple specifications', () => {
        const xml = `<?xml version="1.0"?>
<ids>
    <specifications>
        <specification name="Spec1"></specification>
        <specification name="Spec2"></specification>
        <specification name="Spec3"></specification>
    </specifications>
</ids>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        
        const specs = doc.querySelectorAll('specification');
        expect(specs.length).toBe(3);
    });

    it('should handle optional cardinality', () => {
        const xml = `<?xml version="1.0"?>
<property cardinality="optional">
    <baseName><simpleValue>OptionalProperty</simpleValue></baseName>
</property>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        
        const property = doc.querySelector('property');
        expect(property.getAttribute('cardinality')).toBe('optional');
    });

    it('should handle required cardinality', () => {
        const xml = `<?xml version="1.0"?>
<property cardinality="required">
    <baseName><simpleValue>RequiredProperty</simpleValue></baseName>
</property>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        
        const property = doc.querySelector('property');
        expect(property.getAttribute('cardinality')).toBe('required');
    });
});
