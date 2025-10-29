/* ===========================================
   BIM CHECKER - STORAGE MODULE
   IndexedDB operations for file storage
   =========================================== */

// =======================
// INDEXEDDB WRAPPER
// =======================
class IndexedDBStorage {
    constructor(dbName) {
        this.dbName = dbName;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('storage')) {
                    db.createObjectStore('storage', { keyPath: 'key' });
                }
            };
        });
    }

    async get(key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['storage'], 'readonly');
            const store = transaction.objectStore('storage');
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result?.value);
            request.onerror = () => reject(request.error);
        });
    }

    async set(key, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['storage'], 'readwrite');
            const store = transaction.objectStore('storage');
            const request = store.put({ key, value });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

// =======================
// STORAGE MANAGER
// =======================
class StorageManager {
    constructor(storageKey) {
        this.storageKey = storageKey;
        this.idb = new IndexedDBStorage('bim_checker_storage');
        this.data = null;
        this.ready = false;
    }

    async init() {
        await this.idb.init();
        await this.load();
        this.ready = true;
    }

    async load() {
        const stored = await this.idb.get(this.storageKey);
        if (stored) {
            this.data = stored;
        } else {
            this.data = {
                folders: {
                    root: {
                        id: 'root',
                        name: 'Kořenová složka',
                        parent: null,
                        children: [],
                        files: [],
                        expanded: true
                    }
                },
                files: {}
            };
        }
    }

    async save() {
        try {
            await this.idb.set(this.storageKey, this.data);
            return true;
        } catch (e) {
            console.error('Error saving storage:', e);
            alert('Chyba při ukládání dat!');
            return false;
        }
    }

    // Folder operations
    async createFolder(name, parentId = 'root') {
        const id = 'folder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        this.data.folders[id] = {
            id,
            name,
            parent: parentId,
            children: [],
            files: [],
            expanded: false
        };
        this.data.folders[parentId].children.push(id);
        await this.save();
        return id;
    }

    async renameFolder(folderId, newName) {
        if (this.data.folders[folderId]) {
            this.data.folders[folderId].name = newName;
            await this.save();
            return true;
        }
        return false;
    }

    async deleteFolder(folderId) {
        if (folderId === 'root') return false;
        const folder = this.data.folders[folderId];
        if (!folder) return false;

        // Delete all files in folder
        folder.files.forEach(fileId => delete this.data.files[fileId]);

        // Recursively delete child folders
        folder.children.forEach(childId => this.deleteFolder(childId));

        // Remove from parent
        const parent = this.data.folders[folder.parent];
        if (parent) {
            parent.children = parent.children.filter(id => id !== folderId);
        }

        delete this.data.folders[folderId];
        await this.save();
        return true;
    }

    // File operations
    async addFile(file, folderId = 'root') {
        const id = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        this.data.files[id] = {
            id,
            name: file.name,
            size: file.size,
            content: file.content,
            folder: folderId,
            uploadDate: new Date().toISOString()
        };
        this.data.folders[folderId].files.push(id);
        await this.save();
        return id;
    }

    async deleteFile(fileId) {
        const file = this.data.files[fileId];
        if (!file) return false;

        const folder = this.data.folders[file.folder];
        if (folder) {
            folder.files = folder.files.filter(id => id !== fileId);
        }

        delete this.data.files[fileId];
        await this.save();
        return true;
    }

    async moveFile(fileId, targetFolderId) {
        const file = this.data.files[fileId];
        if (!file || !this.data.folders[targetFolderId]) return false;

        // Remove from old folder
        const oldFolder = this.data.folders[file.folder];
        if (oldFolder) {
            oldFolder.files = oldFolder.files.filter(id => id !== fileId);
        }

        // Add to new folder
        file.folder = targetFolderId;
        this.data.folders[targetFolderId].files.push(fileId);
        await this.save();
        return true;
    }

    async toggleFolder(folderId) {
        if (this.data.folders[folderId]) {
            this.data.folders[folderId].expanded = !this.data.folders[folderId].expanded;
            await this.save();
        }
    }

    getStats() {
        const fileCount = Object.keys(this.data.files).length;
        const totalSize = Object.values(this.data.files).reduce((sum, file) => sum + file.size, 0);
        return { fileCount, totalSize };
    }
}

// Initialize storage DB helper for pages that need direct access
async function initStorageDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('bim_checker_storage', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('storage')) {
                db.createObjectStore('storage', { keyPath: 'key' });
            }
        };
    });
}
