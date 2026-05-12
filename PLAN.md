# BIM Checker – Plán práce

## Hotové (Done)

### Základní funkcionalita
- [x] IFC Multi-File Viewer s pokročilým vyhledáváním
- [x] IDS Parser a Vizualizér (strom, XML, regex vysvětlení)
- [x] IDS Editor (kompletní editor specifikací v prohlížeči)
- [x] IDS-IFC Validátor s Web Workers
- [x] PWA podpora (offline, instalace)
- [x] Bilingvální rozhraní CZ/EN
- [x] IndexedDB úložiště souborů
- [x] Cloudflare Pages deployment

### bSDD integrace
- [x] bSDD API service s cachingem a debounce
- [x] Autocomplete pro Classification, Property, Material
- [x] Searchable dictionary filter (350+ slovníků)
- [x] Cloudflare Pages proxy pro production bSDD API
- [x] Auto-transfer applicability → requirements
- [x] bSDD URI atribut v IDS XML (export i import)

### Excel roundtrip
- [x] Excel export/import všech facet typů
- [x] Requirements sheet pro classification/material/attribute
- [x] bSDD URI v Excel exportu
- [x] Šablona s Top 20 IFC4 property sets

### i18n (internacionalizace)
- [x] Kompletní překlad IDS editoru (modály, labels, chybové hlášky)
- [x] Překlad tooltipů na všech stránkách
- [x] Re-render editoru při přepnutí jazyka

### IDS validace correctness (Phase 1, 2026-05-08)
- [x] Sjednocení dvou paralelních IDS parserů do `assets/js/common/ids-parser.js`
- [x] IFC class hierarchy data + lazy-loaded `IFCHierarchy` modul (IFC2X3 / IFC4 / IFC4X3)
- [x] Subtype-aware applicability matching (`IFCWALL` chytí i `IFCWALLSTANDARDCASE` přes dědičnost)
- [x] PredefinedType matching včetně USERDEFINED + ObjectType fallback
- [x] XSD validace proti IDS 1.0 schématu přes xmllint-wasm
  - Bannér při importu, modální dialog před exportem, plně offline (PWA)
- [x] +50 nových testů (305 → 350)

### IFC Viewer — edit correctness (Phase 2, 2026-05-08)
- [x] Refaktor `applyModificationsToIFC` na tři jasně oddělené case (A edit / B add-prop / C create-pset)
- [x] Nová `IfcPsetUtils` knihovna (parsePsetHasProperties, addPropertyIdToPset, parsePropertyName, findPsetOnElement)
- [x] Případ B (přidat property do existujícího psetu na elementu) korektně rozšíří pset entitu místo vytvoření paralelního
- [x] Případ C izoluje nový pset (žádné sdílení s existujícím stejnojmenným)
- [x] Qto edit zachovává `IFCELEMENTQUANTITY` / `IFCQUANTITY*` entity types
- [x] +30 nových testů (350 → 380)

### In-app bug report (Phase 5, 2026-05-08)
- [x] Tlačítko 🐛 v navbaru všech 4 stránek
- [x] Modal s formulářem (název, popis, kroky k reprodukci)
- [x] Auto-attached metadata: app version, user agent, page path, language, timestamp, last 5 console errors
- [x] Cloudflare Pages Function `/api/bug-report` s origin check + rate limit (5/h, 20/d per IP) přes KV
- [x] GitHub Issues integrace (labels: bug-report, user-submitted, lang:cs|en)
- [x] Failsafe link na ruční GitHub issue creation
- [x] +17 nových testů

### IndexedDB compression (Phase 3a, 2026-05-08)
- [x] `Compression` modul nad native CompressionStream API (gzip)
- [x] Transparent compression v `StorageManager.addFile` + `getFileContent`
- [x] Backward compat přes magic-byte detection — legacy nezkomprimované soubory čitelné
- [x] Lazy migrace — staré soubory se zkomprimují při dalším save
- [x] Očekávaná úspora: 60–80 % místa v IndexedDB pro typické IFC
- [x] +21 nových testů

### IFC parser Web Worker (Phase 4, 2026-05-08)
- [x] Sjednocený `IFCParserCore` modul (sync pure parser, dual-context export)
- [x] Worker rewrite: 213 řádků → ~30 (thin PARSE wrapper)
- [x] Validator dispatchuje IFC parsing přes `WorkerPool` (4 paralelní workery)
- [x] Graceful fallback na main-thread, pokud worker init/parse selže
- [x] UI 60 FPS i během parsing — main thread je free
- [x] +19 nových testů (snapshot kompatibilita + worker integration)

### CLS hotfix (2026-05-08)
- [x] Validator empty-state přesunut z JS do statického HTML — eliminuje 0.19 layout shift na DOMContentLoaded
- [x] `pwaInstallBtn` rezervuje slot v navbaru přes `visibility: hidden` místo `display: none` — eliminuje 0.04 navbar wrap shift
- [x] CLS validatoru: 0.226 → 0.000 (Good); homepage 0.037 → 0.000; parser 0.040 → 0.003
- [x] `tests/cls-debug.js` — Puppeteer diagnostika pro budoucí CLS regrese

### Validation Presety (Phase 6, 2026-05-09)
- [x] `ValidationPresets` modul (localStorage CRUD + debounced last-session)
- [x] Pojmenované presety: save / load / delete + překryv konfirmace
- [x] Auto-restore last session na DOMContentLoaded (s CLS mitigací přes minHeight)
- [x] Reference podle jména souboru (verzování zadarmo via BIMStorage dedup)
- [x] Missing-file pily se ⚠️ markrem; auto-resolve při dodání souboru
- [x] +32 unit testů + 5 integračních testů

### AI chat infrastructure (Phase 7, 2026-05-09)
- [x] `chat-storage.js` modul — agents + threads + messages + settings v IndexedDB
- [x] 5 OpenAI-compatible provideři: Ollama (lokální), Google AI, OpenAI, OpenRouter, Custom
- [x] Streaming chat completion přes Server-Sent Events
- [x] Right-side chat panel s threads sidebarem + bottom-right kruhový launcher s popoverem oblíbených agentů
- [x] Settings modal s agent CRUD (provider, model, system prompt, temperature)
- [x] CZ + EN i18n (57 nových klíčů)
- [x] Mimo scope: tools / function calling (Phase 8+), 3D viewer integrace (Phase 9+)
- [x] +43 unit + integračních testů (518 → 527)

### AI tools / function calling (Phase 8, 2026-05-10) ✅
- [x] 15 tools (storage 2, validator 5, IDS 1, IFC 5, UI 2)
- [x] OpenAI function-calling protocol
- [x] Cross-page write tools via ValidationPresets last-session + `ai:applyLastSession` event
- [x] LRU cache (max 3) for parsed IFC files
- [x] Native confirm() for destructive ops (delete file, delete validation group)
- [x] Tool-call iteration loop in chat-panel (max 5 iterations)
- [x] Tool-call/result bubbles inline in chat
- [x] 56 new tests (527 → 583)

Branch: phase-8-ai-tools

## Phase 9a: User config + agents ✅
- [x] 13 tools (settings 8, agents 5)
- [x] Active-agent global (`window.__bimAiActiveAgentId`) prevents self-modification
- [x] Agent CRUD: list/create/update/delete with `cannot_modify_active` and `last_agent` guards
- [x] PWA programmatic API (`window.PWA.canInstall/prompt`)
- [x] ~28 new tests (587 → 615)

Branch: phase-9a-user-config-agents

## Phase 9b: Storage + presets + file ops ✅
- [x] 15 tools (folder CRUD 3, move 2, content 3, replace 1, presets 5, ui 1)
- [x] Folder name → id resolution with `ambiguous_folder` error on collisions
- [x] Native confirm() on destructive ops (delete folder, replace content, delete preset)
- [x] download_file uses Blob + ObjectURL, no LLM payload
- [x] apply_preset / load_preset cross-page via autorun flag (Phase 8 hotfix pattern)
- [x] ~32 new tests (621 → 652)

Branch: phase-9b-storage-presets

## Phase 9c: IDS deep-dive + IDS gen + bSDD + Excel ✅
- [x] 12 tools (IDS detail 2, validation drilldown 2, IFC analysis 2, IDS gen 3, bSDD stubs 2, Excel 1)
- [x] Spec/facet introspection via `IDSParser`
- [x] Validation failure drilldown reads `window.validationResults` (page-locked)
- [x] IDS XML generation via existing `IDSXMLGenerator` (homepage gets script tag for skeleton tool)
- [x] bSDD tools shipped as gated stubs returning `integration_disabled`
- [x] +20 new tests (652 → 672)

Branch: phase-9c-ids-validation-deep

## Phase 10: Chat-heads UI ✅
- [x] Stack circular avatars above launcher (max 5 + "+N" overflow)
- [x] Single-chat-active rule — opening a head minimizes the previously open one
- [x] Hover slide-out label (right→left, cubic-bezier spring)
- [x] Ripple unread state on stream completion while minimized
- [x] Persistence via `settings.activeChatHeads`; survives page navigation
- [x] +12 tests (672 → 684)

Branch: phase-10-chat-heads-ui

## Phase 11: Tool routing + preset agents ✅
- [x] Per-agent `enabledTools` whitelist filter v chat-panel
- [x] Tool catalog: 9 kategorií covering 56 toolů (`tool-catalog.js`)
- [x] 6 preset agentů (`agent-presets.js`): Generalist, Storage Organizer, Validator, IDS Author, Settings Butler, IFC Analyst
- [x] Settings UI tool picker (accordion + counter + per-cat select-all)
- [x] "Start from preset" dropdown při create-mode
- [x] Backward compat: existující agenti `enabledTools=undefined` = all 56 (no change)
- [x] +21 testů (684 → 705)

Branch: phase-11-tool-routing

## Phase 12a: Mobile foundation ✅
- [x] mobile-nav.css — sticky top bar (48px) + fixed bottom tabs (64px)
- [x] mobile-nav.js — active-tab class from `body[data-page]`
- [x] 4 i18n keys CZ+EN (`mobile.nav.home/validator/parser/viewer`)
- [x] Top bar + bottom tabs HTML on all 4 pages
- [x] Existing `.navbar` hidden < 1024px
- [x] Compact footer < 1024px (tech badges hidden)
- [x] safe-area insets for iPhone X+
- [x] +9 tests (705 → 714)

Branch: phase-12a-mobile-foundation

First piece of Phase 12 (mobile/tablet responsive). Pages still desktop layout inside — separate sub-phases handle each page's mobile redesign.

## Phase 12b: Mobile modals ✅
- [x] All `.modal-overlay` / `.modal-container` go fullscreen < 1024px
- [x] Both `.show` (legacy) and `.active` (AI Settings) open states supported
- [x] Modal header sticky top with close button
- [x] Body scrollable (`-webkit-overflow-scrolling: touch`)
- [x] Footer sticky bottom when present
- [x] Higher-specificity selectors (0,3,0) override `.ai-settings-modal .modal-container` + same-specificity rules in common.css / ids-editor-styles.css / ids-validator.css / ifc-viewer.css
- [x] +4 tests (714 → 718)

Branch: phase-12b-mobile-modals

Affects all existing modals: AI Settings, Bug Report, IDS/IFC storage pickers, bulk edit, add pset, rename pset/property, XSD export, validation result modals.

## Phase 12c: Homepage mobile ✅
- [x] Storage cards: header stacks (title on top, 4 icon buttons below)
- [x] `.btn-icon-modern` enforced to 44×44px on touch (WCAG 2.5.5)
- [x] Drop zones compact padding + smaller icon on phone
- [x] `tools-grid-modern` + `about-grid` single-column at < 1024px (was < 768px)
- [x] +4 tests (718 → 722)

Branch: phase-12c-homepage-mobile

No HTML/JS changes — drop zone click→file-picker already works on touch.

## Phase 12d: Chat bottom sheet ✅
- [x] Chat panel docks to bottom edge < 1024px (full-width, above bottom tabs, rounded top corners)
- [x] Drag-handle pill (40×4px) at top of header
- [x] Tap handle cycles 3 heights: default (60vh) → expanded (full) → collapsed (header-only)
- [x] `assets/js/ai-ui/chat-panel-mobile.js` IIFE, exposes `window.__bimChatPanelMobile`
- [x] Phase 10 chat-heads stack hidden < 1024px (per spec — agent switching via launcher popover)
- [x] Launcher button repositioned above bottom tabs
- [x] +5 tests (722 → 727)

Branch: phase-12d-chat-bottom-sheet

## Phase 12e: Validator + Parser mobile ✅
- [x] Validator filters-grid stacks (1 col); spec-header stacks; results-header stacks; presets panel stacks
- [x] Stat cards 2-column on phone (was 4 auto-fit)
- [x] Form inputs `font-size: 16px` to prevent iOS auto-zoom on focus
- [x] All interactive controls ≥ 44×44px touch (min-width + min-height)
- [x] Compact section padding (40px → spacing-lg/md)
- [x] Parser ids-info-grid stacks; cards compact
- [x] +5 tests (727 → 732)

Branch: phase-12e-validator-parser-mobile

Note: per-row master-detail card layout for results tables (per spec line 95) deferred — current results stay as desktop-style cards which stack adequately at < 1024px.

## Phase 12f: IFC Viewer mobile ✅
- [x] Upload section + file-list stack vertically; file cards full-width
- [x] Controls (search + filter selects) stack; iOS 16px no-zoom; 44px touch
- [x] Column manager + Pset groups + prop items: compact padding, 44px tap targets
- [x] Data table keeps horizontal scroll (overflow-x); padding compact; smaller font-size
- [x] Pagination container stacks info above controls; buttons 44×44px
- [x] Edit panel compact margins/padding
- [x] iOS-no-zoom rule covers `.form-group select` + `.form-group input` (higher specificity than base)
- [x] +5 tests (732 → 737)

Branch: phase-12f-ifc-viewer-mobile

Note: full virtual-scrolled card list (per spec line 102) deferred — keeps table with horizontal scroll. Future enhancement.

---

## Phase 12 COMPLETE 🎉

Six sub-phases delivered:
- 12a Foundation (top bar + bottom tabs, 1024px breakpoint)
- 12b Modals (fullscreen modals < 1024px)
- 12c Homepage (storage card stack, 44px touch, compact drop zones)
- 12d Chat bottom sheet (docked panel, drag handle, chat-heads hidden)
- 12e Validator + Parser (stacked filters/headers, iOS 16px)
- 12f IFC Viewer (stacked controls, compact table, horizontal scroll)

Test growth: 705 → 737 (+32 mobile tests).
SW cache progression: v39 → v45.
Single breakpoint `< 1024px` across all sub-phases.
All interactive controls ≥ 44×44px touch (WCAG 2.5.5/2.5.8).
All form inputs `font-size: 16px` (no iOS Safari auto-zoom).

Deferred for future polish:
- Virtual-scrolled entity card list (Viewer)
- Master-detail card pattern for validator results table
- Real drag-to-resize gestures on chat sheet
- Wizard/tour mobile redesign

## i18n Complete EN Localization ✅
- [x] i18n.js engine extended: `data-i18n-content` (meta tags) + `data-i18n-aria-label` (accessibility)
- [x] ~120 new translation keys CS+EN (page.title, page.meta.description, ai.tool.*, viewer.error, etc.)
- [x] 154+ hardcoded CS strings replaced via `i18n.t()` across 20 source files
- [x] Sample IDS in parser.js rewritten to English (international audience)
- [x] Agent presets: dual CS/EN schema with locale-aware `resolvePreset()` resolution
- [x] tool-defs.js (LLM-facing) translated CS → EN (71 strings)
- [x] CSS `.file-tree-modern:empty::before` dual-language via `[data-lang="cs"]` selector
- [x] Regression test enforces no CS chars outside allowlist (i18n-completeness.test.js)
- [x] +3 regression tests (737 → 740)

Branch: i18n-cleanup-complete-en

Trigger: external user feedback on LinkedIn about incomplete EN translation.

## Local Folder Storage v1 (Read-only) ✅
- [x] StorageBackend abstraction (`IndexedDBStorageBackend` + `LocalFolderStorageBackend`)
- [x] FS Access API integration (`showDirectoryPicker`, recursive scan, `getFile`)
- [x] `FileSystemDirectoryHandle` persistence in dedicated IndexedDB store
- [x] Permission flow (granted / prompt / denied) with banner-based reconnect
- [x] First-launch popup with onboarding state machine (null / dismissed / accepted / disabled, 7-day cooldown, max 3×)
- [x] AI Settings modal: Storage Backend section with radio toggle + connect/change/disconnect buttons
- [x] Homepage storage cards: 4 states (A IndexedDB / B granted / C reconnect / D unavailable)
- [x] 4 new AI tools: `connect_local_folder`, `disconnect_local_folder`, `rescan_local_folder`, `get_storage_info` (60 total tools)
- [x] Read-only guards on 7 AI write tools (`delete_file`, `create_folder`, `rename_folder`, `delete_folder`, `move_file`, `move_files_batch`, `replace_file_content`)
- [x] Hard limit 2000 files + warning at 500
- [x] ~30 new translation keys (CS + EN) under `storage.folder.*`, `storage.popup.*`, `settings.storage.*`, `ai.tool.localFolder.*`
- [x] +33 new tests (740 → 773)

Branch: local-folder-storage-v1

v1 = read-only (browse files from disk). Write-back deferred to v2.
Desktop Chromium only; mobile/Firefox/Safari fall back gracefully to IndexedDB.
Use case: connect to a CDE-sync folder (OneDrive/SharePoint/Box) and validate/parse/view IFC/IDS files directly.

## Local Folder Storage v2 (Write-back) ✅
- [x] LocalFolderStorageBackend: `readwrite` permission at connect, `saveFileContent` + `writeNewFile`
- [x] mtime tracking on read, external change detection at save with `force` bypass
- [x] Auto-suffix on filename collision (`_v2`, `_v3`...)
- [x] `BIMSaveToFolderDialog` component (overwrite/copy variant + conflict variant)
- [x] `BIMSaveFile` helper — centralized save routing per backend
- [x] IDS Editor save (`idsEditorCore.downloadIDS`) routed through helper in folder mode
- [x] IFC Viewer edit save (`exportModifiedIFC`) routed through helper in folder mode
- [x] 3 new AI tools (`save_file_to_folder`, `check_folder_writable`, `get_file_mtime`) — 63 total
- [x] Delete/rename/create-folder remain blocked (read-only guards from v1 preserved)
- [x] +23 new tests (773 → 796)

Branch: local-folder-storage-v2 (stacked on v1; PR combines both for one merge).

CDE workflow end-to-end: pull from cloud → edit in BIM_checker → save back → cloud picks up the change.

---

## Projects: multi-folder support ✅
- [x] `BIMProjects` API (`list / get / add / rename / remove / setActive`) with persistent handles in IDB v2 schema
- [x] Settings → Storage rewritten with project list, add/rename/remove, radio-switch active
- [x] Live backend swap on switch (no navigation); confirm guard when editor has unsaved changes
- [x] Auto-migration of legacy single-handle (one-shot, on first `list()` call)
- [x] `LocalFolderStorageBackend.connect()` auto-registers project (dedup via `isSameEntry`)
- [x] Save-target globals (`_currentIDS*` / `_currentIFC*`) reset on switch
- [x] Validator pickers + last-session restore fixed for folder mode (path-based IDs preserved; `storage:backendChanged` re-applies session after async restore)
- [x] `Stáhnout IDS` / `Export XLSX` buttons relabel to `Uložit do složky` in folder mode and write through folder backend

---

## K dokončení (TODO)

### Vysoká priorita

- [x] **Registrace domény u buildingSMART** – `checkthebim.com` přidán na CORS whitelist (potvrzeno Erik Baars, duben 2026), proxy odstraněn

### Střední priorita

- [ ] **AI chat-heads UI** (Phase 9, **až po Phase 8 tools**) – Minimalizované chaty se zobrazí jako kruhová kolečka (avatar agenta + krátký popisek nastavený v settings) stackovaná nad hlavním 🤖 launcherem. Style á la Facebook Messenger chat heads. Umožní paralelní konverzace s více agenty s rychlým přepínáním.

- [ ] **IDS šablony** – Předdefinované specifikace pro běžné use cases
  - Šablona pro požární bezpečnost
  - Šablona pro energetický štítek
  - Šablona pro koordinační model

- [ ] **BCF export** – Export výsledků validace do BIM Collaboration Format
  - Standardní formát pro issue tracking v BIM

- [ ] **Lazy loading s cache** – Načítat obsah souborů až když je potřeba
  - LRU cache s konfigurovatelným limitem
  - Rychlejší start aplikace s mnoha soubory

### Nízká priorita

- [ ] **Virtual scrolling** – Pro strom souborů s 1000+ položkami
- [ ] **Incremental updates** – Ukládat jen změněné části dat v IndexedDB
- [ ] **Batch operace IndexedDB** – Seskupit více operací do jedné transakce

---

## Poznámky
- Projekt běží na Cloudflare Pages z GitHubu (auto-deploy při push)
- Doména: checkthebim.com
- Testy: 283 testů (Puppeteer + custom Jasmine-like framework)
- Stack: Vanilla JS, žádné frameworky, čistě client-side
