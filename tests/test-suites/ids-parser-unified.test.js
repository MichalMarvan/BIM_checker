describe('IDSParser', () => {
    it('should expose IDSParser namespace globally', () => {
        expect(typeof window.IDSParser).toBe('object');
        expect(typeof window.IDSParser.parse).toBe('function');
    });
});
