// =======================
// VALIDATION ENGINE TESTS
// =======================

describe('Validation Engine', () => {

    const mockEntity = {
        guid: '2xd7f8$3jDwBD4L9fK3J4x',
        entity: 'IFCWALL',
        name: 'Test Wall',
        propertySets: {
            'Pset_WallCommon': {
                'IsExternal': true,
                'FireRating': 'REI60'
            }
        },
        attributes: {
            Name: 'Test Wall',
            GlobalId: '2xd7f8$3jDwBD4L9fK3J4x'
        }
    };

    describe('Entity Facet', () => {
        it('should match simple entity type', () => {
            const facet = { type: 'entity', name: { type: 'simple', value: 'IFCWALL' } };
            const result = ValidationEngine.checkEntityFacet(mockEntity, facet);
            expect(result).toBe(true);
        });

        it('should not match different entity type', () => {
            const facet = { type: 'entity', name: { type: 'simple', value: 'IFCDOOR' } };
            const result = ValidationEngine.checkEntityFacet(mockEntity, facet);
            expect(result).toBe(false);
        });

        it('should match regex pattern', () => {
            const facet = { type: 'entity', name: { type: 'restriction', isRegex: true, pattern: 'IFCWALL.*' } };
            const result = ValidationEngine.checkEntityFacet(mockEntity, facet);
            expect(result).toBe(true);
        });
    });

    describe('Property Facet', () => {
        it('should find existing property', () => {
            const facet = {
                type: 'property',
                propertySet: { type: 'simple', value: 'Pset_WallCommon' },
                name: { type: 'simple', value: 'IsExternal' }
            };
            const result = ValidationEngine.checkPropertyFacet(mockEntity, facet, true);
            expect(result).toBe(true);
        });

        it('should not find missing property', () => {
            const facet = {
                type: 'property',
                propertySet: { type: 'simple', value: 'Pset_WallCommon' },
                name: { type: 'simple', value: 'NonExistent' }
            };
            const result = ValidationEngine.checkPropertyFacet(mockEntity, facet, true);
            expect(result).toBe(false);
        });

        it('should validate property value', () => {
            const facet = {
                type: 'property',
                propertySet: { type: 'simple', value: 'Pset_WallCommon' },
                name: { type: 'simple', value: 'FireRating' },
                value: { type: 'simple', value: 'REI60' }
            };
            const result = ValidationEngine.checkPropertyFacet(mockEntity, facet, true);
            expect(result).toBe(true);
        });
    });

    describe('Attribute Facet', () => {
        it('should find existing attribute', () => {
            const facet = {
                type: 'attribute',
                name: { type: 'simple', value: 'Name' }
            };
            const result = ValidationEngine.checkAttributeFacet(mockEntity, facet, true);
            expect(result).toBe(true);
        });

        it('should validate attribute value', () => {
            const facet = {
                type: 'attribute',
                name: { type: 'simple', value: 'Name' },
                value: { type: 'simple', value: 'Test Wall' }
            };
            const result = ValidationEngine.checkAttributeFacet(mockEntity, facet, true);
            expect(result).toBe(true);
        });
    });

    describe('Batch Validation', () => {
        it('should validate multiple entities', () => {
            const entities = [mockEntity, { ...mockEntity, guid: 'different' }];
            const spec = {
                name: 'Test Spec',
                applicability: [{ type: 'entity', name: { type: 'simple', value: 'IFCWALL' } }],
                requirements: []
            };

            const results = ValidationEngine.validateBatch(entities, spec);
            expect(results.entityResults.length).toBe(2);
        });

        it('should filter by applicability', () => {
            const entities = [
                mockEntity,
                { ...mockEntity, entity: 'IFCDOOR', guid: 'door-guid' }
            ];
            const spec = {
                name: 'Wall Spec',
                applicability: [{ type: 'entity', name: { type: 'simple', value: 'IFCWALL' } }],
                requirements: []
            };

            const results = ValidationEngine.validateBatch(entities, spec);
            expect(results.entityResults.length).toBe(1);
        });

        it('should count pass and fail', () => {
            const entities = [mockEntity];
            const spec = {
                name: 'Test Spec',
                applicability: [{ type: 'entity', name: { type: 'simple', value: 'IFCWALL' } }],
                requirements: [
                    {
                        type: 'property',
                        propertySet: { type: 'simple', value: 'Pset_WallCommon' },
                        name: { type: 'simple', value: 'IsExternal' }
                    }
                ]
            };

            const results = ValidationEngine.validateBatch(entities, spec);
            expect(results.passCount).toBe(1);
            expect(results.failCount).toBe(0);
        });
    });

});
