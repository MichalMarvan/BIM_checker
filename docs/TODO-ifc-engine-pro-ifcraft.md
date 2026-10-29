# TODO: ifc-engine na 100 % (příprava na vendor do IFCraft)

*Sepsáno 2026-09-04 z analýzy v projektu ifc-builder (IFCraft). Cíl: dotáhnout `assets/js/3d/ifc-engine/` tak, aby šel vendorovat jako kompletní IFC čtecí knihovna (parser + geometrie + properties) — IFCraft z ní postaví IFC import (strom + PSety + meshe). Co je hotové, je vyjmenované na konci — je toho hodně, mezery jsou čtyři velké + drobnosti.*

## 1. Odthreeovat geometrické jádro (největší kus)

**Problém**: geometrie je srostlá s Three.js — `geometry/mesh-types.js` (1 752 ř., ~82 referencí THREE), `geometry/placement.js` (~13), `geometry/geometry-core.js` (~8), navíc `alignment/linear-placement.js` a `coords/geo-coords.js`. IFCraft je vanilla JS bez Three; a i pro BIM_checker by čisté jádro znamenalo testovatelnost v Node.

**Cíl**: rozdělit na čisté jádro (výstup `{positions: number[], indices: number[]}` + vlastní mini vec3/mat4) a tenký Three adaptér (obal do BufferGeometry až na konci, ve viewer vrstvě).

Náhrady konkrétních THREE API:
- `ShapeUtils.triangulateShape` → **earcut** (malá závislost, IFCraft ji už používá)
- `ExtrudeGeometry` → vlastní extruze profilu (obrys+díry přes earcut, boční pásy quadů)
- `TubeGeometry` (swept disk) → vlastní trubka podél polyline (kruhový profil, rovnoběžný transport rámce)
- `LatheGeometry` (revolved) → rotační mřížka kolem osy
- `CatmullRomCurve3` → prověřit, zda je vůbec potřeba (IFC directrix bývá polyline/indexed curve — vzorkovat přímo)
- `Vector3/Matrix4/Quaternion` → mini-math modul (~100 ř.)

## 2. Otvory: IfcRelVoidsElement se neodečítají

**Problém**: opening elementy se jen skrývají (`constants.js` je má v hidden setu), hostitel zůstává plný — stěny z Revitu vyjdou bez děr na okna/dveře.

**Cíl**: implementovat odečet otvorů od hostitele. Stačí pragmaticky:
- běžný případ Revit: extrudovaný host + extrudovaný otvor → prism subtraction (2D boolean půdorysů + re-extruze, earcut zvládne díry)
- neřešitelné kombinace → fallback na plný tvar + warning (dnešní chování)

## 3. Booleany: jen 2D vzor, chybí halfspace

**Problém**: `geometry-core.js` řeší `IFCBOOLEANRESULT/CLIPPINGRESULT` DIFFERENCE jen pro koplanární 2D vzor (díra v desce à la Tekla); jinak se bere FirstOperand a odečtení se zahodí.

**Cíl**: doplnit ořez polorovinou — `IFCHALFSPACESOLID` a `IFCPOLYGONALBOUNDEDHALFSPACE` jako SecondOperand (typický Revit: šikmé ořezy stěn/střech). Mesh-vs-rovina clip je řádově jednodušší než plné CSG a pokryje většinu reálných případů. Plný mesh-CSG NENÍ cílem.

## 4. Spatial hierarchie neumí IFC4x3 infra

**Problém**: `properties/spatial.js` má `SPATIAL_TYPES = {Project, Site, Building, Storey, Space}` — mostní/silniční modely (IfcBridge, IfcFacilityPart…) se nezařadí jako spatial.

**Cíl**: doplnit `IfcFacility`, `IfcBridge`, `IfcRoad`, `IfcRailway`, `IfcMarineFacility`, `IfcFacilityPart` + typované varianty (`IfcBridgePart`, `IfcRoadPart`, `IfcRailwayPart`, `IfcMarinePart`, `IfcFacilityPartCommon`), zvážit `IfcSpatialZone`. Ideálně jako data-driven set, ne hardcode (IFCraft má seznam spatial tříd generovaný ze schématu — možno převzít).

## 5. IFC4x3 sectioned solids (infra geometrie)

**Problém**: `IFCSECTIONEDSOLIDHORIZONTAL` (a `IFCSECTIONEDSURFACE`) z Civil 3D / rail exportů nejsou v geometry-core — infra modely s tímto typem vyjdou bez geometrie.

**Cíl**: základní implementace — profily vzorkované podél directrix; `alignment/curve-evaluator.js` už umí křivky vyhodnocovat, jde „jen" o loft mezi vzorkovanými profily.

## 6. Nice-to-have (nižší priorita)

- `IFCADVANCEDBREP` (NURBS plochy z Design Transfer View) — vzácné u Reference View exportů; stačí fallback + warning.
- Ověřit, že `properties/related-data.js` vrací kompletní materiály (`IfcRelAssociatesMaterial` vč. layer/profile setů) — IFCraft potřebuje jméno materiálu per produkt.
- Ověřit konzistentní aplikaci jednotek (`parser/units.js`) na geometrii — meshe vždy v metrech.
- Výstup meshů přes worker hranici bez THREE typů (plain arrays / Float32Array) — souvisí s bodem 1.

## Co už je hotové a dobré (nedělat znovu)

Parser (step-parser, ifc-decoder, entity-index, entity-name, guid-resolve, units, product-detect, presentation-layers) — čistý JS, detekce schématu. Geometrie: extruze, faceted brep, triangulated/polygonal facesets (vč. faces-with-voids), swept disk, revolved, shell-based surface, mapped items, 15 typů profilů (vč. arbitrary-with-voids). Properties: psets, quantities, related-data. Spatial extractor (pozemní). Alignment 4x3 (parser + curve evaluator + linear placement). Styled items (barvy).

## Návaznost v IFCraftu (až bude hotovo)

1. Re-vendor (`scripts/vendor-from-bim-checker.sh` — rozšířit seznam o geometry/properties/alignment moduly; POZOR: při vendoru smazat SPDX hlavičky dle pravidla projektu). Dnes vendorované `step-parser.js` a `ifc-parser-core.js` jsou zastaralé.
2. Mapovací vrstva IFC → konvence (strom uzlů, rules, psetRefs, materiály) — vlastní práce IFCraftu, mimo tento TODO.
