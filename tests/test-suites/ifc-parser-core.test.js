describe('IFCParserCore namespace', () => {
    it('should expose IFCParserCore globally', () => {
        expect(typeof window.IFCParserCore).toBe('object');
        expect(typeof window.IFCParserCore.parseIFCContent).toBe('function');
    });
});
