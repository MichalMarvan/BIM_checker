/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('BIMSaveFile helper', () => {
    let originalBackend;
    let savedFiles;

    beforeEach(() => {
        originalBackend = window.BIMStorage.backend;
        savedFiles = [];
        window.BIMStorage._saveFileOrig = window.BIMStorage.saveFile;
        window.BIMStorage.saveFile = async (type, file) => {
            savedFiles.push({ type, name: file.name, size: file.size });
            return { ok: true };
        };
    });

    afterEach(() => {
        window.BIMStorage.setBackend(originalBackend);
        if (window.BIMStorage._saveFileOrig) {
            window.BIMStorage.saveFile = window.BIMStorage._saveFileOrig;
            delete window.BIMStorage._saveFileOrig;
        }
        document.querySelectorAll('.save-to-folder-dialog').forEach(el => el.remove());
    });

    it('saves directly via BIMStorage.saveFile in IndexedDB mode (no dialog)', async () => {
        const result = await window.BIMSaveFile.save({
            type: 'ifc', path: 'wall.ifc', name: 'wall.ifc', content: 'new content', folderPath: ''
        });
        expect(result.ok).toBe(true);
        expect(result.mode).toBe('overwrite');
        expect(savedFiles.length).toBe(1);
        expect(savedFiles[0].name).toBe('wall.ifc');
        expect(document.querySelector('.save-to-folder-dialog')).toBe(null);
    });

    it('opens dialog in folder mode', async () => {
        const mockBackend = {
            kind: 'localFolder',
            isReadOnly: () => false,
            saveFileContent: async () => ({ ok: true }),
            writeNewFile: async () => ({ ok: true, finalName: 'wall_v2.ifc', path: 'wall_v2.ifc' })
        };
        window.BIMStorage.setBackend(mockBackend);

        const promise = window.BIMSaveFile.save({
            type: 'ifc', path: 'wall.ifc', name: 'wall.ifc', content: 'content', folderPath: ''
        });
        await new Promise(r => setTimeout(r, 50));
        const dialog = document.querySelector('.save-to-folder-dialog');
        expect(dialog !== null).toBe(true);
        document.querySelector('.save-to-folder-dialog__cancel').click();
        const result = await promise;
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('user_cancelled');
    });

    it('routes overwrite choice to saveFileContent', async () => {
        const calls = [];
        const mockBackend = {
            kind: 'localFolder',
            isReadOnly: () => false,
            saveFileContent: async (...args) => { calls.push(['save', ...args]); return { ok: true }; },
            writeNewFile: async () => ({ ok: true })
        };
        window.BIMStorage.setBackend(mockBackend);

        const promise = window.BIMSaveFile.save({
            type: 'ifc', path: 'wall.ifc', name: 'wall.ifc', content: 'X', folderPath: ''
        });
        await new Promise(r => setTimeout(r, 50));
        document.querySelector('input[name="saveDialogMode"][value="overwrite"]').click();
        document.querySelector('.save-to-folder-dialog__confirm').click();
        const result = await promise;
        expect(result.ok).toBe(true);
        expect(result.mode).toBe('overwrite');
        expect(calls.length).toBe(1);
        expect(calls[0][0]).toBe('save');
    });

    it('routes copy choice to writeNewFile', async () => {
        const calls = [];
        const mockBackend = {
            kind: 'localFolder',
            isReadOnly: () => false,
            saveFileContent: async () => ({ ok: true }),
            writeNewFile: async (...args) => { calls.push(['write', ...args]); return { ok: true, finalName: args[2], path: args[2] }; }
        };
        window.BIMStorage.setBackend(mockBackend);

        const promise = window.BIMSaveFile.save({
            type: 'ifc', path: 'wall.ifc', name: 'wall.ifc', content: 'X', folderPath: ''
        });
        await new Promise(r => setTimeout(r, 50));
        document.querySelector('.save-to-folder-dialog__confirm').click();
        const result = await promise;
        expect(result.ok).toBe(true);
        expect(result.mode).toBe('copy');
        expect(calls.length).toBe(1);
        expect(calls[0][0]).toBe('write');
    });

    it('handles conflict_external_change by opening conflict dialog', async () => {
        const mockBackend = {
            kind: 'localFolder',
            isReadOnly: () => false,
            saveFileContent: async (_t, _p, _c, opts) => {
                if (opts && opts.force) return { ok: true };
                return { error: 'conflict_external_change', currentMtime: 5000, knownMtime: 1000 };
            },
            writeNewFile: async () => ({ ok: true, finalName: 'x', path: 'x' })
        };
        window.BIMStorage.setBackend(mockBackend);

        const promise = window.BIMSaveFile.save({
            type: 'ifc', path: 'wall.ifc', name: 'wall.ifc', content: 'X', folderPath: ''
        });
        await new Promise(r => setTimeout(r, 50));
        document.querySelector('input[name="saveDialogMode"][value="overwrite"]').click();
        document.querySelector('.save-to-folder-dialog__confirm').click();
        await new Promise(r => setTimeout(r, 80));
        document.querySelector('.save-to-folder-dialog__force').click();
        const result = await promise;
        expect(result.ok).toBe(true);
        expect(result.mode).toBe('overwrite');
    });
});
