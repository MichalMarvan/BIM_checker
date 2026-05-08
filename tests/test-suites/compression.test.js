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

describe('Compression.isGzipped', () => {
    it('should detect gzip magic bytes 0x1f 0x8b', () => {
        const bytes = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00]);
        expect(Compression.isGzipped(bytes)).toBe(true);
    });

    it('should reject non-gzip bytes', () => {
        const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
        expect(Compression.isGzipped(bytes)).toBe(false);
    });

    it('should accept ArrayBuffer input', () => {
        const buf = new Uint8Array([0x1f, 0x8b, 0x00]).buffer;
        expect(Compression.isGzipped(buf)).toBe(true);
    });

    it('should return false for null', () => {
        expect(Compression.isGzipped(null)).toBe(false);
    });

    it('should return false for empty array', () => {
        expect(Compression.isGzipped(new Uint8Array(0))).toBe(false);
    });

    it('should return false for single-byte array', () => {
        expect(Compression.isGzipped(new Uint8Array([0x1f]))).toBe(false);
    });
});
