// =======================
// PROPERTY SET INDEX TESTS
// =======================

describe('Property Set Index Builder', () => {

    it('should build empty index for empty relations', () => {
        const relDefinesMap = new Map();
        const index = PropertySetIndex.build(relDefinesMap);

        expect(index).toBeDefined();
        expect(index.size).toBe(0);
    });

    it('should map entity to its property sets', () => {
        const relDefinesMap = new Map();
        relDefinesMap.set('100', {
            relatedObjects: ['1', '2', '3'],
            relatingPropertyDefinition: '50'
        });

        const index = PropertySetIndex.build(relDefinesMap);

        expect(index.get('1')).toContain('50');
        expect(index.get('2')).toContain('50');
        expect(index.get('3')).toContain('50');
    });

    it('should handle entity with multiple property sets', () => {
        const relDefinesMap = new Map();
        relDefinesMap.set('100', {
            relatedObjects: ['1'],
            relatingPropertyDefinition: '50'
        });
        relDefinesMap.set('101', {
            relatedObjects: ['1'],
            relatingPropertyDefinition: '51'
        });

        const index = PropertySetIndex.build(relDefinesMap);

        expect(index.get('1').length).toBe(2);
        expect(index.get('1')).toContain('50');
        expect(index.get('1')).toContain('51');
    });

    it('should return empty array for entity without property sets', () => {
        const relDefinesMap = new Map();
        relDefinesMap.set('100', {
            relatedObjects: ['1'],
            relatingPropertyDefinition: '50'
        });

        const index = PropertySetIndex.build(relDefinesMap);

        expect(index.get('999')).toBeUndefined();
        expect(PropertySetIndex.getPropertySetIds(index, '999')).toEqual([]);
    });

    it('should handle null relatedObjects gracefully', () => {
        const relDefinesMap = new Map();
        relDefinesMap.set('100', {
            relatedObjects: null,
            relatingPropertyDefinition: '50'
        });

        const index = PropertySetIndex.build(relDefinesMap);
        expect(index.size).toBe(0);
    });

    it('should handle missing relatingPropertyDefinition', () => {
        const relDefinesMap = new Map();
        relDefinesMap.set('100', {
            relatedObjects: ['1', '2'],
            relatingPropertyDefinition: null
        });

        const index = PropertySetIndex.build(relDefinesMap);
        // Should not add null property set references
        expect(PropertySetIndex.getPropertySetIds(index, '1')).toEqual([]);
    });

});
