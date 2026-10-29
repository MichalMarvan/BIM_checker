# Zadání pro vzdáleného agenta: návrh diagnostiky IFC parseru + 3D vykreslení

## Cíl
Navrhnout (a ve fázi 1 jen navrhnout, nic neimplementovat) diagnostiku IFC parseru a 3D vieweru ve větvi `3d-viewer-integration`, podle které půjde systematicky opravovat chyby tak, aby se všechny IFC soubory správně načetly a vykreslily ve 3D.

## Rozsah – co SMÍŠ měnit
- soubory/moduly: ve fázi 1 pouze nový soubor `docs/ifc-diagnostics-plan-<tvoje-id>.md`
- testy: nic nespouštěj lokálně na Pi; buildy/testy jen přes `tp-run`

## Co NESMÍŠ měnit
- žádný zdrojový kód v `assets/`, `tests/`, `scripts/`
- žádné změny mimo tento worktree, žádné `git push` do jiné větve než své

## Kontext / kde hledat
- Parser: `assets/js/common/ifc-parser-core.js`, `assets/js/3d/ifc-engine/` (geometry/, cache/, coords/, viewer/)
- Viewer: `assets/js/3d/viewer-page.js`, `scripts/debug-3d-load.js`, `scripts/check-repo.mjs`
- Testy: `node tests/run-tests.js` (Puppeteer), vlastní Jasmine-like framework
- Testovací modely: `models/D.2.1.4/D214_SO112201.ifc`, korpus v `~/shared` (viz paměť projektu)
- Citlivé věci: Float32 precision u swept solidů, souřadnicové rámce (federation anchor / worldToIfcCoords), `GEOMETRY_PIPELINE_VERSION` v .bimcache, IFC 4.3 alignment

## Definice hotovo
- [ ] dokument obsahuje: (1) přehled co se dá měřit, (2) navržený diagnostický skript/harness (vstup: IFC, výstup: report po entitách – počet entit, nepodporované typy, chyby parsování, entity bez geometrie, prázdné/degenerované meshe, bbox, NaN), (3) pořadí kroků oprav podle priority, (4) rizika
- [ ] každé tvrzení označeno: ověřeno čtením kódu / spuštěním / domněnka
- [ ] commit a `git push -u origin <tvoje větev>`

## Výstup
Stručný souhrn: co je hotové, co ne, co bys doporučil dál. Neověřené věci označ.
