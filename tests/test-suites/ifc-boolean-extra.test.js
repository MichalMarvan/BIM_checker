/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('Ifc boolean extra — DIFFERENCE with a convex IfcExtrudedAreaSolid in any position', () => {
    let tryBooleanDifference, extrudedAreaSolidToGeometry, parseStepText, EntityIndex;
    async function load() {
        if (tryBooleanDifference) return;
        ({ tryBooleanDifference } = await import('../../assets/js/3d/ifc-engine/geometry/boolean-extra.js'));
        ({ extrudedAreaSolidToGeometry } = await import('../../assets/js/3d/ifc-engine/geometry/mesh-types.js'));
        ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
        ({ EntityIndex } = await import('../../assets/js/3d/ifc-engine/parser/entity-index.js'));
    }
    function leaf(entityIndex, id) {
        const e = entityIndex.byExpressId(id);
        return e && e.type === 'IFCEXTRUDEDAREASOLID' ? extrudedAreaSolidToGeometry(entityIndex, id) : null;
    }
    async function diff(step, firstId = 20, secondId = 30) {
        await load();
        const parsed = parseStepText(`ISO-10303-21; HEADER; FILE_SCHEMA(('IFC4')); ENDSEC; DATA; ${step} ENDSEC; END-ISO-10303-21;`);
        return tryBooleanDifference(new EntityIndex(parsed.entities), firstId, secondId, leaf);
    }
    // Box x∈[-1,1], y∈[-2,2], z∈[0,10] (volume 80), #20.
    const BOX = `
#1=IFCCARTESIANPOINT((0.,0.,0.)); #3=IFCDIRECTION((0.,0.,1.));
#10=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,2.,4.);
#20=IFCEXTRUDEDAREASOLID(#10,$,#3,10.);`;
    // Cutter #30: rectangle xDim×yDim in the local XY of placement (loc, axis, refDir), extruded `depth` along local +Z.
    function cutter(loc, axis, refDir, xDim, yDim, depth, id = 30) {
        return `
#${id + 1}=IFCCARTESIANPOINT((${loc.join(',')})); #${id + 2}=IFCDIRECTION((${axis.join(',')}));
#${id + 3}=IFCDIRECTION((${refDir.join(',')})); #${id + 4}=IFCAXIS2PLACEMENT3D(#${id + 1},#${id + 2},#${id + 3});
#${id + 5}=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${xDim},${yDim});
#${id}=IFCEXTRUDEDAREASOLID(#${id + 5},#${id + 4},#3,${depth});`;
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
    // Every edge used exactly once in each direction after positional welding → closed, consistently oriented.
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
        const bad = [];
        const inv = [...ids.keys()];
        for (const [key, [cnt, dir]] of edges) if (cnt !== 2 || dir !== 0) bad.push(`${key.split(':').map(i => inv[i]).join(' -> ')} (${cnt},${dir})`);
        expect(bad.slice(0, 3).join(' | ')).toBe('');
    }
    function assertFinite(g) {
        const p = g.attributes.position.array, n = g.attributes.normal.array;
        let bad = 0;
        for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) bad++;
        for (let i = 0; i < n.length; i++) if (!Number.isFinite(n[i])) bad++;
        expect(bad).toBe(0);
    }

    it('perpendicular tunnel through the box (beam notch pattern): volume 80 − 1·1·2', async () => {
        // axis X, refDir Y → local (x,y) = object (y,z); square 1×1 centred at y=0,z=5, x from −5 to 5.
        const g = await diff(BOX + cutter([-5, 0, 5], [1, 0, 0], [0, 1, 0], 1, 1, 10));
        bounds(g, [-1, -2, 0, 1, 2, 10]);
        close(volume(g), 78, 1e-4);
        assertClosed(g); assertFinite(g);
    });
    it('perpendicular corner notch: cutter partly outside the box removes 1·1.5·1.5', async () => {
        // object y∈[0.5,2.5], z∈[8.5,10.5], x∈[0,5] → ∩ box = x∈[0,1], y∈[0.5,2], z∈[8.5,10].
        const g = await diff(BOX + cutter([0, 1.5, 9.5], [1, 0, 0], [0, 1, 0], 2, 2, 5));
        bounds(g, [-1, -2, 0, 1, 2, 10]);
        close(volume(g), 80 - 2.25, 1e-4);
        assertClosed(g); assertFinite(g);
    });
    it('anti-parallel through hole (plate pattern, axis −Z): volume 80 − 1·1·10', async () => {
        // Position Z = −Z, extrusion along local +Z from z=12 down to z=−2.
        const g = await diff(BOX + cutter([0, 0, 12], [0, 0, -1], [1, 0, 0], 1, 1, 14));
        bounds(g, [-1, -2, 0, 1, 2, 10]);
        close(volume(g), 70, 1e-4);
        assertClosed(g); assertFinite(g);
    });
    it('rotated (45°) square tunnel: non axis-aligned side planes, volume 80 − 2', async () => {
        const g = await diff(BOX + cutter([-5, 0, 5], [1, 0, 0], [0, 1, 1], 1, 1, 10));
        close(volume(g), 78, 1e-4);
        assertClosed(g); assertFinite(g);
    });
    it('cutter that only touches the box along a face removes nothing; cutter that misses it returns the box', async () => {
        const touch = await diff(BOX + cutter([-5, 0, 10.5], [1, 0, 0], [0, 1, 0], 1, 1, 10)); // z∈[10,11]
        close(volume(touch), 80, 1e-4); assertClosed(touch);
        const miss = await diff(BOX + cutter([-5, 0, 20], [1, 0, 0], [0, 1, 0], 1, 1, 10));
        close(volume(miss), 80, 1e-4);
    });
    it('cutter swallowing the whole box gives null (empty result → caller falls back)', async () => {
        const g = await diff(BOX + cutter([-5, 0, 5], [1, 0, 0], [0, 1, 0], 20, 20, 10));
        expect(g).toBe(null);
    });
    it('chain DIFF(DIFF(box, tunnel), notch) is followed through the FirstOperand', async () => {
        const step = BOX
            + cutter([-5, 0, 5], [1, 0, 0], [0, 1, 0], 1, 1, 10, 30)
            + cutter([0, 1.5, 9.5], [1, 0, 0], [0, 1, 0], 2, 2, 5, 40)
            + '#50=IFCBOOLEANRESULT(.DIFFERENCE.,#20,#30);';
        const g = await diff(step, 50, 40);
        close(volume(g), 80 - 2 - 2.25, 1e-4);
        assertClosed(g); assertFinite(g);
    });
    it('cutter flush with the top face (coplanar face, material inside the cutter): corner notch 1·1.5·1.5', async () => {
        // object y∈[0.5,2.5], z∈[8.5,10] (top plane z=10 coincides with the box top), x∈[0,5].
        const g = await diff(BOX + cutter([0, 1.5, 9.25], [1, 0, 0], [0, 1, 0], 2, 1.5, 5));
        bounds(g, [-1, -2, 0, 1, 2, 10]);
        close(volume(g), 80 - 2.25, 1e-4);
        assertClosed(g); assertFinite(g);
    });
    it('chain where the second cutter lies flush on the notch floor (coplanar face, material outside, plane splits the solid)', async () => {
        // notch: x∈[0,1], y∈[0.5,2], z∈[8.5,10]; second: y∈[1,3], z∈[8.5,9], x∈[-5,5] → removes x∈[-1,0], y∈[1,2], z∈[8.5,9].
        const step = BOX
            + cutter([0, 1.5, 9.5], [1, 0, 0], [0, 1, 0], 2, 2, 5, 30)
            + cutter([-5, 2, 8.75], [1, 0, 0], [0, 1, 0], 2, 0.5, 10, 40)
            + '#50=IFCBOOLEANRESULT(.DIFFERENCE.,#20,#30);';
        const g = await diff(step, 50, 40);
        close(volume(g), 80 - 2.25 - 0.5, 1e-4);
        assertClosed(g); assertFinite(g);
    });
    it('non-convex (L shape) profile is decomposed: through hole removes area 0.75 × 10', async () => {
        const lShape = BOX + `
#31=IFCCARTESIANPOINT((-0.5,-0.5,12.)); #32=IFCDIRECTION((0.,0.,-1.)); #33=IFCDIRECTION((1.,0.,0.));
#34=IFCAXIS2PLACEMENT3D(#31,#32,#33);
#41=IFCCARTESIANPOINT((0.,0.)); #42=IFCCARTESIANPOINT((1.,0.)); #43=IFCCARTESIANPOINT((1.,0.5));
#44=IFCCARTESIANPOINT((0.5,0.5)); #46=IFCCARTESIANPOINT((0.5,1.)); #47=IFCCARTESIANPOINT((0.,1.));
#45=IFCPOLYLINE((#41,#42,#43,#44,#46,#47,#41));
#35=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#45);
#30=IFCEXTRUDEDAREASOLID(#35,#34,#3,14.);`;
        const g = await diff(lShape);
        bounds(g, [-1, -2, 0, 1, 2, 10]);
        close(volume(g), 80 - 7.5, 1e-4);
        assertClosed(g); assertFinite(g);
    });
    it('arbitrary closed polyline profile (convex quad) works, profile with a void returns null', async () => {
        const quad = BOX + `
#31=IFCCARTESIANPOINT((-5.,0.,5.)); #32=IFCDIRECTION((1.,0.,0.)); #33=IFCDIRECTION((0.,1.,0.));
#34=IFCAXIS2PLACEMENT3D(#31,#32,#33);
#41=IFCCARTESIANPOINT((-0.5,-0.5)); #42=IFCCARTESIANPOINT((0.5,-0.5)); #43=IFCCARTESIANPOINT((0.5,0.5)); #44=IFCCARTESIANPOINT((-0.5,0.5));
#45=IFCPOLYLINE((#41,#42,#43,#44,#41));
#35=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#45);
#30=IFCEXTRUDEDAREASOLID(#35,#34,#3,10.);`;
        const g = await diff(quad);
        close(volume(g), 78, 1e-4); assertClosed(g);
        const withVoid = BOX + `
#31=IFCCARTESIANPOINT((-5.,0.,5.)); #32=IFCDIRECTION((1.,0.,0.)); #33=IFCDIRECTION((0.,1.,0.));
#34=IFCAXIS2PLACEMENT3D(#31,#32,#33);
#41=IFCCARTESIANPOINT((-0.5,-0.5)); #42=IFCCARTESIANPOINT((0.5,-0.5)); #43=IFCCARTESIANPOINT((0.5,0.5)); #44=IFCCARTESIANPOINT((-0.5,0.5));
#45=IFCPOLYLINE((#41,#42,#43,#44,#41));
#46=IFCCARTESIANPOINT((-0.2,-0.2)); #47=IFCCARTESIANPOINT((0.2,-0.2)); #48=IFCCARTESIANPOINT((0.2,0.2)); #49=IFCCARTESIANPOINT((-0.2,0.2));
#51=IFCPOLYLINE((#46,#47,#48,#49,#46));
#35=IFCARBITRARYPROFILEDEFWITHVOIDS(.AREA.,$,#45,(#51));
#30=IFCEXTRUDEDAREASOLID(#35,#34,#3,10.);`;
        expect(await diff(withVoid)).toBe(null);
    });
    it('second operand that is not an extruded solid returns null', async () => {
        const g = await diff(BOX + `
#31=IFCCARTESIANPOINT((0.,0.,5.)); #32=IFCDIRECTION((0.,0.,1.));
#33=IFCAXIS2PLACEMENT3D(#31,#32,$); #34=IFCPLANE(#33); #30=IFCHALFSPACESOLID(#34,.T.);`);
        expect(g).toBe(null);
    });
});
