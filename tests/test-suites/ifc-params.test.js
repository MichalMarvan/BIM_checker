describe('IfcParams.splitIfcParams', () => {
    it('should split simple comma-separated', () => {
        expect(IfcParams.splitIfcParams("a,b,c")).toEqual(["a","b","c"]);
    });

    it('should respect quoted strings with commas', () => {
        expect(IfcParams.splitIfcParams("a,'hello, world',b")).toEqual(["a","'hello, world'","b"]);
    });

    it('should respect nested parens', () => {
        expect(IfcParams.splitIfcParams("a,(b,c),d")).toEqual(["a","(b,c)","d"]);
    });

    it('should handle deeply nested parens', () => {
        expect(IfcParams.splitIfcParams("a,(b,(c,d)),e")).toEqual(["a","(b,(c,d))","e"]);
    });

    it('should handle escaped quotes inside strings', () => {
        expect(IfcParams.splitIfcParams("a,'it''s ok',b")).toEqual(["a","'it''s ok'","b"]);
    });

    it('should return empty array for empty input', () => {
        expect(IfcParams.splitIfcParams("")).toEqual([]);
    });
});

describe('IfcParams.unwrapEnumValue', () => {
    it('should strip dots', () => {
        expect(IfcParams.unwrapEnumValue(".STANDARD.")).toBe("STANDARD");
    });
    it('should return null for $', () => {
        expect(IfcParams.unwrapEnumValue("$")).toBeNull();
    });
    it('should return null for empty', () => {
        expect(IfcParams.unwrapEnumValue("")).toBeNull();
    });
    it('should handle whitespace', () => {
        expect(IfcParams.unwrapEnumValue("  .STANDARD.  ")).toBe("STANDARD");
    });
});

describe('IfcParams.unwrapString', () => {
    it('should strip surrounding quotes', () => {
        expect(IfcParams.unwrapString("'hello'")).toBe("hello");
    });
    it('should return null for $', () => {
        expect(IfcParams.unwrapString("$")).toBeNull();
    });
    it('should unescape doubled single quotes', () => {
        expect(IfcParams.unwrapString("'it''s'")).toBe("it's");
    });
});
