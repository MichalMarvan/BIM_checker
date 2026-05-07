# Phase 1 — IDS Validation Correctness & XSD

**Status:** Approved (design phase)
**Date:** 2026-05-08
**Author:** Michal Marvan (with Claude)

## Goal

Sjednotit dva paralelní IDS parsery, doplnit chybějící podporu pro IDS 1.0 features (subtype dědičnost, predefinedType matching), a integrovat XSD validaci proti oficiálnímu buildingSMART schématu. Po dokončení bude validátor spec-compliant a uživatelé dostanou okamžitou zpětnou vazbu o syntaktické správnosti svých IDS souborů.

## Motivation

Dnešní stav:
- `parser.js` (stránka *IDS Parser & Visualizer*) a `validator.js` (stránka *IDS-IFC Validator*) mají **vlastní implementaci** parsování IDS XML. Implementace se rozcházejí — validátor např. neumí `xs:enumeration`, což vedlo k tichému selhání validace v reálných IDS souborech.
- `checkEntityFacet` ve validation engine kontroluje jen **přesnou shodu** názvu třídy. IDS 1.0 standard očekává **subtype dědičnost** (např. `IFCWALL` v applicability má matchovat i `IFCWALLSTANDARDCASE`).
- `predefinedType` v IDS facetech je parsovaný, ale validátor ho při matchování **ignoruje** — uživatel s IDS spoléhajícím se na specifické hodnoty `PredefinedType` dostane false-positive matche.
- Aplikace **nemá XSD validaci**. Vadné IDS soubory (chybný atribut, nepovolená hodnota cardinality, missing element) se načtou bez varování a chyby se projeví až při použití v jiných nástrojích.

Důsledek pro uživatele: validátor produkuje nesprávné výsledky a tvorba IDS v editoru může vést k souborům, které jiné toolchainy odmítnou.

## Non-Goals

- Editace IFC entit (PredefinedType je read-only).
- Auto-oprava invalidního IDS (jen reportujeme chyby).
- Vlastní validační pravidla mimo IDS 1.0 schéma.
- IFC5 podpora (bSMART zatím nevydal schéma).
- Subtype dědičnost pro property/attribute facety (jen pro entity).

## Architecture

### Files

```
assets/
├── data/
│   ├── ifc-hierarchy-IFC2X3.json   # NEW: subtype tree + PredefinedType pos
│   ├── ifc-hierarchy-IFC4.json     # NEW
│   ├── ifc-hierarchy-IFC4X3.json   # NEW
│   └── ids-1.0.xsd                 # NEW: oficiální buildingSMART schéma
├── js/
│   ├── common/
│   │   ├── ids-parser.js           # NEW: sjednocený IDS parser (IDSParser ns)
│   │   ├── ids-xsd-validator.js    # NEW: wrapper kolem xmllint-wasm
│   │   ├── ifc-hierarchy.js        # NEW: lazy loader hierarchie
│   │   ├── ifc-params.js           # NEW: split/unwrap helpers
│   │   └── validation-engine.js    # MOD: subtype + predefinedType matching
│   ├── parser.js                   # MOD: deleguje na IDSParser
│   ├── validator.js                # MOD: deleguje na IDSParser, smaže duplicitní parser
│   └── vendor/
│       ├── xmllint-wasm.js         # NEW: WASM loader (~700 KB gzip)
│       └── xmllint.wasm            # NEW: WebAssembly binary
└── pages/
    ├── ids-parser-visualizer.html  # MOD: load common/ids-parser.js + XSD UI
    └── ids-ifc-validator.html      # MOD: load common/ids-parser.js + XSD UI

scripts/
└── generate-ifc-hierarchy.cjs      # NEW: dev tool — generuje JSON z EXPRESS schémat
```

### Component dependencies

```
parser.js ────┐
              ├──→ common/ids-parser.js  (čistá knihovna, žádné DOM side-effects)
validator.js ─┤
              ├──→ common/validation-engine.js ──→ common/ifc-hierarchy.js → data/*.json
              │                                 ├→ common/ifc-params.js
              └──→ common/ids-xsd-validator.js ──→ vendor/xmllint-wasm.js + data/ids-1.0.xsd
```

Klíčové vlastnosti:
- `IDSParser` je čistá knihovna — vstup `XMLDocument` / `xmlString`, výstup data objekt, žádné event listenery.
- `IFCHierarchy` drží lazy-loaded mapy. API: `load`, `isSubtypeOf`, `getSubtypes`, `getPredefinedTypeIndex`, `getObjectTypeIndex`.
- `IDSXSDValidator` async API: `validate(xmlString) → Promise<{valid, errors}>`. WASM se loadne až při prvním volání.
- Backward compat: data shape z `IDSParser.parse()` je shodný s tím, co dnes vrací `parser.js` → editor (`convertParsedDataToIDSData`) zůstává nezměněný.

## IFC Hierarchy Data

### JSON format (jeden soubor per IFC verze)

```json
{
  "schemaVersion": "IFC4",
  "generatedFrom": "https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/...",
  "generatedAt": "2026-05-08T12:00:00Z",
  "classes": {
    "IFCROOT":              { "parent": null,                 "predefinedTypeIndex": null, "objectTypeIndex": null },
    "IFCOBJECTDEFINITION":  { "parent": "IFCROOT",            "predefinedTypeIndex": null, "objectTypeIndex": null },
    "IFCWALL":              { "parent": "IFCBUILTELEMENT",    "predefinedTypeIndex": 8,    "objectTypeIndex": 4 },
    "IFCWALLSTANDARDCASE":  { "parent": "IFCWALL",            "predefinedTypeIndex": 8,    "objectTypeIndex": 4 }
  }
}
```

`objectTypeIndex` se vyplní jen u tříd s `predefinedTypeIndex` (jinak nadbytečné).

Velikost odhadem: ~50–62 KB raw / ~8–10 KB gzip per verze.

### Generator script

`scripts/generate-ifc-hierarchy.cjs` (Node.js, dev tool):

1. Stáhne EXPRESS schéma z `https://standards.buildingsmart.org/IFC/RELEASE/<version>/...`
2. Parsuje regex pravidly (EXPRESS má fixní formát `ENTITY ... SUBTYPE OF (...) ... END_ENTITY`)
3. Pro každou ENTITY extrahuje parent + pozici `PredefinedType` atributu
4. Vyplivne `assets/data/ifc-hierarchy-<version>.json`

CLI: `node scripts/generate-ifc-hierarchy.cjs --version IFC4 --output assets/data/`

V repu jsou commitnuté **vygenerované JSON soubory**; stažené `.exp` soubory jsou gitignored build artifacts.

### IFCHierarchy module API

```js
window.IFCHierarchy = {
    load(version),                    // Promise<void> — lazy fetch + cache
    isSubtypeOf(version, child, ancestor),  // bool — chodí parent chain
    getSubtypes(version, cls),        // string[] — transitivní (vč. cls samotné)
    getPredefinedTypeIndex(version, cls),   // number | null
    getObjectTypeIndex(version, cls)        // number | null
};
```

Implementace:
- Při `load(version)` načte JSON, postaví inverzní index `parent → [children]`, nakešuje.
- `isSubtypeOf` chodí parent chain (O(hloubka stromu) ≈ 5–10 kroků).
- `getSubtypes` udělá BFS jednou per (version, cls), nakešuje výsledek.

## Unified IDS Parser

### `IDSParser` API (assets/js/common/ids-parser.js)

```js
window.IDSParser = (function() {
    return {
        parse,                  // (xmlString) → { info, specifications, error }
        parseDocument,          // (xmlDoc) → { info, specifications }
        extractInfo,            // (xmlDoc) → info
        extractSpecifications,  // (xmlDoc) → spec[]
        extractFacets,          // (facetsElement) → facet[]
        extractFacet,           // (element, type) → facet
        extractValue,           // (element) → value object
        extractRestriction      // (restrictionElement) → restriction object
    };
})();
```

### Output data shape

```js
// IDSParser.parse(xmlString) →
{
    info: { title, copyright, version, description, author, date, purpose, milestone },
    specifications: [
        {
            name, ifcVersion, identifier, description, instructions,
            minOccurs, maxOccurs,                  // z <applicability>
            applicability: [facet, ...],
            requirements: [facet, ...]
        }
    ],
    error: null | { message: string, line?: number }
}
```

Facet (entity příklad):
```js
{
    type: 'entity',
    name: { type: 'enumeration', values: ['IFCWALL', ...] },
    predefinedType: { type: 'simple', value: 'STANDARD' },
    cardinality: 'required',
    uri: 'https://...'
}
```

### Refactor

`parser.js` (~1300 → ~700 řádků):
- Smaže lokální `extractInfo`, `extractSpecifications`, `extractFacets`, `extractFacet`, `extractValue`, `extractRestriction`.
- Volá `IDSParser.parse(xmlString)`.
- Zůstane jako page-glue pro display (tabs, tree view, raw XML, info section).

`validator.js` (-276 řádků):
- Smaže lokální parser (řádky 223–360).
- Volá `IDSParser.parse(xmlString)`.

HTML stránky přidají skript:
```html
<script src="../assets/js/common/ids-parser.js"></script>
<!-- před parser.js / validator.js -->
```

### Backward compat test

Před commitem refaktoru:
1. Načti všech 6 vzorových IDS (test-data + tvé `1_Datový standard/*.ids`).
2. Naparuj starým `parser.js` → výsledek A.
3. Naparuj novým `IDSParser` → výsledek B.
4. `JSON.stringify(A) === JSON.stringify(B)` (po normalizaci pořadí klíčů).

Selhání blokuje refaktor.

## Validation Engine Changes

### `checkEntityFacet` (subtype + predefinedType)

```js
function checkEntityFacet(entity, facet, ctx) {
    // ctx = { hierarchy, splitParams: cached lazy splitter }
    if (!facet.name) return true;

    const targetClasses = collectTargetClasses(facet.name);
    if (targetClasses === null) return false;

    if (!matchEntityClass(entity.entity, targetClasses, ctx.hierarchy, facet.name)) return false;

    if (facet.predefinedType) {
        return checkPredefinedType(entity, facet.predefinedType, ctx);
    }

    return true;
}

function matchEntityClass(entityClass, targets, hierarchy, facetName) {
    if (facetName.type === 'restriction' && facetName.isRegex) {
        return new RegExp(facetName.pattern).test(entityClass);
    }
    for (const target of targets) {
        if (hierarchy.isSubtypeOf(entityClass, target)) return true;
    }
    return false;
}

function collectTargetClasses(facetName) {
    if (facetName.type === 'simple') return [facetName.value];
    if (facetName.type === 'enumeration') return facetName.values;
    if (facetName.type === 'restriction' && facetName.isRegex) return ['__regex__'];
    return null;
}
```

### `checkPredefinedType`

```js
function checkPredefinedType(entity, facetPredef, ctx) {
    const idx = ctx.hierarchy.getPredefinedTypeIndex(entity.entity);
    if (idx === null) return false;

    const params = ctx.splitParams(entity);
    let actual = unwrapEnumValue(params[idx]);  // ".STANDARD." → "STANDARD"

    if (actual === 'USERDEFINED') {
        const objTypeIdx = ctx.hierarchy.getObjectTypeIndex(entity.entity);
        if (objTypeIdx !== null) {
            actual = unwrapString(params[objTypeIdx]);  // 'CustomType' → CustomType, $ → null
        }
    }

    if (actual === null) return false;

    if (facetPredef.type === 'simple') return actual === facetPredef.value;
    if (facetPredef.type === 'enumeration') return facetPredef.values.includes(actual);
    if (facetPredef.type === 'restriction' && facetPredef.isRegex) {
        return new RegExp(facetPredef.pattern).test(actual);
    }
    return false;
}
```

### `IfcParams` helpers (assets/js/common/ifc-params.js)

```js
window.IfcParams = {
    splitIfcParams,    // "a,b,(c,d),'h,i'" → ["a","b","(c,d)","'h,i'"]
                       // respektuje vnořené závorky a stringy
    unwrapEnumValue,   // ".STANDARD." → "STANDARD", $ → null
    unwrapString       // "'text'" → "text", $ → null
};
```

### `validateBatch` integrace

```js
async function validateBatch(entities, spec) {
    await IFCHierarchy.load(spec.ifcVersion);
    const ctx = {
        hierarchy: IFCHierarchy.forVersion(spec.ifcVersion),
        splitParams: memoize(IfcParams.splitIfcParams)
    };

    const result = { specification: spec.name, status: 'pass', passCount: 0, failCount: 0, entityResults: [] };

    for (const entity of entities) {
        if (!matchesApplicability(entity, spec.applicability, ctx)) continue;
        const entityResult = validateEntity(entity, spec.requirements, spec.name, ctx);
        result.entityResults.push(entityResult);
        if (entityResult.status === 'pass') result.passCount++;
        else { result.failCount++; result.status = 'fail'; }
    }
    return result;
}
```

`hierarchy.load(version)` se volá jednou per spec; druhé volání se stejnou verzí hit cache.

## XSD Validation

### `IDSXSDValidator` (assets/js/common/ids-xsd-validator.js)

```js
window.IDSXSDValidator = (function() {
    let initPromise = null;
    let xmllint = null, xsdText = null;

    async function init() {
        if (initPromise) return initPromise;
        initPromise = (async () => {
            const [lib, xsd] = await Promise.all([
                import('../vendor/xmllint-wasm.js'),
                fetch('../../data/ids-1.0.xsd').then(r => r.text())
            ]);
            xmllint = lib.default;
            xsdText = xsd;
        })();
        return initPromise;
    }

    async function validate(xmlString) {
        await init();
        const out = await xmllint({
            xml:    [{ fileName: 'doc.ids',     contents: xmlString }],
            schema: [{ fileName: 'ids-1.0.xsd', contents: xsdText }]
        });
        return {
            valid:  out.errors.length === 0,
            errors: out.errors.map(parseErrorLine)
        };
    }

    function parseErrorLine(raw) {
        // libxml2: "doc.ids:42:0: element foo: Schemas validity error : ..."
        const m = raw.match(/^[^:]+:(\d+):(\d+):\s*(\w+):\s*(.+)$/);
        return m
            ? { line: parseInt(m[1]), column: parseInt(m[2]), severity: m[3], message: m[4].trim() }
            : { line: null, column: null, severity: 'error', message: raw };
    }

    return { init, validate };
})();
```

### PWA precache

`sw.js` musí přidat:
```js
'/assets/js/vendor/xmllint-wasm.js',
'/assets/js/vendor/xmllint.wasm',
'/assets/data/ids-1.0.xsd',
'/assets/data/ifc-hierarchy-IFC2X3.json',
'/assets/data/ifc-hierarchy-IFC4.json',
'/assets/data/ifc-hierarchy-IFC4X3.json',
```

## UI Integration

### IDS Parser & Visualizer (`pages/ids-parser-visualizer.html`)

**Banner** mezi nadpisem „📋 IDS Specifikace" a `.tabs`:

```html
<div id="xsdValidationBanner" class="xsd-banner" style="display:none">
    <div class="xsd-banner-summary">
        <span class="xsd-banner-icon">⚠️</span>
        <span class="xsd-banner-text" data-i18n-key="xsd.banner.errors">
            Soubor má <strong>3</strong> chyby proti IDS 1.0 schématu
        </span>
        <button class="xsd-banner-toggle">Zobrazit detaily ▾</button>
    </div>
    <ul class="xsd-banner-details" hidden>
        <li><a data-line="14">Řádek 14:</a> Attribute 'foo' is not allowed.</li>
    </ul>
</div>
```

Banner je viditelný na všech 4 záložkách.

**Klik na řádkový odkaz** přepne na záložku Raw XML, scrolluje a zvýrazní řádek na ~3 s. `<pre id="rawXML">` při renderu obalí každý řádek `<span id="xml-line-N">`.

**Export modal** (po kliku „💾 Stáhnout IDS" nebo „📤 Export Excel" když invalid):

```html
<div id="xsdExportModal" class="modal-overlay">
    <div class="modal-container">
        <div class="modal-header"><h2>⚠️ IDS má chyby proti schématu</h2><button class="modal-close">&times;</button></div>
        <div class="modal-body">
            <p>Soubor obsahuje <strong>2 chyby</strong> proti oficiálnímu IDS 1.0 schématu:</p>
            <ul class="xsd-error-list">
                <li><strong>Řádek 14:</strong> Attribute 'foo' is not allowed.</li>
            </ul>
            <p>Můžeš pokračovat se stažením, ale soubor nebude validní podle IDS 1.0.</p>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary">Zrušit</button>
            <button class="btn btn-primary">Stáhnout přesto</button>
        </div>
    </div>
</div>
```

### IDS-IFC Validator (`pages/ids-ifc-validator.html`)

**Inline indikátor** vedle názvu IDS souboru ve validační skupině:

```
📦 Validační skupina 1
├─ IDS: Kontrola_datoveho_standardu_IFC4X3_ADD2.ids  ⚠️ (3 chyby v schématu)  [detail]
├─ IFC: model.ifc
```

Klik na „[detail]" rozbalí seznam chyb pod soubor.

**Souhrnný banner** nad seznamem skupin (jen když existují chyby):

```
⚠️ 1 ze 3 IDS souborů má chyby proti schématu  [Zobrazit detaily]
```

### CSS

Přidá se do `assets/css/ids-parser.css` a `ids-validator.css`:

```css
.xsd-banner {
    background: var(--warning-light, #fef3c7);
    border-left: 4px solid var(--warning, #f59e0b);
    border-radius: 4px;
    padding: 12px 16px;
    margin-bottom: 16px;
}
.xsd-banner-summary { display: flex; align-items: center; gap: 12px; }
.xsd-banner-toggle { margin-left: auto; background: none; border: none; color: var(--warning-dark, #92400e); cursor: pointer; }
.xsd-banner-details { margin-top: 8px; padding-left: 28px; font-size: 0.9em; }
.xsd-banner-details a { color: var(--warning-dark, #92400e); cursor: pointer; text-decoration: underline; }
.xml-line-highlight { background: #fef08a; transition: background 3s ease-out; }
.xsd-error-list { margin: 12px 0; padding-left: 24px; }
.xsd-error-list li { margin-bottom: 6px; line-height: 1.5; }
```

### i18n keys (CZ + EN, `translations.js`)

```
xsd.banner.errors            "Soubor má {n} chyb proti IDS 1.0 schématu"
xsd.banner.singleError       "Soubor má 1 chybu proti IDS 1.0 schématu"
xsd.banner.toggleShow        "Zobrazit detaily ▾"
xsd.banner.toggleHide        "Skrýt detaily ▴"
xsd.banner.line              "Řádek {n}:"
xsd.export.title             "IDS má chyby proti schématu"
xsd.export.intro             "Soubor obsahuje {n} chyb proti oficiálnímu IDS 1.0 schématu:"
xsd.export.warning           "Můžeš pokračovat se stažením, ale soubor nebude validní podle IDS 1.0."
xsd.export.cancel            "Zrušit"
xsd.export.proceed           "Stáhnout přesto"
xsd.validator.fileBadge      "{n} chyb v schématu"
xsd.validator.summaryBanner  "{badCount} z {totalCount} IDS souborů má chyby proti schématu"
```

## Testing

### Existing infra

Custom Jasmine-like framework (`tests/test-framework.js`) běžící přes Puppeteer headless. 280 stávajících testů musí dál procházet.

### Nové unit testy (~30, v `tests/test-suites/`)

| Soubor | Kryje |
|--------|-------|
| `ids-parser-unified.test.js` | `IDSParser.parse` pro všechny tvary (simple, enum, regex), facet typy, edge cases |
| `ids-parser-backward-compat.test.js` | Output `IDSParser` === output starého `parser.js` (snapshot na 6 vzorových IDS) |
| `ifc-hierarchy.test.js` | `load`, `isSubtypeOf` (transitivní), `getSubtypes`, `getPredefinedTypeIndex`, edge cases |
| `ifc-params.test.js` | `splitIfcParams` (čárky v stringu, vnořené závorky, escape), `unwrapEnumValue`, `unwrapString` |
| `validation-subtype.test.js` | `IFCWALL` chytí `IFCWALLSTANDARDCASE`; `IFCBUILTELEMENT` chytí 50+ podtypů; regex bez dědičnosti |
| `validation-predefinedtype.test.js` | `.STANDARD.` matchuje, `.USERDEFINED.` + ObjectType matchuje, `$` (null) nematchuje |
| `xsd-validator.test.js` | Validní IDS → 0 errors; invalid → konkrétní řádkové chyby |
| `xsd-validator-lazy.test.js` | První volání init, druhé bez init znovu (cache hit) |

### End-to-end test

Rozšíří `integration-real-files.test.js`:
- Načti `Kontrola_datoveho_standardu_IFC4X3_ADD2.ids`
- Validuj proti `DSPS_Vzorek_dat_4x3_..._Koleje_koor_BIM.ifc`
- Očekávej: 38 entityResults pro spec „DS_Element" (matchují IFCBUILDINGELEMENTPROXY)
- Pass/fail dle existence DS_Standard.DS_Element property

## Implementation Order

5 kroků s commit checkpoints:

### Krok 1 — Sjednocení parserů (B)
- `assets/js/common/ids-parser.js` (extrahovaný kód)
- `parser.js` + `validator.js` delegují
- `+ ids-parser-unified.test.js`
- `+ ids-parser-backward-compat.test.js`
- ✓ Checkpoint: 280+ stávajících testů projde, output shape bit-shodný s dnes

### Krok 2 — IFC hierarchy data + modul
- `scripts/generate-ifc-hierarchy.cjs`
- `assets/data/ifc-hierarchy-{IFC2X3,IFC4,IFC4X3}.json`
- `assets/js/common/ifc-hierarchy.js`
- `+ ifc-hierarchy.test.js`
- ✓ Checkpoint: lookups < 5 ms warm, < 100 ms cold

### Krok 3 — Subtype + PredefinedType matching (A + C)
- `assets/js/common/ifc-params.js`
- Update `checkEntityFacet` ve `validation-engine.js` + `validator.js`
- `+ ifc-params.test.js`, `validation-subtype.test.js`, `validation-predefinedtype.test.js`
- Rozšíření `integration-real-files.test.js`
- ✓ Checkpoint: tvé IDS proti tvým IFC dá očekávané výsledky

### Krok 4 — XSD validace (1)
- `assets/js/vendor/xmllint-wasm.js` + `xmllint.wasm`
- `assets/data/ids-1.0.xsd`
- `assets/js/common/ids-xsd-validator.js`
- UI integrace v parser-visualizer.html + validator.html
- Update `sw.js` (PWA precache)
- `+ xsd-validator.test.js` + `xsd-validator-lazy.test.js`
- ✓ Checkpoint: invalid → bannér, valid → ticho; export modal blokuje s override; vše funguje offline

### Krok 5 — i18n + polish
- CZ + EN klíče v `translations.js`
- Manual smoke test všech flow
- Update PLAN.md (mark položky 1, A, B, C done)
- Update CHANGELOG
- ✓ Checkpoint: ready k merge

Každý krok je samostatný commit (případně PR), takže rollback je snadný.

## Acceptance Criteria

### Funkční

- 280+ existujících testů projde bez regrese
- ~30 nových testů přidáno, všechny projdou
- Tvé IDS `IFC4X3_ADD2` proti tvým IFC souborům dá smysluplné výsledky (validace IFCBUILDINGELEMENTPROXY entit proti DS_Standard psetu)
- IDS s `<simpleValue>IFCWALL</simpleValue>` (bez explicitního výčtu podtypů) chytí i `IFCWALLSTANDARDCASE`
- IDS s `<predefinedType>STANDARD</predefinedType>` filtruje jen entity s `.STANDARD.` (nebo `.USERDEFINED.` + ObjectType=STANDARD)
- Invalid IDS → bannér s konkrétními řádkovými chybami; klik na řádek skočí do Raw XML
- Export invalidního IDS → modální dialog s možností „Stáhnout přesto" override
- Vše funguje offline (PWA precache zahrnuje WASM + XSD + hierarchy JSONy)

### Performance

- `IDSParser.parse(60 KB)` < 50 ms
- `IFCHierarchy.load`: < 100 ms cold, < 5 ms warm
- `IDSXSDValidator.validate(60 KB)`: < 500 ms cold (vč. WASM init), < 200 ms warm
- Žádná regrese v IFC parsingu (kód netknutý)

### i18n

- Všechny nové stringy v `translations.js` pro CZ + EN
- Re-render při přepnutí jazyka funguje (XSD bannér i modal)

## Rollback Plan

Každý ze 5 kroků je samostatný commit. Selhání v kroku N → rollback commit, návrat do stavu po kroku N-1. Žádný krok nezávisí na nedokončených změnách budoucích kroků (kromě rozšíření end-to-end testu v kroku 3, který předpokládá hotovou hierarchii z kroku 2).

Specifické riziko: refaktor parserů v kroku 1 by mohl změnit výstupní data shape a rozbít editor. Mitigation: backward-compat snapshot test jako gate před commitem.

## Future Work (mimo Phase 1)

- IFC5 podpora (až bSMART vydá schéma)
- Subtype matching pro property/attribute facety
- Auto-suggest fix při XSD chybě (přesun do Phase X)
- Editace `PredefinedType` v IFC editoru (přesun do Phase 2 — IFC viewer editing)
