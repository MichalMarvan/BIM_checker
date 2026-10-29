# IDS Excel formát

## Identifikace

Workbook generovaný BIM Checkerem obsahuje v listu `info`:

- `format = BIM_CHECKER_IDS_EXCEL`,
- `format_version = 2`,
- verzi generátoru,
- `ids_schema_version = 1.0`.

Import rozpoznává neoznačenou historickou šablonu a vrací migrační protokol.
Neznámou novější verzi odmítne, aby nedošlo k tiché ztrátě dat.

## Listy

| List | Úloha |
|---|---|
| `info` | Metadata dokumentu a formátu |
| `specifications` | IDS specifikace, IFC verze a occurrence |
| `applicability` | Applicability facety |
| `psets_lookup` | Požadavky na PSet/property v rozsahu specifikace |
| `element_psets` | Vazba požadavků na specifikace |

Pomocné JSON sloupce uchovávají normalizované restrictions, cardinality a
hodnoty, které nelze bezpečně vyjádřit pouze zobrazovanou buňkou. Nemají se
ručně mazat, pokud má být roundtrip bezeztrátový.

## Importní protokol

Import rozlišuje fatální chyby, varování, přeskočené řádky a ignorované listy.
Výsledek obsahuje počty zachovaných/zahozených položek a tlačítko **Protokol
importu** jej stáhne jako verzovaný JSON. Protokol obsahuje zdrojový soubor,
migraci formátu, varování a automatický výsledek lokální validace vygenerovaného
IDS proti XSD 1.0. Před potvrzením importu se uživateli zobrazí ztrátové změny;
protokol lze stáhnout i přímo z tohoto dialogu.

## Bezpečnost

Text začínající spreadsheet formulí (`=`, `+`, `-`, `@`, tabulátor nebo CR) je
neutralizován, pokud nejde o bezpečně rozpoznané číslo. Stejné pravidlo používá
sdílený CSV encoder. Importovaná buňka je vždy považována za nedůvěryhodný
vstup.

## Kompatibilita

Excel text nemusí po roundtripu vytvořit znak po znaku stejné XML. Garantovaným
cílem je shodný normalizovaný IDS význam, XSD validita a shodný validační
výsledek. Golden testy pokrývají všechny facet/restriction typy, Unicode,
poškozená data a verze formátu.
