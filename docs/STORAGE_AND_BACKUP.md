# Úložiště, migrace a záloha

## Druhy dat

- **Uživatelská data:** IFC/IDS soubory, struktura složek, pohledy, měření a
  harmonogramy. Nesmí je odstranit akce „Vyčistit pouze cache“.
- **Regenerovatelná cache:** 3D `.bimcache`, RAG index a runtime PWA odpovědi.
- **Oprávnění:** handle připojené lokální složky; obsah složky zůstává v
  souborovém systému uživatele.

Centrální `BIMDatabaseRegistry` uvádí aktuální názvy a schema verze databází.
Každé zvýšení verze musí mít upgrade test a zachovat původní data při selhání.

## Projektová záloha

Na domovské stránce lze exportovat verzovaný soubor
`*.bimchecker.json`. Obsahuje:

- IFC a IDS soubory,
- jejich základní metadata,
- strukturu složek,
- marker `BIM_CHECKER_PROJECT_BACKUP` a verzi formátu.

Neobsahuje AI API klíče, historii vzdáleného provideru ani regenerovatelnou 3D
cache. Obnova nejprve ověří celý backup a potom vytvoří novou složku
`Obnova …`; existující soubory nemaže ani nepřepisuje. Případná chyba je
vrácena po jednotlivých souborech.

## Kvóta a cache

UI zobrazuje využití a kvótu, pokud je prohlížeč poskytne. 3D cache používá LRU
politiku, nejvýše 20 modelů a standardně nejvýše 1 GiB; na menší kvótě se limit
sníží na 25 %. Hodnotu lze pro řízené nasazení změnit klíčem
`bim:model-cache:max-bytes` v rozsahu 128 MiB až 4 GiB.

„Vyčistit pouze cache“ odstraní 3D model cache a PWA runtime cache. Projektové
IFC/IDS soubory ani připojenou lokální složku nemaže.
