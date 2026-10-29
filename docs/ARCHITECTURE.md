# Architektura BIM Checkeru

## Přehled

BIM Checker je webová/PWA aplikace bez aplikačního serveru pro běžné zpracování
IFC a IDS. HTML stránky sdílejí doménové moduly a lokální úložiště; volitelné
síťové funkce jsou oddělené a popsané v `PRIVACY.md`. Tauri ani generovaný
desktopový `dist` nejsou součástí projektu.

| Vrstva | Odpovědnost | Hlavní umístění |
|---|---|---|
| Stránky | Bootstrap, DOM a uživatelské workflow | `index.html`, `pages/` |
| Sdílená doména | IDS model, validace, storage, CSV, bezpečné HTML | `assets/js/common/` |
| IDS adaptéry | Editor, XML/XSD, Excel, bSDD | `assets/js/ids/` |
| IFC tabulka | STEP parsing, tabulka, editace a export | `assets/js/ifc/` |
| 3D engine | Parser, geometrie, scéna, panely a cache | `assets/js/3d/` |
| Workers | Izolované parsování a paralelní validace | `assets/js/workers/`, `assets/js/3d/**/workers/` |
| Offline | Generovaný precache a service worker | `scripts/generate-precache.mjs`, `sw.js` |
| Volitelné API | Omezené síťové proxy/funkce | `functions/` |

## Doménové cesty

### IDS × IFC validace

`IDS XML / Excel → normalizovaný IDS model → ValidationEngine → výsledkový
model → HTML / XLSX / 3D handoff`

`ValidationEngine` je jediný zdroj sémantických pravidel. Orchestrátor a Worker
cesta mu předávají serializovatelná data; parity test hlídá shodný výsledek.
Výsledky nesou verzi enginu a pravidel.

### 3D

`IFC text → parser Worker → EntityIndex → geometrická pipeline → merged mesh →
ViewerCore`

Datové vlastnosti zůstávají oddělené od geometrie. Proto může IDS validace
pracovat i s prvkem, jehož reprezentaci viewer neumí vykreslit. Přesnost
geometrie je popsána v `3D_GEOMETRY_SUPPORT.md`.

### Propojení stránek

Tabulkový viewer a validátor používají verzovaný payload služby
`ViewerHandoff`. Již otevřený viewer komunikuje přes `BroadcastChannel`; první
otevření používá jednorázový storage klíč a přesné `fileId`, nikoli pouze název.

## Služby a globální kompatibilita

Legacy stránky stále vystavují některá API přes `window.*`. Nový
`BIMServices` registr poskytuje explicitní služby `storage`, `ids`,
`validation`, `viewerHandoff` a `networkCapabilities`. Nový kód má preferovat
registr nebo předání závislosti v konstruktoru. Migrace je záměrně postupná,
aby nevznikl rizikový jednorázový přepis.

## Persistentní data

`BIMDatabaseRegistry` eviduje názvy, verze, vlastníky a klasifikaci všech
IndexedDB databází. Uživatelská data a regenerovatelná cache se nesmí čistit
stejnou akcí. Projektové IFC/IDS soubory lze nedestruktivně zálohovat a obnovit;
podrobnosti jsou v `STORAGE_AND_BACKUP.md`.

## Pravidla změn

- Doménová logika nemá záviset na DOM.
- Uživatelský text se nevkládá jako neescapované HTML.
- Nová síťová funkce musí mít UI informaci, CSP pravidlo a záznam v privacy.
- Nová databáze musí být v registru a mít migrační test.
- Nová 3D reprezentace musí aktualizovat support matrix a diagnostiku.
- Nová validační cesta musí projít parity a buildingSMART corpus testy.
