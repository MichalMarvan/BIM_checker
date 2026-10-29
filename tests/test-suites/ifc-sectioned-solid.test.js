/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('IfcSectionedSolidHorizontal — independent geometry module', () => {
    let build, parseStepText, EntityIndex;
    async function geometry(step, id = 20) {
        if (!build) {
            ({ sectionedSolidHorizontalToGeometry: build } = await import('../../assets/js/3d/ifc-engine/geometry/sectioned-solid.js'));
            ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
            ({ EntityIndex } = await import('../../assets/js/3d/ifc-engine/parser/entity-index.js'));
        }
        const parsed = parseStepText(`ISO-10303-21; HEADER; FILE_SCHEMA(('IFC4X3_ADD2')); ENDSEC; DATA; ${step} ENDSEC; END-ISO-10303-21;`);
        return build(new EntityIndex(parsed.entities), id);
    }
    const base = `
#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCDIRECTION((1.,0.,0.));
#3=IFCVECTOR(#2,1.);
#4=IFCLINE(#1,#3);
#10=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,2.,4.);
#11=IFCDISTANCEEXPRESSION(0.,$,$,$,.T.);
#12=IFCDISTANCEEXPRESSION(10.,$,$,$,.T.);
#20=IFCSECTIONEDSOLIDHORIZONTAL(#4,(#10,#10),(#11,#12),.T.);`;
    const modern = base.replace('#11=IFCDISTANCEEXPRESSION(0.,$,$,$,.T.);', '#11=IFCAXIS2PLACEMENTLINEAR(#13,$,$); #13=IFCPOINTBYDISTANCEEXPRESSION(IFCLENGTHMEASURE(0.),$,$,$,#4);')
        .replace('#12=IFCDISTANCEEXPRESSION(10.,$,$,$,.T.);', '#12=IFCAXIS2PLACEMENTLINEAR(#14,$,$); #14=IFCPOINTBYDISTANCEEXPRESSION(IFCLENGTHMEASURE(10.),$,$,$,#4);')
        .replace('(#11,#12),.T.)', '(#11,#12))');
    function bbox(g) {
        const o = g.userData.localOrigin;
        return [g.boundingBox.min.toArray().map((v, k) => v + o[k]), g.boundingBox.max.toArray().map((v, k) => v + o[k])];
    }
    function close(a, b, eps = 1e-5) { expect(Math.abs(a - b) < eps).toBe(true); }
    function volume(g) {
        const p = g.attributes.position.array, ix = g.index.array;
        let sum = 0;
        for (let i = 0; i < ix.length; i += 3) {
            const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
            sum += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
                + p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2])
                + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
        }
        return sum / 6;
    }
    it('straight two-section box: bounds, 12 outward triangles and closed volume', async () => {
        const g = await geometry(base), b = bbox(g);
        expect(g.index.count / 3).toBe(12);
        [0, -1, -2, 10, 1, 2].forEach((v, i) => close(b.flat()[i], v));
        close(volume(g), 80);
        const edges = new Map();
        const ix = g.index.array;
        for (let i = 0; i < ix.length; i += 3) for (let j = 0; j < 3; j++) {
            const a = ix[i + j], b = ix[i + (j + 1) % 3], key = [Math.min(a,b), Math.max(a,b)].join(':');
            const entry = edges.get(key) || [0, 0];
            entry[0]++; entry[1] += a < b ? 1 : -1; edges.set(key, entry);
        }
        expect([...edges.values()].every(([count, direction]) => count === 2 && direction === 0)).toBe(true);
        g.dispose();
    });
    it('ADD2 linear placements use default lateral/upwards profile frame', async () => {
        const g = await geometry(modern);
        expect(g.index.count / 3).toBe(12);
        close(volume(g), 80);
        g.dispose();
    });
    it('FixedAxisVertical true/false on a 45-degree slope have different section Y axes', async () => {
        const sloped = base.replace('(1.,0.,0.)', '(1.,0.,1.)');
        const fixed = await geometry(sloped), normal = await geometry(sloped.replace('(#11,#12),.T.)', '(#11,#12),.F.)'));
        const bf = bbox(fixed), bn = bbox(normal);
        close(bf[0][0], 0); close(bf[1][0], 10); close(bf[0][2], -2); close(bf[1][2], 12);
        close(bn[0][0], -Math.SQRT2); close(bn[1][0], 10 + Math.SQRT2);
        close(bn[0][2], -Math.SQRT2); close(bn[1][2], 10 + Math.SQRT2);
        fixed.dispose(); normal.dispose();
    });
    it('AlongHorizontal false and unset use 3D distance, true uses horizontal distance', async () => {
        const sloped = base.replace('(1.,0.,0.)', '(1.,0.,1.)');
        for (const flag of ['.F.', '$']) {
            const g = await geometry(sloped.replaceAll('$,$,$,.T.)', `$,$,$,${flag})`));
            close(bbox(g)[1][0], 10 / Math.SQRT2);
            g.dispose();
        }
    });
    it('legacy lateral and global vertical offsets apply independently of profile slope', async () => {
        const g = await geometry(base.replaceAll('$,$,$,.T.)', '3.,5.,$,.T.)'));
        const b = bbox(g); close(b[0][1], 2); close(b[1][1], 4); close(b[0][2], 3); close(b[1][2], 7);
        g.dispose();
    });
    const arc = `
#1=IFCCARTESIANPOINT((0.,0.)); #2=IFCDIRECTION((1.,0.));
#3=IFCAXIS2PLACEMENT2D(#1,#2); #4=IFCCIRCLE(#3,10.);
#5=IFCCURVESEGMENT(.CONTINUOUS.,#3,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(15.707963267948966),#4);
#6=IFCCOMPOSITECURVE((#5),.F.);
#10=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,2.,4.);
#11=IFCDISTANCEEXPRESSION(0.,$,$,$,.T.);
#12=IFCDISTANCEEXPRESSION(15.707963267948966,$,$,$,.T.);
#20=IFCSECTIONEDSOLIDHORIZONTAL(#6,(#10,#10),(#11,#12),.T.);`;
    it('quarter-circle is sampled between two sections, with analytical bounds and volume', async () => {
        const g = await geometry(arc), b = bbox(g);
        [0, -1, -2, 11, 10, 2].forEach((v, i) => close(b.flat()[i], v));
        expect(g.index.count / 3 > 12).toBe(true);
        close(volume(g), 40 * Math.PI, 0.1);
        g.dispose();
    });
    const hollow = `
#30=IFCCARTESIANPOINT((-0.5,-1.)); #31=IFCCARTESIANPOINT((0.5,-1.));
#32=IFCCARTESIANPOINT((0.5,1.)); #33=IFCCARTESIANPOINT((-0.5,1.));
#34=IFCPOLYLINE((#30,#31,#32,#33,#30));
#40=IFCCARTESIANPOINT((-1.,-2.)); #41=IFCCARTESIANPOINT((1.,-2.));
#42=IFCCARTESIANPOINT((1.,2.)); #43=IFCCARTESIANPOINT((-1.,2.));
#44=IFCPOLYLINE((#40,#41,#42,#43,#40));`;
    it('holes have inner walls and remain open through both end caps', async () => {
        const g = await geometry(base.replace('IFCRECTANGLEPROFILEDEF(.AREA.,$,$,2.,4.)', 'IFCARBITRARYPROFILEDEFWITHVOIDS(.AREA.,$,#44,(#34))') + hollow);
        expect(g.index.count / 3).toBe(32); close(volume(g), 60); g.dispose();
    });
    it('varying matching rectangles produce the correct frustum volume', async () => {
        const g = await geometry(base.replace('(#10,#10)', '(#10,#15)') + '#15=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,4.,8.);');
        close(volume(g), 560 / 3, 1e-4); g.dispose();
    });
    it('large georeferenced origin preserves millimetre dimensions in Float32', async () => {
        const g = await geometry(base.replace('(0.,0.,0.)', '(1000000000.,2000000000.,3000000000.)').replace('2.,4.)', '0.002,0.004)'));
        close(g.boundingBox.max.y - g.boundingBox.min.y, 0.002, 1e-6);
        expect(g.userData.localOrigin[0] > 1e9).toBe(true); g.dispose();
    });
    it('unknown directrix returns null', async () => {
        expect(await geometry(base.replace('IFCLINE(#1,#3)', 'IFCUNSUPPORTEDCURVE(#1)'))).toBe(null);
    });
    it('a partially supported composite curve is rejected instead of skipping a segment', async () => {
        expect(await geometry(arc.replace('(#5),.F.', '(#5,#7),.F.') + '#7=IFCCURVESEGMENT(.CONTINUOUS.,#3,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(1.),#8); #8=IFCUNSUPPORTEDCURVE();')).toBe(null);
    });
    it('unknown profile and mismatched vertex counts return null', async () => {
        expect(await geometry(base.replace('IFCRECTANGLEPROFILEDEF', 'IFCELLIPSEPROFILEDEF'))).toBe(null);
        expect(await geometry(base.replace('(#10,#10)', '(#10,#15)') + '#15=IFCCIRCLEPROFILEDEF(.AREA.,$,$,1.);')).toBe(null);
    });
    it('mismatched number of positions and decreasing stations return null', async () => {
        expect(await geometry(base.replace('(#11,#12)', '(#11)'))).toBe(null);
        expect(await geometry(base.replace('(#11,#12)', '(#12,#11)'))).toBe(null);
    });
    it('longitudinal offsets including zero violate NoLongitudinalOffsets', async () => {
        expect(await geometry(base.replaceAll('$,$,$,.T.)', '$,$,0.,.T.)'))).toBe(null);
    });
    it('explicit ADD2 axes, disputed nonzero vertical offsets, and wrong basis curve return null', async () => {
        expect(await geometry(modern.replace('#13,$,$)', '#13,#2,$)'))).toBe(null);
        expect(await geometry(modern.replace('IFCLENGTHMEASURE(10.),$,$,$,#4', 'IFCLENGTHMEASURE(10.),$,1.,$,#4'))).toBe(null);
        expect(await geometry(modern.replace('IFCLENGTHMEASURE(10.),$,$,$,#4', 'IFCLENGTHMEASURE(10.),$,$,$,#3'))).toBe(null);
    });
    it('stations outside the directrix are rejected rather than clamped', async () => {
        expect(await geometry(arc.replace('IFCDISTANCEEXPRESSION(15.707963267948966', 'IFCDISTANCEEXPRESSION(25.'))).toBe(null);
    });
    it('malformed references and nonfinite coordinates return null without exceptions', async () => {
        expect(await geometry(base.replace('(#10,#10)', '(#10,$)'))).toBe(null);
        expect(await geometry(base.replace('(0.,0.,0.)', '(1.E999,0.,0.)'))).toBe(null);
        expect(await geometry(base, 999)).toBe(null);
    });
    const gradient = `
#1=IFCCARTESIANPOINT((0.,0.)); #2=IFCDIRECTION((1.,0.));
#3=IFCAXIS2PLACEMENT2D(#1,#2); #4=IFCLINE(#1,#7); #7=IFCVECTOR(#2,1.);
#5=IFCCURVESEGMENT(.CONTINUOUS.,#3,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(10.),#4);
#6=IFCCOMPOSITECURVE((#5),.F.);
#30=IFCDIRECTION((1.,1.)); #31=IFCAXIS2PLACEMENT2D(#1,#30);
#32=IFCCURVESEGMENT(.CONTINUOUS.,#31,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(14.142135623730951),#4);
#33=IFCGRADIENTCURVE((#32),.F.,#6,$);
#10=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,2.,4.);
#11=IFCDISTANCEEXPRESSION(0.,$,$,$,.T.); #12=IFCDISTANCEEXPRESSION(10.,$,$,$,.T.);
#20=IFCSECTIONEDSOLIDHORIZONTAL(#33,(#10,#10),(#11,#12),.F.);`;
    it('gradient directrix uses the 3D tangent and horizontal stationing', async () => {
        const g = await geometry(gradient), b = bbox(g);
        close(b[0][0], -Math.SQRT2); close(b[1][0], 10 + Math.SQRT2);
        close(b[1][2], 10 + Math.SQRT2); g.dispose();
    });
    it('incomplete or unsupported vertical segments are rejected, never flattened/clamped', async () => {
        expect(await geometry(gradient.replace('14.142135623730951', '7.'))).toBe(null);
        expect(await geometry(gradient.replace('IFCGRADIENTCURVE((#32)', 'IFCGRADIENTCURVE((#32,#35)') + '#35=IFCCURVESEGMENT(.CONTINUOUS.,#31,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(1.),#36); #36=IFCUNSUPPORTEDCURVE();')).toBe(null);
    });
    it('same profile type with different polygon point counts is rejected without resampling', async () => {
        const step = base.replace('IFCRECTANGLEPROFILEDEF(.AREA.,$,$,2.,4.)', 'IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#44)')
            .replace('(#10,#10)', '(#10,#15)') + hollow + '#16=IFCPOLYLINE((#40,#41,#42,#40)); #15=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#16);';
        expect(await geometry(step)).toBe(null);
    });
    it('circular gradient uses actual horizontal range, not arc length times initial slope', async () => {
        const step = gradient.replace('#32=IFCCURVESEGMENT(.CONTINUOUS.,#31,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(14.142135623730951),#4)',
            '#32=IFCCURVESEGMENT(.CONTINUOUS.,#3,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(5.235987755982989),#40)')
            .replace('#12=IFCDISTANCEEXPRESSION(10.', '#12=IFCDISTANCEEXPRESSION(5.')
            .replace('(#11,#12),.F.)', '(#11,#12),.T.)') + '#40=IFCCIRCLE(#3,10.);';
        const g = await geometry(step), b = bbox(g);
        close(b[1][0], 5); close(b[1][2], 12 - Math.sqrt(75)); g.dispose();
        expect(await geometry(step.replace('#12=IFCDISTANCEEXPRESSION(5.', '#12=IFCDISTANCEEXPRESSION(5.1'))).toBe(null);
    });
    it('circular hollow profile has the polygonal tube volume', async () => {
        const g = await geometry(base.replace('IFCRECTANGLEPROFILEDEF(.AREA.,$,$,2.,4.)', 'IFCCIRCLEHOLLOWPROFILEDEF(.AREA.,$,$,2.,0.5)'));
        const polygonArea = 32 * Math.sin(Math.PI / 32) * (4 - 2.25);
        close(volume(g), 10 * polygonArea, 1e-4); g.dispose();
    });
});
