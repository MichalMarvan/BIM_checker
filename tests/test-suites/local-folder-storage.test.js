/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('LocalFolderStorageBackend', () => {
    let backend;
    let mockRootHandle;

    function makeFileHandle(name) {
        const content = new TextEncoder().encode(`content of ${name}`);
        return {
            kind: 'file',
            name,
            getFile: async () => ({
                arrayBuffer: async () => content.buffer,
                size: content.length,
                name
            })
        };
    }

    function makeDirHandle(name, entries) {
        return {
            kind: 'directory',
            name,
            async *values() { for (const e of entries) yield e; },
            queryPermission: async () => 'granted',
            requestPermission: async () => 'granted'
        };
    }

    beforeEach(() => {
        mockRootHandle = makeDirHandle('CDE-Mirror', [
            makeFileHandle('wall.ifc'),
            makeFileHandle('spec.ids'),
            makeFileHandle('readme.txt'),
            makeDirHandle('subfolder', [
                makeFileHandle('floor.ifc'),
                makeFileHandle('rules.xml')
            ])
        ]);
        backend = new window.LocalFolderStorageBackend(mockRootHandle);
    });

    it('isSupported reflects window.showDirectoryPicker presence', () => {
        const has = typeof window.showDirectoryPicker === 'function';
        expect(window.LocalFolderStorageBackend.isSupported()).toBe(has);
    });

    it('kind is "localFolder"', () => {
        expect(backend.kind).toBe('localFolder');
    });

    it('isReadOnly returns true in v1', () => {
        expect(backend.isReadOnly()).toBe(true);
    });

    it('scan walks recursively and filters by extension', async () => {
        const result = await backend.scan();
        const names = result.files.map(f => f.name);
        expect(names.includes('wall.ifc')).toBe(true);
        expect(names.includes('spec.ids')).toBe(true);
        expect(names.includes('floor.ifc')).toBe(true);
        expect(names.includes('rules.xml')).toBe(true);
        expect(names.includes('readme.txt')).toBe(false);
        expect(result.files.length).toBe(4);
        expect(result.scanned).toBe(4);
        expect(result.limited).toBe(false);
        expect(result.warning).toBe(false);
    });

    it('scan respects maxFiles hard limit', async () => {
        const entries = [];
        for (let i = 0; i < 5; i++) entries.push(makeFileHandle(`f${i}.ifc`));
        const dir = makeDirHandle('big', entries);
        const b = new window.LocalFolderStorageBackend(dir);
        const result = await b.scan({ maxFiles: 3 });
        expect(result.files.length).toBe(3);
        expect(result.limited).toBe(true);
    });

    it('scan warning fires at >500 files', async () => {
        const entries = [];
        for (let i = 0; i < 600; i++) entries.push(makeFileHandle(`f${i}.ifc`));
        const dir = makeDirHandle('warn', entries);
        const b = new window.LocalFolderStorageBackend(dir);
        const result = await b.scan({ maxFiles: 1000 });
        expect(result.warning).toBe(true);
        expect(result.limited).toBe(false);
    });

    it('getFileContent returns ArrayBuffer for scanned file', async () => {
        await backend.scan();
        const buf = await backend.getFileContent('ifc', 'wall.ifc');
        expect(buf instanceof ArrayBuffer).toBe(true);
    });

    it('getFiles returns scanned files filtered by type', async () => {
        await backend.scan();
        const ifcs = await backend.getFiles('ifc');
        const idss = await backend.getFiles('ids');
        expect(ifcs.length).toBe(2);
        expect(idss.length).toBe(2);
    });

    it('getStats returns count and totalBytes for type', async () => {
        await backend.scan();
        const stats = backend.getStats('ifc');
        expect(stats.count).toBe(2);
        expect(stats.totalBytes > 0).toBe(true);
    });
});
