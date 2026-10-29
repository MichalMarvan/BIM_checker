/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
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
    RETRY_AFTER_CAP_MS: 4000, // never wait longer than this on a 429

    /**
     * Build URL for text search.
     *
     * When a dictionary filter is set we use /api/SearchInDictionary/v1 because
     * /api/TextSearch/v2 silently returns zero matches for the IFC dictionaries
     * (and others) when filtered, regardless of which parameter spelling is
     * used. SearchInDictionary actually indexes the per-dictionary class list
     * and returns the IFC entities (Wall, Curtain Wall, …) we want.
     *
     * Without a filter we stay on /api/TextSearch/v2 — its global index is
     * what the unfiltered autocomplete should hit.
     */
    _buildSearchUrl(query, dictionaryUri) {
        const params = new URLSearchParams({ SearchText: query });
        if (dictionaryUri) {
            params.set('DictionaryUri', dictionaryUri);
            return `/api/SearchInDictionary/v1?${params.toString()}`;
        }
        return `/api/TextSearch/v2?${params.toString()}`;
    },

    /**
     * Parse the Retry-After header (seconds or HTTP date) into a delay,
     * capped at RETRY_AFTER_CAP_MS.
     */
    _retryAfterMs(response) {
        const header = response.headers.get('Retry-After');
        let ms = NaN;
        if (header) {
            const seconds = Number(header);
            ms = Number.isFinite(seconds)
                ? seconds * 1000
                : new Date(header).getTime() - Date.now();
        }
        if (!Number.isFinite(ms) || ms < 0) {
            ms = 1000;
        }
        return Math.min(ms, this.RETRY_AFTER_CAP_MS);
    },

    _rateLimitError() {
        const error = new Error('bSDD API error: 429 Too Many Requests');
        error.name = 'BsddRateLimitError';
        error.status = 429;
        return error;
    },

    /**
     * Fetch with caching. A 429 gets a single retry after the server's
     * Retry-After delay; a persistent 429 throws a BsddRateLimitError so
     * the UI can tell rate limiting apart from a network failure.
     * Only 2xx responses are cached.
     */
    async _fetchCached(apiPath) {
        const cached = this._cache.get(apiPath);
        if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL_MS)) {
            return cached.data;
        }

        let response = await fetch(`${this.BASE_URL}${apiPath}`, {
            headers: { 'Accept': 'application/json' }
        });

        if (response.status === 429) {
            await new Promise(resolve => setTimeout(resolve, this._retryAfterMs(response)));
            response = await fetch(`${this.BASE_URL}${apiPath}`, {
                headers: { 'Accept': 'application/json' }
            });
            if (response.status === 429) {
                throw this._rateLimitError();
            }
        }

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
                const superseded = new Error('Debounced: superseded by newer call');
                superseded.name = 'SupersededError';
                this._pendingReject(superseded);
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
     *
     * Two endpoints, two response shapes:
     *   TextSearch/v2        -> { classes: [{name, code, uri, dictionaryUri}] }
     *   SearchInDictionary/v1 -> { dictionary: { uri, classes: [{name, referenceCode, uri, classType}] } }
     */
    async searchClasses(query, dictionaryUri) {
        if (!query || query.length < 2) return [];
        const apiPath = this._buildSearchUrl(query, dictionaryUri);
        const data = await this._fetchCached(apiPath);
        // SearchInDictionary/v1 delivers a proper dictionary name;
        // TextSearch/v2 classes only carry dictionaryUri, so derive a label.
        const dictionary = dictionaryUri ? (data.dictionary || {}) : null;
        const classes = dictionary ? (dictionary.classes || []) : (data.classes || []);
        return classes.map(cls => ({
            name: cls.name,
            code: cls.code || cls.referenceCode || '',
            uri: cls.uri,
            dictionaryName: (dictionary && dictionary.name)
                || this._dictionaryLabel(cls.dictionaryUri || dictionaryUri),
            dictionaryUri: cls.dictionaryUri || dictionaryUri || ''
        }));
    },

    /**
     * Turn a dictionary URI into a readable label, e.g.
     * https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3 -> buildingsmart/ifc/4.3
     */
    _dictionaryLabel(uri) {
        if (!uri) return '';
        try {
            const parsed = new URL(uri);
            return parsed.pathname.replace(/^\/uri\//, '').replace(/^\//, '') || parsed.host;
        } catch {
            return String(uri);
        }
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
