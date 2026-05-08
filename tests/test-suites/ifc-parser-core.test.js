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
