describe('ValidationPresets integration — full save/load roundtrip', () => {
    async function clearAll() {
        localStorage.removeItem('bim_validation_presets');
        localStorage.removeItem('bim_validation_last_session');
        await BIMStorage.init();
        const ifcFiles = await BIMStorage.getFiles('ifc');
        for (const f of ifcFiles) await BIMStorage.ifcStorage.deleteFile(f.id);
        const idsFiles = await BIMStorage.getFiles('ids');
        for (const f of idsFiles) await BIMStorage.idsStorage.deleteFile(f.id);
    }

    function makeFile(name, content) {
        // BIMStorage.addFile reads `.content` directly — File blobs aren't accepted.
        // Use a plain object matching the storage layer's expectations.
        return { name, content, size: content.length, type: 'text/plain' };
    }

    beforeEach(async () => { await clearAll(); });

    it('save preset from filenames, reload via fromPresetGroups, content matches', async () => {
        await BIMStorage.saveFile('ifc', makeFile('roundtrip.ifc', 'IFC-DATA'));
        await BIMStorage.saveFile('ids', makeFile('roundtrip.ids', '<ids/>'));

        const id = ValidationPresets.save('Roundtrip', [
            { ifcFileNames: ['roundtrip.ifc'], idsFileName: 'roundtrip.ids' }
        ]);
        const preset = ValidationPresets.get(id);
        const hydrated = await ValidationPresets.fromPresetGroups(preset.groups);
        expect(hydrated.length).toBe(1);
        expect(hydrated[0].ifcFiles[0].content).toBe('IFC-DATA');
        expect(hydrated[0].idsFile.content).toBe('<ids/>');
    });

    it('saving preset that references resolved files survives a list-reload', async () => {
        await BIMStorage.saveFile('ifc', makeFile('keep.ifc', 'X'));
        const presetGroups = ValidationPresets.toPresetGroups([{
            id: 1,
            ifcFiles: [{ id: 'mem1', name: 'keep.ifc', size: 1, content: 'X' }],
            idsFile: null,
            missingIfcNames: [],
            missingIdsName: null
        }]);
        ValidationPresets.save('SurvivorTest', presetGroups);
        const list = ValidationPresets.list();
        expect(list.length).toBe(1);
        expect(list[0].groups[0].ifcFileNames[0]).toBe('keep.ifc');
    });

    it('saving preset that has unresolved missing names preserves them', () => {
        const presetGroups = ValidationPresets.toPresetGroups([{
            id: 1,
            ifcFiles: [{ id: 'mem1', name: 'real.ifc', size: 1, content: 'X' }],
            idsFile: null,
            missingIfcNames: ['ghost.ifc'],
            missingIdsName: 'ghost.ids'
        }]);
        ValidationPresets.save('WithMissing', presetGroups);
        const reloaded = ValidationPresets.list()[0];
        expect(reloaded.groups[0].ifcFileNames.sort().join(',')).toBe('ghost.ifc,real.ifc');
        expect(reloaded.groups[0].idsFileName).toBe('ghost.ids');
    });

    it('last-session save followed by flush is loadable as in-memory state', async () => {
        await BIMStorage.saveFile('ifc', makeFile('session.ifc', 'S'));
        ValidationPresets.saveLastSession([
            { ifcFileNames: ['session.ifc'], idsFileName: null }
        ]);
        ValidationPresets.flushLastSession();
        const last = ValidationPresets.loadLastSession();
        expect(last !== null).toBe(true);
        const hydrated = await ValidationPresets.fromPresetGroups(last.groups);
        expect(hydrated[0].ifcFiles[0].name).toBe('session.ifc');
        expect(hydrated[0].ifcFiles[0].content).toBe('S');
    });

    it('resolves a missing slot when a file with that name is added to BIMStorage and re-hydrated', async () => {
        // First load: file is missing
        const before = await ValidationPresets.fromPresetGroups([
            { ifcFileNames: ['lazy.ifc'], idsFileName: null }
        ]);
        expect(before[0].missingIfcNames[0]).toBe('lazy.ifc');
        // Now add the file and re-hydrate
        await BIMStorage.saveFile('ifc', makeFile('lazy.ifc', 'NOW-EXISTS'));
        const after = await ValidationPresets.fromPresetGroups([
            { ifcFileNames: ['lazy.ifc'], idsFileName: null }
        ]);
        expect(after[0].missingIfcNames.length).toBe(0);
        expect(after[0].ifcFiles[0].content).toBe('NOW-EXISTS');
    });
});
