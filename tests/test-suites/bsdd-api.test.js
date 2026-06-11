/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
// =======================
// bSDD API SERVICE TESTS
// =======================

describe('BsddApi', () => {

    it('should be defined globally', () => {
        expect(typeof BsddApi).toBe('object');
    });

    it('should have base URL pointing to production API', () => {
        expect(BsddApi.BASE_URL).toBe('https://api.bsdd.buildingsmart.org');
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
        expect(url.includes('DictionaryUri')).toBe(false);
    });

    it('should switch to SearchInDictionary endpoint when a dictionary filter is set', () => {
        const url = BsddApi._buildSearchUrl('wall', 'https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3');
        // TextSearch/v2 silently ignores DictionaryUri and returns global etim results,
        // so a filtered query must hit SearchInDictionary/v1 instead.
        expect(url).toContain('/api/SearchInDictionary/v1');
        expect(url.includes('/api/TextSearch')).toBe(false);
        expect(url).toContain('SearchText=wall');
        expect(url).toContain('DictionaryUri=');
        expect(url).toContain(encodeURIComponent('https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3'));
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
});
