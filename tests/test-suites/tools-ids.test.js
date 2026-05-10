describe('tools/tool-ids', () => {
    let idsTools, executor;

    const sampleIds = `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS/1.0/ids.xsd"
     xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <info><title>Test</title></info>
  <specifications>
    <specification name="Walls have FireRating" identifier="SPEC-1" minOccurs="1" maxOccurs="1" ifcVersion="IFC4">
      <applicability minOccurs="1">
        <entity><name><simpleValue>IFCWALL</simpleValue></name></entity>
      </applicability>
      <requirements>
        <property dataType="IFCLABEL"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>FireRating</simpleValue></baseName></property>
      </requirements>
    </specification>
  </specifications>
</ids>`;

    function makeFile(name, content) {
        return { name, content, size: content.length, type: 'application/xml' };
    }

    beforeEach(async () => {
        idsTools = await import('../../assets/js/ai/tools/tool-ids.js');
        executor = await import('../../assets/js/ai/tool-executor.js');
        executor._resetRegistryForTest();
        await window.BIMStorage.init();
        const ids = await window.BIMStorage.getFiles('ids');
        for (const f of ids) await window.BIMStorage.idsStorage.deleteFile(f.id);
    });

    it('list_ids_specifications returns specs from valid IDS file', async () => {
        await window.BIMStorage.saveFile('ids', makeFile('test.ids', sampleIds));
        const result = await idsTools.list_ids_specifications({ filename: 'test.ids' });
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(1);
        expect(result[0].name).toBe('Walls have FireRating');
    });

    it('list_ids_specifications returns not_found for missing file', async () => {
        const result = await idsTools.list_ids_specifications({ filename: 'ghost.ids' });
        expect(result.error).toBe('not_found');
    });

    it('list_ids_specifications throws on missing filename arg', async () => {
        let threw = false;
        try { await idsTools.list_ids_specifications({}); } catch { threw = true; }
        expect(threw).toBe(true);
    });

    it('register() adds tool to executor', async () => {
        idsTools.register(executor._registerTool);
        expect(executor._registrySizeForTest()).toBe(3);
    });

    it('get_specification_detail returns spec by index', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-ids.js');
        const ids = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS"><info><title>T</title></info><specifications><specification name="SpecA" ifcVersion="IFC4"><applicability><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><property><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>IsExternal</simpleValue></baseName></property></requirements></specification></specifications></ids>`;
        await window.BIMStorage.saveFile('ids', { name: 'spec1.ids', size: ids.length, content: ids });
        try {
            const r = await tools.get_specification_detail({ idsFileName: 'spec1.ids', specIndex: 0 });
            expect(r.name).toBe('SpecA');
            expect(r.applicabilityCount).toBe(1);
            expect(r.requirementsCount).toBe(1);
        } finally {
            await window.BIMStorage.deleteFile('ids', 'spec1.ids').catch(() => {});
        }
    });

    it('get_specification_detail returns not_found for missing IDS file', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-ids.js');
        const r = await tools.get_specification_detail({ idsFileName: 'nope.ids' });
        expect(r.error).toBe('not_found');
    });

    it('get_specification_detail returns missing_identifier without specName/specIndex', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-ids.js');
        const ids = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS"><info><title>T</title></info><specifications><specification name="X" ifcVersion="IFC4"><applicability/><requirements/></specification></specifications></ids>`;
        await window.BIMStorage.saveFile('ids', { name: 'mi.ids', size: ids.length, content: ids });
        try {
            const r = await tools.get_specification_detail({ idsFileName: 'mi.ids' });
            expect(r.error).toBe('missing_identifier');
        } finally {
            await window.BIMStorage.deleteFile('ids', 'mi.ids').catch(() => {});
        }
    });

    it('get_facet_detail returns one facet by index', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-ids.js');
        const ids = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS"><info><title>T</title></info><specifications><specification name="S" ifcVersion="IFC4"><applicability><entity><name><simpleValue>IFCDOOR</simpleValue></name></entity></applicability><requirements/></specification></specifications></ids>`;
        await window.BIMStorage.saveFile('ids', { name: 'fd.ids', size: ids.length, content: ids });
        try {
            const r = await tools.get_facet_detail({ idsFileName: 'fd.ids', specIndex: 0, facetType: 'entity', index: 0 });
            expect(r.facet.type).toBe('entity');
            expect(r.in).toBe('applicability');
        } finally {
            await window.BIMStorage.deleteFile('ids', 'fd.ids').catch(() => {});
        }
    });
});
