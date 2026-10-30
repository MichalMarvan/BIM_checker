/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('step-parser — limit délky textu (V8 string limit)', () => {
    const load = () => import('../../assets/js/3d/ifc-engine/parser/step-parser.js');

    it('MAX_STEP_TEXT_BYTES odpovídá limitu V8 (2^29 - 24)', async () => {
        const { MAX_STEP_TEXT_BYTES } = await load();
        expect(MAX_STEP_TEXT_BYTES).toBe(536870888);
    });

    it('soubor pod limitem projde (bez dekódovaného textu i s ním)', async () => {
        const { assertStepTextFits, MAX_STEP_TEXT_BYTES } = await load();
        let err = null;
        try {
            assertStepTextFits(120 * 1048576, undefined, 'a.ifc');
            assertStepTextFits(MAX_STEP_TEXT_BYTES, 'ISO-10303-21;', 'a.ifc');
            assertStepTextFits(0, '', 'empty.ifc');
        } catch (e) { err = e; }
        expect(err).toBe(null);
    });

    it('soubor nad limitem vyhodí RangeError se jménem souboru a velikostí v MB', async () => {
        const { assertStepTextFits, MAX_STEP_TEXT_BYTES } = await load();
        let err = null;
        try { assertStepTextFits(840012472, undefined, 'D3_SO204.ifc'); } catch (e) { err = e; }
        expect(err instanceof RangeError).toBe(true);
        expect(err.message.includes('D3_SO204.ifc')).toBe(true);
        expect(err.message.includes('801 MB')).toBe(true);
        expect(err.message.includes('limit 512 MB')).toBe(true);
        err = null;
        try { assertStepTextFits(MAX_STEP_TEXT_BYTES + 1); } catch (e) { err = e; }
        expect(err instanceof RangeError).toBe(true);
    });

    it('neprázdný vstup dekódovaný na prázdný řetězec vyhodí RangeError (tiché selhání TextDecoderu)', async () => {
        const { assertStepTextFits } = await load();
        let err = null;
        try { assertStepTextFits(500 * 1048576, '', 'x.ifc'); } catch (e) { err = e; }
        expect(err instanceof RangeError).toBe(true);
        expect(err.message.includes('empty decode result')).toBe(true);
    });
});
