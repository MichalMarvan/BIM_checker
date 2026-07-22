/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
describe('IDS 1.0 validation semantics', () => {
    const simple = value => ({ type: 'simple', value });
    const entityFacet = name => ({ type: 'entity', name: simple(name) });

    function wall(overrides) {
        return {
            id: '1',
            guid: 'wall-guid',
            entity: 'IFCWALL',
            name: 'Wall',
            fileName: 'test.ifc',
            params: "'wall-guid',$,'Wall',$,$,$,$,$,.STANDARD.",
            attributes: { GlobalId: 'wall-guid', Name: 'Wall' },
            properties: [],
            propertySets: {},
            relations: [],
            classifications: [],
            materials: [],
            hasMaterial: false,
            ...overrides
        };
    }

    function spec(overrides) {
        return {
            name: 'Wall specification',
            ifcVersions: ['IFC4'],
            minOccurs: '1',
            maxOccurs: 'unbounded',
            applicability: [entityFacet('IFCWALL')],
            requirements: [],
            ...overrides
        };
    }

    it('enforces required, optional and prohibited requirement cardinality', async () => {
        const property = {
            type: 'property',
            propertySet: simple('Pset_WallCommon'),
            baseName: simple('FireRating'),
            value: simple('EI60')
        };
        const missing = wall();
        const correct = wall({
            properties: [{
                setName: 'Pset_WallCommon',
                name: 'FireRating',
                values: [{ value: 'EI60', dataType: 'IFCLABEL' }],
                dataType: 'IFCLABEL',
                supported: true
            }]
        });
        const wrong = wall({
            properties: [{
                setName: 'Pset_WallCommon',
                name: 'FireRating',
                values: [{ value: 'EI30', dataType: 'IFCLABEL' }],
                dataType: 'IFCLABEL',
                supported: true
            }]
        });

        let result = await ValidationEngine.validateBatch([missing], spec({ requirements: [{ ...property, cardinality: 'required' }] }), { ifcSchema: 'IFC4' });
        expect(result.status).toBe('fail');

        result = await ValidationEngine.validateBatch([missing], spec({ requirements: [{ ...property, cardinality: 'optional' }] }), { ifcSchema: 'IFC4' });
        expect(result.status).toBe('pass');
        result = await ValidationEngine.validateBatch([wrong], spec({ requirements: [{ ...property, cardinality: 'optional' }] }), { ifcSchema: 'IFC4' });
        expect(result.status).toBe('fail');

        result = await ValidationEngine.validateBatch([correct], spec({ requirements: [{ ...property, cardinality: 'prohibited' }] }), { ifcSchema: 'IFC4' });
        expect(result.status).toBe('fail');
        result = await ValidationEngine.validateBatch([wrong], spec({ requirements: [{ ...property, cardinality: 'prohibited' }] }), { ifcSchema: 'IFC4' });
        expect(result.status).toBe('pass');
    });

    it('enforces applicability occurrences including zero-applicability results', async () => {
        let result = await ValidationEngine.validateBatch([], spec(), { ifcSchema: 'IFC4' });
        expect(result.status).toBe('fail');
        expect(result.applicableCount).toBe(0);
        expect(result.occurrence.status).toBe('fail');

        result = await ValidationEngine.validateBatch([], spec({ minOccurs: '0' }), { ifcSchema: 'IFC4' });
        expect(result.status).toBe('pass');

        result = await ValidationEngine.validateBatch([wall()], spec({ minOccurs: '0', maxOccurs: '0' }), { ifcSchema: 'IFC4' });
        expect(result.status).toBe('fail');
        expect(result.entityResults.length).toBe(0);

        result = await ValidationEngine.validateBatch([], spec({ minOccurs: '0', maxOccurs: '0' }), { ifcSchema: 'IFC4' });
        expect(result.status).toBe('pass');
    });

    it('applies numeric bounds and exact IFC data types', async () => {
        const numericWall = wall({
            properties: [{
                setName: 'Pset_Test',
                name: 'Height',
                values: [{ value: 21, dataType: 'IFCLENGTHMEASURE' }],
                dataType: 'IFCLENGTHMEASURE',
                supported: true
            }]
        });
        const bounded = {
            type: 'property',
            propertySet: simple('Pset_Test'),
            baseName: simple('Height'),
            dataType: 'IFCLENGTHMEASURE',
            value: {
                type: 'restriction',
                base: 'xs:double',
                facets: [{ type: 'maxInclusive', value: '20' }]
            }
        };
        let result = await ValidationEngine.validateBatch([numericWall], spec({ requirements: [bounded] }), { ifcSchema: 'IFC4' });
        expect(result.status).toBe('fail');

        result = await ValidationEngine.validateBatch([numericWall], spec({ requirements: [{ ...bounded, dataType: 'IFCAREAMEASURE', value: null }] }), { ifcSchema: 'IFC4' });
        expect(result.status).toBe('fail');
    });

    it('validates classification, material and recursive partOf facets', async () => {
        const enriched = wall({
            classifications: [{ system: 'Uniclass', values: ['EF_25', 'EF'] }],
            materials: ['Concrete', 'Structural'],
            hasMaterial: true,
            relations: [{
                mode: 'IFCRELAGGREGATES',
                target: {
                    entity: 'IFCBUILDING',
                    params: "'building-guid',$,'Building',$,$,$,$,$,$,$,$,$"
                }
            }]
        });
        const requirements = [
            { type: 'classification', system: simple('Uniclass'), value: simple('EF') },
            { type: 'material', value: simple('Concrete') },
            { type: 'partOf', relation: 'IFCRELAGGREGATES', entity: entityFacet('IFCBUILDING') }
        ];
        let result = await ValidationEngine.validateBatch([enriched], spec({ requirements }), { ifcSchema: 'IFC4' });
        expect(result.status).toBe('pass');

        result = await ValidationEngine.validateBatch([wall()], spec({ requirements }), { ifcSchema: 'IFC4' });
        expect(result.status).toBe('fail');
    });

    it('returns identical semantics for the public small and large validation entry points', async () => {
        const one = [wall()];
        const many = Array.from({ length: 101 }, (_, index) => wall({ id: String(index + 1), guid: `wall-${index + 1}` }));
        const currentSpec = spec({ minOccurs: '1', maxOccurs: 'unbounded' });
        const oneResult = await validateEntitiesAgainstIDSAsync(one, [currentSpec], { ifcSchema: 'IFC4' });
        const manyResult = await validateEntitiesAgainstIDSAsync(many, [currentSpec], { ifcSchema: 'IFC4' });
        expect(oneResult[0].status).toBe('pass');
        expect(manyResult[0].status).toBe('pass');
        expect(oneResult[0].occurrence.status).toBe(manyResult[0].occurrence.status);
    });

    it('parses IFC relationships, type inheritance, classification, material and quantities for validation', async () => {
        const ifc = `ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('EI60'),$);
#2=IFCPROPERTYSET('type-pset',$,'Pset_WallCommon',$,(#1));
#3=IFCWALLTYPE('type-guid',$,'Wall type',$,$,(#2),$,$,'TypeTag',.STANDARD.);
#4=IFCWALL('wall-guid',$,'Wall',$,$,$,$,$,$,.NOTDEFINED.);
#5=IFCRELDEFINESBYTYPE('type-rel',$,$,$,(#4),#3);
#6=IFCBUILDING('building-guid',$,'Building',$,$,$,$,$,$,$,$,$);
#7=IFCRELAGGREGATES('aggregate-rel',$,$,$,#6,(#4));
#8=IFCCLASSIFICATION($,$,$,'Uniclass',$,$,$);
#9=IFCCLASSIFICATIONREFERENCE($,'EF_25',$,#8,$,$);
#10=IFCRELASSOCIATESCLASSIFICATION('class-rel',$,$,$,(#3),#9);
#11=IFCMATERIAL('Concrete',$,'Structural');
#12=IFCRELASSOCIATESMATERIAL('mat-rel',$,$,$,(#3),#11);
#13=IFCQUANTITYLENGTH('Length',$,$,$,2500.);
#14=IFCELEMENTQUANTITY('quantity-guid',$,'Qto_WallBaseQuantities',$,$,(#13));
#15=IFCRELDEFINESBYPROPERTIES('quantity-rel',$,$,$,(#4),#14);
ENDSEC;
END-ISO-10303-21;`;
        const parsed = IFCParserCore.parseIFCContent(ifc, 'enriched.ifc');
        const parsedWall = parsed.find(entity => entity.entity === 'IFCWALL');
        expect(parsedWall.properties.some(property => property.name === 'FireRating')).toBe(true);
        expect(parsedWall.properties.some(property => property.name === 'Length')).toBe(true);
        expect(parsedWall.classifications[0].system).toBe('Uniclass');
        expect(parsedWall.materials.includes('Concrete')).toBe(true);
        expect(parsedWall.relations.some(relation => relation.mode === 'IFCRELAGGREGATES' && relation.target.entity === 'IFCBUILDING')).toBe(true);

        const result = await ValidationEngine.validateBatch([parsedWall], spec({
            requirements: [
                { type: 'entity', name: simple('IFCWALL'), predefinedType: simple('STANDARD') },
                { type: 'property', propertySet: simple('Pset_WallCommon'), baseName: simple('FireRating'), value: simple('EI60') },
                { type: 'classification', system: simple('Uniclass'), value: simple('EF_25') },
                { type: 'material', value: simple('Concrete') },
                { type: 'partOf', relation: 'IFCRELAGGREGATES', entity: entityFacet('IFCBUILDING') }
            ]
        }), { ifcSchema: 'IFC4' });
        expect(result.entityResults[0].validations[0].status).toBe('pass');
        expect(result.entityResults[0].validations[1].status).toBe('pass');
        expect(result.entityResults[0].validations[2].status).toBe('pass');
        expect(result.entityResults[0].validations[3].status).toBe('pass');
        expect(result.entityResults[0].validations[4].status).toBe('pass');
        expect(result.status).toBe('pass');
    });
});
