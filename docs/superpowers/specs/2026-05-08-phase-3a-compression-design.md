# Phase 3a — IndexedDB File Content Compression

**Status:** Approved (design phase)
**Date:** 2026-05-08
**Author:** Michal Marvan (with Claude)

## Goal

Komprimovat content IFC/IDS souborů v IndexedDB pomocí native CompressionStream API (gzip). Komprese je transparentní — externí konzumenti `BIMStorage.saveFile` / `getFileContent` / `getFileWithContent` dál pracují se string content. Backward compat: existující nezkomprimované soubory zůstanou čitelné, postupně se migrují při dalším save.

## Motivation

IFC soubory jsou textové (STEP-21 / EXPRESS) a velmi dobře komprimovatelné — typicky 60–80 % úspora gzip. Pro běžného uživatele s 5–10 IFC soubory v úložišti to znamená:

- Před: ~50–500 MB v IndexedDB
- Po: ~10–100 MB v IndexedDB

Důsledky:
- Méně místa zabraného v browseru (přátelské pro storage quota)
- Rychlejší IDB I/O (méně dat na disk)
- Žádné dopady na UX kromě milisekundové latence dekomprese

Phase 3a je první ze dvou IndexedDB performance vylepšení. Phase 3b (LRU cache pro dekomprimovaný content) je odložená — nejdřív zjistíme, jestli vůbec ROI ukáže.

## Non-Goals

- LRU cache pro dekomprimovaný content (Phase 3b kandidát)
- Eager migrace existujících souborů (lazy stačí)
- Metadata komprese (folders, file metadata jsou malá JSON)
- Brotli (gzip stačí, brotli vyžaduje opt-in detekci)
- Browser fallback (CompressionStream je v 99 %+ cílových browserů)
- Force-migration UI tlačítko (přidáme, kdyby bylo třeba)

## Architecture

### Komponenty

```
assets/js/common/
├── compression.js     # NEW: Compression namespace (compress, decompress, isGzipped, isSupported)
└── storage.js         # MOD: addFile compresses, getFileContent decompresses
```

### Závislostní graf

```
[BIMStorage.saveFile] ──→ StorageManager.addFile ──→ Compression.compress(text)
                                                       ↓
                                                 IndexedDB.set(key, Uint8Array)

[BIMStorage.getFileContent] ──→ StorageManager.getFileContent ──→ IndexedDB.get(key)
                                                                    ↓
                                                          Compression.decompress(bytes)
                                                                    ↓
                                                              return string
```

### Klíčové vlastnosti

- `Compression` modul je čistá knihovna — žádné DOM side-effects, žádný global state mimo namespace
- Storage layer komprese **schová** — externí konzumenti volají dříve existující API se string content, dál fungují bez změny
- Magic byte detection v `decompress()` — backward compat s legacy nezkomprimovanými daty bez explicitní migrace

### Backward compatibility

V IndexedDB může být content uložený ve třech stavech (po nasazení):
1. **String** (legacy z velmi staré verze) — `decompress(string)` vrátí string
2. **Uint8Array nezkomprimovaný** (legacy mezi-verze, pokud existovala) — `decompress` detekuje absence magic bytes → UTF-8 decode jako plain text
3. **Uint8Array gzip** (nový stav) — magic bytes `0x1f 0x8b` → DecompressionStream

Lazy migrace: write vždy komprimuje. Při dalším save existujícího souboru se přepíše na gzip.

## Compression Module

### `assets/js/common/compression.js`

```js
/**
 * Compression — IFC/IDS file content gzip via native CompressionStream API.
 * Backward compat: decompress() detects gzip magic bytes, falls back to
 * plain-text passthrough for legacy uncompressed bytes/strings.
 */
window.Compression = (function() {
    'use strict';

    const GZIP_MAGIC_1 = 0x1f;
    const GZIP_MAGIC_2 = 0x8b;

    function isSupported() {
        return typeof CompressionStream !== 'undefined'
            && typeof DecompressionStream !== 'undefined';
    }

    function isGzipped(bytes) {
        if (!bytes) return false;
        const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
        return view.length >= 2 && view[0] === GZIP_MAGIC_1 && view[1] === GZIP_MAGIC_2;
    }

    async function compress(text) {
        if (typeof text !== 'string') {
            throw new TypeError('Compression.compress expects a string');
        }
        if (!isSupported()) {
            throw new Error('CompressionStream not supported in this environment');
        }
        const encoded = new TextEncoder().encode(text);
        const stream = new Blob([encoded]).stream()
            .pipeThrough(new CompressionStream('gzip'));
        const blob = await new Response(stream).blob();
        const buffer = await blob.arrayBuffer();
        return new Uint8Array(buffer);
    }

    async function decompress(bytes) {
        if (bytes == null) return '';
        if (typeof bytes === 'string') return bytes;

        const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;

        if (!isGzipped(view)) {
            return new TextDecoder('utf-8').decode(view);
        }

        if (!isSupported()) {
            throw new Error('Cannot decompress: CompressionStream not supported');
        }
        const stream = new Blob([view]).stream()
            .pipeThrough(new DecompressionStream('gzip'));
        const blob = await new Response(stream).blob();
        return await blob.text();
    }

    return { compress, decompress, isGzipped, isSupported };
})();
```

### API

```js
Compression.compress(text)     // (string) → Promise<Uint8Array>
Compression.decompress(bytes)  // (Uint8Array | ArrayBuffer | string | null) → Promise<string>
Compression.isGzipped(bytes)   // (Uint8Array | ArrayBuffer) → boolean
Compression.isSupported()      // () → boolean
```

### Designové volby

**Stream-based, ne sync.** `Blob.stream() → pipeThrough(CompressionStream) → Response.blob()` umožňuje streaming na velkých souborech. Paměť omezená velikostí chunku.

**Magic byte detection.** První 2 bajty `0x1f 0x8b` = gzip. Žádná migrace na úrovni dat — transparentní upgrade přes detekci.

**String passthrough v decompress.** `decompress(string)` → vrátí string. Kryje úplně staré soubory, kde IndexedDB stored content jako string. Po prvním re-save se konvertuje na Uint8Array.

**Žádný compression threshold.** BIM soubory jsou typicky 100 KB+; gzip header overhead (~20 B) zanedbatelný.

## Storage Integration

### Změny v `assets/js/common/storage.js`

**`addFile()`** — komprimuje před uložením:
```js
// PŘED
await this.idb.set(contentKey, file.content).catch(err => ...)

// PO
const compressed = await Compression.compress(file.content);
await this.idb.set(contentKey, compressed).catch(err => ...)
```

**`getFileContent()`** — dekomprimuje při čtení:
```js
// PŘED
async getFileContent(fileId) {
    const contentKey = `${this.storageKey}_file_${fileId}`;
    const content = await this.idb.get(contentKey);
    return content || null;
}

// PO
async getFileContent(fileId) {
    const contentKey = `${this.storageKey}_file_${fileId}`;
    const stored = await this.idb.get(contentKey);
    if (stored == null) return null;
    return await Compression.decompress(stored);
}
```

**Nic víc se ve storage.js neměnu.** `getFileWithContent()` volá `getFileContent()`, takže dostane dekomprimovaný string automaticky. Externí callsites nedotčeny.

### HTML stránky

Každá stránka, která loaduje `storage.js`, musí předtím loadnout `compression.js`. Affected pages:
- `index.html`
- `pages/ids-parser-visualizer.html`
- `pages/ids-ifc-validator.html`
- `pages/ifc-viewer-multi-file.html`

Přidat před existující `<script src="../assets/js/common/storage.js">`:
```html
<script src="../assets/js/common/compression.js"></script>
```

(Pro `index.html` cesta bez `../`.)

### Test runner

`tests/test-runner.html` — přidat:
```html
<script src="../assets/js/common/compression.js"></script>  <!-- before storage.js -->
<script src="test-suites/compression.test.js"></script>      <!-- in suites block -->
```

### PWA service worker

`sw.js` — přidat do precache:
```js
'/assets/js/common/compression.js',
```

Bump cache verzi (`v7` → `v8`).

## Testing

### Existing infra

Custom Jasmine-like framework přes Puppeteer. Po Phase 5 ~404 testů.

### Nové unit testy — `tests/test-suites/compression.test.js` (~12)

| Test | Pokrývá |
|------|---------|
| `isSupported()` returns true in test env | sanity |
| `compress('hello world')` returns Uint8Array starting with `0x1f 0x8b` | gzip header |
| Roundtrip `decompress(await compress('hello'))` returns `'hello'` | basic |
| Roundtrip empty string `''` | edge case |
| Roundtrip 100 KB string with diacritics + special chars | UTF-8 + size |
| Roundtrip realistic IFC-like text (10 KB sample) | realistic |
| `isGzipped(compressed)` → true | detection |
| `isGzipped(plain Uint8Array)` → false | detection |
| `isGzipped(null)` → false | edge |
| `decompress('legacy string')` → `'legacy string'` | string passthrough |
| `decompress(plain Uint8Array of 'hello')` → `'hello'` | non-gzip bytes fallback |
| `compress(123)` throws TypeError | input validation |
| `decompress(invalid gzip bytes)` throws | corruption signal |

### Integration testy — rozšíření existujícího `storage.test.js` (~3 nové)

| Test | Pokrývá |
|------|---------|
| `BIMStorage.saveFile` + `getFileContent` roundtrip preservuje content | e2e |
| Po `saveFile`, raw IDB content (přes `idb.get`) je gzip Uint8Array | komprese probíhá |
| Manuálně uložený plain string content (legacy) je čitelný přes `getFileContent` | backward compat |

### Performance ověření (manual benchmark v plánu)

Manuální krok v implementačním plánu:
- Nahraj 5 MB IFC do storage
- Změř: save time, get time, storage size (DevTools → Application → IndexedDB)
- Očekávaná úspora: ≥ 60 %

## Implementation Order

3 commit checkpointy:

### Krok 1 — Compression modul + testy
- `assets/js/common/compression.js` + `dist/` mirror
- `tests/test-suites/compression.test.js`
- `tests/test-runner.html` update
- ✓ Checkpoint: pure module funguje samostatně, ~12 nových testů pass, storage netknutý

### Krok 2 — Storage integrace + 4 stránky
- `assets/js/common/storage.js`: `addFile` + `getFileContent` use Compression
- 4 HTML pages: load `compression.js` před `storage.js`
- Rozšíření `storage.test.js` o ~3 integration testy
- Sync `dist/`
- ✓ Checkpoint: e2e roundtrip funguje, backward compat ověřená, ~419 testů pass

### Krok 3 — PWA + docs + push
- `sw.js`: precache `compression.js`, bump cache verze
- Manuální benchmark: 5 MB IFC, ověř úsporu ≥ 60 %
- `PLAN.md`: označit Phase 3a done
- `CHANGELOG.md`: záznam [0.2.3]
- Push, ověř CI green

## Acceptance Criteria

### Funkční

- ✅ `Compression` modul exposuje `compress`, `decompress`, `isGzipped`, `isSupported`
- ✅ Save + load přes `BIMStorage` preservuje content přesně (string in == string out)
- ✅ Po nahrání IFC souboru je IndexedDB content gzip-encoded (kontrola magic bytes přímo přes `idb.get`)
- ✅ Legacy soubory uložené před deployem se po reloadu pořád načtou (transparent fallback přes magic-byte detection)
- ✅ Po editaci legacy souboru a re-save je nová verze gzip-encoded (lazy migrace)
- ✅ Žádný breaking change pro externí konzumenty (parser.js, validator.js, viewer-init.js, ids-editor-core.js)

### Performance

- ✅ Storage size 5 MB IFC souboru klesne o ≥ 60 % (typicky na ~1–2 MB)
- ✅ `saveFile` pro 5 MB IFC < 1 s end-to-end (compress + IDB write)
- ✅ `getFileContent` pro 5 MB IFC < 500 ms (IDB read + decompress)
- ✅ Žádná regresní zpomalení v UI: parser.js parseIDS, validator.js validateAll, viewer applyModificationsToIFC

### Backward compat

- ✅ Stávající uživatelé s nezkomprimovanými soubory v IDB mohou je číst po deployi
- ✅ Žádné force-migration UI — postupná, transparentní

### Tests

- ✅ ~12 nových unit testů (compression.test.js) — všechny pass
- ✅ ~3 nové integration testy (storage.test.js) — všechny pass
- ✅ Žádné regrese ve stávajících ~404 testech

## Rollback Plan

Každý ze 3 kroků je samostatný commit. Krok 1 (Compression module) je samostatně funkční bez storage integrace. Krok 2 (storage hooks) lze revertovat — getFileContent fallback na string passthrough zachová čitelnost.

V krajním případě (gzip korupce, neočekávaný edge case) můžeme přepnout `Compression.compress` na no-op (vrátí původní string-encoded Uint8Array bez gzip headeru) — `isGzipped` to detekuje a fallback na UTF-8 decode v `decompress` ho přečte.

## Future Work (mimo Phase 3a)

- **LRU cache pro dekomprimovaný content** (Phase 3b kandidát) — pokud telemetrie ukáže, že uživatelé hodně re-otevírají stejné soubory
- **Brotli compression** — při wider support (typicky lepší ratio než gzip o ~10 %)
- **Force-migration UI tlačítko** — debug menu „migrate all to compressed"
- **Compression progress UI** — pro velmi velké soubory (200+ MB) možná chtít progress bar (out of scope, bude potřeba jen pokud někdo nahraje extrémně velký soubor)
- **Metadata komprese** — folder structure JSON je malé, ale teoreticky lze; nestojí to za komplexitu
