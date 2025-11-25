# BIM Checker – Doporučení a Požadavky (Technical Requirements)

Tento dokument shrnuje všechna doporučení a požadavky pro projekt **BIM Checker** tak, aby bylo možné projekt dále rozvíjet jako profesionální open‑source nástroj pro práci s IFC, IDS a validací dat.

---

## 1. Přehled projektu

BIM Checker je webová aplikace zcela běžící v prohlížeči, která poskytuje:
- **lokální úložiště souborů** (IndexedDB)
- **IFC tabulkový viewer + editor**
- **IDS viewer + editor**
- **IDS–IFC validátor** s výstupy v HTML a XLSX

Aplikace funguje offline, neodesílá žádná data na server a nepoužívá backend.

---

# 2. Požadavky pro open‑source verzi

## 2.1 Povinné náležitosti
- Přidat **LICENSE** soubor (doporučeno MIT nebo Apache 2.0)
- Doplnit **README** s:
  - popisem funkcí  
  - návodem ke spuštění  
  - omezeními  
  - screenshoty  
  - roadmapou  
- Přidat **CONTRIBUTING.md**
- Přidat **CODE_OF_CONDUCT.md**
- Zavést **verzování** pomocí Git tagů (např. `v0.1.0`, `v0.2.0`)
- Připravit **CHANGELOG.md**
- Přidat adresář `examples/` s ukázkami IFC/IDS

---

# 3. Požadavky na funkčnost

## 3.1 IFC Viewer & Editor
- Možnost načíst více IFC souborů a zobrazit jejich obsah tabulkově
- Filtrace, vyhledávání (text + regex)
- Úprava PSetů a vlastností
- Varování při destruktivních úpravách (např. přejmenování standardních PSetů)
- Možnost exportu dat do CSV
- Možnost uložit upravený IFC soubor
- Beh ve web workeru kvůli výkonu

### Doporučená vylepšení
- Zvýraznit oficiální PSety (buildingSMART)  
- Kontrola integrity po exportu IFC  
- Diff režim – ukázat změny před uložením  
- Přesun SheetJS z CDN na lokální asset

---

## 3.2 IDS Viewer & Editor
- Načtení IDS (XML)
- Zobrazení stromové struktury
- Úprava IDS přímo v editoru
- Generování nových IDS ze strukturovaného formuláře
- Export do XML

### Doporučená vylepšení
- Wizard na tvorbu IDS (krokový průvodce)
- Validace IDS proti oficiálnímu `ids.xsd`
- Šablony IDS (pro stěny, prostory, infrastrukturu, Psety)

---

## 3.3 IDS–IFC Validator
- Validace podle dvou částí:
  - **Applicability**
  - **Requirements**
- Podpora typů: property, classification, entity, material, cardinality
- HTML výsledky
- Export do XLSX

### Doporučená vylepšení
- Integrace s IDS-Audit tool (aspoň nepřímo)
- Podpora QTO požadavků (budoucí)
- Validace názvů Pset/Property podle bSI standardů
- Detailní export výsledků:
  - entita  
  - GlobalId  
  - typ požadavku  
  - porušení  
  - očekávaná vs. nalezená hodnota  

---

# 4. Technické požadavky

## 4.1 Projektová struktura
```
/assets
  /js
    /common
    /ifc
    /ids
    /workers
  /css
/docs
/examples
  /ifc
  /ids
/pages
/tests
LICENSE
README.md
CHANGELOG.md
```

---

# 5. Roadmapa

## Verze 0.2
- přidání LICENSE  
- doplnění README  
- úložiště `examples/`  
- offline SheetJS  

## Verze 0.3
- validace IDS pomocí XSD  
- upozornění při destruktivní editaci IFC  
- oficiální PSet highlight  

## Verze 0.4
- diff‑mode u IFC editoru  
- wizard pro IDS  
- testovací sada + základní automatické testy  

## Verze 1.0
- plná IDS 1.0 kompatibilita  
- propojení s IDS-Audit  
- vysoce stabilní IFC editor  
- dokumentace na úrovni profesionálních OSS projektů  

---

# 6. Limitace projektu (uvést do README)
- Data viewer neřeší geometrii IFC  
- Neprobíhá úplná STEP syntaktická validace  
- Úprava názvů PSetů může porušit kompatibilitu s jinými nástroji  
- IDS editor zatím neprovádí formální kontrolu podle XSD  
- Validátor kryje jen část IDS požadavků  

---

# 7. Doporučení k publikaci na GitHub Pages
- Mít v README jednoznačné:  
  > „Aplikace běží 100 % lokálně v prohlížeči, data neopouštějí vaše zařízení.“  
- Přidat screenshoty jednotlivých nástrojů  
- Uvést minimální podporované prohlížeče  

---

# 8. Závěr

Projekt má velký potenciál jako jednoduchý, rychlý a otevřený nástroj na kontrolu IFC a IDS dat.  
Následující dokument slouží jako jednotný zdroj požadavků pro další rozvoj.
