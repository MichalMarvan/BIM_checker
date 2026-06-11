# 3D viewer — levý rail (Trimble-style)

Datum: 2026-06-11 · Větev: `3d-viewer-integration` · Stav: implementováno

## Cíl

Načítání a správa modelů přestává být roztroušená (navbar tlačítko + plovoucí
chipy) a stěhuje se do svislého railu u levého okraje s vyjížděcím drawerem,
po vzoru Trimble Connect.

## Rozhodnutí (schváleno uživatelem)

- Rail v1 má dvě položky: **Modely** a **Pohledy** (uložené pohledy se stěhují
  z horní lišty). Strom modelu zůstává v horní liště — propojí se s dalšími
  stránkami později.
- Tlačítko „Načíst IFC" z navbaru i chip-stack vpravo nahoře se ruší bez
  náhrady mimo drawer; objevitelnost řeší auto-otevření draweru Modely při
  startu s prázdnou scénou.
- Obsah se otevírá v levém draweru (300 px) hned vedle railu, max. jeden
  otevřený, Esc/×/opakovaný klik zavírá. Pravé panely fungují nezávisle.

## Komponenty

- `assets/js/3d/ui/left-rail.js` — rail + drawer, aktivní stav, lazy-load
  panelů. Panel třídy sdílejí interface pravého panel-manageru
  (`{engine, host, titleEl, ctx}` + `mount()/refresh()/destroy()`).
  Modely se mountují i bez enginu (ctx.getEngineIfReady), Pohledy si engine
  vyžádají přes `getEngine()`.
- `assets/js/3d/panels/models-panel.js` — karty načtených modelů (název,
  počet entit, 👁 viditelnost celého modelu, ✕ odebrání) + „+ Načíst ze
  storage" (existující picker modal). Data čte z ctx (viewer-page vlastní
  `state.loadedModels`).
- Engine API: `setModelVisible(modelId, bool)` / `isModelVisible(modelId)`
  přes `group.visible` — raycast skryté modely automaticky ignoruje
  (isPickable prochází rodiče).
- Oprava cestou: `removeModel` ve viewer-page volal neexistující
  `engine.removeModel` — správně `engine.unloadModel` (fallback ponechán).

## CSS

Rail 52 px (absolute, pod navbarem), drawer 300 px vedle něj. Horní plovoucí
lišta a status mají offset `left` přes rail; při otevřeném draweru se posunou
dál (`.v3d-drawer:not([hidden]) ~ …`), nic se nepřekrývá. Mobil: drawer přes
celou šířku mimo rail.

## Ověření

Živě (Chrome MCP, model D214_SO112201): auto-otevření draweru, načtení přes
drawer, karta s počtem entit, 👁 skryje celý model včetně raycastu, ✕ odebere,
Pohledy se otevřou, Esc zavírá, lišty uhýbají, konzole čistá.
