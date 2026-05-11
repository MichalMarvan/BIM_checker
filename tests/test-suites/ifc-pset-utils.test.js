/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
describe('IfcPsetUtils', () => {
    it('should expose IfcPsetUtils namespace globally', () => {
        expect(typeof window.IfcPsetUtils).toBe('object');
        const expected = ['parsePsetHasProperties', 'addPropertyIdToPset', 'parsePropertyName', 'findPsetOnElement'];
        for (const fn of expected) {
            expect(typeof window.IfcPsetUtils[fn]).toBe('function');
        }
    });
});

describe('IfcPsetUtils.parsePsetHasProperties', () => {
    it('should extract single property from tuple', () => {
        const params = "'guid',$,'Name',$,(#1)";
        expect(IfcPsetUtils.parsePsetHasProperties(params)).toEqual(['#1']);
    });

    it('should extract multiple properties', () => {
        const params = "'guid',$,'Name',$,(#1,#2,#3)";
        expect(IfcPsetUtils.parsePsetHasProperties(params)).toEqual(['#1', '#2', '#3']);
    });

    it('should return empty array for empty tuple', () => {
        const params = "'guid',$,'Name',$,()";
        expect(IfcPsetUtils.parsePsetHasProperties(params)).toEqual([]);
    });

    it('should tolerate whitespace around IDs', () => {
        const params = "'guid',$,'Name',$,( #1 , #2 )";
        expect(IfcPsetUtils.parsePsetHasProperties(params)).toEqual(['#1', '#2']);
    });

    it('should return empty array when tuple missing', () => {
        const params = "'guid',$,'Name',$";
        expect(IfcPsetUtils.parsePsetHasProperties(params)).toEqual([]);
    });
});

describe('IfcPsetUtils.addPropertyIdToPset', () => {
    it('should add ID to non-empty tuple', () => {
        const line = "#100=IFCPROPERTYSET('g',$,'Name',$,(#1,#2));";
        const result = IfcPsetUtils.addPropertyIdToPset(line, 999);
        expect(result).toBe("#100=IFCPROPERTYSET('g',$,'Name',$,(#1,#2,#999));");
    });

    it('should add ID to empty tuple', () => {
        const line = "#100=IFCPROPERTYSET('g',$,'Name',$,());";
        const result = IfcPsetUtils.addPropertyIdToPset(line, 999);
        expect(result).toBe("#100=IFCPROPERTYSET('g',$,'Name',$,(#999));");
    });

    it('should preserve trailing whitespace', () => {
        const line = "#100=IFCPROPERTYSET('g',$,'Name',$,(#1));   ";
        const result = IfcPsetUtils.addPropertyIdToPset(line, 999);
        expect(result).toBe("#100=IFCPROPERTYSET('g',$,'Name',$,(#1,#999));   ");
    });

    it('should return line unchanged when no tuple found', () => {
        const line = "#100=IFCPROPERTYSET('g',$,'Name',$);";
        const result = IfcPsetUtils.addPropertyIdToPset(line, 999);
        expect(result).toBe(line);
    });

    it('should work with single-property tuple', () => {
        const line = "#100=IFCPROPERTYSET('g',$,'Name',$,(#42));";
        const result = IfcPsetUtils.addPropertyIdToPset(line, 999);
        expect(result).toBe("#100=IFCPROPERTYSET('g',$,'Name',$,(#42,#999));");
    });
});

describe('IfcPsetUtils.parsePropertyName', () => {
    it('should extract name from IFCPROPERTYSINGLEVALUE', () => {
        const line = "#200=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('EI60'),$);";
        expect(IfcPsetUtils.parsePropertyName(line)).toBe('FireRating');
    });

    it('should extract name from IFCQUANTITYLENGTH', () => {
        const line = "#201=IFCQUANTITYLENGTH('Width',$,$,5.0);";
        expect(IfcPsetUtils.parsePropertyName(line)).toBe('Width');
    });

    it('should unescape doubled single quotes', () => {
        const line = "#202=IFCPROPERTYSINGLEVALUE('O''Brien',$,IFCLABEL('value'),$);";
        expect(IfcPsetUtils.parsePropertyName(line)).toBe("O'Brien");
    });

    it('should return null when no quoted name found', () => {
        const line = "#203=IFCPROPERTYSINGLEVALUE($,$,$,$);";
        expect(IfcPsetUtils.parsePropertyName(line)).toBeNull();
    });
});

describe('IfcPsetUtils.findPsetOnElement', () => {
    function makeMaps() {
        // element #10 is linked via rel #300 to pset #100 (Pset_WallCommon)
        // element #11 is linked via rel #301 to pset #101 (Pset_Custom)
        const propertySetMap = new Map();
        propertySetMap.set('100', { lineIndex: 5, params: "'pset-guid',$,'Pset_WallCommon',$,(#200,#201)", line: "#100=IFCPROPERTYSET(...)", type: 'IFCPROPERTYSET' });
        propertySetMap.set('101', { lineIndex: 6, params: "'pset-guid2',$,'Pset_Custom',$,(#202)", line: "#101=IFCPROPERTYSET(...)", type: 'IFCPROPERTYSET' });

        const relDefinesMap = new Map();
        relDefinesMap.set('300', { lineIndex: 8, params: "'rel-guid',$,$,$,(#10),#100", line: "#300=IFCRELDEFINESBYPROPERTIES(...)" });
        relDefinesMap.set('301', { lineIndex: 9, params: "'rel-guid2',$,$,$,(#11),#101", line: "#301=IFCRELDEFINESBYPROPERTIES(...)" });

        return { propertySetMap, relDefinesMap };
    }

    it('should find existing pset on element', () => {
        const { propertySetMap, relDefinesMap } = makeMaps();
        const result = IfcPsetUtils.findPsetOnElement('10', 'Pset_WallCommon', relDefinesMap, propertySetMap);
        expect(result).toBeDefined();
        expect(result.id).toBe('100');
        expect(result.type).toBe('IFCPROPERTYSET');
    });

    it('should return null when element has no rel', () => {
        const { propertySetMap, relDefinesMap } = makeMaps();
        const result = IfcPsetUtils.findPsetOnElement('99', 'Pset_WallCommon', relDefinesMap, propertySetMap);
        expect(result).toBeNull();
    });

    it('should return null when rel exists but pset name differs', () => {
        const { propertySetMap, relDefinesMap } = makeMaps();
        const result = IfcPsetUtils.findPsetOnElement('10', 'Pset_Different', relDefinesMap, propertySetMap);
        expect(result).toBeNull();
    });

    it('should match shared pset (multi-element rel)', () => {
        const propertySetMap = new Map();
        propertySetMap.set('100', { lineIndex: 5, params: "'pset-guid',$,'Pset_Shared',$,(#200)", line: "#100=IFCPROPERTYSET(...)", type: 'IFCPROPERTYSET' });
        const relDefinesMap = new Map();
        relDefinesMap.set('300', { lineIndex: 8, params: "'rel-guid',$,$,$,(#10,#11,#12),#100", line: "#300=IFCRELDEFINESBYPROPERTIES(...)" });
        const result = IfcPsetUtils.findPsetOnElement('11', 'Pset_Shared', relDefinesMap, propertySetMap);
        expect(result).toBeDefined();
        expect(result.id).toBe('100');
    });

    it('should ignore rel pointing to non-existent pset', () => {
        const propertySetMap = new Map();
        const relDefinesMap = new Map();
        relDefinesMap.set('300', { lineIndex: 8, params: "'rel-guid',$,$,$,(#10),#999", line: "..." });
        const result = IfcPsetUtils.findPsetOnElement('10', 'Pset_X', relDefinesMap, propertySetMap);
        expect(result).toBeNull();
    });
});

describe('IfcPsetUtils.decodeIfcString', () => {
    it('should decode UTF-16 X2 sequences', () => {
        // \X2\017D\X0\ = Ž (U+017D)
        expect(IfcPsetUtils.decodeIfcString('S\\X2\\017D\\X0\\_test')).toBe('SŽ_test');
    });

    it('should decode Latin-1 X sequences', () => {
        // \X\E1 = á (0xE1)
        expect(IfcPsetUtils.decodeIfcString('F\\X\\E1ze')).toBe('Fáze');
    });

    it('should handle mixed encoding', () => {
        expect(IfcPsetUtils.decodeIfcString('S\\X2\\017D\\X0\\_I_F\\X\\E1ze projektu')).toBe('SŽ_I_Fáze projektu');
    });

    it('should be idempotent on plain ASCII', () => {
        expect(IfcPsetUtils.decodeIfcString('Pset_WallCommon')).toBe('Pset_WallCommon');
    });

    it('should handle null/empty', () => {
        expect(IfcPsetUtils.decodeIfcString('')).toBe('');
        expect(IfcPsetUtils.decodeIfcString(null)).toBe(null);
    });
});

describe('IfcPsetUtils.parsePropertyName decodes IFC encoding', () => {
    it('should return decoded name for UTF-16 encoded property', () => {
        // Real IFC line with encoded "SŽ_I_Fáze projektu"
        const line = "#95=IFCPROPERTYSINGLEVALUE('S\\X2\\017D\\X0\\_I_F\\X\\E1ze projektu',$,IFCTEXT('DSPS'),$);";
        expect(IfcPsetUtils.parsePropertyName(line)).toBe('SŽ_I_Fáze projektu');
    });
});

describe('IfcPsetUtils.findPsetOnElement decodes pset name', () => {
    it('should match pset whose stored name has IFC encoding', () => {
        const propertySetMap = new Map();
        propertySetMap.set('100', {
            lineIndex: 5,
            // Encoded "SŽ_Pset" with X2 sequence
            params: "'pset-guid',$,'S\\X2\\017D\\X0\\_Pset',$,(#200)",
            line: "#100=IFCPROPERTYSET(...)",
            type: 'IFCPROPERTYSET'
        });
        const relDefinesMap = new Map();
        relDefinesMap.set('300', {
            lineIndex: 8,
            params: "'rel-guid',$,$,$,(#10),#100",
            line: "#300=IFCRELDEFINESBYPROPERTIES(...)"
        });
        // User passes the DECODED name, not the encoded one
        const result = IfcPsetUtils.findPsetOnElement('10', 'SŽ_Pset', relDefinesMap, propertySetMap);
        expect(result).toBeDefined();
        expect(result.id).toBe('100');
    });
});
