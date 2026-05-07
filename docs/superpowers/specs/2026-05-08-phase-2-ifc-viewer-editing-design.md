# Phase 2 — IFC Viewer: Property/Pset Edit Correctness

**Status:** Approved (design phase)
**Date:** 2026-05-08
**Author:** Michal Marvan (with Claude)

## Goal

Opravit `applyModificationsToIFC` ve vieweru tak, aby správně rozlišoval tři případy úpravy (edit existing, add to existing pset, create new pset) a produkoval validní IFC výstup. Po dokončení uživatelovo přidání property k elementu, který property neměl, ale pset s tím jménem měl, korektně rozšíří existující pset entitu místo vytvoření paralelního.

## Motivation

Dnešní stav (`viewer-init.js:886-1018`):
- Při exportu modifikací se pro každý záznam `state.modifications[guid][psetName][propName]` zkusí `updatePropertyInIFC` (in-place edit, funguje když pset+prop pár existuje a je linkovaný k elementu).
- Když `updatePropertyInIFC` vrátí false, kód **vždy vytvoří novou pset+prop+rel trojici**.

To je správně jen v případě C (element pset nemá vůbec). V případě B (element má pset, ale chybí mu property) vznikne paralelní pset entita — invalidní IFC.

**Uživatelův bug-scénář:** v IFC existuje `Pset_WallCommon` a property `FireRating`, ale jeden element ji v jeho psetu nemá. Při pokusu doplnit `FireRating` na ten element vznikne druhý `Pset_WallCommon` linkovaný k tomuto elementu. Po reloadu má element dvě entity stejného jména — tooly to různě interpretují.

## Non-Goals

- Mazání property/pset z elementu (žádné UI dnes, samostatná feature).
- Editace komplexních value types (`IFCPROPERTYBOUNDEDVALUE`, `IFCPROPERTYTABLEVALUE`, atd.) — pokrýváme jen `IFCPROPERTYSINGLEVALUE` a `IFCQUANTITY*`.
- Změna typu existující property (např. IFCLABEL → IFCREAL).
- Editace IFC modelů s nestandardním whitespace nebo multi-line entitami.
- UI varování při modifikaci sdíleného psetu (nice-to-have do budoucna).
- Tlačítko „izolovat pset před editací" (Future improvement).

## Architecture

### Klasifikace tří case-ů

Pro každý záznam `state.modifications[guid][psetName][propName] = value`:

| Case | Stav před | Akce |
|------|-----------|------|
| **A — edit** | Element má pset, pset má property | In-place edit hodnoty (současné chování zachováno) |
| **B — add-prop** | Element má pset, ale chybí mu property | Přidá nový `IFCPROPERTYSINGLEVALUE` (nebo `IFCQUANTITY*`) + rozšíří `HasProperties` tuple existujícího psetu |
| **C — create-pset** | Element pset nemá | Vytvoří **izolovanou** novou pset entitu (i když existuje stejnojmenná pro jiné elementy) + nový rel |

### Files

```
NEW   assets/js/ifc/ifc-pset-utils.js        # Sdílené utility (parsing/manipulation)
MOD   assets/js/ifc/viewer-init.js           # Refaktor applyModificationsToIFC
MOD   pages/ifc-viewer-multi-file.html       # Load ifc-pset-utils.js před viewer-init.js
MOD   sw.js                                   # Precache + version bump
NEW   tests/test-suites/ifc-pset-utils.test.js
NEW   tests/test-suites/ifc-viewer-modifications.test.js
MOD   tests/test-runner.html                 # Load nové suity
MOD   PLAN.md                                 # Mark Phase 2 done
MOD   CHANGELOG.md
MOD   dist/                                   # Sync všeho výše
```

### `applyModificationsToIFC` flow (po refaktoru)

```
applyModificationsToIFC(content, modifications, fileName)
├── parsed = parseIFCStructure(content)
│   → { entityMap, propertySetMap, propsMap, relDefinesMap, maxId, lines, guidToEntityId }
├── for each (guid, psetName, propName, newValue) in modifications:
│   ├── classification = classifyModification(guid, psetName, propName, parsed)
│   │   → { case: 'edit' | 'add-prop' | 'create-pset', psetEntity?, propEntity?, entityType? }
│   ├── if 'edit':        updatePropertyValueInPlace(modifiedLines, classification, newValue)
│   ├── if 'add-prop':    addPropertyToExistingPset(modifiedLines, parsed, classification, propName, newValue)
│   └── if 'create-pset': createIsolatedPset(parsed, guid, psetName, propName, newValue) → newEntities
├── apply pset/property RENAMES (current logic, untouched)
├── inject newEntities before ENDSEC
└── return modifiedLines.join('\n')
```

## Component Design

### `IfcPsetUtils` (assets/js/ifc/ifc-pset-utils.js)

Pure functions, žádné DOM side-effects, IIFE wrapper, exposed as `window.IfcPsetUtils`.

```js
window.IfcPsetUtils = {
    // "'pset-guid', $, 'Name', $, (#1, #2, #3)" → ["#1", "#2", "#3"]
    parsePsetHasProperties(params),

    // "#100=IFCPROPERTYSET('g',$,'N',$,(#1,#2));"
    // → "#100=IFCPROPERTYSET('g',$,'N',$,(#1,#2,#newId));"
    addPropertyIdToPset(line, newPropId),

    // "#200=IFCPROPERTYSINGLEVALUE('FireRating',$,...)" → "FireRating"
    parsePropertyName(line),

    // Find pset on element by name. Returns pset entity object or null.
    findPsetOnElement(entityId, psetName, relDefinesMap, propertySetMap)
};
```

### Klasifikační logika (`classifyModification` v viewer-init.js)

```
1. entityId = guidToEntityId.get(guid)
2. pset = IfcPsetUtils.findPsetOnElement(entityId, psetName, relDefinesMap, propertySetMap)
3. if pset === null:
     return { case: 'create-pset' }
4. propIdsList = IfcPsetUtils.parsePsetHasProperties(pset.params)
5. for propId in propIdsList:
     prop = propsMap.get(propId)
     if IfcPsetUtils.parsePropertyName(prop.line) === propName:
         return { case: 'edit', propEntity: prop, entityType: pset.type }
6. return { case: 'add-prop', psetEntity: pset, entityType: pset.type }
```

`entityType` rozlišuje `IFCPROPERTYSET` vs `IFCELEMENTQUANTITY`. V case B i C podle něj zvolíme správný typ nového child elementu (`IFCPROPERTYSINGLEVALUE` vs `IFCQUANTITYLENGTH`/`IFCQUANTITYAREA`/atd.).

### Case B handler (`addPropertyToExistingPset`)

```js
function addPropertyToExistingPset(modifiedLines, parsed, classification, propName, newValue) {
    parsed.maxEntityId++;
    const newPropId = parsed.maxEntityId;

    // Pick correct entity type based on parent
    const propLine = classification.entityType === 'IFCELEMENTQUANTITY'
        ? createQuantity(newPropId, propName, newValue)
        : createPropertySingleValue(newPropId, propName, newValue);

    parsed.newEntities.push(propLine);

    // Mutate pset's HasProperties tuple in-place AND in-memory
    const psetEntity = classification.psetEntity;
    const updatedLine = IfcPsetUtils.addPropertyIdToPset(psetEntity.line, newPropId);
    modifiedLines[psetEntity.lineIndex] = updatedLine;
    psetEntity.line = updatedLine;
    psetEntity.params = extractParams(updatedLine);  // for next iteration
}
```

**Kritický detail:** in-memory aktualizace `psetEntity.line` a `.params` je nutná, aby další modifikace stejného (guid, pset) viděly nově přidanou property a klasifikovaly se správně. Bez toho by druhá iterace na stejný pset+nová property zopakovala add-prop a viděla pset jako neobsahující ani tu právě přidanou.

### Case C handler (`createIsolatedPset`)

Současná logika z `applyModificationsToIFC` (řádky 975-996), refaktorovaná do pojmenované funkce. Vždy vytvoří novou pset entitu — žádná detekce „existuje stejnojmenná pset jinde, reuse". Per UX rozhodnutí izolovaný režim.

Pro qto: detekuje by typ z aktuálních modifikací nelze (žádné info, jaký entity type uživatel zamýšlí). Default = `IFCPROPERTYSET` + `IFCPROPERTYSINGLEVALUE`. Když uživatel chce qto, musí jméno odpovídat existujícímu qto v IFC (case A/B path), jinak dostane pset.

## Edge Cases — Explicitní rozhodnutí

| # | Situace | Chování |
|---|---------|---------|
| 1 | Element má víc rels se stejnojmenným psetem | First match wins (dokumentováno v komentáři) |
| 2 | Pset je sdílený (rel.RelatedObjects má víc elementů) v case B | Modifikuje sdílený pset → side effect na ostatní. Uživatel přebírá. Komentář v kódu. |
| 3 | Pset rel ukazuje na neexistující entitu | Fallback case C, console.warn |
| 4 | Element má `IFCELEMENTQUANTITY` se stejným jménem | Klasifikace pracuje stejně, type detekován z entity type, case B/C vyrobí správný entity type |
| 5 | Více modifikací na stejný (guid, pset) | Iterace v current order, in-memory pset state aktualizovaný po každé |
| 6 | Pset entity neexistuje vůbec v IFC | Case C — funguje dnes, beze změny |
| 7 | Property name kolize napříč psety | Žádný problém, modifikace keyed [guid][pset][prop] |
| 8 | Rename pset současně s add-prop | Renames se aplikují **po** modifikacích (současné pořadí). Add-prop pracuje se starým jménem, rename pak přejmenuje výslednou pset entitu. |

## Testing

### Existing infra

Custom Jasmine-like framework (`tests/test-framework.js`) přes Puppeteer. Po Phase 1 ~352 testů procházejí, musí dál.

### Nové unit testy

**`tests/test-suites/ifc-pset-utils.test.js`** (~12 testů):

| Test | Pokrývá |
|------|---------|
| `parsePsetHasProperties` single property | tuple `(#1)` → `["#1"]` |
| ... s více properties | `(#1, #2, #3)` → 3 IDs |
| ... s prázdnou tuple | `()` → `[]` |
| ... s whitespace | `( #1 , #2 )` toleruje |
| `addPropertyIdToPset` na pset s existujícími props | správně přidá `,#newId` |
| ... na pset s prázdnou tuple | `...,());` → `...,(#newId));` |
| ... zachová text za uzavírací závorkou (semicolon, whitespace) | |
| `parsePropertyName` typická property | `IFCPROPERTYSINGLEVALUE('FireRating',...)` → `"FireRating"` |
| ... s escapovanými stringy | `'O''Brien'` → `"O'Brien"` |
| `findPsetOnElement` najde existující pset | typický scénář |
| ... vrátí null když element pset nemá | case C trigger |
| ... rozliší podle jména | první match wins |

**`tests/test-suites/ifc-viewer-modifications.test.js`** (~13 testů):

| Test | Pokrývá |
|------|---------|
| `classifyModification` case A | element + pset + property → `'edit'` |
| `classifyModification` case B | element + pset bez property → `'add-prop'` |
| `classifyModification` case C | element bez psetu → `'create-pset'` |
| `classifyModification` falls to C když rel ukazuje na neexistující pset | edge case 3 |
| `applyModificationsToIFC` case A | in-place edit, IFC validní, hodnota změněna |
| `applyModificationsToIFC` case B | property přidána do správného psetu, prop ID v HasProperties |
| `applyModificationsToIFC` case C | nová pset entita + rel + element v rel.RelatedObjects |
| `applyModificationsToIFC` multi-prop B | 2 properties do stejného psetu — obě v HasProperties po jediném exportu |
| Roundtrip A | export → re-parse → modifikace viditelná |
| Roundtrip B | export → re-parse → nová property uvnitř existujícího psetu |
| Roundtrip C | export → re-parse → nová pset + property |
| Sdílený pset v case B | dokumentovaný side effect — všechny linkované elementy „mají" novou property |
| Qto preservation v case B | `IFCELEMENTQUANTITY` rozšířen o `IFCQUANTITYLENGTH`, ne `IFCPROPERTYSINGLEVALUE` |

Test fixtures = synthetic IFC strings v testovacím souboru, nezávislé na externích souborech.

## Implementation Order

3 commit checkpoints:

### Krok 1 — IfcPsetUtils helpers
- Create `assets/js/ifc/ifc-pset-utils.js`
- Create `tests/test-suites/ifc-pset-utils.test.js`
- Update `tests/test-runner.html`
- Sync `dist/`
- ✓ Checkpoint: pure-function utils samostatně testovatelné, viewer-init.js nezměněný

### Krok 2 — Refaktor classify + applyModificationsToIFC
- Refactor `viewer-init.js` `applyModificationsToIFC`:
  - Extract `parseIFCStructure`
  - Extract `classifyModification`
  - Extract case handlers: `updatePropertyValueInPlace` (existing renamed), `addPropertyToExistingPset` (new), `createIsolatedPset` (existing renamed)
  - Detect entity type for qto/pset preservation
- Create `tests/test-suites/ifc-viewer-modifications.test.js`
- Update `pages/ifc-viewer-multi-file.html` (load ifc-pset-utils.js)
- Update `tests/test-runner.html` (load new test suite)
- Sync `dist/`
- ✓ Checkpoint: tvůj reportovaný bug-scénář dá validní IFC, všechny ~25 nových testů projdou

### Krok 3 — Manual smoke test + docs + PWA + push
- Manual smoke test: edituj 3 scénáře (A/B/C), exportuj, znovu otevři, ověř obsah
- Update `PLAN.md` (mark IFC viewer item from off-plan as done)
- Update `CHANGELOG.md` (entry [0.2.1])
- Update `sw.js` (precache + version bump v4 → v5)
- Push branch, ověř CI green

## Acceptance Criteria

### Funkční

- ✅ Stávajících ~352 testů (Phase 1 + před tím) projde beze změny
- ✅ ~25 nových testů přidáno, všechny zelené
- ✅ Konkrétní bug-scénář (element bez property v existujícím psetu): export vyprodukuje validní IFC s property uvnitř existujícího psetu, ne v paralelním
- ✅ Roundtrip: export → reload → modifikace viditelná na správném místě
- ✅ Žádné duplicitní pset entity v IFC v case B
- ✅ Qto edit zachová `IFCELEMENTQUANTITY`/`IFCQUANTITY*` entity types
- ✅ Sdílený pset v case B se modifikuje sdíleně (dokumentovaný side effect)
- ✅ Všechny tři vstupy (`saveCell`, `applyBulkEdit`, `applyAddPset`) projdou stejnou cestou skrz `applyModificationsToIFC`

### Performance

- ✅ `applyModificationsToIFC` na 5000-entity IFC se 100 modifikacemi < 1 s
- ✅ Klasifikace per modification < 5 ms (Map lookup, žádný full-scan)

### Code quality

- ✅ `IfcPsetUtils` pure library (žádné DOM, žádný global state mimo namespace)
- ✅ `applyModificationsToIFC` rozdělená na funkce ≤ 50 řádků
- ✅ Každá nová funkce má JSDoc s in/out

## Rollback Plan

Každý ze 3 kroků = samostatný commit. Selhání v kroku N → revert commit, návrat do stavu po kroku N-1. Krok 2 je nejrizikovější (refactor + nová logika); pokud selže e2e test, fix v dalším commitu místo revertu.

## Future Work (mimo Phase 2)

Tyto vymezené out-of-scope položky lze řešit jako pozdější fáze:

- **Mazání property/pset z elementu** — žádné UI ani modifications support dnes. Vyžaduje nový modal + nový tvar v `state.modifications` (např. `state.modifications[guid].deletedProps[psetName] = [propNames]`).
- **UI varování při modifikaci sdíleného psetu** — UX přívětivější verze case B, indikátor v edit modalu „tento pset je linkovaný ke X dalším elementům — pokračovat / izolovat".
- **Tlačítko „izolovat pset před editací"** — kloning pset entity před modifikací, takže case B na sdíleném psetu nemá side effect.
- **Editace komplexních value types** — `IFCPROPERTYBOUNDEDVALUE` (rozsah), `IFCPROPERTYTABLEVALUE` (tabulka), `IFCPROPERTYENUMERATEDVALUE` (enum). Vyžaduje rozšíření `state.modifications` shape a nový UI per type.
- **Změna typu existující property** — IFCLABEL → IFCREAL atd. Vyžaduje volbu typu v UI a regenerace prop entity.
- **Tolerantní parser pro nestandardní IFC** — multi-line entity, escape sequences, atd. Vyžaduje předpřipravený parser místo regex.

Žádná z těchto položek nezpůsobí regresi v Phase 2 — jen rozšíří funkcionalitu, kterou současný viewer ani Phase 2 neposkytují.
