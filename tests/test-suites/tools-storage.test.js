/* SPDX-License-Identifier: AGPL-3.0-or-later */
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

    it('register() adds list_storage_files + list_storage_folders + delete_file_from_storage + folder CRUD + move tools to executor REGISTRY', async () => {
        storageTools.register(executor._registerTool);
        expect(executor._registrySizeForTest()).toBe(12);
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

    it('move_file resolves filename and target folder, then moves', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        await window.BIMStorage.saveFile('ifc', { name: 'mv_a.ifc', size: 10, content: 'AAA' });
        const created = await tools.create_folder({ type: 'ifc', name: 'MoveTarget_mv' });
        try {
            const r = await tools.move_file({ type: 'ifc', fileName: 'mv_a.ifc', targetFolderName: 'MoveTarget_mv' });
            expect(r.moved).toBe(true);
            const file = await window.BIMStorage.getFile('ifc', 'mv_a.ifc');
            expect(file.folder).toBe(created.folderId);
        } finally {
            await window.BIMStorage.deleteFile('ifc', 'mv_a.ifc').catch(() => {});
            await window.BIMStorage.ifcStorage.deleteFolder(created.folderId).catch(() => {});
        }
    });

    it('move_file returns not_found for missing file', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const r = await tools.move_file({ type: 'ifc', fileName: 'nonexistent_x.ifc', targetFolderName: 'root' });
        expect(r.error).toBe('not_found');
    });

    it('move_files_batch reports moved + skipped', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        await window.BIMStorage.saveFile('ifc', { name: 'b1.ifc', size: 10, content: 'X' });
        await window.BIMStorage.saveFile('ifc', { name: 'b2.ifc', size: 10, content: 'X' });
        const created = await tools.create_folder({ type: 'ifc', name: 'BatchTarget_b' });
        try {
            const r = await tools.move_files_batch({
                type: 'ifc',
                fileNames: ['b1.ifc', 'b2.ifc', 'nope.ifc'],
                targetFolderName: 'BatchTarget_b'
            });
            expect(r.moved.length).toBe(2);
            expect(r.skipped.length).toBe(1);
            expect(r.skipped[0].name).toBe('nope.ifc');
            expect(r.skipped[0].reason).toBe('not_found');
        } finally {
            await window.BIMStorage.deleteFile('ifc', 'b1.ifc').catch(() => {});
            await window.BIMStorage.deleteFile('ifc', 'b2.ifc').catch(() => {});
            await window.BIMStorage.ifcStorage.deleteFolder(created.folderId).catch(() => {});
        }
    });

    it('move_files_batch rejects non-array fileNames', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        let threw = false;
        try {
            await tools.move_files_batch({ type: 'ifc', fileNames: 'not_array', targetFolderName: 'root' });
        } catch (e) { threw = true; }
        expect(threw).toBe(true);
    });

    it('download_file triggers a click on a download anchor', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        await window.BIMStorage.saveFile('ifc', { name: 'dl_test.ifc', size: 5, content: 'HELLO' });
        const origCreate = URL.createObjectURL;
        const origRevoke = URL.revokeObjectURL;
        let createUrlCalled = false;
        URL.createObjectURL = () => { createUrlCalled = true; return 'blob:fake'; };
        URL.revokeObjectURL = () => {};
        try {
            const r = await tools.download_file({ type: 'ifc', name: 'dl_test.ifc' });
            expect(r.downloaded).toBe(true);
            expect(r.name).toBe('dl_test.ifc');
            expect(createUrlCalled).toBe(true);
        } finally {
            URL.createObjectURL = origCreate;
            URL.revokeObjectURL = origRevoke;
            await window.BIMStorage.deleteFile('ifc', 'dl_test.ifc').catch(() => {});
        }
    });

    it('download_file returns not_found for missing file', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const r = await tools.download_file({ type: 'ifc', name: 'never_existed.ifc' });
        expect(r.error).toBe('not_found');
    });

    it('get_file_snippet returns content under maxBytes', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        await window.BIMStorage.saveFile('ifc', { name: 'snippet1.ifc', size: 5, content: 'HELLO' });
        try {
            const r = await tools.get_file_snippet({ type: 'ifc', name: 'snippet1.ifc' });
            expect(r.snippet).toBe('HELLO');
            expect(r.truncated).toBe(false);
            expect(r.totalBytes).toBe(5);
        } finally {
            await window.BIMStorage.deleteFile('ifc', 'snippet1.ifc').catch(() => {});
        }
    });

    it('get_file_snippet truncates long content', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const big = 'x'.repeat(20000);
        await window.BIMStorage.saveFile('ifc', { name: 'big.ifc', size: big.length, content: big });
        try {
            const r = await tools.get_file_snippet({ type: 'ifc', name: 'big.ifc', maxBytes: 100 });
            expect(r.snippet.length).toBe(100);
            expect(r.truncated).toBe(true);
            expect(r.totalBytes).toBe(20000);
        } finally {
            await window.BIMStorage.deleteFile('ifc', 'big.ifc').catch(() => {});
        }
    });

    it('get_file_summary returns ifc entity counts', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const tinyIfc = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('test'),'2;1');
FILE_NAME('t.ifc','',(),(), '', '', '');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCWALL('GUID',$,'Wall1',$,$,$,$,$,$);
#2=IFCWALL('GUID2',$,'Wall2',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;`;
        await window.BIMStorage.saveFile('ifc', { name: 'sum1.ifc', size: tinyIfc.length, content: tinyIfc });
        try {
            const r = await tools.get_file_summary({ type: 'ifc', name: 'sum1.ifc' });
            expect(r.name).toBe('sum1.ifc');
            expect(typeof r.entityCount).toBe('number');
            expect(Array.isArray(r.topTypes)).toBe(true);
        } finally {
            await window.BIMStorage.deleteFile('ifc', 'sum1.ifc').catch(() => {});
        }
    });

    it('get_file_summary returns not_found for missing file', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const r = await tools.get_file_summary({ type: 'ifc', name: 'nope_summary.ifc' });
        expect(r.error).toBe('not_found');
    });

    it('replace_file_content overwrites file with confirm', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        await window.BIMStorage.saveFile('ifc', { name: 'rep.ifc', size: 3, content: 'OLD' });
        const orig = window.confirm;
        window.confirm = () => true;
        try {
            const r = await tools.replace_file_content({ type: 'ifc', name: 'rep.ifc', content: 'NEW_CONTENT' });
            expect(r.replaced).toBe(true);
            expect(r.oldSize).toBe(3);
            expect(r.newSize).toBe(11);
            const after = await window.BIMStorage.getFileContent('ifc', (await window.BIMStorage.getFile('ifc', 'rep.ifc')).id);
            expect(after).toBe('NEW_CONTENT');
        } finally {
            window.confirm = orig;
            await window.BIMStorage.deleteFile('ifc', 'rep.ifc').catch(() => {});
        }
    });

    it('replace_file_content returns cancelled when confirm dismissed', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        await window.BIMStorage.saveFile('ifc', { name: 'cancel.ifc', size: 3, content: 'OLD' });
        const orig = window.confirm;
        window.confirm = () => false;
        try {
            const r = await tools.replace_file_content({ type: 'ifc', name: 'cancel.ifc', content: 'NEW' });
            expect(r.cancelled).toBe(true);
            const file = await window.BIMStorage.getFile('ifc', 'cancel.ifc');
            const content = await window.BIMStorage.getFileContent('ifc', file.id);
            expect(content).toBe('OLD');
        } finally {
            window.confirm = orig;
            await window.BIMStorage.deleteFile('ifc', 'cancel.ifc').catch(() => {});
        }
    });

    it('replace_file_content returns not_found for missing file', async () => {
        const tools = await import('../../assets/js/ai/tools/tool-storage.js');
        const r = await tools.replace_file_content({ type: 'ifc', name: 'gone.ifc', content: 'X' });
        expect(r.error).toBe('not_found');
    });
});
