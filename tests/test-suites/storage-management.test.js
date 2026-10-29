/* SPDX-License-Identifier: AGPL-3.0-or-later */

describe('Storage registry and project backup', () => {
    beforeEach(async () => {
        BIMStorage.setBackend(BIMStorage.indexedDBBackend);
        await BIMStorage.init();
    });

    async function cleanupNamed(type, name) {
        const files = (await BIMStorage.getFiles(type)).filter(file => file.name === name);
        for (const file of files) await BIMStorage.deleteFile(type, file.id);
    }

    it('keeps one classified registry of persistent databases', () => {
        expect(BIMDatabaseRegistry.get('projectStorage').name).toBe('bim_checker_storage');
        expect(BIMDatabaseRegistry.get('modelCache').kind).toBe('cache');
        expect(BIMDatabaseRegistry.list('cache').length >= 3).toBe(true);
    });

    it('exports and non-destructively restores IFC and IDS files', async () => {
        const ifcName = 'project-backup-roundtrip.ifc';
        const idsName = 'project-backup-roundtrip.ids';
        await cleanupNamed('ifc', ifcName);
        await cleanupNamed('ids', idsName);
        await BIMStorage.saveFile('ifc', { name: ifcName, size: 7, content: 'IFC-ČES' });
        await BIMStorage.saveFile('ids', { name: idsName, size: 8, content: '<ids>✓</ids>' });

        const full = await BIMProjectBackup.exportProject();
        const backup = {
            ...full,
            project: {
                ifc: { folders: { root: { id: 'root', parent: null, name: 'Root' } }, files: full.project.ifc.files.filter(file => file.name === ifcName) },
                ids: { folders: { root: { id: 'root', parent: null, name: 'Root' } }, files: full.project.ids.files.filter(file => file.name === idsName) },
            },
        };
        const result = await BIMProjectBackup.restoreProject(backup);
        const ifcCopies = (await BIMStorage.getFiles('ifc')).filter(file => file.name === ifcName);
        const idsCopies = (await BIMStorage.getFiles('ids')).filter(file => file.name === idsName);

        expect(result.restored).toBe(2);
        expect(result.originalsPreserved).toBe(true);
        expect(ifcCopies.length).toBe(2);
        expect(idsCopies.length).toBe(2);
        expect(await BIMStorage.getFileContent('ifc', ifcCopies[1].id)).toBe('IFC-ČES');
        expect(await BIMStorage.getFileContent('ids', idsCopies[1].id)).toBe('<ids>✓</ids>');

        await cleanupNamed('ifc', ifcName);
        await cleanupNamed('ids', idsName);
        for (const type of ['ifc', 'ids']) {
            const storage = type === 'ifc' ? BIMStorage.ifcStorage : BIMStorage.idsStorage;
            const restoreFolders = Object.values(storage.data.folders).filter(folder => folder.id !== 'root' && folder.name.startsWith('Obnova '));
            for (const folder of restoreFolders) await storage.deleteFolder(folder.id);
        }
    });

    it('rejects newer backup formats before writing data', () => {
        let rejected = false;
        try {
            BIMProjectBackup.validate({ format: BIMProjectBackup.format, formatVersion: 999, project: {} });
        } catch { rejected = true; }
        expect(rejected).toBe(true);
    });
});
