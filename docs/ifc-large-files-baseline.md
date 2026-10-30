# Fáze 0: baseline velkých IFC — částečně změřeno

Datum sběru: 2026-10-30. Větev `3d-viewer-integration`, základ
`6d3abaf12f4682fa37708ce92c4d53e2ebf658ab`. Tato úloha nemění produkční engine.
Veškeré Node/npm příkazy běžely přes `tp-run` na ThinkPadu, nikoli na Pi.

**Omezení: hlavní vstupy nebyly při sběru fáze 0 na ThinkPadu** (leží na Pi); jejich čísla viz dodatek na konci.
`~/shared/3D_modely/IFC`. Hledání souborů `D214X.ifc` a `D3_SO204.ifc`
v `/home/michal`, `/media`, `/mnt` ani ve sdílených adresářích je nenašlo.
Existují starší diagnostické výstupy v `~/shared/huge`, ale jejich vstupní IFC
už tam nejsou. O aktuální umístění vstupů byl uživatel požádán.
Nová měření proto pokrývají níže uvedené dostupné soubory, nikoli celý požadovaný
adresář. Počet entit a distribuce typů **D3_SO204 nejsou změřené**. Tím nejsou
úkoly měření hlavních vstupů dokončené.

Značení: **MĚŘENÉ** = nový běh nebo výpočet z jeho přesných počítadel;
**MĚŘENÉ — historický log** = převzatý výsledek, nyní nereprodukovaný;
**ODHAD** = extrapolace či heuristická klasifikace;
**NEOVĚŘENÉ** = chybějící měření. B jsou bajty, MB jsou desetinné,
MiB = 2^20 B a GiB = 2^30 B (definice jednotek, nikoli měření).

## Prostředí a metodika

**MĚŘENÉ:** ThinkPad, Intel Core i5-10310U, 8 logických CPU,
RAM 16 348 016 640 B; Node `v22.21.0`, V8 `12.4.254.21-node.33`, x86_64.
`tp-status` hlásil OK pro tailscale, SSH, Chroma a Ollama.
Před generováním bylo dostupných **10 372 788 224 B (MĚŘENÉ)** na cílovém disku.

Každý soubor se měřil v samostatném Node procesu s
`--expose-gc --max-old-space-size=6144` (konfigurace). Použit byl přímo
`parseStepText` a následně `EntityIndex`; měřicí sonda je v příloze.
`parser-inventory.mjs` posloužil jako základ použití těchto API a byl spuštěn
odděleně jako referenční kontrola. Jeho další Map a kopie záznamů nejsou součástí
níže měřeného heapu.

Snapshoty `process.memoryUsage()` byly po `global.gc()`: před čtením, po
dekódování, po parsování při drženém textu, po `text = null` a po `EntityIndex`.
Čas parse zahrnuje pouze synchronní `parseStepText`, bez čtení, explicitního GC,
workeru, serializace, sekundárních indexů a geometrie. Jediný běh každého souboru;
nejde o statistiku opakovaných časových měření. `heapUsed` není celková paměť
browseru ani špička workerového přenosu.

`params` se měří jako `Buffer.byteLength(params, 'utf8')`; percentily používají
nearest rank (`ceil(p*N)-1`). Průměr B/entitu ve vstupu je velikost celého souboru
včetně HEADER dělená počtem entit. Počítadla literálů procházejí i vnořené seznamy
a typované hodnoty: řetězce v apostrofech, číselné literály, zvlášť `#refs`.
Enumy, `$`, `*`, čísla uvnitř textů a číslice v názvech typů nejsou čísla.
Jsou to lexikální hodnoty, nikoli počet atributů EXPRESS.

## Vstupy a výsledky

Zkratky a skutečné cesty na ThinkPadu:

- **A:** `~/shared/real/RuzLet/D.2.1.4/D214_SO112201.ifc`
- **B:** `~/shared/real/RuzLet/D.2.1.4/D214_SO132401.ifc`
- **C:** `~/shared/real/RuzLet/2021_0204_RuzLet_Modely/D.2.1.6.1/D2161_SO123106.ifc`

Všechny číselné buňky následujících tří tabulek jsou **MĚŘENÉ**; poměry jsou
vypočtené z naměřených čítačů a zaokrouhlené až pro zobrazení.

| Soubor | Vstup B | Entit | B vstupu/entitu | params průměr B | params p50 B | params p99 B | params max B | parse ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 17 608 478 | 338 968 | 51,947 | 26,413 | 11 | 76 | 197 841 | 409,63 |
| B | 18 999 814 | 225 098 | 84,407 | 57,830 | 22 | 101 | 202 055 | 303,04 |
| C | 28 992 805 | 550 199 | 52,695 | 25,652 | 11 | 80 | 105 577 | 776,47 |

| Soubor | Součet params B | Řetězcové literály | Číselné literály | Reference | Řetězcová pole RawEntity | Číselná pole RawEntity |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 8 953 246 | 27 174 | 180 152 | 584 003 | 677 936 | 677 936 |
| B | 13 017 315 | 174 062 | 595 850 | 374 844 | 450 196 | 450 196 |
| C | 14 113 751 | 61 880 | 249 952 | 926 386 | 1 100 398 | 1 100 398 |

Pole RawEntity jsou `type`, `params` (řetězce) a `expressId`, `line` (čísla),
tedy počet každé skupiny = `2*N` podle kódu. Číselné literály uvnitř `params`
v této fázi **nejsou samostatné JS Number hodnoty**, stále jsou textem.

| Soubor | heap před B | heap po decode B | heap po parse B | heap po text=null B | heap s EntityIndex B | přídavek parse/entitu B | retained/entitu B | s indexem/entitu B |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 4 327 928 | 21 931 872 | 76 508 376 | 76 501 840 | 86 192 656 | 161,008 | 212,922 | 241,512 |
| B | 4 327 928 | 23 323 208 | 57 209 680 | 57 203 368 | 64 426 344 | 150,541 | 234,900 | 266,988 |
| C | 4 327 952 | 33 316 224 | 127 593 072 | 127 593 216 | 148 027 400 | 171,350 | 224,038 | 261,177 |

Přídavek parse = `(heapPoParse - heapPoDecode)/N`, retained =
`(heapPoTextNull - heapPřed)/N`, s indexem = `(heapSIndexem - heapPřed)/N`.
Zahrnují Map, entity a jejich stringy, nikoli jen mělkou velikost objektu.
Uvolnění proměnné `text` zde téměř nesnižuje heap: výsledek odpovídá tomu, že
substringy `params` drží podkladový text (**ODHAD mechanismu z měření a slice
v parseru**, bez heap snapshotu jednotlivých objektů). Nesmí se k retained
hodnotě přičíst vstupní text ještě jednou.

**MĚŘENÉ:** ve všech nových parsech je nulový počet neplatných záznamů,
duplicitních ID a komplexních entit, žádný neukončený záznam. Samostatný
`parser-inventory.mjs` potvrdil shodu s referenčním skenerem: celkem
**1 114 265 entit (MĚŘENÉ)**, žádné chybějící/přebývající entity ani rozdíly
v params. Příkaz je uveden v příloze.

**MĚŘENÉ** identifikátory vstupů (SHA-256):

| Vstup | SHA-256 |
| --- | --- |
| A | `e72cfe5f2c742a15de0300a3339c08f4b14e1ed7ec8d26a2f5d933db0abb239f` |
| B | `ec7d2938dfbf0c89927c9ad686b02a6f7a94101b45cb40353d9183f47529ff6a` |
| C | `954c7788ab79ead7989b6a598aa7ee31eedbc97535266b1d757fd266c2ba81bd` |

## D214X a D3_SO204: dostupné důkazy a mezery

| Údaj | D214X.ifc | D3_SO204.ifc |
| --- | --- | --- |
| Velikost | 474 514 946 B — **MĚŘENÉ, historický log** | „840 MB“ — **NEOVĚŘENÉ**, údaj zadání, chybí stat |
| Entit | 4 977 177 — **MĚŘENÉ, historický log** | **NEOVĚŘENÉ**, soubor chybí, blokový sken neproběhl |
| B vstupu/entitu | 95,338 — **MĚŘENÉ, výpočet z historického logu** | **NEOVĚŘENÉ** |
| Typů | 38 — **MĚŘENÉ, historický log**, rozpis není k dispozici | **NEOVĚŘENÉ**, distribuce není k dispozici |
| Geometrické entity | 4 158 243, tj. 83,55 % — **ODHAD** podle počtu odhozeného compact() | **NEOVĚŘENÉ**, bez typů nelze klasifikovat |
| Renderované produkty | 16 901 — **MĚŘENÉ, historický log**, není to počet geometrických entit | **NEOVĚŘENÉ** |
| params průměr/p50/p99, literály | **NEOVĚŘENÉ**, nová sonda neměla vstup | **NEOVĚŘENÉ** |
| Heap před/po parse a B/entitu | **NEOVĚŘENÉ**, historický log tyto snapshoty nemá | **NEOVĚŘENÉ**, současný engine soubor odmítne před decode |

Počet odhozených entit není přesná taxonomie geometrie: `EntityIndex.compact()`
zachovává GUID, vybrané prefixy a referenční uzávěr alignmentů a jiné entity
zahazuje. Produkt s geometrií také není totéž co bod, stěna BREP nebo placement.
Z podílu D214X zde neodvozuji údaj o geometrii D3_SO204.

Při dodání D3_SO204 lze použít blokový řádkový skener v příloze. Jeho počty
je nutné označit **ODHAD**: metoda předpokládá jednu celou entitu na řádku,
není plnohodnotný STEP tokenizer. Je třeba zveřejnit rozpis typů i seznam
typů započítaných do geometrie. Žádný rozpis D3_SO204 nebyl v tomto běhu získán.

## Proč nezasáhl timeout

Zdroj: existující `~/shared/huge/logs/probe-D214X.log` na ThinkPadu,
přečtený v tomto běhu. Relevantní uložený řádek:

```text
[ifc-engine] loadIfc timings (ms): decode=354 parse=13975 index=4978 geometry=23948 total=46834 | compacted 4158243 geometry entities (818934 kept)
```

Všechna čísla v citaci jsou **MĚŘENÁ — historický log**, nikoli nový benchmark.
Tentýž log má `loadMs=57063`, `wallMs=59125`, `heapMiB=2235` a
`peakRssMiB=4805` (**MĚŘENÉ — historický log**). Poslední dvě hodnoty nemají
metodiku izolace parseru a nejsou použity jako bajty/entitu dnešní reprezentace.
Ani wall/load čas není hodnota kontrolovaná parserovým timeoutem.

Čtení aktuálního kódu:

- [`index.js`, `loadIfc`](../assets/js/3d/ifc-engine/index.js) měří decode před
  `_parseInWorker`, parse jako dobu čekání na `_parseInWorker`, a teprve potom
  index a geometrii. Log vznikne až po pozdějších krocích včetně compact().
- `_parseInWorker` vytváří `setTimeout(..., 60000)` před `worker.postMessage`;
  handler zprávy i chyby timer ruší a worker ukončuje. Neexistuje prodlužování
  timeoutu ani průběžný heartbeat (**OVĚŘENO čtením kódu**; 60 s je konfigurace).
- Skutečný worker je
  [`workers/parser.worker.js`](../assets/js/3d/ifc-engine/workers/parser.worker.js),
  nikoli `parser/parser.worker.js`. Volá synchronní `parseStepText`, převádí
  Map na pole a posílá entity structured clone. Měřená fáze parse na hlavním
  vlákně tak zahrnuje i spuštění workeru a komunikaci/kopírování.

**Závěr z historického měření:** fáze parse trvala **13,975 s**, což je pod
limitem **60 s**; následná geometrie tento timeout nepoužívá. Samotný čas
`parseStepText` uvnitř browser workeru je **NEOVĚŘENÝ** a nový běh D214X se
neuskutečnil. Timer navíc není tvrdý wall-clock watchdog při blokovaném hlavním
vlákně, ale zde není potřeba tím vysvětlovat výsledek pod limitem.
Verze engine pro starý browser log není doložena. Sousední historický
`out5/summary.json` obsahuje jiný hash parseru než současný, proto jeho další
časové údaje neslučuji s novým měřením.

## Generátor a ověření nad limitem

Nový skript: [`make-large-ifc.mjs`](../scripts/ifc-diag/make-large-ifc.mjs).
Použití (cílová velikost je minimum v MiB, konfigurace):

```sh
tp-run 'node scripts/ifc-diag/make-large-ifc.mjs \
  ~/shared/real/RuzLet/D.2.1.4/D214_SO112201.ifc \
  ~/tmp-large/phase0-baseline-700.ifc 700'
```

Skript používá bloky a jednotlivé STEP záznamy, ne řetězec celého souboru.
Latin1 slouží jako vratné mapování bajtů; původní UTF-8 bajty se zachovávají.
Rozlišuje apostrofy, zdvojené apostrofy a blokové komentáře přes hranice bloků;
komentáře odstraňuje, obsah řetězců zachovává. Posouvá definice ID i všechny
skutečné `#refs` o `copy * maxId`, i u dopředných a cyklických referencí.
Text `'#123'` zůstává textem. GlobalId zůstává původní, takže opakované kopie
mají duplicitní GUID, což zadání připouští.

Podporuje jeden prostý DATA oddíl se simple entity instances, zachovává HEADER
a zapisuje obě ENDSEC a END-ISO. Více DATA oddílů, komplexní entity, prázdná data,
neuzavřené tokeny, duplicitní ID, dangling refs a nebezpečně velká ID odmítá.
Paměť roste s množinou **zdrojových** ID a největším záznamem, ne s cílovým
souborem. Limit záznamu **64 MiB**, blok **1 MiB** a rezerva na disku
**256 MiB** jsou záměrné konfigurační limity, nikoli naměřené spotřeby.
`statfs` kontroluje konzervativní horní mez včetně růstu počtu číslic v ID.
Existující výstup nepřepisuje (`wx`); vlastní částečný výstup po chybě odstraní.
Vstup musí po celou dobu zůstat neměnný.

Výsledky následující tabulky jsou **MĚŘENÉ**, kromě explicitně označené meze:

| Kontrola | Výsledek |
| --- | ---: |
| Zdrojové entity A | 338 968 |
| Kopie DATA | 43 |
| Výstup B | 805 309 283 |
| Entity výstupu | 14 575 624 = 43 × 338 968 |
| Zkontrolované reference | 25 112 129 |
| Duplicitní expressId / dangling refs / nerozpoznané DATA řádky | 0 / 0 / 0 |
| HEADER / DATA / ENDSEC / závěrečný END-ISO | 1 / 1 / 2 / přítomen |
| Čas nezávislé kontroly ms | 22 805,51 |
| Peak RSS procesu kontroly B | 136 187 904 |
| Horní mez výstupu pro kontrolu disku | 1 020 393 364 B — **ODHAD, konzervativní mez** |

**MĚŘENÉ:** SHA-256 výstupu
`0d00e3495f56b089f57c36805fe3e278012861b6cde9d7367c5c99176a6ee920`.
Soubor po kontrole smazán; `test ! -e ~/tmp-large/phase0-baseline-700.ifc`
prošel. Na Pi se žádný velký IFC nepřenášel.

Nezávislá kontrola používá Node fs/readline, nikoli skener generátoru. V tomto
konkrétním výstupu jsou všechny entity na jednom řádku a ID tvoří úplný interval
od prvního ID do počtu entit. Bitset kontroluje unikátnost a úplnost intervalu;
každá reference musí do tohoto intervalu patřit. Kontroluje též tvar záznamů,
vyváženost závorek a obálku. Proto nulové dangling refs zde nejsou jen
pravděpodobnostní vzorek. Pro obecná řídká ID by tento validátor potřeboval
další průchod/množinu ID. **NEOVĚŘENÉ:** úplná validita dle EXPRESS, geometrická
smysluplnost opakovaných projektů a unikátnost GlobalId; ta ani není zamýšlena.

**MĚŘENÉ:** dočasný funkční harness prošel 24 kontrolami: hranice bloků
o velikostech 1/2/3/7/17/64 B, UTF-8, uvozené reference a středníky, víceřádkové
entity, posunuté dopředné/cyklické reference, shoda s produkčním parserem na
malém výstupu, zákaz přepisu a stejné vstupní/výstupní cesty, neplatné velikosti,
nedostatek místa, dangling refs, duplicitní/unsafe ID, neuzavřené řetězce,
komentáře a obálka, závorky, odmítnutí komplexních entit, více DATA a prázdných
dat. Samostatně prošla dodatečná kontrola ID s úvodními nulami a dosažení
minimální cílové velikosti (**MĚŘENÉ**).

**MĚŘENÉ:** požadovaný `npx eslint scripts/ifc-diag/make-large-ifc.mjs` prošel.
`eslint --print-config` však vrací `rules: {}`: projektová pravidla se vztahují
na `assets/js/**/*.js`, nikoli diagnostické skripty. Provedena proto i čistá
kontrola dočasnou konfigurací s `no-unused-vars`, `no-undef`, `no-unreachable`,
`no-dupe-args`, `no-constant-condition`, `no-loss-of-precision`, `no-redeclare`
a `eqeqeq`. Prošel také `node --check`. Produkční eslint konfigurace se nemění.

## Odhad paměti a závěr

**ODHAD, podmíněný chybějícím vstupem:** pokud „840 MB“ pro D3_SO204 znamená
`F = 840 000 000 B` a soubor má stejných `95,338 B/entitu` jako historický D214X,
pak `N ≈ 8,811 milionu` entit; nejde o blokově změřený počet D3_SO204. Při
přídavku parseru `150,541–171,350 B/entitu` naměřeném na dostupných menších IFC
by současná reprezentace hypoteticky držela `F + N * přídavek ≈ 2,17–2,35 GB`
heapu, s obdobnými sekundárními indexy přibližně `2,45–2,68 GB` (**ODHAD**, bez
workerových kopií, vstupního ArrayBufferu, geometrie a špiček GC; současný guard
takto velký vstup ve skutečnosti odmítne). Navržená SoA s oddělenými poli
`Int32 id + Uint16 typ + Uint32 offset + Uint32 délka` má aritmeticky
`14 B/entitu`; se souborem v `Uint8Array` tedy `F + 14*N ≈ 963,35 MB`, čili
`0,897 GiB` (**ODHAD kapacity, nikoli implementované řešení ani změřené RSS**).
Nezahrnuje typový slovník, další indexy, režii bufferů ani dočasné alokace a
předpokládá ID a offsety v rozsahu uvedených typů. Přesný závěr pro D3_SO204
vyžaduje jeho skutečný počet entit, typy a velikost; bez tohoto souboru je
číselné srovnání jen scénář, nikoli dokončený baseline požadovaných modelů.

## Dodatek: velké soubory změřené bajtovým lexerem (fáze 1)

Velké soubory leží jen na Pi (`~/shared/3D_modely/IFC`), proto se streamovaly
`cat | ssh thinkpad node …` bez zápisu na disk ThinkPadu. **MĚŘENÉ**
(Node 22, `--expose-gc`, jediný běh):

| Soubor | Velikost | Entit | Dnešní parser (čas / heap) | Bajtový index (čas / typed arrays) |
| --- | ---: | ---: | ---: | ---: |
| D218_SO115005 | 220 MB | 4 304 297 | 6 094 ms / 928 MB | 3 715 ms / 106 MB |
| D214X | 453 MB | 4 977 286 | 8 206 ms / 1 238 MB | 5 294 ms / 109 MB |
| D3_SO204 | 801 MB | **13 808 371** | nelze (nad limit řetězce) | 12 088 ms / ~320 MB (výpočet; měření rušil GC) |

D3_SO204 má tedy 13,8 M entit, ne ~8,8 M z odhadu výše (ten předpokládal
stejnou hustotu jako D214X). Bajtový index prošel všemi třemi soubory s 0 rozdíly
proti `parseStepText` (kde šlo porovnat) a nad celým korpusem 1651 souborů /
18 379 407 entit s 0 rozdíly. Reprodukce: `scripts/ifc-diag/byte-lexer-parity.mjs`
(viz `scripts/ifc-diag/README.md`); syntetický velký soubor
`scripts/ifc-diag/make-large-ifc.mjs`.

## Fáze 2+3: engine nad bajty (EntityStore, worker s transferem, compact s uvolněním bajtů)

Stav po implementaci (větev `3d-viewer-integration`, nad `343f09f`):
`loadIfc` přijímá `ArrayBuffer`/`Uint8Array`/`Blob`/`string`; bajty se
transferují do `workers/parser.worker.js`, ten spustí `indexStepBytes` a vrátí
sloupce (typed arrays) + bajty zpět transferem. `EntityIndex` pracuje nad
`parser/entity-store.js` (Map-kompatibilní, líné `LazyEntity`, byType přes
counting sort, GUID index líně jen z prvního atributu root entit přímo z bajtů);
`compact()` překopíruje přeživší entity do Map řetězců a bajty uvolní. Pevný
60s timeout nahradil watchdog nečinnosti (heartbeat workeru každých 8 MiB,
`PARSE_IDLE_TIMEOUT_MS = 60 s` bez zprávy).

**MĚŘENÉ** (`scripts/ifc-diag/engine-memory-probe.mjs`, headless Chromium
z Puppeteeru, `--merged`, swiftshader, jediný běh; heap = `usedJSHeapSize` po
`gc()`, zahrnuje i ArrayBuffery; RSS = součet stromu procesů prohlížeče, vzorek
po 250 ms; "starý" = worktree `343f09f`):

| Model | Engine | parse ms | load ms | heap po parse | heap po načtení (po compact) | peak RSS |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| D214X (452,5 MiB, 4 977 286 entit, 16 901 produktů) | starý (string) | 14 812 | 47 831 | 1 581 MiB | 874 MiB | 4 596 MiB |
| D214X | nový (bajty) | 6 882 | 35 712 | 550 MiB | 934 MiB | 2 190 MiB |
| D3_SO204 (801,1 MiB, 13 808 371 entit, 8 946 produktů) | starý | nelze (nad limit řetězce) | — | — | — | — |
| D3_SO204 | nový | 13 443 | 74 191 | 1 058 MiB | 1 414 MiB | 3 273 MiB |

Fáze D3_SO204 nového enginu (`loadIfc timings`): parse 13 461, index 1 535,
geometrie 58 703, compact 361 ms; 13 799 368 entit zahozeno, 9 003 ponecháno.
Oba modely mají v obou enginech shodné geometrické statistiky (počty produktů,
0 unsupported/fallback/invalid) a shodný počet ponechaných entit po compact
(D214X: 818 934, GUID 273 839). Heap po načtení D214X je u nového enginu o
~60 MiB vyšší než u starého (934 vs 874 MiB) — jediný běh, příčina
**NEOVĚŘENÁ** (pravděpodobně dosud neuvolněná externí paměť ArrayBufferů v
okamžiku vzorku; po compact nic bajty nedrží — `storeGone=true`).

**MĚŘENÉ** parita: `geometry-diagnose.mjs --parser=text` vs `--parser=bytes`
nad `~/shared/real/RuzLet` (352 souborů, 50 787 produktů):
`compare-diagnose.mjs` → `differences=0` (stav, důvod, leafTypes, items,
vertices, triangles, NaN, degenerované, bboxLocal, diag, GUID, parserová
diagnostika). Korpusová brána `corpus-gate.mjs` (nově nad bajtovou cestou):
19 souborů, regressions=0.

Úzké místo pro ještě větší soubory (**ODHAD** z měření): v prohlížeči musí
současně existovat soubor (1×, transferem) + sloupce (~15 B/entitu + dense
lookup 4 B/id) + `fetch().arrayBuffer()`; u D3_SO204 to bylo 2,1 GiB RSS po
parse. Další limit je 2 GiB/4 GiB na jeden ArrayBuffer v Chromiu a čas
geometrie (59 s z 74 s) na hlavním vlákně.

## Reprodukce

Starší fáze; reprodukce nového UI měření je v samostatné sekci níže.

Všechny Node příkazy běží přes `tp-run` na ThinkPadu. Měřicí sonda
(`parseStepText` + `EntityIndex` se snapshoty `process.memoryUsage()` po
`global.gc()`) a blokový validátor generátoru byly dočasné soubory v `/tmp`
a nejsou verzované. Skutečný worker je `workers/parser.worker.js`.

## UI test >512 MiB

**MĚŘENO 2026-10-30**, větev `3d-viewer-integration`, produkční HEAD
`6f4654e`. Nový `scripts/ifc-diag/viewer-ui-probe.mjs`, žádné změny
produkčního kódu, commit ani push. ThinkPad, Node `v22.21.0`,
`Chrome/148.0.7778.97`, headless Puppeteer, SwiftShader,
`--js-flags=--max-old-space-size=8192 --expose-gc`, viewport 1280 × 800.
GC se nevolá. `tp-status`: tailscale/SSH/Chroma/Ollama OK.

**Výsledek: malý reálný IFC prošel; import syntetického 768 MiB IFC
tiše ztratil celý obsah ještě před gzipem. Celé UI pro >512 MiB neprošlo.**
Absence `pageerror` a `console.error` zde neznamená úspěch.

### Cesta UI a způsob měření

Viewer nemá file input ani importní drop zónu (sonda zjistila 0 file inputů).
Jeho panel Storage pouze vybírá uložené soubory. Sonda otevře skutečný
`pages/3d-viewer.html`, přejde na `index.html`, nahraje soubor pomocí
`ElementHandle.uploadFile()` do `#ifcFileInput`, u velkého vstupu klikne
na potvrzení a vyčká na `storage:fileAdded` i zmizení loading overlay.
Pak přejde zpět na viewer a klikne na skutečné `[data-load-file]` v automaticky
otevřeném Storage panelu. Nevkládá data přímo do úložiště ani nevolá engine
místo UI. Backend je `indexedDB`, výchozí merged geometrie a cache zůstávají
zapnuté; každý běh má nový dočasný profil, tedy žádný cache hit z minulého běhu.
Service worker je při navigaci obcházen a onboarding lokální složky potlačen.

Pozorovací obaly zachovávají argumenty/výsledky produkčních metod; zaznamenávají
FileReader, Compression, potvrzení transakce IDB a `BIMStorage.getFileBytes`.
Úspěch vyžaduje UI status `success`, viditelné modelové meshe s trojúhelníky,
živý WebGL kontext, žádné `pageerror`/`console.error`; sonda počká ještě na
dva vykreslovací snímky. Screenshoty byly také vizuálně zkontrolovány:
malý model mostu je vidět, velký má prázdný viewport a červený status.

RSS je součet `VmRSS` stromu procesů Chromia, vzorkování 250 ms plus události
fází; zahrnuje screenshot, nezahrnuje Node, diskovou cache OS ani generátor.
Sdílené stránky paměti mohou být započtené opakovaně; není to PSS ani součet
JS heapů. `heapBytes` v JSON jsou pouze snapshoty stránky bez GC, nikoli peak.
Jeden dokončený běh na vstup, nejde o statistiku. Před ním byly ukončeny dva
ladicí běhy malého vstupu kvůli chybnému čekání v sondě (prázdný seznam souborů,
opětovné kliknutí zavírající automaticky otevřený panel); níže nejsou započítány.

### Naměřená čísla

Všechny hodnoty této tabulky jsou **MĚŘENO**. Generátor vytvořil 43 kopií DATA,
14 575 624 entit; duplicitní GlobalId a opakovaná geometrie jsou záměr.
Velikost velkého souboru byla potvrzena `stat`, překračuje i požadovaných 600 MiB.

| Metrika | D214_SO112201.ifc | ui-700.ifc |
| --- | ---: | ---: |
| Vstup B (MiB) | 17 608 478 (16,793) | 805 309 283 (768,003) |
| FileReader výsledek: počet znaků | 17 608 478 | **0** |
| Uložený gzip B | 3 554 900 | **20** |
| `getFileBytes`: skutečně vrácené B | 17 608 478 | **0** |
| Upload od file inputu po skrytí overlay | 1 489 ms | 1 631 ms (prázdný obsah) |
| Viewer od kliknutí po zjištění konečného statusu | 6 097 ms | 4 542 ms (prázdný obsah) |
| Celé UI včetně navigací a čekání na snímky (`uiWallMs`) | 10 017 ms | 7 011 ms |
| Celý běh včetně screenshotu a zavření (`wallMs`) | 18 184 ms | 9 110 ms |
| Peak RSS B (MiB) | 1 367 097 344 (1 303,77) | 2 434 826 240 (2 322,03) |
| Registrované modely | 1 | 1 **prázdný** |
| Entity / produkty / vykreslené prvky | 338 968 / 202 / 202 | 0 / 0 / 0 |
| Modelové meshe / trojúhelníky | 1 / 120 468 | 0 / 0 |
| Neprázdná scéna | ano | **ne** |
| `pageerror` / `console.error` / failed requests | 0 / 0 / 0 | 0 / 0 / 0 |
| Návratový kód sondy | 0 | **1** |

Oba běhy zaznamenaly čtyři `console.warn`: deprecated Apple meta tag,
detekci software WebGL a dvakrát upozornění THREE na počet vzorků
`sigmaRadians`. Žádný crash, timeout ani ztráta WebGL kontextu.
Malý model: engine `parse=3656`, `index=37`, `geometry=1130`, `total=4842 ms`.
Velký vstup: engine `parse=11`, `index=1`, `geometry=2`, `total=14 ms` —
**toto jsou časy zpracování nuly bajtů, nikoli 768 MiB IFC**.

### Přesné místo selhání a návrh opravy

**MĚŘENO:** `FilePanel.uploadFiles()` v `assets/js/index.js:215` používá
`reader.readAsText(file)`. Pro 805 309 283 B přišel event `load`, nikoli
`error`; `resultType="string"`, `chars=0`, `reader.error=null`.
První prokazatelná ztráta dat je tedy převod souboru na celý JS řetězec.
Souvislost s limitem délky řetězce V8 je **interpretace** tohoto měření a
textové cesty; přesný hraniční počet znaků se v této úloze neměřil.

`onload` (`assets/js/index.js:184`) předá prázdný text do
`StorageManager.addFile()` (`assets/js/common/storage.js:288`).
`Compression.compress()` (`assets/js/common/compression.js:69`) úspěšně
vytvoří 20 B gzip prázdného řetězce. Transakce IndexedDB je potvrzená a UI
oznámí přidání souboru. Metadata dál nesou velikost původního souboru.
Není to selhání kvóty IndexedDB ani výjimka gzipu.

`getFileBytes()`/`decompressToBytes()` vrátí 0 B.
Kontrola `if (!raw)` v `assets/js/3d/viewer-page.js:204` nezachytí prázdný
typed array, protože objekt je truthy. Engine pak zpracuje prázdný buffer,
registruje model se schématem `UNKNOWN`, 0 entitami a 0 meshi. UI nakonec
hlásí `⚠ ui-700.ifc — 0 mesh (geometrie tohoto IFC zatím není podporovaná)`.
JSON `failedPhase="viewer-load"` označuje místo konečného neúspěšného statusu;
první poškození dat je již předtím v `FileReader.readAsText`.

**Navržená oprava, NEIMPLEMENTOVÁNO:** převést také import a zápis na bajty:
z file inputu předávat `File`/`Blob` (případně ArrayBuffer), gzipovat
`File.stream().pipeThrough(new CompressionStream('gzip'))` bez sestavení
celého JS řetězce a zachovat čtení přes `getFileBytes`. Před uložením ověřit,
že neprázdný vstup neztratil obsah; ve vieweru kontrolovat `byteLength === 0`
a hlásit prázdný/poškozený obsah místo nepodporované geometrie.
Import musí propagovat chyby čtení/komprese/zápisu a ukončit loading overlay
i při zamítnutí asynchronního `onload` (současný Promise řeší pouze `resolve`).

**NEOVĚŘENO:** komprese, uložení a následné načtení skutečného obsahu
>512 MiB touto UI cestou; engine ani geometrie nad syntetickými 768 MiB se
v tomto běhu vůbec neotestovaly. Také neověřeno: jiné prohlížeče, hardware
WebGL, opětovné načtení z cache a přesná hranice selhání FileReader.
Dřívější úspěšná přímá engine sonda na D3_SO204 zůstává odděleným výsledkem.

### Příkazy a artefakty

Příkazy spuštěné z Pi (Node/npm/Chromium výhradně na ThinkPadu), postupně:

```sh
tp-status
tp-run 'npx eslint scripts/ifc-diag/viewer-ui-probe.mjs && node scripts/ifc-diag/viewer-ui-probe.mjs ~/shared/real/RuzLet/D.2.1.4/D214_SO112201.ifc --timeout=180 --out=/tmp/viewer-ui-small.json --screenshot=/tmp/viewer-ui-small.png > /tmp/viewer-ui-small.stdout.json 2> /tmp/viewer-ui-small.log'
tp-run 'node scripts/ifc-diag/make-large-ifc.mjs ~/shared/real/RuzLet/D.2.1.4/D214_SO112201.ifc ~/tmp-large/ui-700.ifc 700 > /tmp/viewer-ui-generator.json && stat -c "%n %s bytes" ~/tmp-large/ui-700.ifc'
tp-run 'trap "rm -f ~/tmp-large/ui-700.ifc" EXIT; node scripts/ifc-diag/viewer-ui-probe.mjs ~/tmp-large/ui-700.ifc --timeout=1800 --out=/tmp/viewer-ui-large.json --screenshot=/tmp/viewer-ui-large.png > /tmp/viewer-ui-large.stdout.json 2> /tmp/viewer-ui-large.log'
tp-run 'npx eslint scripts/ifc-diag/viewer-ui-probe.mjs && node --check scripts/ifc-diag/viewer-ui-probe.mjs && npx eslint --print-config scripts/ifc-diag/viewer-ui-probe.mjs > /tmp/viewer-ui-eslint-config.json'
ssh -n thinkpad 'cat /tmp/viewer-ui-small.json'
ssh -n thinkpad 'cat /tmp/viewer-ui-large.json'
scp thinkpad:/tmp/viewer-ui-small.png /tmp/viewer-ui-small.png
scp thinkpad:/tmp/viewer-ui-large.png /tmp/viewer-ui-large.png
scp thinkpad:/tmp/viewer-ui-small.json /tmp/viewer-ui-small.json
scp thinkpad:/tmp/viewer-ui-large.json /tmp/viewer-ui-large.json
scp thinkpad:/tmp/viewer-ui-generator.json /tmp/viewer-ui-generator.json
ssh -n thinkpad 'ls -la ~/tmp-large; df -h ~'
```

ESLint i `node --check`: exit 0. **Omezení lintu:** `--print-config`
vrátil `"rules": {}`; pravidla pro `assets/js/**/*.js` se na skript
nevztahují, proběhla jen kontrola parsovatelnosti, nikoli projektová pravidla.
JSON/PNG jsou v `/tmp` na obou strojích, logy a ESLint config v `/tmp` na
ThinkPadu; nejsou verzované ani trvalý archiv. `tp-run` je nesmaže při rsync.
Dočasný Chromium profil se po zavření odstranil. Závěrečná kontrola:
`~/tmp-large` obsahoval jen `.` a `..`, disk `/dev/nvme0n1p5` měl 9,7 GiB
volných dle `df -h` (90 % obsazení). Velký syntetický IFC byl odstraněn
automaticky pomocí `trap` i při neúspěšném testu.

## UI test >512 MiB — po opravě importu

Výše popsané selhání (import přes `FileReader.readAsText` tiše vrátil prázdný
řetězec) se týká stavu `6f4654e`. Oprava: import souborů nad 128 MiB ukládá
`File` jako Blob a `Compression.compress` ho gzipuje streamem bez JS řetězce;
`Compression.decompress` hlásí chybu místo prázdného textu; viewer odmítne
prázdný obsah. **MĚŘENO** (stejná sonda a vstup `ui-700.ifc`, 805 309 283 B,
jediný běh): gzip 154 193 834 B, `getFileBytes` vrátil 805 309 283 B,
14 575 624 entit, 8 686 produktů a prvků, 1 mesh / 5 180 124 trojúhelníků,
neprázdná scéna, status „✓ … 14575624 entit, 1 mesh“, 0 `pageerror`
a 0 `console.error`. Celé UI 281 s (swiftshader), peak RSS stromu Chromia
3 606 MiB. Screenshot selhal na „diagnostic timeout“ (software GL), ostatní
kontroly prošly. **NEOVĚŘENO:** hardwarové WebGL, gzipovaný vstup >512 MiB
přes jiné stránky (validátor, IDS) — ty čtou obsah jako řetězec a po opravě
aspoň hlásí chybu místo prázdného souboru.

## Profil stavby geometrie (krok 1 návrhu geometrie ve workerech)

**MĚŘENO 2026-10-30**, větev `3d-viewer-integration` nad `1170f43` +
nekomitovaná instrumentace (viz níže), ThinkPad, headless Chromium z Puppeteeru,
SwiftShader, `engine-memory-probe.mjs --merged --profile`, jediný běh každého
souboru, velké soubory streamované z Pi (`cat | ssh thinkpad node …`).
Časy fází jsou čistý čas na hlavním vlákně (kooperativní yieldy `maybeYield`
vykázané zvlášť), `total` = wall-clock `addModel`. Rozpad: build =
`buildEntityGeometry` + bbox jeho položek, outlier = mediánový filtr, bake =
pass 1 (matice, anchor) + kopie vrcholů/normál/barev/indexů do merged bufferu,
edges = `extractFeatureEdges` + bake hran, finalize = BufferGeometry/Mesh,
konkatenace hran, `_finishMergedModel`, zbytek = `total − yield − součet fází`.

| Model | produktů | lookupKind | total ms | yield | build (a) | outlier (b) | bake (c) | edges (d) | finalize + zbytek (e) | build % |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| D214X (452,5 MiB) | 16 901 | dense | 26 616 | 2 539 | 21 181 | 8 | 526 | 2 110 | 186 + 67 | 80 % (88 % bez yieldů) |
| D3_SO204 (801,1 MiB) | 8 946 | dense | 58 509 | 4 666 | 49 639 | 5 | 696 | 3 209 | 248 + 46 | 85 % (92 % bez yieldů) |
| D214_SO112201 (16,8 MiB, korpus) | 202 | dense | 1 097 | 44 | 947 | 0 | 21 | 74 | 8 + 2 | 86 % |
| D214_SO112402_vykop (0,9 MiB, korpus) | 10 | dense | 126 | 1 | 107 | 0 | 4 | 8 | 4 + 2 | 85 % |

Celé `loadIfc` při tomto běhu: D214X load 35 765 ms (parse 6 859, compact 1 169),
D3_SO204 load 74 153 ms (parse 13 564, compact 366); peak RSS 2 217 / 3 309 MiB,
`storeGone=true`, geometrické statistiky shodné s předchozí sekcí (0 outlierů,
0 unsupported). `lookupKind` je u obou velkých souborů i u korpusu `dense`
(ID jsou hustá; `map` varianta se v měření nevyskytla).

Rozložení ms na produkt (jen produkty s geometrií, čas včetně bbox položek):

| Model | mean | p50 | p90 | p99 | max | top 10 / build | top 100 / build |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| D214X | 1,25 | 0,2 | 2,6 | 12,3 | 367 | 10,4 % | 26,7 % |
| D3_SO204 | 5,55 | 1,7 | 12,7 | 62,9 | 2 039 | 14,8 % | 29,6 % |
| D214_SO112201 | 4,69 | 0,7 | 6,4 | 33,9 | 249 | 65,2 % | 96,2 % |
| D214_SO112402_vykop | 10,7 | 9,9 | 24,1 | 24,1 | 24 | 100 % (10 produktů) | — |

Nejdražší produkty jsou ve všech případech `IFCBUILDINGELEMENTPROXY` s jednou
položkou (D3_SO204: #7125848 2 039 ms, #8777623 1 968 ms, #3013114 919 ms,
#5175906 822 ms; D214X: #2025726 367 ms, #2146096 317 ms, #182191 270 ms).
Histogram po 0,5 ms je v JSON výstupu sondy (`geometryProfile.histogramHalfMs`,
`/tmp/gp-*.json` na ThinkPadu, neverzováno). U malých souborů je mean
zkreslený JIT warm-up (prvních pár produktů stojí desítky ms).

**Závěr pro workery (ODHAD z MĚŘENÝCH čísel, Amdahl):** sériová část stavby
po paralelizaci buildu (bake + edges + finalize + zbytek) je 2,9 s u D214X a
4,2 s u D3_SO204, tj. ~11–13 % ze stavby geometrie bez yieldů. Build je dobře
dělitelný: top 10 produktů tvoří jen 10–15 % build času, nejdražší jednotlivý
produkt (2,0 s u D3_SO204) je hluboko pod `build / N` pro N ≤ 8 (49,6 s / 8 =
6,2 s), takže limitujícím prvkem není jeden obří produkt, ale součet. Při 8
workerech a ideálním rozdělení (bez režie přenosu a bez opakování parse ve
workerech) vychází stavba geometrie D3_SO204 ≈ 6,2 + 4,2 ≈ 10–11 s místo 54 s
(bez yieldů) a D214X ≈ 2,6 + 2,9 ≈ 5–6 s místo 24 s; se 4 workery ≈ 16–17 s,
resp. 8–9 s. Celkový `loadIfc` by pak u D3_SO204 ovládl parse (13,6 s).
**NEOVĚŘENO:** režie předání dat workerům (každý worker potřebuje přístup k
entitám — sdílený bajtový index přes `SharedArrayBuffer`, nebo vlastní parse),
přenos výsledných typed arrays zpět, chování na HW WebGL a na slabších strojích,
rozptyl mezi opakovanými běhy (vše jediný běh), a zda se `extractFeatureEdges`
(3,2 s u D3_SO204) dá přesunout do workerů spolu s buildem.

Instrumentace je volitelná (`loadIfc` `options.profile` / `addModel`
`opts.profile` / `globalThis.__IFC_GEOMETRY_PROFILE`), nemění výstup ani
`GEOMETRY_PIPELINE_VERSION`; souhrn dává `summarizeGeometryProfile` ve
`viewer/viewer-core.js` a ukládá se jen na záznam modelu ve vieweru
(`geometryProfile`). Reprodukce:

```sh
cat ~/shared/3D_modely/IFC/D3_SO204.ifc | ssh thinkpad "cd ~/work/BIM_checker && node scripts/ifc-diag/engine-memory-probe.mjs --stdin=D3_SO204.ifc --merged --profile --timeout=1800 --out=/tmp/gp-D3_SO204.json"
tp-run "node scripts/ifc-diag/engine-memory-probe.mjs ~/shared/real/RuzLet/D.2.1.4/D214_SO112201.ifc --merged --profile"
```

## Geometrie ve workerech nad SharedArrayBuffer (kroky A–C)

**MĚŘENO 2026-10-30**, větev `3d-viewer-integration` nad `096d223` +
nekomitované změny této úlohy, ThinkPad (8 log. CPU, 16 GB), headless
Chromium 148 z Puppeteeru, SwiftShader, `engine-memory-probe.mjs --merged
--profile --hash --geometry=main|workers`, jediný běh každé kombinace, velké
soubory streamované z Pi do `~/tmp-large` na ThinkPadu (po měření smazány).
`workers` = stránka s COOP/COEP (cross-origin izolace), soubor v
`SharedArrayBuffer`, sloupce bajtového indexu v SAB, `addModel` s poolem
N = min(hardwareConcurrency − 1, 6) = 6 module workerů, dávky po 64
produktech; `main` = dnešní cesta (bez izolace, transfer, hlavní vlákno).
Outlier filtr, bake merged bufferu, hrany a finalize zůstávají na hlavním
vlákně beze změny; `GEOMETRY_PIPELINE_VERSION` = 11 beze změny.

Co se implementovalo: (A) `geometry/*` a `alignment/linear-placement.js`
importují `three` relativní cestou (`../../../vendor/three/three.module.js`,
tj. tatáž URL jako importmapa → jedna instance THREE na hlavním vlákně,
ověřeno `instanceof` ve `worker-smoke.mjs`); (B) `indexStepBytes` alokuje
sloupce a dense lookup v SAB, když jsou bajty v SAB (`opts.shared`), `decodeRange`
dekóduje ne-ASCII/dlouhé rozsahy z kopie (Chromium odmítá `TextDecoder` nad
sdíleným view — **MĚŘENO**, `worker-smoke.mjs`), `toTransferable` SAB
netransferuje, `loadIfc` čte vstup přes `parser/input-bytes.js` (Blob streamem
do SAB, ArrayBuffer/view kopií); (C) `workers/geometry.worker.js` +
`viewer/geometry-worker-pool.js`: sloty podle pořadí produktů, instancované
listy (IfcMappedItem) posílané jednou na worker, watchdog nečinnosti 60 s,
fallback na hlavní vlákno pro každý nedodaný slot (bez izolace, chyba
workeru, watchdog, výjimka v produktu). V režimu `auto` (viewer) se workery
použijí až od 500 produktů (`GEOMETRY_WORKERS_MIN_PRODUCTS`): na
D214_SO112201 (202 produktů) stál start 6 workerů víc než stavba
(**MĚŘENO** 1 955 ms paralelní fáze vs 976 ms build na hlavním vlákně).

### Bitová identita (MĚŘENO)

SHA-256 merged bufferů position/normal/color/index, bufferu hran, tabulek
(`mergedTable`, `mergedEdgesTable`, `elementInfo`) a `.bimcache` payloadu
(JSON bez `modelId` + binární chunky) jsou v režimech `workers` a `main`
**identické** u D214_SO112201 (202 produktů, 109 406 vrcholů), D214X
(16 901 produktů, 3 485 933 vrcholů, 4 629 613 trojúhelníků) i D3_SO204
(8 946 produktů, 4 952 252 vrcholů, 6 663 029 trojúhelníků). Např. D214X
position `caf8f7d57fc1c78e…`, D3_SO204 position `652524c72a98f6ef…` v obou
režimech. Korpusová brána (`corpus-gate.mjs`, 19 souborů, 53 produktů) prošla
v obou režimech s `regressions=0`; `compare-diagnose.mjs` main vs workers →
`differences=0`. Testy `node tests/run-tests.js`: 1313/1313 bez izolace
(1302 původních + 11 nových; paralelní testy se bez SAB hlásí jako
přeskočené a ověřuje se fallback) i s `TEST_ISOLATED=1` (COOP/COEP, paralelní
cesta, 404 worker, mlčící worker → watchdog, instancované listy sdílené vs
klonované). Lint 6575 varování (baseline sníženo z 6577).

### Čas a paměť (MĚŘENO, jediný běh)

| Model | Režim | parse ms | load ms | geometrie `addModel` ms | build / paralelní fáze ms | yield ms | peak RSS stromu | RSS po parse | RSS po načtení |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| D214X (452,5 MiB, 16 901 produktů) | main | 6 774 | 36 030 | 26 961 | 21 493 | 2 536 | 2 972 MiB | 1 532 MiB | 1 471 MiB |
| D214X | workers (6) | 8 364 | 24 075 | 13 144 | 9 925 | 307 | 3 228 MiB | 1 984 MiB | 1 892 MiB |
| D3_SO204 (801,1 MiB, 8 946 produktů) | main | 13 376 | 74 187 | 58 705 | 49 836 | 4 668 | 2 961 MiB | 2 153 MiB | 1 539 MiB |
| D3_SO204 | workers (6) | 15 465 | 43 806 | 25 848 | 21 301 | 407 | 4 589 MiB | 2 977 MiB | 2 413 MiB |

Fáze mimo build (outlier + bake + hrany + finalize + zbytek) jsou v obou
režimech shodné (D214X ≈ 2,9 s, D3_SO204 ≈ 4,2 s), jak předpověděl Amdahlův
odhad výše. Všech 16 901 / 8 946 produktů dodaly workery (`fallback=0`,
`error=null`). Geometrické statistiky (`meta.geometry`) jsou shodné.

Interpretace (**ODHAD** z MĚŘENÝCH čísel): zrychlení paralelní fáze je jen
2,2–2,3× při 6 workerech, ne ~6×. Příčiny nejsou změřené; kandidáti:
studený JIT v každém workeru, serializace/materializace výsledků na hlavním
vlákně (součást „paralelní fáze“), lazy stavba sekundárních struktur v
každém workeru a SwiftShader/renderer soupeřící o 8 jader. Parse je ve
`workers` režimu o 1,6–2,1 s delší — **ODHAD**: kopie souboru do SAB
(`readInputBytes` z ArrayBufferu) a alokace sloupců v SAB.

Paměť: peak RSS D3_SO204 ve `workers` je **4 589 MiB (4,48 GiB ≈ 4,81 GB)**,
tj. nad cílem „≤ ~4,5 GB“ (4,5 GB = 4 291 MiB) o ~300 MiB, pod 4,5 GiB o 19 MiB.
Složky navíc proti `main` (**ODHAD** z fázových vzorků): po parse je RSS o
824 MiB vyšší = sonda drží `fetch().arrayBuffer()` a navíc kopii v SAB
(`readInputBytes`), kterou dnešní cesta nemá (transfer); po načtení je o
874 MiB vyšší — workery byly v okamžiku vzorku ukončeny, SAB se uvolní až
po GC. Snížení je možné bez změny formátu: číst z úložiště jako `Blob` a
streamovat přímo do SAB (cesta v `readInputBytes` existuje, `getFileBytes`
dnes vrací bajty), **NEIMPLEMENTOVÁNO**.

**NEOVĚŘENO:** chování na HW WebGL a na slabších strojích (méně jader),
rozptyl opakovaných běhů, produkční nasazení — `_headers` nemá COEP, takže
nasazený viewer dnes běží výhradně cestou `main` (fallback), workery se
zapnou až s rozhodnutím o COEP (vliv COEP na cross-origin zdroje stránek
není v této úloze testován). Viewer UI (`viewer-page.js`) se neměnil; režim
lze vynutit `globalThis.__IFC_GEOMETRY_MODE = 'main' | 'workers'`.

Reprodukce:

```sh
tp-run 'node scripts/ifc-diag/worker-smoke.mjs && node scripts/ifc-diag/worker-smoke.mjs --no-isolation'
tp-run 'TEST_ISOLATED=1 node tests/run-tests.js'
tp-run 'node scripts/ifc-diag/corpus-gate.mjs --geometry=main --out=/tmp/cg-main && node scripts/ifc-diag/corpus-gate.mjs --geometry=workers --out=/tmp/cg-workers && node scripts/ifc-diag/compare-diagnose.mjs /tmp/cg-main /tmp/cg-workers'
tp-run 'node scripts/ifc-diag/engine-memory-probe.mjs ~/shared/real/RuzLet/D.2.1.4/D214_SO112201.ifc --merged --profile --hash --geometry=workers'
cat ~/shared/3D_modely/IFC/D3_SO204.ifc | ssh thinkpad "cat > ~/tmp-large/D3_SO204.ifc" && ssh thinkpad "cd ~/work/BIM_checker && bash -lc 'node scripts/ifc-diag/engine-memory-probe.mjs ~/tmp-large/D3_SO204.ifc --merged --profile --hash --geometry=workers --timeout=1800'; rm ~/tmp-large/D3_SO204.ifc"
```
