/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('LocalFolderStorageBackend mtime conflict detection', () => {
    let backend;
    let currentMtime;

    beforeEach(() => {
        currentMtime = 1000;
        const writable = { write: async () => {}, close: async () => {} };
        const handle = {
            kind: 'file',
            name: 'wall.ifc',
            getFile: async () => ({
                arrayBuffer: async () => new ArrayBuffer(10),
                size: 10,
                lastModified: currentMtime,
                name: 'wall.ifc'
            }),
            createWritable: async () => writable
        };
        backend = new window.LocalFolderStorageBackend({
            kind: 'directory',
            name: 'root',
            async *values() { yield handle; }
        });
    });

    it('getFileContent records mtime', async () => {
        await backend.scan();
        await backend.getFileContent('ifc', 'wall.ifc');
        expect(backend._readMtimes.get('wall.ifc')).toBe(1000);
    });

    it('saveFileContent returns conflict_external_change when disk newer', async () => {
        await backend.scan();
        await backend.getFileContent('ifc', 'wall.ifc');
        currentMtime = 5000;
        const result = await backend.saveFileContent('ifc', 'wall.ifc', 'new');
        expect(result.error).toBe('conflict_external_change');
        expect(result.currentMtime).toBe(5000);
        expect(result.knownMtime).toBe(1000);
    });

    it('saveFileContent with force=true bypasses conflict check', async () => {
        await backend.scan();
        await backend.getFileContent('ifc', 'wall.ifc');
        currentMtime = 5000;
        const result = await backend.saveFileContent('ifc', 'wall.ifc', 'new', { force: true });
        expect(result.ok).toBe(true);
    });

    it('saveFileContent without prior read still works (no mtime to compare)', async () => {
        await backend.scan();
        const result = await backend.saveFileContent('ifc', 'wall.ifc', 'new');
        expect(result.ok).toBe(true);
    });
});
