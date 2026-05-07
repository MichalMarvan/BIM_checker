describe('IDSParser', () => {
    it('should expose IDSParser namespace globally', () => {
        expect(typeof window.IDSParser).toBe('object');
        expect(typeof window.IDSParser.parse).toBe('function');
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
