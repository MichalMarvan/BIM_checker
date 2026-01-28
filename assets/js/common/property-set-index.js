/* ===========================================
   BIM CHECKER - PROPERTY SET INDEX
   Builds inverted index for O(1) property set lookup
   =========================================== */

const PropertySetIndex = (function() {

    /**
     * Build an inverted index from relDefinesMap
     * Maps: entityId -> [propertySetId, propertySetId, ...]
     *
     * @param {Map} relDefinesMap - Map of IFCRELDEFINESBYPROPERTIES
     * @returns {Map} Inverted index
     */
    function build(relDefinesMap) {
        const index = new Map();

        for (const [relId, rel] of relDefinesMap) {
            // Skip invalid relations
            if (!rel.relatedObjects || !rel.relatingPropertyDefinition) {
                continue;
            }

            const psetId = rel.relatingPropertyDefinition;

            for (const entityId of rel.relatedObjects) {
                if (!index.has(entityId)) {
                    index.set(entityId, []);
                }
                index.get(entityId).push(psetId);
            }
        }

        return index;
    }

    /**
     * Get property set IDs for an entity
     * @param {Map} index - The inverted index
     * @param {string} entityId - Entity ID to look up
     * @returns {Array} Array of property set IDs (empty if none)
     */
    function getPropertySetIds(index, entityId) {
        return index.get(entityId) || [];
    }

    return {
        build,
        getPropertySetIds
    };
})();

// Export for browser
if (typeof window !== 'undefined') {
    window.PropertySetIndex = PropertySetIndex;
}
