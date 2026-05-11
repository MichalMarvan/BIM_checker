/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
describe('Validation: predefinedType matching', () => {
    beforeEach(async () => {
        await IFCHierarchy.load('IFC4');
    });

    function ctx() {
        return {
            ifcVersion: 'IFC4',
            isSubtypeOf: (c, a) => IFCHierarchy.isSubtypeOf('IFC4', c, a),
            getPredefinedTypeIndex: (cls) => IFCHierarchy.getPredefinedTypeIndex('IFC4', cls),
            getObjectTypeIndex: (cls) => IFCHierarchy.getObjectTypeIndex('IFC4', cls),
            splitParams: IfcParams.splitIfcParams,
            unwrapEnumValue: IfcParams.unwrapEnumValue,
            unwrapString: IfcParams.unwrapString
        };
    }

    function wallEntity(predef, objType = '$') {
        // IFCWALL params: GlobalId, OwnerHistory, Name, Description, ObjectType, ObjectPlacement, Representation, Tag, PredefinedType
        return {
            entity: 'IFCWALL',
            params: `'guid',#10,'Wall','desc',${objType},#20,#30,$,${predef}`
        };
    }

    it('should match simple predefinedType', () => {
        const facet = { type: 'entity', name: { type: 'simple', value: 'IFCWALL' }, predefinedType: { type: 'simple', value: 'STANDARD' } };
        expect(ValidationEngine.checkEntityFacet(wallEntity('.STANDARD.'), facet, ctx())).toBe(true);
    });

    it('should reject non-matching predefinedType', () => {
        const facet = { type: 'entity', name: { type: 'simple', value: 'IFCWALL' }, predefinedType: { type: 'simple', value: 'STANDARD' } };
        expect(ValidationEngine.checkEntityFacet(wallEntity('.MOVABLE.'), facet, ctx())).toBe(false);
    });

    it('should match USERDEFINED via ObjectType', () => {
        const facet = { type: 'entity', name: { type: 'simple', value: 'IFCWALL' }, predefinedType: { type: 'simple', value: 'CustomWall' } };
        expect(ValidationEngine.checkEntityFacet(wallEntity('.USERDEFINED.', "'CustomWall'"), facet, ctx())).toBe(true);
    });

    it('should reject when entity has $ predefinedType', () => {
        const facet = { type: 'entity', name: { type: 'simple', value: 'IFCWALL' }, predefinedType: { type: 'simple', value: 'STANDARD' } };
        expect(ValidationEngine.checkEntityFacet(wallEntity('$'), facet, ctx())).toBe(false);
    });

    it('should match enumeration predefinedType', () => {
        const facet = { type: 'entity', name: { type: 'simple', value: 'IFCWALL' }, predefinedType: { type: 'enumeration', values: ['STANDARD', 'MOVABLE'] } };
        expect(ValidationEngine.checkEntityFacet(wallEntity('.STANDARD.'), facet, ctx())).toBe(true);
        expect(ValidationEngine.checkEntityFacet(wallEntity('.PARTITIONING.'), facet, ctx())).toBe(false);
    });
});
