/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
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
        // Bumped on every content change so derived lookups (see findViewerEntityByKey)
        // can cache an index and rebuild only when the data actually changes.
        this.version = 0;
    }

    setArrays(arrays) {
        this.arrays = arrays;
        this.version++;
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
            if (result !== undefined) {
                return result;
            }
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
    handoffFilter: null,
    handoffRowKeys: new Set(),

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
    return window.BIMSafeHTML.escapeHtml(text);
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

function viewerFileKey(fileName, fileId) {
    if (fileId !== undefined && fileId !== null && String(fileId) !== '') {
        return `id:${String(fileId)}`;
    }
    return `name:${String(fileName || '')}`;
}

function viewerEntityKey(itemOrFileName, fileId, guid, ifcId) {
    const item = itemOrFileName && typeof itemOrFileName === 'object' ? itemOrFileName : null;
    const resolvedFileName = item ? item.fileName : itemOrFileName;
    const resolvedFileId = item ? item.fileId : fileId;
    const resolvedGuid = item ? item.guid : guid;
    const resolvedIfcId = item ? (item.ifcId ?? item.expressId) : ifcId;
    const entityPart = resolvedGuid
        ? `guid:${String(resolvedGuid).toLowerCase()}`
        : `express:${String(resolvedIfcId ?? '')}`;
    return `${viewerFileKey(resolvedFileName, resolvedFileId)}|||${entityPart}`;
}

let _entityKeyIndex = null;
let _entityKeyIndexVersion = -1;
let _entityKeyIndexData = null;

function findViewerEntityByKey(key) {
    const state = window.ViewerState || ViewerState;
    const allData = state.allData;
    // Rebuild the index only when the underlying data changes; without this the old
    // code did two full Array.from copies per call, so bulk operations over the
    // selection were O(selected × entities) with a fresh array each iteration.
    if (_entityKeyIndex === null || _entityKeyIndexData !== allData || _entityKeyIndexVersion !== allData.version) {
        _entityKeyIndex = new Map();
        _entityKeyIndexData = allData;
        _entityKeyIndexVersion = allData.version;
        allData.forEach(item => {
            const composite = viewerEntityKey(item);
            if (!_entityKeyIndex.has(composite)) {
                _entityKeyIndex.set(composite, item);
            }
            if (item.guid && !_entityKeyIndex.has(item.guid)) {
                _entityKeyIndex.set(item.guid, item);
            }
        });
    }
    return _entityKeyIndex.get(key) || null;
}

function getViewerModification(item) {
    if (!item) {
        return null;
    }
    return ViewerState.modifications[viewerEntityKey(item)]
        || (item.guid ? ViewerState.modifications[item.guid] : null)
        || null;
}

// =======================
// IFC FILE CACHE (IndexedDB)
// =======================
async function initIFCCache() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('bim_checker_ifc_cache', 2);

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
            if (!db.objectStoreNames.contains('ifc_files_v2')) {
                db.createObjectStore('ifc_files_v2', { keyPath: 'cacheKey' });
            }
        };
    });
}

async function storeIFCContent(fileName, content, fileId) {
    if (!ViewerState.ifcCacheDB) {
        await initIFCCache();
    }

    return new Promise((resolve, reject) => {
        const transaction = ViewerState.ifcCacheDB.transaction(['ifc_files_v2'], 'readwrite');
        const store = transaction.objectStore('ifc_files_v2');
        const cacheKey = viewerFileKey(fileName, fileId);
        const request = store.put({ cacheKey, fileName, fileId: fileId ?? null, content });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getIFCContent(fileName, fileId) {
    if (!ViewerState.ifcCacheDB) {
        await initIFCCache();
    }

    const current = await new Promise((resolve, reject) => {
        const transaction = ViewerState.ifcCacheDB.transaction(['ifc_files_v2'], 'readonly');
        const store = transaction.objectStore('ifc_files_v2');
        const request = store.get(viewerFileKey(fileName, fileId));
        request.onsuccess = () => resolve(request.result?.content || null);
        request.onerror = () => reject(request.error);
    });
    if (current !== null || fileId !== undefined && fileId !== null) {
        return current;
    }

    // Backward compatibility for files cached before cache schema v2.
    return new Promise((resolve, reject) => {
        const transaction = ViewerState.ifcCacheDB.transaction(['ifc_files'], 'readonly');
        const request = transaction.objectStore('ifc_files').get(fileName);
        request.onsuccess = () => resolve(request.result?.content || null);
        request.onerror = () => reject(request.error);
    });
}

async function deleteIFCContent(fileName, fileId) {
    if (!ViewerState.ifcCacheDB) {
        await initIFCCache();
    }

    return new Promise((resolve, reject) => {
        const transaction = ViewerState.ifcCacheDB.transaction(['ifc_files_v2'], 'readwrite');
        const store = transaction.objectStore('ifc_files_v2');
        const request = store.delete(viewerFileKey(fileName, fileId));

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
window.viewerFileKey = viewerFileKey;
window.viewerEntityKey = viewerEntityKey;
window.findViewerEntityByKey = findViewerEntityByKey;
window.getViewerModification = getViewerModification;
window.initIFCCache = initIFCCache;
window.storeIFCContent = storeIFCContent;
window.getIFCContent = getIFCContent;
window.deleteIFCContent = deleteIFCContent;
