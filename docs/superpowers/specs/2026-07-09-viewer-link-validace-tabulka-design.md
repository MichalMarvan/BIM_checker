# Spec: Propojení validátoru a tabulky s 3D viewerem (viewer-link)

Datum: 2026-07-09 · Větev: `3d-viewer-integration` · Schváleno uživatelem (návrh v konverzaci)

## Cíl

1. **Validátor → 3D:** tlačítko u prvku výsledků („V modelu" — načíst, označit, přiblížit)
   + hromadné „Zobrazit ve 3D" u specifikace i globálně: **prošlé prvky zeleně, neprošlé
   červeně**, ostatní ztlumené, s legendou a tlačítkem Zrušit.
2. **Tabulka (Multi-File viewer) → 3D:** tlačítko u řádku + u výběru — **živý skok** do
   otevřeného 3D tabu (BroadcastChannel, bez reloadu, zachovaný stav), fallback deep link.
3. Index stránka je MIMO rozsah (odloženo, viz memory `index-tools-redesign`).

## Kontext (stav kódu — z průzkumu)

- Existující handoff **3D → tabulka**: `viewer-page.js:517-566` staví payload
  `{version:1, source:'3d-viewer', mode, files:[...], entities:[...]}`, ukládá do
  sessionStorage pod klíč `bim-ifc-viewer-handoff:<ts>:<rand>` a naviguje
  `ifc-viewer-multi-file.html?handoff=<klíč>`. Příjemce `assets/js/ifc/viewer-handoff.js`
  (čtení `?handoff`, `sessionStorage.getItem`+remove, načtení souborů, zvýraznění řádků
  přes `rowKey = fileName|||guid|||ifcId`). **Náš směr je zrcadlo tohoto vzoru.**
- Řádky validátoru (`assets/js/validator.js:1080-1122`, `createEntityResultElement`):
  nesou `data-guid` (IFC GlobalId), `data-entity`, `data-name`, `data-status`; jméno
  souboru je v hlavičce, NE v datasetu. Výsledky drží `window.validationResults`
  (`validator.js:33,307`). Validace se spouští na `pages/ids-ifc-validator.html`
  (`#validateBtn` → `validateAll()`), výsledky do `#resultsList`, hierarchie
  IDS → soubor → specifikace → prvky.
- Tabulka Multi-File (`assets/js/ifc/viewer-ui.js`): řádky s
  `handoffRowKey = fileName|||guid|||ifcId` (`:707-708`), checkboxy vybírají dle guid;
  klik v buňce jen edituje. Žádná cesta zpět do 3D.
- 3D viewer: `loadIfcFromStorage(fileMeta)` (`viewer-page.js:145`),
  `engine.search({modelId})` vrací `{modelId, expressId, ifcType, name, guid}`,
  `engine.selectEntities([{modelId,expressId}],'replace')`, `engine.focusEntity(mid,eid)`,
  `engine.highlight([{modelId,expressId,color}])` + `clearHighlights()`,
  `engine.setEntityOpacity(items, alpha)`, `getModels()` → meta s `modelId` (+ name).
  URL parametry dnes jen `?merged=0`/`?cache=0`. Boot: `viewer-page.js:1128 boot()`.
  Storage ready vzor: `await BIMStorageBackendRestore.ready` + `BIMStorage.init()`
  (`viewer-page.js:588`, `viewer-handoff.js:112`).
- **Chybí:** převod GUID → expressId (engine nemá `findByGuid`; search() guid vrací,
  takže entity index GUIDy zná).

## Část A — Engine: `resolveGuids`

- Čistý helper `resolveGuidsInIndex(entityIndex, guids) → Map<guid, expressId>` — nový
  soubor `assets/js/3d/ifc-engine/parser/guid-resolve.js` NEBO funkce ve vhodném
  existujícím parser modulu (implementátor zvolí dle struktury entityIndex; preferovat
  samostatný malý modul). Iteruje entity jednou, sbírá jen hledané GUIDy (Set), končí
  když má všechny.
- Engine facáda (`index.js`): `resolveGuids(modelId, guids: string[]) → Map<guid, expressId>`
  (prázdná Map pro neznámý model; chybějící GUIDy v mapě prostě nejsou).
- Test (Puppeteer suite): malý IFC přes `parseStepText` + `EntityIndex` (vzor
  `tests/test-suites/ifc-revolved-solid.test.js:5-9`), ověřit nalezení 2 GUIDů
  + chybějící GUID není v mapě.

## Část B — Sdílený modul `assets/js/common/viewer-link.js` (odesílatel)

Classic-script-friendly ES modul? POZOR: validator.js a viewer-ui.js jsou classic
skripty (ne moduly). Řešení: `viewer-link.js` napsat jako classic skript, který věší
API na `window.ViewerLink` (vzor ostatních `assets/js/common/*` souborů — ověřit
konvenci, např. storage.js věší `window.BIMStorage`). Přidat `<script>` do
`pages/ids-ifc-validator.html` a `pages/ifc-viewer-multi-file.html`.

API:
- `ViewerLink.send(payload) → Promise<'live'|'opened'>`
  1. **Živě:** `BroadcastChannel('bim-3d-viewer-link')`, pošle `{type:'action', id:<rand>,
     payload}`, čeká na `{type:'ack', id}` do **400 ms**. Ack → zavolá
     `window.open('', 'bim-3d-viewer')` pro refokus pojmenovaného okna (viz C1) a vrátí
     `'live'`. (Pokud refokus vrátí okno bez `location` přístupu, ignorovat — ack stačí.)
  2. **Fallback:** payload do sessionStorage pod
     `bim-3d-viewer-handoff:<Date.now()>:<rand>` a
     `window.open('pages/3d-viewer.html?handoff=<klíč>', 'bim-3d-viewer')` — relativní
     cesta POZOR: volá se ze stránek v `pages/` → použít správnou relativní cestu
     (`3d-viewer.html` z pages/, ale modul je sdílený → odvodit absolutně z
     `location.pathname` nebo použít kořenově-relativní URL; implementátor vyřeší a otestuje
     z obou stránek). Vrátí `'opened'`.
- Payload (verze 1):
```json
{ "version": 1, "source": "validator" | "ifc-viewer",
  "mode": "element" | "validation",
  "files": [{ "fileId": "...|null", "fileName": "..." }],
  "element": { "fileName": "...", "guid": "..." },
  "elements": [{ "fileName": "...", "guid": "..." }],
  "validation": { "title": "...", "items": [{ "fileName": "...", "guid": "...",
                   "status": "pass" | "fail" }] } }
```
  `element` pro jeden prvek, `elements` pro výběr více prvků (mode `element`),
  `validation.items` pro obarvení. `files` = všechny soubory, které mají být načtené.
- Čisté funkce exportované i pro testy: `buildElementPayload(...)`,
  `buildValidationPayload(...)`, `makeHandoffKey()` — test v Puppeteer suite
  (window.ViewerLink po načtení skriptu, nebo funkce zpřístupnit i jako ES export —
  jednodušší: testovat přes stránku? Ne — psát soubor jako UMD-lite: classic skript,
  který při `typeof module==='undefined'` věší na window; testy načtou přes
  `<script>`? Stávající testy načítají classic skripty přes test-runner.html
  `<script src>` — přidat tam viewer-link.js a testovat `window.ViewerLink.buildElementPayload`.)

## Část C — 3D strana (příjemce)

### C1. `assets/js/3d/viewer-link-receiver.js` (nový, page layer, ES modul)
- `initViewerLink({ engine, loadFileByMeta })` volané z `viewer-page.js` po vytvoření
  enginu (`loadFileByMeta` = existující `loadIfcFromStorage`).
- Boot: `window.name = 'bim-3d-viewer'` (jen když prázdné). Čtení `?handoff=` →
  sessionStorage get+remove → `runAction(payload)`. Poslouchá
  `BroadcastChannel('bim-3d-viewer-link')`: na `{type:'action'}` odpoví okamžitě
  `{type:'ack', id}` a spustí `runAction(payload)`.
- `runAction`:
  1. **Zajistit soubory:** pro každý `files[]` zjistit, zda je načtený — mapovat přes
     `fileId` na `state.loadedModels` (viewer-page drží `{name, fileId}` per model,
     `viewer-page.js:265`) s fallbackem na porovnání jména. Nenačtené: najít ve storage
     (`BIMStorage.getFiles('ifc')`, match fileId → fileName; vzor
     `viewer-handoff.js:35-42`) a `await loadFileByMeta(meta)` postupně. Nenalezené →
     toast/status „Soubor X není ve storage" a pokračovat s dostupnými.
  2. **Rozlišení GUIDů:** per soubor `engine.resolveGuids(modelId, guids)`.
  3. **mode element:** `selectEntities(items, 'replace')` + jeden prvek →
     `focusEntity(mid, eid)`; více prvků → focus na první + select všech (pokud existuje
     fit-to-selection API, použít; jinak focusEntity prvního). Status pill: „Prvek
     zvýrazněn z tabulky/validátoru" (dle `source`).
  4. **mode validation:** `clearHighlights()` → `highlight()` s barvami
     pass `#22c55e`, fail `#ef4444`; **ztlumení ostatních**: posbírat všechny entity
     modelů z payloadu (`engine.search({modelId})`), rozdíl proti validovaným →
     `setEntityOpacity(others, 0.15)`. VÝKONNOSTNÍ POJISTKA: když `others.length > 60000`,
     ztlumení přeskočit (jen obarvit) a do legendy napsat „(ztlumení vynecháno — velký
     model)". Legenda (C2). Status pill: „Validace: N ✓ / M ✗".
  5. Souběh s načítáním: `runAction` se serializuje (jednoduchá promise fronta) —
     druhá akce počká na dokončení první.
- Neznámé `version`/`mode` → console.warn + toast, žádný pád.

### C2. Legenda validace (DOM chip)
- Overlay div nad canvasem (vzor `.v3d-drag-tip` stylů, nová třída `.v3d-validation-chip`):
  „Validace: **N ✓** · **M ✗**" + tlačítko „✕ Zrušit". Zrušit → `clearHighlights()` +
  vrátit opacity (uložit si seznam ztlumených a `setEntityOpacity(items, 1)`) + chip
  odstranit. Nová validation akce nahradí předchozí (nejdřív úklid staré).
- Počty v legendě = počet ROZLIŠENÝCH prvků (po resolveGuids); když se část GUIDů
  nenajde, přidat „(K nenalezeno)".

## Část D — Validátor UI (`assets/js/validator.js` + stylesheet validátoru)

- `createEntityResultElement` (`:1080`): přidat do řádku tlačítko „🧊 V modelu"
  (vpravo, malé). Klik → `ViewerLink.send(buildElementPayload(...))` s fileName
  (row/entita ho zná — POZOR: doplnit `data-file` do datasetu řádku, dnes tam není)
  a guid; `files` s fileId, pokud je validátor zná (prozkoumat, jak validátor drží
  vybrané soubory — má storage picker, fileId dostupné; jinak fileId null a příjemce
  matchuje jménem).
- Hlavička každé **specifikace** (`createIDSResultElement`): tlačítko „Zobrazit ve 3D"
  → validation payload z prvků té specifikace (pass/fail dle jejich statusu; statusy
  jiné než pass/fail — např. skipped/not-applicable — do items NEdávat).
- **Globální** tlačítko nad výsledky (vedle filtrů): „Zobrazit vše ve 3D" → všechny
  prvky napříč specifikacemi; prvek failnutý v ≥1 specifikaci = fail, jinak pass
  (dedup přes fileName+guid).
- Tlačítka disabled, dokud neproběhla validace. Texty česky, escapeHtml.
- Po `send()` krátký status u tlačítka: 'live' → „Zobrazeno ve 3D tabu", 'opened' →
  „Otevírám 3D viewer…".

## Část E — Tabulka Multi-File (`assets/js/ifc/viewer-ui.js` + HTML stránky)

- Do každého řádku tabulky malé tlačítko „🧊" (nový úzký sloupec na začátku/konci —
  implementátor dle struktury `buildTable`; nesmí rozbít editaci buněk ani řazení).
  Klik → element payload z `{fileName, guid}` řádku (fileId: tabulka zná načtené
  soubory — prozkoumat, jak drží file metadata, doplnit když dostupné).
- Do lišty nástrojů tabulky tlačítko „🧊 Zobrazit výběr ve 3D" — aktivní když je ≥1
  checkbox; payload `elements` = zaškrtnuté řádky (dedup), mode element.
- `<script>` pro viewer-link.js do `pages/ifc-viewer-multi-file.html`
  (a `pages/ids-ifc-validator.html` pro část D).

## Společné požadavky

- Zrcadlit do `dist/` (na konci), SW bump (v143 → v144), testy zelené + nové testy
  (guid-resolve, ViewerLink payload buildery), registrace v `tests/test-runner.html`.
- Vizuální ověření Chrome MCP: (a) z 3D vieweru handoff do tabulky → tlačítkem 🧊 zpět
  = ŽIVÝ skok (3D tab otevřený, bez reloadu, prvek přiblížený); (b) deep link fallback —
  zavřít 3D tab, 🧊 znovu → otevře viewer, načte soubor, přiblíží; (c) validace: nahrát
  malý IFC + IDS (vytvořit mini fixture soubory), spustit validaci, „Zobrazit ve 3D" →
  zelené/červené + legenda + Zrušit; (d) konzole bez chyb. Testovací velký model
  D214 pro živý skok, mini fixture pro validaci.
- Komentáře/UI česky, žádné zakomentované bloky, commity odkazují plán.

## Mimo rozsah

Index stránka (odloženo), spouštění validace z 3D vieweru, BCF, focus okna napříč
prohlížečovými profily, přenos výsledků validace do jiných stránek než 3D.
