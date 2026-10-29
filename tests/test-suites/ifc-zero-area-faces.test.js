/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
describe('3D IFC zero-area faces dropped by vertex weld', () => {
    async function buildFaceSet(ifc, expressId) {
        const [{ parseStepText }, { EntityIndex }, meshTypes] = await Promise.all([
            import('../../assets/js/3d/ifc-engine/parser/step-parser.js'),
            import('../../assets/js/3d/ifc-engine/parser/entity-index.js'),
            import('../../assets/js/3d/ifc-engine/geometry/mesh-types.js')
        ]);
        const { entities } = parseStepText(ifc);
        return meshTypes.polygonalFaceSetToGeometry(new EntityIndex(entities), expressId);
    }

    // Count triangles whose corners are collinear (same criterion as
    // scripts/ifc-diag/geometry-page.mjs measure()).
    function countDegenerate(geom) {
        const p = geom.getAttribute('position').array;
        const idx = geom.getIndex().array;
        let bad = 0;
        for (let t = 0; t < idx.length; t += 3) {
            const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
            const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
            const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            const area2 = nx * nx + ny * ny + nz * nz;
            const edges2 = (ux * ux + uy * uy + uz * uz) * (vx * vx + vy * vy + vz * vz);
            if (!(area2 > 1e-24 * edges2)) bad++;
        }
        return bad;
    }

    const HEADER = `ISO-10303-21;\nDATA;\n`;
    const FOOTER = `ENDSEC;\nEND-ISO-10303-21;`;

    // Unit square (points 1-4) with a midpoint 5 on the bottom edge.
    // Faces: a collinear triangle (1,5,2), a quad whose 0-1-2 split is
    // degenerate (1,5,2,3), and a sound triangle (1,3,4).
    // Expected surviving triangles: quad → (1,2,3) only, plus (1,3,4) = 2.
    const SQUARE = HEADER + `
#1=IFCCARTESIANPOINTLIST3D(((0.,0.,0.),(1.,0.,0.),(1.,1.,0.),(0.,1.,0.),(0.5,0.,0.)));
#2=IFCINDEXEDPOLYGONALFACE((1,5,2));
#3=IFCINDEXEDPOLYGONALFACE((1,5,2,3));
#4=IFCINDEXEDPOLYGONALFACE((1,3,4));
#5=IFCPOLYGONALFACESET(#1,.F.,(#2,#3,#4),$);
` + FOOTER;

    it('drops collinear triangles and degenerate quad halves', async () => {
        const geom = await buildFaceSet(SQUARE, 5);
        expect(geom === null).toBe(false);
        expect(countDegenerate(geom)).toBe(0);
        expect(geom.getIndex().count / 3).toBe(2);
    });

    it('keeps every triangle of a sound mesh', async () => {
        const ifc = HEADER + `
#1=IFCCARTESIANPOINTLIST3D(((0.,0.,0.),(1.,0.,0.),(1.,1.,0.),(0.,1.,0.)));
#2=IFCINDEXEDPOLYGONALFACE((1,2,3));
#3=IFCINDEXEDPOLYGONALFACE((1,3,4));
#4=IFCPOLYGONALFACESET(#1,.F.,(#2,#3),$);
` + FOOTER;
        const geom = await buildFaceSet(ifc, 4);
        expect(geom === null).toBe(false);
        expect(geom.getIndex().count / 3).toBe(2);
        expect(geom.getAttribute('position').count).toBe(4);
    });

    it('keeps thin but real slivers (relative tolerance)', async () => {
        const ifc = HEADER + `
#1=IFCCARTESIANPOINTLIST3D(((0.,0.,0.),(1.,0.,0.),(1.,0.001,0.)));
#2=IFCINDEXEDPOLYGONALFACE((1,2,3));
#3=IFCPOLYGONALFACESET(#1,.F.,(#2),$);
` + FOOTER;
        const geom = await buildFaceSet(ifc, 3);
        expect(geom === null).toBe(false);
        expect(geom.getIndex().count / 3).toBe(1);
    });
});
