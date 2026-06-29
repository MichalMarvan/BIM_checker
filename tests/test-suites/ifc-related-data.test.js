/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
describe('3D IFC related data extractor', () => {
    async function parseRelated(ifc, expressId = 1) {
        const [{ parseStepText }, { EntityIndex }, { extractRelatedData }] = await Promise.all([
            import('../../assets/js/3d/ifc-engine/parser/step-parser.js'),
            import('../../assets/js/3d/ifc-engine/parser/entity-index.js'),
            import('../../assets/js/3d/ifc-engine/properties/related-data.js')
        ]);
        const { entities } = parseStepText(ifc);
        return extractRelatedData(new EntityIndex(entities), expressId);
    }

    async function parseProperties(ifc, expressId = 1) {
        const [{ parseStepText }, { EntityIndex }, { extractPropertiesFor }] = await Promise.all([
            import('../../assets/js/3d/ifc-engine/parser/step-parser.js'),
            import('../../assets/js/3d/ifc-engine/parser/entity-index.js'),
            import('../../assets/js/3d/ifc-engine/properties/psets.js')
        ]);
        const { entities } = parseStepText(ifc);
        return extractPropertiesFor(new EntityIndex(entities), expressId);
    }

    async function parseQuantities(ifc, expressId = 1) {
        const [{ parseStepText }, { EntityIndex }, { extractIfcQuantities }] = await Promise.all([
            import('../../assets/js/3d/ifc-engine/parser/step-parser.js'),
            import('../../assets/js/3d/ifc-engine/parser/entity-index.js'),
            import('../../assets/js/3d/ifc-engine/properties/quantities.js')
        ]);
        const { entities } = parseStepText(ifc);
        return extractIfcQuantities(new EntityIndex(entities), expressId);
    }

    it('extracts type-level property sets through IfcRelDefinesByType', async () => {
        const ifc = `ISO-10303-21;
DATA;
#1=IFCWALL('wall-guid',$,'Wall',$,$,$,$,$,$);
#10=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('REI 60'),$);
#11=IFCPROPERTYSET('type-pset-guid',$,'Pset_WallTypeCommon',$,(#10));
#12=IFCWALLTYPE('type-guid',$,'Basic wall type',$,$,(#11),$,$,.NOTDEFINED.);
#13=IFCRELDEFINESBYTYPE('rel-type-guid',$,$,$,(#1),#12);
ENDSEC;
END-ISO-10303-21;`;
        const related = await parseRelated(ifc);
        expect(related.typePropertySets.length).toBe(1);
        expect(related.typePropertySets[0].name).toBe('Pset_WallTypeCommon');
        expect(related.typePropertySets[0].typeName).toBe('Basic wall type');
        expect(related.typePropertySets[0].properties[0].value).toBe('REI 60');
    });

    it('extracts non-single IFC property value types', async () => {
        const ifc = `ISO-10303-21;
DATA;
#1=IFCWALL('wall-guid',$,'Wall',$,$,$,$,$,$);
#10=IFCPROPERTYENUMERATEDVALUE('EnumProp',$,(IFCLABEL('A'),IFCLABEL('B')),$);
#11=IFCPROPERTYLISTVALUE('ListProp',$,(IFCREAL(1.5),IFCREAL(2.5)),$);
#12=IFCPROPERTYBOUNDEDVALUE('BoundedProp',$,IFCREAL(10.),IFCREAL(2.),$,IFCREAL(5.));
#13=IFCPROPERTYSINGLEVALUE('ChildProp',$,IFCLABEL('Nested'),$);
#14=IFCCOMPLEXPROPERTY('ComplexProp',$,'Usage',(#13));
#15=IFCPROPERTYSET('pset-guid',$,'Pset_Test',$,(#10,#11,#12,#14));
#16=IFCRELDEFINESBYPROPERTIES('rel-guid',$,$,$,(#1),#15);
ENDSEC;
END-ISO-10303-21;`;
        const props = await parseProperties(ifc);
        const pset = props.propertySets[0];
        expect(pset.properties.find(p => p.name === 'EnumProp').value).toEqual(['A', 'B']);
        expect(pset.properties.find(p => p.name === 'ListProp').value).toEqual([1.5, 2.5]);
        expect(pset.properties.find(p => p.name === 'BoundedProp').value.lower).toBe(2);
        expect(pset.properties.find(p => p.name === 'ComplexProp').value.ChildProp).toBe('Nested');
    });

    it('extracts number, time, and nested complex IFC quantities', async () => {
        const ifc = `ISO-10303-21;
DATA;
#1=IFCWALL('wall-guid',$,'Wall',$,$,$,$,$,$);
#10=IFCQUANTITYNUMBER('NumberQty',$,$,7.,$);
#11=IFCQUANTITYTIME('TimeQty',$,$,12.5,$);
#12=IFCQUANTITYAREA('NestedArea',$,$,20.,$);
#13=IFCPHYSICALCOMPLEXQUANTITY('ComplexQty',$,(#12),$,$,$);
#14=IFCELEMENTQUANTITY('qto-guid',$,'BaseQuantities',$,$,(#10,#11,#13));
#15=IFCRELDEFINESBYPROPERTIES('rel-guid',$,$,$,(#1),#14);
ENDSEC;
END-ISO-10303-21;`;
        const quantities = await parseQuantities(ifc);
        expect(quantities.find(q => q.name === 'NumberQty').value).toBe(7);
        expect(quantities.find(q => q.name === 'TimeQty').kind).toBe('time');
        expect(quantities.find(q => q.name === 'ComplexQty / NestedArea').value).toBe(20);
    });

    it('extracts material layer set usage through IfcRelAssociatesMaterial', async () => {
        const ifc = `ISO-10303-21;
DATA;
#1=IFCWALL('wall-guid',$,'Wall',$,$,$,$,$,$);
#20=IFCMATERIAL('Concrete',$,'structural');
#21=IFCMATERIALLAYER(#20,200.,$,'Core',$,$,$);
#22=IFCMATERIALLAYERSET((#21),'Wall composition',$);
#23=IFCMATERIALLAYERSETUSAGE(#22,.AXIS2.,.POSITIVE.,0.);
#24=IFCRELASSOCIATESMATERIAL('rel-mat-guid',$,$,$,(#1),#23);
ENDSEC;
END-ISO-10303-21;`;
        const related = await parseRelated(ifc);
        expect(related.materials.length).toBe(1);
        expect(related.materials[0].name).toBe('Wall composition');
        expect(related.materials[0].layers.length).toBe(1);
        expect(related.materials[0].layers[0].materialName).toBe('Concrete');
        expect(related.materials[0].layers[0].thickness).toBe(200);
    });

    it('maps IfcMaterialProfile fields by IFC schema position', async () => {
        const ifc = `ISO-10303-21;
DATA;
#1=IFCBEAM('beam-guid',$,'Beam',$,$,$,$,$,$);
#20=IFCMATERIAL('Steel',$,'structural');
#21=IFCMATERIALPROFILE('IPE profile','Profile description',#20,$,$,'primary');
#22=IFCMATERIALPROFILESET('Beam profiles',$,(#21),$);
#23=IFCMATERIALPROFILESETUSAGE(#22,$,$);
#24=IFCRELASSOCIATESMATERIAL('rel-mat-guid',$,$,$,(#1),#23);
ENDSEC;
END-ISO-10303-21;`;
        const related = await parseRelated(ifc);
        expect(related.materials.length).toBe(1);
        expect(related.materials[0].profiles[0].name).toBe('IPE profile');
        expect(related.materials[0].profiles[0].materialName).toBe('Steel');
        expect(related.materials[0].profiles[0].category).toBe('primary');
    });

    it('inherits material associations from the element type', async () => {
        const ifc = `ISO-10303-21;
DATA;
#1=IFCWALL('wall-guid',$,'Wall',$,$,$,$,$,$);
#10=IFCWALLTYPE('type-guid',$,'Basic wall type',$,$,$,$,$,.NOTDEFINED.);
#11=IFCRELDEFINESBYTYPE('rel-type-guid',$,$,$,(#1),#10);
#20=IFCMATERIAL('Brick',$,'masonry');
#21=IFCRELASSOCIATESMATERIAL('rel-mat-guid',$,$,$,(#10),#20);
ENDSEC;
END-ISO-10303-21;`;
        const related = await parseRelated(ifc);
        expect(related.materials.length).toBe(1);
        expect(related.materials[0].name).toBe('Brick');
        expect(related.materials[0].category).toBe('masonry');
    });

    it('extracts classification code and system through IfcRelAssociatesClassification', async () => {
        const ifc = `ISO-10303-21;
DATA;
#1=IFCWALL('wall-guid',$,'Wall',$,$,$,$,$,$);
#30=IFCCLASSIFICATION('bSDD',$,$,'Uniclass',$,$,$);
#31=IFCCLASSIFICATIONREFERENCE('https://example.test/Ss_25_10','Ss_25_10','Walls',#30,$,$);
#32=IFCRELASSOCIATESCLASSIFICATION('rel-class-guid',$,$,$,(#1),#31);
ENDSEC;
END-ISO-10303-21;`;
        const related = await parseRelated(ifc);
        expect(related.classifications.length).toBe(1);
        expect(related.classifications[0].system).toBe('Uniclass');
        expect(related.classifications[0].code).toBe('Ss_25_10');
        expect(related.classifications[0].name).toBe('Walls');
    });

    it('inherits classification associations from the element type', async () => {
        const ifc = `ISO-10303-21;
DATA;
#1=IFCWALL('wall-guid',$,'Wall',$,$,$,$,$,$);
#10=IFCWALLTYPE('type-guid',$,'Basic wall type',$,$,$,$,$,.NOTDEFINED.);
#11=IFCRELDEFINESBYTYPE('rel-type-guid',$,$,$,(#1),#10);
#30=IFCCLASSIFICATION('bSDD',$,$,'Uniclass',$,$,$);
#31=IFCCLASSIFICATIONREFERENCE('https://example.test/Ss_25_10','Ss_25_10','Walls',#30,$,$);
#32=IFCRELASSOCIATESCLASSIFICATION('rel-class-guid',$,$,$,(#10),#31);
ENDSEC;
END-ISO-10303-21;`;
        const related = await parseRelated(ifc);
        expect(related.classifications.length).toBe(1);
        expect(related.classifications[0].system).toBe('Uniclass');
        expect(related.classifications[0].code).toBe('Ss_25_10');
    });

    it('extracts type-level element quantities from IfcType HasPropertySets', async () => {
        const ifc = `ISO-10303-21;
DATA;
#1=IFCWALL('wall-guid',$,'Wall',$,$,$,$,$,$);
#10=IFCQUANTITYNUMBER('CountLike',$,$,3.,$);
#11=IFCELEMENTQUANTITY('qto-guid',$,'Qto_WallBaseQuantities',$,$,(#10));
#12=IFCWALLTYPE('type-guid',$,'Basic wall type',$,$,(#11),$,$,.NOTDEFINED.);
#13=IFCRELDEFINESBYTYPE('rel-type-guid',$,$,$,(#1),#12);
ENDSEC;
END-ISO-10303-21;`;
        const related = await parseRelated(ifc);
        expect(related.typePropertySets.length).toBe(1);
        expect(related.typePropertySets[0].name).toBe('Qto_WallBaseQuantities');
        expect(related.typePropertySets[0].setType).toBe('quantity');
        expect(related.typePropertySets[0].properties[0].name).toBe('CountLike');
        expect(related.typePropertySets[0].properties[0].value).toBe(3);
    });
});
