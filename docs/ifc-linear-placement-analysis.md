# Analýza IfcLinearPlacement — linear-placement-of-signal

**Verdikt (2026-10-30): v tomto modelu je správnější CartesianPosition a současný
výstup našeho enginu.** Nezávislá integrace podle parametrů IFC4.3 se u všech
23 referentů a 2 signálů shoduje s jejich polohou do **0,000160 mm** (0,16 µm).
Web-ifc 0.0.78 se v poloze liší až o **14,894436 mm** a navíc nezachovává
výchozí sklon rámce podle nivelety. V rámci této analýzy se produkční kód,
testy ani výstup geometrie nemění; zvýšení verze cache není potřeba.

Vstup: `~/shared/buildingsmart/IFC4.x-specification-models/models/alignment-geometries-and-linear-positioning/linear-placement-of-signal/linear-placement-of-signal.ifc`,
schéma `IFC4X3_ADD2`, metry a radiány. SHA-256:
`3c6b97f7a82f1a1d114233702e876f387a03701be0d8a621685e5773ce664c97`.
Repo modelů: `ef22440ec501551ccc9689309560bbc7e26aa9d7`;
engine při měření: `0250280a59672c42a0edc401650ef1b2c856753b`.

**Cesta enginem.** [geometry/placement.js](../assets/js/3d/ifc-engine/geometry/placement.js)
(`resolvePlacement`, ř. 77) dispatchuje `IFCLINEARPLACEMENT` do
[alignment/linear-placement.js](../assets/js/3d/ifc-engine/alignment/linear-placement.js)
(`resolveLinearPlacement`, ř. 63): nejprve čte třetí atribut `CartesianPosition`,
sestaví matici a připojí rodičovský placement. Jen při absenci cache volá
`evalPointByDistance` → `getCurveEval` v
[curve-evaluator.js](../assets/js/3d/ifc-engine/alignment/curve-evaluator.js).
Ten vyhodnocuje geometrické `IfcCurveSegment` s rodiči Line/Circle/Clothoid
a zvlášť niveletu. `ifc-alignment-parser.js::findStationOffset` řeší staniční
popisky, nikoli tuto produktovou matici.

Komentář „Priorita dle spec“ v `linear-placement.js` není přesný: specifikace
označuje CartesianPosition za volitelný fallback pro aplikace nepodporující
lineární umístění; neurčuje mu obecnou přednost před RelativePlacement.
Naměřená shoda potvrzuje tuto konkrétní cache, ne všechny exportéry.
[IfcLinearPlacement](https://github.com/buildingSMART/IFC4.x-development/blob/d71e1407e12d0b5196160ad5bb172f53985a14ee/docs/schemas/resource/IfcGeometricConstraintResource/Entities/IfcLinearPlacement.md)

**Nezávislý výpočet.** Použit vlastní jednoduchý STEP reader a vlastní matematika
nad business parametry `IfcAlignmentHorizontalSegment` a
`IfcAlignmentVerticalSegment`, nikoli evaluátor enginu ani web-ifc.
Pořadí segmentů je z `IfcRelNests` (#2351, #2387), nulové terminátory vynechány.
Všech 25 PBDE odkazuje na gradient #2543, jeho BaseCurve je #2449.
Cant křivka #2594 se při těchto umístěních nepoužije. Rodiče
#2279 → #2274 → #2269 jsou identity. Souřadnice níže jsou IFC XYZ, Z nahoru,
bez MapConversion, centrování a CRS transformací.

Horizontála má 3 přímky, 2 kruhové oblouky (R = ±1000 m) a 4 klotoidy
(délka 40 m, geometrické konstanty A = ±200 m). Pro lokální délku u:

```text
k0 = R0 == 0 ? 0 : 1/R0;  k1 = R1 == 0 ? 0 : 1/R1
theta(u) = StartDirection + k0*u + (k1-k0)*u²/(2*SegmentLength)
X(u) = StartPoint.X + integral[0,u] cos(theta(t)) dt
Y(u) = StartPoint.Y + integral[0,u] sin(theta(t)) dt
```

R = 0 znamená nekonečný poloměr, kladné R zatáčení proti hodinovým ručičkám.
Integrály včetně klotoid spočteny kompozitním Simpsonem, krok nejvýše 0,01 m,
opakováno s 0,005 m, s kompenzovaným součtem. Jde o integraci Fresnelova typu
s obecnou počáteční křivostí, tedy i výběhových a pravotočivých přechodnic.
[Parametry segmentu](https://github.com/buildingSMART/IFC4.x-development/blob/d71e1407e12d0b5196160ad5bb172f53985a14ee/docs/schemas/resource/IfcGeometricConstraintResource/Entities/IfcAlignmentHorizontalSegment.md),
[rovnice křivosti a integrace](https://github.com/buildingSMART/IFC4.x-development/blob/d71e1407e12d0b5196160ad5bb172f53985a14ee/docs/schemas/resource/IfcGeometricConstraintResource/Types/IfcAlignmentHorizontalSegmentTypeEnum.md).

Niveleta obsahuje **CONSTANTGRADIENT a CIRCULARARC**, žádnou parabolu ani
svislou klotoidu. Výška začíná na 5 m; oblouk #2368 má R = −5000 m,
s = 478,004489216701–528,001989403655 m, následuje spád −0,01;
oblouk #2380 má R = +5000 m, s = 778,005739095076–828,003239282051 m,
za ním je výška 2 m. Pro u = s − StartDistAlong:

```text
konstantní spád: Z = StartHeight + StartGradient*u
kružnice: b0 = atan(StartGradient); q = sin(b0) + u/R
          Z = StartHeight + R*(cos(b0) - sqrt(1-q²))
          g = q/sqrt(1-q²)
```

Rozdíl kosinů byl numericky racionalizován. Použita vodorovná vzdálenost s,
protože parametrizaci gradientu určuje BaseCurve; délka svislého oblouku
není jeho HorizontalLength.
[IfcGradientCurve](https://github.com/buildingSMART/IFC4.x-development/blob/d71e1407e12d0b5196160ad5bb172f53985a14ee/docs/schemas/resource/IfcGeometryResource/Entities/IfcGradientCurve.md),
[IfcAlignmentVerticalSegment](https://github.com/buildingSMART/IFC4.x-development/blob/d71e1407e12d0b5196160ad5bb172f53985a14ee/docs/schemas/resource/IfcGeometricConstraintResource/Entities/IfcAlignmentVerticalSegment.md).

Pro PBDE: T = (cos(theta), sin(theta), g)/sqrt(1+g²),
L = (−sin(theta), cos(theta), 0), N = T × L;
P = (X,Y,Z) + OffsetLateral·L + OffsetVertical·N + OffsetLongitudinal·T.
OffsetLongitudinal je zde všude nula. Signál #3031 má offsety (−3; 2,5; 0) m
a v jeho místě je nulový spád; výsledek tedy nezávisí na sporu o globální
versus lokální svislý offset. Vzdálenosti v tabulce jsou **DistanceAlong**,
staniční popisek má posun −153,1 m, který se k PBDE nepřičítá.
[IfcPointByDistanceExpression](https://github.com/buildingSMART/IFC4.x-development/blob/d71e1407e12d0b5196160ad5bb172f53985a14ee/docs/schemas/resource/IfcGeometryResource/Entities/IfcPointByDistanceExpression.md).

**Pět vybraných poloh.** (a) CartesianPosition, (b) skutečný `resolvePlacement`,
(c) web-ifc `GetWorldTransformMatrix(model, placementId)`, (d) nezávislý výpočet.
(a) a (b) jsou u všech 25 prvků číselně totožné. Tabulka uvádí absolutní (d)
a odchylky ostatních vůči (d); Δ(c) = (c) − (d), chyby jsou eukleidovské.
API pro matice zde vrací přímo IFC Z-up, na rozdíl od Y-up mesh výstupu oracle.

| Prvek; DistanceAlong [m]; segment H/V | (d) X; Y; Z [m] | Chyba (a) = (b) [mm] | Δ(c) X; Y; Z [mm] | Chyba (c) [mm] |
| --- | --- | ---: | --- | ---: |
| Referent_009 #2838; 403,1; #2300/#2362 | 452648.854669122; 4539542.154971097; 5.000000000 | 0.000022 | −0.011043; +0.030161; 0 | 0.032119 |
| Referent_011 #2866; 503,1; #2307/#2368 | 452741.082747465; 4539580.705868489; 4.937021137 | 0.000001 | −0.831136; +1.618173; −0.387660 | 1.859987 |
| Referent_014 #2908; 653,1; #2314/#2374 | 452871.185817522; 4539655.094154090; 3.499038642 | 0.000159 | −5.785221; −3.847173; +0.141726 | 6.949072 |
| Referent_017 #2950; 803,1; #2335/#2380 | 452998.227513739; 4539734.744125304; 2.062017517 | 0.000004 | −12.173243; −6.724958; +0.180103 | 13.908463 |
| Route Indicator_02 #3031; 853,1; #2342/#2386 | 453043.983513166; 4539754.928637668; 4.500000000 | 0.000060 | −13.397644; −6.507485; 0 | 14.894436 |

**Proč oracle hlásí procenta.** Nový běh: 25 párů, 10 referentů nad 1 %,
žádný FILE_ERROR ani jednostranný produkt. U #2908 je vzdálenost středů bbox
14,487880 mm (1,405545 %), přestože chyba počátku placementu je 6,949072 mm.
Maximum bbox je u #2936: **19,478787 mm / 1,890378 %** při chybě počátku
11,963876 mm. Původní odhad „do 18 mm“ tedy tento běh mírně překračuje.
Procenta jsou vztažena k diagonále bbox, ne k délce alignmentu.

Ve zdroji web-ifc tagu 0.78 jsou dvě relevantní příčiny:

- `IFCGRADIENTCURVE` interpoluje niveletu podle délek vzorkovaných úseček;
  `getPlacementAtDistance` následně sčítá **3D** vzdálenosti bodů.
  To není přesná evaluace vodorovného parametru gradientu. Analytický přebytek
  šikmé délky vůči vodorovné za oběma oblouky je 14,166367 mm; naměřené
  podélné zpoždění na závěrečné přímce je přibližně 13,999812 mm.
  Zbytek není v této analýze rozdělen mezi jednotlivé chyby vzorkování.
  [IfcGeometryLoader.cpp](https://github.com/ThatOpen/engine_web-ifc/blob/4310503d8618a0870c2166f101471078d528f4c1/src/cpp/web-ifc/geometry/IfcGeometryLoader.cpp#L2449),
  [IfcCurve.cpp](https://github.com/ThatOpen/engine_web-ifc/blob/4310503d8618a0870c2166f101471078d528f4c1/src/cpp/web-ifc/geometry/representation/IfcCurve.cpp#L33).
- PBDE používá režim `GlobalZAxis`, který zploští X do vodorovné roviny.
  Při g = −0,01 chybí sklon přibližně 0,010 rad. U #2908 byla úhlová chyba
  X vůči analytické tečně 0,009999667 rad; naše cache souhlasí v numerické
  přesnosti. Výchozí RefDirection má být tečna a výchozí Axis její normála
  ve svislé rovině, proto tato odchylka ovlivňuje i bbox.
  [Volání režimu](https://github.com/ThatOpen/engine_web-ifc/blob/4310503d8618a0870c2166f101471078d528f4c1/src/cpp/web-ifc/geometry/IfcGeometryLoader.cpp#L4015),
  [IfcAxis2PlacementLinear](https://github.com/buildingSMART/IFC4.x-development/blob/d71e1407e12d0b5196160ad5bb172f53985a14ee/docs/schemas/resource/IfcGeometryResource/Entities/IfcAxis2PlacementLinear.md).

**Ověření a meze.** Všechen Node/Chromium/WASM běžel přes `tp-run` na ThinkPadu
(Node v22.21.0, web-ifc 0.0.78, CIRCLE_SEGMENTS=48, COORDINATE_TO_ORIGIN=false).
Nezávislý výpočet se zjemněním kroku změnil lokální konce segmentů nejvýše
o 1,18·10⁻¹⁰ mm; kontrola přímek a kružnic uzavřenými vzorci do 5,69·10⁻¹¹ mm.
Návaznost horizontálních segmentů z dat do 0,0000091 mm, výšková návaznost
do 7,6·10⁻¹¹ mm. Jde o numerické kontroly, nikoli důkaz takové fyzické přesnosti
vstupního modelu. Oba kroky daly u všech 25 bodů stejné XYZ v double přesnosti.

Surové výsledky jsou lokálně v
`test-results/ifc-diagnostics/linear-placement-analysis/{analysis.json,summary.json,oracle/}`
(ignorované Gitem); oracle obsahuje hash vstupu i modulů enginu a browserové
měření celé geometrie. Dočasné `.tmp-linear-*.mjs` byly po výpočtu odstraněny.
Standardní `node tests/run-tests.js` nebyl spuštěn, protože se mění pouze tento
dokument. Žádný commit nevznikl. Pozdější souběžné změny limitu velikosti STEP
(`index.js`, `step-parser.js`, `test-runner.html`, `step-text-limit.test.js`)
nejsou součástí této analýzy; měřený stav identifikují hashe v oracle.

Neověřeny jiné modely/exportéry, paraboly a svislé klotoidy (ve vstupu nejsou),
nenulový longitudinal offset, vertikální offset na svahu, cant placementy,
neidentické rodičovské transformace a jiné verze/nastavení web-ifc.
Nepotvrzuje se obecná správnost větve našeho enginu **bez CartesianPosition**:
ta například používá svislý rámec, přičítá longitudinal ke staničení a vertical
ke globálnímu Z. Pro tuto opravu nebyla splněna podmínka chyby současného
výstupu s cache; tuto širší větev proto neměníme.
