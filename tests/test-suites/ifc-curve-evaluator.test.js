/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('ifc-curve-evaluator — composite curve (line+circle)', () => {
    let evaluateCurve, parseStepText, EntityIndex;
    async function mods() {
        if (!evaluateCurve) {
            ({ evaluateCurve } = await import('../../assets/js/3d/ifc-engine/alignment/curve-evaluator.js'));
            ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
            ({ EntityIndex } = await import('../../assets/js/3d/ifc-engine/parser/entity-index.js'));
        }
    }
    function idx(step) {
        const { entities } = parseStepText(step);
        return new EntityIndex(entities);
    }
    // Přímka 100 m (+X) → CCW oblouk R=50 čtvrtkruh → DISCONTINUOUS terminátor.
    // Očekávaný konec oblouku: (150, 50), tečna +Y.
    const FIXTURE = `
#1=IFCCARTESIANPOINT((0.,0.));
#2=IFCDIRECTION((1.,0.));
#3=IFCAXIS2PLACEMENT2D(#1,#2);
#5=IFCVECTOR(#2,1.);
#4=IFCLINE(#1,#5);
#6=IFCCURVESEGMENT(.CONTINUOUS.,#3,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(100.),#4);
#7=IFCCARTESIANPOINT((100.,0.));
#8=IFCAXIS2PLACEMENT2D(#7,#2);
#11=IFCCIRCLE(#3,50.);
#12=IFCCURVESEGMENT(.CONTINUOUS.,#8,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(78.53981633974483),#11);
#13=IFCCARTESIANPOINT((150.,50.));
#14=IFCDIRECTION((0.,1.));
#15=IFCAXIS2PLACEMENT2D(#13,#14);
#16=IFCCURVESEGMENT(.DISCONTINUOUS.,#15,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(0.),#11);
#17=IFCCOMPOSITECURVE((#6,#12,#16),.F.);
`;
    it('délka = 178.54 (terminátor nepočítán)', async () => {
        await mods();
        const ce = evaluateCurve(idx(FIXTURE), 17);
        expect(Math.abs(ce.length - 178.53981633974483) < 1e-9).toBe(true);
    });
    it('evalAt uprostřed přímky', async () => {
        await mods();
        const ce = evaluateCurve(idx(FIXTURE), 17);
        const r = ce.evalAt(50);
        expect(Math.abs(r.point[0] - 50) < 1e-9).toBe(true);
        expect(Math.abs(r.point[1]) < 1e-9).toBe(true);
        expect(Math.abs(r.azimuth) < 1e-9).toBe(true);
    });
    it('evalAt na konci CCW oblouku: (150,50), tečna +Y', async () => {
        await mods();
        const ce = evaluateCurve(idx(FIXTURE), 17);
        const r = ce.evalAt(178.53981633974483);
        expect(Math.abs(r.point[0] - 150) < 1e-6).toBe(true);
        expect(Math.abs(r.point[1] - 50) < 1e-6).toBe(true);
        expect(Math.abs(r.azimuth - Math.PI / 2) < 1e-6).toBe(true);
    });
    it('evalAt v půlce oblouku (45°): x=100+50·sin45, y=50·(1−cos45)', async () => {
        await mods();
        const ce = evaluateCurve(idx(FIXTURE), 17);
        const r = ce.evalAt(100 + 78.53981633974483 / 2);
        expect(Math.abs(r.point[0] - (100 + 50 * Math.SQRT1_2)) < 1e-6).toBe(true);
        expect(Math.abs(r.point[1] - 50 * (1 - Math.SQRT1_2)) < 1e-6).toBe(true);
    });
    it('CW oblouk (záporná SegmentLength) zatáčí doprava', async () => {
        await mods();
        // Jen oblouk: start (0,0) směr +X, R=50, délka −78.54 (CW čtvrtkruh) → konec (50,−50), tečna −Y
        const cw = `
#1=IFCCARTESIANPOINT((0.,0.));
#2=IFCDIRECTION((1.,0.));
#3=IFCAXIS2PLACEMENT2D(#1,#2);
#11=IFCCIRCLE(#3,50.);
#12=IFCCURVESEGMENT(.CONTINUOUS.,#3,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(-78.53981633974483),#11);
#17=IFCCOMPOSITECURVE((#12),.F.);
`;
        const ce = evaluateCurve(idx(cw), 17);
        const r = ce.evalAt(78.53981633974483);
        expect(Math.abs(r.point[0] - 50) < 1e-6).toBe(true);
        expect(Math.abs(r.point[1] - (-50)) < 1e-6).toBe(true);
        expect(Math.abs(r.azimuth - (-Math.PI / 2)) < 1e-6).toBe(true);
    });
    it('sample vrací parallel arrays a monotónní stations', async () => {
        await mods();
        const ce = evaluateCurve(idx(FIXTURE), 17);
        const s = ce.sample(1.0);
        expect(s.points.length).toBe(s.stations.length);
        expect(s.points.length).toBe(s.tangents.length);
        expect(s.points.length > 10).toBe(true);
        let mono = true;
        for (let i = 1; i < s.stations.length; i++) if (s.stations[i] <= s.stations[i - 1]) mono = false;
        expect(mono).toBe(true);
        const last = s.points[s.points.length - 1];
        expect(Math.abs(last[0] - 150) < 0.01).toBe(true);
        expect(Math.abs(last[1] - 50) < 0.01).toBe(true);
    });
    it('neznámý typ → null', async () => {
        await mods();
        const ce = evaluateCurve(idx('#1=IFCCARTESIANPOINT((0.,0.));'), 1);
        expect(ce).toBe(null);
    });
});
