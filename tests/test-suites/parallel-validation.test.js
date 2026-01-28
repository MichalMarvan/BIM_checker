// =======================
// PARALLEL VALIDATION INTEGRATION TESTS
// =======================

describe('Parallel Validation Integration', () => {

    it('should validate entities using ValidationEngine', () => {
        const entities = [
            {
                guid: 'test-guid-1',
                entity: 'IFCWALL',
                name: 'Wall 1',
                propertySets: {},
                attributes: { Name: 'Wall 1', GlobalId: 'test-guid-1' }
            }
        ];

        const spec = {
            name: 'Wall Check',
            applicability: [
                { type: 'entity', name: { type: 'simple', value: 'IFCWALL' } }
            ],
            requirements: []
        };

        const result = ValidationEngine.validateBatch(entities, spec);

        expect(result.specification).toBe('Wall Check');
        expect(result.entityResults.length).toBe(1);
        expect(result.passCount).toBe(1);
    });

    it('should use RegexCache for repeated patterns', () => {
        RegexCache.clear();

        const pattern = 'IFCWALL.*';
        const regex1 = RegexCache.get(pattern);
        const regex2 = RegexCache.get(pattern);

        expect(regex1).toBe(regex2);
        expect(RegexCache.size()).toBe(1);
    });

    it('should build property set index correctly', () => {
        const relDefinesMap = new Map();
        relDefinesMap.set('rel1', {
            relatedObjects: ['entity1', 'entity2'],
            relatingPropertyDefinition: 'pset1'
        });

        const index = PropertySetIndex.build(relDefinesMap);

        expect(PropertySetIndex.getPropertySetIds(index, 'entity1')).toContain('pset1');
        expect(PropertySetIndex.getPropertySetIds(index, 'entity2')).toContain('pset1');
    });

    it('should determine correct strategy for file sizes', () => {
        expect(ValidationOrchestrator.determineStrategy(10 * 1024 * 1024)).toBe('single');
        expect(ValidationOrchestrator.determineStrategy(100 * 1024 * 1024)).toBe('parallel');
    });

    it('should have all parallel validation components available', () => {
        expect(typeof RegexCache).toBe('object');
        expect(typeof PropertySetIndex).toBe('object');
        expect(typeof WorkerPool).toBe('function');
        expect(typeof ValidationEngine).toBe('object');
        expect(typeof ValidationOrchestrator).toBe('function');
        expect(typeof ProgressPanel).toBe('function');
    });

    it('should validate complex entity with properties', () => {
        const entity = {
            guid: 'test-guid',
            entity: 'IFCWALL',
            name: 'External Wall',
            propertySets: {
                'Pset_WallCommon': {
                    'IsExternal': true,
                    'FireRating': 'REI60'
                }
            },
            attributes: {
                Name: 'External Wall',
                GlobalId: 'test-guid'
            }
        };

        const spec = {
            name: 'External Wall Check',
            applicability: [
                { type: 'entity', name: { type: 'simple', value: 'IFCWALL' } }
            ],
            requirements: [
                {
                    type: 'property',
                    propertySet: { type: 'simple', value: 'Pset_WallCommon' },
                    name: { type: 'simple', value: 'IsExternal' }
                }
            ]
        };

        const result = ValidationEngine.validateBatch([entity], spec);

        expect(result.entityResults.length).toBe(1);
        expect(result.entityResults[0].status).toBe('pass');
    });

    it('should filter entities by applicability', () => {
        const entities = [
            { guid: '1', entity: 'IFCWALL', name: 'Wall', propertySets: {}, attributes: {} },
            { guid: '2', entity: 'IFCDOOR', name: 'Door', propertySets: {}, attributes: {} },
            { guid: '3', entity: 'IFCWALL', name: 'Wall 2', propertySets: {}, attributes: {} }
        ];

        const applicability = [
            { type: 'entity', name: { type: 'simple', value: 'IFCWALL' } }
        ];

        const filtered = ValidationEngine.filterByApplicability(entities, applicability);

        expect(filtered.length).toBe(2);
        expect(filtered.every(e => e.entity === 'IFCWALL')).toBe(true);
    });

    it('should handle regex in entity facet', () => {
        const entities = [
            { guid: '1', entity: 'IFCWALLSTANDARDCASE', name: 'Wall', propertySets: {}, attributes: {} },
            { guid: '2', entity: 'IFCWALL', name: 'Wall 2', propertySets: {}, attributes: {} },
            { guid: '3', entity: 'IFCDOOR', name: 'Door', propertySets: {}, attributes: {} }
        ];

        const applicability = [
            { type: 'entity', name: { type: 'restriction', isRegex: true, pattern: 'IFCWALL.*' } }
        ];

        const filtered = ValidationEngine.filterByApplicability(entities, applicability);

        expect(filtered.length).toBe(2);
    });

});
