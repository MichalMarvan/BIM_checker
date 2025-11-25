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
        this.metadata = null; // Lightweight cache without file contents
        this.ready = false;
    }

    async init() {
        await this.idb.init();
        await this.loadMetadata(); // Load metadata first (fast!)
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
                        name: t('storage.rootFolder'),
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

    async loadMetadata() {
        const stored = await this.idb.get(this.storageKey);
        if (stored) {
            // Create lightweight copy without file contents
            this.metadata = {
                folders: stored.folders,
                files: {}
            };

            // Copy only metadata (no content)
            for (let fileId in stored.files) {
                const file = stored.files[fileId];
                this.metadata.files[fileId] = {
                    id: file.id,
                    name: file.name,
                    size: file.size,
                    folder: file.folder,
                    uploadDate: file.uploadDate
                    // content NOT included!
                };
            }

            // Load expanded states from localStorage (instant!)
            this.loadExpandedStates();
        } else {
            this.metadata = {
                folders: {
                    root: {
                        id: 'root',
                        name: t('storage.rootFolder'),
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
            // Refresh metadata cache after save
            await this.loadMetadata();
            return true;
        } catch (e) {
            console.error('Error saving storage:', e);
            ErrorHandler.error(t('msg.storageError'));
            return false;
        }
    }

    // Folder operations
    async createFolder(name, parentId = 'root') {
        // Load full data if not loaded
        if (!this.data) await this.load();

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

        // Update metadata too
        this.metadata.folders[id] = { ...this.data.folders[id] };

        await this.save();
        return id;
    }

    async renameFolder(folderId, newName) {
        if (!this.data) await this.load();

        if (this.data.folders[folderId]) {
            this.data.folders[folderId].name = newName;
            if (this.metadata.folders[folderId]) {
                this.metadata.folders[folderId].name = newName;
            }
            await this.save();
            return true;
        }
        return false;
    }

    async deleteFolder(folderId) {
        if (folderId === 'root') return false;
        if (!this.data) await this.load();

        const folder = this.data.folders[folderId];
        if (!folder) return false;

        // Delete all files in folder
        folder.files.forEach(fileId => {
            delete this.data.files[fileId];
            delete this.metadata.files[fileId];
        });

        // Recursively delete child folders
        folder.children.forEach(childId => this.deleteFolder(childId));

        // Remove from parent
        const parent = this.data.folders[folder.parent];
        if (parent) {
            parent.children = parent.children.filter(id => id !== folderId);
        }

        delete this.data.folders[folderId];
        delete this.metadata.folders[folderId];
        await this.save();
        return true;
    }

    // File operations
    async addFile(file, folderId = 'root') {
        if (!this.data) await this.load();

        const id = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        this.data.files[id] = {
            id,
            name: file.name,
            size: file.size,
            content: file.content,
            folder: folderId,
            uploadDate: new Date().toISOString()
        };

        // Add to metadata (without content)
        this.metadata.files[id] = {
            id,
            name: file.name,
            size: file.size,
            folder: folderId,
            uploadDate: this.data.files[id].uploadDate
        };

        this.data.folders[folderId].files.push(id);
        this.metadata.folders[folderId].files.push(id);

        await this.save();
        return id;
    }

    async deleteFile(fileId) {
        if (!this.data) await this.load();

        const file = this.data.files[fileId];
        if (!file) return false;

        const folder = this.data.folders[file.folder];
        if (folder) {
            folder.files = folder.files.filter(id => id !== fileId);
            if (this.metadata.folders[file.folder]) {
                this.metadata.folders[file.folder].files = this.metadata.folders[file.folder].files.filter(id => id !== fileId);
            }
        }

        delete this.data.files[fileId];
        delete this.metadata.files[fileId];
        await this.save();
        return true;
    }

    async moveFile(fileId, targetFolderId) {
        if (!this.data) await this.load();

        const file = this.data.files[fileId];
        if (!file || !this.data.folders[targetFolderId]) return false;

        // Remove from old folder
        const oldFolder = this.data.folders[file.folder];
        if (oldFolder) {
            oldFolder.files = oldFolder.files.filter(id => id !== fileId);
            if (this.metadata.folders[file.folder]) {
                this.metadata.folders[file.folder].files = this.metadata.folders[file.folder].files.filter(id => id !== fileId);
            }
        }

        // Add to new folder
        file.folder = targetFolderId;
        this.data.folders[targetFolderId].files.push(fileId);
        this.metadata.folders[targetFolderId].files.push(fileId);
        if (this.metadata.files[fileId]) {
            this.metadata.files[fileId].folder = targetFolderId;
        }

        await this.save();
        return true;
    }

    async toggleFolder(folderId) {
        // Toggle in metadata only (fast - no save to IndexedDB!)
        if (this.metadata.folders[folderId]) {
            this.metadata.folders[folderId].expanded = !this.metadata.folders[folderId].expanded;

            // Save expanded states to localStorage (instant!)
            this.saveExpandedStates();
        }
    }

    saveExpandedStates() {
        // Save only expanded states to localStorage (very fast!)
        const expandedStates = {};
        for (let folderId in this.metadata.folders) {
            expandedStates[folderId] = this.metadata.folders[folderId].expanded;
        }
        localStorage.setItem(`${this.storageKey}_expanded`, JSON.stringify(expandedStates));
    }

    loadExpandedStates() {
        // Load expanded states from localStorage
        try {
            const saved = localStorage.getItem(`${this.storageKey}_expanded`);
            if (saved) {
                const expandedStates = JSON.parse(saved);
                for (let folderId in expandedStates) {
                    if (this.metadata.folders[folderId]) {
                        this.metadata.folders[folderId].expanded = expandedStates[folderId];
                    }
                }
            }
        } catch (e) {
            console.error('Failed to load expanded states:', e);
        }
    }

    getStats() {
        // Use metadata for stats (faster, no file contents needed)
        const fileCount = Object.keys(this.metadata.files).length;
        const totalSize = Object.values(this.metadata.files).reduce((sum, file) => sum + file.size, 0);
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

// =======================
// GLOBAL BIMStorage API
// =======================
window.BIMStorage = {
    ifcStorage: null,
    idsStorage: null,
    initialized: false,

    async init() {
        if (this.initialized) return true;

        this.ifcStorage = new StorageManager('ifc_files');
        this.idsStorage = new StorageManager('ids_files');

        await this.ifcStorage.init();
        await this.idsStorage.init();

        this.initialized = true;
        return true;
    },

    async saveFile(type, file, folderId = 'root') {
        if (!this.initialized) await this.init();

        const storage = type === 'ifc' ? this.ifcStorage : this.idsStorage;
        return await storage.addFile(file, folderId);
    },

    async getFiles(type) {
        if (!this.initialized) await this.init();

        const storage = type === 'ifc' ? this.ifcStorage : this.idsStorage;
        if (!storage.data) await storage.load();

        return Object.values(storage.data.files);
    },

    async getFileByName(type, name) {
        const files = await this.getFiles(type);
        return files.find(f => f.name === name) || null;
    },

    async deleteFile(type, fileId) {
        if (!this.initialized) await this.init();

        const storage = type === 'ifc' ? this.ifcStorage : this.idsStorage;
        return await storage.deleteFile(fileId);
    },

    async clearFiles(type) {
        if (!this.initialized) await this.init();

        const storage = type === 'ifc' ? this.ifcStorage : this.idsStorage;
        if (!storage.data) await storage.load();

        // Delete all files
        const fileIds = Object.keys(storage.data.files);
        for (const fileId of fileIds) {
            await storage.deleteFile(fileId);
        }

        return true;
    },

    getStats(type) {
        if (!this.initialized) return { fileCount: 0, totalSize: 0 };

        const storage = type === 'ifc' ? this.ifcStorage : this.idsStorage;
        return storage.getStats();
    }
};
