/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('Measure registry — engine stav měření', () => {
    async function make() {
        const { MeasureRegistry } = await import('../../assets/js/3d/ifc-engine/viewer/measure-registry.js');
        const events = [];
        const r = new MeasureRegistry({ onChange: () => events.push(1) });
        return { r, events };
    }
    it('add počítá hodnotu a vrací id; get vrací kopie', async () => {
        const { r } = await make();
        const id = r.add({ type: 'distance', points: [[0, 0, 0], [3, 4, 0]] });
        expect(id.startsWith('ms_')).toBe(true);
        const list = r.list();
        expect(list.length).toBe(1);
        expect(Math.abs(list[0].value - 5) < 1e-9).toBe(true);
        expect(list[0].unit).toBe('m');
        list[0].points[0][0] = 999;                       // mutace kopie
        expect(r.list()[0].points[0][0]).toBe(0);         // originál nedotčen
    });
    it('edge=2 body m, angle °, area m²; visible/label/remove/clear + onChange', async () => {
        const { r, events } = await make();
        const e1 = r.add({ type: 'angle', points: [[1, 0, 0], [0, 0, 0], [0, 1, 0]] });
        expect(Math.abs(r.list()[0].value - 90) < 1e-6).toBe(true);
        expect(r.list()[0].unit).toBe('°');
        const e2 = r.add({ type: 'area', points: [[0, 0, 0], [2, 0, 0], [2, 3, 0], [0, 3, 0]] });
        expect(Math.abs(r.list()[1].value - 6) < 1e-6).toBe(true);
        r.setVisible(e1, false);
        expect(r.list()[0].visible).toBe(false);
        r.update(e2, { label: 'deska' });
        expect(r.list()[1].label).toBe('deska');
        r.remove(e1);
        expect(r.list().length).toBe(1);
        r.clear();
        expect(r.list().length).toBe(0);
        expect(events.length >= 6).toBe(true);
    });
});
