/**
 * bSDD API Service Layer
 * Handles communication with buildingSMART Data Dictionary API
 * https://api.bsdd.buildingsmart.org
 */
const BsddApi = {
    BASE_URL: 'https://api.bsdd.buildingsmart.org',
    CORS_PROXY: 'https://corsproxy.io/?',

    _cache: new Map(),
    _debounceTimer: null,
    DEBOUNCE_MS: 300,
    CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes

    /**
     * Get proxied URL to bypass CORS restrictions.
     * bSDD API requires domain registration for CORS — we use a proxy for browser access.
     */
    _proxyUrl(url) {
        return this.CORS_PROXY + encodeURIComponent(url);
    },

    /**
     * Build URL for text search
     */
    _buildSearchUrl(query, dictionaryUri) {
        const params = new URLSearchParams({ SearchText: query });
        if (dictionaryUri) {
            params.set('DictionaryUri', dictionaryUri);
        }
        return `${this.BASE_URL}/api/TextSearch/v2?${params.toString()}`;
    },

    /**
     * Fetch with caching. Uses CORS proxy for browser compatibility.
     */
    async _fetchCached(url) {
        const cached = this._cache.get(url);
        if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL_MS)) {
            return cached.data;
        }

        const fetchUrl = this._proxyUrl(url);
        const response = await fetch(fetchUrl, {
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`bSDD API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        this._cache.set(url, { data, timestamp: Date.now() });
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
        const url = this._buildSearchUrl(query, dictionaryUri);
        const data = await this._fetchCached(url);
        // API returns classes at top level with dictionaryUri per class
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
        const url = `${this.BASE_URL}/api/Class/v1?uri=${encodeURIComponent(classUri)}&includeClassProperties=true`;
        return this._fetchCached(url);
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
        const url = `${this.BASE_URL}/api/Dictionary/v1`;
        const data = await this._fetchCached(url);
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
    }
};

window.BsddApi = BsddApi;
