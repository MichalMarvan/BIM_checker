# Wizard Design - BIM Checker

## Overview

Interaktivní průvodce (wizard) pro všechny stránky BIM Checker aplikace.

## Klíčová rozhodnutí

| Aspekt | Rozhodnutí |
|--------|------------|
| Typ wizardu | Kombinace tooltip bublinek + interaktivní kroky + help sidebar |
| První návštěva | Upozornění u tlačítka, ne automatické spuštění |
| Kroky | Mix - základní povinné, pokročilé volitelné |
| Jazyk | Existující i18n systém (translations.js) |
| Design bublinek | Výrazný gradient + overlay s zvýrazněním prvku |
| Implementace | Vlastní (bez externích knihoven) |
| Help panel | Sidebar s dokumentací/FAQ |
| Umístění tlačítka | V headeru vedle theme toggle |

## Architektura

### Soubory

```
assets/js/common/
├── wizard.js           # WizardManager, Tooltip, Overlay, Sidebar třídy
├── wizard-steps.js     # Definice kroků pro každou stránku

assets/css/
├── wizard.css          # Všechny wizard styly
```

### Třídy

- **WizardManager** - řídí stav wizardu, aktuální krok, navigaci
- **WizardOverlay** - ztmavené pozadí se "spotlight" efektem
- **WizardTooltip** - bublina s textem, progress bar, navigační tlačítka
- **WizardSidebar** - help panel s dokumentací

## Kroky wizardu

### Hlavní stránka (index.html)
1. Úložiště IFC (volitelný)
2. Úložiště IDS (volitelný)
3. Nahrání souboru (**povinný**)
4. Správa složek (volitelný)
5. IFC Viewer nástroj (volitelný)
6. IDS Parser nástroj (volitelný)
7. Validátor nástroj (volitelný)

### IFC Viewer
1. Načtení IFC souborů (**povinný**)
2. Spuštění parseru (**povinný**)
3. Tabulka entit (volitelný)
4. Vyhledávání (volitelný)
5. Filtry (volitelný)
6. Stránkování (volitelný)
7. Spatial tree (volitelný)
8. PropertySet sloupce (volitelný)
9. Edit mode (volitelný)
10. Export CSV (volitelný)

### IDS Parser
1. Načtení IDS souboru (**povinný**)
2. Vzorový soubor (volitelný)
3. Vizuální karty (volitelný)
4. Specifikace detail (volitelný)
5. Editor záložka (volitelný)
6. Nová specifikace (**povinný**)
7. Facety panel (volitelný)
8. Export IDS (volitelný)

### IDS-IFC Validator
1. Výběr IFC souborů (**povinný**)
2. Výběr IDS pravidel (**povinný**)
3. Validační skupiny (volitelný)
4. Spuštění validace (**povinný**)
5. Průběh validace (volitelný)
6. Statistiky výsledků (volitelný)
7. Detail výsledků (volitelný)
8. Filtry výsledků (volitelný)
9. Export XLSX (volitelný)

## UI Design

### Tooltip bublina
- Gradient border (purple-blue)
- Progress indikátor (1/5)
- Ikona + nadpis
- Popis
- Tlačítka: Přeskočit | Další

### Overlay
- Poloprůhledné pozadí rgba(0,0,0,0.75)
- Spotlight efekt kolem aktivního elementu
- Pulzující glow animace

### Sidebar
- Šířka 350px (100% na mobilu)
- Sekce: Spustit průvodce, O stránce, FAQ, Klávesové zkratky
- Accordion pro FAQ
