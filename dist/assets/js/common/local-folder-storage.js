/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

/**
 * Local folder storage backend (read-only in v1).
 *
 * Connects to a real folder on the user's disk via the File System Access API.
 * Scans recursively for .ifc/.ids/.xml files. Read operations return file content
 * from disk; write operations return { error: 'read_only_backend' } in v1.
 *
 * Browser support: Chromium-based desktop only.
 */

class LocalFolderStorageBackend {
    static isSupported() {
        return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
    }

    constructor(rootDirHandle = null) {
        this.kind = 'localFolder';
        this.root = rootDirHandle;
        this.rootName = rootDirHandle ? rootDirHandle.name : null;
        this._fileCache = new Map();
        this._initialized = !!rootDirHandle;
    }

    isReadOnly() { return true; }

    async init() { return this._initialized; }

    async connect() {
        if (!LocalFolderStorageBackend.isSupported()) {
            throw new Error('File System Access API not supported in this browser');
        }
        const handle = await window.showDirectoryPicker({ id: 'bim-checker-root', mode: 'read' });
        this.root = handle;
        this.rootName = handle.name;
        this._initialized = true;
        if (window.BIMFsHandleStore) {
            await window.BIMFsHandleStore.saveRootHandle(handle);
        }
        return handle.name;
    }

    async restoreFromIndexedDB() {
        if (!window.BIMFsHandleStore) return { state: 'no_handle' };
        const handle = await window.BIMFsHandleStore.loadRootHandle();
        if (!handle) return { state: 'no_handle' };
        const perm = await handle.queryPermission({ mode: 'read' });
        if (perm === 'granted') {
            this.root = handle;
            this.rootName = handle.name;
            this._initialized = true;
            return { state: 'connected', name: handle.name };
        }
        if (perm === 'prompt') {
            return { state: 'needs_permission', handle, name: handle.name };
        }
        return { state: 'denied', handle, name: handle.name };
    }

    async requestPermissionAgain(handle) {
        const perm = await handle.requestPermission({ mode: 'read' });
        if (perm === 'granted') {
            this.root = handle;
            this.rootName = handle.name;
            this._initialized = true;
            return true;
        }
        return false;
    }

    async disconnect() {
        this.root = null;
        this.rootName = null;
        this._fileCache.clear();
        this._initialized = false;
        if (window.BIMFsHandleStore) {
            await window.BIMFsHandleStore.clearRootHandle();
        }
    }

    async scan({ maxFiles = 2000 } = {}) {
        if (!this.root) throw new Error('No folder connected');
        const files = [];
        let scanned = 0;
        let limited = false;
        const cache = this._fileCache;
        cache.clear();

        const walk = async (dirHandle, prefix) => {
            for await (const entry of dirHandle.values()) {
                if (scanned >= maxFiles) { limited = true; return; }
                const path = prefix + entry.name;
                if (entry.kind === 'file') {
                    const ext = entry.name.toLowerCase().split('.').pop();
                    if (ext === 'ifc' || ext === 'ids' || ext === 'xml') {
                        const type = ext === 'ifc' ? 'ifc' : 'ids';
                        let size = 0;
                        try {
                            const file = await entry.getFile();
                            size = file.size;
                        } catch (_) { /* ignore */ }
                        const record = { path, name: entry.name, type, size, handle: entry };
                        files.push(record);
                        cache.set(path, record);
                        scanned++;
                    }
                } else if (entry.kind === 'directory') {
                    await walk(entry, path + '/');
                    if (limited) return;
                }
            }
        };

        await walk(this.root, '');

        return {
            files,
            scanned,
            limited,
            warning: scanned > 500
        };
    }

    async getFiles(type) {
        if (!this._initialized) return [];
        if (this._fileCache.size === 0) await this.scan();
        return Array.from(this._fileCache.values())
            .filter(r => r.type === type)
            .map(r => ({ id: r.path, name: r.name, size: r.size, folderId: 'root' }));
    }

    async getFile(type, name) {
        const files = await this.getFiles(type);
        return files.find(f => f.name === name) || null;
    }

    async getFileContent(type, fileId) {
        const record = this._fileCache.get(fileId)
            || Array.from(this._fileCache.values()).find(r => r.name === fileId && r.type === type);
        if (!record) throw new Error(`File not found in local folder: ${fileId}`);
        const file = await record.handle.getFile();
        return await file.arrayBuffer();
    }

    async getFileWithContent(type, nameOrId) {
        const fileMeta = await this.getFile(type, nameOrId);
        if (!fileMeta) return null;
        const content = await this.getFileContent(type, fileMeta.id);
        return { ...fileMeta, content };
    }

    getStats(type) {
        const files = Array.from(this._fileCache.values()).filter(r => r.type === type);
        const totalBytes = files.reduce((sum, r) => sum + (r.size || 0), 0);
        return { count: files.length, totalBytes };
    }

    async listFolders(_type) {
        return [];
    }

    _readOnlyError() {
        return { error: 'read_only_backend', message: 'Local folder is read-only in v1' };
    }
    async saveFile()    { return this._readOnlyError(); }
    async deleteFile()  { return this._readOnlyError(); }
    async clearFiles()  { return this._readOnlyError(); }
    async createFolder() { return this._readOnlyError(); }
    async renameFolder() { return this._readOnlyError(); }
    async deleteFolder() { return this._readOnlyError(); }
    async moveFile()    { return this._readOnlyError(); }
}

if (typeof window !== 'undefined') {
    window.LocalFolderStorageBackend = LocalFolderStorageBackend;
}
