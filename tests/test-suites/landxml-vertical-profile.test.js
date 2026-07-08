/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('LandXML vertical profile (niveleta)', () => {
    async function build(xml) {
        const { buildVerticalProfile, elevationAt } =
            await import('../../assets/js/3d/ifc-engine/alignment/vertical-profile.js');
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        const el = doc.getElementsByTagNameNS('*', 'ProfAlign')[0];
        return { profile: buildVerticalProfile(el, 1), elevationAt };
    }

    it('interpoluje lineárně mezi PVI (tangenta)', async () => {
        const { profile, elevationAt } = await build(
            `<ProfAlign name="n"><PVI>0 100</PVI><PVI>100 110</PVI></ProfAlign>`);
        expect(elevationAt(profile, 0)).toBe(100);
        expect(elevationAt(profile, 50)).toBe(105);
        expect(elevationAt(profile, 100)).toBe(110);
    });

    it('symetrická parabola: vrchol a tečné body', async () => {
        // g1=+0.10 (0→100 m stoupá 10), g2=-0.10, L=80 → BVC=60, EVC=140
        const { profile, elevationAt } = await build(
            `<ProfAlign name="n"><PVI>0 100</PVI><ParaCurve length="80">100 110</ParaCurve><PVI>200 100</PVI></ProfAlign>`);
        expect(Math.abs(elevationAt(profile, 60) - 106)).toBeLessThan(1e-9);   // BVC na tangentě
        expect(Math.abs(elevationAt(profile, 140) - 106)).toBeLessThan(1e-9);  // EVC na tangentě
        // střed: elev = 106 + 0.1*40 + ((-0.2)/(2*80))*40² = 106+4-2 = 108
        expect(Math.abs(elevationAt(profile, 100) - 108)).toBeLessThan(1e-9);
        expect(Math.abs(elevationAt(profile, 30) - 103)).toBeLessThan(1e-9);   // před BVC tangenta
    });

    it('nesymetrická parabola: spojitost a offset e v PVI', async () => {
        // g1=+0.10, g2=-0.10, L1=40, L2=80 → e = (40*80/(2*120))*(-0.2) = -8/3
        const { profile, elevationAt } = await build(
            `<ProfAlign name="n"><PVI>0 100</PVI><UnsymParaCurve lengthIn="40" lengthOut="80">100 110</UnsymParaCurve><PVI>200 100</PVI></ProfAlign>`);
        const e = (40 * 80 / (2 * 120)) * (-0.2);
        expect(Math.abs(elevationAt(profile, 100) - (110 + e))).toBeLessThan(1e-9);
        // spojitost: těsně před/za PVI se liší jen nepatrně
        expect(Math.abs(elevationAt(profile, 99.999) - elevationAt(profile, 100.001))).toBeLessThan(1e-3);
        expect(Math.abs(elevationAt(profile, 60) - 106)).toBeLessThan(1e-9);   // BVC
        expect(Math.abs(elevationAt(profile, 180) - 102)).toBeLessThan(1e-9);  // EVC
    });

    it('kruhový oblouk (InfraModel): abs(radius), prohnutí ≈ L²/(8R)', async () => {
        // g1=g2=0 (vodorovné tangenty), L=100, R=-2000 (záporný = konvence) →
        // tečné body 50 a 150 na výšce 100; střed poklesne ~ L²/(8R)=0.625
        const { profile, elevationAt } = await build(
            `<ProfAlign name="n"><PVI>0 100</PVI><CircCurve length="100" radius="-2000">100 100</CircCurve><PVI>200 100</PVI></ProfAlign>`);
        expect(Math.abs(elevationAt(profile, 50) - 100)).toBeLessThan(1e-6);
        expect(Math.abs(elevationAt(profile, 150) - 100)).toBeLessThan(1e-6);
        const mid = elevationAt(profile, 100);
        expect(Math.abs(Math.abs(mid - 100) - 0.625)).toBeLessThan(0.01);
    });

    it('mimo rozsah vrací krajní výšku, unitScale škáluje', async () => {
        const { buildVerticalProfile, elevationAt } =
            await import('../../assets/js/3d/ifc-engine/alignment/vertical-profile.js');
        const doc = new DOMParser().parseFromString(
            `<ProfAlign name="n"><PVI>0 100</PVI><PVI>100 110</PVI></ProfAlign>`, 'application/xml');
        const p = buildVerticalProfile(doc.documentElement, 0.5);
        expect(elevationAt(p, -10)).toBe(50);
        expect(elevationAt(p, 25)).toBe(52.5);   // sta 25 m = raw 50 → elev raw 105 * 0.5
        expect(elevationAt(p, 999)).toBe(55);
    });
});
