/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('LandXML parser — robustnost + niveleta', () => {
    let parse;
    async function p(xml, opts) {
        if (!parse) ({ parseLandXmlAlignments: parse } =
            await import('../../assets/js/3d/ifc-engine/alignment/landxml-parser.js'));
        return parse(xml, opts);
    }
    const WRAP = (inner, ns = 'xmlns="http://www.landxml.org/schema/LandXML-1.2"', units = '') =>
        `<?xml version="1.0"?><LandXML version="1.2" ${ns}>${units}<Alignments>${inner}</Alignments></LandXML>`;
    const ALIGN = (cg, profile = '') =>
        `<Alignment name="A" length="100" staStart="0"><CoordGeom>${cg}</CoordGeom>${profile}</Alignment>`;
    const LINE = `<Line><Start>1000 500</Start><End>1100 500</End></Line>`; // N E → x=E=500

    it('vrací {alignments, warnings, meta} a čte ProfAlign', async () => {
        const r = await p(WRAP(ALIGN(LINE,
            `<Profile name="p"><ProfAlign name="n"><PVI>0 200</PVI><PVI>100 210</PVI></ProfAlign></Profile>`)));
        expect(Array.isArray(r.alignments)).toBe(true);
        expect(r.alignments[0].hasProfile).toBe(true);
        expect(r.alignments[0].verticalProfile !== null).toBe(true);
        expect(r.meta.flavor).toBe('generic');
    });

    it('namespace-agnostic: prefixované elementy', async () => {
        const xml = `<?xml version="1.0"?><lx:LandXML version="1.2" xmlns:lx="http://www.landxml.org/schema/LandXML-1.2"><lx:Alignments><lx:Alignment name="A" length="100" staStart="0"><lx:CoordGeom><lx:Line><lx:Start>1000 500</lx:Start><lx:End>1100 500</lx:End></lx:Line></lx:CoordGeom></lx:Alignment></lx:Alignments></lx:LandXML>`;
        const r = await p(xml);
        expect(r.alignments.length).toBe(1);
    });

    it('Imperial foot → metry', async () => {
        const r = await p(WRAP(ALIGN(LINE), 'xmlns="http://www.landxml.org/schema/LandXML-1.2"',
            `<Units><Imperial linearUnit="foot" areaUnit="squareFoot" volumeUnit="cubicFeet" temperatureUnit="fahrenheit" pressureUnit="inHG"/></Units>`));
        const el = r.alignments[0].elements[0];
        expect(Math.abs(el.start[0] - 500 * 0.3048)).toBeLessThan(1e-9);
        expect(r.warnings.some(w => w.includes('stop'))).toBe(true); // „stopy" warning
    });

    it('InfraModel flavor + ISO-10303 chyba + neznámý root chyba', async () => {
        const r = await p(WRAP(ALIGN(LINE), 'xmlns="http://buildingsmart.fi/inframodel/404"'));
        expect(r.meta.flavor).toBe('inframodel');
        let err = '';
        try { await p('ISO-10303-21;\nHEADER;'); } catch (e) { err = e.message; }
        expect(err.includes('IFC')).toBe(true);
        err = '';
        try { await p('<?xml version="1.0"?><NecoJineho/>'); } catch (e) { err = e.message; }
        expect(err.includes('NecoJineho')).toBe(true);
    });

    it('chybějící rot dopočítá z geometrie (ccw oblouk)', async () => {
        // střed (0,0), start (100,0)=N0 E100? Pozor pořadí N E: Start="0 100" → x=100,y=0
        const cg = `<Curve radius="100" length="157.08"><Start>0 100</Start><Center>0 0</Center><End>100 0</End></Curve>`;
        const r = await p(WRAP(ALIGN(cg)));
        expect(r.alignments[0].elements[0].rotation).toBe('ccw');
        expect(r.warnings.some(w => w.toLowerCase().includes('rot'))).toBe(true);
    });

    it('suggestSwapXY heuristika (E<N v abs, česká data psaná Y X)', async () => {
        const cg = `<Line><Start>642000 1180000</Start><End>642100 1180000</End></Line>`; // psáno E N
        const r = await p(WRAP(ALIGN(cg)));
        expect(r.meta.suggestSwapXY).toBe(true);
    });

    it('ProfSurf-only → warning, bez profilu; StaEquation → warning', async () => {
        const r = await p(WRAP(ALIGN(LINE,
            `<Profile name="p"><ProfSurf name="t"><PntList2D>0 200 100 210</PntList2D></ProfSurf></Profile>`)
            .replace('</CoordGeom>', '</CoordGeom><StaEquation staInternal="50" staAhead="1050"/>')));
        expect(r.alignments[0].hasProfile).toBe(false);
        expect(r.warnings.some(w => w.includes('ProfSurf') || w.includes('terén'))).toBe(true);
        expect(r.warnings.some(w => w.toLowerCase().includes('stanič'))).toBe(true);
    });
});
