# Future Improvements - BIM Checker

## Storage Optimizations

### ✅ Implemented
1. **Separate file storage** (2025-12)
   - Metadata structure and file contents stored separately
   - Significant speedup of folder operations with large files
   - Folder save(): 20ms instead of 3-6s

### 🔮 Future Enhancements

#### 2. **Incremental updates**
**Description:** Store only changed parts of data instead of the entire object

**Benefits:**
- Even faster save() operations
- Lower IndexedDB load
- Better scalability

**Implementation:**
- Track changes in metadata object
- On save(), store only the diff
- Periodic full save for consistency

**Estimated complexity:** Medium
**Impact:** Medium (already have separate storage, so lower impact)

---

#### 3. **Lazy loading with caching**
**Description:** Load file contents only when actually needed + in-memory cache

**Benefits:**
- Minimal memory footprint
- Faster application startup
- Better handling of large databases (hundreds of files)

**Implementation:**
```javascript
class FileContentCache {
    constructor(maxSize = 100 * 1024 * 1024) { // 100MB cache
        this.cache = new Map();
        this.maxSize = maxSize;
        this.currentSize = 0;
    }

    async get(fileId) {
        if (this.cache.has(fileId)) {
            return this.cache.get(fileId);
        }

        const content = await this.loadFromIndexedDB(fileId);
        this.addToCache(fileId, content);
        return content;
    }

    addToCache(fileId, content) {
        // LRU eviction when cache overflows
        if (this.currentSize + content.length > this.maxSize) {
            this.evictOldest();
        }
        this.cache.set(fileId, content);
        this.currentSize += content.length;
    }
}
```

**Estimated complexity:** Medium
**Impact:** High for large databases

---

#### 4. **Compression (gzip/brotli)**
**Description:** Compress IFC/IDS files before storing in IndexedDB

**Benefits:**
- 60-80% storage space savings
- Faster IndexedDB operations (smaller data)
- More files fit within quota

**Implementation:**
```javascript
// On save:
const compressed = await compress(fileContent);
await idb.set(`file_${id}`, compressed);

// On load:
const compressed = await idb.get(`file_${id}`);
const content = await decompress(compressed);
```

**Libraries:**
- pako (gzip) - 45KB
- fflate - 8KB, faster

**Estimated complexity:** Low
**Impact:** High

---

#### 5. **Virtual scrolling for file tree**
**Description:** Render only visible tree items (for 1000+ files)

**Benefits:**
- Constant rendering speed regardless of file count
- Better UX for large projects

**Implementation:**
- Use react-window or custom implementation
- Calculate visible area
- Render only items in this area + buffer

**Estimated complexity:** Medium-High
**Impact:** Medium (issue only with large databases)

---

#### 6. **Web Workers for parsing**
**Description:** Parse IFC/IDS files in background thread

**Benefits:**
- UI stays responsive during parsing
- Multi-core CPU utilization
- Better UX with large files

**Implementation:**
```javascript
// main thread:
const worker = new Worker('ifc-parser-worker.js');
worker.postMessage({ fileContent, fileName });
worker.onmessage = (e) => {
    const parsedData = e.data;
    updateUI(parsedData);
};

// worker thread:
self.onmessage = (e) => {
    const parsed = parseIFC(e.data.fileContent);
    self.postMessage(parsed);
};
```

**Estimated complexity:** Medium
**Impact:** High for large files (100MB+)

---

#### 7. **IndexedDB batch operations**
**Description:** Group multiple operations into a single transaction

**Benefits:**
- Faster bulk operations
- Lower overhead
- Operation atomicity

**Implementation:**
```javascript
async saveBatch(operations) {
    const tx = this.db.transaction(['storage'], 'readwrite');
    const store = tx.objectStore('storage');

    for (const op of operations) {
        switch(op.type) {
            case 'put': store.put(op.data); break;
            case 'delete': store.delete(op.key); break;
        }
    }

    await tx.complete;
}
```

**Estimated complexity:** Low
**Impact:** Medium

---

## Prioritization

### High Priority (implement soon)
1. ✅ **Separate file storage** - DONE
2. **Compression** - Easy, high impact
3. **Lazy loading with cache** - For better scalability

### Medium Priority (as needed)
4. **Web Workers** - When issues arise with large files
5. **Virtual scrolling** - When issues arise with large databases

### Low Priority (nice to have)
6. **Incremental updates** - Low impact after separate storage
7. **Batch operations** - Edge case optimization

---

## Notes
- Separate storage implemented 2025-12-22
- Tested with IFC files up to 150MB
- Significant speedup of folder operations
