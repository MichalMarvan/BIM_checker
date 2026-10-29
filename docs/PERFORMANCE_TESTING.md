# Testování výkonu IFC a 3D vieweru

Automatický harness používá stejnou cestu jako uživatel: uloží IFC do IndexedDB, otevře 3D viewer a zavolá produkční načítání včetně parser workeru, geometrie a cache.

```bash
# Malé verzované fixture používané v CI
npm run test:performance

# Reálné velikostní profily
npm run test:performance -- ./corpus/model-50mb.ifc
npm run test:performance -- ./corpus/model-150mb.ifc
npm run test:performance -- ./corpus/model-500mb.ifc

# Federace deseti modelů
npm run test:performance -- ./corpus/federation/*.ifc
```

Report `test-results/performance-ifc.json` obsahuje pro každý model dobu do hotové geometrie, heap, draw calls, trojúhelníky, vzorek FPS a cenu 100 rychlých změn výběru. Souhrn obsahuje velikost regenerovatelné cache a paměť uvolněnou po odebrání všech modelů.

Výchozí limity jsou záměrně odstupňované podle velikosti vstupu. Pro stabilní dedikovaný benchmark je lze nastavit proměnnými:

- `PERF_MAX_FIXTURE_LOAD_MS` (výchozí 30 000),
- `PERF_MAX_50MB_LOAD_MS` (180 000),
- `PERF_MAX_150MB_LOAD_MS` (360 000),
- `PERF_MAX_500MB_LOAD_MS` (900 000),
- `PERF_MAX_HEAP_MB` (1 024).

Velké IFC soubory nejsou v repozitáři kvůli licenci a velikosti. Release kandidát se má testovat na interním licenčně ověřeném corpus; CI hlídá alespoň regresi celé produkční cesty na malém fixture.
