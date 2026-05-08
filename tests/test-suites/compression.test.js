describe('Compression namespace', () => {
    it('should expose Compression namespace globally', () => {
        expect(typeof window.Compression).toBe('object');
        const expected = ['compress', 'decompress', 'isGzipped', 'isSupported'];
        for (const fn of expected) {
            expect(typeof window.Compression[fn]).toBe('function');
        }
    });

    it('isSupported() returns true in test environment', () => {
        expect(Compression.isSupported()).toBe(true);
    });
});
