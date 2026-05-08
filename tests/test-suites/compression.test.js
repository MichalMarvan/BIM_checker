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

describe('Compression.compress + decompress roundtrip', () => {
    it('compress() returns Uint8Array starting with gzip magic bytes', async () => {
        const result = await Compression.compress('hello world');
        expect(result instanceof Uint8Array).toBe(true);
        expect(result[0]).toBe(0x1f);
        expect(result[1]).toBe(0x8b);
    });

    it('roundtrip simple ASCII string', async () => {
        const original = 'hello world';
        const compressed = await Compression.compress(original);
        const decompressed = await Compression.decompress(compressed);
        expect(decompressed).toBe(original);
    });

    it('roundtrip empty string', async () => {
        const compressed = await Compression.compress('');
        const decompressed = await Compression.decompress(compressed);
        expect(decompressed).toBe('');
    });

    it('roundtrip 100KB string with diacritics + special chars', async () => {
        const sample = 'SŽ_I_Fáze projektu Žluťoučký kůň úpěl ďábelské ódy. ';
        const original = sample.repeat(2000);  // ~100KB
        expect(original.length).toBeGreaterThan(50000);
        const compressed = await Compression.compress(original);
        // gzip should compress repetitive text to a fraction of original
        expect(compressed.length < original.length / 2).toBe(true);
        const decompressed = await Compression.decompress(compressed);
        expect(decompressed).toBe(original);
    });

    it('roundtrip realistic IFC-like text', async () => {
        // Mimic IFC STEP-21 line structure
        const sample = `#${Math.floor(Math.random() * 10000)} = IFCWALL('guid-x', $, 'Wall_001', $, $, $, $, $, $);\n`;
        const original = sample.repeat(500); // realistic small IFC fragment
        const compressed = await Compression.compress(original);
        const decompressed = await Compression.decompress(compressed);
        expect(decompressed).toBe(original);
    });

    it('compress() throws TypeError on non-string input', async () => {
        let threw = false;
        try {
            await Compression.compress(123);
        } catch (e) {
            threw = e instanceof TypeError;
        }
        expect(threw).toBe(true);
    });
});

describe('Compression.decompress backward compatibility', () => {
    it('returns string as-is when given a legacy plain string', async () => {
        const result = await Compression.decompress('legacy plain text content');
        expect(result).toBe('legacy plain text content');
    });

    it('decodes plain UTF-8 Uint8Array (non-gzip) as text', async () => {
        const bytes = new TextEncoder().encode('Hello world');
        // No gzip header → fallback to UTF-8 decode
        const result = await Compression.decompress(bytes);
        expect(result).toBe('Hello world');
    });

    it('returns empty string for null', async () => {
        expect(await Compression.decompress(null)).toBe('');
    });

    it('throws on corrupted gzip bytes', async () => {
        // Magic bytes present but rest is invalid
        const fake = new Uint8Array([0x1f, 0x8b, 0xff, 0xff, 0xff, 0xff]);
        let threw = false;
        try {
            await Compression.decompress(fake);
        } catch (_e) {
            threw = true;
        }
        expect(threw).toBe(true);
    });
});
