/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('ifc-step-lexer — rozdělení STEP záznamů (řetězce, komentáře, mezery)', () => {
    let parseStepText;
    async function parse(data) {
        if (!parseStepText) ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
        return parseStepText(`ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${data}\nENDSEC;\nEND-ISO-10303-21;`);
    }

    it('dvě entity na jednom řádku', async () => {
        const r = await parse("#1=IFCWALL('a');#2=IFCSLAB('b');");
        expect(r.entities.size).toBe(2);
        expect(r.entities.get(1).params).toBe("'a'");
    });
    it('komentář v parametrech se odstraní', async () => {
        const r = await parse("#1=IFCWALL('a',/* kom */$);");
        expect(r.entities.get(1).params).toBe("'a',$");
        expect(r.diagnostics.commentCount).toBe(1);
    });
    it('středník, apostrof a /* */ uvnitř řetězce zůstávají', async () => {
        const r = await parse("#1=IFCLABEL('it''s /* ne komentář */ ; tady');");
        expect(r.entities.get(1).params).toBe("'it''s /* ne komentář */ ; tady'");
        expect(r.diagnostics.commentCount).toBe(0);
    });
    it('mezera mezi typem a "(" (buildingSMART brep-model)', async () => {
        const r = await parse('#1= IFCFACETEDBREP (#2);');
        expect(r.entities.get(1).type).toBe('IFCFACETEDBREP');
        expect(r.entities.get(1).params).toBe('#2');
    });
    it('komentář za středníkem na řádku entity (beam-parametric-cross-section)', async () => {
        const r = await parse('#1=IFCDIRECTION((1.,0.,0.));     /* poznámka */\n#2=IFCDIRECTION((0.,1.,0.));');
        expect(r.entities.size).toBe(2);
    });
    it('zakomentovaný trojúhelník v CoordIndex (geographic-referencing)', async () => {
        const r = await parse('#1=IFCTRIANGULATEDFACESET(#9,$,.T.,((1,3,2),/*(2,3,4),*/(2,3,6)),$);');
        expect(r.entities.get(1).params).toBe('#9,$,.T.,((1,3,2),(2,3,6)),$');
    });
    it('číslo řádku entity za komentářovým řádkem a víceřádková entita', async () => {
        const r = await parse("/* poznámka */\n#10= IFCRELDECLARES ('x',\n  $);\n#11=IFCSLAB($);");
        expect(r.entities.get(10).line).toBe(7);
        expect(r.entities.get(10).params).toBe("'x',$");
        expect(r.entities.get(11).line).toBe(9);
    });
    it('neuzavřená entita se ohlásí a další zůstane zachována', async () => {
        const r = await parse("#1=IFCWALL('a'\n#2=IFCSLAB('b');\n#3=IFCBEAM('c');");
        expect(r.entities.has(2)).toBe(true);
        expect(r.entities.has(3)).toBe(true);
        expect(r.entities.has(1)).toBe(false);
        expect(r.diagnostics.invalidRecordCount).toBe(1);
    });
    it('komplexní entita a smetí se ohlásí, zbytek se zachová', async () => {
        const r = await parse('#1=(IFCA()IFCB());\nSMETI;\n#2=IFCWALL($);');
        expect(r.entities.has(2)).toBe(true);
        expect(r.diagnostics.complexRecordCount).toBe(1);
        expect(r.diagnostics.invalidRecordCount).toBe(1);
    });
    it('duplicitní ID se ohlásí (platí poslední)', async () => {
        const r = await parse("#1=IFCWALL('a');\n#1=IFCSLAB('b');");
        expect(r.diagnostics.duplicateIdCount).toBe(1);
        expect(r.entities.get(1).type).toBe('IFCSLAB');
    });
    it('CRLF konce řádků', async () => {
        const r = await parse("#1=IFCWALL('a');\r\n#2=IFCSLAB('b');\r\n");
        expect(r.entities.size).toBe(2);
        expect(r.entities.get(2).line).toBe(7);
    });
    it('holý fragment bez DATA se parsuje beze smetí v diagnostice', async () => {
        if (!parseStepText) ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
        const r = parseStepText("#1=IFCWALL('a');\n#2=IFCSLAB('b');");
        expect(r.entities.size).toBe(2);
        expect(r.diagnostics.invalidRecordCount).toBe(0);
    });
});
