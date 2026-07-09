# Spec: Měření + snapping, persistence per model, pohledy, face-pick indikátor

Datum: 2026-07-09 · Větev: `3d-viewer-integration` · Schváleno uživatelem (návrh v konverzaci)

## Kontext (stav kódu)

- Měření z velké části existuje, ale je skryté a nedotažené:
  - Toolbar tlačítko `data-tool="measure"` je `hidden` — `pages/3d-viewer.html:106`.
  - `assets/js/3d/panels/measure-panel.js` (233 ř.) — Start/Stop flow, globální historie hodnot
    v localStorage `bim_checker_measurements_v1`, CSV/JSON export.
  - **Latentní bug:** panel volá `getMeasureVisuals().addMeasurement({kind, points, value})`,
    ale `measure-visuals.js:113` má signaturu `addMeasurement(id, type, points, value)` —
    vizuály vznikají se špatnými parametry a bez ID (nejde skrývat/mazat jednotlivě).
  - Engine: `snapAt(x, y, {enabled, thresholdPx, lastPoint})` (viewer-core ~2730) — 6 typů
    (vertex/midpoint/center/edge/perpendicular/intersection), kandidáti jen z prvku pod
    kurzorem (mergedTable ranges), priorita v seznamu ~2757. `pickEdgeAt` (~1437) vrací
    `{point, tangent}` — segmenty má interně, koncové body nevrací. `pickFace`,
    `raycastPoint`, `measureDistance/Angle/Area` (measure-math.js), `MeasureVisuals`
    (markery = světové kuličky 0.05–0.08 m, HTML overlay labely, `updateLabels()` volané
    z render smyčky).
  - BVH: three-mesh-bvh lazy-load (viewer-core:22-36), `computeBoundsTree({indirect:true})`,
    `rebuildBVH(modelId)` po federation bake. Raycast akcelerovaný. ŽÁDNÝ GPU picking.
- Pohledy: `panels/viewpoints-panel.js` (136 ř.) — localStorage `bim_checker_viewpoints_v1`
  globálně; ukládá camera + hidden + opacity + highlights + displayMode. Bez řezů, měření,
  náhledů, vazby na model. Otevírá se z levé lišty (`data-rail="viewpoints"`).
- Identita modelu napříč sessions: **SHA-256 hash obsahu** — počítá se ve
  `viewer-page.js:184-190` (`contentHash`) jen pro `.bimcache`; runtime `modelId` je efemérní.
- Section face-pick („Plochou"): hover = žlutý překryv koplanárních trojúhelníků
  (`showSectionGhostFromHit` → `section-visuals.showFaceHighlight`), žádný indikátor normály.
- Section gizmo má screen-constant scaling ve `section-visuals.updateHandleScale` — vzorec
  `worldPerPixel` je zaseklý uvnitř, hodí se vytáhnout do helperu.

## Závěry rešerše (závazné pro návrh)

- **CPU snapping** (three-mesh-bvh raycast + screen-space výběr kandidátů z trefeného
  trojúhelníku/prvku). GPU readback snap (xeokit) zamítnut — na SwiftShaderu nepoužitelný.
- Snap indikátory dle CAD (AutoCAD osnap) konvence: **čtverec = vrchol, trojúhelník = střed
  hrany, kroužek = těžiště/střed, přesýpací hodiny (⋈) = nejbližší bod na hraně, pravoúhlá
  značka = kolmice, × = průsečík**. Priorita vrchol > střed hrany > hrana > plocha.
- Labely měření: HTML overlay nad geometrií (bez depth-occlusion), ΔX/ΔY/ΔZ jako
  diferenciátor (xeokit RGB osové čáry).
- Persistence: body **model-lokálně** (world souřadnice se rozbijí při jiné federaci),
  vazba přes content hash; pohledy drží pole kamery 1:1 mapovatelná na BCF
  (`position↔camera_view_point`, `direction`, `up`, `fov`, `orthoScale↔view_to_world_scale`).
  BCF měření nepřenáší — vlastní JSON store. `schemaVersion` všude.

## Rozhodnutí uživatele

1. Typy měření v1: **vzdálenost bod–bod s ΔX/ΔY/ΔZ, délka hrany klikem, úhel (3 body),
   plocha (polygon)**.
2. Persistence: **auto-uložení per model (content hash) + pohledy** navíc zachytí stav.
3. Pohled zachytí **vše + náhled** (kamera, viditelnost, řezy, měření, režim, miniatura).
4. Face-pick: **kroužek + kolmá šipka** v místě kurzoru.

---

## Část A — Sdílený helper + snap indikátory

### A1. `assets/js/3d/ifc-engine/viewer/screen-scale.js` (nový, čistý modul)
```js
worldPerPixel(camera, worldPos, viewportHeightPx) → number
// perspektiva: 2 * dist(camera, worldPos) * tan(degToRad(camera.fov)/2) / vh
// ortho:       (camera.top - camera.bottom) / camera.zoom / vh
screenScale(camera, worldPos, viewportHeightPx, targetPx, {min=0.01, max=Infinity}) → number
```
`section-visuals.updateHandleScale` se refaktoruje, aby helper používal (chování beze změny,
stejné clampy). Testovatelné čisté funkce (camera se mockuje objektem
`{isPerspectiveCamera, fov, position}` / `{top, bottom, zoom}` + worldPos array — implementace
nesmí vyžadovat skutečnou THREE.Camera, jen čte vlastnosti; pozice jako `[x,y,z]` nebo
`{x,y,z}` obojí podporováno).

### A2. Snap indikátory (measure-visuals.js)
- Nahradit jednotnou kuličku `_snapPreview` sadou **canvas-sprite glyfů per typ** (lazy,
  texture cache): vertex ▢ (čtverec obrys), midpoint △, center ○, edge ⋈ (bowtie),
  perpendicular ⊾ (pravoúhlá značka), intersection ×, surface · (tečka).
  Kresba: obrys 2.5 px v barvě typu (stávající `SNAP_TYPE_COLORS`), tmavé halo pod tím
  (2 px offset stín) pro čitelnost na světlém i tmavém pozadí. `depthTest:false`,
  renderOrder 999.
- **Screen-constant ~14 px** přes `screenScale` — nová metoda
  `MeasureVisuals.updateScreenScale(camera, viewportHeightPx)` škáluje snap preview,
  in-progress markery i markery hotových měření (viz B3); volá se z render smyčky
  viewer-core hned vedle `updateLabels()` / `_sectionVisuals.updateHandleScale`.
- **Tooltip u kurzoru** s českým názvem snapu („Vrchol", „Střed hrany", „Těžiště",
  „Hrana", „Kolmice", „Průsečík"): DOM overlay div `.v3d-snap-tip` (vzor `.v3d-drag-tip`
  z minulé fáze, stejný stylesheet), pozice kurzor +14/−10 px, zobrazuje se jen když je
  aktivní snap; skrývá se se snap preview.

---

## Část B — Měření

### B1. Stav měření přesunout do engine (viewer-core + facáda)
Měření jsou objekty scény vlastněné viewerem (kvůli persistenci a pohledům bez otevřeného
panelu):
```js
addMeasurement({ type:'distance'|'edge'|'angle'|'area', points:[[x,y,z]...world],
                 label?:string, modelId?:string }) → id   // 'ms_<n>', value dopočítá engine
getMeasurements() → [{ id, type, points, value, unit, label, visible, modelId }]
removeMeasurement(id) / clearMeasurements()
setMeasurementVisible(id, visible)
updateMeasurement(id, { label })
```
- `value`/`unit` počítá engine přes measure-math (`distance`→m, `edge`→m, `angle`→°,
  `area`→m²). Registry `this._measurements` (Map) ve viewer-core; každá mutace volá
  `this._emitStateChange()` (viz D2). Vizuály řídí viewer-core přes MeasureVisuals
  (add → `visuals.addMeasurement(id, type, points, value)` — **oprava signature bugu**;
  remove/visibility → nové metody `setMeasurementVisible(id, bool)` ve visuals
  (subgroup.visible + labelDiv display)).
- `modelId`: model prvního zaměřeného bodu (z raycast/snap hitu; panel ho předá). Fallback
  první načtený model. Slouží persistenci (D3).

### B2. Panel — nový flow (measure-panel.js přepsat)
- **Otevření panelu = měří se hned** (výchozí režim vzdálenost). Pilulky režimů:
  📏 Vzdálenost · ⟍ Hrana · ∠ Úhel · ▱ Plocha. Přepnutí režimu zruší rozpracované body.
- Snap pilulky zůstávají (výchozí zapnuté: vertex, midpoint, edge).
- **Klávesy:** Escape = zrušit rozpracované měření; pravý klik = krok zpět (odebrat
  poslední bod; `contextmenu` preventDefault na canvasu po dobu aktivního panelu);
  Enter nebo dvojklik = uzavřít polygon (plocha).
- **Rubber-band:** při pohybu myší čára od posledního bodu k aktuálnímu snap/hover bodu
  + živý popisek hodnoty u kurzoru (vzdálenost: délka segmentu; úhel po 2. bodu: aktuální
  úhel; plocha od 3. bodu: průběžná plocha). Nové metody visuals:
  `showRubberBand(from, to)` / `hideRubberBand()` (čárkovaná linka `LineDashedMaterial`,
  `depthTest:false`) — hodnota jde do snap tooltipu (A2) pod název snapu.
- **Režim Hrana:** hover → zvýraznit celý segment hrany (overlay linka, barva edge snapu)
  + preview délky; klik → hotové měření se 2 body = koncové body segmentu.
  Vyžaduje rozšíření `pickEdgeAt` o návrat koncových bodů: přidat do výsledku `a:[x,y,z]`,
  `b:[x,y,z]` (viewer-core je má ve `seg`; zpětně kompatibilní — jen nová pole).
  Pozn.: měří se jeden feature-edge segment (rovný úsek), ne řetězec — omezení v1.
- **Seznam měření** (nahrazuje starou „Historii"): položky z `engine.getMeasurements()`
  ve stylu seznamu rovin — název/hodnota, 👁 skrýt/ukázat, ✎ přejmenovat (prompt), ✕ smazat,
  tlačítka „Skrýt vše"/„Zobrazit vše" a „✕ Smazat vše" (confirm), ⇣ CSV / ⇣ JSON export
  (ze seznamu engine, formát sloupců jako dnes + sloupec `type`). Starý localStorage klíč
  `bim_checker_measurements_v1` se přestává používat (nemigruje se).

### B3. Vizuály měření (measure-visuals.js)
- Markery bodů: screen-constant (~8 px) přes `updateScreenScale` — sdílený scale per frame
  (kuličky zůstávají, jen se škálují; geometrie poloměr 1, scale = screenScale/2).
- **Vzdálenost — ΔX/ΔY/ΔZ:** kromě hlavní čáry vykreslit osové „schodiště"
  p0 → (x1,y0,z0) → (x1,y1,z0) → p1 třemi úsečkami v barvách os
  (X červená 0xef4444, Y zelená 0x22c55e, Z modrá 0x3b82f6, `depthTest:false`, tenké,
  opacity 0.7). Vynechat úsečky s délkou < 1 cm.
- **Label vzdálenosti:** hlavní řádek `12.345 m`, druhý řádek menším písmem
  `ΔX 1.20 · ΔY 3.40 · Δv 0.80` — **v IFC konvenci os** (uživatel čeká Z=výška):
  zobrazené `ΔX = |x1−x0|` (world X), `ΔY = |z0−z1|` (world Z), `Δv = |y1−y0|`
  (world Y = výška). Úhel: `45.0°`; plocha: `12.34 m²` + obvod v druhém řádku.
- Rubber-band + edge-highlight metody dle B2.

### B4. Odkrytí ikony
Odebrat `hidden` z `data-tool="measure"` v `pages/3d-viewer.html:106` (+ dist).

---

## Část C — Face-pick indikátor u řezů

V režimu „Plochou" (section-panel) ke stávajícímu žlutému zvýraznění plochy přidat
**kurzorový indikátor**: kroužek ležící v rovině plochy (RingGeometry, vnitřní R 0.7,
vnější 1.0) + šipka podél normály (válec r 0.08 délka 1.2 + kužel r 0.22 délka 0.45),
vše jantarová 0xfacc15 jako ghost, `depthTest:false`, renderOrder 103.
- Nové metody `section-visuals.js`: `showFacePickCursor(point, normal)` /
  `hideFacePickCursor()`; screen-constant ~44 px přes `screenScale` (škáluje se
  v `updateHandleScale` — přejmenovat interně na společný per-frame update, veřejné
  jméno metody zachovat).
- Volání: `viewer-core.showSectionGhostFromHit` při úspěšném hitu zavolá
  `showFacePickCursor(hit.point, worldNormal)`; `hideSectionGhost` skryje i kurzor.
  Normála: stejná, jakou vrací `pickFace` (world, z raycast face).
- Šipka ukazuje směr normály = směr, KTERÝM zůstane model viditelný po řezu
  (addSectionPlane(point, normal) ořezává poloprostor za rovinou). Ověřit znaménko při
  implementaci vůči skutečnému chování clippingu a případně šipku otočit, aby odpovídala.

---

## Část D — Persistence per model

### D1. Store — `assets/js/3d/ifc-engine/state/viewer-state-store.js` (nový)
Vzor `cache/cache-store.js` (vlastní openDb/tx helper). IndexedDB `bim-viewer-state` v1,
object story:
- `modelState` — keyPath `contentHash`; dokument viz D3.
- `views` — keyPath `id`; index `models` (`multiEntry: true`) nad polem content hashů.
API (vše async): `stateGet(contentHash)`, `statePut(contentHash, doc)`,
`stateDelete(contentHash)`, `viewsForModels(contentHashes) → View[]` (přes index, dedup),
`viewsAll()`, `viewPut(view)`, `viewDelete(id)`. Bez LRU (malá data).

### D2. Engine podpora (viewer-core + facáda)
- `worldToModelLocal(modelId, [x,y,z]) → [x,y,z]` a `modelLocalToWorld(modelId, [x,y,z])`
  — přes inverzi matrixWorld skupiny modelu (`this._models.get(modelId)` skupina; ověřit
  reálné uložení skupiny, `updateMatrixWorld` před inverzí). Facáda deleguje.
- **Change hook:** `onViewerStateChange(cb)` na facádě (`index.js`) — viewer-core dostane
  `this._stateChangeCb` + `_emitStateChange()` volané z: add/remove/clear/update/setVisible
  measurement, addSectionPlane/updateSectionPlane/removeSectionPlane/clearSectionPlanes.
  (Jediný callback stačí — registruje ho orchestrátor.)
- `getModelContentHash(modelId)` — viewer-page při načtení modelu hash zná
  (`viewer-page.js` ~184); NOVĚ ho předá enginu: `engine.setModelContentHash(modelId, hash)`
  hned po loadIfc/loadModelFromCache; engine drží v `this._models` metadatech
  a getter `getModelContentHash(modelId) → string|null` (orchestrátor jím při save
  rozděluje měření do dokumentů).

### D3. Orchestrátor — `assets/js/3d/viewer-state-persistence.js` (nový, page layer)
- `initStatePersistence(engine)` volané z viewer-page po vytvoření enginu.
- **Restore:** po každém úspěšném načtení modelu (viewer-page zavolá
  `restoreModelState(engine, modelId, contentHash)`): `stateGet(hash)` → měření
  s `points` přes `modelLocalToWorld` → `engine.addMeasurement(...)`; řezné roviny přes
  `engine.addSectionPlane` + offset/visible/name (`updateSectionPlane`). Proti save-smyčce:
  orchestrátor drží boolean `restoring` — po dobu restore je nastavený a change-callback
  se při něm rovnou vrátí (engine žádný speciální flag nepotřebuje).
- **Save:** `onViewerStateChange` → debounce 1000 ms → pro každý načtený model s hashem
  sestavit dokument a `statePut`:
```json
{ "schemaVersion": 1,
  "measurements": [{ "id", "type", "points": [[x,y,z] model-local], "label",
                      "visible", "value", "unit" }],
  "sectionPlanes": [{ "name", "point": [model-local], "normal": [model-local směr],
                       "offset", "visible" }] }
```
- Měření patří do dokumentu svého `modelId` (D2 hash); roviny do dokumentu **kotevního
  modelu** = první načtený model (roviny se vážou k federaci; v1 zjednodušení).
  Normála se transformuje jen rotací (bez translace) — použít inverzní kvaternion skupiny.
- Restore při načtení druhého a dalšího modelu NEsmí duplikovat roviny už obnovené
  z kotevního modelu (roviny restoruje jen dokument kotevního modelu).
- Smazané vše (prázdný stav) se ukládá taky (prázdná pole) — jinak by se smazané věci
  po reloadu vracely.

### D4. Testy
- `screen-scale`: vzorce persp/ortho + clamp (čisté funkce, mock kamera).
- `viewer-state-store`: put/get/delete roundtrip, viewsForModels s multiEntry indexem
  (IDB běží v Puppeteeru).
- Model-local konverze: roundtrip world→local→world ≈ identita na mock skupině
  s rotací −π/2 X a posunem (import THREE v testu přes importmap).

---

## Část E — Pohledy (upgrade viewpoints-panel + engine)

### E1. Dokument pohledu (store `views`)
```json
{ "schemaVersion": 1, "id": "uuid", "name", "createdAt",
  "models": ["<contentHash>", ...],
  "camera": { <getCameraState() beze změny> },
  "displayMode": "solid", "hidden": [...], "opacity": [...], "highlights": [...],
  "sectionPlanes": [{ "name","point","normal","offset","visible" } model-local vůči
                     kotevnímu modelu, + "anchorHash": "<contentHash>"],
  "visibleMeasurementIds": ["ms_1", ...],
  "thumbnail": "data:image/jpeg;base64,..." }
```
- `models` = content hashe všech aktuálně načtených modelů při uložení.
- Kamera zůstává ve formátu `getCameraState()` (interně; pole drží world hodnoty —
  BCF mapování je dokumentované v rešerši, export se teď neimplementuje).

### E2. Uložení pohledu
- `_save()`: dnešní capture + `sectionPlanes` (z `engine.getSectionPlanes()`,
  převod do model-local kotevního modelu), `visibleMeasurementIds`
  (z `getMeasurements()` filtr visible), `models` (hashe), `thumbnail`:
  `engine.takeViewportScreenshot()` → downscale na šířku 256 px přes canvas →
  `toDataURL('image/jpeg', 0.7)`. `viewPut` do IDB.

### E3. Aplikace pohledu
- Dnešní restore + navíc: `clearSectionPlanes()` → add/update z dokumentu
  (model-local → world přes kotevní model; pokud kotevní model není načtený, roviny
  přeskočit + hláška); měření: `setMeasurementVisible` — viditelná jen ta z
  `visibleMeasurementIds`, ostatní skrýt (nemazat).

### E4. Panel UI
- Karty s náhledem (img thumbnail, název, datum), tlačítka Použít/✕; grid 2 sloupce.
- Filtr: zobrazit pohledy, jejichž `models` ⊆ aktuálně načtené hashe; ostatní pod
  `<details>` „Pohledy jiných modelů (N)" (Použít u nich zobrazí varování, že chybí
  modely, ale kameru aplikuje).
- Migrace: při prvním otevření panelu, pokud existuje localStorage
  `bim_checker_viewpoints_v1` a IDB store `views` je prázdný, převést staré pohledy
  (bez models/thumbnail — `models: []`, zobrazí se v „ostatních") a klíč smazat.
- Export/import JSON zůstává (exportuje IDB obsah).

---

## Společné požadavky

- Zrcadlit změněné soubory do `dist/` (byte-for-byte, na konci).
- SW bump `sw.js` + `dist/sw.js`: aktuální verze +1 (očekávaná v142 → v143), jednou na konci.
- Testy `node tests/run-tests.js` zelené; nové test soubory registrovat
  v `tests/test-runner.html`; framework bez `.not`.
- Vizuální ověření přes Chrome MCP (pravidlo CLAUDE.md): model
  `models/D.2.1.4/D214_SO112201.ifc`, ověřit: měření všech 4 typů se snap glyfy a
  tooltipem, rubber-band, seznam s 👁/✕, reload stránky → měření+roviny se obnoví,
  uložení pohledu s náhledem a jeho aplikace, face-pick kroužek se šipkou.
- Komentáře/UI česky, žádné zakomentované bloky, commity odkazují plán.

## Mimo rozsah

BCF export/import, GPU snap, persistence os a staničních řezů, řetězené/kumulativní
měření, nastavení jednotek a přesnosti, globální vertex grid, serializace BVH do
.bimcache, sdílení pohledů mezi uživateli.
