/* ===========================================
   BIM CHECKER - REGEX CACHE
   Caches compiled RegExp objects for reuse
   =========================================== */

const RegexCache = (function() {
    const cache = new Map();

    /**
     * Get or create a compiled regex for the given pattern
     * @param {string} pattern - The regex pattern
     * @param {string} [flags=''] - Optional regex flags
     * @returns {RegExp} Compiled regex
     */
    function get(pattern, flags = '') {
        const key = `${pattern}|||${flags}`;

        if (!cache.has(key)) {
            cache.set(key, new RegExp(pattern, flags));
        }

        return cache.get(key);
    }

    /**
     * Clear the cache
     */
    function clear() {
        cache.clear();
    }

    /**
     * Get current cache size
     * @returns {number}
     */
    function size() {
        return cache.size;
    }

    return {
        get,
        clear,
        size
    };
})();

// Export for browser
if (typeof window !== 'undefined') {
    window.RegexCache = RegexCache;
}
