/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */

(function () {
    'use strict';

    const FORMAT = 'BIM_CHECKER_PROJECT_BACKUP';
    const FORMAT_VERSION = 1;
    const cacheModuleUrl = document.currentScript
        ? new URL('../3d/ifc-engine/cache/cache-store.js', document.currentScript.src).href
        : '../assets/js/3d/ifc-engine/cache/cache-store.js';

    function bytesToBase64(bytes) {
        let out = '';
        const chunk = 0x8000;
        for (let offset = 0; offset < bytes.length; offset += chunk) {
            out += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
        }
        return btoa(out);
    }

    function base64ToBytes(value) {
        const raw = atob(value);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
            bytes[i] = raw.charCodeAt(i);
        }
        return bytes;
    }

    async function encodeContent(content) {
        if (typeof content === 'string') {
            return { encoding: 'text', value: content };
        }
        if (content instanceof Blob) {
            content = await content.arrayBuffer();
        }
        if (content instanceof ArrayBuffer) {
            return { encoding: 'base64', value: bytesToBase64(new Uint8Array(content)) };
        }
        if (ArrayBuffer.isView(content)) {
            return { encoding: 'base64', value: bytesToBase64(new Uint8Array(content.buffer, content.byteOffset, content.byteLength)) };
        }
        return { encoding: 'json', value: JSON.stringify(content ?? null) };
    }

    function decodeContent(encoded) {
        if (!encoded || typeof encoded !== 'object') {
            throw new Error('Invalid encoded file content');
        }
        if (encoded.encoding === 'text') {
            return String(encoded.value ?? '');
        }
        if (encoded.encoding === 'base64') {
            return base64ToBytes(String(encoded.value || '')).buffer;
        }
        if (encoded.encoding === 'json') {
            return JSON.parse(encoded.value);
        }
        throw new Error(`Unsupported content encoding: ${encoded.encoding}`);
    }

    async function exportType(type) {
        const files = await window.BIMStorage.getFiles(type);
        const folders = await window.BIMStorage.listFolders(type);
        const exportedFiles = [];
        for (const file of files) {
            const content = await window.BIMStorage.getFileContent(type, file.id);
            exportedFiles.push({
                id: file.id,
                name: file.name,
                size: file.size,
                folder: file.folder || 'root',
                uploadDate: file.uploadDate || null,
                content: await encodeContent(content),
            });
        }
        return { folders: JSON.parse(JSON.stringify(folders || {})), files: exportedFiles };
    }

    function validateBackup(backup) {
        if (!backup || backup.format !== FORMAT) {
            throw new Error('Unknown BIM Checker backup format');
        }
        if (backup.formatVersion > FORMAT_VERSION) {
            throw new Error(`Backup version ${backup.formatVersion} is newer than supported version ${FORMAT_VERSION}`);
        }
        if (backup.formatVersion !== 1 || !backup.project) {
            throw new Error('Unsupported or damaged backup');
        }
        for (const type of ['ifc', 'ids']) {
            const section = backup.project[type];
            if (!section || !Array.isArray(section.files) || !section.folders || typeof section.folders !== 'object') {
                throw new Error(`Damaged ${type.toUpperCase()} backup section`);
            }
            if (section.files.length > 10000) {
                throw new Error('Backup contains too many files');
            }
            for (const file of section.files) {
                if (!file || typeof file.name !== 'string' || !file.content) {
                    throw new Error('Backup contains an invalid file');
                }
                decodeContent(file.content); // Validate every payload before writing anything.
            }
        }
        return backup;
    }

    function restoreFolderName(backup) {
        const stamp = String(backup.exportedAt || new Date().toISOString()).replace('T', ' ').slice(0, 16);
        return `Obnova ${stamp}`;
    }

    async function restoreType(type, section, rootName) {
        if (section.files.length === 0) {
            return { restored: 0, failed: [] };
        }
        const restoreRoot = await window.BIMStorage.createFolder(type, rootName, 'root');
        const idMap = new Map([['root', restoreRoot]]);
        const pending = Object.values(section.folders).filter(folder => folder?.id && folder.id !== 'root');
        let progress = true;
        while (pending.length && progress) {
            progress = false;
            for (let i = pending.length - 1; i >= 0; i--) {
                const folder = pending[i];
                const parent = idMap.get(folder.parent || 'root');
                if (!parent) {
                    continue;
                }
                const newId = await window.BIMStorage.createFolder(type, folder.name || 'Složka', parent);
                idMap.set(folder.id, newId);
                pending.splice(i, 1);
                progress = true;
            }
        }

        const failed = [];
        let restored = 0;
        for (const file of section.files) {
            try {
                await window.BIMStorage.saveFile(type, {
                    name: file.name,
                    size: Number.isFinite(file.size) ? file.size : 0,
                    content: decodeContent(file.content),
                }, idMap.get(file.folder) || restoreRoot, { allowDuplicate: true });
                restored += 1;
            } catch (error) {
                failed.push({ name: file.name, error: error?.message || String(error) });
            }
        }
        return { restored, failed };
    }

    const api = {
        format: FORMAT,
        formatVersion: FORMAT_VERSION,
        validate: validateBackup,
        async exportProject() {
            await window.BIMStorage.init();
            return {
                format: FORMAT,
                formatVersion: FORMAT_VERSION,
                appVersion: document.querySelector('meta[name="application-version"]')?.content || '0.1.2',
                exportedAt: new Date().toISOString(),
                project: {
                    ifc: await exportType('ifc'),
                    ids: await exportType('ids'),
                },
            };
        },
        async restoreProject(rawBackup) {
            const backup = validateBackup(typeof rawBackup === 'string' ? JSON.parse(rawBackup) : rawBackup);
            await window.BIMStorage.init();
            if (window.BIMStorage.backend?.isReadOnly?.()) {
                throw new Error('Active storage is read-only');
            }
            const rootName = restoreFolderName(backup);
            const ifc = await restoreType('ifc', backup.project.ifc, rootName);
            const ids = await restoreType('ids', backup.project.ids, rootName);
            return { restored: ifc.restored + ids.restored, ifc, ids, originalsPreserved: true };
        },
        async getUsage() {
            const estimate = await window.BIMDatabaseRegistry?.estimate?.() || { usage: null, quota: null, persisted: false };
            let cache = { count: 0, bytes: 0 };
            try {
                cache = await (await import(cacheModuleUrl)).cacheStats();
            } catch { /* optional viewer cache */ }
            return { ...estimate, modelCache: cache };
        },
        async clearRegenerableCaches() {
            const cleared = [];
            try {
                await (await import(cacheModuleUrl)).cacheClear();
                cleared.push('bim-model-cache');
            } catch { /* cache may not exist */ }
            if ('caches' in window) {
                const names = await caches.keys();
                const runtime = names.filter(name => name.startsWith('bim-checker-runtime-'));
                await Promise.all(runtime.map(name => caches.delete(name)));
                cleared.push(...runtime);
            }
            return cleared;
        },
    };
    window.BIMProjectBackup = Object.freeze(api);

    function formatBytes(value) {
        if (!Number.isFinite(value)) {
            return '—';
        }
        const units = ['B', 'KiB', 'MiB', 'GiB'];
        let n = value;
        let unit = 0;
        while (n >= 1024 && unit < units.length - 1) {
            n /= 1024; unit += 1;
        }
        return `${n.toFixed(unit ? 1 : 0)} ${units[unit]}`;
    }

    async function refreshUi() {
        const output = document.getElementById('storageManagementUsage');
        if (!output) {
            return;
        }
        const info = await api.getUsage();
        const quota = info.quota ? ` / ${formatBytes(info.quota)}` : '';
        output.textContent = `${formatBytes(info.usage)}${quota} · 3D cache ${formatBytes(info.modelCache.bytes)} (${info.modelCache.count})`;
    }

    function downloadJson(data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `bim-checker-backup-${new Date().toISOString().slice(0, 10)}.bimchecker.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 0);
    }

    const exportButton = document.getElementById('storageBackupExport');
    const importButton = document.getElementById('storageBackupImport');
    const importInput = document.getElementById('storageBackupFile');
    const clearButton = document.getElementById('storageCacheClear');
    if (exportButton) {
        exportButton.addEventListener('click', async () => {
            exportButton.disabled = true;
            try {
                downloadJson(await api.exportProject());
            } catch (error) {
                window.ErrorHandler?.error?.(error.message);
            } finally {
                exportButton.disabled = false;
            }
        });
    }
    if (importButton && importInput) {
        importButton.addEventListener('click', () => importInput.click());
    }
    if (importInput) {
        importInput.addEventListener('change', async () => {
            const file = importInput.files?.[0];
            importInput.value = '';
            if (!file) {
                return;
            }
            if (importButton) {
                importButton.disabled = true;
            }
            try {
                const result = await api.restoreProject(await file.text());
                window.ErrorHandler?.success?.(`Obnoveno ${result.restored} souborů do nové složky. Původní data zůstala zachována.`);
                window.location.reload();
            } catch (error) {
                window.ErrorHandler?.error?.(error.message);
            } finally {
                if (importButton) {
                    importButton.disabled = false;
                }
            }
        });
    }
    if (clearButton) {
        clearButton.addEventListener('click', async () => {
            clearButton.disabled = true;
            try {
                await api.clearRegenerableCaches();
                await refreshUi();
                window.ErrorHandler?.success?.(window.i18n?.t?.('storage.management.cacheCleared') || 'Cache byla vyčištěna.');
            } catch (error) {
                window.ErrorHandler?.error?.(error.message);
            } finally {
                clearButton.disabled = false;
            }
        });
    }
    refreshUi().catch(() => {});
})();
