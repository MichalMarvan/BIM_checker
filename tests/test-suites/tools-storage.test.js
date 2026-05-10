describe('tools/tool-storage', () => {
    let storageTools, executor;

    async function clearStorage() {
        await window.BIMStorage.init();
        const ifc = await window.BIMStorage.getFiles('ifc');
        for (const f of ifc) await window.BIMStorage.ifcStorage.deleteFile(f.id);
        const ids = await window.BIMStorage.getFiles('ids');
        for (const f of ids) await window.BIMStorage.idsStorage.deleteFile(f.id);
    }

    function makeFile(name, content) {
        return { name, content, size: content.length, type: 'text/plain' };
    }

    beforeEach(async () => {
        storageTools = await import('../../assets/js/ai/tools/tool-storage.js');
        executor = await import('../../assets/js/ai/tool-executor.js');
        executor._resetRegistryForTest();
        await clearStorage();
    });

    it('list_storage_files returns [] when storage empty', async () => {
        const result = await storageTools.list_storage_files({ type: 'ifc' });
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(0);
    });

    it('list_storage_files returns IFC files only when type=ifc', async () => {
        await window.BIMStorage.saveFile('ifc', makeFile('a.ifc', 'IFC'));
        await window.BIMStorage.saveFile('ids', makeFile('b.ids', '<ids/>'));
        const result = await storageTools.list_storage_files({ type: 'ifc' });
        expect(result.length).toBe(1);
        expect(result[0].name).toBe('a.ifc');
    });

    it('list_storage_files throws on invalid type', async () => {
        let threw = false;
        try { await storageTools.list_storage_files({ type: 'pdf' }); } catch { threw = true; }
        expect(threw).toBe(true);
    });

    it('delete_file_from_storage removes existing file when confirmed', async () => {
        await window.BIMStorage.saveFile('ifc', makeFile('to-del.ifc', 'X'));
        const origConfirm = window.confirm;
        window.confirm = () => true;
        const result = await storageTools.delete_file_from_storage({ type: 'ifc', name: 'to-del.ifc' });
        window.confirm = origConfirm;
        expect(result.deleted).toBe(true);
        const remaining = await window.BIMStorage.getFiles('ifc');
        expect(remaining.length).toBe(0);
    });

    it('delete_file_from_storage returns cancelled when user declines confirm', async () => {
        await window.BIMStorage.saveFile('ifc', makeFile('keep.ifc', 'X'));
        const origConfirm = window.confirm;
        window.confirm = () => false;
        const result = await storageTools.delete_file_from_storage({ type: 'ifc', name: 'keep.ifc' });
        window.confirm = origConfirm;
        expect(result.cancelled).toBe(true);
        const remaining = await window.BIMStorage.getFiles('ifc');
        expect(remaining.length).toBe(1);
    });

    it('delete_file_from_storage returns not_found for missing file', async () => {
        const origConfirm = window.confirm;
        window.confirm = () => true;
        const result = await storageTools.delete_file_from_storage({ type: 'ifc', name: 'ghost.ifc' });
        window.confirm = origConfirm;
        expect(result.error).toBe('not_found');
    });

    it('register() adds list_storage_files + list_storage_folders + delete_file_from_storage to executor REGISTRY', async () => {
        storageTools.register(executor._registerTool);
        expect(executor._registrySizeForTest()).toBe(3);
    });

    it('list_storage_folders returns array with folder shape', async () => {
        const result = await storageTools.list_storage_folders({ type: 'ifc' });
        expect(Array.isArray(result)).toBe(true);
        // root folder should always be present with stable name 'root'
        expect(result.length >= 1).toBe(true);
        const root = result.find(f => f.name === 'root');
        expect(root !== undefined).toBe(true);
        expect(typeof root.fileCount).toBe('number');
        expect(Array.isArray(root.files)).toBe(true);
    });

    it('list_storage_folders shows files in root after upload', async () => {
        await window.BIMStorage.saveFile('ifc', makeFile('folder-test.ifc', 'IFC'));
        const result = await storageTools.list_storage_folders({ type: 'ifc' });
        const root = result.find(f => f.name === 'root');
        expect(root !== undefined).toBe(true);
        expect(root.fileCount).toBe(1);
        expect(root.files[0]).toBe('folder-test.ifc');
    });

    it('list_storage_files with folder filter returns empty when no match', async () => {
        await window.BIMStorage.saveFile('ifc', makeFile('x.ifc', 'IFC'));
        const result = await storageTools.list_storage_files({ type: 'ifc', folder: 'nonexistent-xyz' });
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(0);
    });

    it('list_storage_files with folder=root returns all root files', async () => {
        await window.BIMStorage.saveFile('ifc', makeFile('root1.ifc', 'IFC'));
        await window.BIMStorage.saveFile('ifc', makeFile('root2.ifc', 'IFC'));
        const result = await storageTools.list_storage_files({ type: 'ifc', folder: 'root' });
        expect(result.length).toBe(2);
    });
});
