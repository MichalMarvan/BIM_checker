# IDS Excel Import/Export - Design Document

**Datum:** 2026-01-26
**Status:** Schváleno
**Autor:** Claude + Michal

## Přehled

Přidat do IDS editoru možnost importu/exportu z Excel souborů. Vlastní formát (ne Excel2IDS) optimalizovaný pro uživatelskou přívětivost.

## Rozhodnutí z brainstormingu

| Otázka | Rozhodnutí |
|--------|------------|
| Formát | Vlastní (lepší UX než Excel2IDS) |
| Lookup tabulky | Ano - psets_lookup jako katalog, element_psets jako mapování |
| Value override | Volitelný sloupec v element_psets |
| UI workflow | Upload Excel → Editace v UI → Download IDS + obousměrně |
| Ukázkový Excel | Realistické příklady + Top 20 psets katalog |
| Knihovna | SheetJS (již v projektu) |
| Umístění | Do existujícího IDS editoru |
| Error handling | S varováními - pokračuj, na konci zobraz všechny problémy |
| Šablona | Statický soubor (vždy ke stažení jako reference) |

## Struktura Excel souboru

### List 1: info
| Field | Value | Description |
|-------|-------|-------------|
| title | My IDS | Title (required) |
| description | ... | Description |
| author | John Doe | Author name |
| version | 1.0 | Version |
| date | 2026-01-26 | Creation date |
| purpose | ... | Purpose |
| copyright | ... | Copyright |

### List 2: specifications
| spec_id | name | description | ifcVersion |
|---------|------|-------------|------------|
| SPEC_01 | Wall properties | Check... | IFC4 |
| SPEC_02 | Door properties | Check... | IFC4 |

### List 3: applicability
| spec_id | facet_type | entity_name | predefinedType |
|---------|------------|-------------|----------------|
| SPEC_01 | entity | IFCWALL | |
| SPEC_02 | entity | IFCDOOR | |

### List 4: psets_lookup (KATALOG)
| pset_name | property_name | dataType | value |
|-----------|---------------|----------|-------|
| Pset_WallCommon | IsExternal | boolean | |
| Pset_WallCommon | FireRating | string | REI* |
| Pset_DoorCommon | IsExternal | boolean | |
| ... | ... | ... | ... |

### List 5: element_psets (MAPOVÁNÍ)
| spec_id | pset_name | cardinality | value_override |
|---------|-----------|-------------|----------------|
| SPEC_01 | Pset_WallCommon | required | |
| SPEC_02 | Pset_DoorCommon | required | |

## UI v IDS Editoru

### Nová tlačítka v toolbaru
```
[+ New IDS] [📂 Load IDS] [💾 Download IDS] [✏️ Edit Mode]

[📥 Import Excel] [📤 Export Excel] [📋 Download Template]
```

### Akce tlačítek
| Tlačítko | Akce |
|----------|------|
| Import Excel | Otevře file picker, nahraje .xlsx, převede na IDS, zobrazí v editoru |
| Export Excel | Převede aktuální IDS na Excel, stáhne .xlsx |
| Download Template | Stáhne statický `IDS_Template.xlsx` s příklady + katalogem |

### Flow při importu
1. Uživatel klikne "Import Excel"
2. Vybere soubor
3. Parsování + validace struktury
4. Pokud OK → zobrazí v editoru (lze dále upravit)
5. Pokud varování → zobrazí dialog se seznamem problémů, umožní pokračovat

## Konverze Excel → IDS

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Excel soubor   │────▶│  ExcelParser    │────▶│  IDS struktura  │
│  (.xlsx)        │     │  (SheetJS)      │     │  (JS objekt)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                                ┌─────────────────┐
                                                │  IDS Editor     │
                                                │  (existující)   │
                                                └─────────────────┘
```

### Mapování listů na IDS
| Excel list | → | IDS struktura |
|------------|---|---------------|
| info | → | `idsData.title`, `idsData.author`, ... |
| specifications | → | `idsData.specifications[]` |
| applicability | → | `spec.applicability[]` |
| psets_lookup + element_psets | → | `spec.requirements[]` |

### Sloučení psets_lookup a element_psets
```javascript
// Pro každý řádek v element_psets:
// 1. Najdi spec_id v specifications
// 2. Najdi všechny properties z psets_lookup pro daný pset_name
// 3. Vytvoř requirement facety s případným value_override
```

## Konverze IDS → Excel

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  IDS struktura  │────▶│  ExcelGenerator │────▶│  Excel soubor   │
│  (z editoru)    │     │  (SheetJS)      │     │  (.xlsx)        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Logika generování psets_lookup
- Projde všechny `spec.requirements[]`
- Extrahuje unikátní kombinace `pset_name + property_name`
- Deduplikuje do katalogu

## Ukázkový Excel (IDS_Template.xlsx)

### List info
Předvyplněné placeholdery:
```
title       | [Your IDS Title]
author      | [Your Name]
version     | 1.0
date        | [auto-filled today]
```

### List specifications
3 ukázkové specifikace:
```
SPEC_walls    | Wall Requirements    | All walls must have...
SPEC_doors    | Door Requirements    | All doors must have...
SPEC_windows  | Window Requirements  | All windows must have...
```

### List applicability
```
SPEC_walls   | entity   | IFCWALL
SPEC_doors   | entity   | IFCDOOR
SPEC_windows | entity   | IFCWINDOW
```

### List psets_lookup
Top 20 nejpoužívanějších IFC4 property setů:
- Pset_WallCommon
- Pset_DoorCommon
- Pset_WindowCommon
- Pset_SlabCommon
- Pset_BeamCommon
- Pset_ColumnCommon
- Pset_RoofCommon
- Pset_StairCommon
- Pset_RampCommon
- Pset_CoveringCommon
- Pset_CurtainWallCommon
- Pset_PlateCommon
- Pset_RailingCommon
- Pset_BuildingElementProxyCommon
- Pset_SpaceCommon
- Pset_ZoneCommon
- Pset_BuildingCommon
- Pset_SiteCommon
- Pset_BuildingStoreyCommon
- Pset_ProjectCommon

### List element_psets
```
SPEC_walls   | Pset_WallCommon   | required
SPEC_doors   | Pset_DoorCommon   | required
SPEC_windows | Pset_WindowCommon | required
```

## Error Handling

### Možné chyby při importu
| Chyba | Zpráva pro uživatele |
|-------|---------------------|
| Chybí povinný list | "Missing required sheet: info" |
| Chybí povinný sloupec | "Missing column 'spec_id' in sheet 'specifications'" |
| Neznámé spec_id | "Unknown spec_id 'SPEC_99' in applicability row 5" |
| Neznámý pset | "Property set 'Pset_Custom' not found in catalog (row 3)" |
| Prázdný soubor | "Excel file is empty or invalid" |
| Špatný formát | "Invalid file format. Please upload .xlsx file" |

### UI pro varování
```
┌─────────────────────────────────────────────────────────┐
│ ⚠️ Import completed with 3 warnings                    │
├─────────────────────────────────────────────────────────┤
│ • Row 5: Unknown spec_id 'SPEC_99' - skipped           │
│ • Row 8: Missing pset_name - skipped                   │
│ • Row 12: Invalid cardinality 'maybe' - used 'required'│
├─────────────────────────────────────────────────────────┤
│ Imported: 15 specifications, 42 requirements           │
│                                                         │
│ [OK - Continue to Editor]    [Download Error Report]   │
└─────────────────────────────────────────────────────────┘
```

## Struktura souborů

### Nové soubory
```
assets/js/ids/
├── ids-excel-parser.js      # Excel → IDS konverze
├── ids-excel-generator.js   # IDS → Excel konverze
└── ids-excel-template.js    # Pomocné funkce pro šablonu

assets/templates/
└── IDS_Template.xlsx        # Statický soubor ke stažení
```

### Změny existujících souborů
| Soubor | Změna |
|--------|-------|
| `assets/js/ids/ids-editor-core.js` | Přidat metody importExcel(), exportExcel(), downloadTemplate() |
| `ids-editor.html` | Přidat 3 tlačítka do toolbaru + hidden file input |
| `assets/css/ids-editor-styles.css` | Styly pro warning dialog |

## Zdroje

- buildingSMART Excel2IDS: https://github.com/buildingsmart-community/Excel2IDS
- SheetJS dokumentace: https://docs.sheetjs.com/
- IFC4 Property Sets: https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/
