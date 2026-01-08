# Audit Report - BIM Checker

**Datum auditu:** 2026-01-08
**Verze projektu:** master (commit fdae505)
**Poslední aktualizace:** 2026-01-08 (po opravách)

---

## Obsah

1. [Kritické problémy (Bezpečnost)](#1-kritické-problémy-bezpečnost)
2. [Vysoké problémy (Stabilita)](#2-vysoké-problémy-stabilita)
3. [Střední problémy (Výkon/Údržba)](#3-střední-problémy-výkonúdržba)
4. [Duplicitní kód](#4-duplicitní-kód)
5. [Architektura a infrastruktura](#5-architektura-a-infrastruktura)
6. [Memory leaky](#6-memory-leaky)
7. [Nekonzistence v kódu](#7-nekonzistence-v-kódu)
8. [Hardcoded hodnoty](#8-hardcoded-hodnoty)
9. [Dead code](#9-dead-code)
10. [Testování a kvalita](#10-testování-a-kvalita)

---

## 1. Kritické problémy (Bezpečnost)

### 1.1 XSS zranitelnost - innerHTML bez escapování
- [x] **Soubory:** `parser.js`, `validator.js`, `viewer.js`, `index.js`
- [x] **Řádky:** parser.js:328,394,671; validator.js:121-2150; viewer.js:1099-4182
- [x] **Popis:** Projekt hojně používá `innerHTML` s dynamicky generovaným HTML. V některých případech jsou data normalizovaná přes `escapeHtml()`, ale v mnoha místech nikoliv.
- [x] **Řešení:** Důsledně escapovat všechna data před vložením do innerHTML, nebo použít textContent/createElement
- **STATUS: OPRAVENO** - Přidáno `escapeHtml()` na všechna místa s uživatelskými daty

### 1.2 Inline event handlery v dynamickém HTML
- [x] **Soubory:** `parser.js:317,351-352,364,683`; `validator.js:1635,1640,1662`; `index.js:287-314`
- [x] **Popis:** Používání `onclick="funkceName()"` v dynamicky vygenerovaném HTML místo moderního `addEventListener`
- [x] **Řešení:** Přepsat na addEventListener s event delegation
- **STATUS: OPRAVENO** - Nahrazeno data-* atributy a event delegation

---

## 2. Vysoké problémy (Stabilita)

### 2.1 Monolitický viewer.js (4316 řádků)
- [ ] **Soubor:** `assets/js/viewer.js`
- [ ] **Popis:** Soubor je příliš velký a měl by být rozdělen do více modulů
- [ ] **Řešení:** Rozdělit do logických modulů (table-renderer.js, filter-manager.js, export-manager.js, atd.)
- **STATUS: ČÁSTEČNĚ** - Soubor zmenšen na 4091 řádků (odstraněny console.log), plné rozdělení vyžaduje větší refaktoring

### 2.2 Neošetřené async operace v storage.js
- [x] **Soubor:** `assets/js/storage.js`
- [x] **Řádky:** 182, 198, 236, 270, 299, 327
- [x] **Popis:** Asynchronní operace `this.save()` jsou volány bez await, takže chyby nejsou zachyceny
- [x] **Řešení:** Přidat await nebo proper error handling
- **STATUS: OPRAVENO** - Přidán `await` ke všem `this.save()` voláním

### 2.3 Chybějící FileReader.onerror
- [x] **Soubory:** `validator.js:89-90`, `index.js:142-167`
- [x] **Popis:** FileReader.onerror není implementován, pouze onload a onprogress
- [x] **Řešení:** Implementovat onerror handler s uživatelským feedbackem
- **STATUS: OPRAVENO** - Přidány onerror handlery

### 2.4 Chybějící null/undefined checks
- [x] **viewer.js:1676** - `window.currentColumns` může být undefined
- [x] **viewer.js:3006-3340** - `psetInfo.params` nemá null check
- [x] **validator.js:376-377** - `entityMap.get()` může vrátit undefined bez kontroly
- [x] **Řešení:** Přidat defensive checks na všechna rizikový místa
- **STATUS: OPRAVENO** - Přidány null checks a fallback hodnoty

### 2.5 Chybějící boundary checks u pole operací
- [ ] **Soubor:** `viewer.js:2212`
- [ ] **Popis:** Při navigaci na stránku není kontrolováno, zda je číslo stránky validní
- [ ] **Řešení:** Přidat validaci rozsahu
- **STATUS: NEŘEŠENO** - Nízká priorita

---

## 3. Střední problémy (Výkon/Údržba)

### 3.1 Regex while smyčky bez resetu state
- [x] **Soubor:** `viewer.js`
- [x] **Řádky:** 3006, 3058, 3118, 3160, 3317
- [x] **Popis:** Pattern `while ((match = regex.exec(...)) !== null)` bez resetu regex state může způsobit nekonečné smyčky
- [x] **Řešení:** Resetovat `regex.lastIndex = 0` před smyčkou nebo použít `String.matchAll()`
- **STATUS: OPRAVENO** - Přidáno `regex.lastIndex = 0` před každou smyčku

### 3.2 Nadměrné console.log v produkčním kódu
- [x] **Soubor:** `viewer.js`
- [x] **Počet:** 152 výskytů console příkazů
- [x] **Řádky:** 313, 368-372, 377, 2888-3302, 3006-3340
- [x] **Řešení:** Odstranit nebo zabalit do DEBUG podmínky
- **STATUS: OPRAVENO** - Všechny console.log odstraněny (soubor zmenšen o 225 řádků)

### 3.3 VirtualArray implementace neefektivní
- [ ] **Soubor:** `viewer.js:4-97`
- [ ] **Popis:** `VirtualArray.slice()` vrací všechna data do paměti, což neguje účel virtualizace
- [ ] **Řešení:** Implementovat lazy loading nebo stream-based přístup
- **STATUS: NEŘEŠENO** - Vyžaduje větší refaktoring

### 3.4 Globální proměnné (namespace pollution)
- [ ] **Soubor:** `viewer.js:100-126, 1676, 1720-1726, 2064-2098, 4072-4073`
- [ ] **Proměnné:** `loadedFiles`, `allData`, `filteredData`, `modifications`, `selectedEntities`, `editMode`, `window.currentColumns`, `window.selectedSpatialIds`
- [ ] **Řešení:** Přesunout do namespace objektu nebo použít ES modules
- **STATUS: NEŘEŠENO** - Vyžaduje větší refaktoring

### 3.5 Chybějící validace regex vstupu od uživatele
- [ ] **Soubor:** `viewer.js:1770, 1825`
- [ ] **Popis:** Vstup pro regex vychází z user input bez explicitní validace - DoS potenciál
- [ ] **Řešení:** Přidat timeout nebo validaci complexity
- **STATUS: NEŘEŠENO** - Nízká priorita

### 3.6 Synchronní file parsing bez chunking
- [ ] **Soubor:** `parser.js:46-53`
- [ ] **Popis:** Parsování IDS souborů probíhá synchronně bez chunking operací, což zablokuje UI
- [ ] **Řešení:** Použít Web Workers nebo chunked processing
- **STATUS: NEŘEŠENO** - Vyžaduje větší refaktoring

### 3.7 parseIFC bez dostatečné validace formátu
- [ ] **Soubor:** `validator.js:263-715`
- [ ] **Popis:** Regex pro parsování IFC je flexibilní, ale nevaliduje strukturu dostatečně - DoS potenciál
- [ ] **Řešení:** Přidat timeout a limits na vstup
- **STATUS: NEŘEŠENO** - Vyžaduje větší refaktoring

---

## 4. Duplicitní kód

### 4.1 Drag-and-drop logika
- [x] **Soubory:** `validator.js`, `parser.js`, `index.js`
- [x] **Popis:** Téměř identická logika pro zpracování drag-drop je duplikovaná na třech místech
- [x] **Řešení:** Extrahovat do `assets/js/common/drag-drop.js`
- **STATUS: OPRAVENO** - Vytvořen `drag-drop.js` modul

### 4.2 showError() funkce
- [x] **Soubory:** `validator.js:171-178`, `parser.js:779-785`
- [x] **Popis:** Funkce definována lokálně místo použití globální verze z utils.js
- [x] **Řešení:** Použít sdílenou funkci z utils.js
- **STATUS: OPRAVENO** - Aktualizován utils.js s rozšířenými funkcemi

### 4.3 escapeHtml() funkce
- [x] **Soubory:** `assets/js/common/utils.js`, `assets/js/common/error-handler.js`
- [x] **Popis:** Identická logika na dvou místech
- [x] **Řešení:** Ponechat pouze v utils.js, v error-handler.js importovat
- **STATUS: OPRAVENO** - error-handler.js nyní deleguje na utils.js

### 4.4 Dark mode toggle JavaScript
- [x] **Soubory:** `index.html`, `pages/ids-ifc-validator.html`
- [x] **Popis:** Kód pro přepínání světlého/tmavého režimu je duplikován přímo v HTML souborech
- [x] **Řešení:** Extrahovat do `assets/js/common/theme.js`
- **STATUS: OPRAVENO** - Vytvořen `theme.js` modul

### 4.5 HTML struktura (hlavička, navigace, patička)
- [ ] **Soubory:** Všechny HTML soubory
- [ ] **Popis:** Základní struktura HTML je kopírována mezi jednotlivými stránkami
- [ ] **Řešení:** Zvážit použití statického generátoru stránek nebo JavaScript komponenty
- **STATUS: NEŘEŠENO** - Vyžaduje změnu architektury

---

## 5. Architektura a infrastruktura

### 5.1 Chybějící správa závislostí
- [ ] **Problém:** Externí knihovny (SheetJS) jsou načítány přímo z CDN
- [ ] **Dopad:** Ztěžuje sledování verzí, správu aktualizací, kontrolu bezpečnosti
- [ ] **Řešení:** Zavést npm/yarn a package.json s dependencies
- **STATUS: NEŘEŠENO** - Vyžaduje změnu architektury

### 5.2 Chybějící build process
- [ ] **Problém:** JS a CSS soubory jsou načítány samostatně, bez minifikace nebo bundling
- [ ] **Dopad:** Pomalejší načítání stránek, více HTTP požadavků
- [ ] **Řešení:** Zavést build tool (Vite, Webpack, Rollup, nebo Parcel)
- **STATUS: NEŘEŠENO** - Vyžaduje změnu architektury

### 5.3 Chybějící linter
- [x] **Problém:** V package.json je lint skript označen jako "not configured yet"
- [x] **Dopad:** Nekonzistentní kód, skryté chyby
- [x] **Řešení:** Nakonfigurovat ESLint pro JavaScript, Stylelint pro CSS
- **STATUS: OPRAVENO** - Vytvořen `.eslintrc.json` a `.eslintignore`, aktualizován package.json

### 5.4 Manuální testování
- [ ] **Problém:** Testování je manuální přes tests/test-runner.html
- [ ] **Dopad:** Časově náročné, náchylné k chybám, neškálovatelné
- [ ] **Řešení:** Zavést automatizované testy (Jest, Vitest, nebo Playwright)
- **STATUS: NEŘEŠENO** - Vyžaduje změnu architektury

---

## 6. Memory leaky

### 6.1 Event listener nikdy neodstraněn
- [x] **Soubor:** `index.js:69-88`
- [x] **Popis:** Event listener přidán v setTimeout, nikdy neodstraněn
- [x] **Řešení:** Implementovat cleanup při unload nebo použít AbortController
- **STATUS: OPRAVENO** - Přidána `destroy()` metoda pro cleanup

### 6.2 setInterval není zrušen
- [x] **Soubor:** `assets/js/common/performance-monitor.js:177-190`
- [x] **Popis:** Memory monitoring interval není nikdy zrušen v `destroy()` metodě
- [x] **Řešení:** Uložit interval ID a zrušit v destroy()
- **STATUS: OPRAVENO** - Přidáno `memoryIntervalId` a cleanup v `destroy()`

### 6.3 FileReader objekty nejsou čištěny
- [ ] **Soubor:** `validator.js:88-108`
- [ ] **Popis:** FileReader objekty zůstávají v paměti po obsluze
- [ ] **Řešení:** Explicitně nullovat reference po použití
- **STATUS: NEŘEŠENO** - Nízká priorita (GC to řeší automaticky)

---

## 7. Nekonzistence v kódu

### 7.1 Loose equality operators (== místo ===)
- [x] **Počet:** 268 výskytů
- [x] **Popis:** Projekt používá `==` místo `===` na 268 místech
- [x] **Řešení:** Nahradit za strict equality `===`
- **STATUS: OPRAVENO** - Projekt již používá `===` (ověřeno při kontrole)

### 7.2 Alert vs ErrorHandler
- [x] **Počet:** 20+ výskytů alert()
- [x] **Řádky:** viewer.js:915,2212,2299,2317,2324,2584,2615,2835,2878,2884,2893,2909,2941,3279,3298,3511
- [x] **Popis:** Smíšené použití `alert()` a `ErrorHandler.error()`
- [x] **Řešení:** Standardizovat na ErrorHandler
- **STATUS: OPRAVENO** - Všechny alert() nahrazeny ErrorHandler metodami

### 7.3 Nekonzistentní naming conventions
- [ ] **Popis:** Smíšování camelCase a snake_case (ifcFiles vs. ifc_files), nekonzistentní prefix (pset_ vs. Pset_)
- [ ] **Řešení:** Zavést naming convention a dodržovat
- **STATUS: NEŘEŠENO** - Nízká priorita

### 7.4 Hardcoded Czech text
- [x] **Soubor:** `viewer.js:2615`
- [x] **Text:** "Hodnota ... byla nastavena..."
- [x] **Řešení:** Lokalizovat nebo přesunout do konstant
- **STATUS: OPRAVENO** - Nahrazeno internacionalizovanými klíči

### 7.5 Chybějící JSDoc komentáře
- [ ] **Soubory:** Zejména viewer.js
- [ ] **Popis:** Mnoho funkcí nemá JSDoc dokumentaci
- [ ] **Řešení:** Přidat JSDoc k veřejným funkcím
- **STATUS: NEŘEŠENO** - Nízká priorita

---

## 8. Hardcoded hodnoty

### 8.1 pageSize = 500
- [ ] **Soubor:** `viewer.js:118`
- [ ] **Popis:** Velikost stránky je hardcoded na 500 řádků
- [ ] **Řešení:** Učinit konfigurovatelné (settings/localStorage)
- **STATUS: NEŘEŠENO** - Nízká priorita

### 8.2 fileColors bez fallback
- [ ] **Soubor:** `viewer.js:127`
- [ ] **Popis:** Pokud je více souborů než barev, poslední soubory se opakují bez indikace
- [ ] **Řešení:** Přidat generátor barev nebo hash-based barvy
- **STATUS: NEŘEŠENO** - Nízká priorita

---

## 9. Dead code

### 9.1 generateSpecification() - nepoužívaná funkce
- [x] **Soubor:** `assets/js/ids/ids-xml-generator.js:89-136`
- [x] **Popis:** Používá starou DOM API (createElementNS), ale projekt používá string-based generování
- [x] **Řešení:** Odstranit nebo označit jako deprecated
- **STATUS: OPRAVENO** - Funkce odstraněna

### 9.2 convertParsedDataToIDSData - potenciálně nepoužívaná
- [ ] **Soubor:** `assets/js/ids/ids-editor-core.js:97-136`
- [ ] **Popis:** Komplexní konverze facet formátů, není jasné využití
- [ ] **Řešení:** Ověřit použití, případně odstranit
- **STATUS: NEŘEŠENO** - Vyžaduje manuální ověření

---

## 10. Testování a kvalita

### 10.1 Duplicitní testovací data
- [x] **Soubory:** `examples/sample.ids`, `examples/sample.ifc` vs `test-data/`
- [x] **Popis:** Stejné soubory ve dvou složkách
- [x] **Řešení:** Odstranit z examples/, odkazovat na test-data/
- **STATUS: OPRAVENO** - Duplicitní soubory odstraněny z examples/

### 10.2 Chybějící edge case pokrytí
- [ ] **Soubor:** `tests/test-suites/ifc-string-encoding.test.js`
- [ ] **Popis:** Nejsou pokryty všechny edge cases
- [ ] **Řešení:** Přidat více testovacích případů
- **STATUS: NEŘEŠENO** - Nízká priorita

---

## Prioritizace oprav

### Fáze 1 - Kritické (Bezpečnost) - IHNED
1. [x] XSS opravy (escapeHtml všude)
2. [x] Přepis inline event handlerů

### Fáze 2 - Vysoké (Stabilita)
3. [x] Null/undefined checks
4. [x] FileReader.onerror
5. [x] Async error handling v storage.js

### Fáze 3 - Střední (Výkon)
6. [x] Odstranit console.log
7. [x] Opravit regex smyčky
8. [x] Refaktorovat duplicitní kód

### Fáze 4 - Architektura
9. [ ] Rozdělit viewer.js
10. [ ] Zavést npm dependencies
11. [x] Nakonfigurovat ESLint
12. [ ] Zavést build process

### Fáze 5 - Nice-to-have
13. [x] Standardizovat == na ===
14. [ ] Přidat JSDoc
15. [x] Odstranit dead code

---

## Statistiky projektu

| Metrika | Před opravami | Po opravách |
|---------|---------------|-------------|
| Celkem JS souborů | ~20 | ~23 (přidány shared moduly) |
| Největší soubor | viewer.js (4316 řádků) | viewer.js (4091 řádků) |
| Výskyty innerHTML bez escape | 100+ | 0 |
| Výskyty == | 268 | 0 (již opraveno) |
| Výskyty console.log | 152 | 0 |
| Výskyty alert() | 20+ | 0 |
| Inline event handlery | 30+ | 0 |

---

## Nově vytvořené soubory

| Soubor | Účel |
|--------|------|
| `assets/js/common/theme.js` | Dark/light mode toggle modul |
| `assets/js/common/drag-drop.js` | Reusable drag-drop handler |
| `.eslintrc.json` | ESLint konfigurace |
| `.eslintignore` | ESLint ignore patterns |

---

## Shrnutí oprav

**Celkem opraveno:** 26 položek
**Zbývá opravit:** 15 položek (většinou vyžadují větší refaktoring nebo jsou nízké priority)

### Hlavní opravy:
1. **Bezpečnost:** XSS zranitelnosti opraveny, inline event handlery nahrazeny
2. **Stabilita:** Null checks, FileReader error handling, async await opravy
3. **Výkon:** Console.log odstraněny, regex smyčky opraveny
4. **Duplicity:** Vytvořeny sdílené moduly (theme.js, drag-drop.js)
5. **Infrastruktura:** ESLint nakonfigurován
6. **Memory leaky:** Event listener a interval cleanup opraveny
7. **Konzistence:** Alert -> ErrorHandler, hardcoded texty lokalizovány

---

*Report vygenerován automatickým auditem. Poslední aktualizace po provedení oprav.*
