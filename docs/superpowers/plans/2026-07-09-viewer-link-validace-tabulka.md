# Viewer-link: validátor a tabulka ↔ 3D — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tlačítka „V modelu / Zobrazit ve 3D" ve validátoru a Multi-File tabulce, které živě (BroadcastChannel) nebo deep linkem otevřou 3D viewer, načtou soubory, označí+přiblíží prvek, resp. obarví výsledky validace zeleně/červeně s legendou.

**Architecture:** Sdílený classic-script `window.ViewerLink` (odesílatel: živý kanál + sessionStorage handoff fallback — zrcadlo existujícího 3D→tabulka vzoru), ES modul `viewer-link-receiver.js` na 3D straně (boot `?handoff` + BroadcastChannel, fronta akcí, zajištění souborů, GUID→expressId přes nový `engine.resolveGuids`).

**Tech Stack:** Vanilla JS (validator.js a viewer-ui.js jsou CLASSIC skripty — ne moduly!), BroadcastChannel, sessionStorage, Puppeteer test runner.

**Spec:** `docs/superpowers/specs/2026-07-09-viewer-link-validace-tabulka-design.md` — každý implementátor čte celou (payload schéma, texty, barvy, pojistky).

## Global Constraints

- Barvy: pass `#22c55e`, fail `#ef4444`. Kanál `bim-3d-viewer-link`, okno `bim-3d-viewer`, klíč `bim-3d-viewer-handoff:<Date.now()>:<rand>`, ack timeout **400 ms**.
- dist/ zrcadlení a SW bump (v143 → v144) až v Tasku 7, jednou.
- Testy: nové soubory registrovat v `tests/test-runner.html`; classic skripty se tam přidávají jako `<script src>`; framework bez `.not`; `node tests/run-tests.js`.
- Komentáře/UI česky, escapeHtml na dynamické stringy, žádné zakomentované bloky.
- Commit po tasku + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Pořadí

Sériově 1 → 2 → 3 → 4 → 5 → 6 → 7 (receiver sdílí T3/T4; ostatní soubory disjunktní).

---

### Task 1: Engine `resolveGuids`

**Files:**
- Create: `assets/js/3d/ifc-engine/parser/guid-resolve.js`
- Modify: `assets/js/3d/ifc-engine/index.js` (facáda — nová metoda vedle `search`)
- Test: `tests/test-suites/guid-resolve.test.js` (+ registrace v test-runner.html)

**Interfaces:**
- Produces: `resolveGuidsInIndex(entityIndex, guids: Iterable<string>) → Map<guid, expressId>` (čistá funkce; prozkoumej strukturu `EntityIndex` v `assets/js/3d/ifc-engine/parser/entity-index.js` — jak iterovat entity a kde je GUID; `engine.search` v `index.js:187-232` GUID vrací, opiš přístupovou cestu odtamtud). Iteruj jednou, hledané GUIDy v Setu, skonči jakmile jsou všechny nalezené.
- Produces: facáda `resolveGuids(modelId, guids: string[]) → Map<guid, expressId>` — prázdná Map pro neznámý model; jak facáda drží per-model entityIndex zjisti z implementace `search`.

- [ ] **Step 1: Failing test** (vzor importů z `tests/test-suites/ifc-revolved-solid.test.js:5-9`):

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('guid-resolve — GUID → expressId', () => {
    it('najde existující GUIDy, chybějící vynechá', async () => {
        const [{ parseStepText }, { EntityIndex }, { resolveGuidsInIndex }] = await Promise.all([
            import('../../assets/js/3d/ifc-engine/parser/step-parser.js'),
            import('../../assets/js/3d/ifc-engine/parser/entity-index.js'),
            import('../../assets/js/3d/ifc-engine/parser/guid-resolve.js'),
        ]);
        const ifc = `ISO-10303-21;\nDATA;\n#1=IFCWALL('2O2Fr$t4X7Zf8NOew3FLKr',$,'Stena A',$,$,$,$,$,$);\n#2=IFCDOOR('0Btm5o6XL0IhurFcbfxOQ7',$,'Dvere B',$,$,$,$,$,$,$,$,$,$);\nENDSEC;\nEND-ISO-10303-21;`;
        const { entities } = parseStepText(ifc);
        const idx = new EntityIndex(entities);
        const map = resolveGuidsInIndex(idx, ['2O2Fr$t4X7Zf8NOew3FLKr', 'NEEXISTUJE0000000000ab']);
        expect(map.get('2O2Fr$t4X7Zf8NOew3FLKr')).toBe(1);
        expect(map.has('NEEXISTUJE0000000000ab')).toBe(false);
        expect(map.size).toBe(1);
        // druhý GUID jiného typu
        const map2 = resolveGuidsInIndex(idx, ['0Btm5o6XL0IhurFcbfxOQ7']);
        expect(map2.get('0Btm5o6XL0IhurFcbfxOQ7')).toBe(2);
    });
});
```
(Pokud parseStepText vyžaduje jiný tvar IFC řádků pro extrakci GUID, uprav fixture — GUID musí být první atribut; ověř proti tomu, jak GUID čte `search`.)

- [ ] **Step 2: Registruj + `node tests/run-tests.js`** → FAIL. **Step 3: Implementace** (guid-resolve.js + facáda). **Step 4: Full suite** → PASS (aktuálně 954 testů — po poslední fázi; přesné číslo ověř před začátkem).
- [ ] **Step 5: Commit** `feat(3d): resolveGuids — převod IFC GlobalId na expressId`

---

### Task 2: `assets/js/common/viewer-link.js` (odesílatel)

**Files:**
- Create: `assets/js/common/viewer-link.js` (CLASSIC skript — věší `window.ViewerLink`; ověř konvenci ostatních common skriptů, např. jak se věší `window.BIMStorage` v storage.js)
- Modify: `tests/test-runner.html` (`<script src="../assets/js/common/viewer-link.js"></script>` mezi classic skripty + registrace test suite)
- Test: `tests/test-suites/viewer-link.test.js`

**Interfaces (Produces — přesně tato jména):**
- `ViewerLink.buildElementPayload({ source, fileName, guid, fileId=null }) → payload` (mode 'element', `element` + `files:[{fileId,fileName}]`)
- `ViewerLink.buildElementsPayload({ source, items: [{fileName, guid, fileId?}] }) → payload` (mode 'element', `elements` + `files` dedup dle fileName)
- `ViewerLink.buildValidationPayload({ source, title, items: [{fileName, guid, status}] }) → payload` (mode 'validation'; jen statusy 'pass'/'fail' — jiné vyhoď)
- `ViewerLink.makeHandoffKey() → 'bim-3d-viewer-handoff:<ts>:<rand>'`
- `ViewerLink.send(payload) → Promise<'live'|'opened'>` — dle spec §B: BroadcastChannel `bim-3d-viewer-link`, zpráva `{type:'action', id, payload}`, ack `{type:'ack', id}` do 400 ms → refokus `window.open('', 'bim-3d-viewer')` → `'live'`; timeout → sessionStorage.setItem(key, JSON.stringify(payload)) + `window.open(<url>?handoff=key, 'bim-3d-viewer')` → `'opened'`. URL 3D vieweru: odvodit z `location.pathname` (stránky běží v `pages/` → `'3d-viewer.html?handoff='` relativně funguje z pages/; přidej pojistku: když pathname neobsahuje `/pages/`, použij `'pages/3d-viewer.html?...'`). Kanál po použití zavřít.
- Konstanty exportované na `ViewerLink.CHANNEL`, `ViewerLink.WINDOW_NAME`, `ViewerLink.KEY_PREFIX` (receiver v T3 musí použít TYTÉŽ hodnoty — ale jako ES modul si je definuje sám; udrž je synchronizované a v obou souborech okomentuj křížový odkaz).

- [ ] **Step 1: Failing test:**

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('ViewerLink — payload buildery a klíče', () => {
    it('element payload', () => {
        const p = window.ViewerLink.buildElementPayload({ source: 'validator', fileName: 'a.ifc', guid: 'G1', fileId: 'f1' });
        expect(p.version).toBe(1);
        expect(p.mode).toBe('element');
        expect(p.source).toBe('validator');
        expect(p.element.guid).toBe('G1');
        expect(p.files.length).toBe(1);
        expect(p.files[0].fileId).toBe('f1');
    });
    it('elements payload deduplikuje files', () => {
        const p = window.ViewerLink.buildElementsPayload({ source: 'ifc-viewer', items: [
            { fileName: 'a.ifc', guid: 'G1' }, { fileName: 'a.ifc', guid: 'G2' }, { fileName: 'b.ifc', guid: 'G3' }] });
        expect(p.elements.length).toBe(3);
        expect(p.files.length).toBe(2);
    });
    it('validation payload filtruje statusy', () => {
        const p = window.ViewerLink.buildValidationPayload({ source: 'validator', title: 'Spec 1', items: [
            { fileName: 'a.ifc', guid: 'G1', status: 'pass' }, { fileName: 'a.ifc', guid: 'G2', status: 'fail' },
            { fileName: 'a.ifc', guid: 'G3', status: 'skipped' }] });
        expect(p.validation.items.length).toBe(2);
        expect(p.validation.title).toBe('Spec 1');
    });
    it('makeHandoffKey má prefix a unikátnost', () => {
        const k1 = window.ViewerLink.makeHandoffKey();
        const k2 = window.ViewerLink.makeHandoffKey();
        expect(k1.startsWith('bim-3d-viewer-handoff:')).toBe(true);
        expect(k1 === k2).toBe(false);
    });
});
```

- [ ] **Step 2: Registruj (skript + suite) + spusť** → FAIL. **Step 3: Implementace.** **Step 4: Full suite** → PASS.
- [ ] **Step 5: Commit** `feat: ViewerLink — sdílený odesílatel do 3D vieweru (živě + handoff)`

---

### Task 3: 3D receiver — boot handoff + kanál + element mode

**Files:**
- Create: `assets/js/3d/viewer-link-receiver.js` (ES modul, page layer)
- Modify: `assets/js/3d/viewer-page.js` (import + `initViewerLink(...)` v boot; předat `loadIfcFromStorage` a přístup ke `state.loadedModels`)

**Interfaces:**
- Produces: `initViewerLink({ engine, loadFileByMeta, getLoadedModels })` — `loadFileByMeta(fileMeta) → Promise<modelId>` (= existující `loadIfcFromStorage`, ověř návratovou hodnotu), `getLoadedModels() → Map<modelId, {name, fileId}>` (viewer-page `state.loadedModels`, `viewer-page.js:265`).
- Consumes: `engine.resolveGuids(modelId, guids)` (T1), `engine.selectEntities(items, 'replace')`, `engine.focusEntity(mid, eid)`, `BIMStorage.getFiles('ifc')` + `BIMStorageBackendRestore.ready` vzor (`viewer-handoff.js:35-42, :112`), status pill (najdi, jak viewer-page ukazuje status — `#viewer3dStatus` set — použij existující helper, když je).
- Chování dle spec §C1: `window.name = 'bim-3d-viewer'` (jen když prázdné); boot čtení `?handoff` → sessionStorage get+removeItem → `runAction`; BroadcastChannel `bim-3d-viewer-link` → na `{type:'action', id}` OKAMŽITĚ `postMessage({type:'ack', id})`, pak `runAction(payload)`; `runAction` serializovaná (promise fronta `this._queue = this._queue.then(...)`); zajištění souborů (loaded match fileId→name; storage lookup; chybějící → status warn + pokračovat); mode element: selectEntities + focusEntity (víc prvků: select všech, focus první); status pill „Prvek zvýrazněn z tabulky/validátoru" dle `source`. Neznámý version/mode → console.warn + status, žádný throw.

- [ ] **Step 1: Implementace** (integrace — bez unit testů; validace mode je T4, tady jen element).
- [ ] **Step 2: `node --check` obou souborů + full suite → PASS.**
- [ ] **Step 3: Commit** `feat(3d): viewer-link receiver — handoff boot, živý kanál, skok na prvek`

---

### Task 4: Receiver — validation mode + legenda

**Files:**
- Modify: `assets/js/3d/viewer-link-receiver.js`
- Modify: CSS s `.v3d-drag-tip` — přidej `.v3d-validation-chip` (plovoucí chip nad canvasem, tmavé pozadí, mezera mezi počty, tlačítko ✕)

**Interfaces:**
- Consumes: `engine.highlight([{modelId, expressId, color}])` (ověř formát barvy — hex číslo vs string — podle použití ve viewpoints-panel.js), `engine.clearHighlights()`, `engine.setEntityOpacity(items, alpha)`, `engine.search({modelId})`.
- Chování dle spec §C1.4 + §C2: úklid předchozí validace → highlight pass `#22c55e` / fail `#ef4444` → dim ostatních 0.15 s pojistkou `others.length > 60000` → přeskočit dim + poznámka v chipu; chip „Validace: N ✓ · M ✗ (+ K nenalezeno) [✕ Zrušit]"; Zrušit = clearHighlights + opacity zpět (ulož ztlumené, `setEntityOpacity(items, 1)`) + chip pryč; status pill „Validace: N ✓ / M ✗".

- [ ] **Step 1: Implementace.** **Step 2: `node --check` + full suite → PASS.**
- [ ] **Step 3: Commit** `feat(3d): validace v modelu — zelená/červená, ztlumení, legenda`

---

### Task 5: Validátor — tlačítka

**Files:**
- Modify: `assets/js/validator.js` (`createEntityResultElement` ~:1080, `createIDSResultElement` ~:873, oblast filtrů/hlavičky výsledků)
- Modify: `pages/ids-ifc-validator.html` (`<script src="../assets/js/common/viewer-link.js">` před validator.js; příp. globální tlačítko do markupu, pokud se nevkládá z JS)
- Modify: stylesheet validátoru (najdi přes grep class validátoru) — styl malého tlačítka, pokud neexistuje vhodná třída

**Interfaces:**
- Consumes: `window.ViewerLink.buildElementPayload/buildValidationPayload/send` (T2).
- Chování dle spec §D: 
  - Řádek prvku: doplň `data-file` (fileName) do datasetu (`:1083-1086` oblast) + tlačítko „🧊 V modelu" → `send(buildElementPayload({source:'validator', fileName, guid, fileId}))`; fileId zjisti z toho, jak validátor drží vybrané soubory (má storage picker — prozkoumej `validator.js` výběr souborů; když fileId nelze dohledat, pošli null).
  - Hlavička specifikace: „Zobrazit ve 3D" → validation payload z prvků té specifikace (statusy pass/fail; jiné vynech). Data ber z datové struktury výsledků (window.validationResults / parametry createIDSResultElement — NE škrábáním DOM).
  - Globální tlačítko „Zobrazit vše ve 3D" vedle filtrů: všechny prvky, dedup fileName+guid, fail v ≥1 specifikaci = fail.
  - Feedback po send(): 'live' → krátce „Zobrazeno ve 3D tabu" u tlačítka, 'opened' → „Otevírám 3D viewer…" (mizí po ~2 s).
  - escapeHtml, česky, tlačítka se objeví až s výsledky.
- [ ] **Step 1: Implementace.** **Step 2: `node --check assets/js/validator.js` + full suite → PASS.**
- [ ] **Step 3: Commit** `feat(validator): tlačítka V modelu a Zobrazit ve 3D (zelená/červená)`

---

### Task 6: Multi-File tabulka — tlačítka

**Files:**
- Modify: `assets/js/ifc/viewer-ui.js` (`buildTable` + lišta nástrojů; řádky mají `handoffRowKey = fileName|||guid|||ifcId` `:707-708`, checkboxy dle guid `:506, :956-958`)
- Modify: `pages/ifc-viewer-multi-file.html` (`<script>` viewer-link.js)

**Interfaces:**
- Consumes: `window.ViewerLink.buildElementPayload/buildElementsPayload/send` (T2).
- Chování dle spec §E: úzký sloupec s „🧊" per řádek (nesmí rozbít editaci buněk/řazení/handoff highlight — přidej na konzistentní místo, ověř kliky nekolidují s makeEditable); toolbar tlačítko „🧊 Zobrazit výběr ve 3D" aktivní při ≥1 checkboxu → elements payload zaškrtnutých (dedup); fileId doplň, pokud tabulka drží file metadata (prozkoumej, jak viewer-ui zná soubory — loadPayloadFiles/handoff kontext), jinak null; feedback jako v T5.
- [ ] **Step 1: Implementace.** **Step 2: `node --check assets/js/ifc/viewer-ui.js` + full suite → PASS.**
- [ ] **Step 3: Commit** `feat(ifc-viewer): tlačítka Zobrazit ve 3D z tabulky (živě/deep link)`

---

### Task 7: Finalizace — dist, SW v144, vizuální ověření, PLAN.md

- [ ] **Step 1: dist mirror** — `git diff --name-only <base_T1>..HEAD -- assets pages` → cp do dist/ + diff verify (vč. nových guid-resolve.js, viewer-link.js, viewer-link-receiver.js).
- [ ] **Step 2: SW bump** v143 → v144 v obou sw.js.
- [ ] **Step 3: Full suite** → PASS.
- [ ] **Step 4: Vizuální ověření Chrome MCP** (server 8787, cache-bust vzor z memory):
  (a) 3D viewer s D214 → handoff do tabulky (existující tlačítko) → v tabulce 🧊 u řádku → ŽIVÝ skok (3D tab bez reloadu, prvek přiblížený, status pill); (b) zavřít 3D tab → 🧊 → deep link (nový tab, soubor se načte, prvek přiblížený); (c) validace: vytvoř mini fixture `tests/fixtures/viewer-link-demo.ifc` (pár IfcWall s GUIDy) + `viewer-link-demo.ids` (specifikace, kterou část prvků projde a část ne — vzor IDS vem z existujících testovacích IDS v repu, grep `.ids`), nahraj oba do storage v prohlížeči, spusť validaci na validator stránce, „Zobrazit ve 3D" u specifikace → zelené/červené prvky + legenda + Zrušit funguje; tlačítko u prvku → skok; (d) `list_console_messages` bez chyb. Screenshoty do reportu.
- [ ] **Step 5: PLAN.md** milestone + commit `chore: dist mirror + SW v144 + PLAN.md (viewer-link)`.

## Self-review (provedeno)

- Spec pokrytí: A→T1, B→T2, C1→T3, C1.4+C2→T4, D→T5, E→T6, společné→T7. Bez mezer.
- Typová konzistence: `resolveGuids(modelId, guids)` (T1→T3), `ViewerLink.build*/send` (T2→T5,T6), `initViewerLink({engine, loadFileByMeta, getLoadedModels})` (T3), konstanty kanál/okno/prefix duplikované sender↔receiver s křížovým komentářem (T2↔T3).
- Vědomé volby: konstanty nelze sdílet mezi classic skriptem a ES modulem bez buildu → duplikace s komentářem; test fixture IFC v T1 může chtít úpravu dle parseru (dokumentováno).
