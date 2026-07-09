# Měření + snapping, persistence, pohledy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zprovoznit a vyšperkovat měření (4 typy, CAD snap glyfy, rubber-band, seznam se skrýváním), auto-persistence měření+rovin per model (content hash), upgrade pohledů (řezy+měření+náhled) a face-pick indikátor u řezů.

**Architecture:** Měření se přesouvá ze stavu panelu do engine registry (viewer-core) — panel je jen UI; persistence běží v page-layer orchestrátoru nad novým IndexedDB storem; vizuály sdílí nový čistý helper `screen-scale.js`. Snapping zůstává CPU (existující `snapAt` + BVH), mění se jen prezentace.

**Tech Stack:** Vanilla JS ES moduly (bez buildu), Three.js 0.182 (importmap), three-mesh-bvh (už integrované), IndexedDB, Puppeteer test runner (`node tests/run-tests.js`).

**Spec:** `docs/superpowers/specs/2026-07-09-mereni-snapping-persistence-pohledy-design.md` — každý implementátor si přečte celou; plán na ni odkazuje pro plné znění (glyf tabulka, schémata dokumentů, texty).

## Global Constraints

- Žádný build systém; změněné soubory se zrcadlí do `dist/` až v Tasku 11 (ne průběžně).
- Test framework NEMÁ `.not` chaining; nové test soubory registrovat v `tests/test-runner.html`; ES moduly v testech přes `await import('../../assets/js/...')`; před použitím matcheru ověřit v `tests/test-framework.js`, jinak `expect(a < b).toBe(true)` styl.
- Komentáře/UI texty česky, styl okolí, žádné zakomentované bloky.
- SW bump (očekáváno v142 → v143) až v Tasku 11, jednou, v obou `sw.js`.
- Commit po každém tasku, zpráva končí `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Barvy snap typů = stávající `SNAP_TYPE_COLORS` v measure-visuals.js (neměnit).
- Osové barvy ΔX/ΔY/ΔZ: X `0xef4444`, Y `0x22c55e`, Z `0x3b82f6`.

## Pořadí (sériově — sdílené soubory)

`viewer-core.js`: Tasky 3, 6, 8 · `measure-visuals.js`: 2, 3, 4 · `section-visuals.js`: 1, 6 · `measure-panel.js`: 5 · pořadí: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11**. (7 je nezávislý, smí se předsunout, ale sériově na pořadí nezáleží.)

---

### Task 1: `screen-scale.js` + refaktor section-visuals

**Files:**
- Create: `assets/js/3d/ifc-engine/viewer/screen-scale.js`
- Modify: `assets/js/3d/ifc-engine/viewer/section-visuals.js` (`updateHandleScale` — použít helper, chování beze změny)
- Test: `tests/test-suites/screen-scale.test.js` (+ registrace v `tests/test-runner.html`)

**Interfaces:**
- Produces: `worldPerPixel(camera, worldPos, viewportHeightPx) → number` — `camera` je objekt s `isPerspectiveCamera`+`fov`+`position` NEBO `top`+`bottom`+`zoom` (ortho); `worldPos` `[x,y,z]` nebo `{x,y,z}`; NESMÍ vyžadovat instanci THREE.Camera (jen čte vlastnosti; vzdálenost počítat ručně přes hypot).
- Produces: `screenScale(camera, worldPos, viewportHeightPx, targetPx, {min=0.01, max=Infinity} = {}) → number` = `clamp(targetPx * worldPerPixel(...), min, max)`.

- [ ] **Step 1: Failing test:**

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('screen-scale — konstantní velikost na obrazovce', () => {
    let m;
    async function mod() {
        if (!m) m = await import('../../assets/js/3d/ifc-engine/viewer/screen-scale.js');
        return m;
    }
    it('perspektiva: 2·dist·tan(fov/2)/vh', async () => {
        const { worldPerPixel } = await mod();
        const cam = { isPerspectiveCamera: true, fov: 50, position: { x: 0, y: 0, z: 10 } };
        const expected = 2 * 10 * Math.tan((50 * Math.PI / 180) / 2) / 800;
        expect(Math.abs(worldPerPixel(cam, [0, 0, 0], 800) - expected) < 1e-12).toBe(true);
        // worldPos jako objekt
        expect(Math.abs(worldPerPixel(cam, { x: 0, y: 0, z: 0 }, 800) - expected) < 1e-12).toBe(true);
    });
    it('ortho: (top−bottom)/zoom/vh, bez vlivu vzdálenosti', async () => {
        const { worldPerPixel } = await mod();
        const cam = { top: 50, bottom: -50, zoom: 2, position: { x: 0, y: 0, z: 999 } };
        expect(Math.abs(worldPerPixel(cam, [0, 0, 0], 500) - (100 / 2 / 500)) < 1e-12).toBe(true);
    });
    it('screenScale: targetPx × wpp + clamp', async () => {
        const { screenScale } = await mod();
        const cam = { isPerspectiveCamera: true, fov: 50, position: { x: 0, y: 0, z: 10 } };
        const wpp = 2 * 10 * Math.tan((50 * Math.PI / 180) / 2) / 800;
        expect(Math.abs(screenScale(cam, [0, 0, 0], 800, 36) - 36 * wpp) < 1e-12).toBe(true);
        expect(screenScale(cam, [0, 0, 0], 800, 36, { max: 0.1 })).toBe(0.1);
        expect(screenScale(cam, [0, 0, 0], 800, 0.0001, { min: 0.01 })).toBe(0.01);
    });
});
```

- [ ] **Step 2: Registruj + `node tests/run-tests.js`** → FAIL (modul neexistuje).
- [ ] **Step 3: Implementace** — čistý modul (žádný import three). Pak v `section-visuals.js` `updateHandleScale(camera, vh)` nahraď interní výpočet `worldPerPixel` voláním helperu (import nahoře); zachovej stávající target px, clamp `[0.05, 0.4*_lastPlaneSize]` i hover kompozici beze změny.
- [ ] **Step 4: Full suite** → PASS (945+ testů, nic nerozbito).
- [ ] **Step 5: Commit** `refactor(3d)+feat: screen-scale helper, section gizmo ho používá`

---

### Task 2: Snap glyfy + screen-constant markery (measure-visuals)

**Files:**
- Modify: `assets/js/3d/ifc-engine/viewer/measure-visuals.js`

**Interfaces:**
- Consumes: `screenScale` (Task 1).
- Produces: `MeasureVisuals.updateScreenScale(camera, viewportHeightPx)` — per-frame škálování snap preview (~14 px), in-progress markerů (~8 px) a markerů měření (~8 px). `showSnapPreview(point, type)` beze změny signatury, ale vykreslí **glyf dle typu** místo kuličky.

- [ ] **Step 1: Implementace glyfů** — funkce `makeSnapGlyphTexture(type, colorHex)` (canvas 64×64, cache Map type→texture): kresli obrys tvaru čárou 2.5 px (škálováno na 64px canvasu → ~10 px čára) v barvě typu s tmavým halo (nejdřív stejná cesta černá `rgba(0,0,0,0.55)` s lineWidth+3, pak barevná):
  - `vertex` čtverec (rohy 12..52), `midpoint` trojúhelník (vrchol nahoře), `center` kružnice r 20,
  - `edge` bowtie ⋈ (dva trojúhelníky špičkami k sobě: (12,16)-(32,32)-(12,48) a (52,16)-(32,32)-(52,48)),
  - `perpendicular` pravoúhlá značka (L: (16,12)→(16,48)→(52,48) + malý čtverec 16,32→32,48),
  - `intersection` × (dvě diagonály), `surface` plná tečka r 6.
  Snap preview = `THREE.Sprite` s `SpriteMaterial({ map, depthTest:false, transparent:true })`, renderOrder 999; při `showSnapPreview` vyměň materiálovou mapu dle typu (cache materiálů per typ, nedisposovat mapy při přepnutí).
- [ ] **Step 2: `updateScreenScale(camera, vh)`** — importuj `screenScale`; nastav `sprite.scale.set(s, s, 1)` kde `s = screenScale(camera, pos, vh, 14)`; markery (in-progress i v subgroupách měření — SphereGeometry nech, poloměr geometrie změň na 1 a škáluj mesh `setScalar(screenScale(...px 8...)/2)`). Ulož si seznam škálovatelných objektů (`this._scalables = Set` s `{obj, px}`), ať je update levný.
- [ ] **Step 3: `node --check` + full suite** → PASS. (Vizuální kontrola až v Tasku 11.)
- [ ] **Step 4: Commit** `feat(3d): CAD snap glyfy + screen-constant markery měření`

---

### Task 3: Engine registry měření (viewer-core + facáda + visuals API)

**Files:**
- Modify: `assets/js/3d/ifc-engine/viewer/viewer-core.js` (nové metody vedle měřicích delegací ~2650-2740; `pickEdgeAt` ~1437; render smyčka — vedle `updateHandleScale` hooku)
- Modify: `assets/js/3d/ifc-engine/index.js` (facáda)
- Modify: `assets/js/3d/ifc-engine/viewer/measure-visuals.js` (jen: oprava volání + `setMeasurementVisible`)
- Test: `tests/test-suites/measure-registry.test.js` (+ registrace)

**Interfaces:**
- Produces (viewer-core i facáda, 1:1):
  - `addMeasurement({ type:'distance'|'edge'|'angle'|'area', points:[[x,y,z]...], label?, modelId? }) → string` — id `ms_<n>`; value/unit počítá engine: distance a edge = `measure-math.distance(p0,p1)` m; angle = `measureAngle` °; area = `measureArea` m². `edge` se počítá jako distance (2 body).
  - `getMeasurements() → [{ id, type, points(kopie), value, unit, label, visible, modelId }]`
  - `removeMeasurement(id)`, `clearMeasurements()`, `setMeasurementVisible(id, bool)`, `updateMeasurement(id, { label })` — všechny mutace volají `this._emitStateChange()` (no-op dokud Task 8 nedodá callback: `_emitStateChange(){ this._stateChangeCb?.(); }` — definuj už teď).
  - `pickEdgeAt` výsledek rozšířen o `a:[x,y,z]`, `b:[x,y,z]` (koncové body vítězného segmentu; zpětně kompatibilní).
- Render smyčka: vedle `this._sectionVisuals?.updateHandleScale(...)` přidej `this._measureVisuals?.updateScreenScale(this._camera, this._canvas.clientHeight)` (pozor: měřicí visuals instance — najdi, kde se lazy-vytváří, `_ensureMeasureVisuals`/`getMeasureVisuals`).
- measure-visuals: `addMeasurement(id, type, points, value)` volá viewer-core správně (bug fix je tím pádem v core volání); přidej `setMeasurementVisible(id, bool)` (subgroup.visible + labelDiv.style.display) — visibility labelů respektuj i v `updateLabels` (skrytá měření nepřepočítávat/nezobrazovat).

- [ ] **Step 1: Failing test** (bez WebGL — testuje se čistá registry logika; viewer-core nejde importovat bez canvasu, PROTO registry logiku vyčleň do čistého modulu `assets/js/3d/ifc-engine/viewer/measure-registry.js`, který viewer-core používá):

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('Measure registry — engine stav měření', () => {
    async function make() {
        const { MeasureRegistry } = await import('../../assets/js/3d/ifc-engine/viewer/measure-registry.js');
        const events = [];
        const r = new MeasureRegistry({ onChange: () => events.push(1) });
        return { r, events };
    }
    it('add počítá hodnotu a vrací id; get vrací kopie', async () => {
        const { r } = await make();
        const id = r.add({ type: 'distance', points: [[0, 0, 0], [3, 4, 0]] });
        expect(id.startsWith('ms_')).toBe(true);
        const list = r.list();
        expect(list.length).toBe(1);
        expect(Math.abs(list[0].value - 5) < 1e-9).toBe(true);
        expect(list[0].unit).toBe('m');
        list[0].points[0][0] = 999;                       // mutace kopie
        expect(r.list()[0].points[0][0]).toBe(0);         // originál nedotčen
    });
    it('edge=2 body m, angle °, area m²; visible/label/remove/clear + onChange', async () => {
        const { r, events } = await make();
        const e1 = r.add({ type: 'angle', points: [[1, 0, 0], [0, 0, 0], [0, 1, 0]] });
        expect(Math.abs(r.list()[0].value - 90) < 1e-6).toBe(true);
        expect(r.list()[0].unit).toBe('°');
        const e2 = r.add({ type: 'area', points: [[0, 0, 0], [2, 0, 0], [2, 3, 0], [0, 3, 0]] });
        expect(Math.abs(r.list()[1].value - 6) < 1e-6).toBe(true);
        r.setVisible(e1, false);
        expect(r.list()[0].visible).toBe(false);
        r.update(e2, { label: 'deska' });
        expect(r.list()[1].label).toBe('deska');
        r.remove(e1);
        expect(r.list().length).toBe(1);
        r.clear();
        expect(r.list().length).toBe(0);
        expect(events.length >= 6).toBe(true);
    });
});
```

- [ ] **Step 2: Registruj + spusť** → FAIL.
- [ ] **Step 3: Implementace** — `measure-registry.js`: čistá třída (importuje measure-math), drží Map, id čítač, `add/list/remove/clear/setVisible/update/get(id)`; `onChange` callback po každé mutaci. viewer-core: instance `this._measureRegistry = new MeasureRegistry({ onChange: () => { this._syncMeasureVisuals(); this._emitStateChange(); } })`; veřejné metody delegují; `_syncMeasureVisuals()` dorovná visuals (add chybějící do visuals přes `addMeasurement(id, type, points, value)`, odstraněná odebrat, visibility nastavit — drž si Set idček ve visuals synced stavu). `pickEdgeAt`: do výsledku přidej `a`/`b` z vítězného segmentu. Facáda: delegace + `getMeasureVisuals` zůstává (panel ho po Tasku 5 už používat nebude, ale neodstraňovat).
- [ ] **Step 4: Full suite** → PASS.
- [ ] **Step 5: Commit** `feat(3d): měření jako objekty engine — registry, visibility, pickEdgeAt endpoints`

---

### Task 4: Vizuály — ΔXYZ, dvouřádkové labely, rubber-band, edge highlight

**Files:**
- Modify: `assets/js/3d/ifc-engine/viewer/measure-visuals.js`

**Interfaces:**
- Consumes: `addMeasurement(id, type, points, value)` (interní rozšíření).
- Produces: `showRubberBand(from, to)` / `hideRubberBand()`; `showEdgeHighlight(a, b)` / `hideEdgeHighlight()`; labely: distance = 2 řádky (viz spec B3, IFC konvence: `ΔX=|x1−x0|`, `ΔY=|z0−z1|`, `Δv=|y1−y0|` z world souřadnic), area = plocha + obvod.

- [ ] **Step 1: Implementace:**
  - **ΔXYZ schodiště** v `addMeasurement` pro `type==='distance'||type==='edge'`: úsečky `p0→(x1,y0,z0)` (barva X 0xef4444), `→(x1,y1,z0)` (Y 0x22c55e — world Y), `→p1` (Z 0x3b82f6); `LineBasicMaterial({ transparent:true, opacity:0.7, depthTest:false })`; úsečky kratší 1 cm vynech. Přidávej do subgroup (dispose už řeší traverse).
  - **Labely**: `formatValue` rozšiř — distance/edge: `<div>12.345 m</div><div class="measure-label__sub">ΔX 1.200 · ΔY 3.400 · Δv 0.800</div>` (innerHTML, hodnoty toFixed(3); sub styl přidat do stylesheetu s `.measure-label` — najdi ho grepem `measure-label` v `assets/css/`); area: druhý řádek `obvod 12.30 m` (obvod spočti z points včetně uzavření).
  - **Rubber-band**: lazy `THREE.Line` s `LineDashedMaterial({ color: 0x4facfe, dashSize: 0.3, gapSize: 0.15, depthTest: false })`, po setPositions volat `computeLineDistances()`; show/hide.
  - **Edge highlight**: lazy `THREE.Line` 2 body, `LineBasicMaterial({ color: 0x10b981, linewidth: 1, depthTest: false })`, renderOrder 998.
- [ ] **Step 2: `node --check` + full suite** → PASS.
- [ ] **Step 3: Commit** `feat(3d): ΔXYZ osové čáry, rubber-band, edge highlight, bohatší labely`

---

### Task 5: Measure panel — nový flow + seznam + tooltip + odkrytí ikony

**Files:**
- Modify: `assets/js/3d/panels/measure-panel.js` (přepis interakce; CSV/JSON export zachovat nad `engine.getMeasurements()`)
- Modify: `pages/3d-viewer.html` (odebrat `hidden` z `data-tool="measure"`, řádek ~106)
- Modify: CSS s panely (kde je `.v3d-drag-tip`) — přidej `.v3d-snap-tip` (stejný vzhled)

**Interfaces:**
- Consumes: `engine.addMeasurement/getMeasurements/removeMeasurement/clearMeasurements/setMeasurementVisible/updateMeasurement` (Task 3), `engine.snapAt(x, y, {enabled, thresholdPx:12, lastPoint})` (client vs canvas souřadnice: snapAt bere canvas-relativní — OVĚŘ v kódu a předávej konzistentně jako dnešní panel), `engine.pickEdgeAt(x,y).{point,a,b}` (Task 3), `engine.raycastPoint`, visuals přes engine: `getMeasureVisuals()` pro `showRubberBand/hideRubberBand/showEdgeHighlight/hideEdgeHighlight/showSnapPreview/hideSnapPreview/addInProgressPoint/clearInProgressPoints`.
- `snapAt`/raycast výsledek: zjisti, zda vrací `modelId` hitu (pokud ne, použij `engine.getModels()[0]?.id` fallback) → předej do `addMeasurement`.

- [ ] **Step 1: Implementace** (UI task, bez unit testů):
  - Režimové pilulky `distance/edge/angle/area` (📏 Vzdálenost · ⟍ Hrana · ∠ Úhel · ▱ Plocha); **měření aktivní hned po mountu** (žádný Start/Stop); přepnutí režimu → zrušit rozpracované (`clearInProgressPoints`, hide rubber band).
  - Snap pilulky zůstávají; výchozí zapnuté `vertex, midpoint, edge`.
  - Interakce: `mousemove` → snap → `showSnapPreview` + **tooltip** `.v3d-snap-tip` (název snapu česky: Vrchol/Střed hrany/Těžiště/Hrana/Kolmice/Průsečík/Povrch; + druhý řádek s živou hodnotou rubber-bandu, když existuje poslední bod); klik → přidat bod (`addInProgressPoint` + rubber band od něj); režim `edge`: hover `pickEdgeAt` → `showEdgeHighlight(a,b)` + tooltip s délkou, klik → `addMeasurement({type:'edge', points:[a,b], modelId})` rovnou hotovo.
  - Dokončení: distance 2 body, angle 3 body, area dvojklik NEBO Enter (min 3 body). Po dokončení `addMeasurement(...)` → engine (visuals si sesynchronizuje core), úklid in-progress.
  - **Klávesy** (listenery na `document` po dobu života panelu, uklidit v destroy): Escape → zrušit rozpracované; Enter → uzavřít polygon (area); `contextmenu` na canvasu → preventDefault + odebrat poslední bod (a jeho in-progress marker — `clearInProgressPoints` + znovu přidat zbývající).
  - **Seznam měření** místo historie: položky z `getMeasurements()` — title `fmt(value, unit)`, sub `label || typ česky`, tlačítka 👁/✎/✕ (vzor section-panel řádků), nahoře „Skrýt vše"/„Zobrazit vše", „✕ Smazat vše" (confirm), ⇣ CSV ⇣ JSON (sloupce `type,label,value,unit,points`). Starý localStorage klíč nepoužívat.
  - Odkrytí ikony `measure` v HTML.
- [ ] **Step 2: `node --check` + full suite → PASS.**
- [ ] **Step 3: Commit** `feat(3d): měření — nový flow, seznam se skrýváním, snap tooltip, odkrytá ikona`

---

### Task 6: Face-pick kroužek + šipka (section-visuals + viewer-core)

**Files:**
- Modify: `assets/js/3d/ifc-engine/viewer/section-visuals.js`
- Modify: `assets/js/3d/ifc-engine/viewer/viewer-core.js` (`showSectionGhostFromHit` ~2498, `hideSectionGhost`)

**Interfaces:**
- Produces: `SectionVisuals.showFacePickCursor(point, normal)` / `hideFacePickCursor()` — kroužek RingGeometry(0.7, 1.0, 32) v rovině plochy (lookAt podél normály) + šipka podél normály (CylinderGeometry(0.08, 0.08, 1.2) + ConeGeometry(0.22, 0.45) na špici, rotace Y→Z jako u gizma), materiál `MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.95, depthTest: false })`, renderOrder 103; screen-constant ~44 px — škáluj ve stávajícím per-frame `updateHandleScale` (skupinu kurzoru přidej mezi škálované objekty, target 44 px, clamp min 0.05 max 5).
- Consumes (viewer-core): po úspěšném `_collectCoplanarTriangles` hitu zavolej `this._sectionVisuals.showFacePickCursor(hitPointWorld, worldNormal)` — world normála stejně jako v `selection.js:95-98` (transform `hit.face.normal` maticí meshe, normalize); `hideSectionGhost` volá i `hideFacePickCursor`.
- Směr šipky: šipka má ukazovat do poloprostoru, který PO ŘEZU ZŮSTANE VIDITELNÝ. Ověř proti `addSectionPlane(point, normal)` + `_buildPlane` (THREE.Plane(n, -n·p) ořezává body s `n·x + w < 0`? — clippingPlanes skrývají fragmenty se záporným signed distance). Ověř empiricky čtením kódu a případně šipku otoč (`normal.negate()` jen pro vizuál); rozhodnutí zdokumentuj komentářem.

- [ ] **Step 1: Implementace** dle rozhraní.
- [ ] **Step 2: `node --check` obou souborů + full suite → PASS.**
- [ ] **Step 3: Commit** `feat(3d): face-pick kurzor — kroužek s kolmou šipkou u výběru roviny řezu`

---

### Task 7: `viewer-state-store.js` + testy

**Files:**
- Create: `assets/js/3d/ifc-engine/state/viewer-state-store.js`
- Test: `tests/test-suites/viewer-state-store.test.js` (+ registrace)

**Interfaces:**
- Produces (vše async, vzor `cache/cache-store.js` — vlastní `openDb`/`tx` helper, DB `bim-viewer-state` verze 1):
  - store `modelState` keyPath `contentHash`: `stateGet(contentHash) → doc|null`, `statePut(contentHash, doc)` (doc se uloží s doplněným `contentHash`), `stateDelete(contentHash)`
  - store `views` keyPath `id`, index `models` (`multiEntry: true`): `viewPut(view)`, `viewDelete(id)`, `viewsAll() → View[]`, `viewsForModels(contentHashes) → View[]` (union přes index, dedup dle id, + pohledy s prázdným `models` polem zahrň taky — legacy migrace)

- [ ] **Step 1: Failing test:**

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('viewer-state-store — IndexedDB persistence', () => {
    let s;
    async function store() {
        if (!s) s = await import('../../assets/js/3d/ifc-engine/state/viewer-state-store.js');
        return s;
    }
    it('modelState put/get/delete roundtrip', async () => {
        const { statePut, stateGet, stateDelete } = await store();
        const doc = { schemaVersion: 1, measurements: [{ id: 'ms_1', type: 'distance', points: [[0, 0, 0], [1, 1, 1]], visible: true, value: 1.732, unit: 'm', label: '' }], sectionPlanes: [] };
        await statePut('hash_test_1', doc);
        const got = await stateGet('hash_test_1');
        expect(got.measurements[0].id).toBe('ms_1');
        expect(got.contentHash).toBe('hash_test_1');
        await stateDelete('hash_test_1');
        expect(await stateGet('hash_test_1')).toBe(null);
    });
    it('views: multiEntry index + legacy bez models', async () => {
        const { viewPut, viewsForModels, viewsAll, viewDelete } = await store();
        await viewPut({ id: 'v1', name: 'A', models: ['hA', 'hB'] });
        await viewPut({ id: 'v2', name: 'B', models: ['hC'] });
        await viewPut({ id: 'v3', name: 'legacy', models: [] });
        const forA = await viewsForModels(['hA']);
        expect(forA.some(v => v.id === 'v1')).toBe(true);
        expect(forA.some(v => v.id === 'v2')).toBe(false);
        expect(forA.some(v => v.id === 'v3')).toBe(true);   // legacy vždy
        expect((await viewsAll()).length >= 3).toBe(true);
        await viewDelete('v1'); await viewDelete('v2'); await viewDelete('v3');
        expect((await viewsAll()).length).toBe(0);
    });
});
```

- [ ] **Step 2: Registruj + spusť** → FAIL. **Step 3: Implementace.** **Step 4: Full suite** → PASS.
- [ ] **Step 5: Commit** `feat(3d): IndexedDB store pro stav vieweru per model + pohledy`

---

### Task 8: Engine — model-local transformace, content hash, change hook

**Files:**
- Modify: `assets/js/3d/ifc-engine/viewer/viewer-core.js`
- Modify: `assets/js/3d/ifc-engine/index.js` (facáda)
- Test: rozšíření `tests/test-suites/measure-registry.test.js` NEBO nový `tests/test-suites/model-local-transform.test.js` — čistá transformační funkce (viz níže), registrovat

**Interfaces:**
- Produces (viewer-core + facáda):
  - `worldToModelLocal(modelId, [x,y,z]) → [x,y,z]|null`, `modelLocalToWorld(modelId, [x,y,z]) → [x,y,z]|null` — inverze/aplikace `matrixWorld` skupiny modelu (`updateMatrixWorld(true)` před čtením; skupina: zjisti reálnou strukturu `this._viewer._models` — každý model má skupinu/mesh root).
  - Směrová varianta pro normály: `worldToModelLocalDir(modelId, dir)` / `modelLocalToWorldDir(modelId, dir)` (jen rotace — kvaternion, normalizovat).
  - `setModelContentHash(modelId, hash)` / `getModelContentHash(modelId) → string|null` (uloženo v metadatech modelu).
  - `onViewerStateChange(cb)` (facáda) → `this._viewer._stateChangeCb = cb`; `_emitStateChange()` z Task 3 tím ožije; DOPLŇ volání `_emitStateChange()` i do section-plane mutací: `addSectionPlane`, `updateSectionPlane`, `removeSectionPlane`, `clearSectionPlanes`.
  - Čistý pomocník `assets/js/3d/ifc-engine/state/local-transform.js`: `applyMat4([x,y,z], mat4ColumnMajorArray) → [x,y,z]` a `invertRigid(mat4) → mat4` NENÍ potřeba — použij THREE (Matrix4.invert). Pro TESTY vyčleň funkci `transformPointByMatrix(point, matrixArray)` do `local-transform.js` (bez THREE — ruční mat4×vec3, column-major jako THREE.Matrix4.elements) a viewer-core ji použije s `group.matrixWorld.elements` / invertovanou maticí.

- [ ] **Step 1: Failing test** (`model-local-transform.test.js`):

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('model-local transformace bodů', () => {
    it('roundtrip world→local→world ≈ identita (rotace −π/2 X + posun)', async () => {
        const { transformPointByMatrix } = await import('../../assets/js/3d/ifc-engine/state/local-transform.js');
        const THREE = await import('three');
        const g = new THREE.Group();
        g.rotation.x = -Math.PI / 2;
        g.position.set(10, -5, 3);
        g.updateMatrixWorld(true);
        const world = [4, 7, -2];
        const inv = g.matrixWorld.clone().invert();
        const local = transformPointByMatrix(world, inv.elements);
        const back = transformPointByMatrix(local, g.matrixWorld.elements);
        for (let i = 0; i < 3; i++) expect(Math.abs(back[i] - world[i]) < 1e-9).toBe(true);
        // shoda s THREE.Vector3.applyMatrix4
        const ref = new THREE.Vector3(...world).applyMatrix4(inv);
        expect(Math.abs(local[0] - ref.x) < 1e-9).toBe(true);
        expect(Math.abs(local[1] - ref.y) < 1e-9).toBe(true);
        expect(Math.abs(local[2] - ref.z) < 1e-9).toBe(true);
    });
});
```

- [ ] **Step 2: Registruj + spusť** → FAIL. **Step 3: Implementace** dle rozhraní (local-transform.js = ruční mat4 aplikace s perspektivní divizí vynechanou — rigid+scale stačí; viewer-core metody + facáda + emit do section mutací). **Step 4: Full suite** → PASS.
- [ ] **Step 5: Commit** `feat(3d): model-local transformace, content hash na modelu, state change hook`

---

### Task 9: Orchestrátor persistence + zapojení do viewer-page

**Files:**
- Create: `assets/js/3d/viewer-state-persistence.js`
- Modify: `assets/js/3d/viewer-page.js` (po vytvoření enginu `initStatePersistence(engine)`; po úspěšném loadu modelu `engine.setModelContentHash(modelId, contentHash)` + `restoreModelState(engine, modelId, contentHash)` — contentHash se počítá u .bimcache flow ~ř. 184; zajisti výpočet i pro cestu bez cache)

**Interfaces:**
- Consumes: store (Task 7), engine metody (Task 3, 8): `getMeasurements`, `addMeasurement`, `getSectionPlanes`, `addSectionPlane`, `updateSectionPlane`, `setMeasurementVisible`, `updateMeasurement`, `worldToModelLocal(Dir)`, `modelLocalToWorld(Dir)`, `getModelContentHash`, `onViewerStateChange`, `getModels()`.
- Produces: `initStatePersistence(engine)` (registruje change callback s debounce 1000 ms), `restoreModelState(engine, modelId, contentHash) → Promise<void>`.
- Chování dle spec D3 (dokument schéma, `restoring` boolean, kotevní model = první v `getModels()`, prázdný stav se ukládá, roviny restoruje jen dokument kotevního modelu, měření do dokumentu svého modelu — měření bez hashe (model bez hashe) se neukládají).

- [ ] **Step 1: Implementace** (integrace, testováno vizuálně v Tasku 11):
  - Save: callback → `restoring`-guard → debounce → pro každý model z `getModels()` s hashem: doc = { schemaVersion:1, measurements: měření s `modelId` toho modelu (points přes `worldToModelLocal`), sectionPlanes: jen pro kotevní model (point přes `worldToModelLocal`, normal přes `worldToModelLocalDir`, + offset/name/visible) } → `statePut`.
  - Restore: `restoring = true` → `stateGet` → měření `modelLocalToWorld` → `addMeasurement({...id NEgenerovat znovu — addMeasurement generuje nové id, PROTO: restore přidá měření a hned `setMeasurementVisible`/`updateMeasurement` dle doc; původní id se nezachovává (v1 OK — pohledy z Task 10 ukládají ids až po restore session)}*; roviny jen pokud `modelId` je kotevní (první) model → `addSectionPlane` → `updateSectionPlane(id, {offset, visible, name})`; `restoring = false`; po restore vynutit jeden save (sync id).
    *Pozn. pro implementátora: pokud je zachování id triviální (add s volitelným `id` paramem v registry), preferuj to — pohledy pak referencují stabilní id; rozhodnutí poznamenej do reportu.
- [ ] **Step 2: `node --check` + full suite → PASS.**
- [ ] **Step 3: Commit** `feat(3d): auto-persistence měření a rovin per model (content hash)`

---

### Task 10: Pohledy — upgrade panelu, thumbnail, migrace

**Files:**
- Modify: `assets/js/3d/panels/viewpoints-panel.js` (přepis dle spec E)
- Modify: CSS panelů — karty pohledů (grid 2 sloupce, img náhled, název, datum)

**Interfaces:**
- Consumes: store `viewPut/viewDelete/viewsAll/viewsForModels` (Task 7); engine: `getCameraState/setCameraState`, `getHiddenEntityIds/hideEntities/showAll`, `getOpacityEntries/setEntityOpacity`, `getHighlightedIds/highlight/clearHighlights`, `getDisplayMode/setDisplayMode` (vše existuje), `getSectionPlanes/clearSectionPlanes/addSectionPlane/updateSectionPlane`, `getMeasurements/setMeasurementVisible`, `getModels`, `getModelContentHash`, `worldToModelLocal(Dir)/modelLocalToWorld(Dir)`, `takeViewportScreenshot()`.
- Dokument pohledu dle spec E1 (sectionPlanes model-local vůči kotevnímu modelu + `anchorHash`).

- [ ] **Step 1: Implementace:**
  - `_save()`: dnešní capture + `models` (hashe všech načtených), `sectionPlanes` (model-local, `anchorHash` = hash kotevního modelu), `visibleMeasurementIds`, `thumbnail` (screenshot → canvas downscale šířka 256 → `toDataURL('image/jpeg', 0.7)`; když screenshot selže, `null`), `id` = `crypto.randomUUID()`, `schemaVersion: 1` → `viewPut`.
  - `_apply(view)`: dnešní restore + roviny (`clearSectionPlanes` → pokud je model s `anchorHash` načtený: add+update; jinak přeskočit + hláška „Řezy přeskočeny — chybí model pohledu.") + měření visibility (`setMeasurementVisible` — viditelná jen id z `visibleMeasurementIds`, ostatní skrýt).
  - Render: karty (thumbnail img nebo placeholder, název, datum lokálně), Použít/✕; sekce „Pohledy jiných modelů (N)" v `<details>` (pohledy, jejichž `models` ⊄ načtené hashe); u nich Použít aplikuje jen kameru+režim s hláškou.
  - **Migrace**: při mountu, když `localStorage['bim_checker_viewpoints_v1']` existuje a `viewsAll()` je prázdné → převést (`models: []`, `id: randomUUID()`, bez thumbnail) → `viewPut` → `localStorage.removeItem`.
  - Export/import JSON nad IDB obsahem (import: doplnit chybějící id).
- [ ] **Step 2: `node --check` + full suite → PASS.**
- [ ] **Step 3: Commit** `feat(3d): pohledy — náhledy, řezy+měření, vazba na model, IDB + migrace`

---

### Task 11: Finalizace — dist, SW bump, vizuální ověření, PLAN.md

**Files:**
- Modify: `sw.js` + `dist/sw.js` (verze +1, očekáváno v142 → v143), `dist/**` zrcadla, `PLAN.md`

- [ ] **Step 1: Zrcadli do dist** — `git diff --name-only <base_tasku_1>..HEAD -- assets pages` → `cp` každý do `dist/…`, ověř `diff`.
- [ ] **Step 2: SW bump** obě kopie.
- [ ] **Step 3: Full suite** → vše PASS.
- [ ] **Step 4: Vizuální ověření** (Chrome MCP, model `models/D.2.1.4/D214_SO112201.ifc`; server `python3 -m http.server 8787`, cache-bust fetch `{cache:'reload'}` změněných souborů — viz memory 3d-viewer-debug-setup):
  (a) ikona měření viditelná, panel se otevře a měří hned; (b) snap glyfy tvarově odlišené + tooltip; (c) vzdálenost s ΔXYZ čárami a dvouřádkovým labelem; (d) hrana klikem; (e) úhel; (f) plocha s obvodem; (g) rubber-band; (h) seznam — skrýt/ukázat/smazat jednotlivě, skrýt vše; (i) Escape/pravý klik; (j) **reload stránky → měření i roviny se obnoví**; (k) uložit pohled → karta s náhledem; aplikovat pohled → kamera+řezy+viditelnost měření; (l) face-pick kroužek se šipkou ve „Plochou" režimu, směr šipky odpovídá zachované straně řezu; (m) konzole bez chyb. Screenshoty přiložit do reportu běhu.
- [ ] **Step 5: PLAN.md** milestone + commit `chore: dist mirror + SW v143 + PLAN.md (měření, persistence, pohledy)`.

## Self-review (provedeno)

- Spec pokrytí: A1→T1, A2→T2, B1→T3, B2→T5, B3→T4, B4→T5, C→T6, D1→T7, D2→T8, D3→T9, D4→T1+T7+T8, E1-E4→T10, společné→T11. Bez mezer.
- Typová konzistence: `screenScale(camera, worldPos, vh, targetPx, opts)` (T1→T2,T6); `MeasureRegistry.add/list/remove/clear/setVisible/update` ↔ facáda `addMeasurement/getMeasurements/...` (T3→T5,T9,T10); `pickEdgeAt().a/b` (T3→T5); `worldToModelLocal(Dir)` (T8→T9,T10); store API (T7→T9,T10); doc schémata dle spec D3/E1.
- Vědomé volby: registry vyčleněna do čistého modulu kvůli testovatelnosti; zachování id při restore ponecháno na implementátorovi T9 s preferencí (poznamenat do reportu).
