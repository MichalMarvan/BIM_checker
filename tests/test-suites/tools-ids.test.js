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
        expect(executor._registrySizeForTest()).toBe(1);
    });
});
