/* ===========================================
   BIM CHECKER - IFC VIEWER CORE
   Core classes, state and utility functions
   =========================================== */

// =======================
// VIRTUAL ARRAY (memory optimization)
// =======================
class VirtualArray {
    constructor() {
        this.arrays = [];
    }

    setArrays(arrays) {
        this.arrays = arrays;
    }

    get length() {
        return this.arrays.reduce((sum, arr) => sum + arr.length, 0);
    }

    at(index) {
        let currentIndex = 0;
        for (const arr of this.arrays) {
            if (index < currentIndex + arr.length) {
                return arr[index - currentIndex];
            }
            currentIndex += arr.length;
        }
        return undefined;
    }

    find(callback) {
        for (const arr of this.arrays) {
            const result = arr.find(callback);
            if (result !== undefined) return result;
        }
        return undefined;
    }

    filter(callback) {
        const result = [];
        for (const arr of this.arrays) {
            result.push(...arr.filter(callback));
        }
        return result;
    }

    map(callback) {
        const result = [];
        for (const arr of this.arrays) {
            result.push(...arr.map(callback));
        }
        return result;
    }

    forEach(callback) {
        for (const arr of this.arrays) {
            arr.forEach(callback);
        }
    }

    slice(start, end) {
        const combined = [];
        for (const arr of this.arrays) {
            combined.push(...arr);
        }
        return combined.slice(start, end);
    }

    [Symbol.iterator]() {
        let arrayIndex = 0;
        let itemIndex = 0;
        const arrays = this.arrays;

        return {
            next() {
                while (arrayIndex < arrays.length) {
                    if (itemIndex < arrays[arrayIndex].length) {
                        const value = arrays[arrayIndex][itemIndex];
                        itemIndex++;
                        return { value, done: false };
                    }
                    arrayIndex++;
                    itemIndex = 0;
                }
                return { done: true };
            }
        };
    }

    toArray() {
        const result = [];
        for (const arr of this.arrays) {
            result.push(...arr);
        }
        return result;
    }
}

// =======================
// GLOBAL STATE
// =======================
const ViewerState = {
    loadedFiles: [],
    allData: new VirtualArray(),
    filteredData: [],
    propertySetGroups: {},
    psetOrder: [],
    visiblePsets: {},
    sortColumn: null,
    sortDirection: 'asc',
    searchTerm: '',
    entityFilterValue: '',
    fileFilterValue: '',
    autoScrollInterval: null,
    lockedColumns: [],

    // Pagination
    currentPage: 1,
    pageSize: 500,
    totalPages: 1,

    // Edit mode
    editMode: false,
    selectedEntities: new Set(),
    modifications: {},
    editingCell: null,

    // Spatial tree
    spatialTrees: [],
    currentSpatialTreeIndex: 0,
    expandedNodes: new Set(),
    selectedSpatialIds: null,
    selectedSpatialFileName: null,

    // Constants
    fileColors: ['#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a', '#feca57'],

    // IFC Cache
    ifcCacheDB: null
};

// =======================
// UTILITY FUNCTIONS
// =======================

/**
 * Check if a buffer represents a complete IFC entity.
 * Handles edge case where semicolon might be inside a string.
 */
function isIfcEntityComplete(buffer) {
    if (!buffer.trimEnd().endsWith(';')) {
        return false;
    }

    let inString = false;
    for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] === "'") {
            if (buffer[i + 1] === "'") {
                i++;
                continue;
            }
            inString = !inString;
        }
    }

    return !inString;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateProgress(percent, status) {
    const progressBar = document.getElementById('uploadProgress');
    const loadingStatus = document.getElementById('loadingStatus');

    if (progressBar) {
        progressBar.style.width = Math.min(percent, 100) + '%';
    }
    if (loadingStatus) {
        loadingStatus.textContent = status;
    }
}

function readFileAsync(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// =======================
// IFC FILE CACHE (IndexedDB)
// =======================
async function initIFCCache() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('bim_checker_ifc_cache', 1);

        request.onerror = () => reject(request.error);

        request.onsuccess = () => {
            ViewerState.ifcCacheDB = request.result;
            resolve();
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('ifc_files')) {
                db.createObjectStore('ifc_files', { keyPath: 'fileName' });
            }
        };
    });
}

async function storeIFCContent(fileName, content) {
    if (!ViewerState.ifcCacheDB) await initIFCCache();

    return new Promise((resolve, reject) => {
        const transaction = ViewerState.ifcCacheDB.transaction(['ifc_files'], 'readwrite');
        const store = transaction.objectStore('ifc_files');
        const request = store.put({ fileName, content });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getIFCContent(fileName) {
    if (!ViewerState.ifcCacheDB) await initIFCCache();

    return new Promise((resolve, reject) => {
        const transaction = ViewerState.ifcCacheDB.transaction(['ifc_files'], 'readonly');
        const store = transaction.objectStore('ifc_files');
        const request = store.get(fileName);

        request.onsuccess = () => resolve(request.result?.content || null);
        request.onerror = () => reject(request.error);
    });
}

async function deleteIFCContent(fileName) {
    if (!ViewerState.ifcCacheDB) await initIFCCache();

    return new Promise((resolve, reject) => {
        const transaction = ViewerState.ifcCacheDB.transaction(['ifc_files'], 'readwrite');
        const store = transaction.objectStore('ifc_files');
        const request = store.delete(fileName);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Export to window for other modules
window.VirtualArray = VirtualArray;
window.ViewerState = ViewerState;
window.isIfcEntityComplete = isIfcEntityComplete;
window.escapeHtml = escapeHtml;
window.updateProgress = updateProgress;
window.readFileAsync = readFileAsync;
window.initIFCCache = initIFCCache;
window.storeIFCContent = storeIFCContent;
window.getIFCContent = getIFCContent;
window.deleteIFCContent = deleteIFCContent;
