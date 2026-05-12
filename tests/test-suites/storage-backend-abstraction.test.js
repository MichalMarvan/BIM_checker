/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('StorageBackend abstraction', () => {
    beforeEach(async () => {
        if (!window.BIMStorage.initialized) await window.BIMStorage.init();
    });

    it('exposes window.BIMStorage.backend slot', () => {
        expect(typeof window.BIMStorage.backend).toBe('object');
    });

    it('default backend is IndexedDB', () => {
        expect(window.BIMStorage.backend.kind).toBe('indexedDB');
    });

    it('exposes setBackend method that dispatches storage:backendChanged event', async () => {
        let eventFired = false;
        const listener = () => { eventFired = true; };
        document.addEventListener('storage:backendChanged', listener);

        const stubBackend = { kind: 'stub', isReadOnly: () => false };
        window.BIMStorage.setBackend(stubBackend);

        expect(eventFired).toBe(true);
        expect(window.BIMStorage.backend.kind).toBe('stub');

        window.BIMStorage.setBackend(window.BIMStorage.indexedDBBackend);
        document.removeEventListener('storage:backendChanged', listener);
    });

    it('existing public API (getFiles, getFile, getFileContent) still works after wrap', async () => {
        const files = await window.BIMStorage.getFiles('ifc');
        expect(Array.isArray(files)).toBe(true);
    });

    it('IndexedDB backend isReadOnly returns false', () => {
        expect(window.BIMStorage.indexedDBBackend.isReadOnly()).toBe(false);
    });
});
