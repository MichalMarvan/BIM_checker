/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('LocalFolderStorageBackend.saveFileContent', () => {
    let backend;
    let writtenContent;
    let mtimeNow;

    beforeEach(() => {
        writtenContent = null;
        mtimeNow = 1000;
        const writable = {
            write: async (data) => { writtenContent = data; },
            close: async () => {}
        };
        const mockHandle = {
            kind: 'file',
            name: 'wall.ifc',
            getFile: async () => ({
                arrayBuffer: async () => new TextEncoder().encode('initial').buffer,
                size: 7,
                lastModified: mtimeNow,
                name: 'wall.ifc'
            }),
            createWritable: async () => writable
        };
        backend = new window.LocalFolderStorageBackend({
            kind: 'directory',
            name: 'root',
            async *values() { yield mockHandle; }
        });
    });

    it('saveFileContent writes to file handle and returns ok', async () => {
        await backend.scan();
        await backend.getFileContent('ifc', 'wall.ifc');
        const result = await backend.saveFileContent('ifc', 'wall.ifc', 'new content');
        expect(result.ok).toBe(true);
        expect(writtenContent).toBe('new content');
    });

    it('saveFileContent returns file_not_found when path not in cache', async () => {
        const result = await backend.saveFileContent('ifc', 'missing.ifc', 'content');
        expect(result.error).toBe('file_not_found');
    });

    it('saveFileContent records new mtime after write', async () => {
        await backend.scan();
        await backend.getFileContent('ifc', 'wall.ifc');
        // Simulate disk mtime advancing because of the write (force=true to skip
        // conflict check — the test scenario is about post-write mtime recording,
        // not external-change detection which is covered in conflict-detect suite).
        mtimeNow = 2000;
        const result = await backend.saveFileContent('ifc', 'wall.ifc', 'new', { force: true });
        expect(result.ok).toBe(true);
        expect(result.mtime).toBe(2000);
    });
});
