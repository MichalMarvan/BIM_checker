/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
// Oracle (web-ifc) nálezy: IfcTShapeProfileDef / IfcLShapeProfileDef mají dle IFC4
// počátek Position ve středu obalového obdélníku; IfcCartesianTransformationOperator3DnonUniform
// musí respektovat Scale2/Scale3 a explicitní osy s nulovou složkou.
describe('ifc-profile-origin — parametrické profily a nonUniform operátor', () => {
    async function build(data, productId) {
        const [{ parseStepText }, { EntityIndex }, { buildEntityGeometry }] = await Promise.all([
            import('../../assets/js/3d/ifc-engine/parser/step-parser.js'),
            import('../../assets/js/3d/ifc-engine/parser/entity-index.js'),
            import('../../assets/js/3d/ifc-engine/geometry/geometry-core.js')
        ]);
        const { entities } = parseStepText(`ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${data}\nENDSEC;\nEND-ISO-10303-21;`);
        return buildEntityGeometry(new EntityIndex(entities), productId);
    }

    // Světový bbox přes všechny položky: matrix × parentMatrix × T(localOrigin) na každý vrchol
    // (stejně jako viewer-core._itemMatrix / oracle-page.mjs).
    async function worldBBox(result) {
        const THREE = await import('three');
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        const v = new THREE.Vector3();
        for (const item of result.items) {
            const geom = item.bufferGeometry;
            const lo = geom.userData?.localOrigin || [0, 0, 0];
            const m = result.matrix.clone();
            if (item.parentMatrix) m.multiply(item.parentMatrix);
            m.multiply(new THREE.Matrix4().makeTranslation(lo[0], lo[1], lo[2]));
            const pos = geom.getAttribute('position');
            for (let i = 0; i < pos.count; i++) {
                v.fromBufferAttribute(pos, i).applyMatrix4(m);
                min[0] = Math.min(min[0], v.x); min[1] = Math.min(min[1], v.y); min[2] = Math.min(min[2], v.z);
                max[0] = Math.max(max[0], v.x); max[1] = Math.max(max[1], v.y); max[2] = Math.max(max[2], v.z);
            }
        }
        return { min, max };
    }

    function near(actual, expected, tol = 0.01) {
        return Math.abs(actual - expected) <= tol;
    }

    const CONTEXT = `
#1=IFCPROJECT('p',$,$,$,$,$,$,$,#10);
#10=IFCUNITASSIGNMENT((#11));
#11=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#70=IFCCARTESIANPOINT((0.,0.,0.));
#71=IFCAXIS2PLACEMENT3D(#70,$,$);
#72=IFCLOCALPLACEMENT($,#71);
#73=IFCDIRECTION((0.,0.,1.));
#74=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#71,$);
`;

    function column(profileId, depth = 3000) {
        return `
#75=IFCEXTRUDEDAREASOLID(#${profileId},$,#73,${depth}.);
#76=IFCSHAPEREPRESENTATION(#74,'Body','SweptSolid',(#75));
#77=IFCPRODUCTDEFINITIONSHAPE($,$,(#76));
#78=IFCCOLUMN('c',$,$,$,$,#72,#77,$,$);
`;
    }

    it('IfcTShapeProfileDef: počátek ve středu obalového obdélníku, příruba nahoře', async () => {
        // 1/2 IPE300 z beam-parametric-cross-section.ifc: Depth 150, FlangeWidth 150, tw 7.1, tf 10.7
        const r = await build(CONTEXT
            + `#64=IFCTSHAPEPROFILEDEF(.AREA.,'1/2IPE300',$,150.0,150.0,7.1,10.7,15.0,$,$,$,$);`
            + column(64), 78);
        expect(r.items.length).toBe(1);
        const bb = await worldBBox(r);
        expect(near(bb.min[0], -75)).toBe(true);
        expect(near(bb.max[0], 75)).toBe(true);
        expect(near(bb.min[1], -75)).toBe(true);
        expect(near(bb.max[1], 75)).toBe(true);
        expect(near(bb.min[2], 0)).toBe(true);
        expect(near(bb.max[2], 3000)).toBe(true);

        // Příruba je nahoře: na spodní hraně (y = -75) leží jen stojina (|x| <= tw/2).
        const pos = r.items[0].bufferGeometry.getAttribute('position');
        let bottomMaxAbsX = 0, topMaxAbsX = 0;
        for (let i = 0; i < pos.count; i++) {
            const x = Math.abs(pos.getX(i)), y = pos.getY(i);
            if (near(y, -75)) bottomMaxAbsX = Math.max(bottomMaxAbsX, x);
            if (near(y, 75)) topMaxAbsX = Math.max(topMaxAbsX, x);
        }
        expect(near(bottomMaxAbsX, 3.55)).toBe(true);
        expect(near(topMaxAbsX, 75)).toBe(true);
    });

    it('IfcLShapeProfileDef: počátek ve středu obalového obdélníku', async () => {
        const r = await build(CONTEXT
            + `#64=IFCLSHAPEPROFILEDEF(.AREA.,'L100x80x10',$,100.,80.,10.,$,$,$);`
            + column(64, 1000), 78);
        expect(r.items.length).toBe(1);
        const bb = await worldBBox(r);
        expect(near(bb.min[0], -40)).toBe(true);
        expect(near(bb.max[0], 40)).toBe(true);
        expect(near(bb.min[1], -50)).toBe(true);
        expect(near(bb.max[1], 50)).toBe(true);
        expect(near(bb.max[2], 1000)).toBe(true);
    });

    // IfcMappedItem: krychle 1000×1000×2000 přes IfcCartesianTransformationOperator3DnonUniform.
    function mapped(operator) {
        return `
#80=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,1000.,1000.);
#81=IFCEXTRUDEDAREASOLID(#80,$,#73,2000.);
#82=IFCSHAPEREPRESENTATION(#74,'Body','SweptSolid',(#81));
#83=IFCREPRESENTATIONMAP(#71,#82);
${operator}
#85=IFCMAPPEDITEM(#83,#84);
#86=IFCSHAPEREPRESENTATION(#74,'Body','MappedRepresentation',(#85));
#87=IFCPRODUCTDEFINITIONSHAPE($,$,(#86));
#88=IFCBUILDINGELEMENTPROXY('x',$,$,$,$,#72,#87,$,$);
`;
    }

    it('nonUniform: Scale2 = $ dědí Scale, Scale3 explicitní (mapped-shape-with-multiple-items)', async () => {
        // Osy otočené o 45°, Scale 0.5 v x i y, Scale3 = 1 → půdorys ±0.5·0.5·√2 = ±353.55, výška 2000.
        const r = await build(CONTEXT + mapped(`
#90=IFCDIRECTION((1.,1.,0.));
#91=IFCDIRECTION((-1.,1.,0.));
#84=IFCCARTESIANTRANSFORMATIONOPERATOR3DNONUNIFORM(#90,#91,#70,0.5,#73,$,1.);`), 88);
        expect(r.items.length).toBe(1);
        const bb = await worldBBox(r);
        expect(near(bb.min[0], -353.55, 0.1)).toBe(true);
        expect(near(bb.max[0], 353.55, 0.1)).toBe(true);
        expect(near(bb.min[1], -353.55, 0.1)).toBe(true);
        expect(near(bb.max[1], 353.55, 0.1)).toBe(true);
        expect(near(bb.min[2], 0)).toBe(true);
        expect(near(bb.max[2], 2000)).toBe(true);
    });

    it('nonUniform: Scale2 a Scale3 explicitní (mapped-shape-with-transformation)', async () => {
        const r = await build(CONTEXT + mapped(`
#90=IFCDIRECTION((1.,1.,0.));
#91=IFCDIRECTION((-1.,1.,0.));
#84=IFCCARTESIANTRANSFORMATIONOPERATOR3DNONUNIFORM(#90,#91,#70,0.5,#73,0.5,1.);`), 88);
        const bb = await worldBBox(r);
        expect(near(bb.max[0], 353.55, 0.1)).toBe(true);
        expect(near(bb.max[1], 353.55, 0.1)).toBe(true);
        expect(near(bb.max[2], 2000)).toBe(true);
    });

    it('nonUniform: různé Scale/Scale2/Scale3 bez rotace', async () => {
        const r = await build(CONTEXT + mapped(`
#84=IFCCARTESIANTRANSFORMATIONOPERATOR3DNONUNIFORM($,$,#70,2.,$,0.5,0.25);`), 88);
        const bb = await worldBBox(r);
        expect(near(bb.min[0], -1000)).toBe(true);
        expect(near(bb.max[0], 1000)).toBe(true);
        expect(near(bb.min[1], -250)).toBe(true);
        expect(near(bb.max[1], 250)).toBe(true);
        expect(near(bb.max[2], 500)).toBe(true);
    });

    it('explicitní osy s nulovou složkou: Axis1 = (0,1,0), Axis2 = (-1,0,0) je otočení o 90°', async () => {
        // Obdélník 1000×500 → po otočení o 90° půdorys x ±250, y ±500 (linear-placement-of-signal.ifc).
        const r = await build(CONTEXT + `
#80=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,1000.,500.);
#81=IFCEXTRUDEDAREASOLID(#80,$,#73,2000.);
#82=IFCSHAPEREPRESENTATION(#74,'Body','SweptSolid',(#81));
#83=IFCREPRESENTATIONMAP(#71,#82);
#90=IFCDIRECTION((0.,1.,0.));
#91=IFCDIRECTION((-1.,0.,0.));
#84=IFCCARTESIANTRANSFORMATIONOPERATOR3DNONUNIFORM(#90,#91,#70,1.,#73,1.,1.);
#85=IFCMAPPEDITEM(#83,#84);
#86=IFCSHAPEREPRESENTATION(#74,'Body','MappedRepresentation',(#85));
#87=IFCPRODUCTDEFINITIONSHAPE($,$,(#86));
#88=IFCBUILDINGELEMENTPROXY('x',$,$,$,$,#72,#87,$,$);
`, 88);
        const bb = await worldBBox(r);
        expect(near(bb.min[0], -250)).toBe(true);
        expect(near(bb.max[0], 250)).toBe(true);
        expect(near(bb.min[1], -500)).toBe(true);
        expect(near(bb.max[1], 500)).toBe(true);
    });
});
