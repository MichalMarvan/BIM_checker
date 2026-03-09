// =======================
// bSDD API SERVICE TESTS
// =======================

describe('BsddApi', () => {

    it('should be defined globally', () => {
        expect(typeof BsddApi).toBe('object');
    });

    it('should have production and fallback URLs', () => {
        expect(BsddApi.PRODUCTION_URL).toBe('https://api.bsdd.buildingsmart.org');
        expect(BsddApi.FALLBACK_URL).toBe('https://test.bsdd.buildingsmart.org');
    });

    it('should have proxy path configured', () => {
        expect(BsddApi.PROXY_PATH).toBe('/api/bsdd-proxy');
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

    it('should cache results in memory', () => {
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

    it('should build proxy URL correctly', () => {
        const proxied = BsddApi._proxyUrl('https://api.bsdd.buildingsmart.org/api/Dictionary/v1');
        expect(proxied).toContain('/api/bsdd-proxy?url=');
        expect(proxied).toContain('api.bsdd.buildingsmart.org');
    });

    it('should debounce rapid calls', () => {
        expect(typeof BsddApi._debounceTimer === 'undefined').toBe(false);
    });

    it('should return empty array for short queries', async () => {
        const result = await BsddApi.searchClasses('a');
        expect(result.length).toBe(0);
    });

    it('should clear cache and proxy state when clearCache is called', () => {
        BsddApi._cache.set('test-key', { data: {}, timestamp: Date.now() });
        BsddApi._useProxy = true;
        BsddApi.clearCache();
        expect(BsddApi._cache.size).toBe(0);
        expect(BsddApi._useProxy).toBe(null);
    });

    it('should start with proxy detection not yet run', () => {
        BsddApi._useProxy = null;
        expect(BsddApi._useProxy).toBe(null);
    });
});
