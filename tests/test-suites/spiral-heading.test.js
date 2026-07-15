/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('spiral-heading — směr spirály z geometrie (PI) + tečná spojitost', () => {
    let sampleAlignment;
    async function mods() {
        if (!sampleAlignment) ({ sampleAlignment } = await import('../../assets/js/3d/ifc-engine/alignment/discretize.js'));
    }
    function headingBetween(s, i) {
        const dx = s.points[i + 1][0] - s.points[i][0];
        const dy = s.points[i + 1][1] - s.points[i][1];
        return Math.atan2(dy, dx);
    }
    function maxKinkDeg(s) {
        let max = 0;
        for (let i = 1; i < s.points.length - 1; i++) {
            let d = headingBetween(s, i) - headingBetween(s, i - 1);
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            max = Math.max(max, Math.abs(d) * 180 / Math.PI);
        }
        return max;
    }
    // Přímka na východ (azimut 0) → vjezdová spirála L=60 do levého oblouku R=300.
    // dirStart je ve ŠPATNÉ konvenci (ProVI: skutečný azimut = π/2 + dir; zde by
    // π/2 − dir dalo ~90° zlom). PI = průsečík tečen: tečna začátku míří +X,
    // takže PI leží na +X od Start (2/3 délky tangenty ≈ 40 m).
    it('PI má přednost před dirStart atributem (ProVI konvence)', async () => {
        await mods();
        const a = {
            elements: [
                { type: 'line', startStation: 0, endStation: 100, length: 100, start: [0, 0, 0], end: [100, 0, 0] },
                {
                    type: 'spiral', startStation: 100, endStation: 160, length: 60,
                    start: [100, 0, 0], end: [159.94, 2.0, 0], pi: [140, 0, 0],
                    radiusStart: Infinity, radiusEnd: 300, dirStart: 1.4919, // špatná konvence
                    rotation: 'ccw', spiType: 'clothoid',
                },
            ],
        };
        const s = sampleAlignment(a, {});
        expect(maxKinkDeg(s) < 12).toBe(true); // bez opravy ~85° zlom na hranici
    });
    // Bez PI i bez dirStart, ale s předchozím elementem → tečná spojitost.
    it('bez PI: naváže tečně na předchozí element', async () => {
        await mods();
        const a = {
            elements: [
                { type: 'line', startStation: 0, endStation: 100, length: 100, start: [0, 0, 0], end: [100, 0, 0] },
                {
                    type: 'spiral', startStation: 100, endStation: 160, length: 60,
                    start: [100, 0, 0], end: [159.94, 2.0, 0], pi: null,
                    radiusStart: Infinity, radiusEnd: 300, dirStart: null,
                    rotation: 'ccw', spiType: 'clothoid',
                },
            ],
        };
        const s = sampleAlignment(a, {});
        expect(maxKinkDeg(s) < 12).toBe(true);
    });
    // dirStart ve špatné konvenci, bez PI → pojistka spojitosti ho přebije.
    it('dirStart odporující spojitosti se přebije tečnou předchozího elementu', async () => {
        await mods();
        const a = {
            elements: [
                { type: 'line', startStation: 0, endStation: 100, length: 100, start: [0, 0, 0], end: [100, 0, 0] },
                {
                    type: 'spiral', startStation: 100, endStation: 160, length: 60,
                    start: [100, 0, 0], end: [159.94, 2.0, 0], pi: null,
                    radiusStart: Infinity, radiusEnd: 300, dirStart: 2.5, // π/2−2.5 ≈ −53° ≠ 0°
                    rotation: 'ccw', spiType: 'clothoid',
                },
            ],
        };
        const s = sampleAlignment(a, {});
        expect(maxKinkDeg(s) < 12).toBe(true);
    });
    // Správná LandXML konvence (bearing od severu CW) bez PI a bez předchozího
    // elementu musí fungovat dál: spirála na východ → dirStart = π/2.
    it('standardní bearing konvence zůstává funkční (první element)', async () => {
        await mods();
        const a = {
            elements: [
                {
                    type: 'spiral', startStation: 0, endStation: 60, length: 60,
                    start: [0, 0, 0], end: [59.94, 2.0, 0], pi: null,
                    radiusStart: Infinity, radiusEnd: 300, dirStart: Math.PI / 2,
                    rotation: 'ccw', spiType: 'clothoid',
                },
            ],
        };
        const s = sampleAlignment(a, {});
        // začíná na východ: druhý bod má x>0 a |y| malé
        const p = s.points[1];
        expect(p[0] > 0).toBe(true);
        expect(Math.abs(p[1]) < p[0]).toBe(true);
    });
    // IFC business layer (_useRawDir) zůstává nedotčený pojistkou.
    it('_useRawDir se nepřebíjí (IFC radiány jsou důvěryhodné)', async () => {
        await mods();
        const a = {
            elements: [
                { type: 'line', startStation: 0, endStation: 100, length: 100, start: [0, 0, 0], end: [100, 0, 0] },
                {
                    type: 'spiral', startStation: 100, endStation: 160, length: 60,
                    start: [100, 0, 0], end: [159.94, 2.0, 0], pi: null,
                    radiusStart: Infinity, radiusEnd: 300, dirStart: 0, _useRawDir: true,
                    rotation: 'ccw', spiType: 'clothoid',
                },
            ],
        };
        const s = sampleAlignment(a, {});
        expect(maxKinkDeg(s) < 12).toBe(true); // raw 0 = východ = spojité
    });
});
