# Budoucí vylepšení BIM Checker

## Storage optimalizace

### ✅ Implementováno
1. **Separate file storage** (2025-12)
   - Metadata struktury a obsah souborů ukládány odděleně
   - Výrazné zrychlení operací se složkami při velkých souborech
   - save() složek: 20ms místo 3-6s

### 🔮 Pro budoucnost

#### 2. **Incremental updates**
**Popis:** Ukládat pouze změněné části dat místo celého objektu

**Výhody:**
- Ještě rychlejší save() operace
- Menší zátěž na IndexedDB
- Lepší škálovatelnost

**Implementace:**
- Trackovat změny v metadata objektu
- Při save() ukládat jen diff
- Periodicky full save pro konzistenci

**Odhadovaná složitost:** Střední
**Přínos:** Střední (už máme separate storage, takže menší dopad)

---

#### 3. **Lazy loading souborů s cachováním**
**Popis:** Načítat obsah souborů jen když je skutečně potřeba + cache v paměti

**Výhody:**
- Minimální memory footprint
- Rychlejší start aplikace
- Lepší práce s velkými databázemi (stovky souborů)

**Implementace:**
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
        // LRU eviction když cache přeteče
        if (this.currentSize + content.length > this.maxSize) {
            this.evictOldest();
        }
        this.cache.set(fileId, content);
        this.currentSize += content.length;
    }
}
```

**Odhadovaná složitost:** Střední
**Přínos:** Vysoký pro velké databáze

---

#### 4. **Compression (gzip/brotli)**
**Popis:** Komprimovat IFC/IDS soubory před uložením do IndexedDB

**Výhody:**
- 60-80% úspora místa v databázi
- Rychlejší IndexedDB operace (menší data)
- Více souborů se vejde do kvóty

**Implementace:**
```javascript
// Při ukládání:
const compressed = await compress(fileContent);
await idb.set(`file_${id}`, compressed);

// Při načítání:
const compressed = await idb.get(`file_${id}`);
const content = await decompress(compressed);
```

**Knihovny:**
- pako (gzip) - 45KB
- fflate - 8KB, rychlejší

**Odhadovaná složitost:** Nízká
**Přínos:** Vysoký

---

#### 5. **Virtual scrolling pro file tree**
**Popis:** Renderovat jen viditelné položky stromu (pro 1000+ souborů)

**Výhody:**
- Konstantní rychlost renderování bez ohledu na počet souborů
- Lepší UX pro velké projekty

**Implementace:**
- react-window nebo vlastní implementace
- Spočítat viditelnou oblast
- Renderovat jen položky v této oblasti + buffer

**Odhadovaná složitost:** Střední-Vysoká
**Přínos:** Střední (problém jen při velkých databázích)

---

#### 6. **Web Workers pro parsing**
**Popis:** Parsovat IFC/IDS soubory v background threadu

**Výhody:**
- UI zůstává responzivní během parsingu
- Využití multi-core CPU
- Lepší UX při velkých souborech

**Implementace:**
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

**Odhadovaná složitost:** Střední
**Přínos:** Vysoký pro velké soubory (100MB+)

---

#### 7. **IndexedDB batch operations**
**Popis:** Seskupit více operací do jedné transakce

**Výhody:**
- Rychlejší bulk operace
- Menší overhead
- Atomicita operací

**Implementace:**
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

**Odhadovaná složitost:** Nízká
**Přínos:** Střední

---

## Prioritizace

### High Priority (implementovat brzy)
1. ✅ **Separate file storage** - HOTOVO
2. **Compression** - Snadné, velký přínos
3. **Lazy loading s cache** - Pro lepší škálovatelnost

### Medium Priority (podle potřeby)
4. **Web Workers** - Když budou problémy s velkými soubory
5. **Virtual scrolling** - Když bude problém s velkými databázemi

### Low Priority (nice to have)
6. **Incremental updates** - Malý přínos po separate storage
7. **Batch operations** - Optimalizace edge cases

---

## Poznámky
- Separate storage implementováno 2025-12-22
- Testováno s IFC soubory do 150MB
- Výrazné zrychlení operací se složkami

