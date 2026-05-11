/* SPDX-License-Identifier: AGPL-3.0-or-later */
describe('IFCParserCore namespace', () => {
    it('should expose IFCParserCore globally', () => {
        expect(typeof window.IFCParserCore).toBe('object');
        expect(typeof window.IFCParserCore.parseIFCContent).toBe('function');
    });
});

describe('IFCParserCore helpers', () => {
    it('extractGUID returns first quoted string', () => {
        const params = "'guid-123', $, 'name', $";
        expect(IFCParserCore._extractGUID(params)).toBe('guid-123');
    });

    it('extractName returns second quoted string (decoded)', () => {
        const params = "'guid', $, 'Wall_001', $";
        expect(IFCParserCore._extractName(params)).toBe('Wall_001');
    });

    it('extractName decodes IFC \\X2\\ encoding', () => {
        // \X2\017D\X0\ = Ž
        const params = "'guid', $, 'S\\X2\\017D\\X0\\_test', $";
        expect(IFCParserCore._extractName(params)).toBe('SŽ_test');
    });

    it('decodeIFCString handles plain ASCII', () => {
        expect(IFCParserCore._decodeIFCString('hello')).toBe('hello');
    });

    it('splitParams handles nested parens', () => {
        const result = IFCParserCore._splitParams("a, b, (c, d), e");
        expect(result.length).toBe(4);
        expect(result[2].trim()).toBe('(c, d)');
    });

    it('splitParams respects quoted strings with commas', () => {
        const result = IFCParserCore._splitParams("'a, b', c");
        expect(result.length).toBe(2);
    });
});

describe('IFCParserCore.parseIFCContent', () => {
    const minimalIFC = `ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCWALL('guid-1',$,'Wall_001',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;`;

    it('parses minimal valid IFC and returns 1 entity', () => {
        const entities = IFCParserCore.parseIFCContent(minimalIFC, 'test.ifc');
        expect(entities.length).toBe(1);
        expect(entities[0].entity).toBe('IFCWALL');
        expect(entities[0].guid).toBe('guid-1');
        expect(entities[0].name).toBe('Wall_001');
        expect(entities[0].fileName).toBe('test.ifc');
    });

    it('output entity has all required fields', () => {
        const entities = IFCParserCore.parseIFCContent(minimalIFC, 'test.ifc');
        const e = entities[0];
        expect(typeof e.guid).toBe('string');
        expect(typeof e.entity).toBe('string');
        expect(typeof e.name).toBe('string');
        expect(typeof e.propertySets).toBe('object');
        expect(typeof e.fileName).toBe('string');
        expect(typeof e.attributes).toBe('object');
        expect(e.attributes.Name).toBe(e.name);
        expect(e.attributes.GlobalId).toBe(e.guid);
    });

    it('returns empty array for empty content', () => {
        const entities = IFCParserCore.parseIFCContent('', 'empty.ifc');
        expect(entities).toEqual([]);
    });

    it('skips REL and PROPERTY entity types from output', () => {
        const ifc = `ISO-10303-21;
DATA;
#1=IFCWALL('guid-1',$,'Wall',$,$,$,$,$,$);
#2=IFCPROPERTYSET('pset-guid',$,'Pset_Test',$,(#3));
#3=IFCPROPERTYSINGLEVALUE('Prop',$,IFCLABEL('val'),$);
#4=IFCRELDEFINESBYPROPERTIES('rel-guid',$,$,$,(#1),#2);
ENDSEC;
END-ISO-10303-21;`;
        const entities = IFCParserCore.parseIFCContent(ifc, 't.ifc');
        // Only IFCWALL should be in output (IFCPROPERTYSET, IFCPROPERTYSINGLEVALUE, IFCRELDEFINESBYPROPERTIES filtered)
        expect(entities.length).toBe(1);
        expect(entities[0].entity).toBe('IFCWALL');
    });

    it('links property set to entity via rel', () => {
        const ifc = `ISO-10303-21;
DATA;
#1=IFCWALL('guid-1',$,'Wall',$,$,$,$,$,$);
#2=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('EI60'),$);
#3=IFCPROPERTYSET('pset-guid',$,'Pset_WallCommon',$,(#2));
#4=IFCRELDEFINESBYPROPERTIES('rel-guid',$,$,$,(#1),#3);
ENDSEC;
END-ISO-10303-21;`;
        const entities = IFCParserCore.parseIFCContent(ifc, 't.ifc');
        expect(entities.length).toBe(1);
        expect(entities[0].propertySets['Pset_WallCommon']).toBeDefined();
        expect(entities[0].propertySets['Pset_WallCommon']['FireRating']).toBe('EI60');
    });

    it('skips entities without GUID', () => {
        const ifc = `ISO-10303-21;
DATA;
#1=IFCCARTESIANPOINT((0.,0.,0.));
ENDSEC;
END-ISO-10303-21;`;
        const entities = IFCParserCore.parseIFCContent(ifc, 't.ifc');
        // No quoted strings, no GUID → filtered out
        expect(entities.length).toBe(0);
    });

    it('handles multiple entity types', () => {
        const ifc = `ISO-10303-21;
DATA;
#1=IFCWALL('g1',$,'W1',$,$,$,$,$,$);
#2=IFCDOOR('g2',$,'D1',$,$,$,$,$,$,$,$,$);
#3=IFCWALLSTANDARDCASE('g3',$,'W3',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;`;
        const entities = IFCParserCore.parseIFCContent(ifc, 't.ifc');
        expect(entities.length).toBe(3);
        const types = entities.map(e => e.entity);
        expect(types).toContain('IFCWALL');
        expect(types).toContain('IFCDOOR');
        expect(types).toContain('IFCWALLSTANDARDCASE');
    });
});
