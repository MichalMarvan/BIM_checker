/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('IFC advanced BRep / surface model / CSG', () => {
    let api, parseStepText, EntityIndex;
    async function build(step, id, name = 'advancedBrepToGeometry') {
        if (!api) {
            api = await import('../../assets/js/3d/ifc-engine/geometry/advanced-brep.js');
            ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
            ({ EntityIndex } = await import('../../assets/js/3d/ifc-engine/parser/entity-index.js'));
        }
        const parsed = parseStepText(`ISO-10303-21; HEADER; FILE_SCHEMA(('IFC4')); ENDSEC; DATA; ${step} ENDSEC; END-ISO-10303-21;`);
        return api[name](new EntityIndex(parsed.entities), id);
    }
    function close(a, b, eps = 1e-5) { expect(Math.abs(a - b) < eps).toBe(true); }
    function bbox(g) {
        expect(g !== null).toBe(true);
        const o = g.userData.localOrigin;
        return [...g.boundingBox.min.toArray().map((v, i) => v + o[i]), ...g.boundingBox.max.toArray().map((v, i) => v + o[i])];
    }
    function measure(g, area = false) {
        const p = g.attributes.position, ix = g.index;
        let sum = 0;
        for (let i = 0; i < ix.count; i += 3) {
            const a = ix.getX(i), b = ix.getX(i + 1), c = ix.getX(i + 2);
            const x = [p.getX(a), p.getY(a), p.getZ(a)], y = [p.getX(b), p.getY(b), p.getZ(b)], z = [p.getX(c), p.getY(c), p.getZ(c)];
            if (area) {
                const u = y.map((v, k) => v - x[k]), v = z.map((v, k) => v - x[k]);
                sum += Math.hypot(u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]) / 2;
            } else sum += (x[0]*(y[1]*z[2]-y[2]*z[1]) + x[1]*(y[2]*z[0]-y[0]*z[2]) + x[2]*(y[0]*z[1]-y[1]*z[0])) / 6;
        }
        return sum;
    }
    function fixture() {
        let next = 1, text = '';
        const add = (type, p) => { const id = next++; text += `#${id}=${type}(${p});\n`; return id; };
        const point = a => add('IFCCARTESIANPOINT', `(${a.join(',')})`);
        const refs = ids => `(${ids.map(id => `#${id}`).join(',')})`;
        const placement = (o, n = [0,0,1], x = [1,0,0]) => add('IFCAXIS2PLACEMENT3D', `#${point(o)},#${add('IFCDIRECTION', `(${n})`)},#${add('IFCDIRECTION', `(${x})`)}`);
        const bound = (points, outer = true, orientation = '.T.') => add(outer ? 'IFCFACEOUTERBOUND' : 'IFCFACEBOUND', `#${add('IFCPOLYLOOP', refs(points.map(point)))},${orientation}`);
        const shell = faces => add('IFCADVANCEDBREP', `#${add('IFCCLOSEDSHELL', refs(faces))}`);
        return { add, point, refs, placement, bound, shell, get text() { return text; } };
    }
    function box(offset = 0, scale = 1) {
        const f = fixture(), faces = [];
        const points = [[0,0,0],[2,0,0],[2,3,0],[0,3,0],[0,0,4],[2,0,4],[2,3,4],[0,3,4]].map(p => p.map(v => v * scale + offset));
        for (const [order, normal, x] of [
            [[0,3,2,1],[0,0,-1],[1,0,0]], [[4,5,6,7],[0,0,1],[1,0,0]],
            [[0,1,5,4],[0,-1,0],[1,0,0]], [[1,2,6,5],[1,0,0],[0,1,0]],
            [[2,3,7,6],[0,1,0],[-1,0,0]], [[3,0,4,7],[-1,0,0],[0,-1,0]]]) {
            const vertices = order.map(i => f.add('IFCVERTEXPOINT', `#${f.point(points[i])}`));
            const edges = vertices.map((v, i) => {
                const a = points[order[i]], b = points[order[(i + 1) % 4]];
                const d = f.add('IFCDIRECTION', `(${b.map((v, k) => v - a[k])})`);
                const vector = f.add('IFCVECTOR', `#${d},1.`);
                const line = f.add('IFCLINE', `#${f.point(a)},#${vector}`);
                const edge = f.add('IFCEDGECURVE', `#${v},#${vertices[(i + 1) % 4]},#${line},.T.`);
                return f.add('IFCORIENTEDEDGE', `*,*,#${edge},.T.`);
            });
            const bound = f.add('IFCFACEOUTERBOUND', `#${f.add('IFCEDGELOOP', f.refs(edges))},.T.`);
            const plane = f.add('IFCPLANE', `#${f.placement(points[order[0]], normal, x)}`);
            faces.push(f.add('IFCADVANCEDFACE', `(${`#${bound}`}),#${plane},.T.`));
        }
        return { step: f.text + `#9000=IFCCLOSEDSHELL(${f.refs(faces)}); #9001=IFCADVANCEDBREP(#9000);`, id: 9001 };
    }
    it('ADVANCEDBREP line-edge box has 12 outward triangles and volume 24', async () => {
        const f = box(), g = await build(f.step, f.id);
        bbox(g).forEach((v, i) => close(v, [0,0,0,2,3,4][i]));
        expect(g.index.count / 3).toBe(12); close(measure(g), 24);
        expect(g.userData.advancedBrep.partial).toBe(false); g.dispose();
    });
    it('large coordinates retain millimetre details through localOrigin', async () => {
        const f = box(1e8, 0.001), g = await build(f.step, f.id);
        bbox(g).forEach((v, i) => close(v, [0,0,0,0.002,0.003,0.004][i] + 1e8));
        close(measure(g), 24e-9, 1e-12); expect(g.attributes.position.array.every(Number.isFinite)).toBe(true); g.dispose();
    });
    function plate(sense = '.T.', reverse = false, invalidHole = false) {
        const f = fixture(), outer = f.bound([[0,0,0],[4,0,0],[4,4,0],[0,4,0]], true, reverse ? '.F.' : '.T.');
        const hole = f.bound([[1,1,0],[3,1,0],[3,3,0],[1,3,0]], false);
        const plane = f.add('IFCPLANE', `#${f.placement([0,0,0])}`);
        const face = f.add('IFCADVANCEDFACE', `(#${outer},#${invalidHole ? 99999 : hole}),#${plane},${sense}`);
        const id = f.shell([face]); return { step: f.text, id };
    }
    it('inner FACEBOUND removes area even with the same winding as outer', async () => {
        const f = plate(), g = await build(f.step, f.id); close(measure(g, true), 12); g.dispose();
    });
    it('SameSense reverses normals; bound Orientation does not override surface sense', async () => {
        for (const reverse of [false, true]) {
            const f = plate('.F.', reverse), g = await build(f.step, f.id);
            expect(g.attributes.normal.getZ(0) < -0.99).toBe(true); close(measure(g, true), 12); g.dispose();
        }
    });
    it('invalid hole drops whole face rather than filling the opening', async () => {
        const f = plate('.T.', false, true); expect(await build(f.step, f.id)).toBe(null);
    });
    it('face-based connected face set preserves holes and orientation', async () => {
        const f = fixture(), b = f.bound([[0,0,0],[4,0,0],[4,4,0],[0,4,0]], true, '.F.');
        const h = f.bound([[1,1,0],[3,1,0],[3,3,0],[1,3,0]], false);
        const face = f.add('IFCFACE', `(#${h},#${b})`), set = f.add('IFCCONNECTEDFACESET', f.refs([face]));
        const id = f.add('IFCFACEBASEDSURFACEMODEL', f.refs([set]));
        const g = await build(f.text, id, 'faceBasedSurfaceModelToGeometry');
        close(measure(g, true), 12); expect(g.attributes.normal.getZ(0) < -0.99).toBe(true); g.dispose();
    });
    it('implicit outer FACEBOUND is selected before deriving the face normal', async () => {
        const f = fixture(), outer = f.bound([[0,0,0],[4,0,0],[4,4,0],[0,4,0]], false);
        const hole = f.bound([[1,1,0],[1,3,0],[3,3,0],[3,1,0]], false);
        const face = f.add('IFCFACE', `(#${hole},#${outer})`), set = f.add('IFCCONNECTEDFACESET', f.refs([face]));
        const id = f.add('IFCFACEBASEDSURFACEMODEL', f.refs([set]));
        const g = await build(f.text, id, 'faceBasedSurfaceModelToGeometry');
        close(measure(g, true), 12); expect(g.attributes.normal.getZ(0) > 0.99).toBe(true); g.dispose();
    });
    function cylinder() {
        const f = fixture(), points = [[2,0,0],[2,0,5]], vertices = points.map(p => f.add('IFCVERTEXPOINT', `#${f.point(p)}`));
        const circles = [0,5].map(z => f.add('IFCCIRCLE', `#${f.placement([0,0,z])},2.`));
        const edges = circles.map((c, i) => f.add('IFCEDGECURVE', `#${vertices[i]},#${vertices[i]},#${c},.T.`));
        const line = f.add('IFCPOLYLINE', f.refs(points.map(f.point)));
        const seam = f.add('IFCEDGECURVE', `#${vertices[0]},#${vertices[1]},#${line},.T.`);
        const oriented = (id, flag) => f.add('IFCORIENTEDEDGE', `*,*,#${id},${flag}`);
        const bound = ids => f.add('IFCFACEOUTERBOUND', `#${f.add('IFCEDGELOOP', f.refs(ids))},.T.`);
        const sideBound = bound([oriented(edges[0], '.T.'), oriented(seam, '.T.'), oriented(edges[1], '.F.'), oriented(seam, '.F.')]);
        const surface = f.add('IFCCYLINDRICALSURFACE', `#${f.placement([0,0,0])},2.`);
        const faces = [f.add('IFCADVANCEDFACE', `(#${sideBound}),#${surface},.T.`)];
        for (let i = 0; i < 2; i++) {
            const b = bound([oriented(edges[i], '.T.')]), plane = f.add('IFCPLANE', `#${f.placement([0,0,i * 5])}`);
            faces.push(f.add('IFCADVANCEDFACE', `(#${b}),#${plane},${i ? '.T.' : '.F.'}`));
        }
        const id = f.shell(faces); return { step: f.text, id };
    }
    it('seamed cylindrical surface and circular caps have analytical bounds and volume', async () => {
        const f = cylinder(), g = await build(f.step, f.id);
        expect(g.userData.advancedBrep.partial).toBe(false);
        bbox(g).forEach((v, i) => close(v, [-2,-2,0,2,2,5][i]));
        close(measure(g), Math.PI * 20, 0.15); g.dispose();
    });
    it('clamped B-spline patch samples curvature rather than only its trim polygon', async () => {
        const f = fixture(), cp = [];
        for (let u = 0; u < 3; u++) cp.push([0,1,2].map(v => f.point([u, v, u === 1 && v === 1 ? 2 : 0])));
        const s = f.add('IFCBSPLINESURFACEWITHKNOTS', `2,2,(${cp.map(f.refs)}),.UNSPECIFIED.,.F.,.F.,.F.,(3,3),(3,3),(0.,1.),(0.,1.),.UNSPECIFIED.`);
        const b = f.bound([[0,0,0],[2,0,0],[2,2,0],[0,2,0]]);
        const face = f.add('IFCADVANCEDFACE', `(#${b}),#${s},.T.`), id = f.shell([face]);
        const g = await build(f.text, id); close(bbox(g)[5], 0.5); expect(g.index.count > 6).toBe(true); g.dispose();
    });
    for (const kind of ['IFCSPHERICALSURFACE', 'IFCTOROIDALSURFACE', 'IFCCONICALSURFACE']) {
        it(`${kind} samples a bounded patch with the expected outward sense`, async () => {
            const f = fixture(), placement = f.placement([0,0,0]);
            const at = (u, v) => {
                if (kind === 'IFCSPHERICALSURFACE') return [2*Math.cos(v)*Math.cos(u),2*Math.cos(v)*Math.sin(u),2*Math.sin(v)];
                if (kind === 'IFCTOROIDALSURFACE') return [(3+Math.cos(v))*Math.cos(u),(3+Math.cos(v))*Math.sin(u),Math.sin(v)];
                return [(2+v)*Math.cos(u),(2+v)*Math.sin(u),v];
            };
            const params = kind === 'IFCTOROIDALSURFACE' ? '3.,1.' : kind === 'IFCCONICALSURFACE' ? `2.,${Math.PI/4}` : '2.';
            const surface = f.add(kind, `#${placement},${params}`);
            const b = f.bound([at(0,0),at(Math.PI/2,0),at(Math.PI/2,Math.PI/4),at(0,Math.PI/4)]);
            const face = f.add('IFCADVANCEDFACE', `(#${b}),#${surface},.T.`), id = f.shell([face]);
            const g = await build(f.text, id);
            expect(g !== null).toBe(true); expect(g.index.count > 6).toBe(true);
            const o = g.userData.localOrigin, p = g.attributes.position, n = g.attributes.normal;
            expect(p.array.every(Number.isFinite)).toBe(true);
            expect(n.getX(0)*(p.getX(0)+o[0]) + n.getY(0)*(p.getY(0)+o[1]) > 0).toBe(true);
            g.dispose();
        });
    }
    it('linear extrusion surface samples an open curve profile and respects its trim', async () => {
        const f = fixture(), curve = f.add('IFCPOLYLINE', f.refs([[0,0],[2,0]].map(f.point)));
        const profile = f.add('IFCARBITRARYOPENPROFILEDEF', `.CURVE.,$,#${curve}`);
        const direction = f.add('IFCDIRECTION', '(0.,0.,1.)');
        const surface = f.add('IFCSURFACEOFLINEAREXTRUSION', `#${profile},$,#${direction},1.`);
        const b = f.bound([[0,0,0],[2,0,0],[2,0,3],[0,0,3]]);
        const face = f.add('IFCADVANCEDFACE', `(#${b}),#${surface},.T.`), id = f.shell([face]);
        const g = await build(f.text, id); close(measure(g, true), 6);
        expect(g.attributes.normal.getY(0) < -0.99).toBe(true); g.dispose();
    });
    it('revolution surface samples a line profile about an explicit axis', async () => {
        const f = fixture(), curve = f.add('IFCPOLYLINE', f.refs([[2,0],[2,3]].map(f.point)));
        const profile = f.add('IFCARBITRARYOPENPROFILEDEF', `.CURVE.,$,#${curve}`);
        const direction = f.add('IFCDIRECTION', '(0.,1.,0.)');
        const axis = f.add('IFCAXIS1PLACEMENT', `#${f.point([0,0,0])},#${direction}`);
        const surface = f.add('IFCSURFACEOFREVOLUTION', `#${profile},$,#${axis}`);
        const b = f.bound([[2,0,0],[0,0,-2],[0,3,-2],[2,3,0]]);
        const face = f.add('IFCADVANCEDFACE', `(#${b}),#${surface},.T.`), id = f.shell([face]);
        const g = await build(f.text, id); close(measure(g, true), 3*Math.PI, 0.02); g.dispose();
    });
    const primitiveBase = '#1=IFCCARTESIANPOINT((100000000.,200000000.,300000000.)); #2=IFCAXIS2PLACEMENT3D(#1,$,$);';
    it('CSG wrapper/block uses corner origin and preserves placement precision', async () => {
        const g = await build(primitiveBase + '#3=IFCBLOCK(#2,0.01,0.02,0.03); #4=IFCCSGSOLID(#3);', 4, 'csgPrimitiveToGeometry');
        bbox(g).forEach((v, i) => close(v, [1e8,2e8,3e8,1e8+0.01,2e8+0.02,3e8+0.03][i], 1e-7));
        close(measure(g), 0.000006, 1e-10); g.dispose();
    });
    for (const [type, dimensions, bounds, volume] of [
        ['IFCRIGHTCIRCULARCYLINDER', '5.,2.', [-2,-2,0,2,2,5], 20 * Math.PI],
        ['IFCRIGHTCIRCULARCONE', '6.,2.', [-2,-2,0,2,2,6], 8 * Math.PI],
        ['IFCSPHERE', '2.', [-2,-2,-2,2,2,2], 32 * Math.PI / 3],
        ['IFCRECTANGULARPYRAMID', '2.,3.,4.', [0,0,0,2,3,4], 8]
    ]) it(`${type} bounds and outward volume`, async () => {
        const g = await build(primitiveBase.replace('(100000000.,200000000.,300000000.)', '(0.,0.,0.)') + `#3=${type}(#2,${dimensions});`, 3, 'csgPrimitiveToGeometry');
        bbox(g).forEach((v, i) => close(v, bounds[i])); close(measure(g), volume, volume * 0.01); g.dispose();
    });
    it('CSG reuses the existing extruded difference pattern', async () => {
        const step = `#1=IFCCARTESIANPOINT((0.,0.,0.)); #2=IFCAXIS2PLACEMENT3D(#1,$,$);
#3=IFCDIRECTION((0.,0.,1.)); #4=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,4.,4.);
#5=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,2.,2.); #6=IFCEXTRUDEDAREASOLID(#4,#2,#3,2.);
#7=IFCEXTRUDEDAREASOLID(#5,#2,#3,2.); #8=IFCBOOLEANRESULT(.DIFFERENCE.,#6,#7); #9=IFCCSGSOLID(#8);`;
        const g = await build(step, 9, 'csgPrimitiveToGeometry');
        expect(g.userData.csg.exactBooleanDifference).toBe(true); close(measure(g), 24); g.dispose();
    });
    it('boolean fallback is explicitly first-operand-only', async () => {
        const g = await build(primitiveBase + '#3=IFCBLOCK(#2,2.,3.,4.); #4=IFCSPHERE(#2,1.); #5=IFCBOOLEANRESULT(.DIFFERENCE.,#3,#4); #6=IFCCSGSOLID(#5);', 6, 'csgPrimitiveToGeometry');
        expect(g.userData.csg.firstOperandOnly).toBe(true); expect(g.userData.csg.approximate).toBe(true); close(measure(g), 24); g.dispose();
    });
    it('unsupported/cyclic/invalid roots return null', async () => {
        for (const step of ['#3=IFCCSGSOLID(#3);', '#3=IFCBLOCK(#2,-1.,2.,3.);', '#3=IFCSPHERE(#99,2.);', '#3=IFCUNSUPPORTED();']) {
            expect(await build(primitiveBase + step, 3, 'csgPrimitiveToGeometry')).toBe(null);
        }
        expect(await build('', 404)).toBe(null);
    });
    it('unsupported surface is skipped with a partial diagnostic', async () => {
        const f = box(), step = f.step.replace('#9000=IFCCLOSEDSHELL((', '#9000=IFCCLOSEDSHELL((#9900,');
        const g = await build(step + '#9900=IFCADVANCEDFACE((#9901),#9902,.T.); #9901=IFCFACEOUTERBOUND(#9903,.T.); #9902=IFCRATIONALBSPLINESURFACEWITHKNOTS($); #9903=IFCPOLYLOOP((#9904,#9905,#9906)); #9904=IFCCARTESIANPOINT((0.,0.,0.)); #9905=IFCCARTESIANPOINT((1.,0.,0.)); #9906=IFCCARTESIANPOINT((0.,1.,0.));', f.id);
        expect(g.userData.advancedBrep.partial).toBe(true); expect(g.userData.advancedBrep.skippedFaces.length).toBe(1); close(measure(g), 24); g.dispose();
    });
});
