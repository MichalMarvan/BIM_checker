# BIM Checker

Profesionální nástroje pro validaci a analýzu BIM dat podle buildingSMART standardů.

## 🚀 Nástroje

### 📊 IFC Multi-File Viewer
Pokročilý prohlížeč pro analýzu a porovnání více IFC souborů současně.

**Funkce:**
- Načtení více IFC souborů najednou
- Společná tabulka všech entit z více souborů
- Pokročilé vyhledávání (text i regex)
- Správa PropertySetů s drag & drop
- Export do CSV
- Stránkování a filtry
- Sticky columns pro lepší přehlednost

### 🔍 IDS Parser, Vizualizér a Editor
Nástroj pro zobrazení, analýzu a editaci IDS (Information Delivery Specification) souborů.

**Funkce:**
- Parsování IDS souborů
- Vizuální zobrazení specifikací
- Stromová struktura
- Raw XML zobrazení
- Regex pattern vysvětlení
- **✨ Plnohodnotný IDS editor**
  - Vytvoření nového IDS od začátku
  - Přidávání/editace/mazání specifikací
  - Přidávání/editace/mazání facetů (Entity, Property, Attribute, Classification, Material, PartOf)
  - Podpora všech typů omezení (simpleValue, pattern, enumeration, bounds)
  - Stažení editovaného IDS jako XML soubor
- Rozbalovací sekce pro přehlednost

### ✅ IDS-IFC Validátor
Validace IFC modelů proti IDS specifikacím pro kontrolu kvality dat.

**Funkce:**
- Validace IFC podle IDS standardu
- Podpora Applicability & Requirements
- Detailní výsledky validace pro každou entitu
- Statistiky úspěšnosti
- Filtrování výsledků
- Export výsledků do CSV

## 🏃 Lokální spuštění

### Python HTTP Server
```bash
cd BIM_checker
python3 -m http.server 8000
```

Aplikace bude dostupná na: http://localhost:8000

### Node.js HTTP Server (alternativa)
```bash
npx http-server -p 8000
```

## 🌐 Nasazení na Vercel

### 1. Instalace Vercel CLI
```bash
npm install -g vercel
```

### 2. Přihlášení
```bash
vercel login
```

### 3. Deploy
```bash
cd BIM_checker
vercel
```

Nebo jednoduchý deploy:
```bash
vercel --prod
```

### Automatický deploy z GitHubu
1. Pushnout projekt na GitHub
2. Propojit Vercel s GitHub repository
3. Vercel automaticky deployuje při každém push

## 📁 Struktura projektu

```
BIM_checker/
├── index.html                           # Úvodní stránka
├── pages/                                # HTML stránky nástrojů
│   ├── ifc-viewer-multi-file.html       # IFC Multi-File Viewer
│   ├── ids-parser-visualizer.html       # IDS Parser & Editor
│   └── ids-ifc-validator.html           # IDS-IFC Validátor
├── assets/                               # Sdílené zdroje
│   ├── css/                             # Stylové soubory
│   │   └── ids-editor-styles.css        # Styly pro IDS editor
│   └── js/                              # JavaScript moduly
│       └── ids/                         # IDS editor moduly
│           ├── ids-xml-generator.js     # Generování IDS XML
│           ├── ids-editor-modals.js     # Modální okna pro facety
│           └── ids-editor-core.js       # Hlavní logika editoru
├── vercel.json                          # Vercel konfigurace
├── .gitignore                           # Git ignore pravidla
└── README.md                            # Dokumentace
```

## 🔧 Technologie

- **HTML5** - Struktura aplikace
- **CSS3** - Styling a responzivní design
- **JavaScript (ES6+)** - Aplikační logika
- **IFC Standard** - Industry Foundation Classes
- **IDS Standard** - Information Delivery Specification
- **buildingSMART** - Standardy pro interoperabilitu

## 🎯 Podporované standardy

- **IFC 4.x** - Industry Foundation Classes
- **IDS 1.0** - Information Delivery Specification
- **buildingSMART** - Oficiální standardy pro BIM

## 📋 Podporované facety (IDS Validace)

- **Entity** - Validace IFC entit
- **Property** - Kontrola PropertySetů a hodnot
- **Attribute** - Kontrola atributů (Name, GlobalId, atd.)
- **Material** - Validace materiálů
- **Classification** - Kontrola klasifikačních systémů
- **PartOf** - Validace strukturálních vztahů

## 🔒 Bezpečnost a soukromí

- Veškeré zpracování probíhá **lokálně v prohlížeči**
- Žádná data nejsou odesílána na server
- Žádné ukládání souborů na cloud
- Aplikace funguje i offline (po prvním načtení)

## 🌍 Prohlížeče

Aplikace funguje ve všech moderních prohlížečích:
- Chrome/Edge (doporučeno)
- Firefox
- Safari
- Opera

## 📝 Licence

Tento projekt je open-source a dostupný pro volné použití.

## 🤝 Přispění

Příspěvky jsou vítány! Neváhejte otevřít issue nebo pull request.

## 📧 Kontakt

Pro dotazy a zpětnou vazbu kontaktujte autora projektu.

---

**BIM Checker** - Nástroje pro práci s BIM daty | 2024
