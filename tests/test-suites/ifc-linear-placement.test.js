/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('ifc-linear-placement — IfcLinearPlacement', () => {
    let resolvePlacement, resolveLinearPlacement, evalPointByDistance, parseStepText, EntityIndex;
    async function mods() {
        if (!resolvePlacement) {
            ({ resolvePlacement } = await import('../../assets/js/3d/ifc-engine/geometry/placement.js'));
            ({ resolveLinearPlacement, evalPointByDistance } = await import('../../assets/js/3d/ifc-engine/alignment/linear-placement.js'));
            ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
            ({ EntityIndex } = await import('../../assets/js/3d/ifc-engine/parser/entity-index.js'));
        }
    }
    function idx(step) { return new EntityIndex(parseStepText(step).entities); }
    // Base: gradient curve — přímka 200 m +X, konstantní 2 % od z=10
    const BASE = `
#1=IFCCARTESIANPOINT((0.,0.));
#2=IFCDIRECTION((1.,0.));
#3=IFCAXIS2PLACEMENT2D(#1,#2);
#5=IFCVECTOR(#2,1.);
#4=IFCLINE(#1,#5);
#6=IFCCURVESEGMENT(.CONTINUOUS.,#3,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(200.),#4);
#7=IFCCOMPOSITECURVE((#6),.F.);
#10=IFCCARTESIANPOINT((0.,10.));
#11=IFCDIRECTION((1.,0.02));
#12=IFCAXIS2PLACEMENT2D(#10,#11);
#13=IFCVECTOR(#11,1.);
#14=IFCLINE(#10,#13);
#15=IFCCURVESEGMENT(.CONTSAMEGRADIENT.,#12,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(200.),#14);
#30=IFCGRADIENTCURVE((#15),.F.,#7,$);
`;
    it('evalPointByDistance: bod + offsety (lateral kladně VLEVO)', async () => {
        await mods();
        // d=50, lateral +2 (vlevo = +Y při azimutu 0), vertical +1 → (50, 2, 12)  [z=10+0.02·50+1]
        const step = BASE + `
#40=IFCPOINTBYDISTANCEEXPRESSION(IFCLENGTHMEASURE(50.),2.,1.,$,#30);
`;
        const r = evalPointByDistance(idx(step), 40);
        expect(Math.abs(r.position[0] - 50) < 1e-6).toBe(true);
        expect(Math.abs(r.position[1] - 2) < 1e-6).toBe(true);
        expect(Math.abs(r.position[2] - 12) < 1e-6).toBe(true);
        expect(Math.abs(r.azimuth) < 1e-9).toBe(true);
    });
    it('resolveLinearPlacement bez CartesianPosition: tečný rámec', async () => {
        await mods();
        const step = BASE + `
#40=IFCPOINTBYDISTANCEEXPRESSION(IFCLENGTHMEASURE(50.),$,$,$,#30);
#41=IFCAXIS2PLACEMENTLINEAR(#40,$,$);
#42=IFCLINEARPLACEMENT($,#41,$);
`;
        const m = resolveLinearPlacement(idx(step), 42);
        const el = m.elements; // column-major
        expect(Math.abs(el[12] - 50) < 1e-6).toBe(true);  // tx
        expect(Math.abs(el[13] - 0) < 1e-6).toBe(true);   // ty
        expect(Math.abs(el[14] - 11) < 1e-6).toBe(true);  // tz = 10+0.02·50
        expect(Math.abs(el[0] - 1) < 1e-9).toBe(true);    // X = (1,0,0) (azimut 0)
        expect(Math.abs(el[10] - 1) < 1e-9).toBe(true);   // Z = (0,0,1)
    });
    it('CartesianPosition má přednost před evaluací', async () => {
        await mods();
        const step = BASE + `
#40=IFCPOINTBYDISTANCEEXPRESSION(IFCLENGTHMEASURE(50.),$,$,$,#30);
#41=IFCAXIS2PLACEMENTLINEAR(#40,$,$);
#50=IFCCARTESIANPOINT((999.,-1.,7.));
#51=IFCDIRECTION((0.,0.,1.));
#52=IFCDIRECTION((1.,0.,0.));
#53=IFCAXIS2PLACEMENT3D(#50,#51,#52);
#42=IFCLINEARPLACEMENT($,#41,#53);
`;
        const m = resolveLinearPlacement(idx(step), 42);
        expect(Math.abs(m.elements[12] - 999) < 1e-9).toBe(true);
        expect(Math.abs(m.elements[13] - (-1)) < 1e-9).toBe(true);
        expect(Math.abs(m.elements[14] - 7) < 1e-9).toBe(true);
    });
    it('explicitní osy se respektují (RefDirection = +Y)', async () => {
        await mods();
        const step = BASE + `
#40=IFCPOINTBYDISTANCEEXPRESSION(IFCLENGTHMEASURE(50.),$,$,$,#30);
#43=IFCDIRECTION((0.,0.,1.));
#44=IFCDIRECTION((0.,1.,0.));
#41=IFCAXIS2PLACEMENTLINEAR(#40,#43,#44);
#42=IFCLINEARPLACEMENT($,#41,$);
`;
        const m = resolveLinearPlacement(idx(step), 42);
        const el = m.elements;
        // lokální X = světová +Y
        expect(Math.abs(el[0]) < 1e-9).toBe(true);
        expect(Math.abs(el[1] - 1) < 1e-9).toBe(true);
    });
    it('resolvePlacement dispatchuje IFCLINEARPLACEMENT (ne identita)', async () => {
        await mods();
        const step = BASE + `
#40=IFCPOINTBYDISTANCEEXPRESSION(IFCLENGTHMEASURE(50.),$,$,$,#30);
#41=IFCAXIS2PLACEMENTLINEAR(#40,$,$);
#42=IFCLINEARPLACEMENT($,#41,$);
`;
        const m = resolvePlacement(idx(step), 42);
        expect(Math.abs(m.elements[12] - 50) < 1e-6).toBe(true);
    });
    it('compact() zachová linear placement closure', async () => {
        await mods();
        const step = BASE + `
#40=IFCPOINTBYDISTANCEEXPRESSION(IFCLENGTHMEASURE(50.),$,$,$,#30);
#41=IFCAXIS2PLACEMENTLINEAR(#40,$,$);
#42=IFCLINEARPLACEMENT($,#41,$);
`;
        const index = idx(step);
        index.compact();
        expect(index.byExpressId(42) !== null).toBe(true);
        expect(index.byExpressId(41) !== null).toBe(true);
        expect(index.byExpressId(40) !== null).toBe(true);
        expect(index.byExpressId(30) !== null).toBe(true);
    });
});
