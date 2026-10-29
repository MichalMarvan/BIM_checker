# Podpora IDS 1.0 a IFC

Tato matice popisuje implementované chování BIM Checkeru. Nejde o certifikaci
buildingSMART. CI používá připnutý release oficiálního IDS 1.0 implementer
corpus a publikuje JSON i Markdown report s očekávanými výsledky.

## IDS facety a omezení

| Oblast | Stav |
|---|---|
| Entity facet a `predefinedType` | Podporováno |
| Property facet včetně PSetu, datového typu a hodnoty | Podporováno |
| Attribute facet | Podporováno |
| Classification facet | Podporováno |
| Material facet | Podporováno |
| PartOf facet a vztah | Podporováno |
| `simpleValue` | Podporováno |
| `xs:pattern` včetně více patternů | Podporováno |
| `xs:enumeration` | Podporováno |
| Numerické a délkové bounds | Podporováno |
| `required`, `optional`, `prohibited` cardinality | Podporováno |
| `minOccurs`, `maxOccurs`, occurrence pravidla | Podporováno |
| Více hodnot `ifcVersion` | Podporováno jako exchange metadata podle IDS 1.0 |

## IFC schémata

| Schéma | Datová validace IDS | Tabulkový parser | Vlastní 3D geometrie |
|---|---:|---:|---:|
| IFC2X3 | Ano | Ano | Částečně podle representation typu |
| IFC4 | Ano | Ano | Ano pro dokumentovanou množinu reprezentací |
| IFC4X3 / IFC4X3_ADD2 | Ano | Ano | Ano včetně vybraných alignment a linear-placement cest |

`ifcVersion` v IDS je metadata výměnného požadavku. Neznámá deklarovaná verze
je reportována jako warning a sama o sobě nemění pass/fail facety. Skutečné IFC
schéma je detekováno z hlavičky souboru a ukládá se k výsledku.

## Co přesně testujeme

- XSD validitu vstupního a generovaného IDS;
- parsování a normalizaci všech facetů;
- applicability a počet applicable entit;
- requirements a důvod selhání;
- cardinality/occurrence;
- schéma IFC a metadata výsledku;
- shodu hlavní a Worker validační cesty;
- sémantický IDS XML → Excel → IDS XML roundtrip;
- oficiální buildingSMART očekávané výsledky.

Known limitations a rozdíl mezi datovou a geometrickou podporou jsou popsány v
`KNOWN_LIMITATIONS.md` a `3D_GEOMETRY_SUPPORT.md`.
