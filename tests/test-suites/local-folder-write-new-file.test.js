/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('LocalFolderStorageBackend.writeNewFile', () => {
    let backend;
    let createdFiles;

    function makeDirHandle(name, existingFiles = []) {
        const existing = new Set(existingFiles);
        return {
            kind: 'directory',
            name,
            async *values() {
                for (const n of existingFiles) {
                    yield {
                        kind: 'file',
                        name: n,
                        getFile: async () => ({ arrayBuffer: async () => new ArrayBuffer(0), size: 0, lastModified: 0, name: n })
                    };
                }
            },
            getFileHandle: async (n, opts) => {
                if (opts && opts.create) {
                    existing.add(n);
                    createdFiles.push(n);
                    return {
                        kind: 'file',
                        name: n,
                        getFile: async () => ({ arrayBuffer: async () => new ArrayBuffer(0), size: 100, lastModified: 999, name: n }),
                        createWritable: async () => ({ write: async () => {}, close: async () => {} })
                    };
                }
                if (existing.has(n)) {
                    return { kind: 'file', name: n };
                }
                const err = new Error('not found');
                err.name = 'NotFoundError';
                throw err;
            },
            getDirectoryHandle: async () => { throw new Error('not implemented in test'); }
        };
    }

    beforeEach(() => {
        createdFiles = [];
        backend = new window.LocalFolderStorageBackend(makeDirHandle('root', []));
    });

    it('writeNewFile creates a new file at root', async () => {
        const result = await backend.writeNewFile('ifc', '', 'wall.ifc', 'content');
        expect(result.ok).toBe(true);
        expect(result.finalName).toBe('wall.ifc');
        expect(createdFiles.includes('wall.ifc')).toBe(true);
    });

    it('writeNewFile auto-suffixes when name collides', async () => {
        backend.root = makeDirHandle('root', ['wall.ifc']);
        const result = await backend.writeNewFile('ifc', '', 'wall.ifc', 'content');
        expect(result.ok).toBe(true);
        expect(result.finalName).toBe('wall_v2.ifc');
    });

    it('writeNewFile keeps suffixing _v3, _v4 on multiple collisions', async () => {
        backend.root = makeDirHandle('root', ['wall.ifc', 'wall_v2.ifc']);
        const result = await backend.writeNewFile('ifc', '', 'wall.ifc', 'content');
        expect(result.ok).toBe(true);
        expect(result.finalName).toBe('wall_v3.ifc');
    });

    it('writeNewFile adds new file to internal cache', async () => {
        const result = await backend.writeNewFile('ifc', '', 'new.ifc', 'content');
        expect(result.ok).toBe(true);
        const ifcs = await backend.getFiles('ifc');
        const names = ifcs.map(f => f.name);
        expect(names.includes('new.ifc')).toBe(true);
    });

    it('writeNewFile returns write_failed on error', async () => {
        backend.root = {
            getFileHandle: async () => { throw new Error('disk full'); }
        };
        const result = await backend.writeNewFile('ifc', '', 'wall.ifc', 'content');
        expect(result.error).toBe('write_failed');
    });
});
