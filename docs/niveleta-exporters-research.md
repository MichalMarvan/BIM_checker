# Rešerše: Export os a nivelet do LandXML a IFC 4.3 (2026-07-15)

Podklad pro podporu variant nivelet ve 3D vieweru. Primární zdroje (LandXML 1.2 XSD,
IFC 4.3 spec, bSI testovací soubory) ověřeny přímo; co se nenašlo, je uvedeno explicitně.

## 1. LandXML `<Profile>/<ProfAlign>` — kdo píše co

Schéma: `ProfAlign` = posloupnost `PVI`, `ParaCurve` (`length`), `UnsymParaCurve`
(`lengthIn`/`lengthOut`), `CircCurve` (`length` + `radius`). XSD sémantiku `length`
neupřesňuje (vodorovný průmět vs. délka oblouku!).

| SW | Vertikální elementy |
|---|---|
| Civil 3D | PVI, CircCurve, ParaCurve i UnsymParaCurve (import i export) |
| OpenRoads/InRoads | export aktivního profilu; konkrétní elementy veřejně nedoloženy |
| ProVI | LandXML podporuje; elementy veřejně nedokumentovány |
| RoadPAC | LandXML import/export existuje; detaily nenalezeny |
| Vestra (AKG) | LandXML 1.2, „Gradienten"; typ elementů neuveden |
| Novapoint/Quadri | Inframodel 4.2 → vertikála přes **CircCurve**; od 2026.1 podepsaný poloměr |
| InfraModel (FI) | **pouze PVI + CircCurve** (ParaCurve neexistuje!); `length` = „3D length", podepsaný radius |

CircCurve reálně píší: finský ekosystém (Inframodel) + Civil 3D; kružnicové zaoblení
je typické pro železnici (ČSN 73 6360-1: kružnice R ≥ 2000 m; německy „Ausrundung" —
RAS-L silnice = parabola, železnice = kružnice).

## 2. Směrový atribut `dir` — konvence

- **XSD doslovně** (LandXML 1.0–2.0, anotace Units): směry „measured
  **counter-clockwise from 0 degrees = north**" → matematický azimut = π/2 + dir.
- **Průmyslová praxe** (Civil 3D aj., Brice Appendix A): azimut **clockwise od severu**
  → matematický azimut = π/2 − dir.
- ProVI implementuje doslovné znění XSD (ověřeno na RuzLet_GPK.xml: skutečný azimut
  = π/2 + dir). Mainstream píše opačně. Oficiální errata neexistují.
- Jednotky: `Units.directionUnit`/`angularUnit` ∈ radians (default) / grads / decimal
  degrees — gony jsou v DACH/Nordic běžné.
- Doporučení (Brice): Line/Spiral často `dir` nemají — **směr počítat z bodů**;
  body jsou spolehlivější než atributy. → viewer: PI (průsečík tečen) má přednost,
  pojistka tečné spojitosti.

## 3. IFC 4.3 vertikální segmenty

Kanonické mapování PredefinedType → ParentCurve (Brice Table 3.0-1, shodně ifcopenshell):
CONSTANTGRADIENT→IfcLine, CIRCULARARC→IfcCircle, PARABOLICARC→IfcPolynomialCurve,
CLOTHOID→IfcClothoid. Viewer podporuje všechny čtyři (geometrická vrstva) + business
fallback (soubory bez Representation).

- `StartDistAlong`/`HorizontalLength` = **vodorovný průmět**; `IfcCurveSegment.SegmentLength`
  = délka **po křivce** (u vrcholových kružnic i **záporná** — CW trim).
- Civil 3D 2024–26: IFC4X3_ADD2 vč. alignmentů; nepodporované přechodnice → tesselace
  jako **IfcAnnotation** (pozor, není IfcAlignment). OpenRoads: IFC 4.3 alignment
  neumí („future consideration"). FreeCAD: přes ifcopenshell → kanonické mapování.
- Vertikální CIRCULARARC reálně existuje: bSI IFC-Rail testset má 8+8 souborů
  `VerticalAlignment_CircularArc_*` (IFCGRADIENTCURVE + IFCCIRCLE).

## 4. Známé quirky (checklist pro viewer)

1. Tři sémantiky „délky" vertikálního oblouku: IFC HorizontalLength = průmět;
   IfcCurveSegment.SegmentLength = po křivce (± znaménko); Inframodel = „3D length".
2. `RadiusOfCurvature` je optional a nespolehlivý → **počítat ze sklonů**
   (R = HorizontalLength/(atan g₁ − atan g₀)), atribut jen fallback. ✅ implementováno
3. UnsymParaCurve nemá IFC ekvivalent (→ 2× PARABOLICARC).
4. CircCurve: staničení začátku přes L/2 je aproximace (přesně T = R·tan(Δ/2)).
5. LandXML staničení (odečítat staStart) vs. IFC DistanceAlong; StaEquation láme mapping.
6. Oficiální bSI referenční kód generuje vadné vertikální klotoidy (zero-length +
   A=0) — pozor na testovací korpusy.
7. Zero-length DISCONTINUOUS terminátor je normativní; `IfcGradientCurve.EndPoint`
   volitelný a může být v rozporu.
8. IfcPolynomialCurve koeficienty mají implicitní jednotky (A₂ ~ Length⁻¹) — průšvih
   při stopách.
9. US survey foot (1200/3937) vs. international foot (0.3048). ✅ parser rozlišuje

Hlavní zdroje: LandXML-1.2.xsd; ifc43-docs.standards.buildingsmart.org
(IfcAlignmentVerticalSegment); RickBrice/IFC-Alignment-Geometry-Implementation-Guide
(kap. 3 + Appendix A); bSI-RailwayRoom/IFC-Rail-Unit-Test-Reference-Code;
buildingsmart.fi Inframodel 3/4; Autodesk/Bentley/AKG/Trimble dokumentace.
