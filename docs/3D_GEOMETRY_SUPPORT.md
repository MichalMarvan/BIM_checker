# Podpora IFC geometrie ve 3D vieweru

Tento dokument popisuje stav vlastní JavaScriptové geometrické pipeline. Nejde
o prohlášení, že viewer podporuje každou reprezentaci povolenou IFC schématem.
Po načtení konkrétního modelu jsou skutečně použité fallbacky a nepodporované
typy vidět v panelu **Modely → Další akce → Informace** a v
`IfcEngine.getStats(modelId).geometry`.

## Matice podpory

| IFC reprezentace | Stav | Poznámka |
|---|---|---|
| `IfcTriangulatedFaceSet` | Přesná | Trojúhelníková síť včetně indexovaných barev. |
| `IfcPolygonalFaceSet` | Přesná | Polygonální plochy jsou triangulovány. |
| `IfcFacetedBrep` | Přesná | Facetovaný BRep je převeden na trojúhelníky. |
| `IfcShellBasedSurfaceModel` | Přesná | Skořepinový povrch je převeden na trojúhelníky. |
| `IfcExtrudedAreaSolid` | Přesná pro podporované profily | Profil a směr vysunutí se vyhodnotí přímo. |
| `IfcRevolvedAreaSolid` | Přesná pro podporované profily | Rotační těleso je vzorkováno do sítě. |
| `IfcSweptDiskSolid` | Přesná s tesselační tolerancí | Trasa a kruhový průřez jsou vzorkovány. |
| `IfcMappedItem` | Přesná | Sdílená geometrie a transformační matice se skládají rekurzivně. |
| `IfcBooleanResult` / `IfcBooleanClippingResult` – rozdíl dvou vysunutí | Přesná | Podporován je rozpoznaný koplanární 2D rozdíl. |
| Ostatní booleovské CSG | Aproximace | Vykreslí se první operand; počet je hlášen jako `fallbackGeometryCount`. |
| Křivky, text, anotace a ostatní neuvedené položky | Nevykresleno | Typ se objeví v `unsupportedRepresentationTypes`, pokud je součástí tělové reprezentace produktu. |
| `Axis`, `FootPrint`, `BoundingBox`, `Curve2D`, anotace | Záměrně vynecháno | Pomocné reprezentace nejsou součástí objemového 3D zobrazení. |
| `IfcOpeningElement`, `IfcSpace` | Záměrně skryto | Nevykreslují se jako plná tělesa, aby nezakrývala stavební prvky. |

## Diagnostické údaje

- `productCount` – počet viditelných produktů nalezených v IFC.
- `renderedElementCount` – počet unikátních produktů s přijatou geometrií.
- `elementsWithoutGeometry` – produkty bez tělové geometrie nebo jen s
  nepodporovanými položkami.
- `unsupportedRepresentationTypes` – unikátní typy položek, které pipeline
  neuměla převést.
- `fallbackGeometryCount` – počet obecných CSG výsledků zobrazených pouze
  pomocí prvního operandu.
- `exactBooleanDifferenceCount` – počet přesně vyhodnocených 2D rozdílů.
- `outlierItemCount` – části vynechané ochranou proti extrémním chybným
  souřadnicím.
- `recursionLimitCount` a `invalidReferenceCount` – poškozené či nadměrně
  vnořené reprezentační stromy.
- `geometryWarningCount` – souhrnný počet výše uvedených varování.

Diagnostika měří schopnosti vykreslení, nikoli shodu IFC se schématem. Kontrola
IFC × IDS je oddělená a nadále pracuje s datovými entitami a vlastnostmi i u
produktů, jejichž geometrie se ve vieweru nevykreslí.
