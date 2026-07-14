/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('ifc-alignment-geometric — osa z geometrické vrstvy', () => {
    let parseIfcAlignment, sampleAlignment, parseStepText, EntityIndex;
    async function mods() {
        if (!parseIfcAlignment) {
            ({ parseIfcAlignment } = await import('../../assets/js/3d/ifc-engine/alignment/ifc-alignment-parser.js'));
            ({ sampleAlignment } = await import('../../assets/js/3d/ifc-engine/alignment/discretize.js'));
            ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
            ({ EntityIndex } = await import('../../assets/js/3d/ifc-engine/parser/entity-index.js'));
        }
    }
    function idx(step) { return new EntityIndex(parseStepText(step).entities); }
    // Alignment s geometrickou vrstvou (gradient: přímka 200 m, 2 % od z=10),
    // referent STATION 633.66 na DistanceAlong 0, žádná business vrstva.
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
#15=IFCCURVESEGMENT(.CONTSAMEGRADIENT.,#12,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(200.),#14);
#30=IFCGRADIENTCURVE((#15),.F.,#7,$);
#100=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#3,$);
#101=IFCSHAPEREPRESENTATION(#100,'Axis','Curve3D',(#30));
#102=IFCPRODUCTDEFINITIONSHAPE($,$,(#101));
#110=IFCALIGNMENT('0W92lwwpyrDvTaewXDE7ns',$,'TestOsa',$,$,$,#102,.NOTDEFINED.);
#120=IFCPOINTBYDISTANCEEXPRESSION(IFCLENGTHMEASURE(0.),$,$,$,#30);
#121=IFCAXIS2PLACEMENTLINEAR(#120,$,$);
#122=IFCLINEARPLACEMENT($,#121,$);
#123=IFCREFERENT('37CmypgUFO5oyIKudoFewu',$,'0+633.660',$,$,#122,$,.STATION.);
#124=IFCRELNESTS('2aaaaaaaaaaaaaaaaaaaaa',$,$,$,#110,(#123));
#130=IFCPROPERTYSINGLEVALUE('Station',$,IFCLENGTHMEASURE(633.6605),$);
#131=IFCPROPERTYSET('1tZhsb0We7JneU_lRnrLvu',$,'Pset_Stationing',$,(#130));
#132=IFCRELDEFINESBYPROPERTIES('2bbbbbbbbbbbbbbbbbbbbb',$,$,$,(#123),#131);
`;
    it('presampled z gradient curve včetně výšky', async () => {
        await mods();
        const a = parseIfcAlignment(idx(FIXTURE), 110);
        expect(!!a.presampled).toBe(true);
        expect(a.presampled.points.length > 2).toBe(true);
        const last = a.presampled.points[a.presampled.points.length - 1];
        expect(Math.abs(last[0] - 200) < 0.01).toBe(true);
        expect(Math.abs(last[2] - 14) < 0.01).toBe(true);  // 10 + 0.02·200
    });
    it('staStart z referentu posune stations', async () => {
        await mods();
        const a = parseIfcAlignment(idx(FIXTURE), 110);
        expect(Math.abs(a.staStart - 633.6605) < 1e-6).toBe(true);
        expect(Math.abs(a.presampled.stations[0] - 633.6605) < 1e-6).toBe(true);
    });
    it('sampleAlignment vrací presampled beze změny', async () => {
        await mods();
        const a = parseIfcAlignment(idx(FIXTURE), 110);
        const s = sampleAlignment(a);
        expect(s).toBe(a.presampled);
    });
    it('hasProfile příznak pro UI', async () => {
        await mods();
        const a = parseIfcAlignment(idx(FIXTURE), 110);
        expect(!!a.verticalProfile).toBe(true);
    });
    it('bez geometrické vrstvy → business fallback (stávající chování)', async () => {
        await mods();
        const bare = `
#110=IFCALIGNMENT('0W92lwwpyrDvTaewXDE7ns',$,'TestOsa',$,$,$,$,.NOTDEFINED.);
`;
        const a = parseIfcAlignment(idx(bare), 110);
        expect(a.presampled === undefined || a.presampled === null).toBe(true);
        expect(a.elements.length).toBe(0);
    });
    it('_useRawDir: IFC spirála bez bearing konverze', async () => {
        await mods();
        const spiral = {
            elements: [{
                type: 'spiral', startStation: 0, endStation: 60, length: 60,
                start: [0, 0, 0], end: [60, 3, 0], pi: null,
                radiusStart: Infinity, radiusEnd: 300, dirStart: 0,
                rotation: 'ccw', spiType: 'clothoid', _useRawDir: true,
            }],
        };
        const s = sampleAlignment(spiral);
        // dirStart=0 s _useRawDir → počáteční tečna +X: druhý bod má x>0, y≈0.
        // Bez opravy (LandXML konvence π/2−0) by šel po +Y.
        const p = s.points[1];
        expect(p[0] > 0).toBe(true);
        expect(Math.abs(p[1]) < p[0]).toBe(true);
    });
});
