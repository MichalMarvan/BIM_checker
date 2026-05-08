# Phase 4 — IFC Parser Web Worker

**Status:** Approved (design phase)
**Date:** 2026-05-08
**Author:** Michal Marvan (with Claude)

## Goal

Přesunout IFC parsing z main threadu do Web Worker poolu. Pro uživatele to znamená: UI zůstává plynulé i během parsing 50 MB IFC souborů, a 4 paralelní soubory se parsují simultánně na 4 jádrech (místo dnešního chunked sekvenčního zpracování). Implementace recykluje existující `WorkerPool` infrastrukturu a vytahuje pure parsing logiku do sdíleného modulu, aby worker i main-thread fallback volaly stejný kód.

## Motivation

Dnešní stav (`validator.js parseIFCFileAsync`):
- Parsing běží na main threadu, chunkovaný `await new Promise(setTimeout(resolve, 0))` každých 1000 řádků
- UI sice neměrzne (yield mezi chunky), ale parsing **využívá jen 1 jádro**
- Pro 4 IFC soubory paralelně (`Promise.all` v `validateAll`) všechny soutěží o 1 jádro

Po Phase 4:
- Worker pool 4 workerů — paralelní parsing across cores
- Main thread free — UI 60 FPS i během parsingu
- 4× 50 MB IFC za ~5 s namísto ~20 s (na 4-jádrovém CPU)

V projektu už existuje:
- `assets/js/workers/ifc-parser.worker.js` (213 řádků, dead code — nikdo neimportuje)
- `assets/js/workers/worker-pool.js` (generic, používá `validation-orchestrator.js`)

Phase 4 napojuje obojí + extrahuje parsing logiku do sdíleného modulu, aby worker i fallback měly jeden zdroj pravdy.

## Non-Goals

- IFC viewer parser (`viewer-parser.js`) — má jinou logiku + jiný output shape; vlastní fáze později
- Virtual scrolling pro strom 1000+ souborů — `VirtualTreeView` čeká, ale dnes není pain
- SharedArrayBuffer / transferable optimization — nestojí to za komplexitu pro náš objem
- Streaming parser pro >200 MB IFC — současný approach (load celý content) stačí

## Architecture

### Komponenty a soubory

```
assets/js/common/
└── ifc-parser-core.js       # NEW: pure sync parser (~150 řádků)

assets/js/workers/
├── ifc-parser.worker.js     # REWRITE: thin wrapper (~30 řádků)
└── worker-pool.js           # UNCHANGED (generic)

assets/js/
└── validator.js             # MOD: parseIFCFileAsync dispatchuje přes WorkerPool

tests/test-suites/
├── ifc-parser-core.test.js              # NEW: ~10 unit testů
├── ifc-parser-backward-compat.test.js   # NEW: ~3 snapshot testy
└── ifc-parser-worker.test.js            # NEW: ~2 integration testů (skip-on-failure)

sw.js                        # MOD: precache ifc-parser-core.js + bump cache version
eslint.config.js             # MOD: declare IFCParserCore global
PLAN.md, CHANGELOG.md        # MOD
dist/                        # sync všeho výše
```

### Závislostní graf

```
[validator.js validateAll]
        ↓
[parseIFCFileAsync(content, fileName)]
   ├── Worker path (preferred):
   │      WorkerPool.submit('PARSE', { content, fileName })
   │             ↓
   │      [ifc-parser.worker.js]
   │      (importScripts: property-set-index.js + ifc-parser-core.js)
   │             ↓
   │      IFCParserCore.parseIFCContent(content, fileName) → entities[]
   │             ↓
   │      postMessage({ taskId, type: 'PARSE_DONE', data: entities })
   │
   └── Fallback (no Worker support, ~0.1 % browsers nebo init failure):
          _parseIFCFileAsyncMainThread(content, fileName)
                 ↓ (existing chunked async path, refaktorovaný použít core)
          IFCParserCore.parseIFCContent ve výsledku
```

### Klíčové vlastnosti

- **Single source of truth** — `IFCParserCore.parseIFCContent` volá worker i main-thread fallback. Žádná drift.
- **Output shape unchanged** — `parseIFCFileAsync` returns array entit ve stejném tvaru jako dnes (`{guid, entity, name, propertySets, fileName, attributes}`). Žádný breaking change pro `validateBatch`, `checkEntityFacet`, atd.
- **Lazy worker pool** — pool se inicializuje při prvním volání `parseIFCFileAsync`, ne při loadu validator.js. Šetří paměť na stránkách, kde se nevaliduje.
- **Graceful fallback** — pokud `WorkerPool` init selže nebo runtime error v workeru, fallback na chunked main-thread path. Existing 425 testů kryjí fallback.
- **Worker pool reuse** — recyklujeme stávající `WorkerPool` třídu (battle-tested ve `validation-orchestrator.js`). Žádný nový infra kód.

## IFCParserCore Module

### `assets/js/common/ifc-parser-core.js`

Čistý sync parser. Žádné DOM, žádný await, žádný global state. Jediný export `IFCParserCore.parseIFCContent`.

```js
/**
 * IFCParserCore — pure synchronous IFC content → entities[] parser.
 * Single source of truth, used by:
 *   - assets/js/workers/ifc-parser.worker.js (worker context, self.IFCParserCore)
 *   - assets/js/validator.js (main thread, _parseIFCFileAsyncMainThread fallback)
 *
 * Output shape matches existing parseIFCFileAsync exactly:
 *   { guid, entity, name, propertySets, fileName, attributes: { Name, GlobalId } }
 */
(function(global) {
    'use strict';

    function parseIFCContent(content, fileName) {
        const lines = content.split('\n');
        const entityMap = new Map();
        const propertySetMap = new Map();
        const relDefinesMap = new Map();

        // Phase 1: collect entities
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || !line.startsWith('#')) continue;
            const match = line.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\((.*)\);?\s*$/i);
            if (!match) continue;
            const [, id, entityType, params] = match;
            entityMap.set(id, { id, type: entityType, params });
        }

        // Phase 2: parse property sets + rel defines
        for (const [id, entity] of entityMap.entries()) {
            if (entity.type === 'IFCPROPERTYSET') {
                propertySetMap.set(id, parsePropertySet(entity.params, entityMap));
            } else if (entity.type === 'IFCRELDEFINESBYPROPERTIES') {
                relDefinesMap.set(id, parseRelDefines(entity.params));
            }
        }

        // Phase 3: inverted index for fast pset lookup
        const propertySetIndex = global.PropertySetIndex.build(relDefinesMap);

        // Phase 4: build entity list
        const entities = [];
        for (const [id, entity] of entityMap.entries()) {
            if (!entity.type.startsWith('IFC')) continue;
            if (entity.type.includes('REL') || entity.type.includes('PROPERTY')) continue;
            if (!entity.params.includes("'")) continue;

            const guid = extractGUID(entity.params);
            const name = extractName(entity.params);
            if (!guid) continue;

            const propertySets = {};
            const psetIds = global.PropertySetIndex.getPropertySetIds(propertySetIndex, id);
            for (const psetId of psetIds) {
                if (propertySetMap.has(psetId)) {
                    const pset = propertySetMap.get(psetId);
                    if (pset && pset.name) {
                        propertySets[pset.name] = pset.properties;
                    }
                }
            }

            entities.push({
                guid,
                entity: entity.type,
                name: name || '-',
                propertySets,
                fileName,
                attributes: { Name: name || '-', GlobalId: guid }
            });
        }

        return entities;
    }

    function extractGUID(params) { /* migrated from validator.js */ }
    function extractName(params) { /* migrated from validator.js */ }
    function parsePropertySet(params, entityMap) { /* migrated from validator.js */ }
    function parseRelDefines(params) { /* migrated from validator.js */ }

    global.IFCParserCore = { parseIFCContent };
})(typeof self !== 'undefined' ? self : window);
```

Helper funkce `extractGUID`, `extractName`, `parsePropertySet`, `parseRelDefines` migrovány z `validator.js` (validator.js je po migraci nemá — volá je přes `IFCParserCore` namespace v fallback).

### Dual-context export

`(typeof self !== 'undefined' ? self : window)` umožňuje import jako `<script>` (browser, `window.IFCParserCore`) i `importScripts` (worker, `self.IFCParserCore`). Stejný pattern jako stávající `validation-engine.js`.

## Worker Rewrite

### `assets/js/workers/ifc-parser.worker.js`

Z 213 řádků na ~30. Single message type `PARSE`.

```js
/**
 * IFC parser worker. Single message type: PARSE.
 * Delegates to IFCParserCore.parseIFCContent for actual work.
 */
importScripts('../common/property-set-index.js');
importScripts('../common/ifc-parser-core.js');

self.onmessage = function(e) {
    const { taskId, type, content, fileName } = e.data;
    if (type !== 'PARSE') return;

    try {
        const entities = self.IFCParserCore.parseIFCContent(content, fileName);
        self.postMessage({ taskId, type: 'PARSE_DONE', data: entities });
    } catch (err) {
        self.postMessage({ taskId, error: err.message || String(err) });
    }
};

self.postMessage({ type: 'READY' });
```

Žádný state mezi requesty — worker je stateless. Pool si reusuje workery, ale každý PARSE call je nezávislý.

## Validator Integration

### Lazy worker pool init

```js
// Top-level, lazy-init on first parseIFCFileAsync call
let _ifcParserPool = null;
let _ifcParserPoolInitialized = false;

function _getIfcParserPool() {
    if (_ifcParserPoolInitialized) return _ifcParserPool;
    _ifcParserPoolInitialized = true;

    if (typeof Worker === 'undefined' || typeof WorkerPool === 'undefined') {
        return null;  // No Worker support → main-thread only
    }

    try {
        const scripts = document.querySelectorAll('script[src*="validator.js"]');
        const validatorSrc = scripts.length ? scripts[0].src : '';
        const baseUrl = validatorSrc.substring(0, validatorSrc.lastIndexOf('/'));
        const workerScript = `${baseUrl}/workers/ifc-parser.worker.js`;
        _ifcParserPool = new WorkerPool({
            workerScript,
            size: Math.min(4, navigator.hardwareConcurrency || 4)
        });
    } catch (e) {
        console.warn('IFC parser worker pool init failed, falling back to main thread:', e);
        _ifcParserPool = null;
    }
    return _ifcParserPool;
}
```

### Dispatch with fallback

```js
async function parseIFCFileAsync(content, fileName) {
    const pool = _getIfcParserPool();
    if (pool) {
        try {
            return await pool.submit('PARSE', { content, fileName });
        } catch (e) {
            console.warn('Worker parse failed, falling back to main thread:', e);
            // fall through to main-thread path
        }
    }
    return await _parseIFCFileAsyncMainThread(content, fileName);
}

async function _parseIFCFileAsyncMainThread(content, fileName) {
    // Refactored to use IFCParserCore.parseIFCContent in chunks
    // Yields to UI thread every 5 MB of processed content via setTimeout(resolve, 0)
    // Existing chunked logic preserved for fallback semantics
    ...
}
```

`WorkerPool.submit(type, data)` API už existuje (potvrzeno na řádku 136 `worker-pool.js`). Vrací Promise resolve s daty z `postMessage`.

## Output Shape — Backward Compat Guarantee

Snapshot-test gate před commitem refaktoru ověří, že `IFCParserCore.parseIFCContent(sample, 'test.ifc')` produkuje **JSON.stringify-identický output** jako stávající `parseIFCFileAsync`. Tři vzorky:

1. `tests/test-data/sample.ifc` (~5 MB synthetic)
2. Inline minimální IFC s IFCWALL + Pset
3. Inline IFC s IFCBUILDINGELEMENTPROXY + Pset (uživatelův reálný case)

Selhání blokuje refaktor.

## Testing

### Existing infra

Custom Jasmine-like framework přes Puppeteer. Po Phase 3a 425 testů.

### Nové unit testy

**`tests/test-suites/ifc-parser-core.test.js`** (~10):
- Namespace exposed na window i self (typeof check)
- Parse minimal valid IFC (1 entity)
- Parse IFC bez DATA sekce → empty array
- Parse 2 entity types (IFCWALL + IFCWALLSTANDARDCASE) → obě v output
- Parse entity bez quoted params → vynechá
- Parse entity s pset → propertySets má klíč
- Output entity má všechny field (guid, entity, name, propertySets, fileName, attributes)
- `attributes.Name === name` a `attributes.GlobalId === guid`
- REL/PROPERTY entity types vynechány v output
- 100-entity IFC parsuje správně

**`tests/test-suites/ifc-parser-backward-compat.test.js`** (~3):
Snapshot porovnání `IFCParserCore.parseIFCContent(sample)` vs. stávající `parseIFCFileAsync(sample)` výsledku — JSON.stringify identical.

**`tests/test-suites/ifc-parser-worker.test.js`** (~2, skip-on-spawn-failure):
- Worker pool spawn + parse minimal IFC + ověřit output shape
- Worker handles malformed input gracefully (throws → reject)

Pokud Puppeteer test environment neumí spawnout worker s relative path (URL resolution issue), tests se markují `xit()` a manuální smoke test pokrývá worker path.

### Manuální benchmark

Po deployi:
- Validator: 5 IFC souborů, každý 5–50 MB
- DevTools Performance recording
- Očekávat: workers active během parsing, UI thread idle, total time ≈ longest single file

### Žádné regrese

Existing 425 testů projde beze změny — `parseIFCFileAsync` API unchanged, output shape unchanged.

## Implementation Order

3 commit checkpointy:

### Krok 1 — Extract IFCParserCore
- `assets/js/common/ifc-parser-core.js` (~150 řádků; parseIFCContent + 4 helpery)
- Update `validator.js`: `_parseIFCFileAsyncMainThread` (renamed, používá IFCParserCore.parseIFCContent v chunked async fallback). Smaže duplicitní helpers.
- `tests/test-suites/ifc-parser-core.test.js` (~10)
- `tests/test-suites/ifc-parser-backward-compat.test.js` (~3 snapshot)
- `tests/test-runner.html`: load core module + 2 suity
- ✓ Checkpoint: 425+~13 testů pass; main-thread parsing identický se stávajícím

### Krok 2 — Worker rewrite + WorkerPool dispatch
- `assets/js/workers/ifc-parser.worker.js`: REWRITE thin wrapper
- `validator.js`: lazy `_ifcParserPool` + `parseIFCFileAsync` dispatch + fallback
- `tests/test-suites/ifc-parser-worker.test.js` (~2; skip-on-failure tolerated)
- ✓ Checkpoint: DevTools Performance ukazuje worker activity; manuální fallback test (rename worker file → ověř fallback flow)

### Krok 3 — PWA + ESLint + docs + push
- `sw.js`: precache `ifc-parser-core.js` + bump cache version
- `eslint.config.js`: declare `IFCParserCore` global
- `PLAN.md`: označit Phase 4 done
- `CHANGELOG.md`: záznam [0.2.4]
- Manuální benchmark
- Push, ověř CI green

## Acceptance Criteria

### Funkční

- ✅ `IFCParserCore.parseIFCContent` exposed na `window` i `self` (worker context)
- ✅ Output shape JSON.stringify-identical s předchozím `parseIFCFileAsync` na 3 vzorcích
- ✅ Worker pool spawne `min(4, hardwareConcurrency)` workerů (default 4)
- ✅ Validator paralelně parsuje IFC přes worker pool — DevTools Performance ukáže `Dedicated Worker` activity
- ✅ Fallback funguje: pokud worker init selže nebo runtime error, parsing běží na main-thread
- ✅ Žádná regrese ve validation flow — existing 425 testů projde

### Performance

- ✅ 50 MB IFC parsed v workeru < 5 s
- ✅ 4× 50 MB IFC paralelně ≈ 5 s (ne 20 s)
- ✅ Main thread frame budget < 16 ms během parsingu (60 FPS UI)

### Code quality

- ✅ `IFCParserCore` čistá knihovna (žádné DOM, žádný global state mimo namespace)
- ✅ Worker tenký (~30 řádků), single PARSE message type
- ✅ `parseIFCFileAsync` je thin dispatcher (~30 řádků); fallback path je `_parseIFCFileAsyncMainThread`
- ✅ Helper funkce (extractGUID/Name/...) jsou jen v IFCParserCore — žádná duplicita

## Rollback Plan

Každý ze 3 kroků = samostatný commit. Krok 1 (extract pure parser) je samostatně funkční bez worker integrace. Krok 2 (worker dispatch) lze revertovat — fallback path zůstane operativní.

V krajním případě (worker bug v produkci, false-negative výsledky validace), dočasně zakážeme worker path explicitně:
```js
function _getIfcParserPool() { return null; }  // hot-fix
```
Validator padne na main-thread fallback, identický flow jako před Phase 4.

## Future Work (mimo Phase 4)

- **IFC viewer parser → worker** — vlastní parser v `viewer-parser.js` (jiný shape), separátní fáze
- **Virtual scrolling** — `VirtualTreeView` čeká, dodáme až pain ≥ 1000 souborů
- **Streaming parser pro >200 MB** — chunked čtení místo full load
- **SharedArrayBuffer optimization** — když objem překročí dnešní práh
- **Phase 3b LRU cache** — cache dekomprimovaného content; v kombinaci s workery dramaticky rychlé re-parsing
