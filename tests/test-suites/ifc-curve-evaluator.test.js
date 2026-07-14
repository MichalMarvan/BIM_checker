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

describe('ifc-curve-evaluator — klotoida', () => {
    let evaluateCurve, parseStepText, EntityIndex;
    async function mods() {
        if (!evaluateCurve) {
            ({ evaluateCurve } = await import('../../assets/js/3d/ifc-engine/alignment/curve-evaluator.js'));
            ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
            ({ EntityIndex } = await import('../../assets/js/3d/ifc-engine/parser/entity-index.js'));
        }
    }
    function idx(step) { return new EntityIndex(parseStepText(step).entities); }
    // Numerická křivost ze 2 bodů (finite difference azimutu přes evalAt)
    function curvatureAt(ce, d, h = 0.5) {
        const a = ce.evalAt(d - h).azimuth, b = ce.evalAt(d + h).azimuth;
        let dth = b - a;
        while (dth > Math.PI) dth -= 2 * Math.PI;
        while (dth < -Math.PI) dth += 2 * Math.PI;
        return dth / (2 * h);
    }
    function clothoidFixture(A, segStart, segLen) {
        return `
#1=IFCCARTESIANPOINT((0.,0.));
#2=IFCDIRECTION((1.,0.));
#3=IFCAXIS2PLACEMENT2D(#1,#2);
#4=IFCCLOTHOID(#3,${A});
#5=IFCCURVESEGMENT(.CONTINUOUS.,#3,IFCLENGTHMEASURE(${segStart}),IFCLENGTHMEASURE(${segLen}),#4);
#6=IFCCOMPOSITECURVE((#5),.F.);
`;
    }
    // Vjezdová přechodnice 0 → R=300 vlevo, L=60: A=+√18000, SegmentStart=0
    it('0→+κ (vjezd do levého oblouku)', async () => {
        await mods();
        const A = Math.sqrt(60 * 300);
        const ce = evaluateCurve(idx(clothoidFixture(A, 0, 60)), 6);
        expect(Math.abs(curvatureAt(ce, 1) - 1 / 18000) < 1e-3).toBe(true);
        expect(Math.abs(curvatureAt(ce, 59) - 59 / 18000) < 1e-4).toBe(true);
        // celková změna směru = L²/(2·A²) = 0.1 rad
        expect(Math.abs(ce.evalAt(60).azimuth - 0.1) < 1e-4).toBe(true);
    });
    // PAST č. 3: výjezd z LEVÉHO oblouku R=300 → ∞: A=−√18000, SegmentStart=κ₁·A·|A|=−60
    it('+κ→0 (výjezd z levého oblouku, A<0, SegmentStart<0)', async () => {
        await mods();
        const A = -Math.sqrt(60 * 300);
        const ce = evaluateCurve(idx(clothoidFixture(A, -60, 60)), 6);
        // na začátku κ=+1/300 (levotočivá!), na konci κ→0
        expect(Math.abs(curvatureAt(ce, 1) - 59 / 18000) < 1e-4).toBe(true);
        expect(Math.abs(curvatureAt(ce, 59)) < 1e-3).toBe(true);
        // směr se mění o +0.1 rad (doleva) — zrcadlová větev by dala −0.1
        expect(Math.abs((ce.evalAt(60).azimuth - ce.evalAt(0).azimuth) - 0.1) < 1e-3).toBe(true);
    });
    // 0→−κ (vjezd do pravého oblouku): A=−√18000, SegmentStart=0
    it('0→−κ (vjezd do pravého oblouku)', async () => {
        await mods();
        const A = -Math.sqrt(60 * 300);
        const ce = evaluateCurve(idx(clothoidFixture(A, 0, 60)), 6);
        expect(Math.abs(curvatureAt(ce, 59) - (-59 / 18000)) < 1e-4).toBe(true);
    });
    // −κ→0 (výjezd z pravého oblouku): A=+√18000, SegmentStart=κ₁·A·|A|=−60
    it('−κ→0 (výjezd z pravého oblouku)', async () => {
        await mods();
        const A = Math.sqrt(60 * 300);
        const ce = evaluateCurve(idx(clothoidFixture(A, -60, 60)), 6);
        expect(Math.abs(curvatureAt(ce, 1) - (-59 / 18000)) < 1e-4).toBe(true);
        expect(Math.abs(curvatureAt(ce, 59)) < 1e-3).toBe(true);
    });
    // +κ→+κ′ (mezi levými oblouky R=300→R=150, L=60):
    // Δκ=1/300 → A=+√(60·300), SegmentStart=κ₁·A·|A|=(1/300)·18000=60
    it('+κ→+κ′ (zvětšení levé křivosti)', async () => {
        await mods();
        const A = Math.sqrt(60 * 300);
        const ce = evaluateCurve(idx(clothoidFixture(A, 60, 60)), 6);
        expect(Math.abs(curvatureAt(ce, 1) - 61 / 18000) < 1e-4).toBe(true);
        expect(Math.abs(curvatureAt(ce, 59) - 119 / 18000) < 1e-4).toBe(true);
    });
    // −κ→−κ′: A=−√18000, SegmentStart=(−1/300)·(−18000)=60
    it('−κ→−κ′ (zvětšení pravé křivosti)', async () => {
        await mods();
        const A = -Math.sqrt(60 * 300);
        const ce = evaluateCurve(idx(clothoidFixture(A, 60, 60)), 6);
        expect(Math.abs(curvatureAt(ce, 1) - (-61 / 18000)) < 1e-4).toBe(true);
        expect(Math.abs(curvatureAt(ce, 59) - (-119 / 18000)) < 1e-4).toBe(true);
    });
});

describe('ifc-curve-evaluator — gradient curve (niveleta)', () => {
    let evaluateCurve, parseStepText, EntityIndex;
    async function mods() {
        if (!evaluateCurve) {
            ({ evaluateCurve } = await import('../../assets/js/3d/ifc-engine/alignment/curve-evaluator.js'));
            ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
            ({ EntityIndex } = await import('../../assets/js/3d/ifc-engine/parser/entity-index.js'));
        }
    }
    function idx(step) { return new EntityIndex(parseStepText(step).entities); }
    // Base: přímka 200 m +X. Niveleta: 0–100 m konstantní 2% od z=10;
    // 100–200 m parabola z=12+0.02x−0.0001x² (x od začátku segmentu) → z(200)=13, sklon na konci 0.
    const FIXTURE = `
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
#15=IFCCURVESEGMENT(.CONTSAMEGRADIENT.,#12,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(100.),#14);
#20=IFCCARTESIANPOINT((100.,12.));
#24=IFCDIRECTION((0.9998000599800071,0.019996001199600138));
#21=IFCAXIS2PLACEMENT2D(#20,#24);
#22=IFCPOLYNOMIALCURVE(#21,(0.,1.),(12.,0.02,-0.0001),$);
#23=IFCCURVESEGMENT(.CONTSAMEGRADIENT.,#21,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(100.),#22);
#30=IFCGRADIENTCURVE((#15,#23),.F.,#7,$);
`;
    it('is3D a délka po vodorovném průmětu', async () => {
        await mods();
        const ce = evaluateCurve(idx(FIXTURE), 30);
        expect(ce.is3D).toBe(true);
        expect(Math.abs(ce.length - 200) < 1e-9).toBe(true);
    });
    it('z na konstantním sklonu: z(0)=10, z(50)=11, z(100)=12', async () => {
        await mods();
        const ce = evaluateCurve(idx(FIXTURE), 30);
        expect(Math.abs(ce.evalAt(0).point[2] - 10) < 1e-9).toBe(true);
        expect(Math.abs(ce.evalAt(50).point[2] - 11) < 1e-6).toBe(true);
        expect(Math.abs(ce.evalAt(100).point[2] - 12) < 1e-6).toBe(true);
    });
    it('z na parabole: z(150)=12.75, z(200)=13', async () => {
        await mods();
        const ce = evaluateCurve(idx(FIXTURE), 30);
        // z(150) = 12 + 0.02·50 − 0.0001·2500 = 12.75
        expect(Math.abs(ce.evalAt(150).point[2] - 12.75) < 1e-6).toBe(true);
        expect(Math.abs(ce.evalAt(200).point[2] - 13) < 1e-6).toBe(true);
    });
    it('x,y z base curve zůstávají', async () => {
        await mods();
        const ce = evaluateCurve(idx(FIXTURE), 30);
        const r = ce.evalAt(150);
        expect(Math.abs(r.point[0] - 150) < 1e-9).toBe(true);
        expect(Math.abs(r.point[1]) < 1e-9).toBe(true);
    });
    it('sample dává 3D body s výškou', async () => {
        await mods();
        const ce = evaluateCurve(idx(FIXTURE), 30);
        const s = ce.sample(1.0);
        const mid = s.points[Math.floor(s.points.length / 2)];
        expect(mid[2] > 10).toBe(true);
    });
    // Styl reálného exportéru: parent IfcLine je HORIZONTÁLNÍ šablona (dir (1,0)),
    // sklon nese výhradně RefDirection placementu (kotvení!). Délka segmentu je
    // 3D délka po sklonu (200·√(1+0.02²)), vodorovný rozsah je 200 m.
    it('sklon z RefDirection placementu (horizontální parent šablona)', async () => {
        await mods();
        const len3d = 200 * Math.sqrt(1 + 0.02 * 0.02);
        const stepText = `
#1=IFCCARTESIANPOINT((0.,0.));
#2=IFCDIRECTION((1.,0.));
#3=IFCAXIS2PLACEMENT2D(#1,#2);
#5=IFCVECTOR(#2,1.);
#4=IFCLINE(#1,#5);
#6=IFCCURVESEGMENT(.CONTINUOUS.,#3,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(200.),#4);
#7=IFCCOMPOSITECURVE((#6),.F.);
#10=IFCCARTESIANPOINT((0.,10.));
#11=IFCDIRECTION((0.9998000599800071,0.019996001199600138));
#12=IFCAXIS2PLACEMENT2D(#10,#11);
#15=IFCCURVESEGMENT(.CONTSAMEGRADIENT.,#12,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(${len3d}),#4);
#30=IFCGRADIENTCURVE((#15),.F.,#7,$);
`;
        const ce = evaluateCurve(idx(stepText), 30);
        expect(Math.abs(ce.evalAt(0).point[2] - 10) < 1e-9).toBe(true);
        expect(Math.abs(ce.evalAt(100).point[2] - 12) < 1e-6).toBe(true);
        expect(Math.abs(ce.evalAt(200).point[2] - 14) < 1e-6).toBe(true);
    });
});
