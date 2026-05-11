# Mobile + Tablet Responsive Design

**Status:** Draft for user review
**Date:** 2026-05-11
**Scope:** All 4 pages (homepage + validator + parser + IFC viewer) + chat infrastructure.

## Goal

Udělat BIM_checker plně funkční na **phone (375-767px)** a **tablet (768-1023px)** viewportech. Currently všechny 4 stránky jsou desktop-first; mobil dostává zhuštěný desktop layout, který je nepoužitelný (overflow, mikrotext, klikací cíle <44px, chat panel zakrývá obsah).

## User decisions (from brainstorm)

| Téma | Volba |
|---|---|
| Scope | Všechny 4 stránky najednou |
| Minimum device | Phone 375px+ (iPhone SE 2gen), tablet 768px+ |
| Breakpoint logic | `< 1024px = mobile/tablet pattern`, `≥ 1024px = current desktop` (jen 2 breakpointy) |
| Hlavní navigace | **Bottom tab bar** (4 tabs: 🏠 Home / ✓ Validator / 📐 Parser / 🏗️ Viewer) + sticky top bar (brand + ⚙️ settings) |
| Chat panel | **Bottom sheet** (Material-style) — 55% výšky default, drag handle, swipe-up = full-screen, swipe-down = collapse |
| Chat-heads | **Skryté na phone/tablet**. Single-chat-active rule. Přepínání agentů přes launcher 🤖 popover (favorites + historie threadů) |
| Tablet behavior | Tablet = "velký phone" — stejný layout jako mobile (jednotný design) |

## Architecture

### Breakpoint system

```css
/* Default = mobile-first (0-1023px) — bottom tabs, bottom sheet, stacked layout */

@media (min-width: 1024px) {
    /* Desktop — current layout */
}
```

Single breakpoint `1024px` zjednoduší údržbu. Tablet (768-1023px) sdílí mobile patterns, viewport-aware tweaks v `@media (min-width: 768px) and (max-width: 1023px)` jen kde fakt potřeba (např. fonts mírně větší, větší padding).

### Top bar (sticky) — < 1024px

```html
<header class="bim-mobile-topbar">
    <a href="/" class="bim-mobile-topbar__brand">
        <span class="bim-mobile-topbar__icon">🏗️</span>
        <span class="bim-mobile-topbar__name">BIM Checker</span>
    </a>
    <button class="bim-mobile-topbar__settings" aria-label="Settings">⚙️</button>
</header>
```

- `position: sticky; top: 0;` výška 48px
- Background = primary gradient
- Z-index pod chat sheet (9000)
- Skryto na desktop (display: none ≥ 1024px)

### Bottom tab bar — < 1024px

```html
<nav class="bim-mobile-tabs">
    <a href="/index.html" class="bim-mobile-tabs__tab" data-tab="home">
        <span class="bim-mobile-tabs__icon">🏠</span>
        <span class="bim-mobile-tabs__label">Home</span>
    </a>
    <a href="/pages/ids-ifc-validator.html" class="bim-mobile-tabs__tab" data-tab="validator">...</a>
    <a href="/pages/ids-parser-visualizer.html" class="bim-mobile-tabs__tab" data-tab="parser">...</a>
    <a href="/pages/ifc-viewer-multi-file.html" class="bim-mobile-tabs__tab" data-tab="viewer">...</a>
</nav>
```

- `position: fixed; bottom: 0;` výška 64px
- Inverted: white background, gradient text on active
- Active tab detekuje script per page (každý HTML má `data-page="home"` atd.)
- Z-index 9000 pod chat sheet (9100)
- Existující navbar (desktop) skrytý < 1024px
- Bottom tabs skryté ≥ 1024px

### Chat panel — bottom sheet < 1024px

Existující `.chat-panel` (340×480 floating bottom-right) přepsáno na mobile:
- `position: fixed; left: 0; right: 0; bottom: 64px;` (nad bottom tabs)
- `height: 55%`, `border-radius: 20px 20px 0 0`
- Drag handle (40×4px) nahoře
- Klik / drag-up: expand na `height: calc(100% - 48px)` (full mezi top bar a tabs)
- Klik / drag-down: collapse (jen header viditelný) — nebo úplně close
- Touch swipe gesty: handle PointerMove + threshold detection
- Z-index 9100

Chat-heads stack (`.chat-heads-stack`) — `display: none` < 1024px. Launcher 🤖 popover už dnes ukazuje favorite agents + při dlouhém threadu historii — postačí.

### Tables → master-detail pattern

3 typy tabulek v projektu:

**1. Validator results table** — many groups × many IFCs × specs/requirements
- Mobile: list of `<div class="result-summary-card">` per group (název IDS, X passed / Y failed badge)
- Klik = navigate to detail page nebo expand inline (accordion)
- Detail = stacked sections per IFC file + per requirement

**2. Parser specifications table** — IDS spec list with applicability/requirements
- Mobile: cards, klik = expand/modal s detaily
- Raw XML view = modal full-screen

**3. IFC Viewer entity table** — potentially 1000s of rows
- Mobile: virtual-scrolled card list (každý "row" = card s top 3 properties)
- Search bar na top, sticky
- Klik na card → bottom sheet s plnými property sety
- Pagination/load-more if performance issue

### File upload — touch first

Existující drag-and-drop zones na mobile přidají velký tap-to-pick fallback:
- Aria label "Vyberte soubor nebo přetáhněte"
- Box jako large button (min 80×80px)
- File picker triggered by tap; DnD remains as desktop enhancement (CSS classes hidden < 1024px)

### Storage tree on touch

Folder tree expand/collapse zůstává:
- Tap targets ≥ 44×44px (CSS padding tweaks)
- Drag-to-move folders → optional swipe-action menu instead (long-press → action sheet)
- Pro jednoduchost zatím **disable drag-to-move on touch**, použij explicit menu

### Modals on mobile

- `.modal-overlay` přepsán: `position: fixed; inset: 0; padding: 0` < 1024px
- `.modal-container`: `width: 100%; height: 100%; max-width: none; border-radius: 0`
- Modal header = sticky top with close ✕
- Modal body = scroll inside

### Footer compact

Existující `.footer-modern` na mobile:
- Single-row, horizontální scroll
- Tech badges hidden (display: none < 768px)
- Meta items (Version, Year, GitHub, AGPL, Autor) zhuštěné

## Sub-phase decomposition

Project too big for single plan. Decompose into 6 sub-phases, each its own plan:

### Phase 12a — Foundation (top bar + bottom tabs + breakpoints)
Files: `common.css` (breakpoints), new `mobile-nav.css`, all 4 HTMLs (add `<header class="bim-mobile-topbar">` + `<nav class="bim-mobile-tabs">` snippets), hide desktop navbar < 1024px.
Estimated tests: ~5 (active tab detection, top bar present, nav links correct).

### Phase 12b — Modals + footer mobile
Files: `common.css` (modal overrides), all 4 HTMLs (footer compact).
Estimated tests: ~3.

### Phase 12c — Homepage mobile (file storage)
Files: `index.css`, `index.html`, `index.js` (touch-friendly drag-drop fallback).
Estimated tests: ~5 (storage cards stack, upload button works on touch).

### Phase 12d — Chat panel bottom sheet
Files: `ai-chat.css`, `chat-panel.js` (touch gestures for drag handle).
Estimated tests: ~6 (sheet open/close, drag handle, full-screen expand, chat-heads hidden).

### Phase 12e — Validator + Parser mobile
Files: `ids-validator.css`, `validator.js`, `ids-parser.css`, `parser.js`.
Estimated tests: ~8 (presets panel stack, validation groups stack, master-detail navigation).

### Phase 12f — IFC Viewer mobile (biggest)
Files: `ifc-viewer.css`, `ifc/viewer-ui.js`, `ifc/viewer-core.js`.
Estimated tests: ~6 (card list rendering, search top sticky, detail sheet).

Each sub-phase: own branch, own PR, own subagent-driven implementation cycle.

## Cross-cutting concerns

### Touch target sizing
All interactive elements must have ≥ 44×44px touch area (Apple HIG, WCAG 2.5.5). Use CSS padding to expand visual touch area where icon < 44px.

### Active-tab detection
Each HTML page declares `<body data-page="home">` (etc.). `mobile-nav.js` sets `.is-active` class on matching `.bim-mobile-tabs__tab[data-tab="home"]`. No router needed — plain page navigation.

### Safe area insets (iPhone X+)
```css
.bim-mobile-tabs { padding-bottom: env(safe-area-inset-bottom); }
.bim-mobile-topbar { padding-top: env(safe-area-inset-top); }
```

### Visualisation of "is mobile"
- Mobile <  768px: phone (1-column)
- Tablet 768-1023px: same patterns, slightly more breathing room (max-width on cards, larger touch targets enlarged 48px)
- Desktop ≥ 1024px: existing layout

### Service Worker
- Bump cache per sub-phase
- Add `mobile-nav.css`, `mobile-nav.js` to `ASSETS_TO_CACHE` (Phase 12a)

### Tests
Existing Puppeteer tests run at 1280×720 viewport (desktop). Add mobile-viewport tests for key flows:
- Set viewport 375×667 for mobile checks
- Set viewport 768×1024 for tablet checks
- Verify: bottom tabs visible, top bar sticky, modals fullscreen

### i18n
No new strings except:
- `mobile.nav.home` = "Home"
- `mobile.nav.validator` = "Validator"  
- `mobile.nav.parser` = "Parser"
- `mobile.nav.viewer` = "Viewer"

(EN identical or use existing `tools.*` titles.)

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Chat panel bottom sheet conflict s bottom tabs (z-index) | z-index hierarchy: tabs 9000, launcher 9001, sheet 9100, sheet-overlay 9099 |
| Tap-to-expand storage tree breaks DnD on desktop | Touch detection via `pointer-coarse` media query, swap UX based on input modality |
| Chat sheet drag gesture conflicts s page scroll | Drag handle (top 40×4px area) is dedicated touch area; page scroll happens below |
| Tables → cards costs performance for IFC viewer | Virtual scroll for entity card list (only render visible rows) |
| Existing wizard step targets desktop selectors | Wizard steps need mobile-aware targets per page; out of scope this spec, follow-up |
| Excel export, file download work on mobile | Browser-native, should work — verify in QA |

## Out of scope (later)

- PWA install banner (already covered)
- Landscape phone orientation special handling (most use portrait)
- Wizard mobile redesign (separate spec)
- Native-feeling page transitions
- Pull-to-refresh
- Right-to-left languages

## Test strategy

Per sub-phase:
- Unit tests: viewport size + DOM assertions (mobile-specific markup present)
- E2E tests in Puppeteer with mobile viewport
- Manual QA on real devices: iPhone SE, iPhone 14 Pro, iPad mini, iPad Pro

Baseline tests: 705 (current). After all 6 phases: ~735+ expected.
