# Přiblížení na osu + otevření modelu z validace — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-přiblížení kamery na osu po importu LandXML + 🔍 tlačítko u osy; per-soubor tlačítko „🧊 Otevřít model ve 3D" ve validaci, které načte celý model a obarví ho zeleně/červeně.

**Architecture:** `focusAlignment(id)` v engine rámuje kameru na bbox bodů osy (čistý helper `points-bbox.js`); validace přes už hotový viewer-link — `buildValidationPayload` se rozšíří o `files`, aby receiver model načetl.

**Tech Stack:** Vanilla JS (validator.js classic script), Three.js, Puppeteer testy.

**Spec:** `docs/superpowers/specs/2026-07-10-osa-zoom-validace-model-design.md` — každý implementátor čte celou.

## Global Constraints

- dist/ zrcadlení + SW bump (v144 → v145) až v Tasku 5, jednou, v obou `sw.js`.
- Nové UI stringy do `translations.js` (cs+en) kvůli i18n-completeness testu; escapeHtml na dynamické.
- Barvy validace už řeší receiver (pass `#22c55e`/fail `#ef4444`) — v tomto plánu se nemění.
- Testy: nové soubory registrovat v `tests/test-runner.html`; framework bez `.not`; `node tests/run-tests.js`.
- Komentáře/UI česky, žádné zakomentované bloky. Commit po tasku + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Pořadí

Sériově 1 → 2 → 3 → 4 → 5. (Task 1 čistý modul; 2 engine+facáda; 3 panel; 4 validátor+viewer-link; 5 finalizace.)

---

### Task 1: `points-bbox.js` + test

**Files:**
- Create: `assets/js/3d/ifc-engine/viewer/points-bbox.js`
- Test: `tests/test-suites/points-bbox.test.js` (+ registrace v `tests/test-runner.html`)

**Interfaces:**
- Produces: `bboxFromPoints(points) → { min:[x,y,z], max:[x,y,z], center:[x,y,z], maxDim:number } | null`
  — `points` = pole `[x,y,z]` (toleruj i `{x,y,z}`? NE — jen pole čísel, osa je vždy pole trojic).
  Prázdné/nevalidní → `null`; 1 bod → min==max, `maxDim: 0`. Žádný import three.

- [ ] **Step 1: Failing test:**

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('points-bbox — bbox z pole bodů', () => {
    let fn;
    async function bb() {
        if (!fn) ({ bboxFromPoints: fn } = await import('../../assets/js/3d/ifc-engine/viewer/points-bbox.js'));
        return fn;
    }
    it('víc bodů: min/max/center/maxDim', async () => {
        const f = await bb();
        const r = f([[0, 0, 0], [10, 4, 2], [-2, 8, 6]]);
        expect(r.min[0]).toBe(-2); expect(r.max[0]).toBe(10);
        expect(r.min[1]).toBe(0); expect(r.max[1]).toBe(8);
        expect(r.min[2]).toBe(0); expect(r.max[2]).toBe(6);
        expect(r.center[0]).toBe(4); expect(r.center[1]).toBe(4); expect(r.center[2]).toBe(3);
        expect(r.maxDim).toBe(12);  // x rozsah 12 je největší
    });
    it('jeden bod: maxDim 0, min==max', async () => {
        const f = await bb();
        const r = f([[5, 5, 5]]);
        expect(r.maxDim).toBe(0);
        expect(r.min[0]).toBe(5); expect(r.max[0]).toBe(5); expect(r.center[0]).toBe(5);
    });
    it('prázdné / nevalidní → null', async () => {
        const f = await bb();
        expect(f([])).toBe(null);
        expect(f(null)).toBe(null);
        expect(f('x')).toBe(null);
    });
});
```

- [ ] **Step 2: Registruj + `node tests/run-tests.js`** → FAIL (modul chybí). Pozn.: před začátkem zjisti baseline počet testů (`node tests/run-tests.js` → aktuálně 958; nové testy přičti).
- [ ] **Step 3: Implementace** — projít body, min/max po osách, center = (min+max)/2, maxDim = max(rozsahů). Guard na neplatné prvky (přeskočit bod, který není pole 3 čísel; když nezůstane žádný platný → null).
- [ ] **Step 4: Full suite** → PASS. **Step 5: Commit** `feat(3d): bboxFromPoints — bounding box z pole bodů`

---

### Task 2: Engine `focusAlignment`

**Files:**
- Modify: `assets/js/3d/ifc-engine/viewer/viewer-core.js` (nová metoda vedle `fitModel` ~1251; využít `getAlignmentPolyline` ~3345 a `_fitDistance` ~1294)
- Modify: `assets/js/3d/ifc-engine/index.js` (facáda — vedle `fitAll` ~303 / `getAlignmentPolyline` ~436)

**Interfaces:**
- Consumes: `bboxFromPoints` (Task 1) — import do viewer-core.
- Produces: `viewer-core.focusAlignment(alignmentId)` + facáda `index.js focusAlignment(alignmentId)` (guard `this._viewer`). Nakadruje kameru na bbox bodů osy; drží současný směr pohledu (vzor `fitModel` 1259-1266); prázdná/neznámá osa → return bez efektu.

- [ ] **Step 1: Implementace** (bez unit testu — vyžaduje kameru/canvas; ověří se `node --check` + vizuálně v Tasku 5):
  - viewer-core: `focusAlignment(alignmentId) { const pts = this.getAlignmentPolyline(alignmentId); const box = bboxFromPoints(pts); if (!box) return; const center = new THREE.Vector3(...box.center); const distance = this._fitDistance(Math.max(box.maxDim, 0.001), 1.5); let dir = this._camera.position.clone().sub(this._controls.target); if (dir.lengthSq() < 1e-12) dir.set(1,1,1); dir.normalize(); this._camera.position.copy(center).add(dir.multiplyScalar(distance)); this._camera.lookAt(center); this._controls.target.copy(center); this._controls.update(); }` (import `bboxFromPoints` nahoře; `getAlignmentPolyline` vrací pole `[x,y,z]` — ověř skutečný tvar a případně `.map` na world).
  - facáda: `focusAlignment(alignmentId) { if (this._viewer) this._viewer.focusAlignment(alignmentId); }`.
- [ ] **Step 2: `node --check` obou souborů + full suite → PASS.**
- [ ] **Step 3: Commit** `feat(3d): focusAlignment — přiblížení kamery na osu`

---

### Task 3: Panel — auto-zoom + 🔍 tlačítko

**Files:**
- Modify: `assets/js/3d/panels/alignment-panel.js` (`_upload`, `_fromIfc`, řádek osy v `_render` ~54, wiring ~76)

**Interfaces:**
- Consumes: `engine.focusAlignment(id)` (Task 2), `engine.loadAlignment` návrat `{ ids, … }`, `_fromIfc` návrat ids.

- [ ] **Step 1: Implementace:**
  - `_upload`: po úspěšném `this.engine.loadAlignment(xml, {swapXY})` zachytit návrat; z `res.ids` (toleruj i staré pole přes `Array.isArray`) vzít `ids[0]` a po `_render` zavolat `this.engine.focusAlignment?.(ids[0])` (jen když nějaké id přibylo). POZOR: `_applyImport`/`_upload` už návrat používají pro warnings — přidat focus tam, kde jsou ids k dispozici; nezavolat před tím, než engine osu zaregistruje.
  - `_fromIfc`: po úspěšném načtení os z IFC vzít id první úspěšně přidané osy a `focusAlignment?.(id)`.
  - Řádek osy v `_render`: přidat PŘED tlačítko 👁 (`data-act="vis"`) nové:
    `<button class="v3d-panel__item-btn" data-act="zoom" data-id="${a.id}" title="Přiblížit na osu">🔍</button>`.
  - Wiring (vedle `vis`/`rm` v `_render`): `this.host.querySelectorAll('[data-act="zoom"]').forEach(b => b.addEventListener('click', () => this.engine.focusAlignment?.(b.dataset.id)));`.
- [ ] **Step 2: `node --check assets/js/3d/panels/alignment-panel.js` + full suite → PASS.**
- [ ] **Step 3: Commit** `feat(3d): auto-přiblížení na osu po importu + 🔍 tlačítko v panelu`

---

### Task 4: Validátor — per-soubor „Otevřít model ve 3D" + `files` v payloadu

**Files:**
- Modify: `assets/js/common/viewer-link.js` (`buildValidationPayload` — přidat volitelný `files`)
- Modify: `assets/js/validator.js` (`createIFCResultElement` ~1108, nová `collectFileValidationItems`, wiring; použít stávající `buildFileIdMap`/`fileIdForName`/`sendToViewer`)
- Modify: `assets/js/common/translations.js` (nové klíče cs+en)

**Interfaces:**
- Consumes: `ViewerLink.buildValidationPayload({source, title, items, files?})` (rozšířeno zde), `sendToViewer` (validator.js), `buildFileIdMap()`/`fileIdForName` (validator.js).
- Produces: `collectFileValidationItems(ifcResult) → [{fileName, guid, status}]` (dedup guid, fail vyhrává, jen pass/fail).

- [ ] **Step 1: Rozšířit `buildValidationPayload`** — přidat volitelný `files` param:
  signatura `buildValidationPayload({ source, title, items, files = [] })`; do payloadu přidat
  `files: Array.isArray(files) ? files : []` (tvar `[{fileId, fileName}]`, jako u element payloadů).
  Zpětná kompatibilita: chybí-li `files`, prázdné pole (dnešní spec/globální tlačítka fungují dál).
  Aktualizovat i test `tests/test-suites/viewer-link.test.js` (validation payload má nově `files: []` default) — přidat assert `expect(Array.isArray(p.files)).toBe(true)`.
- [ ] **Step 2: `collectFileValidationItems`** v validator.js (vzor `collectAllValidationItems` ~127, zúžený na jeden soubor):
  ```js
  function collectFileValidationItems(ifcResult) {
      const byGuid = new Map();
      const fileName = ifcResult.ifcFileName;
      for (const specResult of (ifcResult.specificationResults || [])) {
          for (const er of (specResult.entityResults || [])) {
              if (er.status !== 'pass' && er.status !== 'fail') continue;
              const prev = byGuid.get(er.guid);
              if (!prev || er.status === 'fail') byGuid.set(er.guid, { fileName: er.fileName || fileName, guid: er.guid, status: er.status });
          }
      }
      return [...byGuid.values()];
  }
  ```
- [ ] **Step 3: Tlačítko** v `createIFCResultElement` (~1108) — přidat do hlavičky souboru (najdi, kde se skládá header IFC souboru; přidej vedle názvu):
  `<button class="viewer-link-btn" data-act="open-model-3d" title="${t('validator.viewer.openModelTitle')}">🧊 ${t('validator.viewer.openModel')}</button>`.
  Wiring (v místě, kde se element vytváří, po `createIFCResultElement` sestaví DOM):
  `el.querySelector('[data-act="open-model-3d"]')?.addEventListener('click', (e) => { e.stopPropagation(); const fileName = ifcResult.ifcFileName; const items = collectFileValidationItems(ifcResult); const files = [{ fileId: fileIdForName(fileName, buildFileIdMap()), fileName }]; sendToViewer(ViewerLink.buildValidationPayload({ source: 'validator', title: fileName, items, files })).then(mode => showViewerLinkFeedback(e.target, mode)); });`
  (ověř skutečná jména helperů `sendToViewer`/`showViewerLinkFeedback` v validator.js z minulé fáze; použij je 1:1. `viewer-link-btn` třída — ověř, že existuje z minulé fáze, jinak přidej styl.)
- [ ] **Step 4: i18n klíče** do translations.js (cs+en): `validator.viewer.openModel` = „Otevřít model ve 3D" / „Open model in 3D"; `validator.viewer.openModelTitle` = „Načíst celý model ve 3D a obarvit výsledky" / „Load whole model in 3D and colour results".
- [ ] **Step 5: `node --check` + full suite → PASS** (viewer-link test upravený, i18n-completeness zelený).
- [ ] **Step 6: Commit** `feat(validator): Otevřít model ve 3D per soubor + files v validation payloadu`

---

### Task 5: Finalizace — dist, SW v145, vizuální ověření, PLAN.md

- [ ] **Step 1: dist mirror** — `git diff --name-only <base_T1>..HEAD -- assets pages` → cp každý do `dist/…` (vč. nového points-bbox.js) + `diff` verify.
- [ ] **Step 2: SW bump** v144 → v145 v obou `sw.js`.
- [ ] **Step 3: Full suite → PASS.**
- [ ] **Step 4: Vizuální ověření Chrome MCP** (server 8787, cache-bust vzor z memory `3d-viewer-debug-setup`):
  (a) načíst model D214, importovat LandXML niveletu (fixture z minulé fáze / ruční — v konverzaci byl `/tmp/test-niveleta.xml`; případně vytvořit) → kamera se sama přiblíží na osu; kliknout 🔍 u osy → přiblíží znovu; (b) na validator stránce nahrát sample.ifc+sample.ids (IndexedDB `bim_checker_storage`, viz memory), spustit validaci, u souboru kliknout „🧊 Otevřít model ve 3D" → 3D načte model + zelená/červená + legenda; (c) `list_console_messages` bez chyb. Screenshoty do reportu.
- [ ] **Step 5: PLAN.md** milestone + commit `chore: dist mirror + SW v145 + PLAN.md (osa zoom, model z validace)`.

## Self-review (provedeno)

- Spec pokrytí: A1→T1+T2, A2→T3, A3→T1, B1→T4, B2→ověřeno předem (receiver už `ensureFiles(payload.files)` volá před oběma módy, viewer-link-receiver.js:147 — proto stačí přidat `files` do payloadu v T4, žádná změna receiveru), společné→T5. Bez mezer.
- Typová konzistence: `bboxFromPoints(points) → {min,max,center,maxDim}|null` (T1→T2); `focusAlignment(id)` (T2→T3); `buildValidationPayload({...,files})` (T4→receiver už čte `payload.files`); `collectFileValidationItems(ifcResult)→[{fileName,guid,status}]` (T4).
- Vědomé volby: B2 nevyžaduje změnu receiveru (ověřeno, `ensureFiles(payload.files || [])` běží před validation módem); proto B2 sloučeno do T4 přes rozšíření payloadu.
