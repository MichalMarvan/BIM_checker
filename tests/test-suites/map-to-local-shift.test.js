/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('map-to-local-shift — LandXML v mapových souřadnicích → lokální frame modelu', () => {
    let fn;
    async function f() {
        if (!fn) ({ mapToLocalShift: fn } = await import('../../assets/js/3d/ifc-engine/coords/federation.js'));
        return fn;
    }
    // Reálný případ (RuzLet): model lokálně (~200, −1200), MapConversion E=−752000, N=−1040600;
    // XML osa v S-JTSK (−751472, −1042354) → posun o −[E,N,H] ji položí na model.
    const MC = { eastings: -752000, northings: -1040600, orthogonalHeight: 0, rotationDeg: 0, scale: 1 };
    it('osa v mapových souřadnicích → posun −[E,N,H]', async () => {
        const s = await (await f())([-751472, -1042354, 350], [200, -1200, 350], MC);
        expect(Array.isArray(s)).toBe(true);
        expect(s[0]).toBe(752000);
        expect(s[1]).toBe(1040600);
        expect(s[2]).toBe(0);
    });
    it('osa už v lokálním framu → žádný posun', async () => {
        const s = await (await f())([300, -1100, 350], [200, -1200, 350], MC);
        expect(s).toBe(null);
    });
    it('MapConversion s nulovými offsety (geometrie v reálných souřadnicích) → žádný posun', async () => {
        const mc0 = { eastings: 0, northings: 0, orthogonalHeight: 0 };
        const s = await (await f())([-751472, -1042354, 350], [-751500, -1042000, 340], mc0);
        expect(s).toBe(null);
    });
    it('chybějící vstupy → null', async () => {
        const p = await f();
        expect(p(null, [0, 0, 0], MC)).toBe(null);
        expect(p([0, 0, 0], null, MC)).toBe(null);
        expect(p([0, 0, 0], [0, 0, 0], null)).toBe(null);
    });
    it('prohozená osa (N,E místo E,N): posun by „zlepšil", ale nedosedne → null', async () => {
        // Osa s prohozenými souřadnicemi je po posunu stále ~400 km od modelu —
        // práh rezidua musí posun odmítnout, jinak osa skončí v nesmyslu.
        const s = await (await f())([-1042354, -751472, 350], [200, -1200, 350], MC);
        expect(s).toBe(null);
    });
});
