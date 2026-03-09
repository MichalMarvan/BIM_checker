// =======================
// bSDD API SERVICE TESTS
// =======================

describe('BsddApi', () => {

    it('should be defined globally', () => {
        expect(typeof BsddApi).toBe('object');
    });

    it('should have BASE_URL pointing to bSDD test API (CORS enabled)', () => {
        expect(BsddApi.BASE_URL).toBe('https://test.bsdd.buildingsmart.org');
    });

    it('should have searchClasses method', () => {
        expect(typeof BsddApi.searchClasses).toBe('function');
    });

    it('should have getClassDetails method', () => {
        expect(typeof BsddApi.getClassDetails).toBe('function');
    });

    it('should have getDictionaries method', () => {
        expect(typeof BsddApi.getDictionaries).toBe('function');
    });

    it('should have getClassProperties method', () => {
        expect(typeof BsddApi.getClassProperties).toBe('function');
    });

    it('should cache dictionary results in memory', async () => {
        expect(BsddApi._cache instanceof Map).toBe(true);
    });

    it('should build correct search URL with query only', () => {
        const url = BsddApi._buildSearchUrl('wall');
        expect(url).toContain('/api/TextSearch/v2');
        expect(url).toContain('SearchText=wall');
    });

    it('should build correct search URL with dictionary filter', () => {
        const url = BsddApi._buildSearchUrl('wall', 'https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3');
        expect(url).toContain('DictionaryUri=');
    });

    it('should debounce rapid calls', () => {
        expect(typeof BsddApi._debounceTimer === 'undefined').toBe(false);
    });

    it('should return empty array for short queries', async () => {
        const result = await BsddApi.searchClasses('a');
        expect(result.length).toBe(0);
    });

    it('should clear cache when clearCache is called', () => {
        BsddApi._cache.set('test-key', { data: {}, timestamp: Date.now() });
        BsddApi.clearCache();
        expect(BsddApi._cache.size).toBe(0);
    });

    it('should use test API endpoint with CORS support', () => {
        expect(BsddApi.BASE_URL).toContain('test.bsdd.buildingsmart.org');
    });

    it('should build URLs directly without proxy', () => {
        const url = BsddApi._buildSearchUrl('wall');
        expect(url).toContain('test.bsdd.buildingsmart.org');
    });
});
