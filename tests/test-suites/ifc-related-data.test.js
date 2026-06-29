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
});
