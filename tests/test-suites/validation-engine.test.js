/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
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
        it('should validate multiple entities', async () => {
            const entities = [mockEntity, { ...mockEntity, guid: 'different' }];
            const spec = {
                name: 'Test Spec',
                applicability: [{ type: 'entity', name: { type: 'simple', value: 'IFCWALL' } }],
                requirements: []
            };

            const results = await ValidationEngine.validateBatch(entities, spec);
            expect(results.entityResults.length).toBe(2);
        });

        it('should filter by applicability', async () => {
            const entities = [
                mockEntity,
                { ...mockEntity, entity: 'IFCDOOR', guid: 'door-guid' }
            ];
            const spec = {
                name: 'Wall Spec',
                applicability: [{ type: 'entity', name: { type: 'simple', value: 'IFCWALL' } }],
                requirements: []
            };

            const results = await ValidationEngine.validateBatch(entities, spec);
            expect(results.entityResults.length).toBe(1);
        });

        it('should count pass and fail', async () => {
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

            const results = await ValidationEngine.validateBatch(entities, spec);
            expect(results.passCount).toBe(1);
            expect(results.failCount).toBe(0);
        });
    });

    describe('Unsupported facets are never reported as passed', () => {
        const wallApplicability = [{ type: 'entity', name: { type: 'simple', value: 'IFCWALL' } }];
        const propertyRequirement = {
            type: 'property',
            propertySet: { type: 'simple', value: 'Pset_WallCommon' },
            name: { type: 'simple', value: 'IsExternal' }
        };

        it('should skip a spec with a partOf requirement', async () => {
            const spec = {
                name: 'PartOf Spec',
                applicability: wallApplicability,
                requirements: [{ type: 'partOf', relation: 'IFCRELCONTAINEDINSPATIALSTRUCTURE' }, propertyRequirement]
            };
            const result = await ValidationEngine.validateBatch([mockEntity], spec);
            expect(result.status).toBe('skipped');
            expect(result.skipReason).toBe('unsupported-facet');
            expect(result.unsupportedFacets.join(',')).toBe('partOf');
            expect(result.entityResults.length).toBe(0);
        });

        it('should skip a spec with a classification or material requirement', async () => {
            const spec = {
                name: 'Class Spec',
                applicability: wallApplicability,
                requirements: [{ type: 'classification' }, { type: 'material' }]
            };
            const result = await ValidationEngine.validateBatch([mockEntity], spec);
            expect(result.status).toBe('skipped');
            expect(result.unsupportedFacets.join(',')).toBe('classification,material');
        });

        it('should skip a spec with a partOf applicability facet', async () => {
            const spec = {
                name: 'Applicability Spec',
                applicability: [{ type: 'partOf', relation: 'IFCRELAGGREGATES' }],
                requirements: [propertyRequirement]
            };
            const result = await ValidationEngine.validateBatch([mockEntity], spec);
            expect(result.status).toBe('skipped');
        });

        it('should still evaluate specs with only supported facets', async () => {
            const spec = { name: 'Ok Spec', applicability: wallApplicability, requirements: [propertyRequirement] };
            const result = await ValidationEngine.validateBatch([mockEntity], spec);
            expect(result.status).toBe('pass');
            expect(ValidationEngine.findUnsupportedFacets(spec).length).toBe(0);
        });
    });

});
