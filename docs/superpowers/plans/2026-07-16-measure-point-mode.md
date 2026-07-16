# Režim měření „Bod" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nový režim měření `point` v 3D vieweru — klik na plochu vytvoří měření se souřadnicemi bodu v IFC rámu modelu.

**Architecture:** Typ `point` prochází existující trojicí registr (čistý stav) → viewer-core (glue, obohatí spec o IFC model-lokální `coords` přes `worldToModelLocal`) → visuals (marker + HTML popisek). Panel přidá režim, klik-interakci, živý tooltip a položku seznamu; exporty CSV/JSON dostanou souřadnicové sloupce. Persistence projde beze změn (generická podle typu; `coords` se při restore přepočítají).

**Tech Stack:** Vanilla JS (ES moduly, bez build systému), Three.js, vlastní test framework (`describe`/`it`/`expect`) běžící přes `node tests/run-tests.js` (Puppeteer).

**Spec:** `docs/superpowers/specs/2026-07-16-measure-point-mode-design.md`

## Global Constraints

- Testy: `node tests/run-tests.js` — baseline **1020/1020 passed**; po každém tasku musí projít vše.
- Test framework **nepodporuje `.not`** — piš `expect(x === y).toBe(true)` apod.
- Do `innerHTML` popisků jen `toFixed` hodnoty a statické řetězce (XSS konvence z measure-visuals.js).
- UI texty česky, konzistentní s existujícími (Vzdálenost/Hrana/Úhel/Plocha → Bod).
- `dist/` je ruční kopie `assets/` — změněné soubory zkopírovat (Task 5).
- SW cache bump: `sw.js` `CACHE_VERSION` `bim-checker-v150` → `bim-checker-v151` (Task 5).
- Commity česky, prefix `feat(3d):` / `test(3d):`, před commitem spustit testy.

---

### Task 1: Registr — typ `point` (value null, coords passthrough + klonování)

**Files:**
- Modify: `assets/js/3d/ifc-engine/viewer/measure-registry.js`
- Test: `tests/test-suites/measure-registry.test.js`

**Interfaces:**
- Produces: `MeasureRegistry.add({ type: 'point', points: [[x,y,z]], coords?: [x,y,z], ... })` → položky z `list()`/`get()` nesou `coords: [x,y,z] | null` (kopie), `value: null`, `unit: ''`. Všechny ostatní typy mají `coords: null`.

- [ ] **Step 1: Napiš failing test**

Do `tests/test-suites/measure-registry.test.js` přidej před závěrečné `});`:

```js
    it('point: value null, unit prázdný, coords se ukládají a klonují', async () => {
        const { r } = await make();
        const id = r.add({ type: 'point', points: [[1, 2, 3]], coords: [745123.456, 1045321.789, 250.123] });
        const m = r.get(id);
        expect(m.value).toBe(null);
        expect(m.unit).toBe('');
        expect(m.coords[0]).toBe(745123.456);
        expect(m.coords[1]).toBe(1045321.789);
        expect(m.coords[2]).toBe(250.123);
        m.coords[0] = 999;                                  // mutace kopie
        expect(r.get(id).coords[0]).toBe(745123.456);       // originál nedotčen
        expect(r.list()[0].coords[2]).toBe(250.123);        // list nese coords také
    });
    it('point bez coords → null; ostatní typy mají coords null', async () => {
        const { r } = await make();
        const p = r.add({ type: 'point', points: [[0, 0, 0]] });
        expect(r.get(p).coords).toBe(null);
        const d = r.add({ type: 'distance', points: [[0, 0, 0], [1, 0, 0]] });
        expect(r.get(d).coords).toBe(null);
    });
```

- [ ] **Step 2: Ověř, že testy selžou**

Run: `node tests/run-tests.js 2>&1 | tail -5`
Expected: FAIL (např. `m.coords` je `undefined` → `expect(...).toBe(745123.456)` selže; celkem 1020 passed + 2 failed nebo obdobně).

- [ ] **Step 3: Implementuj v measure-registry.js**

V `computeValueUnit` přidej před `return { value: 0, unit: '' };`:

```js
  if (type === 'point') {
    return { value: null, unit: '' };
  }
```

Přidej helper pod `clonePoints`:

```js
// Kopie coords [x,y,z] nebo null — stejná ochrana proti mutaci jako u points.
function cloneCoords(coords) {
  return Array.isArray(coords) ? [coords[0], coords[1], coords[2]] : null;
}
```

V `add` změň signaturu a uložení (JSDoc `@param` doplň o `'point'` v type a o `coords?:number[]`):

```js
  add({ type, points, label = '', modelId = null, id = null, coords = null }) {
```

a v `this._items.set(useId, {...})`:

```js
    this._items.set(useId, {
      id: useId, type, points: stored, value, unit,
      label, visible: true, modelId, coords: cloneCoords(coords),
    });
```

V `list()` a `get()` doplň do vraceného objektu `coords: cloneCoords(m.coords)` (za `modelId: m.modelId`).

- [ ] **Step 4: Ověř, že testy projdou**

Run: `node tests/run-tests.js 2>&1 | tail -5`
Expected: `SUMMARY: 1022/1022 tests passed`

- [ ] **Step 5: Commit**

```bash
git add assets/js/3d/ifc-engine/viewer/measure-registry.js tests/test-suites/measure-registry.test.js
git commit -m "feat(3d): registr měření — typ point s IFC coords (value null, klonování)"
```

---

### Task 2: viewer-core + visuals — obohacení coords a popisek bodu

**Files:**
- Modify: `assets/js/3d/ifc-engine/viewer/viewer-core.js` (metoda `addMeasurement` ~ř. 2745, `_syncMeasureVisuals` ~ř. 2773)
- Modify: `assets/js/3d/ifc-engine/viewer/measure-visuals.js` (`buildLabelHTML`, `addMeasurement`)

**Interfaces:**
- Consumes: `MeasureRegistry.add(spec)` s polem `coords` (Task 1); existující `this.worldToModelLocal(modelId, point)` ve viewer-core (~ř. 2811).
- Produces: `MeasureVisuals.addMeasurement(id, type, points, value, coords)` — 5. parametr `coords: [x,y,z] | null | undefined`; pro `type === 'point'` popisek se 3 řádky X/Y/Z z `coords` (fallback `points[0]`).

Poznámka: pro tuto glue vrstvu není praktický unit test (viewer-core vyžaduje Three.js scénu; existující testy visuals/core netestují) — ověří vizuální kontrola v Tasku 6.

- [ ] **Step 1: viewer-core.addMeasurement — obohať point o coords**

V `addMeasurement(spec)` přidej za blok doplňující `modelId` (před `return this._measureRegistry.add(spec);`):

```js
    // Bod: IFC model-lokální souřadnice se počítají jednou zde — popisek,
    // seznam v panelu i export pak čtou stejnou hodnotu stabilní vůči federaci.
    if (spec && spec.type === 'point' && Array.isArray(spec.points) && spec.points[0]) {
      const local = spec.modelId ? this.worldToModelLocal(spec.modelId, spec.points[0]) : null;
      spec = { ...spec, coords: local || [...spec.points[0]] };
    }
```

V JSDoc `@param` u `addMeasurement` rozšiř type union o `'point'`.

- [ ] **Step 2: viewer-core._syncMeasureVisuals — předej coords**

Změň řádek:

```js
        visuals.addMeasurement(m.id, m.type, m.points, m.value);
```

na:

```js
        visuals.addMeasurement(m.id, m.type, m.points, m.value, m.coords);
```

- [ ] **Step 3: measure-visuals — popisek bodu**

V `buildLabelHTML` změň signaturu na `buildLabelHTML(type, points, value, coords)` a přidej na začátek funkce:

```js
  if (type === 'point' && points.length >= 1) {
    const c = (Array.isArray(coords) && coords.length >= 3) ? coords : points[0];
    return `<div>X ${c[0].toFixed(3)}</div>`
      + `<div class="measure-label__sub">Y ${c[1].toFixed(3)}</div>`
      + `<div class="measure-label__sub">Z ${c[2].toFixed(3)}</div>`;
  }
```

V `MeasureVisuals.addMeasurement` změň signaturu na `addMeasurement(id, type, points, value, coords)` a volání na `buildLabelHTML(type, points, value, coords)`.

Kotva (`anchor`) beze změny — pro 1 bod padne do větve `centroid(points)`, což je bod sám. Marker-koule vzniká existující smyčkou přes `points`; čáry/výplň/ΔXYZ se u 1 bodu podle stávajících podmínek nepřidají.

- [ ] **Step 4: Spusť testy (regrese)**

Run: `node tests/run-tests.js 2>&1 | tail -5`
Expected: `SUMMARY: 1022/1022 tests passed`

- [ ] **Step 5: Commit**

```bash
git add assets/js/3d/ifc-engine/viewer/viewer-core.js assets/js/3d/ifc-engine/viewer/measure-visuals.js
git commit -m "feat(3d): bodové měření — coords ve viewer-core, popisek X/Y/Z ve visuals"
```

---

### Task 3: Panel — režim Bod, klik, živý tooltip, položka seznamu

**Files:**
- Modify: `assets/js/3d/panels/measure-panel.js`

**Interfaces:**
- Consumes: `engine.addMeasurement({ type: 'point', points: [p], modelId })` (Task 2 doplní coords); `engine.worldToModelLocal(modelId, point)` (facade `assets/js/3d/ifc-engine/index.js:376`); položky `getMeasurements()` s `coords` (Task 1).
- Produces: UI režim `point` — bez rozpracovaného stavu (`this._points` se nepoužívá).

Poznámka: panel nemá test infrastrukturu (žádný existující panel test) — ověří vizuální kontrola v Tasku 6.

- [ ] **Step 1: Režim a texty**

Do `MODES` přidej na konec pole:

```js
  { id: 'point', label: '📍 Bod', need: 1 },
```

Do `MODE_CZ` přidej `point: 'Bod'`. Do `_modeHint()` mapy přidej:

```js
      point: 'Klikněte na plochu — bod se souřadnicemi se přidá rovnou.',
```

- [ ] **Step 2: Klik — okamžité měření**

V `_onClick(e)` přidej za výpočet `const p = Array.isArray(raw) ? raw : [raw.x, raw.y, raw.z];` (před `this._points.push(p);`):

```js
    if (this._mode === 'point') {
      this.engine.addMeasurement?.({ type: 'point', points: [p], modelId: this._modelId() });
      this._renderPanel();
      return;
    }
```

- [ ] **Step 3: Živý tooltip se souřadnicemi**

V `_onMove(e)` přidej za `edge` větev (před `const snap = this.engine.snapAt?.(...)` zůstává společný — uprav tak, že po výpočtu `snap` vlož):

```js
    if (this._mode === 'point') {
      const raw = snap?.point || this.engine.raycastPoint?.(e.clientX, e.clientY);
      if (snap?.point) v?.showSnapPreview?.(snap.point, snap.type);
      else v?.hideSnapPreview?.();
      v?.hideRubberBand?.();
      if (raw) {
        const p = Array.isArray(raw) ? raw : [raw.x, raw.y, raw.z];
        this._showSnapTip(e, SNAP_CZ[snap?.type] || SNAP_CZ.surface, this._coordsTip(p));
      } else {
        this._hideSnapTip();
      }
      return;
    }
```

a přidej metodu vedle `_rubberValue`:

```js
  /** Souřadnice bodu v IFC rámu modelu pro tooltip (fallback world). */
  _coordsTip(worldPoint) {
    const local = this.engine.worldToModelLocal?.(this._modelId(), worldPoint) || worldPoint;
    return `X ${local[0].toFixed(3)}  Y ${local[1].toFixed(3)}  Z ${local[2].toFixed(3)}`;
  }
```

- [ ] **Step 4: Titulek položky v seznamu**

V `_renderPanel()` změň řádek titulku položky:

```js
                <div class="v3d-panel__item-title">${escapeHtml(fmt(m.value, m.unit))}</div>
```

na:

```js
                <div class="v3d-panel__item-title">${escapeHtml(m.type === 'point' ? fmtCoords(m.coords || m.points[0]) : fmt(m.value, m.unit))}</div>
```

a k helperům na konec souboru (vedle `fmt`) přidej:

```js
function fmtCoords(c) {
  if (!Array.isArray(c) || c.length < 3) return '—';
  return c.map(v => Number(v).toFixed(3)).join(', ');
}
```

- [ ] **Step 5: Spusť testy (regrese) a commit**

Run: `node tests/run-tests.js 2>&1 | tail -5`
Expected: `SUMMARY: 1022/1022 tests passed`

```bash
git add assets/js/3d/panels/measure-panel.js
git commit -m "feat(3d): panel měření — režim Bod (klik, tooltip se souřadnicemi, seznam)"
```

---

### Task 4: Exporty CSV/JSON se souřadnicemi

**Files:**
- Modify: `assets/js/3d/panels/measure-panel.js` (funkce `exportCsv`, `exportJson` na konci souboru)

**Interfaces:**
- Consumes: položky `getMeasurements()` s `coords` (Task 1), helper `fmtCoords` není potřeba — sloupce jsou samostatné hodnoty.
- Produces: CSV hlavička `type,label,value,unit,points,x,y,z`; JSON položky bodů s polem `coords`.

- [ ] **Step 1: exportCsv — sloupce x,y,z**

Nahraď v `exportCsv` řádky `head`/`body`:

```js
  const head = 'type,label,value,unit,points,x,y,z\n';
  const body = items.map(m => {
    const c = m.type === 'point' ? (m.coords || m.points[0] || []) : [];
    return [
      safe(m.type), safe(m.label), safe(m.value), safe(m.unit), safe(JSON.stringify(m.points)),
      safe(c[0] ?? ''), safe(c[1] ?? ''), safe(c[2] ?? ''),
    ].map(cell => `"${cell.replace(/"/g, '""')}"`).join(',');
  }).join('\n');
```

(Pozn.: vnitřní proměnná mapu přejmenovaná na `cell`, aby nekolidovala s `c`.)

- [ ] **Step 2: exportJson — pole coords u bodů**

Nahraď v `exportJson` řádek `rows`:

```js
  const rows = items.map(m => ({
    type: m.type, label: m.label, value: m.value, unit: m.unit, points: m.points,
    ...(m.type === 'point' ? { coords: m.coords || m.points[0] || null } : {}),
  }));
```

- [ ] **Step 3: Spusť testy (regrese) a commit**

Run: `node tests/run-tests.js 2>&1 | tail -5`
Expected: `SUMMARY: 1022/1022 tests passed`

```bash
git add assets/js/3d/panels/measure-panel.js
git commit -m "feat(3d): export měření — sloupce x,y,z (CSV) a coords (JSON) pro body"
```

---

### Task 5: dist sync + SW cache bump

**Files:**
- Modify: `sw.js` (ř. 3: `CACHE_VERSION`)
- Modify: `dist/assets/js/3d/ifc-engine/viewer/measure-registry.js`, `dist/assets/js/3d/ifc-engine/viewer/measure-visuals.js`, `dist/assets/js/3d/ifc-engine/viewer/viewer-core.js`, `dist/assets/js/3d/panels/measure-panel.js`, `dist/sw.js` (existuje-li)

- [ ] **Step 1: Zkopíruj změněné soubory do dist**

```bash
cp assets/js/3d/ifc-engine/viewer/measure-registry.js dist/assets/js/3d/ifc-engine/viewer/measure-registry.js
cp assets/js/3d/ifc-engine/viewer/measure-visuals.js dist/assets/js/3d/ifc-engine/viewer/measure-visuals.js
cp assets/js/3d/ifc-engine/viewer/viewer-core.js dist/assets/js/3d/ifc-engine/viewer/viewer-core.js
cp assets/js/3d/panels/measure-panel.js dist/assets/js/3d/panels/measure-panel.js
```

- [ ] **Step 2: Bump SW cache**

V `sw.js` změň:

```js
const CACHE_VERSION = 'bim-checker-v150';
```

na:

```js
const CACHE_VERSION = 'bim-checker-v151';
```

Pokud existuje `dist/sw.js`, zkopíruj i ten: `[ -f dist/sw.js ] && cp sw.js dist/sw.js || true`

- [ ] **Step 3: Spusť testy a commit**

Run: `node tests/run-tests.js 2>&1 | tail -5`
Expected: `SUMMARY: 1022/1022 tests passed`

```bash
git add sw.js dist/
git commit -m "feat(3d): režim měření Bod — dist sync, SW v151"
```

---

### Task 6: Vizuální ověření (Chrome MCP / debug script) + persistence

**Files:** žádné změny (ověřovací task; případné opravy = mikro-iterace s vlastním commitem + dist sync)

Postup dle CLAUDE.md: je-li k dispozici Chrome MCP (`mcp__chrome-devtools__*`), použij ho; jinak `scripts/debug-3d-load.js`. Testovací model: `models/D.2.1.4/D214_SO112201.ifc`.

- [ ] **Step 1: Otevři viewer s testovacím modelem**

Chrome MCP: otevři stránku `pages/3d-viewer.html` (lokální server dle zvyku projektu), načti `models/D.2.1.4/D214_SO112201.ifc`, otevři panel Měření.

- [ ] **Step 2: Ověř režim Bod**

- Pilulka „📍 Bod" existuje a jde aktivovat; hint sedí.
- Hover nad modelem ukazuje tooltip se souřadnicemi X/Y/Z; snap na vrchol mění glyf.
- Klik vytvoří marker + popisek se 3 řádky X/Y/Z; hodnoty odpovídají očekávanému rozsahu modelu (S-JTSK magnitudy, Z = výška ~stovky m).
- Položka v seznamu má titulek se souřadnicemi a podtitulek „Bod"; skrytí/přejmenování/smazání funguje.
- CSV/JSON export obsahuje souřadnice bodu.
- `list_console_messages`: žádné nové chyby.
- Screenshot přes `take_screenshot` a **skutečně se na něj podívej**.

- [ ] **Step 3: Ověř persistenci**

Reload stránky se stejným modelem → bodové měření se obnoví, popisek ukazuje stejné souřadnice (coords se přepočítají z world bodů).

- [ ] **Step 4: Ověř ostatní režimy (regrese)**

Vzdálenost (2 kliky) a Plocha (3+ kliky, dvojklik) stále fungují — režim Bod nesmí rozbít generickou klik-cestu.

---

## Self-Review (provedeno při psaní plánu)

- **Spec coverage:** A→Task 3, B→Task 1+2, C→Task 2, D→Task 3+4, E→Task 6/Step 3, F→Task 1 (testy), Task 5 (dist+SW), Task 6 (vizuální kontrola). Omezení (modelId = kotva) — zachováno, žádný task ho nemění.
- **Placeholders:** žádné.
- **Konzistence typů:** `coords` je všude `[x,y,z] | null`; `MeasureVisuals.addMeasurement(id, type, points, value, coords)` konzistentní mezi Task 2 (produkce) a viewer-core voláním; `fmtCoords` definován v Task 3, používán jen tam.
