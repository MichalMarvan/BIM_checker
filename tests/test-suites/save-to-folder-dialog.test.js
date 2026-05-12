/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('BIMSaveToFolderDialog', () => {
    afterEach(() => {
        document.querySelectorAll('.save-to-folder-dialog').forEach(el => el.remove());
    });

    it('open() returns Promise', () => {
        const p = window.BIMSaveToFolderDialog.open({
            fileName: 'wall.ifc',
            folderPath: '',
            contentSize: 100,
            type: 'ifc'
        });
        expect(p instanceof Promise).toBe(true);
        const cancelBtn = document.querySelector('.save-to-folder-dialog__cancel');
        if (cancelBtn) cancelBtn.click();
        return p;
    });

    it('open() resolves null on cancel', async () => {
        const p = window.BIMSaveToFolderDialog.open({
            fileName: 'wall.ifc',
            folderPath: '',
            contentSize: 100,
            type: 'ifc'
        });
        await new Promise(r => setTimeout(r, 50));
        document.querySelector('.save-to-folder-dialog__cancel').click();
        const result = await p;
        expect(result).toBe(null);
    });

    it('open() resolves { mode: "overwrite" } when user confirms overwrite', async () => {
        const p = window.BIMSaveToFolderDialog.open({
            fileName: 'wall.ifc',
            folderPath: '',
            contentSize: 100,
            type: 'ifc'
        });
        await new Promise(r => setTimeout(r, 50));
        document.querySelector('input[name="saveDialogMode"][value="overwrite"]').click();
        document.querySelector('.save-to-folder-dialog__confirm').click();
        const result = await p;
        expect(result.mode).toBe('overwrite');
    });

    it('open() resolves { mode: "copy", newName } when user picks copy', async () => {
        const p = window.BIMSaveToFolderDialog.open({
            fileName: 'wall.ifc',
            folderPath: '',
            contentSize: 100,
            type: 'ifc'
        });
        await new Promise(r => setTimeout(r, 50));
        document.querySelector('.save-to-folder-dialog__confirm').click();
        const result = await p;
        expect(result.mode).toBe('copy');
        expect(typeof result.newName).toBe('string');
        expect(result.newName.length > 0).toBe(true);
    });

    it('openConflict() resolves overwrite / copy / null', async () => {
        const p = window.BIMSaveToFolderDialog.openConflict({
            fileName: 'wall.ifc',
            currentMtime: 5000,
            knownMtime: 1000
        });
        await new Promise(r => setTimeout(r, 50));
        document.querySelector('.save-to-folder-dialog__force').click();
        const result = await p;
        expect(result).toBe('overwrite');
    });

    it('default save mode is copy (safe)', async () => {
        const p = window.BIMSaveToFolderDialog.open({
            fileName: 'wall.ifc',
            folderPath: '',
            contentSize: 100,
            type: 'ifc'
        });
        await new Promise(r => setTimeout(r, 50));
        const copyRadio = document.querySelector('input[name="saveDialogMode"][value="copy"]');
        expect(copyRadio.checked).toBe(true);
        document.querySelector('.save-to-folder-dialog__cancel').click();
        await p;
    });
});
