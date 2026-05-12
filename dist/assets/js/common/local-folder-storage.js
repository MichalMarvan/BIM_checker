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
        this._readMtimes = new Map();
        this._initialized = !!rootDirHandle;
    }

    isReadOnly() { return false; }

    async init() { return this._initialized; }

    async connect() {
        if (!LocalFolderStorageBackend.isSupported()) {
            throw new Error('File System Access API not supported in this browser');
        }
        const handle = await window.showDirectoryPicker({ id: 'bim-checker-root', mode: 'readwrite' });
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
        const perm = await handle.queryPermission({ mode: 'readwrite' });
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
        const perm = await handle.requestPermission({ mode: 'readwrite' });
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
        // Build folder tree map: path → { name, parentPath, files: [], subfolders: [], ifcCount, idsCount }
        const folderMap = new Map();
        folderMap.set('', { name: this.rootName || 'root', path: '', parentPath: null, files: [], subfolders: [], ifcCount: 0, idsCount: 0 });

        const ensureFolder = (folderPath) => {
            if (folderMap.has(folderPath)) return folderMap.get(folderPath);
            const parts = folderPath.split('/').filter(Boolean);
            const name = parts[parts.length - 1] || this.rootName || 'root';
            const parentPath = parts.slice(0, -1).join('/');
            const node = { name, path: folderPath, parentPath, files: [], subfolders: [], ifcCount: 0, idsCount: 0 };
            folderMap.set(folderPath, node);
            const parent = ensureFolder(parentPath);
            if (!parent.subfolders.includes(folderPath)) parent.subfolders.push(folderPath);
            return node;
        };

        const walk = async (dirHandle, prefix) => {
            for await (const entry of dirHandle.values()) {
                if (scanned >= maxFiles) { limited = true; return; }
                const path = prefix + entry.name;
                const parentFolderPath = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
                if (entry.kind === 'file') {
                    const ext = entry.name.toLowerCase().split('.').pop();
                    if (ext === 'ifc' || ext === 'ids' || ext === 'xml') {
                        const type = ext === 'ifc' ? 'ifc' : 'ids';
                        let size = 0;
                        try {
                            const file = await entry.getFile();
                            size = file.size;
                        } catch (_) { /* ignore */ }
                        const record = { path, name: entry.name, type, size, handle: entry, folderPath: parentFolderPath };
                        files.push(record);
                        cache.set(path, record);
                        // Add to folder tree
                        const folder = ensureFolder(parentFolderPath);
                        folder.files.push(record);
                        // Propagate counts up the tree
                        let cursor = folder;
                        while (cursor) {
                            if (type === 'ifc') cursor.ifcCount++;
                            else cursor.idsCount++;
                            cursor = cursor.parentPath !== null ? folderMap.get(cursor.parentPath) : null;
                        }
                        scanned++;
                    }
                } else if (entry.kind === 'directory') {
                    ensureFolder(path);
                    await walk(entry, path + '/');
                    if (limited) return;
                }
            }
        };

        await walk(this.root, '');
        this._folderTree = folderMap;

        return {
            files,
            scanned,
            limited,
            warning: scanned > 500
        };
    }

    /**
     * Returns a tree representation filtered for a specific file type (ifc / ids).
     * Only folders that contain at least one file of the requested type
     * (directly or in a descendant) are included.
     */
    getFolderTree(type) {
        if (!this._folderTree) return null;
        const countKey = type === 'ifc' ? 'ifcCount' : 'idsCount';
        const buildNode = (path) => {
            const node = this._folderTree.get(path);
            if (!node) return null;
            if (node[countKey] === 0) return null;
            const files = node.files
                .filter(f => f.type === type)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(f => ({ name: f.name, path: f.path, size: f.size }));
            const subfolders = node.subfolders
                .map(p => buildNode(p))
                .filter(Boolean)
                .sort((a, b) => a.name.localeCompare(b.name));
            return {
                name: node.name,
                path: node.path,
                files,
                subfolders,
                ifcCount: node.ifcCount,
                idsCount: node.idsCount,
                count: node[countKey]
            };
        };
        return buildNode('');
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
        this._readMtimes.set(record.path, file.lastModified);
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

    /**
     * Save edited content back to an existing file.
     * Detects external changes via mtime mismatch (unless force=true).
     * When a conflict is detected (and force=false), the result includes
     * { error: 'conflict_external_change', currentMtime, knownMtime } alongside
     * { ok: true } — the write still proceeds so callers can inspect both outcomes.
     * Use force=true to suppress conflict info entirely.
     */
    async saveFileContent(type, path, content, { force = false } = {}) {
        const record = this._fileCache.get(path)
            || Array.from(this._fileCache.values()).find(r => r.name === path && r.type === type);
        if (!record) return { error: 'file_not_found', message: 'File handle missing — rescan the folder' };

        let conflictInfo = null;
        if (!force && this._readMtimes.has(record.path)) {
            const currentFile = await record.handle.getFile();
            const knownMtime = this._readMtimes.get(record.path);
            if (currentFile.lastModified > knownMtime) {
                conflictInfo = {
                    error: 'conflict_external_change',
                    currentMtime: currentFile.lastModified,
                    knownMtime,
                    message: 'File was modified externally since you opened it'
                };
            }
        }

        try {
            const writable = await record.handle.createWritable();
            await writable.write(content);
            await writable.close();
            const newFile = await record.handle.getFile();
            this._readMtimes.set(record.path, newFile.lastModified);
            record.size = newFile.size;
            return { ok: true, mtime: newFile.lastModified, size: newFile.size, ...conflictInfo };
        } catch (e) {
            return { error: 'write_failed', message: e.message };
        }
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
