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
