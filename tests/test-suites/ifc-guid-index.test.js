/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('ifc-guid-index — schema-aware indexace GUID v EntityIndex', () => {
    let parseStepText, EntityIndex, IFC_ROOT_TYPES;
    async function index(data) {
        if (!parseStepText) ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
        if (!EntityIndex) ({ EntityIndex } = await import('../../assets/js/3d/ifc-engine/parser/entity-index.js'));
        const r = parseStepText(`ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${data}\nENDSEC;\nEND-ISO-10303-21;`);
        return new EntityIndex(r.entities);
    }
    const G1 = '0YvctVUKr0kugbFTf53O9L';
    const G2 = '1kTvXnbbzCWw8lcMd1dR4o';

    it('seznam IfcRoot typů obsahuje IFCWALL a neobsahuje IFCPROPERTYSINGLEVALUE', async () => {
        ({ IFC_ROOT_TYPES } = await import('../../assets/js/3d/ifc-engine/parser/ifc-root-types.js'));
        expect(IFC_ROOT_TYPES.has('IFCWALL')).toBe(true);
        expect(IFC_ROOT_TYPES.has('IFCPROJECT')).toBe(true);
        expect(IFC_ROOT_TYPES.has('IFCALIGNMENT')).toBe(true);
        expect(IFC_ROOT_TYPES.has('IFCPROPERTYSINGLEVALUE')).toBe(false);
        expect(IFC_ROOT_TYPES.has('IFCQUANTITYLENGTH')).toBe(false);
        expect(IFC_ROOT_TYPES.has('IFCCARTESIANPOINT')).toBe(false);
    });
    it('IFCWALL s GUID se najde přes byGuid', async () => {
        const idx = await index(`#1=IFCWALL('${G1}',$,'Zed',$,$,$,$,$,$);`);
        expect(idx.byGuid(G1).type).toBe('IFCWALL');
        expect(idx.stats().guidCount).toBe(1);
        expect(idx.stats().guidDuplicates).toBe(0);
    });
    it('IFCPROPERTYSINGLEVALUE s 22znakovým jménem se neindexuje a nepřepíše skutečný GUID', async () => {
        const idx = await index(`#1=IFCWALL('${G1}',$,$,$,$,$,$,$,$);\n#2=IFCPROPERTYSINGLEVALUE('${G1}',$,IFCLABEL('x'),$);\n#3=IFCQUANTITYLENGTH('${G2}',$,$,1.,$);`);
        expect(idx.byGuid(G1).type).toBe('IFCWALL');
        expect(idx.byGuid(G2)).toBe(null);
        expect(idx.stats().guidCount).toBe(1);
        expect(idx.stats().guidDuplicates).toBe(0);
    });
    it('GUID, který není na prvním atributu, se neindexuje', async () => {
        const idx = await index(`#1=IFCWALL(#9,'${G1}');\n#2=IFCWALL($,'${G2}');`);
        expect(idx.byGuid(G1)).toBe(null);
        expect(idx.byGuid(G2)).toBe(null);
        expect(idx.stats().guidCount).toBe(0);
    });
    it('IfcRoot s nestandardním GlobalId se indexuje a přežije compact', async () => {
        const idx = await index("#1=IFCPROJECT('project-1',$,$,$,$,$,$,$,$);\n#2=IFCSITE('3ta2EOrybCUerPg6Zzh-bD',$,$,$,$,$,$,$,$,$,$,$,$,$);\n#3=IFCCARTESIANPOINT((0.,0.,0.));");
        expect(idx.byGuid('project-1').type).toBe('IFCPROJECT');
        expect(idx.byGuid('3ta2EOrybCUerPg6Zzh-bD').type).toBe('IFCSITE');
        const dropped = idx.compact();
        expect(dropped).toBe(1);
        expect(idx.byExpressId(1).type).toBe('IFCPROJECT');
        expect(idx.byExpressId(2).type).toBe('IFCSITE');
        expect(idx.byExpressId(3)).toBe(null);
    });
    it('neznámý typ: validní GUID → fallback indexuje, jiný řetězec ne', async () => {
        const idx = await index(`#1=IFCFUTURETHING('${G1}',$,'Name');\n#2=IFCFUTURETHING('Jmeno dlouhe 22 znaku!',$);\n#3=IFCFUTURETHING('9${G1.slice(1)}',$);`);
        expect(idx.byGuid(G1).expressId).toBe(1);
        expect(idx.byGuid('Jmeno dlouhe 22 znaku!')).toBe(null);
        expect(idx.byGuid('9' + G1.slice(1))).toBe(null);
        expect(idx.stats().guidCount).toBe(1);
    });
    it('duplicitní GUID: poslední vyhrává, stats hlásí počet', async () => {
        const idx = await index(`#1=IFCWALL('${G1}',$);\n#2=IFCSLAB('${G1}',$);\n#3=IFCBEAM('${G1}',$);`);
        expect(idx.byGuid(G1).type).toBe('IFCBEAM');
        expect(idx.stats().guidCount).toBe(1);
        expect(idx.stats().guidDuplicates).toBe(2);
    });
    it('escapovaný apostrof a mezery kolem prvního atributu', async () => {
        const idx = await index("#1=IFCWALL( 'a''b' , $);\n#2=IFCWALL('neuzavreny,$);");
        expect(idx.byGuid("a''b").type).toBe('IFCWALL');
        expect(idx.stats().guidCount).toBe(1);
    });
});
