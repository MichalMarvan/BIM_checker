# Spec: LandXML niveleta + řezy po staničení + menší section gizmo

Datum: 2026-07-08 · Větev: `3d-viewer-integration` · Schváleno uživatelem (návrh v konverzaci)

## Kontext

3D viewer (vanilla JS + Three.js, bez build systému, `dist/` = ruční kopie) už má
alignment feature z velké části hotovou, ale skrytou a bez vertikálního profilu:

- Toolbar tlačítko `data-tool="alignment"` je `hidden` — `pages/3d-viewer.html:154`
- Panel `assets/js/3d/panels/alignment-panel.js` (import LandXML, z IFC, jednotlivý řez na staničení)
- Parser `assets/js/3d/ifc-engine/alignment/landxml-parser.js` — **jen horizontální geometrie**
  (Line/Curve/Spiral), `<Profile>/<ProfAlign>` explicitně „out of MVP scope"
- Diskretizace `assets/js/3d/ifc-engine/alignment/discretize.js` (`sampleAlignment`, `pointAtStation`)
- `viewer-core.js`: `loadAlignment` (3045), `createSectionAtStation` (3246, vytváří SKUTEČNOU
  ořezovou rovinu), `computeSectionCurves(planeIdOrSpec)` (3310) — **umí spec `{plane}` bez
  registrace ořezu** → klíč pro řezy „jen s označením"
- DXF writer je uvnitř `assets/js/3d/panels/section-panel.js` (`buildDxf`, `cleanShapes`,
  `makeProjector`, R12 fallback) — u svislých řezů dává `X = lokální vodorovná v rovině`,
  `Y = nadmořská výška (scene Y + elevation offset modelu)`
- Nůžky: `assets/js/3d/ifc-engine/viewer/section-visuals.js` — disk `HANDLE_R = max(0.6, SIZE*0.1)`
  při `SIZE=25` → poloměr 2,5 m (moc velký, závislý na světové velikosti, ne na obrazovce)
- Drag: `section-panel.js:_wireDrag` + `viewer-core.js` `pickSectionPlaneAt` (2341) /
  `dragSectionPlaneTo` (2361) — rovina **skáče středem pod kurzor** (žádná delta)

Rozhodnutí uživatele:
1. Batch DXF = **jeden soubor, řezy v jedné řadě vedle sebe, Y = nadmořská výška beze změny**
   (stejně jako dnes u jednoho řezu), popisek staničení u každého řezu.
2. Označení řezů ve 3D = **tenký obdélníkový rámeček kolmo na osu + popisek staničení**.
   V pohledu se NIC neřeže.
3. Rozsah příčného řezu do DXF **ořezat na nastavitelný obdélník kolem osy** (výchozí šířka 40 m,
   výška 20 m) — jinak nekonečná rovina řízne i vzdálené části modelu.

---

## Část A — Import XML nivelety

### A1. Zprovoznění ikony
Odebrat `hidden` z tlačítka `data-tool="alignment"` v `pages/3d-viewer.html` (a `dist/` kopii).
Wiring přes `panels/index.js` → `alignment-panel.js` už existuje.

### A2. Upgrade parseru (`landxml-parser.js`)

**Návratová hodnota**: místo pole vrací `{ alignments, warnings, meta }`;
`meta = { version, flavor: 'generic'|'inframodel'|'hexml', units: {...}, suggestSwapXY: bool }`.
`warnings` = pole česky formulovaných stringů. Engine `loadAlignment` (viewer-core + facáda
`index.js`) vrací `{ ids, warnings }`; panel zpětně kompatibilně toleruje staré pole.

**Detekce formátu** (před parsováním alignmentů):
- Text začíná `ISO-10303-21` → chyba „Toto je IFC (STEP), ne LandXML — použijte tlačítko Z IFC."
- Root element (local name) `LandXML` → OK, libovolná verze/namespace 1.0–2.0 i prázdný ns.
- Root `HeXML` → OK, alignment elementy mají LandXML sémantiku.
- Namespace obsahuje `inframodel` NEBO `<FeatureDictionary name="inframodel">` → flavor
  `inframodel` (info do warnings: „InfraModel — výškové oblouky kruhové, úhly v gonech").
- Namespace/root odpovídá OKSTRA → chyba „OKSTRA (německý formát) není podporován."
- Jiný root → chyba se jménem root elementu.

**Namespace-agnostic**: všechny lookupy přes `getElementsByTagNameNS('*', localName)`
(prefixované soubory typu `<lx:Alignment>` dnes selžou).

**Jednotky** — parse `<Units><Metric|Imperial linearUnit angularUnit directionUnit>`:
- linearUnit: `meter` (výchozí) / `foot` ×0.3048 / `USSurveyFoot` ×(1200/3937) — převod
  VŠECH souřadnic, délek a staničení na metry.
- directionUnit/angularUnit: `radians` (výchozí per schema) / `decimal degrees` ×π/180 /
  `grads` ×π/200 — převod `dir`, `dirStart`, `dirEnd`. Non-metric → warning s převodem.

**Horizontální robustnost**:
- `spiType` case-insensitive (Bentley píše `Clothoid`); jiný typ než clothoid → warning
  „aproximováno klotoidou".
- Chybějící `rot` u Curve → dopočítat ze znaménka cross produktu (Start−C)×(End−C); warning.
- `radius` u Curve: přepočítat z `dist(Center, Start)` (atribut jen ověřit, při rozdílu
  > 0,1 % warning).
- Mezery/překryvy mezi elementy CoordGeom: `end ≈ next.start` do 1 mm přichytit,
  nad 1 mm warning s velikostí mezery.
- `<StaEquation>` přítomna → warning „staniční rovnice ignorovány (zobrazovací staničení
  se může lišit)". Geometrie se NEpřepočítává.

**Vertikální profil — nový modul `assets/js/3d/ifc-engine/alignment/vertical-profile.js`**:
- Parse `<Profile>/<ProfAlign>`: uspořádaná posloupnost `PVI`, `ParaCurve length=`,
  `UnsymParaCurve lengthIn= lengthOut=`, `CircCurve length= radius=`.
  **Staničení + výška jsou v TEXTOVÉM uzlu** (`"sta elev"`), délky v atributech.
- `buildVerticalProfile(profAlignNode, unitScale) → profile`;
  `elevationAt(profile, station) → number|null` (mimo rozsah: extrapolace tangentou
  prvního/posledního úseku NENÍ — vrátit krajní výšku, warning při vzorkování mimo rozsah).
- Matematika (spády g = poměr, `g1`/`g2` z sousedních PVI):
  - Tangenty mezi vrcholovými body: lineární interpolace.
  - `ParaCurve` (symetrická parabola): BVC = `pvi_sta − L/2`,
    `elev_bvc = pvi_elev − (L/2)·g1`; pro `x = sta − sta_bvc ∈ [0, L]`:
    `elev = elev_bvc + g1·x + ((g2−g1)/(2L))·x²`.
  - `UnsymParaCurve`: standardní AASHTO nesymetrická parabola, offset vrcholu
    `e = (L1·L2/(2(L1+L2)))·(g2−g1)`; větev 1 (od BVC, délka L1):
    `elev_bvc + g1·x1 + e·(x1/L1)²`; větev 2 zrcadlově od EVC:
    `elev_evc − g2·(L2−x2) + e·((L2−x2)/L2)²`. Testy: spojitost v PVI, sklon g1 v BVC
    a g2 v EVC.
  - `CircCurve` (InfraModel/Novapoint): **`R = abs(radius)`** (záporné znaménko = konvence
    vydutý/vypuklý — Civil 3D by záporný odmítl); kruhový oblouk v rovině (staničení, výška)
    mezi tečnými body `pvi_sta ± L/2`. Test: prohnutí uprostřed ≈ L²/(8R) pro malé spády.
- `<ProfSurf>` (bodový povrchový profil = terén): NEimportovat, warning „soubor obsahuje jen
  povrchový profil (ProfSurf) — terén, ne návrhovou niveletu".
- Víc `<Profile>/<ProfAlign>` na alignment: použít první, warning se jmény ostatních.
- Alignment objekt dostane `verticalProfile` (nullable) + `hasProfile` do metadat pro panel.

**S-JTSK heuristika (`suggestSwapXY`)**: z prvního bodu první alignmenty — pokud
`|prvníToken| < |druhýToken|` a oba v rozsahu 10⁵–1,4·10⁶ (abs, i záporné EPSG:5514
kvadranty) → data jsou nejspíš psaná (E, N) česky → `suggestSwapXY = true`. Panel podle
toho přednastaví checkbox a ukáže info hlášku (checkbox zůstává ruční override).

### A3. Diskretizace (`discretize.js`)
`sampleAlignment`: pokud má alignment `verticalProfile`, Z každého vzorku (v alignment frame)
= `elevationAt(profile, station)` — přepíše interpolaci z bodů elementů. Bez profilu chování
beze změny.

### A4. Panel (`alignment-panel.js`)
- Zobrazit `warnings` z importu (žlutý blok, sbalitelný při > 3 položkách).
- swapXY: přednastavení z `suggestSwapXY` + info hláška.
- V řádku osy doplnit „· niveleta ✓" / „· bez nivelety" dle `hasProfile`.

### A5. Testy (`tests/`)
Nové fixtures (ručně psané malé soubory) + testy parseru (DOMParser běží v Puppeteer):
- `civil3d-style`: metry, ProfAlign s PVI + ParaCurve → `elevationAt` na známých staničeních
  (ručně spočtené hodnoty), pořadí N/E, staStart ≠ 0.
- `inframodel-style`: gony, CircCurve se záporným radiusem, ns buildingsmart.fi → flavor,
  abs(radius), převod gonů.
- `feet-units`: Imperial + foot → převod na metry.
- Okrajové: `spiType="Clothoid"`, `radius="INF"`, chybějící `rot`, ProfSurf-only → warning,
  ISO-10303 text → chyba.

---

## Část B — Řezy po staničení

### B1. Engine API (viewer-core + `index.js` facáda)
- `createStationSections(alignmentId, { stations, width, height })` — `stations` už spočtený
  seznam (generuje panel). Pro každé staničení spočítat z `pointAtStation`:
  `point` (world), `normal` (world, orientace 'plan' — svislá rovina kolmá na půdorysnou
  tečnu; převod alignment→world frame převzít z `createSectionAtStation`), `hAxis` (world,
  vodorovná osa v rovině = up × n). Uložit do `this._stationSections = Map<alignmentId,
  { width, height, items: [{station, point, normal, hAxis}] }>`. ŽÁDNÉ clipping planes.
- `clearStationSections(alignmentId?)`, `getStationSections(alignmentId)`,
  `setStationSectionsVisible(alignmentId, bool)`.
- Úklid: `removeAlignment`/`clearAlignments` odstraní i staniční řezy dané osy.

### B2. Vizuály — nový modul `assets/js/3d/ifc-engine/viewer/station-section-visuals.js`
- Pro každý item: tenký obdélníkový rámeček (LineLoop, width×height, střed = bod osy,
  rovina dle normal/hAxis), barva odlišná od modrých ořezových rovin (oranžová `0xf59e0b`),
  `depthTest: false`, renderOrder nad modelem.
- Popisek staničení: canvas-texture sprite billboard u horní hrany rámečku, text
  `formatStation(sta)` → `km 1,250` (`(sta/1000).toFixed(3)` s čárkou). Velikost spritu
  úměrná výšce rámečku (~height/6), ne obrazovce (markery jsou „ve scéně", ne gizmo).
- API: `set(alignmentId, items, {width, height})`, `remove(alignmentId)`, `clear()`,
  `setVisible(alignmentId, bool)`, `dispose()`.

### B3. Ořez rozsahu v `section-curves.js`
`computeSectionCurves(viewer, spec)` — spec dostane volitelné
`bounds: { origin:[x,y,z], hAxis:[x,y,z], halfWidth, halfHeight }`.
Po výpočtu každého segmentu (před stitchingem) převést oba konce na in-plane souřadnice
`u = dot(p−origin, hAxis)`, `v = p[1] − origin[1]` (world up) a segment parametricky
oříznout (Liang–Barsky) na `|u| ≤ halfWidth`, `|v| ≤ halfHeight`; mimo → zahodit,
částečně uvnitř → zkrátit. Stitching beze změny (otevřené polyliny na hranici OK).

### B4. Sdílený DXF modul — nový `assets/js/3d/panels/dxf-export.js`
- Přesunout ze `section-panel.js`: `buildDxf`, `cleanShapes`, `makeProjector`, R12 writer,
  `rgbToAci`, `cleanName`/`sanitizeLayer`, `fmtNum`, DIACRITICS. `section-panel.js` importuje,
  chování jednoho řezu beze změny.
- Doplnit TEXT entity: knihovní cesta `d.addText(...)`, R12 cesta `TEXT` (0 TEXT / 8 vrstva /
  10,20 vložení / 40 výška / 1 text). Vrstva `POPIS`, barva 7 (bílá).
- Nová funkce `buildMultiSectionDxf(sections, opts)`:
  - `sections = [{ station, curves, plane: {point, normal} }]` (curves už s `_layer`/`_dz`).
  - Každý řez projektovat vlastním `makeProjector(plane)` → X lokální (střed = osa),
    **Y = nadmořská výška beze změny** (stávající chování projektoru).
  - Rozmístění do jedné řady: řez i dostane `offsetX = Σ (šířka_j + gap)` předchozích;
    šířka z nastavené šířky řezu (ne z bboxu — konzistentní rozestup), `gap = width/4`.
  - Pod každý řez TEXT `km 1,250` (výška textu `max(0.5, height/20)`, X = střed řezu,
    Y = spodní hrana rámečku − 2× výška textu).

### B5. Panel UI (`alignment-panel.js`)
Rozšířit `_sectionControls` na dva taby/piluky: **„Jeden řez"** (stávající) a **„Po staničení"**:
- Pole: od (výchozí staStart), do (výchozí staEnd), krok m (výchozí 25),
  volitelný vlastní seznam staničení (textarea, čísla oddělená čárkou/mezerou/novým řádkem —
  má přednost před rozsahem), šířka m (40), výška m (20).
- Generování staničení z rozsahu: celé násobky kroku `k·step ∈ [od, do]` (zaokrouhlená
  staničení); prázdný výsledek → fallback `[od]`. Vlastní seznam: seřadit, dedup, clampnout
  do [staStart, staEnd] s warningem u vyhozených.
- Tlačítka: „Vytvořit označení řezů" → `createStationSections`; „✕ Smazat";
  „⇣ DXF všech řezů" → smyčka přes staničení: `computeSectionCurves({point, normal, bounds})`,
  mezi iteracemi `await` `requestAnimationFrame` (neblokovat UI), progress
  „Řez 3/12 (km 0,075)…". Staničení bez průniku přeskočit v DXF, v souhrnu vypsat
  („2 staničení bez průniku geometrie"). Název souboru `rezy-<osa>-<krok>m.dxf` (sanitized).

---

## Část C — Section gizmo (menší nůžky + delta drag)

Poznatky z rešerše CDE: xeokit i iTwin.js drží gizmo v konstantní obrazovkové velikosti
a táhnou o deltu od uchopení; Forge to nedělá a uživatelé si stěžují. Vzorec (perspektiva):
`worldPerPixel = 2·dist·tan(fov/2) / viewportHeightPx`; ortho:
`(top−bottom)/zoom / viewportHeightPx`. Vždy clamp.

### C1. Vizuál (`section-visuals.js`)
- Rukojeť = skupina na rovině: disk ✂ (stávající textura, cíl **~36 px průměr na obrazovce**)
  + oboustranná šipka podél normály (válec + 2 kužely, cíl ~64 px celková délka, stejná modrá
  jako rovina) + **neviditelný picker kruh 1,75× poloměru disku** — `userData.sectionHandle`
  jen na pickeru, vizuální meshe pick netagovat.
- `updateHandleScale(camera, viewportHeightPx)`: per-frame přepočet scale dle vzorce
  (persp/ortho), clamp na max 40 % SIZE roviny; volat z render smyčky viewer-core.
- `setHandleHover(planeId|null)`: zvýraznění (zesvětlit materiál / scale ×1,1).

### C2. Drag logika (viewer-core)
- **Sjednotit souřadnice**: `pickSectionPlaneAt`/`dragSectionPlaneTo` dnes odečítají
  `rect.left/top` z hodnot, které panel už odečetl (funguje jen protože canvas začíná na 0,0;
  `viewer-page.js:1083` posílá naopak čisté clientX). Standard: engine přijímá **clientX/Y**
  a odečítá rect sám; opravit volání v panelu.
- Nové API:
  - `beginSectionPlaneDrag(id, clientX, clientY)`: sestrojit tažnou rovinu OBSAHUJÍCÍ
    normálu n, hranou ke kameře (`inPlane = eyeDir × n`, `planeFacing = n × inPlane`,
    fallback při degeneraci); raycast → `grabPoint`, uložit `startOffset`.
  - `dragSectionPlaneTo(id, clientX, clientY)`: raycast na tutéž rovinu →
    `along = dot(hit − grabPoint, n)`; `offset = clamp(startOffset + along, ±500)`;
    rebuild plane + refresh. Ray ‖ rovině → ponechat poslední offset.
  - `endSectionPlaneDrag(id)`: úklid stavu.
  - Zachovat zpětnou kompatibilitu: `dragSectionPlaneTo` bez předchozího begin se chová
    postaru (nebo begin volat interně) — jediný konzument je section-panel, upravit oba.
- `pickSectionPlaneAt` beze změn logiky (jen souřadnice), picker mesh zvětší hit target.

### C3. Interakce (`section-panel.js _wireDrag`)
- `pointerdown` na rukojeti: `setPointerCapture(e.pointerId)` na canvasu, orbit off,
  kurzor `grabbing`, `beginSectionPlaneDrag`.
- `pointermove` bez dragu: `pickSectionPlaneAt` → hover → kurzor `grab` +
  `engine.setSectionHandleHover(id)`; throttle na rAF.
- `pointerup` + **`pointercancel`**: release capture, orbit on, `endSectionPlaneDrag`.
- Popisek offsetu u rukojeti během tažení (iTwin.js pattern): malý DOM overlay div
  (`position:absolute` nad canvasem) u projektované pozice rukojeti s textem `+2,35 m`;
  po puštění zmizí. Stávající zápis do panelu zůstává.
- Řezy vytvořené z osy (`createSectionAtStation` — „Jeden řez") jsou běžné ořezové roviny
  → nové gizmo platí i pro ně automaticky.

---

## Společné požadavky

- **Zrcadlit všechny změněné soubory do `dist/`** (byte-for-byte).
- **Bump SW cache**: `sw.js:3` + `dist/sw.js:3` `bim-checker-v141` → `v142`
  (jednou na konci celé práce). Nové soubory (`vertical-profile.js`,
  `station-section-visuals.js`, `dxf-export.js`) přidat do `ASSETS_TO_CACHE`, pokud jsou
  tam ostatní moduly z těchto adresářů vyjmenované (ověřit vzor).
- **Testy**: `node tests/run-tests.js` musí projít; framework nemá `.not` chaining.
- **Vizuální kontrola**: pokud běží Chrome MCP → screenshot + konzole po každém kole oprav;
  jinak `scripts/debug-3d-load.js`. Testovací model `models/D.2.1.4/D214_SO112201.ifc`.
- **Ověřit** (ruční krok): chování alignmentu vůči federačnímu offsetu modelů v režimu
  reálných souřadnic (osa musí sedět na model) — existující chování, jen nesmí degradovat.
- PLAN.md aktualizovat po milestonech; commity odkazují na plán.

## Mimo rozsah

- Import `<CrossSects>` z LandXML, OKSTRA, RoadPAC nativní formáty (.OSA/.SNI),
  aplikace `<StaEquation>` na geometrii, vertikální klotoidy, rotační gizmo roviny,
  CRS transformace souřadnic osy.
