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
