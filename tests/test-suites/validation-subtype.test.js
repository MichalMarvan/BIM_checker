/* SPDX-License-Identifier: AGPL-3.0-or-later */
describe('Validation: subtype matching', () => {
    beforeEach(async () => {
        await IFCHierarchy.load('IFC4');
    });

    function ctx() {
        return {
            ifcVersion: 'IFC4',
            isSubtypeOf: (child, anc) => IFCHierarchy.isSubtypeOf('IFC4', child, anc),
            getPredefinedTypeIndex: (cls) => IFCHierarchy.getPredefinedTypeIndex('IFC4', cls),
            getObjectTypeIndex: (cls) => IFCHierarchy.getObjectTypeIndex('IFC4', cls)
        };
    }

    it('should match exact entity name', () => {
        const facet = { type: 'entity', name: { type: 'simple', value: 'IFCWALL' } };
        expect(ValidationEngine.checkEntityFacet({ entity: 'IFCWALL' }, facet, ctx())).toBe(true);
    });

    it('should match subtype via inheritance', () => {
        const facet = { type: 'entity', name: { type: 'simple', value: 'IFCWALL' } };
        expect(ValidationEngine.checkEntityFacet({ entity: 'IFCWALLSTANDARDCASE' }, facet, ctx())).toBe(true);
    });

    it('should NOT match unrelated entity', () => {
        const facet = { type: 'entity', name: { type: 'simple', value: 'IFCWALL' } };
        expect(ValidationEngine.checkEntityFacet({ entity: 'IFCDOOR' }, facet, ctx())).toBe(false);
    });

    it('should match enumeration value with subtype', () => {
        const facet = { type: 'entity', name: { type: 'enumeration', values: ['IFCWALL', 'IFCDOOR'] } };
        expect(ValidationEngine.checkEntityFacet({ entity: 'IFCWALLSTANDARDCASE' }, facet, ctx())).toBe(true);
    });

    it('should match abstract parent class', () => {
        // IFC4 ADD2 uses IFCBUILDINGELEMENT (not IFCBUILTELEMENT)
        const facet = { type: 'entity', name: { type: 'simple', value: 'IFCBUILDINGELEMENT' } };
        expect(ValidationEngine.checkEntityFacet({ entity: 'IFCWALL' }, facet, ctx())).toBe(true);
    });

    it('should match regex pattern without inheritance', () => {
        const facet = { type: 'entity', name: { type: 'restriction', isRegex: true, pattern: '^IFCWALL.*' } };
        expect(ValidationEngine.checkEntityFacet({ entity: 'IFCWALLSTANDARDCASE' }, facet, ctx())).toBe(true);
        expect(ValidationEngine.checkEntityFacet({ entity: 'IFCDOOR' }, facet, ctx())).toBe(false);
    });

    it('should return true when no name constraint', () => {
        const facet = { type: 'entity' };
        expect(ValidationEngine.checkEntityFacet({ entity: 'IFCWALL' }, facet, ctx())).toBe(true);
    });
});
