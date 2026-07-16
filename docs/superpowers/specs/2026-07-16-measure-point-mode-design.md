# Návrh: Režim měření „Bod" (souřadnice bodu na ploše)

**Datum:** 2026-07-16
**Větev:** 3d-viewer-integration
**Stav:** schváleno uživatelem (konverzace 2026-07-16)

## Cíl

Doplnit do měřicího nástroje 3D vieweru režim **Bod**: kliknutí na plochu
modelu vytvoří měření zobrazující souřadnice bodu. Souřadnice se zobrazují
v **IFC rámu modelu** (model-lokální, přes `worldToModelLocal`) — stabilní
vůči federaci; u modelů s geometrií přímo v S-JTSK dávají rovnou reálné
souřadnice.

## Rozhodnutí (z brainstormingu)

- **Souřadnicový rám:** IFC model-lokální (ne scénické world, ne georef E/N/H).
- **Přístup:** plnohodnotný typ měření `point` — marker + popisek ve scéně,
  položka v seznamu, export CSV/JSON, persistence, snapy. (Zamítnuto:
  efemérní tooltip; integrace do pinů.)
- **Interakce:** jeden klik = hotové měření (jako režim Hrana, bez
  rozpracovaného stavu).

## A. Interakce — `assets/js/3d/panels/measure-panel.js`

- `MODES` doplnit o `{ id: 'point', label: '📍 Bod', need: 1 }`;
  `MODE_CZ.point = 'Bod'`.
- `_modeHint()`: „Klikněte na plochu — bod se souřadnicemi se přidá rovnou."
- `_onClick()`: v režimu `point` vzít snap bod (aktivní přichytávání) nebo
  raycast na povrch a ihned zavolat
  `engine.addMeasurement({ type: 'point', points: [p], modelId })`.
  Žádné `_points` in-progress, žádný rubber-band.
- `_onMove()`: v režimu `point` snap-tooltip ukazuje živé souřadnice
  X/Y/Z (IFC rám přes `engine.worldToModelLocal`, `toFixed(3)`) jako
  value-line tooltopu; titulek tooltipu = typ snapu jako dosud.

## B. Datový model — `measure-registry.js` + `viewer-core.js`

- `computeValueUnit('point', …)` → `{ value: null, unit: '' }` (bod nemá
  skalární hodnotu).
- Položka registru nese nové volitelné pole `coords: [x,y,z] | null` —
  IFC model-lokální souřadnice. Registr je jen ukládá a klonuje
  (v `add`, `list`, `get`); zůstává čistý (bez Three.js).
- `viewer-core.addMeasurement(spec)`: pro `type === 'point'` obohatí spec o
  `coords = worldToModelLocal(spec.modelId, spec.points[0])`; při selhání
  konverze fallback na world bod. Počítá se jednou při přidání — všechna
  zobrazení čtou totéž a hodnota je stabilní vůči federaci.
- `_syncMeasureVisuals()` předává `m.coords` do
  `visuals.addMeasurement(...)`.
- Restore z persistence jde přes `viewer-core.addMeasurement`, takže se
  `coords` přepočítají z obnovených world bodů — konzistentní.

## C. Vizualizace — `measure-visuals.js`

- `addMeasurement` pro `point`: existující kulička-marker (screen-constant
  ~8 px); žádné čáry (1 bod), žádné ΔXYZ schodiště.
- `buildLabelHTML` pro `point` (z `coords`):
  ```
  X 745123.456
  Y 1045321.789
  Z 250.123
  ```
  První řádek hlavní, další v `measure-label__sub` stylu. Do innerHTML jen
  `toFixed` hodnoty a statické řetězce — stejná XSS konvence jako dosud.
- Kotva popisku (`anchor`) = samotný bod.

## D. Seznam a exporty — `measure-panel.js`

- Položka seznamu: titulek `745123.456, 1045321.789, 250.123`
  (z `coords`, `toFixed(3)`), podtitulek „Bod" (resp. label). Speciální
  případ ve vykreslení titulku — `fmt(null, '')` by dalo „null".
- Přejmenování / skrytí / smazání beze změn (generické podle id).
- CSV: nové sloupce `x,y,z` — vyplněné u typů `point` (z `coords`),
  prázdné u ostatních. JSON: u bodů navíc pole `coords`.

## E. Persistence — `viewer-state-persistence.js`

Generický tok (type + points) projde beze změn; `coords` se při restore
přepočítají (viz B). Ověřit testem/ručně.

## F. Testy a kontrola

- `tests/test-suites/measure-registry.test.js`: nové případy pro `point` —
  `value === null`, `unit === ''`, `coords` passthrough, klonování `coords`
  v `list()`/`get()` (mutace zvenku neprosákne).
- Spuštění testů: `node tests/run-tests.js`.
- Vizuální kontrola přes Chrome MCP na `models/D.2.1.4/D214_SO112201.ifc`
  (dle CLAUDE.md): screenshot + konzole po každém kole oprav.
- Bump verze SW cache v `sw.js`; ruční kopie změněných souborů do `dist/`.

## Známá omezení

- `modelId` měření je první načtený (kotevní) model — konzistentní se
  stávajícím chováním všech měření. Při federaci více modelů se souřadnice
  vztahují ke kotevnímu modelu, ne nutně k modelu, na který uživatel klikl
  (raycast nevrací modelId).
- Mimo rozsah: AI nástroje (tool-defs/tool-executor) pro měření bodu,
  georef E/N/H řádek v popisku (možné rozšíření později).
