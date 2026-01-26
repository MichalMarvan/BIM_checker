# Paralelní IDS×IFC Validace - Design Document

**Datum:** 2026-01-26
**Status:** Schváleno
**Autor:** Claude + Michal

## Přehled

Optimalizace IDS×IFC validace pro velké soubory (100MB+) pomocí Web Workers a algoritmických vylepšení. Cílem je 5-15× zrychlení při zachování 100% statické architektury (bez backendu).

## Rozhodnutí z brainstormingu

| Otázka | Rozhodnutí |
|--------|------------|
| Architektura | Hybridní (worker pool pro velké, single worker pro malé) |
| Priorita | Parsing/linking + validace současně |
| Paměť | Streaming s konstantní pamětí (~100-150MB) |
| Data transfer | Transferable Objects |
| Počet workerů | Dynamicky podle `navigator.hardwareConcurrency` |
| Progress UI | Jednoduchý progress + rozbalitelné detaily |
| Práh pro worker pool | 50MB |

## Architektura

```
┌─────────────────────────────────────────────────────────────────┐
│                        MAIN THREAD                               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │ UI / UX     │◄───│ Orchestrator│◄───│ Progress Aggregator │  │
│  └─────────────┘    └──────┬──────┘    └─────────────────────┘  │
│                            │                                     │
│         ┌──────────────────┼──────────────────┐                 │
│         ▼                  ▼                  ▼                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ Worker Pool │    │ Task Queue  │    │ Result      │         │
│  │ Manager     │    │             │    │ Merger      │         │
│  └──────┬──────┘    └─────────────┘    └─────────────┘         │
└─────────┼───────────────────────────────────────────────────────┘
          │ Transferable Objects
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      WORKER THREADS                              │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │
│  │ Worker 1  │  │ Worker 2  │  │ Worker 3  │  │ Worker N  │    │
│  │ Parse +   │  │ Parse +   │  │ Validate  │  │ Validate  │    │
│  │ Validate  │  │ Validate  │  │ Spec 1-3  │  │ Spec 4-6  │    │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Komponenty

- **Orchestrator** - řídí celý proces, rozhoduje o strategii (malý vs velký soubor)
- **Worker Pool Manager** - spravuje dynamický počet workerů podle `hardwareConcurrency`
- **Task Queue** - fronta úloh (parse chunk, validate spec)
- **Result Merger** - slučuje výsledky z workerů do finálního výstupu
- **Progress Aggregator** - sbírá progress z workerů, počítá celkové procento

## Hybridní strategie zpracování

### Malé soubory (<50MB)
```
IFC soubor → 1 Worker → Parse → Validate → Výsledky
```
- Jednoduchý průchod, minimální režie
- Property linking přímo v paměti workeru

### Velké soubory (≥50MB)
```
IFC soubor → Chunking → Worker Pool → Streaming Parse
                                    ↓
                              Index Build (property sets)
                                    ↓
                              Parallel Validation
                                    ↓
                              Merge Results
```

### Více souborů současně
```
IFC 1 (80MB) ──→ Worker 1, 2, 3 (pool)
IFC 2 (15MB) ──→ Worker 4 (single)
IFC 3 (25MB) ──→ Worker 5 (single)
                    ↓
              Paralelní běh všeho
```

## Optimalizace

### 1. Inverzní index pro Property Set Linking

**Problém:** Současný O(n×m) algoritmus - 500k entit × 50k relací = 25 miliard operací

**Řešení:** Inverzní index O(n+m)

```javascript
// FÁZE 1: Build index (jeden průchod relacemi)
const entityToPropertySets = new Map();
for (const rel of relations) {
    for (const entityId of rel.relatedObjects) {
        if (!entityToPropertySets.has(entityId)) {
            entityToPropertySets.set(entityId, []);
        }
        entityToPropertySets.get(entityId).push(rel.propertySetId);
    }
}

// FÁZE 2: Link (jeden průchod entitami)
for (const entity of entities) {
    const psetIds = entityToPropertySets.get(entity.id) || [];
    entity.propertySets = psetIds.map(id => propertySetsMap.get(id));
}
```

**Očekávané zrychlení:** 10-50× pro tuto fázi

### 2. Regex Cache

**Problém:** Opakovaná kompilace regex pro každou entitu

**Řešení:** Singleton cache

```javascript
const regexCache = new Map();

function getCompiledRegex(pattern) {
    if (!regexCache.has(pattern)) {
        regexCache.set(pattern, new RegExp(pattern));
    }
    return regexCache.get(pattern);
}
```

**Očekávané zrychlení:** 10-15%

### 3. Streaming Validation Pipeline

Pro velké soubory validace běží souběžně s parsováním:

```
Čas ────────────────────────────────────────────────────►

Chunk 1:  [===PARSE===]
Chunk 2:       [===PARSE===]
Chunk 3:            [===PARSE===]

Validace:      [==VALIDATE==]
                    [==VALIDATE==]
                         [==VALIDATE==]
```

```javascript
async function* streamParseIFC(fileBuffer) {
    const chunkSize = 5 * 1024 * 1024;  // 5MB chunky
    let offset = 0;

    while (offset < fileBuffer.byteLength) {
        const chunk = fileBuffer.slice(offset, offset + chunkSize);
        const entities = parseChunk(chunk);
        yield entities;
        offset += chunkSize;
    }
}

for await (const entityBatch of streamParseIFC(buffer)) {
    const batchResults = validateBatch(entityBatch, specifications);
    progressReporter.update(batchResults);
}
```

### 4. Paralelní validace specifikací

```javascript
// Paralelní zpracování specifikací
const specPromises = specifications.map((spec, index) => {
    const worker = workerPool.getAvailable();
    return worker.validate(spec, entities);
});
const allResults = await Promise.all(specPromises);
```

## Struktura souborů

### Nové soubory

```
assets/js/
├── workers/
│   ├── ifc-parser.worker.js     # Rozšíření existujícího
│   ├── validation.worker.js     # NOVÝ - validační logika
│   └── worker-pool.js           # NOVÝ - správa workerů
├── common/
│   ├── ifc-stream-parser.js     # Existující, drobné úpravy
│   └── validation-engine.js     # NOVÝ - sdílená validační logika
└── validator.js                 # Refaktor na orchestraci
```

| Soubor | Účel | Odhadovaná velikost |
|--------|------|---------------------|
| `worker-pool.js` | Správa workerů, task queue | ~200 řádků |
| `validation.worker.js` | Validace v background threadu | ~300 řádků |
| `validation-engine.js` | Sdílená logika (main + worker) | ~400 řádků |

### Změny existujících souborů

| Soubor | Změna |
|--------|-------|
| `validator.js` | Orchestrace místo přímé validace |
| `ifc-parser.worker.js` | Podpora chunked parsing |
| `ifc-stream-parser.js` | Inverzní index pro property sets |

## Progress UI

### Základní stav (collapsed)
```
┌─────────────────────────────────────────────────────────┐
│  Validating...                                    63%   │
│  ████████████████████████░░░░░░░░░░░░░░░░░░           │
│                                         [▼ Details]    │
└─────────────────────────────────────────────────────────┘
```

### Rozbalený stav
```
┌─────────────────────────────────────────────────────────┐
│  Validating...                                    63%   │
│  ████████████████████████░░░░░░░░░░░░░░░░░░           │
│                                         [▲ Details]    │
│  ─────────────────────────────────────────────────────  │
│  📄 building-A.ifc (156 MB)          ████████░░  80%   │
│     Parsing: done • Linking: done • Validating         │
│                                                         │
│  📄 building-B.ifc (43 MB)           ██████████  100%  │
│     ✓ Complete                                         │
│                                                         │
│  📄 building-C.ifc (89 MB)           ██░░░░░░░░  20%   │
│     Parsing: 45,231 entities                           │
│                                                         │
│  ⚡ Active workers: 5/7 • Memory: ~340 MB              │
└─────────────────────────────────────────────────────────┘
```

## Error Handling

### Zrušení validace
```javascript
const abortController = new AbortController();

cancelButton.onclick = () => {
    abortController.abort();
    workerPool.terminateAll();
    showMessage("Validace zrušena");
};
```

### Worker failure recovery
```javascript
workerPool.on('error', (error, workerId, task) => {
    console.error(`Worker ${workerId} failed:`, error);

    if (task.retries < 2) {
        task.retries++;
        taskQueue.push(task);  // Re-queue
    } else {
        results.addError(task.file, error.message);
    }
});
```

### Graceful degradation
- Pokud `Worker` není podporován → fallback na sekvenční kód
- Pokud `hardwareConcurrency` není dostupné → default 4 workery

## Očekávané výsledky

| Optimalizace | Zrychlení | Složitost |
|--------------|-----------|-----------|
| Inverzní index (property linking) | 10-50× | Nízká |
| Regex cache | 1.1-1.2× | Nízká |
| Paralelní soubory | 2-4× | Střední |
| Paralelní specifikace | 2-4× | Střední |
| Streaming pipeline | konstantní paměť | Střední |

**Celkové očekávané zrychlení: 5-15×**

## Fáze implementace

| Fáze | Obsah | Závislosti |
|------|-------|------------|
| 1 | Inverzní index + regex cache | Žádné |
| 2 | Worker pool manager | Fáze 1 |
| 3 | Validation worker | Fáze 2 |
| 4 | Streaming parser | Fáze 2 |
| 5 | Orchestrator + progress UI | Fáze 3, 4 |
| 6 | Error handling + cancel | Fáze 5 |

## Omezení

- **100% statické** - žádný backend, běží na Cloudflare Pages
- **Transferable Objects** - ne SharedArrayBuffer (vyžaduje speciální headers)
- **Práh 50MB** - pod tímto limitem single worker, nad worker pool
