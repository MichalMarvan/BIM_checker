/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
describe('3D IFC revolved area solid', () => {
    async function buildRevolved(ifc, expressId) {
        const [{ parseStepText }, { EntityIndex }, meshTypes] = await Promise.all([
            import('../../assets/js/3d/ifc-engine/parser/step-parser.js'),
            import('../../assets/js/3d/ifc-engine/parser/entity-index.js'),
            import('../../assets/js/3d/ifc-engine/geometry/mesh-types.js')
        ]);
        const { entities } = parseStepText(ifc);
        const geom = meshTypes.revolvedAreaSolidToGeometry(new EntityIndex(entities), expressId);
        if (!geom) return null;
        geom.computeBoundingBox();
        // Fold userData.localOrigin back in so asserts see solid-local coords.
        const lo = geom.userData?.localOrigin || [0, 0, 0];
        const bb = geom.boundingBox;
        return {
            min: [bb.min.x + lo[0], bb.min.y + lo[1], bb.min.z + lo[2]],
            max: [bb.max.x + lo[0], bb.max.y + lo[1], bb.max.z + lo[2]],
            vertexCount: geom.getAttribute('position').count
        };
    }

    function near(actual, expected, tol) {
        return Math.abs(actual - expected) <= tol;
    }

    const HEADER = `ISO-10303-21;\nDATA;\n`;
    const FOOTER = `ENDSEC;\nEND-ISO-10303-21;`;

    // Square profile x∈[100,110], y∈[-5,5] revolved 90° about local Y axis
    // through the origin. Right-hand rule about +Y maps (x,0,0)→(0,0,-x), so
    // the solid sweeps from the +X column to the -Z column:
    // bbox x∈[0,110], y∈[-5,5], z∈[-110,0].
    it('revolves a profile about an axis through the origin (90°)', async () => {
        const ifc = HEADER + `
#1=IFCCARTESIANPOINTLIST2D(((100.,-5.),(110.,-5.),(110.,5.),(100.,5.)));
#2=IFCINDEXEDPOLYCURVE(#1,(IFCLINEINDEX((1,2,3,4,1))),$);
#3=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#2);
#4=IFCCARTESIANPOINT((0.,0.,0.));
#5=IFCDIRECTION((0.,1.,0.));
#6=IFCAXIS1PLACEMENT(#4,#5);
#7=IFCREVOLVEDAREASOLID(#3,$,#6,1.5707963268);
` + FOOTER;
        const bb = await buildRevolved(ifc, 7);
        expect(bb === null).toBe(false);
        const tol = 2;
        expect(near(bb.max[0], 110, tol)).toBe(true);
        expect(near(bb.min[0], 0, tol)).toBe(true);
        expect(near(bb.min[1], -5, tol)).toBe(true);
        expect(near(bb.max[1], 5, tol)).toBe(true);
        expect(near(bb.min[2], -110, tol)).toBe(true);
        expect(near(bb.max[2], 0, tol)).toBe(true);
    });

    // Same profile, but the revolution axis passes through (50,0,0) — the
    // radius is 50..60 and the swept end lands at x=50, z∈[-60,-50]:
    // bbox x∈[50,110], y∈[-5,5], z∈[-60,0]. The axis LOCATION must be
    // honoured (this is what displaced Tekla curved members by ~100 m).
    it('honours a revolution axis offset from the origin', async () => {
        const ifc = HEADER + `
#1=IFCCARTESIANPOINTLIST2D(((100.,-5.),(110.,-5.),(110.,5.),(100.,5.)));
#2=IFCINDEXEDPOLYCURVE(#1,(IFCLINEINDEX((1,2,3,4,1))),$);
#3=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#2);
#4=IFCCARTESIANPOINT((50.,0.,0.));
#5=IFCDIRECTION((0.,1.,0.));
#6=IFCAXIS1PLACEMENT(#4,#5);
#7=IFCREVOLVEDAREASOLID(#3,$,#6,1.5707963268);
` + FOOTER;
        const bb = await buildRevolved(ifc, 7);
        expect(bb === null).toBe(false);
        const tol = 2;
        expect(near(bb.max[0], 110, tol)).toBe(true);
        expect(near(bb.min[0], 50, tol)).toBe(true);
        expect(near(bb.min[2], -60, tol)).toBe(true);
        expect(near(bb.max[2], 0, tol)).toBe(true);
    });

    // Profile with a rectangular void (RHS tube, like Tekla RHS80/4 purlins).
    // Geometry must include the inner-wall surface: more vertices than the
    // solid square case, same outer bbox.
    it('keeps profile voids (hollow sections) in the swept solid', async () => {
        const solidIfc = HEADER + `
#1=IFCCARTESIANPOINTLIST2D(((100.,-5.),(110.,-5.),(110.,5.),(100.,5.)));
#2=IFCINDEXEDPOLYCURVE(#1,(IFCLINEINDEX((1,2,3,4,1))),$);
#3=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#2);
#4=IFCCARTESIANPOINT((0.,0.,0.));
#5=IFCDIRECTION((0.,1.,0.));
#6=IFCAXIS1PLACEMENT(#4,#5);
#7=IFCREVOLVEDAREASOLID(#3,$,#6,1.5707963268);
` + FOOTER;
        const hollowIfc = HEADER + `
#1=IFCCARTESIANPOINTLIST2D(((100.,-5.),(110.,-5.),(110.,5.),(100.,5.)));
#2=IFCINDEXEDPOLYCURVE(#1,(IFCLINEINDEX((1,2,3,4,1))),$);
#8=IFCCARTESIANPOINTLIST2D(((102.,-3.),(102.,3.),(108.,3.),(108.,-3.)));
#9=IFCINDEXEDPOLYCURVE(#8,(IFCLINEINDEX((1,2,3,4,1))),$);
#3=IFCARBITRARYPROFILEDEFWITHVOIDS(.AREA.,$,#2,(#9));
#4=IFCCARTESIANPOINT((0.,0.,0.));
#5=IFCDIRECTION((0.,1.,0.));
#6=IFCAXIS1PLACEMENT(#4,#5);
#7=IFCREVOLVEDAREASOLID(#3,$,#6,1.5707963268);
` + FOOTER;
        const solid = await buildRevolved(solidIfc, 7);
        const hollow = await buildRevolved(hollowIfc, 7);
        expect(hollow === null).toBe(false);
        expect(near(hollow.max[0], 110, 2)).toBe(true);
        expect(near(hollow.min[2], -110, 2)).toBe(true);
        expect(hollow.vertexCount > solid.vertexCount).toBe(true);
    });
});
