/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('Ifc halfspace clip — IfcBooleanClippingResult with IfcHalfSpaceSolid', () => {
    let tryHalfSpaceDifference, extrudedAreaSolidToGeometry, parseStepText, EntityIndex;
    async function load() {
        if (tryHalfSpaceDifference) return;
        ({ tryHalfSpaceDifference } = await import('../../assets/js/3d/ifc-engine/geometry/halfspace-clip.js'));
        ({ extrudedAreaSolidToGeometry } = await import('../../assets/js/3d/ifc-engine/geometry/mesh-types.js'));
        ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
        ({ EntityIndex } = await import('../../assets/js/3d/ifc-engine/parser/entity-index.js'));
    }
    // Leaf builder contract of geometry-core.buildLeafGeometry(entityIndex, id).
    function leaf(entityIndex, id) {
        const e = entityIndex.byExpressId(id);
        return e && e.type === 'IFCEXTRUDEDAREASOLID' ? extrudedAreaSolidToGeometry(entityIndex, id) : null;
    }
    async function clip(step, firstId = 20, secondId = 30) {
        await load();
        const parsed = parseStepText(`ISO-10303-21; HEADER; FILE_SCHEMA(('IFC4')); ENDSEC; DATA; ${step} ENDSEC; END-ISO-10303-21;`);
        return tryHalfSpaceDifference(new EntityIndex(parsed.entities), firstId, secondId, leaf);
    }
    // Box x∈[-1,1], y∈[-2,2], z∈[0,10] (volume 80), #20.
    const BOX = `
#1=IFCCARTESIANPOINT((0.,0.,0.)); #3=IFCDIRECTION((0.,0.,1.));
#10=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,2.,4.);
#20=IFCEXTRUDEDAREASOLID(#10,$,#3,10.);`;
    // Half space #30 with plane through `loc` and normal `axis`.
    function half(loc, axis, flag) {
        return `
#31=IFCCARTESIANPOINT((${loc.join(',')})); #32=IFCDIRECTION((${axis.join(',')}));
#33=IFCAXIS2PLACEMENT3D(#31,#32,$); #34=IFCPLANE(#33);
#30=IFCHALFSPACESOLID(#34,${flag});`;
    }
    function close(a, b, eps = 1e-5) { expect(Math.abs(a - b) < eps).toBe(true); }
    function bounds(g, expected, eps = 1e-5) {
        expect(g !== null).toBe(true);
        const o = g.userData.localOrigin;
        [...g.boundingBox.min.toArray(), ...g.boundingBox.max.toArray()].forEach((v, i) => close(v + o[i % 3], expected[i], eps));
    }
    function volume(g) {
        const p = g.attributes.position.array, ix = g.index.array; let v = 0;
        for (let i = 0; i < ix.length; i += 3) {
            const a = 3 * ix[i], b = 3 * ix[i + 1], c = 3 * ix[i + 2];
            v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) + p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
        }
        return v / 6;
    }
    // Every edge used exactly once in each direction after positional welding
    // (crease normals split vertices, so weld first) → closed, consistently oriented.
    function assertClosed(g) {
        const p = g.attributes.position.array, ix = g.index.array, ids = new Map(), remap = [];
        for (let i = 0; i < p.length; i += 3) {
            const k = `${p[i]},${p[i + 1]},${p[i + 2]}`;
            if (!ids.has(k)) ids.set(k, ids.size);
            remap.push(ids.get(k));
        }
        const edges = new Map();
        for (let i = 0; i < ix.length; i += 3) for (let j = 0; j < 3; j++) {
            const a = remap[ix[i + j]], b = remap[ix[i + (j + 1) % 3]];
            const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
            const e = edges.get(key) || [0, 0]; e[0]++; e[1] += a < b ? 1 : -1; edges.set(key, e);
        }
        for (const [cnt, dir] of edges.values()) { expect(cnt).toBe(2); expect(dir).toBe(0); }
    }
    function assertFinite(g) {
        const p = g.attributes.position.array;
        let bad = 0; for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) bad++;
        expect(bad).toBe(0);
        const n = g.attributes.normal.array;
        bad = 0; for (let i = 0; i < n.length; i++) if (!Number.isFinite(n[i])) bad++;
        expect(bad).toBe(0);
        // No degenerate triangles.
        const ix = g.index.array; let degenerate = 0;
        for (let i = 0; i < ix.length; i += 3) {
            const a = 3 * ix[i], b = 3 * ix[i + 1], c = 3 * ix[i + 2];
            const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
            const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
            const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
            if (cx * cx + cy * cy + cz * cz < 1e-18) degenerate++;
        }
        expect(degenerate).toBe(0);
    }

    it('horizontal plane, AgreementFlag .T.: normal side kept (material opposite the normal removed)', async () => {
        const g = await clip(BOX + half([0, 0, 3], [0, 0, 1], '.T.'));
        bounds(g, [-1, -2, 3, 1, 2, 10]); close(volume(g), 56, 1e-4);
        assertClosed(g); assertFinite(g);
    });
    it('horizontal plane, AgreementFlag .F.: normal side removed', async () => {
        const g = await clip(BOX + half([0, 0, 3], [0, 0, 1], '.F.'));
        bounds(g, [-1, -2, 0, 1, 2, 3]); close(volume(g), 24, 1e-4);
        assertClosed(g); assertFinite(g);
    });
    it('oblique plane x+z=5 cuts the box into two 40-unit halves (both flags)', async () => {
        const t = await clip(BOX + half([0, 0, 5], [1, 0, 1], '.T.'));
        bounds(t, [-1, -2, 4, 1, 2, 10]); close(volume(t), 40, 1e-4);
        assertClosed(t); assertFinite(t);
        const f = await clip(BOX + half([0, 0, 5], [1, 0, 1], '.F.'));
        bounds(f, [-1, -2, 0, 1, 2, 6]); close(volume(f), 40, 1e-4);
        assertClosed(f); assertFinite(f);
    });
    it('plane through a box edge (z=10 top, keep below) and through a corner keep closed meshes', async () => {
        const top = await clip(BOX + half([0, 0, 10], [0, 0, 1], '.F.'));
        bounds(top, [-1, -2, 0, 1, 2, 10]); close(volume(top), 80, 1e-4); assertClosed(top);
        // Plane x+z=11 passes exactly through the top edge x=1,z=10; keeps x+z<11.
        const corner = await clip(BOX + half([0, 0, 11], [1, 0, 1], '.F.'));
        close(volume(corner), 80, 1e-4); assertClosed(corner); assertFinite(corner);
        // Plane through the corner (1,·,10) removing a wedge: x+z>9 removed → removes ∫ wedge = 4*(1*2/2)... keep x+z<9.
        const wedge = await clip(BOX + half([0, 0, 9], [1, 0, 1], '.F.'));
        close(volume(wedge), 80 - 4 * 2, 1e-4); assertClosed(wedge); assertFinite(wedge);
    });
    it('plane that misses the solid: nothing removed → full box, everything removed → null', async () => {
        const full = await clip(BOX + half([0, 0, 20], [0, 0, 1], '.F.'));
        bounds(full, [-1, -2, 0, 1, 2, 10]); close(volume(full), 80, 1e-4);
        const none = await clip(BOX + half([0, 0, 20], [0, 0, 1], '.T.'));
        expect(none).toBe(null);
    });
    it('hollow tube cut by an oblique plane gets an annular cap (closed mesh, volume = area × mean height)', async () => {
        const TUBE = `
#1=IFCCARTESIANPOINT((0.,0.,0.)); #3=IFCDIRECTION((0.,0.,1.));
#10=IFCCIRCLEHOLLOWPROFILEDEF(.AREA.,$,$,2.,0.5);
#20=IFCEXTRUDEDAREASOLID(#10,$,#3,10.);`;
        const whole = await clip(TUBE + half([0, 0, 20], [0, 0, 1], '.F.'));
        const area = volume(whole) / 10; // polygonal annulus area (segment count dependent)
        const g = await clip(TUBE + half([0, 0, 5], [1, 0, 2], '.T.')); // keep x+2z>10 → z > 5 − x/2
        expect(g !== null).toBe(true);
        assertClosed(g); assertFinite(g);
        // Kept height at radius r, angle θ: 10 − (5 − r cosθ/2) = 5 + r cosθ/2, mean over the annulus = 5.
        close(volume(g), area * 5, 1e-3);
        bounds(g, [-2, -2, 4, 2, 2, 10], 1e-4);
    });
    it('chained clips CLIP(CLIP(box, z>3), x>0) are followed through the FirstOperand', async () => {
        const CHAIN = BOX + half([0, 0, 3], [0, 0, 1], '.T.') + `
#40=IFCBOOLEANCLIPPINGRESULT(.DIFFERENCE.,#20,#30);
#41=IFCCARTESIANPOINT((0.,0.,0.)); #42=IFCDIRECTION((1.,0.,0.));
#43=IFCAXIS2PLACEMENT3D(#41,#42,$); #44=IFCPLANE(#43);
#45=IFCHALFSPACESOLID(#44,.T.);`;
        const g = await clip(CHAIN, 40, 45);
        bounds(g, [0, -2, 3, 1, 2, 10]); close(volume(g), 28, 1e-4);
        assertClosed(g); assertFinite(g);
    });
    it('returns null for an unsupported second operand or a non-plane surface', async () => {
        expect(await clip(BOX + `#30=IFCEXTRUDEDAREASOLID(#10,$,#3,1.);`)).toBe(null);
        expect(await clip(BOX + `
#31=IFCCARTESIANPOINT((0.,0.,3.)); #33=IFCAXIS2PLACEMENT3D(#31,$,$);
#34=IFCCYLINDRICALSURFACE(#33,1.); #30=IFCHALFSPACESOLID(#34,.T.);`)).toBe(null);
        expect(await clip(BOX + half([0, 0, 3], [0, 0, 1], '.T.'), 999, 30)).toBe(null);
    });
    it('georeferenced solid: translation stays in localOrigin, Float32 buffer stays small', async () => {
        const GEO = `
#1=IFCCARTESIANPOINT((-751620.994,-1048454.123,371.17)); #3=IFCDIRECTION((0.,0.,1.));
#2=IFCAXIS2PLACEMENT3D(#1,$,$);
#10=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,2.,4.);
#20=IFCEXTRUDEDAREASOLID(#10,#2,#3,10.);`;
        const g = await clip(GEO + half([-751620.994, -1048454.123, 374.17], [0, 0, 1], '.T.'));
        bounds(g, [-751621.994, -1048456.123, 374.17, -751619.994, -1048452.123, 381.17], 1e-3);
        close(volume(g), 56, 1e-3);
        const p = g.attributes.position.array; let maxAbs = 0;
        for (let i = 0; i < p.length; i++) maxAbs = Math.max(maxAbs, Math.abs(p[i]));
        expect(maxAbs < 100).toBe(true);
        assertClosed(g); assertFinite(g);
    });
    describe('IfcPolygonalBoundedHalfSpace', () => {
        // Half space z>5 removed (.F., normal +z), restricted to the prism over `poly` (2D, Position = identity).
        function bounded(poly, flag = '.F.') {
            const pts = poly.map((p, i) => `#${50 + i}=IFCCARTESIANPOINT((${p[0]},${p[1]}));`).join(' ');
            const refs = poly.map((p, i) => `#${50 + i}`).join(',');
            return `
#31=IFCCARTESIANPOINT((0.,0.,5.)); #32=IFCDIRECTION((0.,0.,1.));
#33=IFCAXIS2PLACEMENT3D(#31,#32,$); #34=IFCPLANE(#33);
#35=IFCCARTESIANPOINT((0.,0.,0.)); #36=IFCAXIS2PLACEMENT3D(#35,$,$);
${pts} #37=IFCPOLYLINE((${refs},#50));
#30=IFCPOLYGONALBOUNDEDHALFSPACE(#34,${flag},#36,#37);`;
        }
        it('prism enclosing the whole solid → plain plane clip', async () => {
            const g = await clip(BOX + bounded([[-5, -5], [5, -5], [5, 5], [-5, 5]]));
            bounds(g, [-1, -2, 0, 1, 2, 5]); close(volume(g), 40, 1e-4); assertClosed(g); assertFinite(g);
        });
        it('prism missing the solid → solid unchanged', async () => {
            const g = await clip(BOX + bounded([[5, -5], [9, -5], [9, 5], [5, 5]]));
            bounds(g, [-1, -2, 0, 1, 2, 10]); close(volume(g), 80, 1e-4); assertClosed(g);
        });
        it('convex prism covering half the footprint → notch of 1×4×5 removed', async () => {
            const g = await clip(BOX + bounded([[0, -3], [3, -3], [3, 3], [0, 3]]));
            bounds(g, [-1, -2, 0, 1, 2, 10]); close(volume(g), 60, 1e-4); assertFinite(g);
            // Internal faces of the decomposition cancel in volume; the outer hull stays closed:
            // every welded edge is used an even number of times with net orientation 0.
            const p = g.attributes.position.array, ix = g.index.array, ids = new Map(), remap = [];
            for (let i = 0; i < p.length; i += 3) {
                const k = `${p[i]},${p[i + 1]},${p[i + 2]}`;
                if (!ids.has(k)) ids.set(k, ids.size); remap.push(ids.get(k));
            }
            const edges = new Map();
            for (let i = 0; i < ix.length; i += 3) for (let j = 0; j < 3; j++) {
                const a = remap[ix[i + j]], b = remap[ix[i + (j + 1) % 3]];
                const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
                const e = edges.get(key) || [0, 0]; e[0]++; e[1] += a < b ? 1 : -1; edges.set(key, e);
            }
            for (const [cnt, dir] of edges.values()) { expect(cnt % 2).toBe(0); expect(dir).toBe(0); }
        });
        it('clockwise polygon input is accepted (orientation normalised)', async () => {
            const g = await clip(BOX + bounded([[0, 3], [3, 3], [3, -3], [0, -3]]));
            close(volume(g), 60, 1e-4);
        });
        it('concave polygon → null (caller falls back)', async () => {
            const g = await clip(BOX + bounded([[0, -3], [3, -3], [3, 3], [1, 3], [1, 0], [0, 0]]));
            expect(g).toBe(null);
        });
    });
});
