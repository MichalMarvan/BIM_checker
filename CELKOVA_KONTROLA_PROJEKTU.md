# Celková kontrola projektu BIM Checker

**Datum kontroly:** 22. 7. 2026  
**Kontrolovaná větev:** `3d-viewer-integration`  
**Rozsah:** IDS, IFC, validace, Excel/CSV, IFC tabulkový viewer, 3D viewer, propojení stránek, úložiště, PWA/offline režim, AI, Tauri, testy, CI, bezpečnost a dokumentace

> **Rozhodnutí po auditu:** Desktopová varianta Tauri nebude dále vyvíjena. Složky `src-tauri` a `dist` určený pro Tauri build byly odstraněny. Doporučení vztahující se výhradně k Tauri jsou v tomto dokumentu ponechána pouze jako historický kontext auditu a nejsou součástí další realizace.

> **Stav realizace:** Tento dokument je původní auditní snímek, takže číselné
> údaje a oddíly „současný stav“ níže popisují stav před opravami. Schválená
> opatření byla následně realizována: CI quality gates, lokální runtime
> závislosti a CSP, privacy/AI consent, buildingSMART IDS corpus, verzovaný
> Excel a importní protokol, bezpečný CSV export, parity validace, skutečné
> IFC→3D E2E, offline/a11y/visual/performance testy, diagnostika geometrie,
> správa cache a projektová záloha, registr databází/služeb a provozní
> dokumentace. Aktuální architekturu a přesné hranice podpory popisují
> `docs/ARCHITECTURE.md`, `docs/IDS_IFC_SUPPORT.md`,
> `docs/3D_GEOMETRY_SUPPORT.md`, `docs/EXCEL_FORMAT.md` a
> `docs/KNOWN_LIMITATIONS.md`. Nezávislá certifikace a rozšiřování veřejně
> licencovaného IFC corpus jsou průběžné externí validační činnosti, nikoli
> tvrzení o hotové certifikaci.

## Ověření po realizaci

- **1 073/1 073** unit a integračních testů prošlo bez neočekávané browserové chyby.
- Oficiální buildingSMART IDS 1.0 corpus `v1.0.0` na commitu
  `1effec6f419798ce09617416d258a35bdc58320a`: **281/281** očekávaných výsledků.
- Smoke test: **5/5** hlavních stránek; offline test: **5/5** tras včetně
  načtení uloženého IFC v 3D enginu.
- IFC→3D handoff E2E, sedm vizuálních stavů vieweru a výkonový budget prošly.
- Accessibility: **54** kombinací stránek, modálů, motivů a viewportů bez
  serious/critical Axe nálezu.
- ESLint: **0 chyb**, warning debt snížen z auditních 21 194 na **18 326** a
  tento počet je nový nepřekročitelný baseline.
- `npm audit --audit-level=high`: **0** známých zranitelností.

## 1. Shrnutí

Projekt má velmi dobrý funkční základ a neobvykle široký rozsah. Aktuální testovací sada prošla v poměru **1049/1049 testů**. Silnou stránkou je zejména IDS parser, jednotný validační engine, Excel roundtrip, práce s více IFC soubory, 3D engine a množství dílčích testů.

Největší prostor ke zlepšení už není v přidávání dalších funkcí, ale v následujících oblastech:

1. automatická kontrola releasu a kvality v CI,
2. bezpečnost a přesné vymezení soukromí,
3. trvalá kontrola kompatibility s buildingSMART,
4. robustnost Excel/CSV rozhraní,
5. omezení runtime závislostí na externích CDN,
6. snížení propojení modulů přes globální objekty,
7. end-to-end, výkonové a vizuální testování,
8. dokumentace skutečně podporovaných funkcí a omezení.

Projekt bych nyní nerozšiřoval o větší množství nových funkcí. Největší hodnotu přinese upevnění důvěryhodnosti výsledků, bezpečnosti, aktualizací a automatických kontrol.

---

## 2. Co je již na dobré úrovni

- Testovací sada obsahuje **1049 testů** a všechny aktuálně procházejí.
- IDS parser a validátor používají sdílený IDS 1.0 model a validační engine.
- IDS soubory lze kontrolovat proti lokálně dodávanému IDS 1.0 XSD i offline.
- Excel import/export uchovává přesné IDS hodnoty a restrictions pomocí pomocných JSON sloupců.
- Excel import upozorňuje na přeskočené nebo poškozené řádky a vyžaduje potvrzení uživatele.
- Validace obsahuje podporu Web Workerů a různé strategie podle velikosti souboru.
- IFC a 3D části jsou již rozdělené do většího množství tematických modulů.
- 3D propojení má verzovaný handoff payload a testy jednoho i více souborů.
- Projekt obsahuje PWA, lokální IndexedDB úložiště a podporu lokální složky v kompatibilních prohlížečích.
- Repo obsahuje CONTRIBUTING, SECURITY, CHANGELOG, Code of Conduct a základní GitHub workflow.

---

## 3. Nejvyšší priorita

### 3.1 Posílit CI a release kontrolu

**Současný stav**

- Testy procházejí: **1049/1049**.
- ESLint hlásí **21 194 varování a 0 chyb**.
- Přibližně **21 074 varování** lze opravit automaticky.
- Současné CI spouští `npm run lint`, ale varování nezpůsobují selhání kontroly.
- HTML kontrola v CI ověřuje pouze platné UTF-8, nikoliv skutečnou HTML strukturu.
- CI neověřuje Tauri build, offline režim, propojení stránek ani shodu `dist` se zdroji.

**Doporučení**

- Zavést limit lint varování pomocí `--max-warnings`.
- Nesnažit se všechna varování opravit jedním velkým automatickým commitem.
- Stanovit současný baseline a při každém PR vyžadovat, aby se počet varování nezvýšil.
- Postupně zpřísňovat pravidla pro nově upravené soubory.
- Přidat skutečnou HTML validaci, například pomocí `html-validate`.
- Přidat kontrolu konzistence překladových klíčů a chybějících překladů.
- Spustit čistý `dist` build a následně kontrolovat `git diff --exit-code`.
- Přidat `cargo check`, Clippy a alespoň jeden Tauri build.
- Přidat kontrolu npm a Cargo závislostí a generování SBOM.
- Přidat browser smoke test pro všechny hlavní stránky.
- Přidat offline smoke test po instalaci service workeru.

**Důležité doplnění test runneru**

Testy dnes projdou, i když konzole během běhu obsahuje zprávy jako:

- `idsEditorCore not found!`,
- `Editor or currentIDSData not available`,
- chyby s testovacím `blob:fake`,
- velké množství očekávaných validačních warningů.

Test runner by měl shromažďovat `console.error`, `pageerror` a `requestfailed` a selhat při každé neočekávané chybě. Očekávané testovací chyby je vhodné explicitně povolit jen v konkrétním testu.

---

### 3.2 Bezpečnost webové a desktopové aplikace

**Zjištění**

- Tauri konfigurace má `csp: null`.
- Tauri má zapnuté `withGlobalTauri`, přestože frontend globální Tauri API zřejmě nepoužívá.
- Přibližně 56 souborů používá `innerHTML`, `insertAdjacentHTML` nebo obdobný způsob vkládání HTML.
- To samo o sobě neznamená aktivní XSS chybu, ale významně to zvětšuje plochu, kterou je nutné kontrolovat.
- Některé pokročilé 3D funkce načítají JavaScript dynamicky z externího CDN.
- AI API klíče se ukládají přímo do IndexedDB v čitelné podobě.

**Doporučení**

- Zavést CSP pro webovou aplikaci i Tauri.
- Vypnout `withGlobalTauri`, pokud není skutečně potřeba.
- Definovat minimální Tauri capabilities a permissions.
- Centralizovat bezpečné renderování uživatelských hodnot.
- Preferovat `textContent`, DOM API a šablony, které jasně rozlišují HTML a text.
- U kritických míst zvážit DOMPurify nebo Trusted Types.
- Doplnit automatické testy XSS payloadů do IFC názvů, PSetů, IDS textů, bSDD výsledků a validačních zpráv.
- Pro web nabídnout jako výchozí možnost API klíč neukládat a držet jej pouze po dobu relace.
- Pro Tauri zvážit bezpečné úložiště operačního systému.
- Přidat bezpečnostní threat model pro web, PWA, lokální složku, AI a Tauri.

---

### 3.3 Upravit a zpřesnit privacy komunikaci

Současná aplikace na několika místech uvádí, že data nejsou odesílána na server a vše funguje kompletně lokálně. To platí pro základní zpracování IFC a IDS, ale ne pro všechny funkce.

Síťovou komunikaci mohou používat například:

- externí AI provideři,
- bSDD API,
- hlášení chyb,
- kontrola nových verzí přes GitHub,
- EPSG služba,
- online mapové podklady,
- vzdálené JavaScript moduly,
- vzdálené modely pro RAG/embeddings.

**Doporučení**

- Rozdělit funkce na `lokální`, `volitelně online` a `vyžaduje internet`.
- Před odesláním dat externímu AI providerovi zobrazit jasnou informaci.
- Uvést, zda se odesílá celý soubor, jeho část, metadata nebo výsledky nástrojů.
- Doplnit samostatný dokument o soukromí.
- Zpřesnit texty v README, průvodci a dialogu „O projektu“.
- U AI umožnit zkontrolovat obsah, který bude odeslán providerovi.

---

### 3.4 Trvalá kontrola vůči buildingSMART IDS

Projekt obsahuje auditní skript pro oficiální buildingSMART IDS 1.0 implementer test cases. Skript však vyžaduje ručně dodaný externí adresář a není součástí standardního CI.

**Doporučení**

- Připnout konkrétní commit nebo release oficiálního buildingSMART IDS corpus.
- Spouštět audit automaticky v CI nebo pravidelném scheduled workflow.
- Odděleně reportovat:
  - XSD validitu IDS,
  - úspěšnost IDS parsování,
  - nalezení applicability,
  - splnění requirements,
  - cardinality a occurrence pravidla,
  - IFC schema compatibility,
  - přesné místo rozdílu proti očekávanému výsledku.
- Invalidní IDS případy vyhodnocovat odděleně od semanticky nevyhovujícího IFC.
- Výsledek publikovat jako strojově čitelný JSON a přehledný Markdown report.
- Při každém releasu uvést verzi IDS test corpus a procento shody.

**Doporučená support matrix**

Veřejně dokumentovat podporu pro:

- IFC2X3,
- IFC4,
- IFC4X3 a jednotlivé dodatky,
- entity facet,
- property facet,
- attribute facet,
- classification facet,
- material facet,
- partOf facet,
- simpleValue,
- enumeration,
- pattern,
- bounds a numerická omezení,
- required, optional a prohibited cardinality,
- více hodnot v `ifcVersion`.

---

## 4. Excel a CSV

### 4.1 Verze Excel formátu

Excel workbook dnes nemá jednoznačný marker verze vlastního BIM Checker formátu.

**Doporučení**

- Přidat do `info` listu například:
  - `format = BIM_CHECKER_IDS_EXCEL`,
  - `format_version = 1`,
  - `generator_version`,
  - `ids_schema_version`.
- Udržovat migrační logiku pro starší Excel šablony.
- Neznámou novější verzi neimportovat bez výrazného upozornění.
- Dokumentovat povinné a volitelné listy a sloupce.

### 4.2 Semantická kontrola roundtripu

Testy již kontrolují důležité IDS hodnoty a restrictions. Doporučuji přidat plný golden workflow:

1. načíst IDS XML,
2. exportovat XLSX,
3. znovu importovat XLSX,
4. vygenerovat IDS XML,
5. ověřit XSD,
6. porovnat normalizovaný sémantický model,
7. porovnat výsledky validace před a po roundtripu.

XML text nemusí být znak po znaku stejný, ale musí mít stejný význam.

### 4.3 Importní varování a ztráta dat

Import již zobrazuje varovný dialog. Dále doporučuji:

- Rozlišit `warning` a `fatal error`.
- Označit případy, kdy byl řádek zcela přeskočen.
- Uvést počet zachovaných a zahozených facetů.
- Nabídnout export importního protokolu.
- Po importu automaticky zobrazit XSD stav budoucího IDS výstupu.
- Umožnit otevřít konkrétní problematický řádek nebo specification.

### 4.4 Golden Excel soubory

Do testů doporučuji přidat malé skutečné `.xlsx` soubory pro:

- všechny facet typy,
- všechny restriction typy,
- více hodnot `ifcVersion`,
- více PSetů se stejnými názvy properties,
- bSDD URI,
- české znaky a Unicode,
- prázdné a nulové hodnoty,
- poškozený JSON fallback,
- starší šablonu,
- novější nepodporovanou verzi,
- extrémně dlouhé hodnoty,
- potenciální spreadsheet formula payloady.

### 4.5 Sdílený CSV encoder

CSV export tabulkového IFC vieweru skládá řádky ručně. V některých 3D panelech už ochrana proti spreadsheet formulím existuje, ale řešení není sjednocené.

**Rizika**

- uvozovky uvnitř hodnot,
- čárky a nové řádky,
- rozdílné chování jednotlivých exportů,
- hodnoty začínající `=`, `+`, `-`, `@`, tabulátorem nebo carriage return,
- poškozený CSV soubor při neobvyklém IFC názvu nebo property.

**Doporučení**

- Vytvořit jeden sdílený RFC 4180 encoder.
- Escapovat vnitřní uvozovky zdvojením.
- Neutralizovat spreadsheet formule s výjimkou bezpečně rozpoznaných čísel.
- Přidat UTF-8 BOM tam, kde je cílem Excel.
- Přidat jednotné testy pro všechny CSV exporty.

---

## 5. IFC parser a IDS × IFC validace

### 5.1 Reálný IFC corpus

Současná lokální testovací data jsou malá. Syntetické jednotkové testy jsou užitečné, ale neodhalí všechny varianty IFC exportérů.

**Doporučení**

- Sestavit licenčně použitelný corpus z více autorovacích nástrojů.
- Zahrnout IFC2X3, IFC4 a IFC4X3.
- Zahrnout minimálně:
  - occurrence/type vazby,
  - PSety přes různé relationship varianty,
  - quantities,
  - classifications,
  - materials a material layers,
  - inherited predefined types,
  - entities bez GlobalId,
  - neobvyklé textové encodingy,
  - velké STEP řádky,
  - poškozené nebo neúplné IFC.

### 5.2 Diferenciální validace

U vybraného corpus doporučuji porovnávat výsledky BIM Checker validace s další nezávislou IDS implementací.

Porovnávat je vhodné:

- počet applicable entit,
- počet pass/fail výsledků,
- GUID jednotlivých entit,
- důvod nesplnění,
- zpracování cardinality,
- zpracování absence hodnoty oproti prázdné hodnotě.

Rozdíly je nutné klasifikovat, protože různé implementace mohou mít vlastní chybu nebo odlišný výklad hraniční situace.

### 5.3 Jednotná validační cesta

Je důležité dlouhodobě hlídat, aby malý soubor, velký soubor, Worker cesta, mobilní režim a AI nástroje používaly stejnou sémantiku.

**Doporučení**

- Jednotný validační engine ponechat jako jediný zdroj pravdy.
- Workerům předávat pouze serializovatelný normalizovaný model.
- Přidat parity test: stejná data musí dát stejný výsledek synchronně, asynchronně i ve Workeru.
- Do výsledku ukládat verzi validatoru a IDS pravidel.

---

## 6. 3D viewer a propojení stránek

### 6.1 End-to-end testy propojení

Jednotkové testy handoff payloadu existují. Chybí však trvalá CI kontrola celé uživatelské cesty.

**Doporučené E2E scénáře**

- IFC tabulka → jeden element → 3D výběr a přiblížení.
- IFC tabulka → více elementů → 3D výběr.
- Validace → failed element → správný model a GUID v 3D.
- Dva soubory se stejným názvem → výběr pomocí `fileId`.
- Stejný GUID ve více revizích → otevření správné revize.
- Viewer již otevřený → živý BroadcastChannel handoff.
- Viewer zavřený → sessionStorage fallback.
- Zablokované popup okno → srozumitelná zpráva.
- Chybějící soubor v úložišti → řízená chyba a možnost ručního načtení.
- Mobilní viewport → žádný skrytý potvrzovací ovládací prvek.

### 6.2 Geometrická support matrix

3D engine obsahuje rozsáhlou podporu, ale uživatel by měl vědět, co je přesné, aproximované nebo nepodporované.

Dokumentovat doporučuji například:

- swept solids,
- extrusions,
- revolved solids,
- mapped items,
- boolean clipping a CSG,
- tessellated geometry,
- BRepy,
- openings,
- IfcLinearPlacement,
- georeference a MapConversion,
- jednotky,
- federaci různých CRS,
- IFC alignment geometrie,
- výpočet plochy a objemu.

UI by mělo zobrazit počet:

- vykreslených elementů,
- elementů bez geometrie,
- nepodporovaných representation typů,
- geometrických warningů,
- elementů s fallback geometrií.

### 6.3 Vizuální regrese

Přidat screenshot testy pro:

- základní model,
- výběr a zvýraznění,
- izolaci a skrytí,
- sekční rovinu,
- měření,
- světlé a tmavé téma,
- ortografickou a perspektivní kameru,
- federovaný model,
- mobilní rozložení.

Screenshot test nemá ověřovat každý pixel bez tolerance. Má odhalit chybějící canvas, rozbitý layout, nesprávnou kameru nebo zmizení geometrie.

### 6.4 Výkon a paměť

Doporučené výkonové scénáře:

- 50 MB, 150 MB a 500 MB IFC,
- opakované načtení a odebrání modelu,
- deset menších federovaných modelů,
- rychlé přepínání výběru,
- sekční řez na velkém mesh modelu,
- clash detection,
- GLB export,
- dlouhá práce bez reloadu stránky.

Měřit doporučuji:

- čas parsování,
- čas do prvního zobrazení,
- čas kompletní geometrie,
- maximální JS heap,
- počet draw calls,
- FPS při navigaci,
- paměť po odebrání modelu,
- velikost cache.

---

## 7. Externí závislosti a offline režim

Některé pokročilé funkce dynamicky importují knihovny z `esm.sh`, například:

- proj4,
- JSZip,
- jsPDF,
- GeoTIFF,
- html2canvas,
- DXF knihovnu,
- Transformers.

**Dopady**

- Funkce nefunguje bez internetu.
- Runtime kód není plně pod kontrolou stejného releasu.
- CSP musí povolit externí zdroj.
- Je složitější ověřit integritu, licence a reprodukovatelnost.
- CDN nebo CORS chyba může rozbít jinak lokální nástroj.

**Doporučení**

- Používané knihovny přenést do lokálního vendor/build procesu.
- Verze připnout a aktualizovat řízeně.
- Přidat jejich licence do Third-Party Notices.
- Generovat SBOM.
- Pro velké volitelné knihovny použít lokální lazy chunk.
- Funkce vyžadující internet označit v UI.
- Basemapy a online EPSG lookup ponechat jako explicitně online funkce s fallbackem.

---

## 8. Architektura a udržovatelnost

### 8.1 Globální objekty a pořadí skriptů

Ve zdrojích je přibližně **189 přímých přiřazení** do `window` nebo `globalThis`. Některé stránky proto nabízejí jiné AI nástroje podle toho, které skripty byly načteny.

**Doporučení**

- Přecházet postupně na ES moduly.
- Neprovádět kompletní přepis najednou.
- Definovat explicitní služby:
  - `StorageService`,
  - `IDSService`,
  - `ValidationService`,
  - `IFCService`,
  - `ViewerHandoffService`,
  - `NetworkCapabilityService`.
- Závislosti předávat při inicializaci místo jejich vyhledávání na `window`.
- Vytvořit jednotný bootstrap pro každou stránku.
- AI tool catalog generovat podle skutečně dostupných služeb, ne podle globálních proměnných.

### 8.2 Největší soubory

Mezi největší soubory patří přibližně:

- 3D `viewer-core.js`: přes 4 000 řádků,
- `validator.js`: přes 3 300 řádků,
- `viewer-init.js`: přes 2 100 řádků,
- 3D engine `index.js`: přes 1 900 řádků,
- `translations.js`: přes 2 600 řádků.

**Doporučení**

- Rozdělovat podle odpovědnosti, ne pouze podle velikosti.
- Oddělit stav, doménovou logiku, rendering a event binding.
- Ve validatoru oddělit výběr souborů, orchestrace, report model a export.
- Ve 3D vieweru oddělit životní cyklus modelu, selection, camera, rendering a persistence.
- Překlady rozdělit na locale moduly a automaticky hlídat paritu klíčů.
- Začít JSDoc typy nebo `checkJs`; TypeScript zavádět jen tam, kde skutečně pomůže.

### 8.3 Jednotný IDS doménový model

Parser, editor, Excel, XML generátor, validátor a AI by měly používat jeden dokumentovaný model.

Model by měl mít:

- vlastní `schemaVersion`,
- normalizovanou reprezentaci value restrictions,
- jednoznačnou reprezentaci cardinality,
- jednoznačné `ifcVersions`,
- stabilní ID specification a facetů,
- oddělené původní source metadata,
- validační funkci doménového modelu.

XML a Excel pak mají být pouze adaptéry tohoto modelu.

---

## 9. `dist` a build proces

Repozitář sleduje přibližně 238 souborů v `dist`. Build je převážně kopírování zdrojových souborů.

**Riziko**

Oprava může být provedena pouze ve zdroji nebo pouze v `dist`. Rozdíl se nemusí projevit v unit testech, ale projeví se v Tauri aplikaci.

**Možnosti**

### Varianta A — doporučená

- `dist` negitovat.
- Generovat jej v CI a při release.
- Tauri vždy sestavit z čistě vytvořeného `dist`.

### Varianta B — pokud musí `dist` zůstat v repozitáři

- V CI spustit čistý build.
- Následně spustit `git diff --exit-code -- dist`.
- Zakázat ruční úpravy uvnitř `dist`.
- Uvést do CONTRIBUTING, že se mění pouze zdrojová kopie.

Desktop build by měl také vědomě rozhodnout, zda potřebuje PWA manifest a service worker, nebo zda je má pro Tauri vypnout.

---

## 10. Úložiště a migrace dat

Projekt používá více IndexedDB oblastí a řada z nich má databázovou verzi `1`. Do budoucna bude nutné bezpečně měnit strukturu uložených dat.

**Doporučení**

- Vytvořit centrální registr databází a schema verzí.
- Každou změnu doprovodit migračním testem.
- Testovat upgrade z každé podporované starší verze.
- Při selhání migrace nezničit původní data.
- Nabídnout export a obnovu celého projektu.
- Zobrazit využití úložiště a dostupnou kvótu.
- Zavést řízenou LRU politiku pro 3D cache.
- Rozlišovat trvalá uživatelská data a regenerovatelnou cache.
- Přidat bezpečné „vyčistit pouze cache“, nikoliv veškerá data.

### Lokální složka

File System Access API není dostupné ve všech podporovaných prohlížečích.

Dokumentace by měla obsahovat capability matrix:

| Funkce | Chrome/Edge | Firefox | Safari | Tauri |
|---|---:|---:|---:|---:|
| IndexedDB | ano | ano | ano | ověřit platformu |
| Lokální projektová složka | ano | omezeně/ne | omezeně/ne | řešit nativně nebo fallback |
| Offline PWA | ano | částečně | částečně | není hlavní mechanismus |
| Lokální Ollama z HTTPS | závisí na browseru | často blokováno | často blokováno | ověřit |

---

## 11. Service worker a aktualizace

Service worker používá ručně zvyšovanou cache verzi, aktuálně ve tvaru `bim-checker-v154`, a pro statické soubory používá cache-first strategii.

**Rizika**

- Zapomenuté zvýšení verze ponechá uživatelům starý JavaScript.
- Ručně udržovaný seznam může vynechat nový soubor.
- Automatické procházení ESM importů může zachytit neexistující nebo pouze volitelné importy.
- Vzdálené moduly stejně nebudou spolehlivě offline.

**Doporučení**

- Generovat precache manifest během buildu.
- Použít obsahové hashe.
- Uživatelům zobrazit informaci o připravené aktualizaci.
- Aktivovat nový worker kontrolovaně až po potvrzení nebo bezpečném reloadu.
- Otestovat upgrade mezi dvěma verzemi service workeru.
- Otestovat offline otevření všech hlavních stránek.
- Měřit velikost cache a neukládat neomezeně všechny runtime odpovědi.

---

## 12. Přístupnost a mobilní použití

Projekt obsahuje mobilní CSS testy, ale ty většinou ověřují přítomnost pravidel, nikoliv skutečnou ovladatelnost.

**Doporučení**

- Přidat axe-core nebo obdobnou automatickou kontrolu.
- Otestovat celou aplikaci pouze klávesnicí.
- Zajistit focus trap v modalech a návrat focusu po zavření.
- Doplnit `role="dialog"`, `aria-modal`, accessible názvy a popisy.
- Zajistit čitelné focus indikátory.
- Zkontrolovat kontrast ve světlém i tmavém tématu.
- Otestovat 200% zoom.
- U 3D canvasu doplnit textový přehled vybraného prvku a alternativní tabulkové ovládání.
- Otestovat touch targety na skutečných viewports.
- Ověřit screen readerem minimálně hlavní navigaci, upload, validaci, export a chyby.

---

## 13. Dokumentace

README a starší auditní dokumenty již neodpovídají aktuálnímu projektu.

Příklady:

- README uvádí přibližně 280 testů, skutečnost je 1049.
- Struktura projektu neobsahuje současný 3D viewer.
- XSD validace je stále uvedena jako plánovaná, přestože je implementována.
- Některá privacy/offline tvrzení jsou příliš absolutní.
- bSDD je na některých místech popsané jako proxy, zatímco část kódu používá přímé API.
- Starý readiness report uvádí 159 testů a hodnocení 98/100, které už nevychází ze současného rozsahu.

**Doporučení**

- Aktualizovat README podle aktuální architektury.
- Oddělit marketingové tvrzení od ověřitelné support matrix.
- Dokumentovat známá omezení.
- Generovat počty testů a verze automaticky.
- Udržovat jeden aktuální architektonický dokument.
- Staré audity označit jako historické nebo přesunout do archivu.
- Přidat privacy dokument a Third-Party Notices.
- Doplnit release checklist.

---

## 14. Doporučený release checklist

Před releasem doporučuji automaticky nebo ručně potvrdit:

- [ ] Všechny unit a integration testy procházejí.
- [ ] Není přítomný neočekávaný `console.error`, `pageerror` ani `requestfailed`.
- [ ] Lint počet nepřekročil stanovený baseline.
- [ ] `dist` přesně odpovídá zdrojům.
- [ ] buildingSMART IDS corpus audit prošel.
- [ ] IDS XML → Excel → IDS XML roundtrip je sémanticky shodný.
- [ ] Vygenerované IDS prochází IDS 1.0 XSD.
- [ ] Validace dává stejný výsledek synchronně i ve Workeru.
- [ ] Všechny hlavní stránky se otevřou v headless browseru.
- [ ] Tabulka → 3D a validace → 3D handoff funguje.
- [ ] Offline otevření základních funkcí funguje.
- [ ] Tauri build projde alespoň na podporovaných platformách.
- [ ] CSP neblokuje požadované lokální funkce.
- [ ] Závislosti neobsahují známou kritickou zranitelnost.
- [ ] Licence vendorizovaných a dynamických závislostí jsou zdokumentované.
- [ ] README, CHANGELOG, verze package/Cargo/Tauri a service worker jsou synchronizované.
- [ ] Je známý postup obnovy dat při chybě aktualizace.

---

## 15. Doporučené pořadí realizace

### Etapa 1 — Stabilizace releasu

1. Zpřesnit privacy a offline tvrzení.
2. Zavést CSP a minimalizovat Tauri oprávnění.
3. Přidat CI kontrolu `dist`.
4. Zavést lint baseline.
5. Nechat testy selhat na neočekávaných browser chybách.
6. Přidat browser smoke test všech stránek.
7. Přenést kritické runtime CDN závislosti pod vlastní build.

### Etapa 2 — Důvěryhodnost IDS/IFC výsledků

1. Integrovat oficiální buildingSMART corpus do CI.
2. Přidat reálný IFC corpus.
3. Zavést verzovaný Excel formát.
4. Přidat golden XLSX roundtrip testy.
5. Přidat parity testy všech validačních cest.
6. Publikovat IDS a IFC support matrix.

### Etapa 3 — 3D a uživatelské workflow

1. Přidat end-to-end testy propojení stránek.
2. Přidat geometrické golden modely.
3. Přidat vizuální regresní testy.
4. Zavést výkonové a paměťové limity.
5. Zobrazit uživateli nepodporovanou a fallback geometrii.

### Etapa 4 — Architektura a dlouhodobá údržba

1. Zavést explicitní služby a jednotný bootstrap stránek.
2. Postupně odstranit globální `window.*` vazby.
3. Rozdělit největší moduly podle odpovědnosti.
4. Centralizovat IndexedDB migrace.
5. Generovat service worker manifest.
6. Doplnit automatickou accessibility kontrolu.

---

## 16. Tři nejdůležitější směry

Pokud by se měly vybrat pouze tři oblasti, doporučuji toto pořadí:

1. **CI, bezpečnost a přesná privacy komunikace**  
   Zabrání regresím, zpřesní důvěru uživatelů a připraví projekt na bezpečný release.

2. **Oficiální buildingSMART conformance a verzovaný Excel roundtrip**  
   Posílí důvěryhodnost hlavní funkce projektu — validace IFC proti IDS.

3. **Postupné odstranění globálních vazeb a reálné E2E/performance testy**  
   Umožní projekt bezpečně rozvíjet bez růstu skrytých regresí a závislostí mezi stránkami.
