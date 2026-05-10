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

    it('register() adds list_storage_files + list_storage_folders + delete_file_from_storage + folder CRUD to executor REGISTRY', async () => {
        storageTools.register(executor._registerTool);
        expect(executor._registrySizeForTest()).toBe(6);
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

    it('create_folder creates a folder under root', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const r = await tools.create_folder({ type: 'ifc', name: 'TestFolderA' });
        try {
            expect(typeof r.folderId).toBe('string');
            expect(r.path.includes('TestFolderA')).toBe(true);
        } finally {
            await window.BIMStorage.ifcStorage.deleteFolder(r.folderId).catch(() => {});
        }
    });

    it('create_folder returns not_found for missing parent', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const r = await tools.create_folder({ type: 'ifc', name: 'X', parentName: 'NonexistentParent_zzz' });
        expect(r.error).toBe('not_found');
    });

    it('rename_folder renames an existing folder', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const created = await tools.create_folder({ type: 'ifc', name: 'OldName_rt' });
        try {
            const r = await tools.rename_folder({ type: 'ifc', folderName: 'OldName_rt', newName: 'NewName_rt' });
            expect(r.renamed).toBe(true);
            const folders = window.BIMStorage.ifcStorage.data.folders;
            expect(folders[created.folderId].name).toBe('NewName_rt');
        } finally {
            await window.BIMStorage.ifcStorage.deleteFolder(created.folderId).catch(() => {});
        }
    });

    it('rename_folder refuses on root', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const r = await tools.rename_folder({ type: 'ifc', folderName: 'root', newName: 'X' });
        expect(r.error).toBe('cannot_modify_root');
    });

    it('delete_folder asks confirm and deletes on accept', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const created = await tools.create_folder({ type: 'ifc', name: 'ToDelete_dt' });
        const orig = window.confirm;
        window.confirm = () => true;
        try {
            const r = await tools.delete_folder({ type: 'ifc', folderName: 'ToDelete_dt' });
            expect(r.deleted).toBe(true);
            expect(!!window.BIMStorage.ifcStorage.data.folders[created.folderId]).toBe(false);
        } finally {
            window.confirm = orig;
        }
    });

    it('delete_folder returns cancelled when confirm dismissed', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const created = await tools.create_folder({ type: 'ifc', name: 'KeepMe_kt' });
        const orig = window.confirm;
        window.confirm = () => false;
        try {
            const r = await tools.delete_folder({ type: 'ifc', folderName: 'KeepMe_kt' });
            expect(r.cancelled).toBe(true);
            expect(!!window.BIMStorage.ifcStorage.data.folders[created.folderId]).toBe(true);
        } finally {
            window.confirm = orig;
            await window.BIMStorage.ifcStorage.deleteFolder(created.folderId).catch(() => {});
        }
    });
});
