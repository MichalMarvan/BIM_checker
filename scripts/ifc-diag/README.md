# IFC diagnostika — průchod B (geometrie)

## Nezávislý oracle: web-ifc versus náš engine

`oracle-compare.mjs` používá dvě oddělené implementace: Node/WASM z npm
`web-ifc` (připnuté `0.0.78` v devDependencies) a skutečný engine v Puppeteer
stránce `oracle-page.mjs`. Referenční worker `oracle-web-ifc.mjs` neimportuje
žádný parser, geometrii ani transformace z `assets/`.

```sh
tp-status
# --package-lock=false respektuje omezení tohoto úkolu na package.json;
# existující package-lock.json není tímto úkolem aktualizován.
tp-run 'npm install --package-lock=false --legacy-peer-deps'
tp-run 'node scripts/ifc-diag/verify-oracle.mjs'
tp-run --pull test-results
tp-run 'node scripts/ifc-diag/oracle-compare.mjs ~/shared/buildingsmart/IFC4.x-specification-models/models ~/shared/RuzLet/D.2.1.4/D214_SO112201.ifc --sample=50 --timeout=300 --out=test-results/ifc-diagnostics/oracle'
tp-run --pull test-results
```

Na tomto stroji je D214 v `~/shared/RuzLet/D.2.1.4/`; `~/shared/models`
neexistuje. Kopie korpusu má 46 IFC souborů, takže `--sample=50` zpracuje
všech 46 plus explicitně zadaný D214. U většího korpusu se vzorek vybírá
deterministicky po jednom souboru z každé první podsložky adresáře dokola,
do limitu N **pro každý zadaný adresář**; jednotlivé soubory se neomezují.
Bez `--sample` se zpracují všechny soubory. Manifest zaznamenává skutečný výběr.

Pro opakování přesně téhož výběru:

```sh
tp-run 'node scripts/ifc-diag/oracle-compare.mjs --manifest=test-results/ifc-diagnostics/oracle/manifest.json --out=test-results/ifc-diagnostics/oracle-repeat'
tp-run --pull test-results
```

Manifest je JSON pole cest (relativní cesty se vyhodnocují vůči manifestu).
Reálné cesty se deduplikují, přípona IFC je case-insensitive, adresářové cykly
se nepřecházejí. `--timeout=300` platí samostatně pro browser a web-ifc na každý
soubor. Worker lze ukončit i během synchronního WASM; timeout/pád/odmítnutí
schématu dává `FILE_ERROR`, zachová dostupná data a pokračuje dalším souborem.
Návratový kód 0 znamená dokončené měření, **nikoli shodu geometrie**;
2 znamená některý FILE_ERROR, 1 chybu vstupů/spuštění.

### Souřadnice a výběr produktů

- `bboxWorld = [minX,minY,minZ,maxX,maxY,maxZ]` je v metrech v osách IFC Z-up.
  Jde o modelový svět po placementu produktu, bez centrování vieweru,
  `IfcMapConversion`, CRS reprojekce a federace. Georeference se nedopočítává.
- Náš engine se načítá stejně jako v `geometry-page.mjs`: STEP parser,
  `EntityIndex`, `detectProductTypes ∪ HIDDEN_PRODUCT_TYPES`, bez compact/outlier
  filtru. Skryté produkty mají `VIEWER_HIDDEN` a geometrie se pro ně nestaví.
  `buildEntityGeometry → matrix + items` se skládá přesně jako
  `viewer-core._itemMatrix`: `matrix × item.parentMatrix × T(localOrigin)`.
  Transformují se jednotlivé vrcholy; až potom se sestaví bbox. Nakonec se
  použije `extractLengthScale`; stejně jako `index.js` se nastaví i kontextové
  jednotky pro smíšené modely. Zdrojový engine se nemění.
- Web-ifc vybírá `GetLineIDsWithType(IFCPRODUCT, true)` a `StreamMeshes`.
  Nepoužívá `StreamAllMeshes`, který vynechává otvory/prostory. Z každého
  flatMesh se sečtou indexy/3 a transformují xyz vrcholy všech placedGeometries
  jejich column-major `flatTransformation`. Web-ifc převádí na metry;
  `(x,y,z)` jeho Y-up výstupu se vrátí na IFC `(x,-z,y)`. Nastavení:
  `COORDINATE_TO_ORIGIN=false`, `CIRCLE_SEGMENTS=48`,
  `ALLOW_INCOMPATIBLE_SCHEMA_ALIASES=false` (preview schémata se nevydávají
  za podporovaná). Nastavení/verze/coordinationMatrix jsou ve výstupu.
- Obě strany sčítají trojúhelníky včetně instancí; rozdílná triangulace sama
  o sobě není chyba. Strana s trojúhelníky a konečným bbox má geometrii.
  Neplatné vrcholy a výjimky mají samostatný seznam a nevstupují do párování.

### Párování, práh a výstupy

Páruje se výhradně podle GlobalId **uvnitř jednoho IFC souboru**. Produkty bez
GUID a duplicitní GUID jsou vykázané zvlášť; nikdy se nevolí libovolný pár.
`onlyOurs`/`onlyWebIfc` znamená geometrie jen na jedné straně; obsahuje i stav
protistrany (např. `VIEWER_HIDDEN`, `NO_GEOMETRY` nebo nepřítomnost ve výběru).
Není to automaticky důkaz chybějící entity nebo vady geometrického builderu.

Pro diagonály `d` a středy `c` obou bbox:

```text
diagonalRelative = abs(d_ours - d_webIfc) / d_webIfc
centerRelative   = distance(c_ours, c_webIfc) / d_webIfc
score            = max(diagonalRelative, centerRelative)
exceedsThreshold = score > 0.01
```

Práh lze změnit `--threshold=0.01`. Nulová referenční diagonála má relativní
hodnoty/práh `null`, absolutní vzdálenosti se zachovají a pár se počítá zvlášť.
Přesná shoda s prahem jej nepřekračuje. JSON ukládá relativní hodnoty jako
zlomky, markdown jako procenta. Žebříček podle `ifcType` řadí podle maxima
score, dále ukládá počty spárovaných a překročení prahu.

V cílovém adresáři vzniká:

- `manifest.json`: přesný seznam vstupních IFC.
- `summary.json` a `summary.md`: souhrn, výsledky souborů, žebříček typů a top
  100 odchylek. Markdown obsahuje také úplné seznamy produktů jen na jedné
  straně. Souhrn zahrnuje pouze dokončené soubory.
- `*.ours.json`, `*.web-ifc.json`: všechny vybrané produkty, GUID, expressId,
  typ, stav, trojúhelníky, bboxWorld, metadata; vlastní diagnostiky u našeho
  enginu. Při chybě nemusí být referenční JSON vytvořen.
- `*.comparison.json`: úplné páry i jednostranné produkty, nejednoznačné GUID,
  chyby, metriky a odkazovatelná expressId. `*.web-ifc.log`: výstup workeru.
- SHA-256 IFC, všech JS modulů enginu a tří modulů oracle, Node/Chromium verze,
  parametry a časy umožňují identifikovat měřený stav. Během běhu neměňte zdroje.

`verify-oracle.mjs` ověřuje analytické bbox ve web-ifc, jednotky m/mm/feet,
vnořený placement, mapování, velké lokální souřadnice a skryté prostory.
Samotné měření v Chromium ověřuje samostatně na známých maticích a bufferu
s `localOrigin`. Kontroluje také GUID, jednostranné produkty, nulovou
diagonálu a hranici 1 %. Zjištěné neshody enginu v rotovaných mapách ukládá
jako `observedDisagreements`, nepředstírá jejich opravu.
Ověřuje také pokračování na další soubor po nepodporovaném schématu a ukončení
browseru i WASM workeru timeoutem.

### Naměřený běh 2026-10-29

Výstup `test-results/ifc-diagnostics/oracle/` obsahuje 46 souborů buildingSMART
z 11 složek a D214 (47/47 dokončeno, žádný FILE_ERROR):

| Vstupy | Spárováno | Nad 1 % | Jen u nás | Jen web-ifc |
| --- | ---: | ---: | ---: | ---: |
| buildingSMART | 157 | 21 | 0 | 9 |
| D214_SO112201.ifc | 202 | 0 | 0 | 0 |
| Celkem | 359 | 21 | 0 | 9 |

Překročení prahu podle typu: IFCBUILDINGELEMENTPROXY 2, IFCBEAM 9,
IFCREFERENT 10. Největší score: 36,75445 % u
`mapped-shape-with-transformation.ifc`, #1000, a 26,06787 % u
`mapped-shape-with-multiple-items.ifc`, #1000. Úplný žebříček je v summary.md.
Z devíti jednostranných produktů má šest u nás NO_GEOMETRY, dva jsou skryté
otvory (VIEWER_HIDDEN), jeden náš výběr produktů nezahrnuje. Nebyly nejednoznačné
ani chybějící GUID, invalidní produkty nebo nulové referenční diagonály.

Běh proběhl na ThinkPadu v izolované kopii `/tmp/bim-oracle.dzPayG`, protože
při prvním běhu zmizel výstupní adresář sdílené synchronizované kopie.
Výsledky byly potom přeneseny zpět přes `tp-run --pull test-results`.
Node v22.21.0, Chrome 148.0.7778.97, web-ifc 0.0.78; schémata IFC4 (D214)
a IFC4X3_ADD2 (46 souborů). Kontrola `run-validation.json` potvrzuje všechny
artefakty, počty a shodu hashů 80 modulů enginu, harnessu a vstupů před/po běhu.
`verification/verification.json` zachycuje ověření harnessu a tři samostatné
syntetické neshody rotovaných map (nejsou součástí korpusových 21 odchylek).

Web-ifc je nezávislá implementace, nikoli certifikovaná pravda. Shoda bbox
neověřuje povrch, topologii, otvory, objem, normály ani úplnost geometrií,
které nevrátil ani jeden engine. Test také neověřuje georeferenci. Podklady:
[web-ifc API](https://thatopen.github.io/engine_web-ifc/docs/classes/web-ifc.IfcAPI.html),
[skládání flatMesh](https://github.com/ThatOpen/engine_web-ifc/blob/main/src/cpp/web-ifc/geometry/IfcGeometryProcessor.cpp).

## Původní diagnostika geometrie

`geometry-diagnose.mjs` používá Puppeteer, jeden Chromium a lokální HTTP server
na volném loopback portu. Engine se importuje beze změn přes `diag-page.html`
a lokální `three`. IFC se streamuje přes HTTP, nikoli jako argument CDP.
Vyžaduje Node 22 a již nainstalovaný Puppeteer/Chromium na ThinkPadu.

```sh
tp-status
tp-run 'node scripts/ifc-diag/geometry-diagnose.mjs ~/shared/buildingsmart/IFC4.x-specification-models --out=test-results/ifc-diagnostics/geometry-spec'
tp-run 'node scripts/ifc-diag/geometry-diagnose.mjs ~/shared/RuzLet/D.2.1.4/D214_SO112201.ifc --out=test-results/ifc-diagnostics/geometry-large'
tp-run 'node scripts/ifc-diag/geometry-diagnose.mjs ~/shared/buildingsmart --out=test-results/ifc-diagnostics/geometry'
tp-run --pull test-results
```

Při opakovaných bězích stáhněte výsledky **před dalším synchronizujícím `tp-run`**,
nebo použijte `tp-run --no-sync '…'`: synchronizace používá `rsync --delete`.
Nespouštějte souběžně jinou synchronizaci stejného repozitáře. `--pull` nezobrazuje
výstup spouštěného příkazu; vlastní běh a stažení jsou samostatné kroky.

Vstupy jsou soubory nebo adresáře, rekurzivně a bez ohledu na velikost písmen
přípony `.ifc`; reálné cesty se deduplikují, adresářové cykly se nepřecházejí.
`--limit=N` vezme prvních N souborů ze seřazeného seznamu.
`--timeout=120` je limit v sekundách na celý soubor (včetně načtení stránky).
`--out=…` je adresář, výchozí `test-results/ifc-diagnostics/geometry`.
Návratový kód: 0 dokončeno, 2 některý soubor `FILE_ERROR`, 1 chyba spuštění/vstupů.

## Rozsah a stavy

Výběr produktů je přímo `detectProductTypes(index)` z vieweru plus
`HIDDEN_PRODUCT_TYPES`, aby byly vykázány i skryté produkty. Nejde o vlastní
úplnou schématovou klasifikaci IfcProduct: typy vyloučené detektorem vieweru
(např. anotace, grid a prostorové kontejnery kromě skrytých prostorů) zde nejsou.
Zachovává se i vzorkování prvních tří entit v dynamické detekci vieweru.
Počítají se všechny entity vybraných typů, tedy i ty bez Representation.
Na neskrytých produktech se volá `buildEntityGeometry`; skryté se pouze evidují.
`EntityIndex.compact()` ani outlier filtr se nikdy nespouští.

| Stav | Význam |
| --- | --- |
| `OK_EXACT` | Jsou items a engine nehlásí aproximaci ani neúplnost. |
| `OK_APPROXIMATED` | Jsou items a `fallbackGeometryCount > 0`. |
| `PARTIAL` | Jsou items, ale též unsupported, invalidRef nebo recursion limit. Má přednost před aproximací. |
| `UNSUPPORTED_GEOMETRY` | Nejsou items, unsupported není prázdné. |
| `NO_REPRESENTATION` | Representation je vynechaná (`$`, `*`, chybějící). |
| `FAILED_GEOMETRY` | Výjimka, null s uvedenou Representation nebo prázdná geometrie bez unsupported. |
| `NOT_APPLICABLE` | Typ z `HIDDEN_PRODUCT_TYPES`; geometrie se nevytváří. |

`OK_EXACT` znamená pouze výsledek diagnostiky enginu, nikoli certifikovanou
geometrickou přesnost. NaN/degenerované trojúhelníky mají samostatné čítače
a nemění tyto stavy. Neplatná reference na kořen Representation vede při null
výsledku k `FAILED_GEOMETRY`; `diag.invalidRef` je původní čítač enginu,
není doplňován heuristikou harnessu.

## Výstupy a interpretace

- Jeden `*.jsonl` na soubor, jméno obsahuje pořadí a hash úplné cesty.
  Každý řádek má `expressId`, `ifcType`, `guid`, `status`, `reason`, `leafTypes`,
  `items`, `vertices`, `triangles`, `nanCount`, `degenerateTriangles`,
  `bboxLocal` a `diag{unsupported,fallback,exactBool,recursion,invalidRef}`.
- `summary.json`: jednotlivé soubory, agregace, parser diagnostics, časy,
  odhad paměti a případné `FILE_ERROR`; také kořen zdrojů a SHA-256 šesti hlavních
  modulů enginu pro identifikaci měřeného stavu. Počet produktů je znám po parsování;
  `processedProducts` je počet skutečně zapsaných řádků. Dávky mají 100 produktů.
  Při chybě zůstávají již zapsané dávky; rozpracovaná dávka se může ztratit.
- `summary.md`: tabulka souborů a úplný žebříček nepodporovaných typů.
  `% OK` používá (EXACT + APPROXIMATED) / zpracované produkty s Representation
  kromě skrytých; PARTIAL se mezi OK nezahrnuje. Prázdný jmenovatel je `—`.

`leafTypes` rozbaluje reprezentace, mapování, CSG solid a **oba** Boolean operandy;
inventarizuje i reprezentace, které engine interně vynechá (Axis/Box apod.).
Graf se prochází iterativně s ochranou proti cyklům. Není-li list zjistitelný,
použije se `diag.unsupported`. Žebříček se odvozuje **jen** z hlášení enginu,
jednou na typ a produkt, nikoli ze všech listů. Tím se ignorovaný druhý Boolean
operand nevydává za skutečně hlášené unsupported. Hlášení může znamenat také
selhání implementovaného builderu; nerozbalitelný wrapper zůstává pod svým typem.

`bboxLocal = [minx,miny,minz,maxx,maxy,maxz]` je v lokálním prostoru produktu:
vrcholy + `geometry.userData.localOrigin` + `item.parentMatrix`, bez produktové
placement matice, georeference a převodu jednotek. Neplatné body se vynechají;
není-li konečný bod, bbox je null. Čítače vrcholů/trojúhelníků sčítají items,
včetně instancí. `nanCount` počítá nekonečné i NaN komponenty pozic po této
lokální transformaci, nikoli normály. Degenerace zahrnuje neplatné indexy/body
a nulovou/téměř nulovou plochu (`|AB×AC|² <= 1e-24 |AB|²|AC|²`).

`parseMs` měří parser, `indexMs` index a detekci produktů; `geometryMs` konstrukci
geometrie včetně inventury listů a měření bufferů, bez HTTP reportů.
`elapsedMs` je čas celého souboru/běhu. `peakJsHeapBytes` je vzorkovaná použitá
JS heap; `peakBrowserRssBytes` je vzorkovaná suma Linux RSS procesů browseru
(500 ms + hranice souboru), sdílené stránky mohou být započteny vícekrát.
Nejde o přesné maximum alokované paměti.
Stránka se mezi soubory zavře a vytvoří znovu, včetně odstranění indexů/cache.
Timeout i pád rendereru se evidují a zpracování pokračuje. Pokud spadne celý
browser, další soubory mají FILE_ERROR; nový browser se v témže běhu nespouští.
Pro srovnatelný korpusový běh neměňte zdroje enginu během měření. Při souběžné
práci použijte samostatnou kopii harnessu a `assets/` se zachovanými relativními
cestami; samotné vstupní IFC mohou zůstat na původním místě.

## CI brána nad regresním korpusem (`corpus-gate.mjs`)

`tests/fixtures/ifc-corpus/` obsahuje ~19 drobných IFC (celkem ~160 kB, původ a
licence v jeho `README.md`). `scripts/ifc-diag/corpus-gate.mjs` nad ním spustí
`geometry-diagnose.mjs` (stejný harness, Puppeteer) a porovná výsledek
s `tests/fixtures/ifc-corpus/expected.json` — per soubor počty produktů podle
stavu, parser diagnostics a per produkt stav + degenerované trojúhelníky.

```sh
tp-run 'npm run test:ifc-corpus'                 # brána (CI krok „IFC geometry regression corpus gate“)
tp-run 'npm run test:ifc-corpus -- --update'     # vědomá aktualizace expected.json
tp-run --pull test-results                       # surové výstupy: test-results/ifc-diagnostics/corpus-gate/
```

Brána selže (kód 1) **jen při regresi** nebo absolutní chybě:

- soubor skončil `FILE_ERROR`, chybí v běhu, nebo není v `expected.json`;
- jakýkoli produkt `FAILED_GEOMETRY` nebo `nanCount > 0` (vždy, i když by to expected.json obsahoval);
- produkt má horší stav než očekávaný (pořadí `OK_EXACT < OK_APPROXIMATED < PARTIAL
  < NO_REPRESENTATION < UNSUPPORTED_GEOMETRY < FAILED_GEOMETRY`; změna z/na
  `NOT_APPLICABLE` je vždy regrese), zmizel, přibyl mu nepodporovaný typ nebo
  vzrostl počet degenerovaných trojúhelníků;
- parser: vzrostl `invalidRecordCount`/`duplicateIdCount`, nově neukončený záznam,
  klesl `entityCount`, změnilo se schéma.

Lepší stav než očekávaný se vypíše jako `IMPROVED` a bránu neshodí; nové produkty
jako `INFO`. V obou případech přeneste stav do `expected.json` přes `--update`
(spusťte, zkontrolujte diff `expected.json` a commitněte ho spolu se změnou enginu).
`--update` odmítne zapsat stav s `FILE_ERROR`; se stavem FAILED/NaN zapíše, ale
upozorní, že brána stejně selže. Volby: `--corpus=dir`, `--expected=file`,
`--out=dir`, `--timeout=s`.

Nový fixture: zkopírujte malý soubor do `tests/fixtures/ifc-corpus/`, doplňte
řádek do jeho `README.md` (původ, licence) a spusťte `--update`.

## Parita STEP tokenizerů (`parser-parity.mjs`)

Porovnává čtyři tokenizery nad reálnými soubory: `parseStepText` (reference),
`IFCParserCore._buildEntityMap`, `IFCStreamParser` a viewer parser
`collectIfcEntities`/`parseEntityFast` (`assets/js/ifc/viewer-parser.js`;
u typů ze `SKIP_ENTITY_TYPES` se porovnává jen id a typ, params viewer nevyřezává).

```sh
tp-run 'node scripts/ifc-diag/parser-parity.mjs tests/fixtures/ifc-corpus ~/shared/buildingsmart/IFC4.x-specification-models/models --sample=40'
```

Návratový kód 2 = nalezen rozdíl. Syntetické případy hlídá
`tests/test-suites/ifc-parser-parity.test.js`.

## Parita byte-lexeru (`byte-lexer-parity.mjs`)

`assets/js/3d/ifc-engine/parser/byte-lexer.js` indexuje STEP přímo nad
`Uint8Array` (struct-of-arrays, params se dekódují líně) a nepotřebuje celý
soubor jako jeden JS řetězec (limit V8 2^29 code units). Skript pro každý
soubor porovná s `parseStepText` počet entit, pořadí, typ, RAW params,
čísla řádků a diagnostiku (počty i vzorky) a změří čas a paměť obou cest
(`heapUsed` + `arrayBuffers`, s `--expose-gc` po GC).

```sh
tp-run 'node --expose-gc scripts/ifc-diag/byte-lexer-parity.mjs tests/fixtures/ifc-corpus ~/shared/real/RuzLet/2021_0204_RuzLet_Modely ~/shared/buildingsmart --max-mb=600 --quiet'
# model nad limit řetězce nebo mimo ThinkPad: pošli bajty rourou, nic se nekopíruje na disk
cat ~/shared/3D_modely/IFC/D3_SO204.ifc | ssh thinkpad "cd work/BIM_checker && bash -lc 'node --expose-gc --max-old-space-size=12000 scripts/ifc-diag/byte-lexer-parity.mjs --stdin=D3_SO204.ifc --index-only'"
```

Soubory větší než `MAX_STEP_TEXT_BYTES` se automaticky zpracují jen
byte-lexerem (`INDEX` místo `OK`). Návratový kód 2 = rozdíl. Syntetické
hrany a diferenciální test nad `tests/fixtures/ifc-corpus` hlídá
`tests/test-suites/ifc-byte-lexer.test.js`. Pozor: `tp-run` synchronizuje
s `--delete`, takže JSON výstup v `test-results/` na ThinkPadu přežije jen do
dalšího `tp-run` — stáhni ho `tp-run --pull test-results` hned po běhu.

## Ověření harnessu

```sh
tp-run 'node scripts/ifc-diag/verify-geometry.mjs'
```

Generované IFC fixtures a výsledky jsou pouze v `test-results/ifc-diagnostics/`.
Ověřují sedm stavů, oba Boolean postupy, výjimku a null, mapovaný bbox včetně
`localOrigin`, GUID, neplatné reference, cyklus, NaN, degeneraci, počty žebříčku
a pokračování na další soubor po vynuceném timeoutu. Engine ani `tests/` nemění.
