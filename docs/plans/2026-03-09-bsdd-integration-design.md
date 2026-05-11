# bSDD Integration into IDS Maker — Design

## Goal
Integrate buildingSMART Data Dictionary (bSDD) into the IDS Maker editor, allowing users to search and select classifications, properties, and materials from bSDD directly within facet modals. Selected items automatically get bSDD URI references in the generated IDS XML.

## Key Decisions
- **UX**: Custom autocomplete with optional dictionary filter dropdown per facet modal. No global settings.
- **Offline**: bSDD features require internet. Existing static lists in `ifc-data.js` remain as-is for offline/fallback.
- **URI handling**: Auto-attached when selected from bSDD, no URI for manual entries.
- **Scope**: Classification, Property, and Material facets. Entity/Attribute/PartOf not affected.

## bSDD API Endpoints Used
- Base: `https://api.bsdd.buildingsmart.org`
- `GET /api/Dictionary/v1` — list dictionaries for filter dropdown
- `GET /api/TextSearch/v2` — fulltext search across all/selected dictionaries
- `GET /api/Class/v1?uri=...` — class details + properties
- `GET /api/Class/Properties/v1?uri=...` — properties of a class
- `GET /api/Property/v4?uri=...` — property detail
- No authentication needed (read-only public endpoints)

## Architecture

### New file: `assets/js/ids/bsdd-api.js`
Service layer for bSDD API:
- `BsddApi.searchClasses(query, dictionaryUri?)` — fulltext class search
- `BsddApi.getClassDetails(classUri)` — class detail + properties
- `BsddApi.getDictionaries()` — dictionary list (cached for session)
- `BsddApi.searchProperties(query, dictionaryUri?)` — property search
- 300ms debounce on search calls
- In-memory cache per session (Map)

### Modified: `assets/js/ids/ids-editor-modals.js`
- **Classification facet**: Replace text input with custom bSDD autocomplete. Results show: class name, dictionary badge, code. Selection fills system + value + stores URI. Collapsible "Dictionary filter" above search.
- **Property facet**: Add bSDD autocomplete for PropertySet alongside existing datalist. After selecting a bSDD class, load its properties into baseName dropdown. Stores URI.
- **Material facet**: Add bSDD autocomplete for material value. Stores URI.

### Modified: `assets/js/ids/ids-xml-generator.js`
- When generating classification/property/material facets: if `uri` exists in facet data, add `uri="..."` attribute to the XML element.

### Modified: `assets/js/parser.js`
- When parsing IDS XML: read `uri` attribute from classification/property/material facets and include in data model.

### New UI component (within bsdd-api.js or separate)
Custom autocomplete dropdown:
- Text input with search icon
- Dropdown panel with results (name, dictionary badge, URI tooltip)
- Loading spinner during API calls
- "No results" / "Connection error" states
- Keyboard navigation (arrows, Enter, Escape)

### CSS changes: `assets/css/ids-editor-styles.css`
- Styles for custom autocomplete dropdown, dictionary filter, result items, loading states

## What Does NOT Change
- `ifc-data.js` static data
- Excel import/export (no URI support yet)
- Editor layout structure
- Entity, Attribute, PartOf facets
