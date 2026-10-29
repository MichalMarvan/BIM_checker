# IFC corpus

Tato složka má dvě role:

1. **Commitovaný regresní korpus** (`*.ifc` níže + `expected.json`) pro CI bránu
   `npm run test:ifc-corpus` — malé soubory, každý cvičí jednu geometrickou cestu
   3D enginu.
2. **Vstupní bod pro externí modely** (necommitované) pro výkonové a
   kompatibilitní zkoušky skutečných IFC exportů — viz poslední sekce.

## Regresní korpus (CI brána F5)

`scripts/ifc-diag/corpus-gate.mjs` spustí nad touto složkou
`geometry-diagnose.mjs` a porovná výsledek s `expected.json` (per soubor počty
produktů podle stavu, parser diagnostics, per produkt stav a degenerované
trojúhelníky). Očekávání aktualizujte vědomě:
`npm run test:ifc-corpus -- --update` (podrobnosti v `scripts/ifc-diag/README.md`).

Celková velikost je ~160 kB; limit je 2 MB. Velké modely sem nepatří.

### Původ a licence

| Soubor | Zdrojový repozitář | Cesta ve zdroji | Geometrie |
| --- | --- | --- | --- |
| extruded-solid.ifc | IFC4.x-specification-models | models/basic-geometric-shape/extruded-solid | IfcExtrudedAreaSolid |
| brep-model.ifc | IFC4.x-specification-models | models/basic-geometric-shape/brep-model | IfcFacetedBrep |
| csg-primitive.ifc | IFC4.x-specification-models | models/basic-geometric-shape/csg-primitive | IfcCsgSolid / primitiva |
| surface-model.ifc | IFC4.x-specification-models | models/basic-geometric-shape/surface-model | IfcShellBasedSurfaceModel |
| triangulated-item.ifc | IFC4.x-specification-models | models/basic-geometric-shape/triangulated-item | IfcTriangulatedFaceSet |
| basin-faceted-brep.ifc | IFC4.x-specification-models | models/advanced-geometric-shape/basin-faceted-brep | faceted brep, mnoho ploch |
| basin-tessellation.ifc | IFC4.x-specification-models | models/advanced-geometric-shape/basin-tessellation | teselace |
| cube-advanced-brep.ifc | IFC4.x-specification-models | models/advanced-geometric-shape/cube-advanced-brep | IfcAdvancedBrep |
| bath-csg-solid.ifc | IFC4.x-specification-models | models/advanced-geometric-shape/bath-csg-solid | CSG boolean |
| sectioned-solid-horizontal.ifc | IFC4.x-specification-models | models/alignment-geometries-and-linear-positioning/sectioned-solid-horizontal | IfcSectionedSolidHorizontal |
| fixed-reference-swept-area-solid.ifc | IFC4.x-specification-models | models/alignment-geometries-and-linear-positioning/fixed-reference-swept-area-solid | IfcFixedReferenceSweptAreaSolid (v baseline UNSUPPORTED) |
| mapped-shape-with-transformation.ifc | IFC4.x-specification-models | models/mapped-geometric-shape/mapped-shape-with-transformation | IfcMappedItem + transformace |
| polygonal-face-tessellation.ifc | IFC4.x-specification-models | models/tessellated-shape/polygonal-face-tessellation | IfcPolygonalFaceSet |
| beam-revolved-solid.ifc | IFC4.x-specification-models | models/building-elements/beam-revolved-solid | IfcRevolvedAreaSolid |
| slab-openings.ifc | IFC4.x-specification-models | models/building-elements/slab-openings | otvory / boolean clipping |
| curve-parameters-in-degrees.ifc | IFC4.x-specification-models | models/trimmed-curve-parameters/curve-parameters-in-degrees | parametry IfcTrimmedCurve |
| pass-als006-alignment_horizontal_shape_representation.ifc | ifc-gherkin-rules | test/files/ALS/als006 | křivky alignmentu, `/* */` komentář v DATA |
| pass-gem001-brep_model.ifc | ifc-gherkin-rules | test/files/GEM/gem001 | brep model |
| synthetic-tokenizer-edge-cases.ifc | BIM_checker (tento repozitář) | odvozeno z extruded-solid.ifc | komentáře uvnitř záznamů, `;` a `\X0\` před uzavírací uvozovkou, víceřádkové záznamy, dva záznamy na řádku, malá písmena v typu, jeden záznam bez `);` |

Zdroje (zkopírováno 2026-10-30, beze změn):

- `IFC4.x-specification-models`, <https://github.com/buildingSMART/IFC4.x-specification-models>,
  commit `ef22440ec501551ccc9689309560bbc7e26aa9d7` (2026-10-14). Lokální
  checkout neobsahuje soubor LICENSE; jde o ukázkové modely buildingSMART
  International publikované pro implementátory. Před redistribucí mimo tuto
  testovací sadu ověřte licenci upstream.
- `ifc-gherkin-rules`, <https://github.com/buildingSMART/ifc-gherkin-rules>,
  commit `893f8275049b8960c3ce0c7379b4b57aefeaa8f9` (2026-07-29), MIT License,
  Copyright (c) buildingSMART International Ltd.
- `synthetic-tokenizer-edge-cases.ifc` vznikl pro tento repozitář
  (AGPL-3.0-or-later jako zbytek testů).

`.gitignore` ignoruje `*.ifc` globálně; `!tests/fixtures/ifc-corpus/*.ifc`
tuto složku znovu zahrnuje. Nový fixture: zkopírujte malý soubor sem, doplňte
řádek do tabulky a spusťte `--update`.

## Externí modely (necommitované)

Skutečné IFC exporty nejsou součástí repozitáře, protože jejich licence,
důvěrnost a velikost se liší podle zdroje. Pro release kontrolu použijte pouze
modely, které smíte zpracovat a jejichž původ je zaznamenaný. Doporučené pokrytí:

- IFC2X3, IFC4 a IFC4X3;
- architektura, konstrukce, TZB a infrastruktura;
- alespoň dva různé autorovací/exportní nástroje na schéma;
- malé, střední a velké soubory;
- pokročilé reprezentace uvedené v `docs/3D_GEOMETRY_SUPPORT.md`.

Soubory lze předat výkonovému testu přímo:

```bash
npm run test:performance -- tests/fixtures/ifc-corpus/model-a.ifc tests/fixtures/ifc-corpus/model-b.ifc
```

Pozor: cokoli s příponou `.ifc` v této složce je nyní zahrnuto do gitu i do
CI brány. Externí modely proto ukládejte jinam (např. `podklady/`, ignorováno)
nebo je sem dávejte jen dočasně a necommitujte.

Pro každý model evidujte mimo repozitář název, SHA-256, velikost, schéma,
exportér, licenci/oprávnění a očekávaná omezení. Výsledek testu vznikne v
`test-results/performance-ifc.json`. Úspěch na tomto corpus není formální
certifikace IFC implementace.
