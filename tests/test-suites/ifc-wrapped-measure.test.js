/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('ifc-wrapped-measure — parseWrappedNum', () => {
    let fn;
    async function f() {
        if (!fn) ({ parseWrappedNum: fn } = await import('../../assets/js/3d/ifc-engine/geometry/step-helpers.js'));
        return fn;
    }
    it('wrapped IFCLENGTHMEASURE', async () => {
        const p = await f();
        const r = p('IFCLENGTHMEASURE(1133.0395005468245)');
        expect(Math.abs(r.value - 1133.0395005468245) < 1e-12).toBe(true);
        expect(r.type).toBe('IFCLENGTHMEASURE');
    });
    it('wrapped záporná hodnota', async () => {
        const p = await f();
        const r = p('IFCLENGTHMEASURE(-474.727528)');
        expect(Math.abs(r.value - (-474.727528)) < 1e-12).toBe(true);
    });
    it('IFCPARAMETERVALUE wrapper', async () => {
        const p = await f();
        const r = p('IFCPARAMETERVALUE(0.5)');
        expect(r.value).toBe(0.5);
        expect(r.type).toBe('IFCPARAMETERVALUE');
    });
    it('plain číslo → type null', async () => {
        const p = await f();
        const r = p('5.490770547176467');
        expect(Math.abs(r.value - 5.490770547176467) < 1e-12).toBe(true);
        expect(r.type).toBe(null);
    });
    it('$ / * / prázdné / text → null', async () => {
        const p = await f();
        expect(p('$')).toBe(null);
        expect(p('*')).toBe(null);
        expect(p('')).toBe(null);
        expect(p(undefined)).toBe(null);
        expect(p("IFCLABEL('abc')")).toBe(null);
    });
});
