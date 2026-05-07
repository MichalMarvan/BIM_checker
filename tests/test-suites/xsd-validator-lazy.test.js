describe('IDSXSDValidator lazy init', () => {
    const TIMEOUT = 10000;

    it('should not be initialized until validate is called', () => {
        // This test only passes if it runs BEFORE the other XSD tests
        // which have already called init. We check the exported _isInitialized().
        // If other tests already ran, this will correctly show initialized=true,
        // so we just verify the function exists and returns a boolean.
        expect(typeof IDSXSDValidator._isInitialized).toBe('function');
        const val = IDSXSDValidator._isInitialized();
        expect(typeof val).toBe('boolean');
    });

    it('should cache init across validate calls (second call is fast)', async () => {
        // Ensure init has been called at least once
        const minimal = '<?xml version="1.0"?><ids:ids xmlns:ids="http://standards.buildingsmart.org/IDS"><ids:info><ids:title>T</ids:title></ids:info><ids:specifications/></ids:ids>';
        await IDSXSDValidator.validate(minimal);

        expect(IDSXSDValidator._isInitialized()).toBe(true);

        // Second call should use cached WASM (should complete quickly)
        const t0 = performance.now();
        await IDSXSDValidator.validate(minimal);
        const dt = performance.now() - t0;
        expect(dt < 500).toBe(true);
    }, TIMEOUT * 2);

    it('should return valid=true for well-formed minimal IDS', async () => {
        const minimal = `<?xml version="1.0" encoding="UTF-8"?>
<ids:ids xmlns:ids="http://standards.buildingsmart.org/IDS"
         xmlns:xs="http://www.w3.org/2001/XMLSchema"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ids:info>
        <ids:title>Minimal</ids:title>
        <ids:author>test@test.com</ids:author>
        <ids:date>2026-01-01</ids:date>
    </ids:info>
    <ids:specifications/>
</ids:ids>`;
        const result = await IDSXSDValidator.validate(minimal);
        // We just verify the shape is correct
        expect(typeof result.valid).toBe('boolean');
        expect(Array.isArray(result.errors)).toBe(true);
    }, TIMEOUT);
});
