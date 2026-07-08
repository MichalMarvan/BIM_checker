# LandXML niveleta + řezy po staničení + section gizmo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zprovoznit import LandXML nivelety (včetně vertikálního profilu), přidat řezy po staničení s hromadným DXF exportem (bez ořezu scény) a zmenšit/zlepšit section-plane gizmo.

**Architecture:** Rozšíření existující alignment pipeline (parser → discretize → visuals → panel) o vertikální profil a staniční řezy; DXF writer se vytáhne ze section-panelu do sdíleného modulu; gizmo dostane screen-constant scaling + delta drag podle vzoru xeokit/iTwin.js.

**Tech Stack:** Vanilla JS ES moduly (bez buildu), Three.js 0.182 (importmap), DOMParser, Puppeteer test runner (`node tests/run-tests.js`), volitelně `@tarikjabiri/dxf` z esm.sh s R12 fallbackem.

**Spec:** `docs/superpowers/specs/2026-07-08-niveleta-stanicni-rezy-gizmo-design.md` — každý implementátor si ji přečte celou; plán na ni odkazuje pro plné znění pravidel (warnings texty, tolerance, formáty).

## Global Constraints

- Žádný build systém: každý změněný/nový soubor pod `assets/`, `pages/` se na konci zrcadlí byte-for-byte do `dist/` (Task 12, ne průběžně).
- Test framework NEMÁ `.not` chaining — piš `expect(x.includes(y)).toBe(false)`.
- Nové test soubory registrovat v `tests/test-runner.html` (`<script src="test-suites/....test.js"></script>`).
- Testy = classic skripty; ES moduly načítej `await import('../../assets/js/...')` uvnitř testu.
- Komentáře/UI texty česky, stylem okolního kódu; žádné zakomentované bloky.
- SW cache bump (v141 → v142) až v Tasku 12, jednou.
- Commituj po každém tasku; zpráva končí `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Pořadí a paralelizace (konflikt souborů)

- `viewer-core.js` sdílí Tasky 3, 6, 10 → serializovat. `alignment-panel.js`: Tasky 4, 8. `section-panel.js`: Tasky 7, 11.
- **Vlna 1 (paralelně):** Task 1, Task 5, Task 9
- **Vlna 2 (paralelně):** Task 2 (po 1), Task 7, Task 10 (po 9)
- **Vlna 3:** Task 3 (po 2, 10) paralelně s Task 11 (po 7, 10)
- **Vlna 4:** Task 6 (po 3), pak Task 4 (po 3), pak Task 8 (po 4, 6, 7)
- **Závěr:** Task 12

---

### Task 1: Vertikální profil — `vertical-profile.js`

**Files:**
- Create: `assets/js/3d/ifc-engine/alignment/vertical-profile.js`
- Test: `tests/test-suites/landxml-vertical-profile.test.js` (+ registrace v `tests/test-runner.html`)

**Interfaces:**
- Produces: `buildVerticalProfile(profAlignEl, unitScale = 1) → { entries, staStart, staEnd } | null`
  — `profAlignEl` je DOM element `<ProfAlign>`; `entries = [{ type:'pvi'|'para'|'unsympara'|'circ', station, elevation, length?, lengthIn?, lengthOut?, radius? }]` seřazené dle station; vrací `null` když < 2 platné body.
- Produces: `elevationAt(profile, station) → number` — mimo rozsah vrací krajní výšku.

- [ ] **Step 1: Failing test** — vytvoř test soubor s ručně spočtenými hodnotami:

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('LandXML vertical profile (niveleta)', () => {
    async function build(xml) {
        const { buildVerticalProfile, elevationAt } =
            await import('../../assets/js/3d/ifc-engine/alignment/vertical-profile.js');
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        const el = doc.getElementsByTagNameNS('*', 'ProfAlign')[0];
        return { profile: buildVerticalProfile(el, 1), elevationAt };
    }

    it('interpoluje lineárně mezi PVI (tangenta)', async () => {
        const { profile, elevationAt } = await build(
            `<ProfAlign name="n"><PVI>0 100</PVI><PVI>100 110</PVI></ProfAlign>`);
        expect(elevationAt(profile, 0)).toBe(100);
        expect(elevationAt(profile, 50)).toBe(105);
        expect(elevationAt(profile, 100)).toBe(110);
    });

    it('symetrická parabola: vrchol a tečné body', async () => {
        // g1=+0.10 (0→100 m stoupá 10), g2=-0.10, L=80 → BVC=60, EVC=140
        const { profile, elevationAt } = await build(
            `<ProfAlign name="n"><PVI>0 100</PVI><ParaCurve length="80">100 110</ParaCurve><PVI>200 100</PVI></ProfAlign>`);
        expect(Math.abs(elevationAt(profile, 60) - 106)).toBeLessThan(1e-9);   // BVC na tangentě
        expect(Math.abs(elevationAt(profile, 140) - 106)).toBeLessThan(1e-9);  // EVC na tangentě
        // střed: elev = 106 + 0.1*40 + ((-0.2)/(2*80))*40² = 106+4-2 = 108
        expect(Math.abs(elevationAt(profile, 100) - 108)).toBeLessThan(1e-9);
        expect(Math.abs(elevationAt(profile, 30) - 103)).toBeLessThan(1e-9);   // před BVC tangenta
    });

    it('nesymetrická parabola: spojitost a offset e v PVI', async () => {
        // g1=+0.10, g2=-0.10, L1=40, L2=80 → e = (40*80/(2*120))*(-0.2) = -8/3
        const { profile, elevationAt } = await build(
            `<ProfAlign name="n"><PVI>0 100</PVI><UnsymParaCurve lengthIn="40" lengthOut="80">100 110</UnsymParaCurve><PVI>200 100</PVI></ProfAlign>`);
        const e = (40 * 80 / (2 * 120)) * (-0.2);
        expect(Math.abs(elevationAt(profile, 100) - (110 + e))).toBeLessThan(1e-9);
        // spojitost: těsně před/za PVI se liší jen nepatrně
        expect(Math.abs(elevationAt(profile, 99.999) - elevationAt(profile, 100.001))).toBeLessThan(1e-3);
        expect(Math.abs(elevationAt(profile, 60) - 106)).toBeLessThan(1e-9);   // BVC
        expect(Math.abs(elevationAt(profile, 180) - 102)).toBeLessThan(1e-9);  // EVC
    });

    it('kruhový oblouk (InfraModel): abs(radius), prohnutí ≈ L²/(8R)', async () => {
        // g1=g2=0 (vodorovné tangenty), L=100, R=-2000 (záporný = konvence) →
        // tečné body 50 a 150 na výšce 100; střed poklesne ~ L²/(8R)=0.625
        const { profile, elevationAt } = await build(
            `<ProfAlign name="n"><PVI>0 100</PVI><CircCurve length="100" radius="-2000">100 100</CircCurve><PVI>200 100</PVI></ProfAlign>`);
        expect(Math.abs(elevationAt(profile, 50) - 100)).toBeLessThan(1e-6);
        expect(Math.abs(elevationAt(profile, 150) - 100)).toBeLessThan(1e-6);
        const mid = elevationAt(profile, 100);
        expect(Math.abs(Math.abs(mid - 100) - 0.625)).toBeLessThan(0.01);
    });

    it('mimo rozsah vrací krajní výšku, unitScale škáluje', async () => {
        const { buildVerticalProfile, elevationAt } =
            await import('../../assets/js/3d/ifc-engine/alignment/vertical-profile.js');
        const doc = new DOMParser().parseFromString(
            `<ProfAlign name="n"><PVI>0 100</PVI><PVI>100 110</PVI></ProfAlign>`, 'application/xml');
        const p = buildVerticalProfile(doc.documentElement, 0.5);
        expect(elevationAt(p, -10)).toBe(50);
        expect(elevationAt(p, 25)).toBe(52.5);   // sta 25 m = raw 50 → elev raw 105 * 0.5
        expect(elevationAt(p, 999)).toBe(55);
    });
});
```

- [ ] **Step 2: Registruj test v `tests/test-runner.html`** (vedle ostatních `test-suites/*.test.js`) a spusť `node tests/run-tests.js` → nové testy FAIL (modul neexistuje).
- [ ] **Step 3: Implementace** — parsuj děti ProfAlign v pořadí (`pvi`/`para`/`unsympara`/`circ`; station+elev z TEXT uzlu × unitScale, délky/radius z atributů × unitScale). `elevationAt`: najdi segment mezi sousedními vrcholy; spád `g = Δelev/Δsta` mezi vrcholy; uvnitř intervalu křivky u vrcholu i použij vzorce ze spec §A2 (symetrická/nesymetrická parabola, kruhový oblouk s `R=abs(radius)` — oblouk konstruuj v rovině (sta, elev) tečný na oba spády v bodech `pvi_sta ± L/2`; pro tečnost použij úhly `θ=atan(g)` a střed kolmo na tečnu ve vzdálenosti R). Mimo křivky lineární tangenta. Ošetři překryv křivek (křivka delší než vzdálenost k sousednímu PVI → zkrať L na dostupnou vzdálenost, přidej `profile.warnings`).
- [ ] **Step 4: `node tests/run-tests.js`** → všechny testy PASS (včetně stávajících).
- [ ] **Step 5: Commit** `feat(3d): vertikální profil nivelety (ProfAlign) — parser + výpočet výšky`

---

### Task 2: Upgrade LandXML parseru

**Files:**
- Modify: `assets/js/3d/ifc-engine/alignment/landxml-parser.js`
- Test: `tests/test-suites/landxml-parser.test.js` (+ registrace v `test-runner.html`)

**Interfaces:**
- Consumes: `buildVerticalProfile` z Task 1.
- Produces: `parseLandXmlAlignments(xmlText, opts) → { alignments, warnings, meta }`
  — `meta = { version: string|null, flavor: 'generic'|'inframodel'|'hexml', units: { linearUnit, toMeters, dirToRadians }, suggestSwapXY: boolean }`;
  každý alignment nově má `verticalProfile` (z Task 1, nullable) a `hasProfile: boolean`.
  **BREAKING pro volající** — viewer-core se opraví v Tasku 3; do té doby smí být `loadAlignment` dočasně rozbité jen mezi Task 2 a 3 (vlny to řeší: Task 3 následuje hned).

- [ ] **Step 1: Failing testy** — inline fixtures, klíčové případy:

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('LandXML parser — robustnost + niveleta', () => {
    let parse;
    async function p(xml, opts) {
        if (!parse) ({ parseLandXmlAlignments: parse } =
            await import('../../assets/js/3d/ifc-engine/alignment/landxml-parser.js'));
        return parse(xml, opts);
    }
    const WRAP = (inner, ns = 'xmlns="http://www.landxml.org/schema/LandXML-1.2"', units = '') =>
        `<?xml version="1.0"?><LandXML version="1.2" ${ns}>${units}<Alignments>${inner}</Alignments></LandXML>`;
    const ALIGN = (cg, profile = '') =>
        `<Alignment name="A" length="100" staStart="0"><CoordGeom>${cg}</CoordGeom>${profile}</Alignment>`;
    const LINE = `<Line><Start>1000 500</Start><End>1100 500</End></Line>`; // N E → x=E=500

    it('vrací {alignments, warnings, meta} a čte ProfAlign', async () => {
        const r = await p(WRAP(ALIGN(LINE,
            `<Profile name="p"><ProfAlign name="n"><PVI>0 200</PVI><PVI>100 210</PVI></ProfAlign></Profile>`)));
        expect(Array.isArray(r.alignments)).toBe(true);
        expect(r.alignments[0].hasProfile).toBe(true);
        expect(r.alignments[0].verticalProfile !== null).toBe(true);
        expect(r.meta.flavor).toBe('generic');
    });

    it('namespace-agnostic: prefixované elementy', async () => {
        const xml = `<?xml version="1.0"?><lx:LandXML version="1.2" xmlns:lx="http://www.landxml.org/schema/LandXML-1.2"><lx:Alignments><lx:Alignment name="A" length="100" staStart="0"><lx:CoordGeom><lx:Line><lx:Start>1000 500</lx:Start><lx:End>1100 500</lx:End></lx:Line></lx:CoordGeom></lx:Alignment></lx:Alignments></lx:LandXML>`;
        const r = await p(xml);
        expect(r.alignments.length).toBe(1);
    });

    it('Imperial foot → metry', async () => {
        const r = await p(WRAP(ALIGN(LINE), 'xmlns="http://www.landxml.org/schema/LandXML-1.2"',
            `<Units><Imperial linearUnit="foot" areaUnit="squareFoot" volumeUnit="cubicFeet" temperatureUnit="fahrenheit" pressureUnit="inHG"/></Units>`));
        const el = r.alignments[0].elements[0];
        expect(Math.abs(el.start[0] - 500 * 0.3048)).toBeLessThan(1e-9);
        expect(r.warnings.some(w => w.includes('stop'))).toBe(true); // „stopy" warning
    });

    it('InfraModel flavor + ISO-10303 chyba + neznámý root chyba', async () => {
        const r = await p(WRAP(ALIGN(LINE), 'xmlns="http://buildingsmart.fi/inframodel/404"'));
        expect(r.meta.flavor).toBe('inframodel');
        let err = '';
        try { await p('ISO-10303-21;\nHEADER;'); } catch (e) { err = e.message; }
        expect(err.includes('IFC')).toBe(true);
        err = '';
        try { await p('<?xml version="1.0"?><NecoJineho/>'); } catch (e) { err = e.message; }
        expect(err.includes('NecoJineho')).toBe(true);
    });

    it('chybějící rot dopočítá z geometrie (ccw oblouk)', async () => {
        // střed (0,0), start (100,0)=N0 E100? Pozor pořadí N E: Start="0 100" → x=100,y=0
        const cg = `<Curve radius="100" length="157.08"><Start>0 100</Start><Center>0 0</Center><End>100 0</End></Curve>`;
        const r = await p(WRAP(ALIGN(cg)));
        expect(r.alignments[0].elements[0].rotation).toBe('ccw');
        expect(r.warnings.some(w => w.toLowerCase().includes('rot'))).toBe(true);
    });

    it('suggestSwapXY heuristika (E<N v abs, česká data psaná Y X)', async () => {
        const cg = `<Line><Start>642000 1180000</Start><End>642100 1180000</End></Line>`; // psáno E N
        const r = await p(WRAP(ALIGN(cg)));
        expect(r.meta.suggestSwapXY).toBe(true);
    });

    it('ProfSurf-only → warning, bez profilu; StaEquation → warning', async () => {
        const r = await p(WRAP(ALIGN(LINE,
            `<Profile name="p"><ProfSurf name="t"><PntList2D>0 200 100 210</PntList2D></ProfSurf></Profile>`)
            .replace('</CoordGeom>', '</CoordGeom><StaEquation staInternal="50" staAhead="1050"/>')));
        expect(r.alignments[0].hasProfile).toBe(false);
        expect(r.warnings.some(w => w.includes('ProfSurf') || w.includes('terén'))).toBe(true);
        expect(r.warnings.some(w => w.toLowerCase().includes('stanič'))).toBe(true);
    });
});
```

- [ ] **Step 2: Registruj + spusť** → FAIL.
- [ ] **Step 3: Implementace** dle spec §A2 — pořadí prací: (1) detekce formátu (text prefix `ISO-10303-21`, root local name, ns → flavor, OKSTRA/unknown → `throw new Error(...)` s názvem rootu); (2) `getElementsByTagNameNS('*', ...)` všude (pozn.: `node.children` iterace nahraď filtrací dle `localName`); (3) `<Units>` → `toMeters` (meter 1 / foot 0.3048 / USSurveyFoot 1200/3937), `dirToRadians` (radians 1 / degrees π/180 / grads π/200) — aplikuj na všechny souřadnice (`parseXyz`), `length`, `staStart`, `radius`, `dir*`; (4) Curve: radius přepočti z `dist(Center,Start)` (warning při odchylce > 0,1 %), chybějící `rot` → znaménko `cross = (sx−cx)(ey−cy) − (sy−cy)(ex−cx)`; `cross > 0 → 'ccw'`; (5) spiType lowercase + warning na ne-clothoid; (6) mezery mezi elementy (viz spec, 1 mm snap); (7) Profile/ProfAlign → `buildVerticalProfile(el, toMeters)`, první vyhrává + warnings, ProfSurf warning; (8) StaEquation warning; (9) `suggestSwapXY` z prvního bodu (spec §A2 heuristika, RAW tokeny před swapem); (10) návrat `{alignments, warnings, meta}`.
- [ ] **Step 4: `node tests/run-tests.js`** → PASS.
- [ ] **Step 5: Commit** `feat(3d): LandXML parser — jednotky, detekce formátu, niveleta, warnings`

---

### Task 3: Diskretizace se Z z profilu + engine/facáda návrat warnings

**Files:**
- Modify: `assets/js/3d/ifc-engine/alignment/discretize.js` (sampleAlignment)
- Modify: `assets/js/3d/ifc-engine/viewer/viewer-core.js:3045-3057` (loadAlignment), `:3060-3074` (getAlignments)
- Modify: `assets/js/3d/ifc-engine/index.js:372` (facáda loadAlignment)
- Test: rozšíření `tests/test-suites/landxml-vertical-profile.test.js`

**Interfaces:**
- Consumes: `parseLandXmlAlignments → {alignments, warnings, meta}` (Task 2), `elevationAt` (Task 1).
- Produces: `viewer.loadAlignment(xmlText, opts) → { ids, warnings, meta }` (viewer-core i facáda `index.js` — stejný tvar). `getAlignments()` prvky nově obsahují `hasProfile: boolean`.

- [ ] **Step 1: Failing test** — do test souboru z Task 1 přidej:

```js
    it('sampleAlignment bere Z z verticalProfile', async () => {
        const { parseLandXmlAlignments } =
            await import('../../assets/js/3d/ifc-engine/alignment/landxml-parser.js');
        const { sampleAlignment } =
            await import('../../assets/js/3d/ifc-engine/alignment/discretize.js');
        const xml = `<?xml version="1.0"?><LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2"><Alignments><Alignment name="A" length="100" staStart="0"><CoordGeom><Line><Start>0 0</Start><End>0 100</End></Line></CoordGeom><Profile name="p"><ProfAlign name="n"><PVI>0 200</PVI><PVI>100 220</PVI></ProfAlign></Profile></Alignment></Alignments></LandXML>`;
        const { alignments } = parseLandXmlAlignments(xml);
        const s = sampleAlignment(alignments[0]);
        const iMid = s.stations.findIndex(st => Math.abs(st - 50) < 26); // aspoň jeden vzorek uvnitř
        expect(Math.abs(s.points[0][2] - 200)).toBeLessThan(1e-9);
        expect(Math.abs(s.points[s.points.length - 1][2] - 220)).toBeLessThan(1e-9);
        expect(s.points[iMid][2] > 200 && s.points[iMid][2] < 220).toBe(true);
    });
```

- [ ] **Step 2: Spusť** → FAIL.
- [ ] **Step 3: Implementace** — `sampleAlignment`: po vygenerování vzorků, pokud `alignment.verticalProfile`, přepiš `points[i][2] = elevationAt(profile, stations[i])` (import z vertical-profile.js). `viewer-core.loadAlignment`: destrukturuj nový návrat parseru, vrať `{ ids, warnings: parsed.warnings, meta: parsed.meta }`; `getAlignments()` přidej `hasProfile: !!a.meta.verticalProfile`. Facáda `index.js` loadAlignment jen propaguje návrat.
- [ ] **Step 4: `node tests/run-tests.js`** → PASS.
- [ ] **Step 5: Commit** `feat(3d): výška vzorků osy z nivelety; loadAlignment vrací warnings`

---

### Task 4: Panel — warnings, swapXY návrh, badge nivelety, odkrytí ikony

**Files:**
- Modify: `assets/js/3d/panels/alignment-panel.js` (`_upload`, `_render`)
- Modify: `pages/3d-viewer.html:154` (odebrat `hidden` z `data-tool="alignment"`)

**Interfaces:**
- Consumes: `engine.loadAlignment → {ids, warnings, meta}` (Task 3), `getAlignments()[].hasProfile`.

- [ ] **Step 1: Implementace** (UI, bez unit testů — ověří se vizuálně v Tasku 12):
  - `_upload`: ulož `this._lastXmlText = xml`; výsledek `{ids, warnings, meta}` (toleruj staré pole: `Array.isArray(res)`); `this.msg` ok + počet os; nový stav `this.warnings = warnings`.
  - `_render`: pod zprávou blok warnings (žlutý `v3d-panel__msg--warn`, každý řádek `• text`; při > 3 položkách `<details><summary>Upozornění (N)</summary>…</details>`).
  - Po importu: pokud `meta.suggestSwapXY !== použitý swapXY` → přidej warning „Souřadnice vypadají na opačné pořadí — zkuste přepnout ‚Prohodit X/Y'" + tlačítko `Přenačíst s ${meta.suggestSwapXY ? 'prohozeným' : 'standardním'} X/Y`, které odebere právě přidané ids (`removeAlignment`), přepne checkbox a znovu importuje `_lastXmlText`.
  - Řádek osy: `item-sub` doplň `· niveleta ✓` / `· bez nivelety` dle `a.hasProfile`.
  - `pages/3d-viewer.html`: odeber `hidden` z alignment tlačítka.
- [ ] **Step 2: `node tests/run-tests.js`** → PASS (nic nerozbito).
- [ ] **Step 3: Commit** `feat(3d): panel os — warnings z importu, návrh swapXY, odkrytá ikona`

---

### Task 5: Ořez segmentů na obdélník řezu (`section-curves.js`)

**Files:**
- Modify: `assets/js/3d/ifc-engine/viewer/section-curves.js`
- Test: `tests/test-suites/section-bounds-clip.test.js` (+ registrace)

**Interfaces:**
- Produces: export `clipSegmentToBounds(p0, p1, bounds) → [q0, q1] | null`
  — `p0/p1 = [x,y,z]` world; `bounds = { origin:[x,y,z], hAxis:[x,y,z] (unit, vodorovná v rovině), halfWidth, halfHeight }`; in-plane souřadnice `u = dot(p−origin, hAxis)`, `v = p[1]−origin[1]`.
- Produces: `computeSectionCurves(viewer, spec)` respektuje volitelné `spec.bounds` (aplikuje clip na každý segment před stitchingem, `null` → segment zahodit).

- [ ] **Step 1: Failing test:**

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('Section bounds clip (Liang-Barsky v rovině řezu)', () => {
    const B = { origin: [0, 100, 0], hAxis: [1, 0, 0], halfWidth: 10, halfHeight: 5 };
    let clip;
    beforeAll?.(async () => {});
    async function c(p0, p1) {
        if (!clip) ({ clipSegmentToBounds: clip } =
            await import('../../assets/js/3d/ifc-engine/viewer/section-curves.js'));
        return clip(p0, p1, B);
    }
    it('celý uvnitř → beze změny', async () => {
        const r = await c([-5, 98, 0], [5, 102, 0]);
        expect(r[0][0]).toBe(-5); expect(r[1][0]).toBe(5);
    });
    it('celý venku → null', async () => {
        expect(await c([20, 100, 0], [30, 100, 0])).toBe(null);
        expect(await c([0, 110, 0], [0, 120, 0])).toBe(null);
    });
    it('přesah přes hranu u → zkrácen na halfWidth', async () => {
        const r = await c([0, 100, 0], [20, 100, 0]);
        expect(Math.abs(r[1][0] - 10)).toBeLessThan(1e-9);
    });
    it('přesah přes hranu v (výška, world Y) → zkrácen', async () => {
        const r = await c([0, 100, 0], [0, 112, 0]);
        expect(Math.abs(r[1][1] - 105)).toBeLessThan(1e-9);
    });
});
```

- [ ] **Step 2: Registruj + spusť** → FAIL.
- [ ] **Step 3: Implementace** — Liang–Barsky v parametru t∈[0,1]: spočti `u0,v0,u1,v1`, ořež proti 4 mezím (`−hw ≤ u ≤ hw`, `−hh ≤ v ≤ hh`), interpoluj 3D body podle výsledných t. V `computeSectionCurves` po výpočtu `crossings` (obě větve — merged i per-mesh cesta) aplikuj clip, když `spec.bounds` existuje (protáhni bounds do `computeMeshSegments` parametrem).
- [ ] **Step 4: `node tests/run-tests.js`** → PASS.
- [ ] **Step 5: Commit** `feat(3d): ořez křivek řezu na obdélník kolem osy`

---

### Task 6: Staniční řezy — engine API + vizuály

**Files:**
- Create: `assets/js/3d/ifc-engine/viewer/station-section-visuals.js`
- Modify: `assets/js/3d/ifc-engine/viewer/viewer-core.js` (nové metody vedle `createSectionAtStation:3246`; úklid v `removeAlignment:3296` a `clearAlignments:3301`)
- Modify: `assets/js/3d/ifc-engine/index.js` (facáda — nové metody vedle `createSectionAtStation:385`)

**Interfaces:**
- Consumes: `pointAtStation(a.sampled, station)` (existující), transformace alignment→world z `createSectionAtStation` (`worldPoint=[px,pz,-py]`, `worldTangent=[tx,tz,-ty]`, plan-normála z půdorysné tečny).
- Produces (viewer-core i facáda, stejná jména):
  - `createStationSections(alignmentId, { stations: number[], width: number, height: number }) → Array<{station, point:[3], normal:[3], hAxis:[3]}> | null`
  - `getStationSections(alignmentId) → { width, height, items: [...] } | null`
  - `clearStationSections(alignmentId?)` — bez argumentu vše
  - `setStationSectionsVisible(alignmentId, visible)`
  - `hAxis = [n[2], 0, -n[0]]` pro plan-normálu `n=[a,0,c]` (jednotková, up×n).
- Produces (visuals modul): `class StationSectionVisuals { constructor(scene); set(alignmentId, items, {width, height}); remove(alignmentId); clear(); setVisible(alignmentId, bool); dispose(); }` + export `formatStation(m) → 'km 1,250'`.

- [ ] **Step 1: Implementace vizuálů** — pro každý item LineLoop obdélník width×height (střed = `point`, osy: `hAxis` a world-up), materiál `LineBasicMaterial({ color: 0xf59e0b, depthTest: false })`, renderOrder 101; sprite popisek `formatStation(station)` (canvas texture, bílý text na poloprůhledné tmavé pilulce) u horní hrany, `scale` ≈ height/6. `formatStation`: `'km ' + (m/1000).toFixed(3).replace('.', ',')`.
- [ ] **Step 2: Engine metody** — registry `this._stationSections = new Map()` (init v konstruktoru poblíž `_alignments`), lazy `_ensureStationSectionVisuals()`. `createStationSections`: pro každé staničení `pointAtStation` → world point/normal/hAxis (matematika výše), ulož + `visuals.set(...)`, vrať items. Úklid v `removeAlignment`/`clearAlignments`. Facáda deleguje 1:1.
- [ ] **Step 3: Ruční smoke test přes Node import nejde (Three.js) — ověř `node tests/run-tests.js`** (nic nerozbito) a syntaxi `node --check` na obou souborech.
- [ ] **Step 4: Commit** `feat(3d): staniční řezy — markery (rámeček + staničení), engine API`

---

### Task 7: Sdílený DXF modul + TEXT + multi-section layout

**Files:**
- Create: `assets/js/3d/panels/dxf-export.js`
- Modify: `assets/js/3d/panels/section-panel.js` (smaž přesunuté funkce, importuj `buildDxf` z nového modulu; `_exportDxf` chování beze změny)
- Test: `tests/test-suites/dxf-export.test.js` (+ registrace)

**Interfaces:**
- Produces: `buildDxf(curves, plane) → Promise<string|null>` (přesun beze změny chování),
  `buildMultiSectionDxf(sections, { width, height }) → Promise<string|null>`
  — `sections = [{ station, curves, plane: { point:[3], normal:[3] } }]`, `curves` už obohacené `_layer`/`_dz` jako dnes; layout: řez i na `offsetX = i*(width + width/4)`, X = lokální in-plane (projektor s origin = bod osy), Y = nadmořská výška; TEXT `formatStation(station)` na vrstvě `POPIS` (ACI 7), výška textu `max(0.5, height/20)`, pozice `[offsetX, minY_řezu − 2*výškaTextu]`.
- Consumes: `formatStation` z Task 6 (import z `../ifc-engine/viewer/station-section-visuals.js`).

- [ ] **Step 1: Failing test** (offline R12 cesta — v Puppeteeru esm.sh nemusí být blokované, proto testuj interní R12 writer přes export `_test_shapesToDxfR12` NEBO jednodušeji: testuj, že výsledný string obsahuje TEXT entity a offsety — vynuť R12 fallback exportem `buildMultiSectionDxf(sections, opts, { forceR12: true })`):

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
describe('DXF export — multi-section řada', () => {
    it('řezy v řadě, Y = výška, TEXT staničení', async () => {
        const { buildMultiSectionDxf } = await import('../../assets/js/3d/panels/dxf-export.js');
        const mkCurves = () => [{
            modelId: 'm', expressId: 1, ifcType: 'IFCWALL', color: 0xff0000, _layer: null, _dz: 0,
            loops: [{ closed: false, points: [[-1, 200, 0], [1, 201, 0]] }],
        }];
        const sections = [
            { station: 0,  curves: mkCurves(), plane: { point: [0, 200, 0], normal: [0, 0, 1] } },
            { station: 25, curves: mkCurves(), plane: { point: [0, 200, 0], normal: [0, 0, 1] } },
        ];
        const dxf = await buildMultiSectionDxf(sections, { width: 40, height: 20, forceR12: true });
        expect(dxf.includes('TEXT')).toBe(true);
        expect(dxf.includes('km 0,000')).toBe(true);
        expect(dxf.includes('km 0,025')).toBe(true);
        // druhý řez posunut o width + width/4 = 50 → vrchol x=-1 → 49
        expect(dxf.includes('49')).toBe(true);
        // Y zůstává nadmořská výška (200/201)
        expect(dxf.includes('200')).toBe(true);
    });
});
```

- [ ] **Step 2: Registruj + spusť** → FAIL.
- [ ] **Step 3: Implementace** — přesuň ze `section-panel.js` do `dxf-export.js`: `buildDxf`, `cleanShapes`, `makeProjector`, `shapesToDxfR12`, `rgbToAci`, `cleanName`, `sanitizeLayer`, `fmtNum`, `DIACRITICS`, `plural` nech v panelu. Exportuj `buildDxf`, `buildMultiSectionDxf`. TEXT: knihovní cesta `d.addText({x, y}?, výška, text, {layerName:'POPIS'})` — ověř přesnou signaturu `@tarikjabiri/dxf@2.6.2` (`d.addText(firstAlignmentPoint, height, value, options)`); R12 cesta: `w(0,'TEXT'); w(8,'POPIS'); w(10,x); w(20,y); w(30,'0.0'); w(40,h); w(1,text);` + vrstva POPIS do LAYER tabulky. `buildMultiSectionDxf(sections, opts)`: pro každý řez `makeProjector({point, normal, offset:0})`, posbírej shapes s posunem X o offsetX, spočti minY pro TEXT, spoj do jednoho `shapes` + `layerColor` a zapiš jednou (knihovna / R12 dle `opts.forceR12` a dostupnosti). `section-panel.js`: nahoře `import { buildDxf } from './dxf-export.js';`, smaž lokální kopie.
- [ ] **Step 4: `node tests/run-tests.js`** → PASS.
- [ ] **Step 5: Commit** `refactor(3d)+feat: sdílený DXF modul, TEXT entity, řada řezů v jednom DXF`

---

### Task 8: Panel — „Po staničení" UI + batch export

**Files:**
- Modify: `assets/js/3d/panels/alignment-panel.js` (`_sectionControls:125-169` → taby)

**Interfaces:**
- Consumes: `engine.createStationSections/getStationSections/clearStationSections` (Task 6), `engine.computeSectionCurves({ point, normal, bounds })` (Task 5 — pozn.: facáda `index.js:367` už spec objekt propouští), `engine.getElementLayer`, `engine.getElevationOffset`, `buildMultiSectionDxf` (Task 7), `formatStation` (Task 6).

- [ ] **Step 1: Implementace UI** — v `_sectionControls` dvě pilulky „Jeden řez" (stávající obsah) / „Po staničení":
  - Pole: `od` (default `a.staStart`), `do` (default `a.staEnd`), `krok` (25), `seznam staničení` (textarea, čísla oddělená `[,;\s]+`, má přednost), `šířka` (40), `výška` (20).
  - Generování: vlastní seznam → parse/sort/dedup/clamp do `[staStart, staEnd]` (vyhozené → hláška); jinak celé násobky kroku `k*krok ∈ [od, do]`; prázdné → `[od]`.
  - „Vytvořit označení řezů" → `engine.createStationSections(id, { stations, width, height })` + hláška s počtem; „✕ Smazat" → `clearStationSections(id)`.
  - „⇣ DXF všech řezů": async smyčka přes items z `getStationSections(id)`; pro každý
    `curves = engine.computeSectionCurves({ point: it.point, normal: it.normal, bounds: { origin: it.point, hAxis: it.hAxis, halfWidth: width/2, halfHeight: height/2 } })`;
    obohatit `_layer`/`_dz` stejně jako `section-panel._exportDxf`; `await new Promise(r => requestAnimationFrame(r))` mezi iteracemi; progress text „Řez 3/12 (km 0,075)…". Prázdné → přeskočit, spočítat. Pak `buildMultiSectionDxf(sections, { width, height })` → blob download `rezy-<osa>-<krok>m.dxf` (jméno přes lokální sanitizaci `[^\w-]→_`). Souhrn: „DXF staženo (10 řezů, 2 staničení bez průniku)."
- [ ] **Step 2: `node tests/run-tests.js`** → PASS (nic nerozbito) + `node --check assets/js/3d/panels/alignment-panel.js`.
- [ ] **Step 3: Commit** `feat(3d): řezy po staničení — UI, markery, hromadný DXF export`

---

### Task 9: Gizmo vizuály — malá rukojeť, screen-constant, hover

**Files:**
- Modify: `assets/js/3d/ifc-engine/viewer/section-visuals.js` (`_buildHandles:58-76`, `showMultiPlanes:239-278`)

**Interfaces:**
- Produces: `SectionVisuals.updateHandleScale(camera, viewportHeightPx)` — volat každý frame (Task 10); `SectionVisuals.setHandleHover(planeId|null)`; raycast target = NEVIDITELNÝ picker (`userData.sectionHandle = true` jen na pickeru; vizuální disk/šipka bez tagu).

- [ ] **Step 1: Implementace:**
  - Rukojeť = `THREE.Group` na entry: disk ✂ (stávající textura, `CircleGeometry(1, 48)`), oboustranná šipka podél lokální Z (= normála po `lookAt`): `CylinderGeometry(0.12, 0.12, 1.4)` + 2× `ConeGeometry(0.3, 0.5)` otočené ven, `MeshBasicMaterial({ color: 0x2563eb, transparent: true, opacity: 0.9, depthTest: false })`, vše `renderOrder ≥ 103`; picker `CircleGeometry(1.75, 24)` s `visible` materiálem `opacity: 0, transparent: true, depthTest: false` (mesh musí být `visible=true`, jinak raycast mine — neviditelnost přes opacity 0).
  - `showMultiPlanes`: místo `HANDLE_R = max(0.6, SIZE*0.1)` nastav skupině pozici/orientaci (`lookAt` podél normály) a ulož `group.userData.sectionPlaneId`; velikost řeší `updateHandleScale`.
  - `updateHandleScale(camera, vh)`: pro každou viditelnou rukojeť
    `worldPerPixel = camera.isPerspectiveCamera ? 2*dist*tan(degToRad(camera.fov)/2)/vh : (camera.top-camera.bottom)/camera.zoom/vh`;
    `s = clamp(36 * worldPerPixel, 0.05, 0.4 * SIZE)` (SIZE ulož do `this._lastPlaneSize` v showMultiPlanes); `group.scale.setScalar(s/2)` (disk poloměr 1 → průměr ~36 px; šipka délka 1.4+2×0.5 ≈ 64 px při stejném s... zkontroluj poměry a dolaď konstanty geometrie tak, aby disk ≈ 36 px a šipka ≈ 64 px celkem).
  - `setHandleHover(id|null)`: hoverovaná skupina — disk materiál `color 0xdbeafe→0xffffff` (zesvětlit) + `scale ×1.1` přes uložený base scale; jinak vrátit.
- [ ] **Step 2: `node --check` + `node tests/run-tests.js`** (nic nerozbito).
- [ ] **Step 3: Commit** `feat(3d): section gizmo — screen-constant rukojeť se šipkou a hoverem`

---

### Task 10: Viewer-core — sjednocení souřadnic + delta drag API

**Files:**
- Modify: `assets/js/3d/ifc-engine/viewer/viewer-core.js` (`pickSectionPlaneAt:2341`, `dragSectionPlaneTo:2361`, render smyčka — najdi `requestAnimationFrame`/`_animate` a zavěs `updateHandleScale`)
- Modify: `assets/js/3d/ifc-engine/index.js` (facáda: `beginSectionPlaneDrag`, `endSectionPlaneDrag`, `setSectionHandleHover` vedle stávajících section metod)

**Interfaces:**
- Consumes: `SectionVisuals.updateHandleScale/setHandleHover` (Task 9).
- Produces (viewer-core + facáda):
  - `pickSectionPlaneAt(clientX, clientY)` — **přijímá client souřadnice** (odečítá rect sám; volající v `section-panel.js` dnes předává canvas-relativní — opraví Task 11; `viewer-page.js:1083` už client posílá — zkontroluj a nech).
  - `beginSectionPlaneDrag(id, clientX, clientY) → boolean` — tažná rovina obsahující normálu: `eyeDir = camera.getWorldDirection()`, `inPlane = eyeDir × n` (‖<1e-6 → fallback camera.up × n), `planeNormal = n × inPlane` normalizované; raycast → `grabPoint`; ulož `{ id, grabPoint, startOffset: e.offset, dragPlane }` do `this._sectionDrag`.
  - `dragSectionPlaneTo(id, clientX, clientY) → number|null` — pokud `this._sectionDrag?.id === id`: raycast na `dragPlane` → `along = (hit − grabPoint)·n`, `offset = clamp(startOffset + along, −500, 500)`; ray ‖ rovině → vrať poslední offset. Bez begin (kompatibilita) → interně zavolej begin a pokračuj.
  - `endSectionPlaneDrag()` — `this._sectionDrag = null`.
  - `setSectionHandleHover(planeId|null)` → visuals.
- Render smyčka: každý frame `this._sectionVisuals?.updateHandleScale(this._camera, this._canvas.clientHeight)`.

- [ ] **Step 1: Implementace** dle rozhraní výše (raycast na THREE.Plane: `ray.ray.intersectPlane(plane, target)`).
- [ ] **Step 2: `node --check` + `node tests/run-tests.js`.**
- [ ] **Step 3: Commit** `feat(3d): delta drag řezné roviny + jednotné client souřadnice`

---

### Task 11: Section panel — pointer capture, hover, offset popisek

**Files:**
- Modify: `assets/js/3d/panels/section-panel.js` (`_wireDrag:34-76`)

**Interfaces:**
- Consumes: `engine.pickSectionPlaneAt(clientX, clientY)`, `beginSectionPlaneDrag`, `dragSectionPlaneTo`, `endSectionPlaneDrag`, `setSectionHandleHover` (Task 10).

- [ ] **Step 1: Implementace:**
  - Zruš lokální `xy()` přepočet — předávej `e.clientX/e.clientY` přímo (Task 10 sjednotil).
  - `onDown`: hit → `canvas.setPointerCapture(e.pointerId)`, `beginSectionPlaneDrag`, orbit off, kurzor `grabbing`.
  - `onMove` bez dragu (throttle přes rAF flag): `pickSectionPlaneAt` → kurzor `grab` + `engine.setSectionHandleHover(hit?.id ?? null)`.
  - `onMove` s dragem: `dragSectionPlaneTo` + aktualizuj řádek panelu (stávající) + **overlay popisek**: `div` (`position:absolute; pointer-events:none;` třída `v3d-drag-tip`, vytvoř lazy, přidej do `canvas.parentElement`) s textem `offset.toFixed(2).replace('.', ',') + ' m'`, pozice u kurzoru (`e.clientX+14, e.clientY−10` přepočtené na parent souřadnice).
  - `onUp` + `onCancel` (`pointercancel`): `releasePointerCapture`, `endSectionPlaneDrag`, orbit on, kurzor zpět, skryj popisek. `_dragCleanup` odstraní i popisek a `pointercancel` listener.
  - Přidej styl `.v3d-drag-tip` — zjisti, kde jsou styly panelů (`grep -rn "v3d-panel__hint" assets/css/`) a přidej vedle (tmavá pilulka, bílý text, 12px).
- [ ] **Step 2: `node --check` + `node tests/run-tests.js`.**
- [ ] **Step 3: Commit** `feat(3d): tažení řezu — pointer capture, hover, popisek offsetu`

---

### Task 12: Finalizace — dist, SW bump, vizuální ověření, PLAN.md

**Files:**
- Modify: `sw.js:3` + `dist/sw.js:3` (`bim-checker-v141` → `v142`; pokud mezitím jiná verze, +1)
- Modify: `dist/**` zrcadla všech změněných souborů, `PLAN.md`

- [ ] **Step 1: Zrcadli do dist** — `git diff --name-only master...HEAD -- assets pages` → každý soubor `cp` do `dist/…` (nové soubory též). Ověř `diff -r` na dotčených cestách.
- [ ] **Step 2: SW bump** v obou `sw.js`.
- [ ] **Step 3: Celý test run** `node tests/run-tests.js` → vše PASS.
- [ ] **Step 4: Vizuální ověření** (pravidlo z CLAUDE.md): pokud běží Chrome MCP (`mcp__chrome-devtools__*`), otevři 3D viewer, načti `models/D.2.1.4/D214_SO112201.ifc`, ověř: (a) ikona osy viditelná a panel se otevře, (b) import ukázkového LandXML (vytvoř ručně malý soubor s niveletou u testovacích dat, nebo použij fixture string → soubor), (c) markery řezů po staničení + popisky, (d) batch DXF stažení, (e) menší nůžky + plynulé tažení bez skoku, hover. Screenshot + `list_console_messages` bez chyb. Jinak `scripts/debug-3d-load.js`.
  Ověř i: osa sedí na model ve federačním režimu reálných souřadnic (spec „Ověřit").
- [ ] **Step 5: PLAN.md** — přidej milestone záznam. Commit `chore: dist mirror + SW v142 + PLAN.md (niveleta, staniční řezy, gizmo)`.

## Self-review (provedeno)

- Spec pokrytí: A1→T4, A2→T2, A3→T3, A4→T4, A5→T1+T2, B1→T6, B2→T6, B3→T5, B4→T7, B5→T8, C1→T9, C2→T10, C3→T11, společné→T12. Bez mezer.
- Typová konzistence: `{ids, warnings, meta}` (T2→T3→T4), `bounds {origin,hAxis,halfWidth,halfHeight}` (T5→T8), `items {station,point,normal,hAxis}` (T6→T8), `buildMultiSectionDxf(sections,{width,height,forceR12?})` (T7→T8), client souřadnice (T10→T11), `formatStation` (T6→T7).
