/**
 * bSDD API Service Layer
 * Handles communication with buildingSMART Data Dictionary API
 *
 * Uses a Cloudflare Pages Function proxy (/api/bsdd-proxy) to access the
 * production bSDD API (api.bsdd.buildingsmart.org) which has no CORS headers.
 * Falls back to the test API (test.bsdd.buildingsmart.org) which has CORS
 * enabled but contains fewer dictionaries and search results.
 */
const BsddApi = {
    PRODUCTION_URL: 'https://api.bsdd.buildingsmart.org',
    FALLBACK_URL: 'https://test.bsdd.buildingsmart.org',
    PROXY_PATH: '/api/bsdd-proxy',

    _cache: new Map(),
    _debounceTimer: null,
    _useProxy: null, // null = not tested, true/false after first request
    DEBOUNCE_MS: 300,
    CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes

    /**
     * Build a proxied URL for the production API.
     * The proxy runs on the same domain as the app (Cloudflare Pages Function).
     */
    _proxyUrl(apiUrl) {
        return `${this.PROXY_PATH}?url=${encodeURIComponent(apiUrl)}`;
    },

    /**
     * Build URL for text search (production API path)
     */
    _buildSearchUrl(query, dictionaryUri) {
        const params = new URLSearchParams({ SearchText: query });
        if (dictionaryUri) {
            params.set('DictionaryUri', dictionaryUri);
        }
        return `/api/TextSearch/v2?${params.toString()}`;
    },

    /**
     * Detect whether the proxy is available (runs once, then cached).
     */
    async _detectProxy() {
        if (this._useProxy !== null) {
            return this._useProxy;
        }
        try {
            const testUrl = this._proxyUrl(`${this.PRODUCTION_URL}/api/Dictionary/v1?Limit=1`);
            const response = await fetch(testUrl, {
                headers: { 'Accept': 'application/json' }
            });
            this._useProxy = response.ok;
        } catch {
            this._useProxy = false;
        }
        return this._useProxy;
    },

    /**
     * Fetch with caching. Tries proxy to production API first,
     * falls back to test API with direct CORS access.
     */
    async _fetchCached(apiPath) {
        const cached = this._cache.get(apiPath);
        if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL_MS)) {
            return cached.data;
        }

        const useProxy = await this._detectProxy();

        let fetchUrl;
        if (useProxy) {
            fetchUrl = this._proxyUrl(`${this.PRODUCTION_URL}${apiPath}`);
        } else {
            fetchUrl = `${this.FALLBACK_URL}${apiPath}`;
        }

        const response = await fetch(fetchUrl, {
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`bSDD API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        this._cache.set(apiPath, { data, timestamp: Date.now() });
        return data;
    },

    _pendingReject: null,

    /**
     * Debounced search — returns a Promise that resolves after debounce.
     * Earlier calls are rejected when superseded by a newer call.
     */
    debouncedSearch(query, dictionaryUri) {
        return new Promise((resolve, reject) => {
            clearTimeout(this._debounceTimer);
            if (this._pendingReject) {
                this._pendingReject(new Error('Debounced: superseded by newer call'));
            }
            this._pendingReject = reject;
            this._debounceTimer = setTimeout(async () => {
                this._pendingReject = null;
                try {
                    const results = await this.searchClasses(query, dictionaryUri);
                    resolve(results);
                } catch (e) {
                    reject(e);
                }
            }, this.DEBOUNCE_MS);
        });
    },

    /**
     * Search classes across all or a specific dictionary
     * Returns array of {name, code, uri, dictionaryName}
     */
    async searchClasses(query, dictionaryUri) {
        if (!query || query.length < 2) return [];
        const apiPath = this._buildSearchUrl(query, dictionaryUri);
        const data = await this._fetchCached(apiPath);
        return (data.classes || []).map(cls => ({
            name: cls.name,
            code: cls.code || '',
            uri: cls.uri,
            dictionaryName: cls.dictionaryUri || '',
            dictionaryUri: cls.dictionaryUri || ''
        }));
    },

    /**
     * Get class details including properties
     */
    async getClassDetails(classUri) {
        const apiPath = `/api/Class/v1?uri=${encodeURIComponent(classUri)}&includeClassProperties=true`;
        return this._fetchCached(apiPath);
    },

    /**
     * Get properties of a class
     * Returns array of {name, propertySet, dataType, uri, description}
     */
    async getClassProperties(classUri) {
        const details = await this.getClassDetails(classUri);
        return (details.classProperties || []).map(prop => ({
            name: prop.name,
            propertySet: prop.propertySet || '',
            dataType: prop.dataType || '',
            uri: prop.uri || '',
            description: prop.description || ''
        }));
    },

    /**
     * Get list of available dictionaries
     * Returns array of {name, uri, version}
     */
    async getDictionaries() {
        const data = await this._fetchCached('/api/Dictionary/v1');
        return (data.dictionaries || []).map(dict => ({
            name: dict.name,
            uri: dict.uri,
            version: dict.version || ''
        }));
    },

    /**
     * Clear cache
     */
    clearCache() {
        this._cache.clear();
        this._useProxy = null;
    }
};

window.BsddApi = BsddApi;
