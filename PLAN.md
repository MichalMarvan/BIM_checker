# BIM Checker – Plán práce

## Hotové (Done)

### Základní funkcionalita
- [x] IFC Multi-File Viewer s pokročilým vyhledáváním
- [x] IDS Parser a Vizualizér (strom, XML, regex vysvětlení)
- [x] IDS Editor (kompletní editor specifikací v prohlížeči)
- [x] IDS-IFC Validátor s Web Workers
- [x] PWA podpora (offline, instalace)
- [x] Bilingvální rozhraní CZ/EN
- [x] IndexedDB úložiště souborů
- [x] Cloudflare Pages deployment

### bSDD integrace
- [x] bSDD API service s cachingem a debounce
- [x] Autocomplete pro Classification, Property, Material
- [x] Searchable dictionary filter (350+ slovníků)
- [x] Cloudflare Pages proxy pro production bSDD API
- [x] Auto-transfer applicability → requirements
- [x] bSDD URI atribut v IDS XML (export i import)

### Excel roundtrip
- [x] Excel export/import všech facet typů
- [x] Requirements sheet pro classification/material/attribute
- [x] bSDD URI v Excel exportu
- [x] Šablona s Top 20 IFC4 property sets

### i18n (internacionalizace)
- [x] Kompletní překlad IDS editoru (modály, labels, chybové hlášky)
- [x] Překlad tooltipů na všech stránkách
- [x] Re-render editoru při přepnutí jazyka

### IDS validace correctness (Phase 1, 2026-05-08)
- [x] Sjednocení dvou paralelních IDS parserů do `assets/js/common/ids-parser.js`
- [x] IFC class hierarchy data + lazy-loaded `IFCHierarchy` modul (IFC2X3 / IFC4 / IFC4X3)
- [x] Subtype-aware applicability matching (`IFCWALL` chytí i `IFCWALLSTANDARDCASE` přes dědičnost)
- [x] PredefinedType matching včetně USERDEFINED + ObjectType fallback
- [x] XSD validace proti IDS 1.0 schématu přes xmllint-wasm
  - Bannér při importu, modální dialog před exportem, plně offline (PWA)
- [x] +50 nových testů (305 → 350)

---

## K dokončení (TODO)

### Vysoká priorita

- [x] **Registrace domény u buildingSMART** – `checkthebim.com` přidán na CORS whitelist (potvrzeno Erik Baars, duben 2026), proxy odstraněn

- [ ] **Komprese souborů v IndexedDB** – gzip/fflate komprese IFC/IDS před uložením
  - 60-80% úspora místa
  - Rychlejší IndexedDB operace

### Střední priorita

- [ ] **Bug report z aplikace** – Tlačítko v horní liště pro nahlášení chyby
  - Ikona/tlačítko v navigační liště (např. 🐛 nebo „Nahlásit chybu" / „Report bug")
  - Modál s formulářem: popis chyby, kroky k reprodukci, volitelně screenshot
  - Automaticky přiložit: verzi aplikace, prohlížeč, jazyk UI
  - Kam posílat: Google Form (odpovědi do Google Sheets, notifikace na mail)
  - Správa: sledovat v Google Sheets, případně přidat sloupec pro stav (nový/řeším/vyřešeno)

- [ ] **IDS šablony** – Předdefinované specifikace pro běžné use cases
  - Šablona pro požární bezpečnost
  - Šablona pro energetický štítek
  - Šablona pro koordinační model

- [ ] **BCF export** – Export výsledků validace do BIM Collaboration Format
  - Standardní formát pro issue tracking v BIM

- [ ] **Lazy loading s cache** – Načítat obsah souborů až když je potřeba
  - LRU cache s konfigurovatelným limitem
  - Rychlejší start aplikace s mnoha soubory

- [ ] **Web Workers pro IFC parsing** – Parsování velkých IFC souborů v background threadu
  - UI zůstane responzivní
  - Využití více jader CPU

### Nízká priorita

- [ ] **Virtual scrolling** – Pro strom souborů s 1000+ položkami
- [ ] **Incremental updates** – Ukládat jen změněné části dat v IndexedDB
- [ ] **Batch operace IndexedDB** – Seskupit více operací do jedné transakce

---

## Poznámky
- Projekt běží na Cloudflare Pages z GitHubu (auto-deploy při push)
- Doména: checkthebim.com
- Testy: 283 testů (Puppeteer + custom Jasmine-like framework)
- Stack: Vanilla JS, žádné frameworky, čistě client-side
