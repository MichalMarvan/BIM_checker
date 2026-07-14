/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('ifc-mvd-detect — ViewDefinition z FILE_DESCRIPTION', () => {
    let parseStepText;
    async function f() {
        if (!parseStepText) ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
        return parseStepText;
    }
    it('Alignment-basedView', async () => {
        const p = await f();
        const r = p("ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION (('ViewDefinition [Alignment-basedView]'),'2;1');\nFILE_SCHEMA (('IFC4X3_ADD2'));\nENDSEC;\nDATA;\n#1=IFCCARTESIANPOINT((0.,0.));\nENDSEC;\nEND-ISO-10303-21;");
        expect(r.viewDefinitions.length).toBe(1);
        expect(r.viewDefinitions[0]).toBe('Alignment-basedView');
        expect(r.schema).toBe('IFC4X3_ADD2');
    });
    it('víc MVD oddělených čárkou', async () => {
        const p = await f();
        const r = p("FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0, QuantityTakeOffAddOnView]'),'2;1');\n#1=IFCCARTESIANPOINT((0.,0.));");
        expect(r.viewDefinitions.length).toBe(2);
        expect(r.viewDefinitions[0]).toBe('CoordinationView_V2.0');
        expect(r.viewDefinitions[1]).toBe('QuantityTakeOffAddOnView');
    });
    it('bez FILE_DESCRIPTION → prázdné pole', async () => {
        const p = await f();
        const r = p('#1=IFCCARTESIANPOINT((0.,0.));');
        expect(Array.isArray(r.viewDefinitions)).toBe(true);
        expect(r.viewDefinitions.length).toBe(0);
    });
});
