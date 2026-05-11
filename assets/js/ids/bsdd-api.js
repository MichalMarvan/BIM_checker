/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * bSDD API Service Layer
 * Handles communication with buildingSMART Data Dictionary API
 *
 * Calls the production bSDD API directly — checkthebim.com is on the CORS whitelist.
 */
const BsddApi = {
    BASE_URL: 'https://api.bsdd.buildingsmart.org',

    _cache: new Map(),
    _debounceTimer: null,
    DEBOUNCE_MS: 300,
    CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes

    /**
     * Build URL for text search
     */
    _buildSearchUrl(query, dictionaryUri) {
        const params = new URLSearchParams({ SearchText: query });
        if (dictionaryUri) {
            params.set('DictionaryUri', dictionaryUri);
        }
        return `/api/TextSearch/v2?${params.toString()}`;
    },

    /**
     * Fetch with caching.
     */
    async _fetchCached(apiPath) {
        const cached = this._cache.get(apiPath);
        if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL_MS)) {
            return cached.data;
        }

        const response = await fetch(`${this.BASE_URL}${apiPath}`, {
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
    }
};

window.BsddApi = BsddApi;
