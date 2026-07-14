# IFC 4.3 Alignment-basedView Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3D viewer správně načte IFC 4.3 soubory s `ViewDefinition [Alignment-basedView]` — prvky s `IfcLinearPlacement` se umístí na osu, osa se vykreslí z geometrické vrstvy včetně nivelety a UI ukáže MVD.

**Architecture:** Nový THREE-free evaluátor geometrické vrstvy osy (`IfcCompositeCurve`/`IfcGradientCurve` přes `IfcCurveSegment` — line/circle/clothoid/polynomial, kotvení segmentů na Placement). Nad ním `resolveLinearPlacement` s prioritou spec-sankcionovaného `CartesianPosition` fallbacku. `resolvePlacement` dispatchuje podle typu entity. Validace evaluátoru proti 1071 ground-truth `CartesianPosition` hodnotám v reálném souboru.

**Tech Stack:** Vanilla JS ES moduly, THREE.js (jen matice), vlastní Jasmine-like test framework (Puppeteer), žádný build system.

## Global Constraints

- Testy: `node tests/run-tests.js` — musí projít VŠE (ne jen nové suity).
- Test framework NEPODPORUJE `.not` chaining — piš `expect(x < 0.001).toBe(true)` apod.
- Nové soubory začínají hlavičkou:
  ```js
  /* SPDX-License-Identifier: AGPL-3.0-or-later */
  /* Copyright (C) 2026 Michal Marvan */
  ```
- Komentáře v kódu česky nebo anglicky dle okolí souboru (engine soubory jsou míchané, drž styl konkrétního souboru).
- Po změně geometry pipeline MUSÍ být bumpnut `GEOMETRY_PIPELINE_VERSION` v `assets/js/3d/ifc-engine/cache/model-cache.js` (Task 5) — jinak .bimcache vrací staré meshe.
- Po změně CSS/JS bump SW cache verze v `sw.js` řádek 3 (`bim-checker-v145` → `v146`; při exekuci ověř aktuální číslo a zvyš o 1) — dělá se JEDNOU na konci (Task 9).
- `dist/` je zrcadlo `assets/` — na konci spusť `node scripts/build-dist.cjs` (Task 9). Průběžně dist neaktualizuj.
- Testovací IFC: `~/shared/Ifc_creator/Nový projekt (28).ifc` — POZOR: název má NFD unicode, v shellu VŽDY glob: `f=$(ls ~/shared/Ifc_creator/*28*.ifc | head -1)`.
- Commit po každém tasku, zpráva odkazuje na tento plán.
- Klotoida: κ(t) = t/(A·|A|), SegmentStart = κ₁·A·|A| — NIKDY A²·κ₁ (zrcadlová větev!).
- Parametrizace gradient curve = vodorovný průmět (composite curve je 2D půdorys).
- OffsetLateral kladně = VLEVO od směru staničení.

## Referenční data (ověřeno v testovacím souboru)

```
#534=IFCLINEARPLACEMENT($,#529,#533);                     ← (PlacementRelTo, RelativePlacement, CartesianPosition)
#529=IFCAXIS2PLACEMENTLINEAR(#526,#527,#528);             ← (Location, Axis, RefDirection)
#526=IFCPOINTBYDISTANCEEXPRESSION(IFCLENGTHMEASURE(0.0),$,$,$,#515);  ← (DistanceAlong, OffsetLateral, OffsetVertical, OffsetLongitudinal, BasisCurve)
#515=IFCGRADIENTCURVE((#346,...,#514),.F.,#338,$);        ← (Segments, SelfIntersect, BaseCurve, EndPoint)
#338=IFCCOMPOSITECURVE((#153,...,#337),.F.);              ← (Segments, SelfIntersect)
#153=IFCCURVESEGMENT(.CONTSAMEGRADIENT.,#152,IFCLENGTHMEASURE(0.0),IFCLENGTHMEASURE(73.685),#149);
                                                          ← (Transition, Placement, SegmentStart, SegmentLength, ParentCurve)
#157=IFCCLOTHOID(#156,-190.85);                           ← (Position, ClothoidConstant) — A může být záporné
#353=IFCPOLYNOMIALCURVE(#352,(0.0,1.0),(341.109,0.017,0.000111),$);  ← (Position, CoefficientsX, CoefficientsY, CoefficientsZ)
#535=IFCREFERENT('37Cm...',#6,'0+633.660',$,$,#534,$,.STATION.);     ← Representation=$, PredefinedType na parts[7]
#536=IFCPROPERTYSINGLEVALUE('Station',$,IFCLENGTHMEASURE(633.6605),$);  ← v Pset_Stationing
Ground truth: pilota s DistanceAlong=1133.0395, OffsetLateral=5.4908, OffsetVertical=-0.2116
              má CartesianPosition location = (206.0219, -913.3494, 360.8043).
```

---

### Task 1: `parseWrappedNum` — parsování wrapped measures

**Files:**
- Modify: `assets/js/3d/ifc-engine/geometry/step-helpers.js`
- Test: `tests/test-suites/ifc-wrapped-measure.test.js` (nový)
- Modify: `tests/test-runner.html` (registrace suity za řádek s `points-bbox.test.js`, ~550)

**Interfaces:**
- Produces: `parseWrappedNum(raw: string) → { value: number, type: string|null } | null`
  - `'IFCLENGTHMEASURE(1133.04)'` → `{ value: 1133.04, type: 'IFCLENGTHMEASURE' }`
  - `'5.49'` → `{ value: 5.49, type: null }`
  - `'$'`, `'*'`, `undefined`, nenumerické → `null`

- [ ] **Step 1: Napiš failing test**

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('ifc-wrapped-measure — parseWrappedNum', () => {
    let fn;
    async function f() {
        if (!fn) ({ parseWrappedNum: fn } = await import('../../assets/js/3d/ifc-engine/geometry/step-helpers.js'));
        return fn;
    }
    it('wrapped IFCLENGTHMEASURE', async () => {
        const p = await f();
        const r = p('IFCLENGTHMEASURE(1133.0395005468245)');
        expect(Math.abs(r.value - 1133.0395005468245) < 1e-12).toBe(true);
        expect(r.type).toBe('IFCLENGTHMEASURE');
    });
    it('wrapped záporná hodnota', async () => {
        const p = await f();
        const r = p('IFCLENGTHMEASURE(-474.727528)');
        expect(Math.abs(r.value - (-474.727528)) < 1e-12).toBe(true);
    });
    it('IFCPARAMETERVALUE wrapper', async () => {
        const p = await f();
        const r = p('IFCPARAMETERVALUE(0.5)');
        expect(r.value).toBe(0.5);
        expect(r.type).toBe('IFCPARAMETERVALUE');
    });
    it('plain číslo → type null', async () => {
        const p = await f();
        const r = p('5.490770547176467');
        expect(Math.abs(r.value - 5.490770547176467) < 1e-12).toBe(true);
        expect(r.type).toBe(null);
    });
    it('$ / * / prázdné / text → null', async () => {
        const p = await f();
        expect(p('$')).toBe(null);
        expect(p('*')).toBe(null);
        expect(p('')).toBe(null);
        expect(p(undefined)).toBe(null);
        expect(p('IFCLABEL(\'abc\')')).toBe(null);
    });
});
```

Do `tests/test-runner.html` přidej za `<script src="test-suites/points-bbox.test.js"></script>`:
```html
    <script src="test-suites/ifc-wrapped-measure.test.js"></script>
```

- [ ] **Step 2: Ověř, že test padá**

Run: `node tests/run-tests.js 2>&1 | grep -A3 "wrapped"`
Expected: FAIL (parseWrappedNum is not a function / undefined)

- [ ] **Step 3: Implementace v step-helpers.js**

Přidej na konec `assets/js/3d/ifc-engine/geometry/step-helpers.js`:

```js
/**
 * Parse a STEP numeric value that may be wrapped in a typed measure:
 *   "IFCLENGTHMEASURE(1133.04)" → { value: 1133.04, type: 'IFCLENGTHMEASURE' }
 *   "5.49"                      → { value: 5.49, type: null }
 *   "$" / "*" / non-numeric     → null
 * IFC4.3 wraps IfcCurveSegment.SegmentStart/SegmentLength and
 * IfcPointByDistanceExpression.DistanceAlong this way.
 */
export function parseWrappedNum(raw) {
  if (!raw || raw === '$' || raw === '*') return null;
  const m = raw.match(/^([A-Z][A-Z0-9_]*)\((.*)\)$/s);
  const inner = m ? m[2] : raw;
  const n = parseFloat(inner);
  if (!Number.isFinite(n)) return null;
  return { value: n, type: m ? m[1] : null };
}
```

- [ ] **Step 4: Ověř, že testy projdou**

Run: `node tests/run-tests.js 2>&1 | tail -5`
Expected: PASS, 0 failures

- [ ] **Step 5: Commit**

```bash
git add assets/js/3d/ifc-engine/geometry/step-helpers.js tests/test-suites/ifc-wrapped-measure.test.js tests/test-runner.html
git commit -m "feat(3d): parseWrappedNum — IFC4.3 typed measure wrapper (plán ifc43-alignment)"
```

---

### Task 2: curve-evaluator — IfcCompositeCurve (line + circle, kotvení, terminátory)

**Files:**
- Create: `assets/js/3d/ifc-engine/alignment/curve-evaluator.js`
- Test: `tests/test-suites/ifc-curve-evaluator.test.js` (nový)
- Modify: `tests/test-runner.html`

**Interfaces:**
- Consumes: `parseWrappedNum` (Task 1), `splitParams` z `../parser/step-parser.js`, `parseRef`/`parseRefList` z `../geometry/step-helpers.js`, `EntityIndex` (byExpressId/byType).
- Produces (THREE-free — importovatelné z Node bez browseru!):
  - `evaluateCurve(entityIndex, curveExpressId) → CurveEval | null` — přijímá expressId `IFCCOMPOSITECURVE` (Task 2) i `IFCGRADIENTCURVE` (Task 4).
  - `CurveEval = {`
    - `length: number` — celková vodorovná délka (Σ|SegmentLength| přes nenulové segmenty),
    - `is3D: boolean` — false pro composite, true pro gradient,
    - `evalAt(d: number) → { point: [x,y,z], azimuth: number }` — PŘESNÉ analytické vyhodnocení (žádná interpolace z polylinie); `d` mimo rozsah se ořízne na kraje; `z=0` pro composite; `azimuth` = úhel vodorovné tečny v radiánech od +X CCW,
    - `sample(step = 1.0) → { points: [[x,y,z],...], stations: [number,...], tangents: [[dx,dy,dz],...], elementIndex: [number,...] }` — stations od 0 (posun na staničení dělá volající)
  - `}`
  - `getCurveEval(entityIndex, id)` — memoizace přes `entityIndex._curveEvalCache` (Map).
- Vnitřní architektura (privátní, ale Task 3/4 do ní přidávají větve):
  - `localEvaluator(entityIndex, parentCurveId) → { pointAt(t):[x,y], dirAt(t):rad, toParam(wrapped):t, paramToLength(tSpan):number } | null` — switch podle typu parent curve. Task 2: `IFCLINE`, `IFCCIRCLE`. Task 3: `IFCCLOTHOID`. Task 4: `IFCPOLYNOMIALCURVE`.
  - `buildSegmentEval(entityIndex, curveSegmentId)` → předpočítá kotvení: `p0 = pointAt(t0)`, `d0 = dirAt(t0)`, `rot = placementAngle − d0`, `worldPointAt(t) = L + Rot(rot)·(pointAt(t) − p0)`, `worldDirAt(t) = dirAt(t) + rot`. Vrací `{ length, at(s):{point2:[x,y], azimuth} }` kde `s ∈ [0, length]` a `t(s) = t0 + sign(tSpan)·(s → param)`.

**Matematika kotvení (jádro celé implementace):**
- `IfcCurveSegment(Transition, Placement, SegmentStart, SegmentLength, ParentCurve)`.
- `Placement` = `IFCAXIS2PLACEMENT2D(Location, RefDirection)` → `L = [lx, ly]`, `placementAngle = atan2(refDir.y, refDir.x)` (default `(1,0)` → 0).
- Parent lokálně: 
  - `IFCLINE(Pnt, Dir)`: `Dir = IFCVECTOR(Orientation, Magnitude)`; `pointAt(t) = Pnt + t·Magnitude·Ô`; `dirAt(t) = atan2(Ôy, Ôx)`; LENGTHMEASURE `s` → `t = s/Magnitude`; délka úseku = `|tSpan|·Magnitude`.
  - `IFCCIRCLE(Position, R)`: `C(θ) = Position·(R·cosθ, R·sinθ)` (Position je Axis2Placement2D — aplikuj rotaci i posun); `dirAt(θ) = positionAngle + θ + π/2`; LENGTHMEASURE `s` → `θ = s/R`; délka = `|θSpan|·R`. Záporná SegmentLength (CW) NEVYŽADUJE žádný speciál — θ jde do záporna a kotvení orientaci vyřeší.
- Terminátor: `|SegmentLength| < 1e-9` → segment PŘESKOČ (nevstupuje do length ani do evalAt/sample).
- `evalAt(d)`: kumulativní délky `segStart[i]`; najdi segment binárně/lineárně; `s_local = d − segStart[i]`; vrať `seg.at(s_local)`.
- `sample(step)`: pro každý segment `N = clamp(ceil(length/step), 8, 4000)` vzorků (přímky: N = 2 pokud `!is3D`), první vzorek segmentu po prvním segmentu přeskoč (duplicita hranic — stejně jako `discretize.js`).

- [ ] **Step 1: Napiš failing testy**

`tests/test-suites/ifc-curve-evaluator.test.js` — fixture staví entityIndex z STEP textu přes existující parser:

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('ifc-curve-evaluator — composite curve (line+circle)', () => {
    let evaluateCurve, parseStepText, EntityIndex;
    async function mods() {
        if (!evaluateCurve) {
            ({ evaluateCurve } = await import('../../assets/js/3d/ifc-engine/alignment/curve-evaluator.js'));
            ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
            ({ EntityIndex } = await import('../../assets/js/3d/ifc-engine/parser/entity-index.js'));
        }
    }
    function idx(step) {
        const { entities } = parseStepText(step);
        return new EntityIndex(entities);
    }
    // Přímka 100 m (+X) → CCW oblouk R=50 čtvrtkruh → DISCONTINUOUS terminátor.
    // Očekávaný konec oblouku: (150, 50), tečna +Y.
    const FIXTURE = `
#1=IFCCARTESIANPOINT((0.,0.));
#2=IFCDIRECTION((1.,0.));
#3=IFCAXIS2PLACEMENT2D(#1,#2);
#5=IFCVECTOR(#2,1.);
#4=IFCLINE(#1,#5);
#6=IFCCURVESEGMENT(.CONTINUOUS.,#3,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(100.),#4);
#7=IFCCARTESIANPOINT((100.,0.));
#8=IFCAXIS2PLACEMENT2D(#7,#2);
#11=IFCCIRCLE(#3,50.);
#12=IFCCURVESEGMENT(.CONTINUOUS.,#8,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(78.53981633974483),#11);
#13=IFCCARTESIANPOINT((150.,50.));
#14=IFCDIRECTION((0.,1.));
#15=IFCAXIS2PLACEMENT2D(#13,#14);
#16=IFCCURVESEGMENT(.DISCONTINUOUS.,#15,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(0.),#11);
#17=IFCCOMPOSITECURVE((#6,#12,#16),.F.);
`;
    it('délka = 178.54 (terminátor nepočítán)', async () => {
        await mods();
        const ce = evaluateCurve(idx(FIXTURE), 17);
        expect(Math.abs(ce.length - 178.53981633974483) < 1e-9).toBe(true);
    });
    it('evalAt uprostřed přímky', async () => {
        await mods();
        const ce = evaluateCurve(idx(FIXTURE), 17);
        const r = ce.evalAt(50);
        expect(Math.abs(r.point[0] - 50) < 1e-9).toBe(true);
        expect(Math.abs(r.point[1]) < 1e-9).toBe(true);
        expect(Math.abs(r.azimuth) < 1e-9).toBe(true);
    });
    it('evalAt na konci CCW oblouku: (150,50), tečna +Y', async () => {
        await mods();
        const ce = evaluateCurve(idx(FIXTURE), 17);
        const r = ce.evalAt(178.53981633974483);
        expect(Math.abs(r.point[0] - 150) < 1e-6).toBe(true);
        expect(Math.abs(r.point[1] - 50) < 1e-6).toBe(true);
        expect(Math.abs(r.azimuth - Math.PI / 2) < 1e-6).toBe(true);
    });
    it('evalAt v půlce oblouku (45°): x=100+50·sin45, y=50·(1−cos45)', async () => {
        await mods();
        const ce = evaluateCurve(idx(FIXTURE), 17);
        const r = ce.evalAt(100 + 78.53981633974483 / 2);
        expect(Math.abs(r.point[0] - (100 + 50 * Math.SQRT1_2)) < 1e-6).toBe(true);
        expect(Math.abs(r.point[1] - 50 * (1 - Math.SQRT1_2)) < 1e-6).toBe(true);
    });
    it('CW oblouk (záporná SegmentLength) zatáčí doprava', async () => {
        await mods();
        // Jen oblouk: start (0,0) směr +X, R=50, délka −78.54 (CW čtvrtkruh) → konec (50,−50), tečna −Y
        const cw = `
#1=IFCCARTESIANPOINT((0.,0.));
#2=IFCDIRECTION((1.,0.));
#3=IFCAXIS2PLACEMENT2D(#1,#2);
#11=IFCCIRCLE(#3,50.);
#12=IFCCURVESEGMENT(.CONTINUOUS.,#3,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(-78.53981633974483),#11);
#17=IFCCOMPOSITECURVE((#12),.F.);
`;
        const ce = evaluateCurve(idx(cw), 17);
        const r = ce.evalAt(78.53981633974483);
        expect(Math.abs(r.point[0] - 50) < 1e-6).toBe(true);
        expect(Math.abs(r.point[1] - (-50)) < 1e-6).toBe(true);
        expect(Math.abs(r.azimuth - (-Math.PI / 2)) < 1e-6).toBe(true);
    });
    it('sample vrací parallel arrays a monotónní stations', async () => {
        await mods();
        const ce = evaluateCurve(idx(FIXTURE), 17);
        const s = ce.sample(1.0);
        expect(s.points.length).toBe(s.stations.length);
        expect(s.points.length).toBe(s.tangents.length);
        expect(s.points.length > 10).toBe(true);
        let mono = true;
        for (let i = 1; i < s.stations.length; i++) if (s.stations[i] <= s.stations[i - 1]) mono = false;
        expect(mono).toBe(true);
        const last = s.points[s.points.length - 1];
        expect(Math.abs(last[0] - 150) < 0.01).toBe(true);
        expect(Math.abs(last[1] - 50) < 0.01).toBe(true);
    });
    it('neznámý typ → null', async () => {
        await mods();
        const ce = evaluateCurve(idx('#1=IFCCARTESIANPOINT((0.,0.));'), 1);
        expect(ce).toBe(null);
    });
});
```

Registruj v `tests/test-runner.html` za `ifc-wrapped-measure.test.js`.

- [ ] **Step 2: Ověř FAIL**

Run: `node tests/run-tests.js 2>&1 | grep -B1 -A3 "curve-evaluator"`
Expected: FAIL (module not found)

- [ ] **Step 3: Implementuj `curve-evaluator.js`**

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
// IFC 4.3 geometric-layer alignment curve evaluator (THREE-free).
//
// Vyhodnocuje IfcCompositeCurve (2D půdorys) a IfcGradientCurve (3D osa =
// půdorys + niveleta) přes IfcCurveSegment:
//   IfcCurveSegment(Transition, Placement, SegmentStart, SegmentLength, ParentCurve)
// ParentCurve je šablona v LOKÁLNÍM prostoru; úsek parametru
// [SegmentStart, SegmentStart+SegmentLength] se kotví tak, aby bod
// t=SegmentStart ležel v Placement.Location a tečna mířila v RefDirection.
//
// Pasti (viz docs — implementační podklad):
//   - poslední segment je nulové délky s .DISCONTINUOUS. → přeskočit
//   - CW oblouk = záporná SegmentLength; poloměr IfcCircle vždy kladný
//   - klotoida: κ(t) = t/(A·|A|) — A i SegmentStart mohou být záporné
//   - parametrizace gradient curve = VODOROVNÝ průmět

import { splitParams } from '../parser/step-parser.js';
import { parseRef, parseRefList, parseWrappedNum } from '../geometry/step-helpers.js';

const EPS_LEN = 1e-9;

function readVec2(entityIndex, id) {
  const e = entityIndex.byExpressId(id);
  if (!e) return null;
  const m = e.params.match(/\(([^)]*)\)/);
  if (!m) return null;
  const nums = m[1].split(',').map(s => parseFloat(s.trim()));
  return Number.isFinite(nums[0]) && Number.isFinite(nums[1]) ? [nums[0], nums[1]] : null;
}

/** IfcAxis2Placement2D → { loc:[x,y], angle } (default (0,0)/0). */
function readPlacement2D(entityIndex, id) {
  const e = entityIndex.byExpressId(id);
  if (!e || e.type !== 'IFCAXIS2PLACEMENT2D') return { loc: [0, 0], angle: 0 };
  const parts = splitParams(e.params);
  const loc = readVec2(entityIndex, parseRef(parts[0])) || [0, 0];
  const refDirId = parseRef(parts[1]);
  const rd = refDirId ? readVec2(entityIndex, refDirId) : null;
  return { loc, angle: rd ? Math.atan2(rd[1], rd[0]) : 0 };
}

/** Číselný seznam "(a,b,c)" → [a,b,c]. */
function readNumList(raw) {
  if (!raw || raw === '$') return [];
  const inner = raw.replace(/^\(/, '').replace(/\)$/, '');
  return inner.split(',').map(s => parseFloat(s.trim())).filter(Number.isFinite);
}

/**
 * Lokální evaluátor parent curve. Vrací:
 *   pointAt(t) → [x,y] v lokálním prostoru parent curve
 *   dirAt(t)   → úhel tečny (rad)
 *   toParam(wrapped) → převod SegmentStart/SegmentLength na nativní parametr
 *   paramToLength(tSpan) → oblouková délka úseku parametru
 */
function localEvaluator(entityIndex, parentId) {
  const e = entityIndex.byExpressId(parentId);
  if (!e) return null;
  const parts = splitParams(e.params);

  if (e.type === 'IFCLINE') {
    const pnt = readVec2(entityIndex, parseRef(parts[0])) || [0, 0];
    const vec = entityIndex.byExpressId(parseRef(parts[1]));
    let ori = [1, 0], mag = 1;
    if (vec && vec.type === 'IFCVECTOR') {
      const vp = splitParams(vec.params);
      ori = readVec2(entityIndex, parseRef(vp[0])) || [1, 0];
      const m = parseWrappedNum(vp[1]);
      if (m && m.value !== 0) mag = m.value;
    }
    const n = Math.hypot(ori[0], ori[1]) || 1;
    const ux = ori[0] / n, uy = ori[1] / n;
    return {
      pointAt: t => [pnt[0] + t * mag * ux, pnt[1] + t * mag * uy],
      dirAt: () => Math.atan2(uy, ux),
      toParam: w => (w.type === 'IFCPARAMETERVALUE') ? w.value : w.value / mag,
      paramToLength: tSpan => Math.abs(tSpan) * mag,
    };
  }

  if (e.type === 'IFCCIRCLE') {
    const pos = readPlacement2D(entityIndex, parseRef(parts[0]));
    const R = parseFloat(parts[1]);
    if (!Number.isFinite(R) || R <= 0) return null;
    const cos = Math.cos(pos.angle), sin = Math.sin(pos.angle);
    return {
      pointAt: th => {
        const lx = R * Math.cos(th), ly = R * Math.sin(th);
        return [pos.loc[0] + lx * cos - ly * sin, pos.loc[1] + lx * sin + ly * cos];
      },
      dirAt: th => pos.angle + th + Math.PI / 2,
      toParam: w => (w.type === 'IFCPARAMETERVALUE') ? w.value : w.value / R,
      paramToLength: thSpan => Math.abs(thSpan) * R,
    };
  }

  return null; // IFCCLOTHOID (Task 3), IFCPOLYNOMIALCURVE (Task 4)
}

/**
 * Předpočítá kotvení segmentu na jeho Placement.
 * @returns { length, at(s) } — s ∈ [0, length] po obloukové délce, nebo null.
 */
function buildSegmentEval(entityIndex, segId) {
  const e = entityIndex.byExpressId(segId);
  if (!e || e.type !== 'IFCCURVESEGMENT') return null;
  const parts = splitParams(e.params);
  const placement = readPlacement2D(entityIndex, parseRef(parts[1]));
  const startW = parseWrappedNum(parts[2]);
  const lenW = parseWrappedNum(parts[3]);
  const parent = localEvaluator(entityIndex, parseRef(parts[4]));
  if (!startW || !lenW || !parent) return null;

  const t0 = parent.toParam(startW);
  const tSpan = parent.toParam(lenW) - (lenW.type === 'IFCPARAMETERVALUE' ? 0 : parent.toParam({ value: 0, type: lenW.type }));
  const length = parent.paramToLength(tSpan);
  if (length < EPS_LEN) return { length: 0, at: null }; // terminátor

  const p0 = parent.pointAt(t0);
  const d0 = parent.dirAt(t0);
  const rot = placement.angle - d0;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const sign = tSpan < 0 ? -1 : 1;
  const paramPerLen = Math.abs(tSpan) / length;

  return {
    length,
    at: s => {
      const t = t0 + sign * s * paramPerLen;
      const p = parent.pointAt(t);
      const dx = p[0] - p0[0], dy = p[1] - p0[1];
      return {
        point2: [placement.loc[0] + dx * cr - dy * sr, placement.loc[1] + dx * sr + dy * cr],
        azimuth: parent.dirAt(t) + rot,
      };
    },
  };
}

/** Sestaví seznam segment evaluátorů + kumulativní staničení. */
function buildSegments(entityIndex, segIds) {
  const segs = [];
  let cum = 0;
  for (const id of segIds) {
    const se = buildSegmentEval(entityIndex, id);
    if (!se || se.length < EPS_LEN) continue;
    segs.push({ start: cum, ...se });
    cum += se.length;
  }
  return { segs, total: cum };
}

function evalOnSegments(segs, total, d) {
  if (segs.length === 0) return null;
  const dd = Math.max(0, Math.min(d, total));
  let lo = 0, hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].start <= dd) lo = mid; else hi = mid - 1;
  }
  const seg = segs[lo];
  return seg.at(Math.min(dd - seg.start, seg.length));
}

/**
 * Vyhodnotí IfcCompositeCurve nebo IfcGradientCurve.
 * @returns {CurveEval|null} — viz plán, sekce Interfaces.
 */
export function evaluateCurve(entityIndex, curveExpressId) {
  const e = entityIndex.byExpressId(curveExpressId);
  if (!e) return null;
  if (e.type === 'IFCCOMPOSITECURVE') {
    const parts = splitParams(e.params);
    const { segs, total } = buildSegments(entityIndex, parseRefList(parts[0]));
    if (segs.length === 0) return null;
    return makeCurveEval(segs, total, null);
  }
  return null; // IFCGRADIENTCURVE — Task 4
}

function makeCurveEval(segs, total, verticalEval) {
  const evalAt = d => {
    const r = evalOnSegments(segs, total, d);
    if (!r) return null;
    const z = verticalEval ? verticalEval(Math.max(0, Math.min(d, total))) : 0;
    return { point: [r.point2[0], r.point2[1], z], azimuth: r.azimuth };
  };
  return {
    length: total,
    is3D: !!verticalEval,
    evalAt,
    sample(step = 1.0) {
      const points = [], stations = [], tangents = [], elementIndex = [];
      for (let si = 0; si < segs.length; si++) {
        const seg = segs[si];
        const n = Math.max(2, Math.min(4000, Math.ceil(seg.length / step) + 1));
        for (let i = (si === 0 ? 0 : 1); i < n; i++) {
          const s = seg.start + (seg.length * i) / (n - 1);
          const r = evalAt(s);
          points.push(r.point);
          stations.push(s);
          tangents.push([Math.cos(r.azimuth), Math.sin(r.azimuth), 0]);
          elementIndex.push(si);
        }
      }
      return { points, stations, tangents, elementIndex };
    },
  };
}

/** Memoizovaná varianta — cache na entityIndex (zahazuje se s indexem). */
export function getCurveEval(entityIndex, id) {
  let cache = entityIndex._curveEvalCache;
  if (!cache) cache = entityIndex._curveEvalCache = new Map();
  if (cache.has(id)) return cache.get(id);
  const ce = evaluateCurve(entityIndex, id);
  cache.set(id, ce);
  return ce;
}
```

POZOR na `tSpan` výpočet: pro LENGTHMEASURE je `tSpan = lenW.value / (mag či R)` se znaménkem — zjednoduš: `const tSpan = parent.toParam(lenW);` (toParam zachovává znaménko a pro PARAMETERVALUE vrací hodnotu přímo). Uprav kód dle toho — řádek s `parent.toParam({value:0,...})` je zbytečný artefakt, výsledek musí být: `const tSpan = parent.toParam(lenW);`.

- [ ] **Step 4: Ověř PASS**

Run: `node tests/run-tests.js 2>&1 | tail -5`
Expected: PASS, 0 failures

- [ ] **Step 5: Commit**

```bash
git add assets/js/3d/ifc-engine/alignment/curve-evaluator.js tests/test-suites/ifc-curve-evaluator.test.js tests/test-runner.html
git commit -m "feat(3d): evaluátor IfcCompositeCurve — line/circle segmenty s kotvením (plán ifc43-alignment)"
```

---

### Task 3: curve-evaluator — IfcClothoid (κ(t) = t/(A·|A|))

**Files:**
- Modify: `assets/js/3d/ifc-engine/alignment/curve-evaluator.js` (větev v `localEvaluator`)
- Modify: `tests/test-suites/ifc-curve-evaluator.test.js` (nový describe blok)

**Interfaces:**
- Consumes/Produces: beze změny API — jen nová větev `IFCCLOTHOID` v `localEvaluator`.

**Matematika:** `IFCCLOTHOID(Position, A)`; `AA = A·|A|` (zachovává znaménko!). Lokálně (před Position transformací):
```
x(t) = ∫₀ᵗ cos(s²/(2·AA)) ds,  y(t) = ∫₀ᵗ sin(s²/(2·AA)) ds,  dir(t) = t²/(2·AA)
```
Integrál numericky (kompozitní Simpson, krok ≤ 0.25 m, integrace od 0 do t včetně záporných t). Parametr t = oblouková délka → `toParam` = identita pro LENGTHMEASURE i PARAMETERVALUE, `paramToLength = |tSpan|`. Position (Axis2Placement2D) aplikuj stejně jako u kružnice (rotace+posun lokálního bodu, `dirAt += positionAngle`).

- [ ] **Step 1: Napiš failing testy** (přidej do `ifc-curve-evaluator.test.js`)

```js
describe('ifc-curve-evaluator — klotoida', () => {
    let evaluateCurve, parseStepText, EntityIndex;
    async function mods() {
        if (!evaluateCurve) {
            ({ evaluateCurve } = await import('../../assets/js/3d/ifc-engine/alignment/curve-evaluator.js'));
            ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
            ({ EntityIndex } = await import('../../assets/js/3d/ifc-engine/parser/entity-index.js'));
        }
    }
    function idx(step) { return new EntityIndex(parseStepText(step).entities); }
    // Numerická křivost ze 3 bodů (finite difference přes evalAt)
    function curvatureAt(ce, d, h = 0.5) {
        const a = ce.evalAt(d - h).azimuth, b = ce.evalAt(d + h).azimuth;
        let dth = b - a;
        while (dth > Math.PI) dth -= 2 * Math.PI;
        while (dth < -Math.PI) dth += 2 * Math.PI;
        return dth / (2 * h);
    }
    function clothoidFixture(A, segStart, segLen) {
        return `
#1=IFCCARTESIANPOINT((0.,0.));
#2=IFCDIRECTION((1.,0.));
#3=IFCAXIS2PLACEMENT2D(#1,#2);
#4=IFCCLOTHOID(#3,${A});
#5=IFCCURVESEGMENT(.CONTINUOUS.,#3,IFCLENGTHMEASURE(${segStart}),IFCLENGTHMEASURE(${segLen}),#4);
#6=IFCCOMPOSITECURVE((#5),.F.);
`;
    }
    // Vjezdová přechodnice 0 → R=300 vlevo, L=60: A=+√18000, SegmentStart=0
    it('0→+κ (vjezd do levého oblouku)', async () => {
        await mods();
        const A = Math.sqrt(60 * 300);
        const ce = evaluateCurve(idx(clothoidFixture(A, 0, 60)), 6);
        expect(Math.abs(curvatureAt(ce, 1) - 0) < 1e-3).toBe(true);
        expect(Math.abs(curvatureAt(ce, 59) - 1 / 300) < 1e-4).toBe(true);
        // celková změna směru = L²/(2·A²) = 0.1 rad
        expect(Math.abs(ce.evalAt(60).azimuth - 0.1) < 1e-4).toBe(true);
    });
    // PAST č. 3: výjezd z LEVÉHO oblouku R=300 → ∞: A=−√18000, SegmentStart=κ₁·A·|A|=−60
    it('+κ→0 (výjezd z levého oblouku, A<0, SegmentStart<0)', async () => {
        await mods();
        const A = -Math.sqrt(60 * 300);
        const ce = evaluateCurve(idx(clothoidFixture(A, -60, 60)), 6);
        // na začátku κ=+1/300 (levotočivá!), na konci κ→0
        expect(Math.abs(curvatureAt(ce, 1) - 1 / 300) < 1e-4).toBe(true);
        expect(Math.abs(curvatureAt(ce, 59)) < 1e-3).toBe(true);
        // směr se mění o +0.1 rad (doleva) — zrcadlová větev by dala −0.1
        expect(Math.abs((ce.evalAt(60).azimuth - ce.evalAt(0).azimuth) - 0.1) < 1e-3).toBe(true);
    });
    // 0→−κ (vjezd do pravého oblouku): A=−√18000, SegmentStart=0
    it('0→−κ (vjezd do pravého oblouku)', async () => {
        await mods();
        const A = -Math.sqrt(60 * 300);
        const ce = evaluateCurve(idx(clothoidFixture(A, 0, 60)), 6);
        expect(Math.abs(curvatureAt(ce, 59) - (-1 / 300)) < 1e-4).toBe(true);
    });
    // −κ→0 (výjezd z pravého oblouku): A=+√18000, SegmentStart=κ₁·A·|A|=−60
    it('−κ→0 (výjezd z pravého oblouku)', async () => {
        await mods();
        const A = Math.sqrt(60 * 300);
        const ce = evaluateCurve(idx(clothoidFixture(A, -60, 60)), 6);
        expect(Math.abs(curvatureAt(ce, 1) - (-1 / 300)) < 1e-4).toBe(true);
        expect(Math.abs(curvatureAt(ce, 59)) < 1e-3).toBe(true);
    });
    // +κ→+κ′ (mezi levými oblouky R=300→R=150, L=60):
    // Δκ=1/150−1/300=1/300 → A=+√(60·300)=√18000, SegmentStart=κ₁·A·|A|=(1/300)·18000=60
    it('+κ→+κ′ (zvětšení levé křivosti)', async () => {
        await mods();
        const A = Math.sqrt(60 * 300);
        const ce = evaluateCurve(idx(clothoidFixture(A, 60, 60)), 6);
        expect(Math.abs(curvatureAt(ce, 1) - 1 / 300) < 1e-4).toBe(true);
        expect(Math.abs(curvatureAt(ce, 59) - 1 / 150) < 1e-4).toBe(true);
    });
    // −κ→−κ′: A=−√18000, SegmentStart=(−1/300)·(−18000)=60
    it('−κ→−κ′ (zvětšení pravé křivosti)', async () => {
        await mods();
        const A = -Math.sqrt(60 * 300);
        const ce = evaluateCurve(idx(clothoidFixture(A, 60, 60)), 6);
        expect(Math.abs(curvatureAt(ce, 1) - (-1 / 300)) < 1e-4).toBe(true);
        expect(Math.abs(curvatureAt(ce, 59) - (-1 / 150)) < 1e-4).toBe(true);
    });
});
```

- [ ] **Step 2: Ověř FAIL** — `node tests/run-tests.js 2>&1 | grep -A3 "klotoida"` → FAIL (localEvaluator vrací null → evaluateCurve null → TypeError).

- [ ] **Step 3: Implementuj klotoidu** — do `localEvaluator` přidej před `return null`:

```js
  if (e.type === 'IFCCLOTHOID') {
    const pos = readPlacement2D(entityIndex, parseRef(parts[0]));
    const A = parseFloat(parts[1]);
    if (!Number.isFinite(A) || A === 0) return null;
    const AA = A * Math.abs(A); // zachovává znaménko — NIKDY A²!
    const cos = Math.cos(pos.angle), sin = Math.sin(pos.angle);
    // Fresnel: ∫₀ᵗ cos/sin(s²/(2AA)) ds — kompozitní Simpson, krok ≤ 0.25 m.
    const fresnel = t => {
      const n = Math.max(2, 2 * Math.ceil(Math.abs(t) / 0.5)); // sudý počet dílků
      const h = t / n;
      let sx = Math.cos(0), sy = Math.sin(0); // f(0): cos(0)=1, sin(0)=0
      for (let i = 1; i < n; i++) {
        const s = i * h, w = (i % 2 === 1) ? 4 : 2, a = (s * s) / (2 * AA);
        sx += w * Math.cos(a); sy += w * Math.sin(a);
      }
      const aT = (t * t) / (2 * AA);
      sx += Math.cos(aT); sy += Math.sin(aT);
      return [(h / 3) * sx, (h / 3) * sy];
    };
    return {
      pointAt: t => {
        const [lx, ly] = fresnel(t);
        return [pos.loc[0] + lx * cos - ly * sin, pos.loc[1] + lx * sin + ly * cos];
      },
      dirAt: t => pos.angle + (t * t) / (2 * AA),
      toParam: w => w.value,
      paramToLength: tSpan => Math.abs(tSpan),
    };
  }
```

POZOR: `dirAt` pro záporná t — `t²/(2AA)` je sudá funkce, směr na záporné větvi je stejný jako na kladné se stejným |t|; to je SPRÁVNĚ (zrcadlová symetrie klotoidy je v y(t), liché funkci — Fresnel sinus integrál od 0 do záporného t dává záporný výsledek). Neopravuj to.

- [ ] **Step 4: Ověř PASS** — `node tests/run-tests.js 2>&1 | tail -5` → 0 failures.

- [ ] **Step 5: Commit**

```bash
git add assets/js/3d/ifc-engine/alignment/curve-evaluator.js tests/test-suites/ifc-curve-evaluator.test.js
git commit -m "feat(3d): klotoida v curve-evaluatoru — κ(t)=t/(A·|A|), všech 6 kombinací testováno (plán ifc43-alignment)"
```

---

### Task 4: curve-evaluator — IfcGradientCurve (niveleta: line + polynomial)

**Files:**
- Modify: `assets/js/3d/ifc-engine/alignment/curve-evaluator.js`
- Modify: `tests/test-suites/ifc-curve-evaluator.test.js`

**Interfaces:**
- `evaluateCurve` nyní přijímá i `IFCGRADIENTCURVE(Segments, SelfIntersect, BaseCurve, EndPoint)` → `CurveEval` s `is3D: true`; `evalAt(d).point[2]` = výška z vertikálních segmentů; `d` = staničení po BaseCurve (vodorovný průmět).
- Vertikální segmenty jsou `IFCCURVESEGMENT` v souřadnicích (distAlong, výška) s parenty `IFCLINE` (konstantní sklon) a `IFCPOLYNOMIALCURVE` (parabola). `IFCPOLYNOMIALCURVE(Position, CoefficientsX, CoefficientsY, CoefficientsZ)`: lokálně `x(t)=Σ cx_i·tⁱ`, `y(t)=Σ cy_i·tⁱ`; v praxi `CoefficientsX=(0,1)` → x=t.
- Mapování d→segment: vertikální segment pokrývá `[placement.loc.x, placement.loc.x + horizontalLength]`; vyhodnocení: `t = t0 + (d − loc.x)`, `z = loc.y + (localY(t) − localY(t0))` — translační kotvení v (staničení, výška) rovině (rotace se u nivelet nepoužívá; exportéři kódují sklon do koeficientů/RefDirection).

**Implementační poznámka:** vertikální větev NEPOUŽÍVÁ `buildSegmentEval` (jiná parametrizace — vodorovný průmět místo obloukové délky). Napiš `buildVerticalEval(entityIndex, segIds) → (d → z)`:
- pro každý nenulový segment přečti `placement2D` (loc = [distAlong₀, z₀]), `t0 = toParam(SegmentStart)`, `hLen = |SegmentLength|` (LENGTHMEASURE = vodorovná délka),
- parent `IFCLINE`: sklon `g = uy/ux` z Orientation vektoru → `z(d) = z₀ + g·(d − distAlong₀)`,
- parent `IFCPOLYNOMIALCURVE`: `z(d) = z₀ + (polyY(t0 + (d − distAlong₀)) − polyY(t0))` kde `polyY(t) = Σ cy_i·tⁱ`,
- segmenty seřaď podle `distAlong₀`; `z(d)` = segment kde `distAlong₀ ≤ d < distAlong₀+hLen`; před prvním/za posledním drž krajní hodnotu.

- [ ] **Step 1: Failing testy** (nový describe blok):

```js
describe('ifc-curve-evaluator — gradient curve (niveleta)', () => {
    let evaluateCurve, parseStepText, EntityIndex;
    async function mods() {
        if (!evaluateCurve) {
            ({ evaluateCurve } = await import('../../assets/js/3d/ifc-engine/alignment/curve-evaluator.js'));
            ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
            ({ EntityIndex } = await import('../../assets/js/3d/ifc-engine/parser/entity-index.js'));
        }
    }
    function idx(step) { return new EntityIndex(parseStepText(step).entities); }
    // Base: přímka 200 m +X. Niveleta: 0–100 m konstantní 2% od z=10;
    // 100–200 m parabola z=12+0.02x−0.0001x² (x od začátku segmentu) → z(200)=13, sklon na konci 0.
    const FIXTURE = `
#1=IFCCARTESIANPOINT((0.,0.));
#2=IFCDIRECTION((1.,0.));
#3=IFCAXIS2PLACEMENT2D(#1,#2);
#5=IFCVECTOR(#2,1.);
#4=IFCLINE(#1,#5);
#6=IFCCURVESEGMENT(.CONTINUOUS.,#3,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(200.),#4);
#7=IFCCOMPOSITECURVE((#6),.F.);
#10=IFCCARTESIANPOINT((0.,10.));
#11=IFCDIRECTION((1.,0.02));
#12=IFCAXIS2PLACEMENT2D(#10,#11);
#13=IFCVECTOR(#11,1.);
#14=IFCLINE(#10,#13);
#15=IFCCURVESEGMENT(.CONTSAMEGRADIENT.,#12,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(100.),#14);
#20=IFCCARTESIANPOINT((100.,12.));
#21=IFCAXIS2PLACEMENT2D(#20,#2);
#22=IFCPOLYNOMIALCURVE(#21,(0.,1.),(12.,0.02,-0.0001),$);
#23=IFCCURVESEGMENT(.CONTSAMEGRADIENT.,#21,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(100.),#22);
#30=IFCGRADIENTCURVE((#15,#23),.F.,#7,$);
`;
    it('is3D a délka po vodorovném průmětu', async () => {
        await mods();
        const ce = evaluateCurve(idx(FIXTURE), 30);
        expect(ce.is3D).toBe(true);
        expect(Math.abs(ce.length - 200) < 1e-9).toBe(true);
    });
    it('z na konstantním sklonu: z(0)=10, z(50)=11, z(100)=12', async () => {
        await mods();
        const ce = evaluateCurve(idx(FIXTURE), 30);
        expect(Math.abs(ce.evalAt(0).point[2] - 10) < 1e-9).toBe(true);
        expect(Math.abs(ce.evalAt(50).point[2] - 11) < 1e-6).toBe(true);
        expect(Math.abs(ce.evalAt(100).point[2] - 12) < 1e-6).toBe(true);
    });
    it('z na parabole: z(150)=12.75, z(200)=13', async () => {
        await mods();
        const ce = evaluateCurve(idx(FIXTURE), 30);
        // z(150) = 12 + 0.02·50 − 0.0001·2500 = 12.75
        expect(Math.abs(ce.evalAt(150).point[2] - 12.75) < 1e-6).toBe(true);
        expect(Math.abs(ce.evalAt(200).point[2] - 13) < 1e-6).toBe(true);
    });
    it('x,y z base curve zůstávají', async () => {
        await mods();
        const ce = evaluateCurve(idx(FIXTURE), 30);
        const r = ce.evalAt(150);
        expect(Math.abs(r.point[0] - 150) < 1e-9).toBe(true);
        expect(Math.abs(r.point[1]) < 1e-9).toBe(true);
    });
    it('sample dává 3D body s výškou', async () => {
        await mods();
        const ce = evaluateCurve(idx(FIXTURE), 30);
        const s = ce.sample(1.0);
        const mid = s.points[Math.floor(s.points.length / 2)];
        expect(mid[2] > 10).toBe(true);
    });
});
```

- [ ] **Step 2: Ověř FAIL** — gradient curve zatím vrací null → TypeError.

- [ ] **Step 3: Implementuj** — v `evaluateCurve` přidej větev:

```js
  if (e.type === 'IFCGRADIENTCURVE') {
    const parts = splitParams(e.params);
    const baseId = parseRef(parts[2]);
    const base = entityIndex.byExpressId(baseId);
    if (!base || base.type !== 'IFCCOMPOSITECURVE') return null;
    const bp = splitParams(base.params);
    const { segs, total } = buildSegments(entityIndex, parseRefList(bp[0]));
    if (segs.length === 0) return null;
    const verticalEval = buildVerticalEval(entityIndex, parseRefList(parts[0]));
    return makeCurveEval(segs, total, verticalEval);
  }
```

a novou funkci + polynomial větev v `localEvaluator`:

```js
  if (e.type === 'IFCPOLYNOMIALCURVE') {
    const cy = readNumList(parts[2]);
    const polyY = t => cy.reduce((acc, c, i) => acc + c * Math.pow(t, i), 0);
    return { polyY, toParam: w => w.value, isVerticalOnly: true };
  }
```

```js
/**
 * Niveleta: seznam vertikálních IfcCurveSegment → funkce d → z.
 * Souřadný prostor segmentů je (staničení po BaseCurve, výška);
 * kotvení translační: t = t0 + (d − loc.x), z = loc.y + (Y(t) − Y(t0)).
 */
function buildVerticalEval(entityIndex, segIds) {
  const entries = [];
  for (const id of segIds) {
    const e = entityIndex.byExpressId(id);
    if (!e || e.type !== 'IFCCURVESEGMENT') continue;
    const parts = splitParams(e.params);
    const placement = readPlacement2D(entityIndex, parseRef(parts[1]));
    const startW = parseWrappedNum(parts[2]);
    const lenW = parseWrappedNum(parts[3]);
    if (!startW || !lenW || Math.abs(lenW.value) < EPS_LEN) continue; // terminátor
    const parent = entityIndex.byExpressId(parseRef(parts[4]));
    if (!parent) continue;
    const pp = splitParams(parent.params);
    let zAt = null;
    if (parent.type === 'IFCLINE') {
      const vec = entityIndex.byExpressId(parseRef(pp[1]));
      let ori = [1, 0];
      if (vec && vec.type === 'IFCVECTOR') ori = readVec2(entityIndex, parseRef(splitParams(vec.params)[0])) || [1, 0];
      const g = ori[0] !== 0 ? ori[1] / ori[0] : 0;
      zAt = d => placement.loc[1] + g * (d - placement.loc[0]);
    } else if (parent.type === 'IFCPOLYNOMIALCURVE') {
      const cy = readNumList(pp[2]);
      const polyY = t => cy.reduce((acc, c, i) => acc + c * Math.pow(t, i), 0);
      const t0 = startW.value;
      const y0 = polyY(t0);
      zAt = d => placement.loc[1] + (polyY(t0 + (d - placement.loc[0])) - y0);
    }
    if (zAt) entries.push({ from: placement.loc[0], to: placement.loc[0] + Math.abs(lenW.value), zAt });
  }
  entries.sort((a, b) => a.from - b.from);
  if (entries.length === 0) return null;
  return d => {
    if (d <= entries[0].from) return entries[0].zAt(entries[0].from);
    for (let i = entries.length - 1; i >= 0; i--) {
      if (d >= entries[i].from) return entries[i].zAt(Math.min(d, entries[i].to));
    }
    return entries[0].zAt(entries[0].from);
  };
}
```

(Polynomial větev v `localEvaluator` reálně nepotřebuješ — `buildVerticalEval` čte parenty přímo; přidej ji jen pokud to zjednoduší kód, jinak vynech. Rozhodni při implementaci, testy jsou zdrojem pravdy.)

- [ ] **Step 4: Ověř PASS** — `node tests/run-tests.js 2>&1 | tail -5` → 0 failures.

- [ ] **Step 5: Commit**

```bash
git add assets/js/3d/ifc-engine/alignment/curve-evaluator.js tests/test-suites/ifc-curve-evaluator.test.js
git commit -m "feat(3d): IfcGradientCurve — niveleta (constant gradient + parabola), vodorovná parametrizace (plán ifc43-alignment)"
```

---

### Task 5: IfcLinearPlacement — resolvePlacement dispatch + CartesianPosition + compact keep

**Files:**
- Create: `assets/js/3d/ifc-engine/alignment/linear-placement.js`
- Modify: `assets/js/3d/ifc-engine/geometry/placement.js`
- Modify: `assets/js/3d/ifc-engine/parser/entity-index.js` (compact closure)
- Modify: `assets/js/3d/ifc-engine/cache/model-cache.js` (`GEOMETRY_PIPELINE_VERSION` 1 → 2)
- Test: `tests/test-suites/ifc-linear-placement.test.js` (nový)
- Modify: `tests/test-runner.html`

**Interfaces:**
- Consumes: `getCurveEval` (Task 2–4), `parseWrappedNum` (Task 1), `placement3DToMatrix` — NOVĚ exportovaná z `placement.js`.
- Produces:
  - `linear-placement.js`: `evalPointByDistance(entityIndex, pbdeExpressId) → { position:[x,y,z], azimuth:number } | null`; `resolveLinearPlacement(entityIndex, expressId) → THREE.Matrix4 | null` (matice v JEDNOTKÁCH MODELU — lengthScale řeší downstream pipeline stejně jako u lokálních placementů).
  - `placement.js`: `resolvePlacement` dispatchuje `IFCLINEARPLACEMENT` → `resolveLinearPlacement`; exportuje `placement3DToMatrix`.
  - Kruhový import `placement.js ↔ linear-placement.js` je záměrný a bezpečný (obě vazby jen call-time uvnitř funkcí).
- Priorita: `CartesianPosition` (3. atribut) pokud vyplněn → `placement3DToMatrix`; jinak evaluace křivky. Řetězení `PlacementRelTo` (1. atribut) přes `resolvePlacement` v obou cestách.
- Orientace bez explicitních os: tečný rámec — `Z = (0,0,1)`, `X = (cos az, sin az, 0)`, `Y = Z × X`. Explicitní `Axis`/`RefDirection` z `IfcAxis2PlacementLinear` respektuj (stejná ortonormalizace jako `placement3DToMatrix`).
- Offsety: `pozice = P + OffsetLateral·(−sin az, cos az, 0) + OffsetVertical·(0,0,1)` (kladně vlevo/nahoru). `OffsetLongitudinal` (4. atribut): přičti k `DistanceAlong` před evaluací.

- [ ] **Step 1: Failing testy**

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('ifc-linear-placement — IfcLinearPlacement', () => {
    let resolvePlacement, resolveLinearPlacement, evalPointByDistance, parseStepText, EntityIndex;
    async function mods() {
        if (!resolvePlacement) {
            ({ resolvePlacement } = await import('../../assets/js/3d/ifc-engine/geometry/placement.js'));
            ({ resolveLinearPlacement, evalPointByDistance } = await import('../../assets/js/3d/ifc-engine/alignment/linear-placement.js'));
            ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
            ({ EntityIndex } = await import('../../assets/js/3d/ifc-engine/parser/entity-index.js'));
        }
    }
    function idx(step) { return new EntityIndex(parseStepText(step).entities); }
    // Base: gradient curve — přímka 200 m +X, konstantní 2 % od z=10 (redukce fixture z Task 4)
    const BASE = `
#1=IFCCARTESIANPOINT((0.,0.));
#2=IFCDIRECTION((1.,0.));
#3=IFCAXIS2PLACEMENT2D(#1,#2);
#5=IFCVECTOR(#2,1.);
#4=IFCLINE(#1,#5);
#6=IFCCURVESEGMENT(.CONTINUOUS.,#3,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(200.),#4);
#7=IFCCOMPOSITECURVE((#6),.F.);
#10=IFCCARTESIANPOINT((0.,10.));
#11=IFCDIRECTION((1.,0.02));
#12=IFCAXIS2PLACEMENT2D(#10,#11);
#13=IFCVECTOR(#11,1.);
#14=IFCLINE(#10,#13);
#15=IFCCURVESEGMENT(.CONTSAMEGRADIENT.,#12,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(200.),#14);
#30=IFCGRADIENTCURVE((#15),.F.,#7,$);
`;
    it('evalPointByDistance: bod + offsety (lateral kladně VLEVO)', async () => {
        await mods();
        // d=50, lateral +2 (vlevo = +Y při azimutu 0), vertical +1 → (50, 2, 12)  [z=10+0.02·50+1]
        const step = BASE + `
#40=IFCPOINTBYDISTANCEEXPRESSION(IFCLENGTHMEASURE(50.),2.,1.,$,#30);
`;
        const r = evalPointByDistance(idx(step), 40);
        expect(Math.abs(r.position[0] - 50) < 1e-6).toBe(true);
        expect(Math.abs(r.position[1] - 2) < 1e-6).toBe(true);
        expect(Math.abs(r.position[2] - 12) < 1e-6).toBe(true);
        expect(Math.abs(r.azimuth) < 1e-9).toBe(true);
    });
    it('resolveLinearPlacement bez CartesianPosition: tečný rámec', async () => {
        await mods();
        const step = BASE + `
#40=IFCPOINTBYDISTANCEEXPRESSION(IFCLENGTHMEASURE(50.),$,$,$,#30);
#41=IFCAXIS2PLACEMENTLINEAR(#40,$,$);
#42=IFCLINEARPLACEMENT($,#41,$);
`;
        const m = resolveLinearPlacement(idx(step), 42);
        const el = m.elements; // column-major
        expect(Math.abs(el[12] - 50) < 1e-6).toBe(true);  // tx
        expect(Math.abs(el[13] - 0) < 1e-6).toBe(true);   // ty
        expect(Math.abs(el[14] - 11) < 1e-6).toBe(true);  // tz = 10+0.02·50
        expect(Math.abs(el[0] - 1) < 1e-9).toBe(true);    // X = (1,0,0) (azimut 0)
        expect(Math.abs(el[10] - 1) < 1e-9).toBe(true);   // Z = (0,0,1)
    });
    it('CartesianPosition má přednost před evaluací', async () => {
        await mods();
        const step = BASE + `
#40=IFCPOINTBYDISTANCEEXPRESSION(IFCLENGTHMEASURE(50.),$,$,$,#30);
#41=IFCAXIS2PLACEMENTLINEAR(#40,$,$);
#50=IFCCARTESIANPOINT((999.,-1.,7.));
#51=IFCDIRECTION((0.,0.,1.));
#52=IFCDIRECTION((1.,0.,0.));
#53=IFCAXIS2PLACEMENT3D(#50,#51,#52);
#42=IFCLINEARPLACEMENT($,#41,#53);
`;
        const m = resolveLinearPlacement(idx(step), 42);
        expect(Math.abs(m.elements[12] - 999) < 1e-9).toBe(true);
        expect(Math.abs(m.elements[13] - (-1)) < 1e-9).toBe(true);
        expect(Math.abs(m.elements[14] - 7) < 1e-9).toBe(true);
    });
    it('resolvePlacement dispatchuje IFCLINEARPLACEMENT (ne identita)', async () => {
        await mods();
        const step = BASE + `
#40=IFCPOINTBYDISTANCEEXPRESSION(IFCLENGTHMEASURE(50.),$,$,$,#30);
#41=IFCAXIS2PLACEMENTLINEAR(#40,$,$);
#42=IFCLINEARPLACEMENT($,#41,$);
`;
        const m = resolvePlacement(idx(step), 42);
        expect(Math.abs(m.elements[12] - 50) < 1e-6).toBe(true);
    });
    it('compact() zachová linear placement closure', async () => {
        await mods();
        const step = BASE + `
#40=IFCPOINTBYDISTANCEEXPRESSION(IFCLENGTHMEASURE(50.),$,$,$,#30);
#41=IFCAXIS2PLACEMENTLINEAR(#40,$,$);
#42=IFCLINEARPLACEMENT($,#41,$);
`;
        const index = idx(step);
        index.compact();
        expect(index.byExpressId(42) !== null).toBe(true);
        expect(index.byExpressId(41) !== null).toBe(true);
        expect(index.byExpressId(40) !== null).toBe(true);
        expect(index.byExpressId(30) !== null).toBe(true);
    });
});
```

- [ ] **Step 2: Ověř FAIL** — modul neexistuje.

- [ ] **Step 3: Implementuj**

`assets/js/3d/ifc-engine/alignment/linear-placement.js`:

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
// IFC 4.3 IfcLinearPlacement → THREE.Matrix4.
//
// Priorita dle spec: CartesianPosition (předpočítaný absolutní fallback pro
// aplikace bez podpory lineárního umístění) → jinak evaluace BasisCurve přes
// curve-evaluator. Matice je v jednotkách modelu (lengthScale řeší pipeline).

import * as THREE from 'three';
import { splitParams } from '../parser/step-parser.js';
import { parseRef, parseWrappedNum } from '../geometry/step-helpers.js';
import { placement3DToMatrix, resolvePlacement } from '../geometry/placement.js';
import { getCurveEval } from './curve-evaluator.js';

const _v = new THREE.Vector3();

function resolveDir3(entityIndex, id) {
  const e = entityIndex.byExpressId(id);
  if (!e) return null;
  const m = e.params.match(/\(([^)]*)\)/);
  if (!m) return null;
  const n = m[1].split(',').map(s => parseFloat(s.trim()));
  return n.length >= 2 ? [n[0], n[1], n[2] || 0] : null;
}

/**
 * IfcPointByDistanceExpression(DistanceAlong, OffsetLateral, OffsetVertical,
 * OffsetLongitudinal, BasisCurve) → { position, azimuth } | null.
 * OffsetLateral kladně VLEVO od směru staničení, OffsetVertical nahoru.
 */
export function evalPointByDistance(entityIndex, pbdeExpressId) {
  const e = entityIndex.byExpressId(pbdeExpressId);
  if (!e || e.type !== 'IFCPOINTBYDISTANCEEXPRESSION') return null;
  const parts = splitParams(e.params);
  const dist = parseWrappedNum(parts[0]);
  const lat = parseWrappedNum(parts[1]);
  const vert = parseWrappedNum(parts[2]);
  const lon = parseWrappedNum(parts[3]);
  const curveId = parseRef(parts[4]);
  if (!dist || !curveId) return null;
  const ce = getCurveEval(entityIndex, curveId);
  if (!ce) return null;
  const d = dist.value + (lon ? lon.value : 0);
  const r = ce.evalAt(d);
  if (!r) return null;
  const az = r.azimuth;
  const p = [
    r.point[0] + (lat ? lat.value * -Math.sin(az) : 0),
    r.point[1] + (lat ? lat.value * Math.cos(az) : 0),
    r.point[2] + (vert ? vert.value : 0),
  ];
  return { position: p, azimuth: az };
}

/**
 * IfcLinearPlacement(PlacementRelTo, RelativePlacement, CartesianPosition)
 * → world Matrix4 | null.
 */
export function resolveLinearPlacement(entityIndex, expressId) {
  const e = entityIndex.byExpressId(expressId);
  if (!e || e.type !== 'IFCLINEARPLACEMENT') return null;
  const parts = splitParams(e.params);
  const parentId = parseRef(parts[0]);
  const cartesianId = parseRef(parts[2]);

  let local = null;
  if (cartesianId) {
    local = placement3DToMatrix(entityIndex, cartesianId);
  } else {
    const rel = entityIndex.byExpressId(parseRef(parts[1]));
    if (!rel || rel.type !== 'IFCAXIS2PLACEMENTLINEAR') return null;
    const rp = splitParams(rel.params);
    const pbde = evalPointByDistance(entityIndex, parseRef(rp[0]));
    if (!pbde) return null;
    const axisId = parseRef(rp[1]);
    const refDirId = parseRef(rp[2]);
    // Default = tečný rámec (Z svisle, X po vodorovné tečně); explicitní osy respektuj.
    const axis = (axisId && resolveDir3(entityIndex, axisId)) || [0, 0, 1];
    const refDir = (refDirId && resolveDir3(entityIndex, refDirId))
      || [Math.cos(pbde.azimuth), Math.sin(pbde.azimuth), 0];
    const z = new THREE.Vector3(...axis).normalize();
    const xr = new THREE.Vector3(...refDir);
    const x = xr.clone().sub(_v.copy(z).multiplyScalar(z.dot(xr))).normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    local = new THREE.Matrix4().makeBasis(x, y, z);
    local.setPosition(pbde.position[0], pbde.position[1], pbde.position[2]);
  }

  if (!parentId) return local;
  const parent = resolvePlacement(entityIndex, parentId);
  return parent.clone().multiply(local);
}
```

`assets/js/3d/ifc-engine/geometry/placement.js` — dvě změny:
1. `function placement3DToMatrix(` → `export function placement3DToMatrix(`.
2. Do `resolvePlacement` před stávající check přidej dispatch (a import nahoru):

```js
import { resolveLinearPlacement } from '../alignment/linear-placement.js';
```
```js
export function resolvePlacement(entityIndex, localPlacementId) {
  const entity = entityIndex.byExpressId(localPlacementId);
  // IFC 4.3: prvky na ose. Vrací hotovou world matici (řeší si vlastní chain).
  if (entity && entity.type === 'IFCLINEARPLACEMENT') {
    const m = resolveLinearPlacement(entityIndex, localPlacementId);
    if (m) return m;
    console.warn(`[placement] IfcLinearPlacement #${localPlacementId} se nepodařilo vyhodnotit — identita`);
    return new THREE.Matrix4();
  }
  if (!entity || entity.type !== 'IFCLOCALPLACEMENT') {
    return new THREE.Matrix4();
  }
  // ... zbytek beze změny
```

`assets/js/3d/ifc-engine/parser/entity-index.js` — v `compact()` rozšiř seed closure (řádek ~99):

```js
      if (e.type.startsWith('IFCALIGNMENT') || e.type === 'IFCLINEARPLACEMENT') stack.push(id);
```

`assets/js/3d/ifc-engine/cache/model-cache.js`:
```js
export const GEOMETRY_PIPELINE_VERSION = 2;
```

- [ ] **Step 4: Ověř PASS** — `node tests/run-tests.js 2>&1 | tail -5` → 0 failures (VŠECHNY suity — dispatch v resolvePlacement nesmí rozbít existující geometry testy).

- [ ] **Step 5: Commit**

```bash
git add assets/js/3d/ifc-engine/alignment/linear-placement.js assets/js/3d/ifc-engine/geometry/placement.js assets/js/3d/ifc-engine/parser/entity-index.js assets/js/3d/ifc-engine/cache/model-cache.js tests/test-suites/ifc-linear-placement.test.js tests/test-runner.html
git commit -m "feat(3d): IfcLinearPlacement — CartesianPosition fallback + evaluace křivky, pipeline v2 (plán ifc43-alignment)"
```

---

### Task 6: Validace evaluátoru proti 1071 ground-truth CartesianPosition

**Files:**
- Create: `scripts/validate-linear-placement.js` (Node, bez Puppeteer — curve-evaluator je THREE-free)

**Interfaces:**
- Consumes: `parseStepText`, `EntityIndex`, `evalPointByDistance` NELZE (importuje THREE) → skript používá `getCurveEval` přímo a offsety aplikuje sám (10 řádků duplicity je OK pro validační skript).
- Produces: exit 0 pokud max odchylka < 0.002 m, jinak exit 1 s výpisem nejhorších případů.

- [ ] **Step 1: Napiš skript**

```js
#!/usr/bin/env node
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
// Validace curve-evaluatoru proti CartesianPosition ground truth:
// pro každý IFCLINEARPLACEMENT s vyplněným CartesianPosition vyhodnotí
// IfcPointByDistanceExpression přes vlastní evaluátor a porovná.
// Usage: node scripts/validate-linear-placement.js <soubor.ifc> [tolerance_m]

import { readFileSync } from 'fs';
import { parseStepText } from '../assets/js/3d/ifc-engine/parser/step-parser.js';
import { EntityIndex } from '../assets/js/3d/ifc-engine/parser/entity-index.js';
import { splitParams } from '../assets/js/3d/ifc-engine/parser/step-parser.js';
import { parseRef, parseWrappedNum } from '../assets/js/3d/ifc-engine/geometry/step-helpers.js';
import { getCurveEval } from '../assets/js/3d/ifc-engine/alignment/curve-evaluator.js';

const file = process.argv[2];
const TOL = parseFloat(process.argv[3] || '0.002');
if (!file) { console.error('Usage: node scripts/validate-linear-placement.js <ifc> [tol]'); process.exit(1); }

const { entities } = parseStepText(readFileSync(file, 'utf-8'));
const index = new EntityIndex(entities);

function vec3(id) {
  const e = index.byExpressId(id);
  const m = e && e.params.match(/\(([^)]*)\)/);
  if (!m) return null;
  const n = m[1].split(',').map(s => parseFloat(s.trim()));
  return [n[0], n[1], n[2] || 0];
}

let count = 0, skipped = 0, maxDev = 0, sumDev = 0;
const worst = [];
for (const lp of index.byType('IfcLinearPlacement')) {
  const parts = splitParams(lp.params);
  const cartId = parseRef(parts[2]);
  const rel = index.byExpressId(parseRef(parts[1]));
  if (!cartId || !rel) { skipped++; continue; }
  const cart = index.byExpressId(cartId);
  const expected = vec3(parseRef(splitParams(cart.params)[0]));
  const pbde = index.byExpressId(parseRef(splitParams(rel.params)[0]));
  if (!expected || !pbde || pbde.type !== 'IFCPOINTBYDISTANCEEXPRESSION') { skipped++; continue; }
  const pp = splitParams(pbde.params);
  const dist = parseWrappedNum(pp[0]);
  const lat = parseWrappedNum(pp[1]);
  const vert = parseWrappedNum(pp[2]);
  const lon = parseWrappedNum(pp[3]);
  const ce = getCurveEval(index, parseRef(pp[4]));
  if (!dist || !ce) { skipped++; continue; }
  const r = ce.evalAt(dist.value + (lon ? lon.value : 0));
  const az = r.azimuth;
  const got = [
    r.point[0] + (lat ? lat.value * -Math.sin(az) : 0),
    r.point[1] + (lat ? lat.value * Math.cos(az) : 0),
    r.point[2] + (vert ? vert.value : 0),
  ];
  const dev = Math.hypot(got[0] - expected[0], got[1] - expected[1], got[2] - expected[2]);
  count++; sumDev += dev;
  if (dev > maxDev) maxDev = dev;
  if (dev > TOL) worst.push({ id: lp.expressId, dev, expected, got });
}

worst.sort((a, b) => b.dev - a.dev);
console.log(`Placements: ${count} vyhodnoceno, ${skipped} přeskočeno (bez CartesianPosition/PBDE)`);
console.log(`Odchylka: max ${(maxDev * 1000).toFixed(3)} mm, průměr ${((sumDev / Math.max(count, 1)) * 1000).toFixed(3)} mm, tolerance ${TOL * 1000} mm`);
for (const w of worst.slice(0, 10)) {
  console.log(`  #${w.id}: ${(w.dev * 1000).toFixed(2)} mm  expected(${w.expected.map(v => v.toFixed(3))}) got(${w.got.map(v => v.toFixed(3))})`);
}
if (worst.length > 10) console.log(`  … a dalších ${worst.length - 10}`);
process.exit(worst.length > 0 ? 1 : 0);
```

- [ ] **Step 2: Spusť na testovacím souboru**

```bash
f=$(ls ~/shared/Ifc_creator/*28*.ifc | head -1)
node scripts/validate-linear-placement.js "$f"
```
Expected: `Placements: ~1071 vyhodnoceno`, `max < 2 mm`, exit 0.

- [ ] **Step 3: Pokud odchylky > tolerance → systematic debugging**

NEODLAĎUJ náhodnými změnami. Typické příčiny dle podkladu: (a) zrcadlová větev klotoidy (zkontroluj κ₁·A·|A| vs A²·κ₁ — testy z Task 3 to kryjí, ale reálná data mají i Position offsety), (b) znaménko OffsetLateral, (c) vertikální parametrizace (vodorovný průmět vs 3D délka), (d) `IFCPARAMETERVALUE` vs `IFCLENGTHMEASURE` konverze. Použij skill `superpowers:systematic-debugging`. Spusť i na souboru `(26)`:
```bash
node scripts/validate-linear-placement.js "$(ls ~/shared/Ifc_creator/*26*.ifc | head -1)"
```

- [ ] **Step 4: Commit**

```bash
git add scripts/validate-linear-placement.js
git commit -m "test(3d): validace linear placement evaluátoru proti CartesianPosition ground truth (plán ifc43-alignment)"
```

---

### Task 7: Osa z geometrické vrstvy + niveleta + referent staStart + oprava _useRawDir

**Files:**
- Modify: `assets/js/3d/ifc-engine/alignment/ifc-alignment-parser.js`
- Modify: `assets/js/3d/ifc-engine/alignment/discretize.js` (presampled passthrough + `_useRawDir`)
- Modify: `assets/js/3d/ifc-engine/viewer/viewer-core.js:3379` (guard v `addParsedAlignment`)
- Test: `tests/test-suites/ifc-alignment-geometric.test.js` (nový)
- Modify: `tests/test-runner.html`

**Interfaces:**
- Consumes: `getCurveEval` (Task 2–4), `parseWrappedNum` (Task 1).
- Produces: `parseIfcAlignment(entityIndex, id)` nově vrací navíc:
  - `presampled: { points, stations, tangents, elementIndex } | undefined` — z geometrické vrstvy, body v METRECH (`× entityIndex._lengthScale || 1`), stations posunuté o `staStart`,
  - `staStart: number` — z referentu (Pset_Stationing.Station − DistanceAlong referentu), jinak 0,
  - `verticalProfile: { source: 'ifc-gradient-curve', entries: [] } | undefined` — jen příznak pro UI `hasProfile` (elevationAt se u presampled cesty nikdy nevolá),
  - `elements` zůstávají z business vrstvy (metadata/elementCount).
- `sampleAlignment(alignment)` v discretize.js: pokud `alignment.presampled`, vrať ho rovnou.
- `addParsedAlignment` guard: `if (!parsedAlignment || (!parsedAlignment.elements?.length && !parsedAlignment.presampled?.points?.length)) return null;`

**Logika v `parseIfcAlignment` (za stávající business parsing):**
1. Representation: `parts[6]` IfcAlignment → `IFCPRODUCTDEFINITIONSHAPE` → `parts[2]` seznam `IFCSHAPEREPRESENTATION`; vyber tu s RepresentationIdentifier `'Axis'` (parts[1] po unquote), item = první ref z `parts[3]`; fallback `'FootPrint'`.
2. `getCurveEval` na item (gradient → 3D, composite → 2D). Když null → vrať business výsledek beze změny (stávající chování).
3. Referent: přes existující `nests` index najdi děti alignmentu typu `IFCREFERENT` s `.STATION.` v `parts[7]`; přečti DistanceAlong z jeho placementu (`parts[5]` → IFCLINEARPLACEMENT → RelativePlacement → Location → parts[0] wrapped) a `Station` z Pset_Stationing (walk `IfcRelDefinesByProperties` — `parts[4]` RelatedObjects obsahuje referent id, `parts[5]` → IFCPROPERTYSET s Name `'Pset_Stationing'` → props → IFCPROPERTYSINGLEVALUE Name `'Station'` → `parseWrappedNum(parts[2])`). `staStart = Station − DistanceAlong`. Víc STATION referentů → použij první, `console.warn` (staniční rovnice zatím nepodporujeme).
4. `presampled = ce.sample(1.0)`; každý bod × `scale`; `stations[i] += staStart`; `length = ce.length`.

**Oprava `_useRawDir`** v `discretize.js` `sampleSpiral` (řádek ~154):
```js
  let theta0;
  if (el._useRawDir && el.dirStart !== null && el.dirStart !== undefined) {
    // IFC: StartDirection už je v radiánech od +X CCW — žádná konverze.
    theta0 = el.dirStart;
  } else if (el.dirStart !== null && el.dirStart !== undefined) {
    // LandXML dirStart: angle in radians from +Y (north), clockwise (per spec)
    theta0 = Math.PI / 2 - el.dirStart;
  } else if (el.pi) {
```

- [ ] **Step 1: Failing testy**

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('ifc-alignment-geometric — osa z geometrické vrstvy', () => {
    let parseIfcAlignment, sampleAlignment, parseStepText, EntityIndex;
    async function mods() {
        if (!parseIfcAlignment) {
            ({ parseIfcAlignment } = await import('../../assets/js/3d/ifc-engine/alignment/ifc-alignment-parser.js'));
            ({ sampleAlignment } = await import('../../assets/js/3d/ifc-engine/alignment/discretize.js'));
            ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
            ({ EntityIndex } = await import('../../assets/js/3d/ifc-engine/parser/entity-index.js'));
        }
    }
    function idx(step) { return new EntityIndex(parseStepText(step).entities); }
    // Alignment s geometrickou vrstvou (gradient: přímka 200 m, 2 % od z=10),
    // referent STATION 633.66 na DistanceAlong 0, žádná business vrstva.
    const FIXTURE = `
#1=IFCCARTESIANPOINT((0.,0.));
#2=IFCDIRECTION((1.,0.));
#3=IFCAXIS2PLACEMENT2D(#1,#2);
#5=IFCVECTOR(#2,1.);
#4=IFCLINE(#1,#5);
#6=IFCCURVESEGMENT(.CONTINUOUS.,#3,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(200.),#4);
#7=IFCCOMPOSITECURVE((#6),.F.);
#10=IFCCARTESIANPOINT((0.,10.));
#11=IFCDIRECTION((1.,0.02));
#12=IFCAXIS2PLACEMENT2D(#10,#11);
#13=IFCVECTOR(#11,1.);
#14=IFCLINE(#10,#13);
#15=IFCCURVESEGMENT(.CONTSAMEGRADIENT.,#12,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(200.),#14);
#30=IFCGRADIENTCURVE((#15),.F.,#7,$);
#100=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#3,$);
#101=IFCSHAPEREPRESENTATION(#100,'Axis','Curve3D',(#30));
#102=IFCPRODUCTDEFINITIONSHAPE($,$,(#101));
#110=IFCALIGNMENT('0W92lwwpyrDvTaewXDE7ns',$,'TestOsa',$,$,$,#102,.NOTDEFINED.);
#120=IFCPOINTBYDISTANCEEXPRESSION(IFCLENGTHMEASURE(0.),$,$,$,#30);
#121=IFCAXIS2PLACEMENTLINEAR(#120,$,$);
#122=IFCLINEARPLACEMENT($,#121,$);
#123=IFCREFERENT('37CmypgUFO5oyIKudoFewu',$,'0+633.660',$,$,#122,$,.STATION.);
#124=IFCRELNESTS('2aaaaaaaaaaaaaaaaaaaaa',$,$,$,#110,(#123));
#130=IFCPROPERTYSINGLEVALUE('Station',$,IFCLENGTHMEASURE(633.6605),$);
#131=IFCPROPERTYSET('1tZhsb0We7JneU_lRnrLvu',$,'Pset_Stationing',$,(#130));
#132=IFCRELDEFINESBYPROPERTIES('2bbbbbbbbbbbbbbbbbbbbb',$,$,$,(#123),#131);
`;
    it('presampled z gradient curve včetně výšky', async () => {
        await mods();
        const a = parseIfcAlignment(idx(FIXTURE), 110);
        expect(!!a.presampled).toBe(true);
        expect(a.presampled.points.length > 2).toBe(true);
        const last = a.presampled.points[a.presampled.points.length - 1];
        expect(Math.abs(last[0] - 200) < 0.01).toBe(true);
        expect(Math.abs(last[2] - 14) < 0.01).toBe(true);  // 10 + 0.02·200
    });
    it('staStart z referentu posune stations', async () => {
        await mods();
        const a = parseIfcAlignment(idx(FIXTURE), 110);
        expect(Math.abs(a.staStart - 633.6605) < 1e-6).toBe(true);
        expect(Math.abs(a.presampled.stations[0] - 633.6605) < 1e-6).toBe(true);
    });
    it('sampleAlignment vrací presampled beze změny', async () => {
        await mods();
        const a = parseIfcAlignment(idx(FIXTURE), 110);
        const s = sampleAlignment(a);
        expect(s).toBe(a.presampled);
    });
    it('hasProfile příznak pro UI', async () => {
        await mods();
        const a = parseIfcAlignment(idx(FIXTURE), 110);
        expect(!!a.verticalProfile).toBe(true);
    });
    it('bez geometrické vrstvy → business fallback (stávající chování)', async () => {
        await mods();
        // alignment bez Representation → prázdné elements, žádný presampled
        const bare = `
#110=IFCALIGNMENT('0W92lwwpyrDvTaewXDE7ns',$,'TestOsa',$,$,$,$,.NOTDEFINED.);
`;
        const a = parseIfcAlignment(idx(bare), 110);
        expect(a.presampled === undefined || a.presampled === null).toBe(true);
        expect(a.elements.length).toBe(0);
    });
    it('_useRawDir: IFC spirála bez bearing konverze', async () => {
        await mods();
        const { sampleAlignment: sa } = await import('../../assets/js/3d/ifc-engine/alignment/discretize.js');
        const spiral = {
            elements: [{
                type: 'spiral', startStation: 0, endStation: 60, length: 60,
                start: [0, 0, 0], end: [60, 3, 0], pi: null,
                radiusStart: Infinity, radiusEnd: 300, dirStart: 0,
                rotation: 'ccw', spiType: 'clothoid', _useRawDir: true,
            }],
        };
        const s = sa(spiral);
        // dirStart=0 s _useRawDir → počáteční tečna +X: druhý bod má x>0, y≈0.
        // Bez opravy (LandXML konvence π/2−0) by šel po +Y.
        const p = s.points[1];
        expect(p[0] > 0).toBe(true);
        expect(Math.abs(p[1]) < p[0]).toBe(true);
    });
});
```

- [ ] **Step 2: Ověř FAIL** — presampled neexistuje, staStart neexistuje, _useRawDir ignorován.

- [ ] **Step 3: Implementuj** — `ifc-alignment-parser.js`: přidej importy `getCurveEval` z `./curve-evaluator.js` a `parseWrappedNum` z `../geometry/step-helpers.js`. Na konec `parseIfcAlignment` (před `return`) vlož:

```js
  // Geometrická vrstva (IFC 4.3): Representation → 'Axis'/IfcGradientCurve
  // (fallback 'FootPrint'/IfcCompositeCurve). Business vrstva zůstává jen
  // pro metadata (elementCount, poloměry v UI).
  const geo = evaluateGeometricAxis(entityIndex, align, nests, alignmentExpressId);
  if (geo) {
    return {
      name,
      length: geo.length,
      staStart: geo.staStart,
      elements,
      presampled: geo.presampled,
      verticalProfile: geo.is3D ? { source: 'ifc-gradient-curve', entries: [] } : null,
    };
  }

  return { name, length: cumStation, staStart: 0, elements };
```

a nové funkce (kompletní):

```js
function unquote(raw) {
  const m = raw && raw.match(/^'(.*)'$/s);
  return m ? m[1] : null;
}

/** Najde IfcGradientCurve/IfcCompositeCurve v Representation alignmentu. */
function findAxisCurveId(entityIndex, alignEntity) {
  const parts = splitParams(alignEntity.params);
  const pdsId = parseRef(parts[6]);
  const pds = pdsId && entityIndex.byExpressId(pdsId);
  if (!pds || pds.type !== 'IFCPRODUCTDEFINITIONSHAPE') return null;
  const repIds = parseRefList(splitParams(pds.params)[2]);
  let fallback = null;
  for (const rid of repIds) {
    const rep = entityIndex.byExpressId(rid);
    if (!rep || rep.type !== 'IFCSHAPEREPRESENTATION') continue;
    const rp = splitParams(rep.params);
    const ident = unquote(rp[1]);
    const items = parseRefList(rp[3]);
    if (items.length === 0) continue;
    if (ident === 'Axis') return items[0];
    if (ident === 'FootPrint' && fallback === null) fallback = items[0];
  }
  return fallback;
}

/** Station referentu: Pset_Stationing.Station − DistanceAlong placementu. */
function findStationOffset(entityIndex, nests, alignmentExpressId) {
  const children = nests.get(alignmentExpressId) || [];
  const stations = [];
  for (const cid of children) {
    const ref = entityIndex.byExpressId(cid);
    if (!ref || ref.type !== 'IFCREFERENT') continue;
    const rp = splitParams(ref.params);
    if (parseEnum(rp[7]) !== 'STATION') continue;
    // DistanceAlong z IfcLinearPlacement → IfcAxis2PlacementLinear → PBDE
    let distAlong = 0;
    const lp = entityIndex.byExpressId(parseRef(rp[5]));
    if (lp && lp.type === 'IFCLINEARPLACEMENT') {
      const rel = entityIndex.byExpressId(parseRef(splitParams(lp.params)[1]));
      if (rel && rel.type === 'IFCAXIS2PLACEMENTLINEAR') {
        const pbde = entityIndex.byExpressId(parseRef(splitParams(rel.params)[0]));
        if (pbde && pbde.type === 'IFCPOINTBYDISTANCEEXPRESSION') {
          const d = parseWrappedNum(splitParams(pbde.params)[0]);
          if (d) distAlong = d.value;
        }
      }
    }
    // Station z Pset_Stationing
    for (const rel of entityIndex.byType('IfcRelDefinesByProperties')) {
      const relParts = splitParams(rel.params);
      if (!parseRefList(relParts[4]).includes(cid)) continue;
      const pset = entityIndex.byExpressId(parseRef(relParts[5]));
      if (!pset || pset.type !== 'IFCPROPERTYSET') continue;
      const psetParts = splitParams(pset.params);
      if (unquote(psetParts[2]) !== 'Pset_Stationing') continue;
      for (const pid of parseRefList(psetParts[4])) {
        const prop = entityIndex.byExpressId(pid);
        if (!prop || prop.type !== 'IFCPROPERTYSINGLEVALUE') continue;
        const propParts = splitParams(prop.params);
        if (unquote(propParts[0]) !== 'Station') continue;
        const v = parseWrappedNum(propParts[2]);
        if (v) stations.push(v.value - distAlong);
      }
    }
  }
  if (stations.length > 1) {
    console.warn(`[ifc-alignment] ${stations.length} STATION referentů — staniční rovnice zatím nepodporovány, používám první`);
  }
  return stations.length > 0 ? stations[0] : 0;
}

function evaluateGeometricAxis(entityIndex, alignEntity, nests, alignmentExpressId) {
  const curveId = findAxisCurveId(entityIndex, alignEntity);
  if (!curveId) return null;
  const ce = getCurveEval(entityIndex, curveId);
  if (!ce) return null;
  const scale = entityIndex._lengthScale || 1;
  const staStart = findStationOffset(entityIndex, nests, alignmentExpressId);
  const presampled = ce.sample(1.0);
  for (const p of presampled.points) { p[0] *= scale; p[1] *= scale; p[2] *= scale; }
  for (let i = 0; i < presampled.stations.length; i++) {
    presampled.stations[i] = presampled.stations[i] * scale + staStart;
  }
  return { presampled, length: ce.length * scale, staStart, is3D: ce.is3D };
}
```

`discretize.js` — na začátek `sampleAlignment`:
```js
export function sampleAlignment(alignment, opts = {}) {
  // IFC 4.3 geometrická vrstva: parser dodává hotové vzorky (gradient curve
  // s niveletou) — business elementy slouží jen jako metadata.
  if (alignment.presampled?.points?.length) return alignment.presampled;
```
a oprava `_useRawDir` v `sampleSpiral` (kód viz Interfaces výše).

`viewer-core.js:3379` — guard:
```js
    if (!parsedAlignment || (!parsedAlignment.elements?.length && !parsedAlignment.presampled?.points?.length)) return null;
```

- [ ] **Step 4: Ověř PASS** — `node tests/run-tests.js 2>&1 | tail -5` → 0 failures (včetně stávajících `landxml-*` suit — presampled passthrough nesmí rozbít LandXML cestu).

- [ ] **Step 5: Commit**

```bash
git add assets/js/3d/ifc-engine/alignment/ifc-alignment-parser.js assets/js/3d/ifc-engine/alignment/discretize.js assets/js/3d/ifc-engine/viewer/viewer-core.js tests/test-suites/ifc-alignment-geometric.test.js tests/test-runner.html
git commit -m "feat(3d): osa z geometrické vrstvy (gradient curve + niveleta), referent staStart, fix _useRawDir (plán ifc43-alignment)"
```

---

### Task 8: MVD detekce — FILE_DESCRIPTION → meta → models-panel

**Files:**
- Modify: `assets/js/3d/ifc-engine/parser/step-parser.js`
- Modify: `assets/js/3d/ifc-engine/workers/parser.worker.js`
- Modify: `assets/js/3d/ifc-engine/index.js` (meta + `_parseInWorker` passthrough, ~105 a ~138)
- Modify: `assets/js/3d/panels/models-panel.js` (~58)
- Test: doplň do `tests/test-suites/ifc-curve-evaluator.test.js` NE — nový malý describe do `tests/test-suites/ifc-wrapped-measure.test.js` také NE. Vytvoř `tests/test-suites/ifc-mvd-detect.test.js` + registrace.

**Interfaces:**
- `parseStepText(text) → { entities, schema, viewDefinitions: string[] }` — z `FILE_DESCRIPTION((...'ViewDefinition [X, Y]'...))` vrátí `['X', 'Y']`; bez hlavičky `[]`.
- Worker message → `{ entities, schema, viewDefinitions }`; `meta.viewDefinitions` na model recordu.
- models-panel: řádek `['MVD', meta.viewDefinitions?.join(', ') || '—']` hned za řádkem `['Schéma', ...]`.

- [ ] **Step 1: Failing test**

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('ifc-mvd-detect — ViewDefinition z FILE_DESCRIPTION', () => {
    let parseStepText;
    async function f() {
        if (!parseStepText) ({ parseStepText } = await import('../../assets/js/3d/ifc-engine/parser/step-parser.js'));
        return parseStepText;
    }
    it('Alignment-basedView', async () => {
        const p = await f();
        const r = p("ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION (('ViewDefinition [Alignment-basedView]'),'2;1');\nFILE_SCHEMA (('IFC4X3_ADD2'));\nENDSEC;\nDATA;\n#1=IFCCARTESIANPOINT((0.,0.));\nENDSEC;\nEND-ISO-10303-21;");
        expect(r.viewDefinitions.length).toBe(1);
        expect(r.viewDefinitions[0]).toBe('Alignment-basedView');
        expect(r.schema).toBe('IFC4X3_ADD2');
    });
    it('víc MVD oddělených čárkou', async () => {
        const p = await f();
        const r = p("FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0, QuantityTakeOffAddOnView]'),'2;1');\n#1=IFCCARTESIANPOINT((0.,0.));");
        expect(r.viewDefinitions.length).toBe(2);
        expect(r.viewDefinitions[0]).toBe('CoordinationView_V2.0');
        expect(r.viewDefinitions[1]).toBe('QuantityTakeOffAddOnView');
    });
    it('bez FILE_DESCRIPTION → prázdné pole', async () => {
        const p = await f();
        const r = p('#1=IFCCARTESIANPOINT((0.,0.));');
        expect(Array.isArray(r.viewDefinitions)).toBe(true);
        expect(r.viewDefinitions.length).toBe(0);
    });
});
```

- [ ] **Step 2: Ověř FAIL.**

- [ ] **Step 3: Implementuj**

`step-parser.js` — za `SCHEMA_RE` přidej:
```js
// MVD detection: FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'), '2;1');
const VIEWDEF_RE = /ViewDefinition\s*\[([^\]]*)\]/;
```
v `parseStepText` za detekci schématu:
```js
  let viewDefinitions = [];
  const vdMatch = text.slice(0, 4000).match(VIEWDEF_RE) || text.match(VIEWDEF_RE);
  if (vdMatch) {
    viewDefinitions = vdMatch[1].split(',').map(s => s.trim()).filter(Boolean);
  }
```
a `return { entities, schema, viewDefinitions };`

POZOR: `text.slice(0,4000).match(...) || text.match(...)` je zbytečně drahé na velkých souborech — použij jen `text.slice(0, 8000).match(VIEWDEF_RE)` (HEADER je vždy na začátku).

`parser.worker.js` — přidej `viewDefinitions` do destrukce i postMessage (podle stávajícího tvaru zprávy).

`index.js` — `const { entities, schema, viewDefinitions } = await this._parseInWorker(text);` (~105; zkontroluj, zda `_parseInWorker` vrací celý objekt zprávy — pokud filtruje pole, přidej ho) a do `meta`:
```js
        schema,
        viewDefinitions: viewDefinitions || [],
```

`models-panel.js` (~58):
```js
          ['Schéma', meta.schema || '—'],
          ['MVD', (meta.viewDefinitions && meta.viewDefinitions.length) ? meta.viewDefinitions.join(', ') : '—'],
```

- [ ] **Step 4: Ověř PASS** — `node tests/run-tests.js 2>&1 | tail -5` → 0 failures.

- [ ] **Step 5: Commit**

```bash
git add assets/js/3d/ifc-engine/parser/step-parser.js assets/js/3d/ifc-engine/workers/parser.worker.js assets/js/3d/ifc-engine/index.js assets/js/3d/panels/models-panel.js tests/test-suites/ifc-mvd-detect.test.js tests/test-runner.html
git commit -m "feat(3d): detekce MVD (ViewDefinition) z FILE_DESCRIPTION + zobrazení v panelu modelů (plán ifc43-alignment)"
```

---

### Task 9: Integrace — SW bump, dist, E2E verifikace na reálném souboru, PLAN.md

**Files:**
- Modify: `sw.js` (řádek 3: CACHE_VERSION +1)
- Modify: `PLAN.md` (přidej milestone)
- Regenerate: `dist/` přes `node scripts/build-dist.cjs`

- [ ] **Step 1: Kompletní test suite**

Run: `node tests/run-tests.js 2>&1 | tail -10`
Expected: 0 failures.

- [ ] **Step 2: Validační skript na obou souborech**

```bash
node scripts/validate-linear-placement.js "$(ls ~/shared/Ifc_creator/*28*.ifc | head -1)"
node scripts/validate-linear-placement.js "$(ls ~/shared/Ifc_creator/*26*.ifc | head -1)"
```
Expected: exit 0, max < 2 mm.

- [ ] **Step 3: SW bump + dist**

`sw.js`: `const CACHE_VERSION = 'bim-checker-v146';` (ověř aktuální číslo, zvyš o 1).
```bash
node scripts/build-dist.cjs
```

- [ ] **Step 4: E2E headless load reálného souboru**

```bash
f=$(ls ~/shared/Ifc_creator/*28*.ifc | head -1)
nohup node scripts/debug-3d-load.js "$f" > /tmp/debug-3d-align-fixed.log 2>&1 &
# počkej na dokončení (Monitor / background), pak:
grep "bbox" /tmp/debug-3d-align-fixed.log
```
Expected: `model world bbox ... extent` musí mít NEJVĚTŠÍ rozměr > 1000 (model roztažený podél ~1.4 km osy; před opravou bylo 125×24×571 s prvky slepenými u počátku). Screenshot `/tmp/debug-3d-screenshot.png` — VIZUÁLNĚ ZKONTROLUJ (Read tool): piloty/nosníky rozmístěné podél zakřivené osy, ŽÁDNÝ chuchvalec v jednom bodě. Pokud je k dispozici Chrome MCP, proveď i vizuální kontrolu dle CLAUDE.md (screenshot + konzole).

POZOR: .bimcache — pipeline v2 (Task 5) starou cache zneplatní automaticky; kdyby load podezřele rychle "doběhl" se špatným výsledkem, smaž IndexedDB cache (debug skript používá čerstvý profil, tohle je jen pojistka).

- [ ] **Step 5: Regresní kontrola na IFC4 modelu**

```bash
timeout 300 node scripts/debug-3d-load.js models/D.2.1.4/D214_SO112201.ifc 2>&1 | grep -E "bbox|error|meshes built" | head
```
Expected: model se načte jako dřív (bez errorů, nenulový bbox) — dispatch v resolvePlacement nesmí ovlivnit IfcLocalPlacement cestu.

- [ ] **Step 6: PLAN.md + finální commit**

Do `PLAN.md` přidej hotový milestone: „IFC 4.3 Alignment-basedView: IfcLinearPlacement (CartesianPosition + evaluace gradient curve), osa z geometrické vrstvy s niveletou, klotoidy κ(t)=t/(A·|A|), MVD detekce, validace proti 1071 ground-truth pozicím."

```bash
git add sw.js PLAN.md dist/
git commit -m "chore: SW v146 + dist mirror + PLAN.md — IFC 4.3 Alignment-basedView hotov (plán ifc43-alignment)"
```

---

## Self-Review (provedeno při psaní plánu)

- **Spec coverage:** IfcLinearPlacement ✓ (T5), CartesianPosition ✓ (T5), geometrická vrstva line/circle/clothoid/polynomial ✓ (T2–4), niveleta ✓ (T4+T7), terminátory ✓ (T2), CW oblouky ✓ (T2), klotoida 6 kombinací ✓ (T3), vodorovná parametrizace ✓ (T4), OffsetLateral vlevo ✓ (T5), tečný rámec + explicitní osy ✓ (T5), referent bez geometrie ✓ (náhodná shoda, ověřeno auditem), staničení z referentu ✓ (T7), staniční rovnice — VĚDOMĚ MIMO SCOPE (warn), MVD hlavička ✓ (T8), validační smyčka ✓ (T6 — proti CartesianPosition místo ifcopenshell), compact() keep ✓ (T5), pipeline/SW bump + dist ✓ (T5/T9), georeference — beze změn (audit: už funguje), IFCB_UmisteniNaOse — zobrazuje se automaticky přes properties panel (bez práce).
- **Známá omezení (dokumentovaná, ne zapomenutá):** staniční rovnice (víc referentů) jen warn; IfcSectionedSolidHorizontal geometrie mimo scope (testovací soubory používají TriangulatedFaceSet); alignment visuals vs. georef transform — pre-existující chování.
- **Type consistency:** `parseWrappedNum` → `{value, type}` konzistentně T1/T2/T5/T6/T7; `CurveEval.evalAt` → `{point:[x,y,z], azimuth}` konzistentně T2–T7; `presampled` tvar = výstup `sample()` ✓.
