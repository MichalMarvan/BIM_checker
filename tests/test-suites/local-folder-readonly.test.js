/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('LocalFolderStorageBackend read-only guards', () => {
    let backend;
    beforeEach(() => {
        backend = new window.LocalFolderStorageBackend({ name: 'mock', kind: 'directory' });
    });

    it('saveFile returns read_only_backend error', async () => {
        const result = await backend.saveFile('ifc', null);
        expect(result.error).toBe('read_only_backend');
    });

    it('deleteFile returns read_only_backend error', async () => {
        const result = await backend.deleteFile('ifc', 'foo.ifc');
        expect(result.error).toBe('read_only_backend');
    });

    it('createFolder returns read_only_backend error', async () => {
        const result = await backend.createFolder('ifc', 'NewFolder');
        expect(result.error).toBe('read_only_backend');
    });

    it('renameFolder returns read_only_backend error', async () => {
        const result = await backend.renameFolder('ifc', 'f1', 'NewName');
        expect(result.error).toBe('read_only_backend');
    });

    it('deleteFolder returns read_only_backend error', async () => {
        const result = await backend.deleteFolder('ifc', 'f1');
        expect(result.error).toBe('read_only_backend');
    });

    it('moveFile returns read_only_backend error', async () => {
        const result = await backend.moveFile('ifc', 'file_1', 'targetFolder');
        expect(result.error).toBe('read_only_backend');
    });

    it('clearFiles returns read_only_backend error', async () => {
        const result = await backend.clearFiles('ifc');
        expect(result.error).toBe('read_only_backend');
    });
});

describe('AI write tools refuse on LocalFolder backend', () => {
    let originalBackend;

    beforeEach(() => {
        originalBackend = window.BIMStorage.backend;
        const lf = new window.LocalFolderStorageBackend({ name: 'mock', kind: 'directory' });
        window.BIMStorage.setBackend(lf);
    });

    afterEach(() => {
        window.BIMStorage.setBackend(originalBackend);
    });

    it('BIMStorage.backend.isReadOnly returns true when LocalFolder active', () => {
        expect(window.BIMStorage.backend.isReadOnly()).toBe(true);
    });
});
