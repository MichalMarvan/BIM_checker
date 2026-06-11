# Plán: slučování meshů per model+materiál (3D viewer, „200+ souborů")

Datum: 2026-06-11 · Stav: NAPLÁNOVÁNO (provedeme po odsouhlasení, samostatná etapa)

## Proč

Každý model dnes renderuje ~2 draw cally na element (mesh + obrysové hrany).
D214 ≈ 404 draw callů; 200 modelů ≈ 80 000 draw callů — neudržitelné. Cíl:
~5–15 draw callů na model nezávisle na počtu elementů, tzn. 200 modelů
≈ 1–3 tisíce draw callů.

Doprovodná opatření už hotová (2026-06-11): kompaktace entity indexu po
stavbě geometrie a LOD na obrysové hrany (budget 1200 linesetů).

## Princip

Jeden `THREE.Mesh` na (model × materiál/barva) s merged `BufferGeometry`:

1. **Merge:** při addModel se per-element geometrie konkatenují do velkých
   bufferů podle barvy/materiálu. Vedle `position/normal` se přidá atribut
   `elementIndex` (Uint16/Uint32 per vertex) a tabulka
   `elementTable: [{ expressId, ifcType, vertexStart, vertexCount, bbox }]`.
2. **Picking:** raycast vrací `face` → `faceIndex × 3` → vertex →
   `elementIndex` atribut → záznam v elementTable. Žádné per-mesh objekty.
3. **Selekce/hover:** druhý malý dynamický mesh („overlay extract"): při
   výběru se z merged bufferu zkopíruje rozsah vybraného elementu do
   overlay geometrie s highlight materiálem (orange/hover blue). Kopie je
   levná (subarray slice), overlay se zahodí při deselect. Žádné
   přebarvování sdílených materiálů → odpadá i třída bugů s origColor.
4. **Skrýt/izolovat/průhlednost per element:** per-vertex atribut
   `visibility` (float 0/1, případně alpha) + custom onBeforeCompile chunk
   v materiálu (discard / alpha násobení). Update = zápis do subarray +
   `attribute.needsUpdate`. Per-model viditelnost zůstává přes group.
5. **Hrany:** EdgesGeometry per element se merguje stejně (jeden LineSegments
   na model) se stejným `elementIndex` atributem; LOD pak skrývá celé
   modely, ne linesety.

## Dopady na existující API (musí zůstat funkční)

- `selectAt`/`pickEntity`/`pickInBox` — nová implementace nad elementTable
  (bbox testy z tabulky místo per-mesh bboxů).
- `hideEntities/isolateEntities/showAll/setEntityOpacity` — zápis do
  visibility atributu místo `mesh.visible`.
- `findSameTypeIds`, `focusEntity` (bbox z elementTable), `getEntityMeta` —
  beze změny principu.
- Měření/řezy/snap (`_raycastFull`, edgeGeom cache) — raycast vrací merged
  mesh; per-element edge geometrie pro snap se generuje on-demand
  z rozsahu v merged bufferu.
- Selection edges overlay (`_ensureSelectionEdgesFor`) — nahrazuje overlay
  extract z bodu 3.
- X-ray výběr skrz geometrii (uložený nápad) se implementuje na overlay
  meshi (depthTest false) — zapadá do téhle architektury zadarmo.

## Etapy (každá samostatně ověřitelná v živém vieweru)

1. Merge + elementTable + picking (selectAt/hover) — bez hide/opacity.
   Featureflag `mergedGeometry: true` v options enginu, starý kód zůstává.
2. Selekce/hover overlay extract + entity bar end-to-end.
3. Visibility/alpha atribut: hide, isolate, show-all, opacity slider.
4. Merged hrany + LOD přepnutí na per-model.
5. Box-select, měření, řezy, walk-mode kolize nad elementTable; smazání
   staré per-mesh cesty + úklid.

Odhad: etapy 1–3 jsou jádro (~většina práce), 4–5 dotažení. Ověřování:
živý Chrome MCP workflow s D214 + heap/draw-call měření před–po.

## Rizika

- Překročení 65k vertexů → elementIndex Uint32 + index buffer Uint32 (OK ve
  WebGL2), pozor na `mergeVerticesInPlace`.
- Per-element materiálové vlastnosti (průhlednost jednotlivce) přes atribut,
  ne materiál — nutný onBeforeCompile patch DEFAULT_MATERIAL i edge materiálu.
- Velké modely: merge buffer alokace špičkově ~2× geometrie — stavět po
  blocích (streaming concat).
