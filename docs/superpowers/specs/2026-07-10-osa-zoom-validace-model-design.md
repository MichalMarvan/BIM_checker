# Spec: Přiblížení na osu + otevření modelu z validace (per soubor)

Datum: 2026-07-10 · Větev: `3d-viewer-integration` · Schváleno uživatelem (návrh v konverzaci)

## Cíl

Dva malé přírůstky ke dvěma hotovým fázím:
1. **Přiblížení na osu** (LandXML niveleta): auto-přiblížení kamery po importu + 🔍 tlačítko
   u každé osy v seznamu.
2. **Otevření modelu z validace**: u každého IFC souboru ve výsledcích tlačítko
   „🧊 Otevřít model ve 3D", které přes existující viewer-link načte celý ten model a
   obarví jeho prvky zeleně/červeně (scoped na jeden soubor).

## Kontext (stav kódu)

- Engine framing: `viewer-core.js` `fitAll()` (1218), `fitModel(modelId)` (1251),
  helper `_fitDistance(maxDim, padding)` (1294) — počítá vzdálenost kamery pro daný rozměr,
  drží ortho/persp. `getAlignmentPolyline(alignmentId)` (viewer-core 3345, facáda
  `index.js:436`) vrací pole bodů `[[x,y,z],…]` ve world souřadnicích (po rotaci Z-up→Y-up
  jako model). `computeRobustBbox(meshes)` je bbox helper pro meshe (ne pro pole bodů).
  Facáda má `fitAll()` (index.js:303), NEMÁ `focusAlignment`.
- Alignment panel `assets/js/3d/panels/alignment-panel.js`: řádek osy má tlačítka
  👁 (vis, :54), ✂ (section, :55), ✕ (rm, :56); import přes `_upload` / `_fromIfc`.
  `getAlignments()` vrací `{id, name, length, staStart, staEnd, elementCount, hasProfile}`.
- Validátor `assets/js/validator.js`: viewer-link tlačítka od minulé fáze —
  `buildFileIdMap()` (~:38), `fileIdForName` (~:61), `collectSpecItems(specResult, fileName)`
  (~:116), `collectAllValidationItems()` (~:127, dedup fileName+guid, fail vyhrává),
  per-prvek „🧊 V modelu", per-spec „Zobrazit ve 3D", globální „Zobrazit vše ve 3D"
  (`setupShowAllIn3dButton`). Struktura výsledků: IDS → IFC soubor
  (`createIFCResultElement`, drží `ifcResult.ifcFileName` + `specificationResults`) →
  specifikace (`createSpecificationResultElement`, `specResult.entityResults`) → prvek.
  `sendToViewer(payload)` guarduje `window.ViewerLink`. Nové UI stringy jdou do
  `translations.js` (cs+en) kvůli i18n-completeness testu.
- ViewerLink (`assets/js/common/viewer-link.js`): `buildValidationPayload({source, title,
  items:[{fileName, guid, status}]})` (jen pass/fail), `send(payload)`. Receiver
  (`viewer-link-receiver.js`) validation mode už umí načíst soubor + obarvit + legenda.

## Část A — Přiblížení na osu

### A1. Engine `focusAlignment`
- Čistý helper `bboxFromPoints(points) → { min:[x,y,z], max:[x,y,z], center:[x,y,z],
  maxDim:number } | null` — nový malý modul
  `assets/js/3d/ifc-engine/viewer/points-bbox.js` (testovatelný bez THREE; prázdné/1 bod
  ošetřit: 1 bod → maxDim 0, vrátit box s min==max; prázdné → null).
- `viewer-core.js` `focusAlignment(alignmentId)`:
  `pts = this.getAlignmentPolyline(alignmentId)` (interní varianta / přímo z registru);
  `box = bboxFromPoints(pts)`; když null → return. Nakadrovat kameru na `box.center` +
  `_fitDistance(max(box.maxDim, 0.001), 1.5)`, drží současný směr pohledu (vzor `fitModel`
  1259-1266). Aktualizovat `_controls.target` + `update()`.
- Facáda `index.js`: `focusAlignment(alignmentId)` deleguje (guard `this._viewer`).

### A2. Panel — auto-zoom + tlačítko
- `alignment-panel.js`:
  - **Auto-přiblížení po importu:** `_upload` a `_fromIfc` po úspěchu vezmou id první nově
    přidané osy (loadAlignment vrací `{ ids, … }` — použít `ids[0]`; `_fromIfc` vrací ids
    z `loadAlignmentFromIfc` — vzít první úspěšně přidané) a zavolat
    `this.engine.focusAlignment?.(firstId)`. Když žádná osa nepřibyla, nic.
  - **🔍 tlačítko** v řádku osy (před 👁): `data-act="zoom"` `data-id`, title „Přiblížit na osu"
    → `this.engine.focusAlignment?.(id)`. Wiring vedle stávajících `vis`/`rm`.

### A3. Test
- `tests/test-suites/points-bbox.test.js`: `bboxFromPoints` — víc bodů (min/max/center/maxDim),
  1 bod (maxDim 0), prázdné pole → null. Registrace v test-runner.html.

## Část B — Otevření modelu z validace (per soubor)

### B1. Validátor — per-soubor tlačítko
- `validator.js` `createIFCResultElement` (úroveň IFC souboru): přidat tlačítko
  „🧊 Otevřít model ve 3D" (i18n klíč, cs+en). Klik →
  `sendToViewer(ViewerLink.buildValidationPayload({ source:'validator',
  title:<jméno souboru>, items: collectFileValidationItems(ifcResult) }))`.
- Nová funkce `collectFileValidationItems(ifcResult)`: projít
  `ifcResult.specificationResults[*].entityResults[*]`, dedup dle `guid`
  (fileName je jeden = tento soubor), `fail` vyhrává nad `pass`, statusy jiné než
  pass/fail vynechat. Vrací `[{fileName, guid, status}]`. (Vzor: `collectAllValidationItems`
  ~:127, jen zúžený na jeden soubor; ověřit reálný tvar `ifcResult` —
  `ifcFileName` vs `fileName`, `specificationResults` klíč.)
- Feedback po send() jako u ostatních tlačítek ('live' → „Zobrazeno ve 3D tabu",
  'opened' → „Otevírám 3D viewer…", ~2 s).
- Payload obsahuje `files` implicitně? NE — `buildValidationPayload` NEsestavuje `files`.
  Ověřit: receiver `applyValidationMode` volá `ensureFiles(payload.files || [], ...)` —
  když `files` chybí, ensureFiles nic nenačte a modely se dohledají jen z `getLoadedModels`.
  **Nutné:** buď (a) rozšířit `buildValidationPayload` o odvození `files` z items
  (dedup fileName + fileId přes `buildFileIdMap`), NEBO (b) receiver si soubory odvodí
  z `validation.items[].fileName`. Zvolit (a) — přidat do `buildValidationPayload`
  volitelný `files` param a ve validátoru ho předat (fileName + fileId z `buildFileIdMap`).
  Zpětná kompatibilita: `files` volitelné, default `[]` (dnešní globální/spec tlačítka
  přidat `files` taky, ať načtou model i když není otevřený — dnes spoléhají na již
  načtený; drobné vylepšení v rámci téhle změny).

### B2. Ověřit receiver ensureFiles pro validation
- `viewer-link-receiver.js` `applyValidationMode`: potvrdit, že `ensureFiles(payload.files)`
  proběhne PŘED resolveGuids (aby se model stihl načíst). Pokud dnes validation mode
  `ensureFiles` nevolá, doplnit (stejně jako element mode). Model-load je async — legenda
  a obarvení až po načtení.

## Společné požadavky

- Zrcadlit změněné soubory do `dist/`, SW bump v144 → v145 (obě `sw.js`).
- `viewer-link.js` je v ASSETS_TO_CACHE — po změně bumpnout SW (už řeší v145).
- Testy `node tests/run-tests.js` zelené + nový points-bbox test; i18n-completeness
  musí projít (nové klíče cs+en).
- Vizuální ověření Chrome MCP: (a) import LandXML nivelety → kamera se sama přiblíží na osu;
  🔍 tlačítko přiblíží znovu; (b) validace sample.ifc+sample.ids → „🧊 Otevřít model ve 3D"
  u souboru → 3D načte model + zelená/červená + legenda; (c) konzole bez chyb.
  Testovací osa: malý LandXML (fixture z minulé fáze / ruční), model D214; validace
  na sample.ifc.
- Komentáře/UI česky, escapeHtml na dynamické stringy, žádné zakomentované bloky,
  commity odkazují plán.

## Mimo rozsah

Změny stávajících validačních tlačítek (kromě volitelného `files` do payloadu),
„čisté" otevření modelu bez obarvení, index stránka, zoom na osu+model dohromady.
