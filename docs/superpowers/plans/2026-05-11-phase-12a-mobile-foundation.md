# Phase 12a: Mobile/tablet responsive foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Postavit foundation pro mobile/tablet layout — sticky top bar (48px) + fixed bottom tab bar (64px) viditelné < 1024px, existující desktop navbar skrytý < 1024px.

**Architecture:** Nová CSS file `mobile-nav.css` (top bar + bottom tabs + breakpoint system), nová JS file `mobile-nav.js` (active-tab detection via `<body data-page>`), nové i18n klíče `mobile.nav.*`. HTML markup přidán do všech 4 stránek (index + 3 subpages). Existující `.navbar` skrytý < 1024px přes media query. Desktop layout ≥ 1024px netknutý.

**Tech Stack:** Vanilla JS, CSS media queries, `env(safe-area-inset-*)` pro iPhone X+, sticky/fixed positioning, no new libs.

**Branch:** `phase-12a-mobile-foundation` (cut from `master`).

**Spec:** `docs/superpowers/specs/2026-05-11-mobile-tablet-responsive-design.md`.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `assets/css/mobile-nav.css` | **Create** | Top bar + bottom tabs styles + hide-desktop-navbar media query |
| `assets/js/common/mobile-nav.js` | **Create** | Active-tab class assignment based on `document.body.dataset.page` |
| `assets/js/common/translations.js` | Modify | 4 new keys CZ + EN: `mobile.nav.home/validator/parser/viewer` |
| `index.html` + 3× `pages/*.html` | Modify | Add `<body data-page="X">`, link mobile-nav.css, mobile-nav.js, insert top-bar + bottom-tabs HTML |
| `dist/...` | Mirror | Each file copied |
| `sw.js` + `dist/sw.js` | Modify | Bump v39 → v40, add `mobile-nav.css` + `mobile-nav.js` to ASSETS_TO_CACHE |
| `tests/test-suites/mobile-nav.test.js` | **Create** | ~6 tests (active class, breakpoint detection, all 4 pages markup) |
| `tests/test-runner.html` | Modify | Add new test suite script tag |
| `PLAN.md` | Modify | Append Phase 12a entry |
| `CHANGELOG.md` | Modify | `[0.10.0]` entry |

---

## Cross-cutting conventions

- ES6 modules NOT used here (mobile-nav.js loaded as plain script via `<script src="...">`) — must work on every page including non-module pages
- Mirror dist via `cp` after each edit
- Test framework: no `.not` chaining
- All i18n strings via `t('key')`, but `mobile-nav.js` reads via `window.i18n.t()` (or fallback) since loaded before/after i18n init varies
- Add SPDX header to new files: `/* SPDX-License-Identifier: AGPL-3.0-or-later */` + `/* Copyright (C) 2025 Michal Marvan */`
- Breakpoint: `1024px` is the single threshold (mobile/tablet < 1024 ≤ desktop)
- Z-index hierarchy: top-bar 8500, bottom-tabs 8500, launcher 9001, chat-heads 9001, chat-sheet (later) 9100
- Safe-area handling: `env(safe-area-inset-*)` for notch + home indicator

---

## Task 1: mobile-nav.css — styles + breakpoint hide rule

**Files:**
- Create: `assets/css/mobile-nav.css`
- Modify: `index.html` + dist mirror — add `<link rel="stylesheet" href="assets/css/mobile-nav.css">`
- Modify: 3× `pages/*.html` + dist mirrors — add `<link rel="stylesheet" href="../assets/css/mobile-nav.css">`

- [ ] **Step 1: Create assets/css/mobile-nav.css**

```css
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

/* === Mobile + tablet responsive foundation === */
/* Visible < 1024px; hidden ≥ 1024px (desktop keeps existing nav) */

.bim-mobile-topbar,
.bim-mobile-tabs {
    display: none;
}

@media (max-width: 1023px) {
    /* Hide existing desktop navbar */
    .navbar { display: none !important; }

    /* Top bar */
    .bim-mobile-topbar {
        display: flex;
        position: sticky;
        top: 0;
        z-index: 8500;
        height: calc(48px + env(safe-area-inset-top, 0px));
        padding-top: env(safe-area-inset-top, 0px);
        align-items: center;
        justify-content: space-between;
        padding-left: 16px;
        padding-right: 16px;
        background: var(--primary-gradient, linear-gradient(135deg, #667eea 0%, #5568d3 100%));
        color: white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.10);
    }
    .bim-mobile-topbar__brand {
        display: flex;
        align-items: center;
        gap: 10px;
        text-decoration: none;
        color: white;
    }
    .bim-mobile-topbar__icon {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        background: rgba(255,255,255,0.18);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
    }
    .bim-mobile-topbar__name {
        font-weight: 700;
        font-size: 16px;
        letter-spacing: -0.3px;
    }
    .bim-mobile-topbar__settings {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(255,255,255,0.18);
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .bim-mobile-topbar__settings:hover { background: rgba(255,255,255,0.28); }

    /* Bottom tabs */
    .bim-mobile-tabs {
        display: flex;
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 8500;
        height: calc(64px + env(safe-area-inset-bottom, 0px));
        padding-bottom: env(safe-area-inset-bottom, 0px);
        align-items: stretch;
        background: var(--bg-primary, #fff);
        border-top: 1px solid var(--border-primary, #e5e7eb);
        box-shadow: 0 -4px 16px rgba(0,0,0,0.06);
    }
    .bim-mobile-tabs__tab {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 8px 4px;
        text-decoration: none;
        color: var(--text-tertiary, #6b7280);
        font-size: 11px;
        font-weight: 500;
        transition: color 0.15s;
        /* Touch target ≥ 44px */
        min-height: 44px;
    }
    .bim-mobile-tabs__tab.is-active {
        color: var(--primary-color, #667eea);
    }
    .bim-mobile-tabs__icon {
        font-size: 22px;
        line-height: 1;
    }
    .bim-mobile-tabs__label { line-height: 1; }

    /* Reserve space at bottom of body so content not overlapped by fixed tabs */
    body {
        padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
    }

    /* On tablet (768-1023): slightly larger touch targets */
    @media (min-width: 768px) {
        .bim-mobile-topbar { padding-left: 24px; padding-right: 24px; }
        .bim-mobile-tabs__tab { font-size: 12px; }
        .bim-mobile-tabs__icon { font-size: 24px; }
    }
}
```

- [ ] **Step 2: Link mobile-nav.css from index.html**

Open `index.html`. Find the existing `<link rel="stylesheet" href="assets/css/common.css">` line. AFTER it, add:
```html
    <link rel="stylesheet" href="assets/css/mobile-nav.css">
```

- [ ] **Step 3: Link mobile-nav.css from 3 subpages**

For each of `pages/ids-ifc-validator.html`, `pages/ids-parser-visualizer.html`, `pages/ifc-viewer-multi-file.html`:
Find existing `<link rel="stylesheet" href="../assets/css/common.css">` line. AFTER it, add:
```html
    <link rel="stylesheet" href="../assets/css/mobile-nav.css">
```

- [ ] **Step 4: Mirror to dist**
```bash
cp assets/css/mobile-nav.css dist/assets/css/mobile-nav.css
cp index.html dist/index.html
cp pages/ids-ifc-validator.html dist/pages/ids-ifc-validator.html
cp pages/ids-parser-visualizer.html dist/pages/ids-parser-visualizer.html
cp pages/ifc-viewer-multi-file.html dist/pages/ifc-viewer-multi-file.html
```

- [ ] **Step 5: Verify nothing broke**
```bash
cd /home/michal/work/BIM_checker
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 705/705 (no new tests yet; CSS-only addition shouldn't break existing).

- [ ] **Step 6: Commit**
```bash
git checkout -b phase-12a-mobile-foundation
git add assets/css/mobile-nav.css dist/assets/css/mobile-nav.css \
        index.html dist/index.html \
        pages/ids-ifc-validator.html dist/pages/ids-ifc-validator.html \
        pages/ids-parser-visualizer.html dist/pages/ids-parser-visualizer.html \
        pages/ifc-viewer-multi-file.html dist/pages/ifc-viewer-multi-file.html
git commit -m "feat(mobile-12a): mobile-nav.css — top bar + bottom tabs styles + hide desktop navbar < 1024px"
```

---

## Task 2: mobile-nav.js + i18n keys + tests

**Files:**
- Create: `assets/js/common/mobile-nav.js`
- Modify: `assets/js/common/translations.js` — 4 keys CZ + EN
- Create: `tests/test-suites/mobile-nav.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1: Create assets/js/common/mobile-nav.js**

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

/**
 * Mobile navigation — assigns .is-active class to the bottom tab matching
 * the current page (read from document.body.dataset.page).
 *
 * Runs after DOMContentLoaded so body[data-page] is available.
 */
(function () {
    'use strict';

    function highlightActiveTab() {
        const page = document.body && document.body.dataset && document.body.dataset.page;
        if (!page) return;
        const tabs = document.querySelectorAll('.bim-mobile-tabs__tab');
        tabs.forEach(function (tab) {
            if (tab.dataset.tab === page) {
                tab.classList.add('is-active');
            } else {
                tab.classList.remove('is-active');
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', highlightActiveTab);
    } else {
        highlightActiveTab();
    }

    // Expose for tests
    window.__bimMobileNav = { highlightActiveTab: highlightActiveTab };
})();
```

- [ ] **Step 2: Add i18n keys to translations.js (CZ block)**

Open `assets/js/common/translations.js`. Find the `'mobile.'` keys section if exists; if not, find the existing `'nav.about'` line in the CZ block. AFTER it, add:
```js
        // === MOBILE NAV (Phase 12a) ===
        'mobile.nav.home': 'Domů',
        'mobile.nav.validator': 'Validator',
        'mobile.nav.parser': 'Parser',
        'mobile.nav.viewer': 'Viewer',
```

In the EN block, find the parallel `'nav.about'` line. AFTER it, add:
```js
        // === MOBILE NAV (Phase 12a) ===
        'mobile.nav.home': 'Home',
        'mobile.nav.validator': 'Validator',
        'mobile.nav.parser': 'Parser',
        'mobile.nav.viewer': 'Viewer',
```

- [ ] **Step 3: Create tests/test-suites/mobile-nav.test.js**

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('mobile-nav', () => {
    let originalPage;

    beforeEach(() => {
        originalPage = document.body.dataset.page;
    });

    afterEach(() => {
        if (originalPage) document.body.dataset.page = originalPage;
        else delete document.body.dataset.page;
        // Clean up any test-created tabs
        document.querySelectorAll('.bim-mobile-tabs[data-test-injected]').forEach(n => n.remove());
    });

    function injectTabs() {
        const nav = document.createElement('nav');
        nav.className = 'bim-mobile-tabs';
        nav.setAttribute('data-test-injected', '1');
        for (const t of ['home', 'validator', 'parser', 'viewer']) {
            const a = document.createElement('a');
            a.className = 'bim-mobile-tabs__tab';
            a.dataset.tab = t;
            a.textContent = t;
            nav.appendChild(a);
        }
        document.body.appendChild(nav);
        return nav;
    }

    it('highlightActiveTab adds is-active to the matching tab', () => {
        const nav = injectTabs();
        document.body.dataset.page = 'validator';
        window.__bimMobileNav.highlightActiveTab();
        const active = nav.querySelectorAll('.bim-mobile-tabs__tab.is-active');
        expect(active.length).toBe(1);
        expect(active[0].dataset.tab).toBe('validator');
    });

    it('highlightActiveTab clears stale is-active classes', () => {
        const nav = injectTabs();
        nav.querySelectorAll('.bim-mobile-tabs__tab').forEach(t => t.classList.add('is-active'));
        document.body.dataset.page = 'home';
        window.__bimMobileNav.highlightActiveTab();
        const active = nav.querySelectorAll('.bim-mobile-tabs__tab.is-active');
        expect(active.length).toBe(1);
        expect(active[0].dataset.tab).toBe('home');
    });

    it('highlightActiveTab is a no-op when body has no data-page', () => {
        const nav = injectTabs();
        delete document.body.dataset.page;
        window.__bimMobileNav.highlightActiveTab();
        const active = nav.querySelectorAll('.bim-mobile-tabs__tab.is-active');
        expect(active.length).toBe(0);
    });

    it('highlightActiveTab is a no-op when no tabs exist', () => {
        document.body.dataset.page = 'home';
        let threw = false;
        try { window.__bimMobileNav.highlightActiveTab(); } catch (e) { threw = true; }
        expect(threw).toBe(false);
    });

    it('translations include all 4 mobile.nav keys in CS', async () => {
        const orig = window.i18n.getCurrentLanguage();
        window.i18n.setLanguage('cs');
        try {
            expect(window.i18n.t('mobile.nav.home')).toBe('Domů');
            expect(window.i18n.t('mobile.nav.validator')).toBe('Validator');
            expect(window.i18n.t('mobile.nav.parser')).toBe('Parser');
            expect(window.i18n.t('mobile.nav.viewer')).toBe('Viewer');
        } finally {
            window.i18n.setLanguage(orig);
        }
    });

    it('translations include all 4 mobile.nav keys in EN', async () => {
        const orig = window.i18n.getCurrentLanguage();
        window.i18n.setLanguage('en');
        try {
            expect(window.i18n.t('mobile.nav.home')).toBe('Home');
            expect(window.i18n.t('mobile.nav.validator')).toBe('Validator');
            expect(window.i18n.t('mobile.nav.parser')).toBe('Parser');
            expect(window.i18n.t('mobile.nav.viewer')).toBe('Viewer');
        } finally {
            window.i18n.setLanguage(orig);
        }
    });
});
```

- [ ] **Step 4: Add test runner script tag**

In `tests/test-runner.html`, find the `<script src="test-suites/...">` block. After the last existing test suite tag, add:
```html
    <script src="test-suites/mobile-nav.test.js"></script>
```

- [ ] **Step 5: Inject mobile-nav.js into test-runner.html**

The mobile-nav.js needs to be loaded so `window.__bimMobileNav` exists. In `tests/test-runner.html`, find existing `<script src="../assets/js/common/i18n.js"></script>` (or similar i18n script tag). AFTER it, add:
```html
    <script src="../assets/js/common/mobile-nav.js"></script>
```

- [ ] **Step 6: Mirror dist + run tests**
```bash
mkdir -p dist/assets/js/common
cp assets/js/common/mobile-nav.js dist/assets/js/common/mobile-nav.js
cp assets/js/common/translations.js dist/assets/js/common/translations.js
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 711/711 (705 + 6 new).

- [ ] **Step 7: Commit**
```bash
git add assets/js/common/mobile-nav.js dist/assets/js/common/mobile-nav.js \
        assets/js/common/translations.js dist/assets/js/common/translations.js \
        tests/test-suites/mobile-nav.test.js tests/test-runner.html
git commit -m "feat(mobile-12a): mobile-nav.js (active tab) + 4 i18n keys CZ+EN + 6 tests"
```

---

## Task 3: Add top bar + bottom tabs to index.html (validate pattern)

**Files:**
- Modify: `index.html` + dist mirror

- [ ] **Step 1: Add data-page to body**

Open `index.html`. Find the `<body>` tag (line 61). Replace:
```html
<body>
```
with:
```html
<body data-page="home">
```

- [ ] **Step 2: Insert top bar HTML**

Open `index.html`. Find the `<body data-page="home">` opening tag. IMMEDIATELY AFTER it (before any other content / before `<!-- Navigation Bar -->`), insert:
```html
    <!-- Mobile top bar (visible < 1024px) -->
    <header class="bim-mobile-topbar">
        <a href="./index.html" class="bim-mobile-topbar__brand">
            <span class="bim-mobile-topbar__icon">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
            </span>
            <span class="bim-mobile-topbar__name" data-i18n="app.title">BIM Checker</span>
        </a>
        <button class="bim-mobile-topbar__settings" id="aiSettingsBtnMobile" title="AI agenti">⚙️</button>
    </header>
```

- [ ] **Step 3: Insert bottom tabs HTML**

In `index.html`, find the closing `</body>` tag. IMMEDIATELY BEFORE it (after all other body content), insert:
```html
    <!-- Mobile bottom tabs (visible < 1024px) -->
    <nav class="bim-mobile-tabs">
        <a href="./index.html" class="bim-mobile-tabs__tab" data-tab="home">
            <span class="bim-mobile-tabs__icon">🏠</span>
            <span class="bim-mobile-tabs__label" data-i18n="mobile.nav.home">Domů</span>
        </a>
        <a href="./pages/ids-ifc-validator.html" class="bim-mobile-tabs__tab" data-tab="validator">
            <span class="bim-mobile-tabs__icon">✓</span>
            <span class="bim-mobile-tabs__label" data-i18n="mobile.nav.validator">Validator</span>
        </a>
        <a href="./pages/ids-parser-visualizer.html" class="bim-mobile-tabs__tab" data-tab="parser">
            <span class="bim-mobile-tabs__icon">📐</span>
            <span class="bim-mobile-tabs__label" data-i18n="mobile.nav.parser">Parser</span>
        </a>
        <a href="./pages/ifc-viewer-multi-file.html" class="bim-mobile-tabs__tab" data-tab="viewer">
            <span class="bim-mobile-tabs__icon">🏗️</span>
            <span class="bim-mobile-tabs__label" data-i18n="mobile.nav.viewer">Viewer</span>
        </a>
    </nav>
```

- [ ] **Step 4: Add mobile-nav.js script tag**

In `index.html`, find the existing `<script src="assets/js/common/translations.js"></script>` (or similar — a top-level common script). AFTER it, add:
```html
    <script src="assets/js/common/mobile-nav.js"></script>
```

- [ ] **Step 5: Wire settings button to existing settings modal**

Open `index.html`. Look for existing `<script>` block that wires `aiSettingsBtn` click handler — there usually isn't one here since it's wired via `init.js`. The new `aiSettingsBtnMobile` ID must fire the same `ai:openSettings` event. Find the closing `</body>` or just before the existing scripts area. Add:
```html
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const btn = document.getElementById('aiSettingsBtnMobile');
            if (btn) btn.addEventListener('click', function() {
                window.dispatchEvent(new CustomEvent('ai:openSettings'));
            });
        });
    </script>
```

(Note: `ai:openSettings` listener exists in `assets/js/ai-ui/init.js` from Phase 7.)

- [ ] **Step 6: Mirror + tests**
```bash
cp index.html dist/index.html
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 711/711.

- [ ] **Step 7: Commit**
```bash
git add index.html dist/index.html
git commit -m "feat(mobile-12a): top bar + bottom tabs HTML in index.html"
```

---

## Task 4: Add top bar + bottom tabs to 3 subpages

**Files:**
- Modify: `pages/ids-ifc-validator.html`, `pages/ids-parser-visualizer.html`, `pages/ifc-viewer-multi-file.html` + dist mirrors

- [ ] **Step 1: pages/ids-ifc-validator.html — body + markup**

Open `pages/ids-ifc-validator.html`. Find the `<body>` tag (around line 60). Replace `<body>` with `<body data-page="validator">`.

IMMEDIATELY AFTER `<body data-page="validator">`, insert:
```html
    <!-- Mobile top bar (visible < 1024px) -->
    <header class="bim-mobile-topbar">
        <a href="../index.html" class="bim-mobile-topbar__brand">
            <span class="bim-mobile-topbar__icon">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
            </span>
            <span class="bim-mobile-topbar__name" data-i18n="app.title">BIM Checker</span>
        </a>
        <button class="bim-mobile-topbar__settings" id="aiSettingsBtnMobile" title="AI agenti">⚙️</button>
    </header>
```

IMMEDIATELY BEFORE the closing `</body>`, insert:
```html
    <!-- Mobile bottom tabs (visible < 1024px) -->
    <nav class="bim-mobile-tabs">
        <a href="../index.html" class="bim-mobile-tabs__tab" data-tab="home">
            <span class="bim-mobile-tabs__icon">🏠</span>
            <span class="bim-mobile-tabs__label" data-i18n="mobile.nav.home">Domů</span>
        </a>
        <a href="./ids-ifc-validator.html" class="bim-mobile-tabs__tab" data-tab="validator">
            <span class="bim-mobile-tabs__icon">✓</span>
            <span class="bim-mobile-tabs__label" data-i18n="mobile.nav.validator">Validator</span>
        </a>
        <a href="./ids-parser-visualizer.html" class="bim-mobile-tabs__tab" data-tab="parser">
            <span class="bim-mobile-tabs__icon">📐</span>
            <span class="bim-mobile-tabs__label" data-i18n="mobile.nav.parser">Parser</span>
        </a>
        <a href="./ifc-viewer-multi-file.html" class="bim-mobile-tabs__tab" data-tab="viewer">
            <span class="bim-mobile-tabs__icon">🏗️</span>
            <span class="bim-mobile-tabs__label" data-i18n="mobile.nav.viewer">Viewer</span>
        </a>
    </nav>
    <script src="../assets/js/common/mobile-nav.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const btn = document.getElementById('aiSettingsBtnMobile');
            if (btn) btn.addEventListener('click', function() {
                window.dispatchEvent(new CustomEvent('ai:openSettings'));
            });
        });
    </script>
```

- [ ] **Step 2: pages/ids-parser-visualizer.html — body + markup**

Open `pages/ids-parser-visualizer.html`. Find `<body>` (around line 60). Replace `<body>` with `<body data-page="parser">`.

IMMEDIATELY AFTER `<body data-page="parser">`, insert the same top-bar block as Task 4 Step 1 (`../index.html` href, `data-i18n="app.title"`).

IMMEDIATELY BEFORE the closing `</body>`, insert the same bottom-tabs block as Task 4 Step 1 — but with `./ids-parser-visualizer.html` href for the `data-tab="parser"` link. Just copy the entire bottom-tabs block verbatim — paths are relative to `pages/` directory and all 3 subpages share the same neighbours.

(Concretely the same block as Task 4 Step 1.)

- [ ] **Step 3: pages/ifc-viewer-multi-file.html — body + markup**

Open `pages/ifc-viewer-multi-file.html`. Replace `<body>` with `<body data-page="viewer">`.

IMMEDIATELY AFTER `<body data-page="viewer">`, insert the same top-bar block as Task 4 Step 1.

IMMEDIATELY BEFORE the closing `</body>`, insert the same bottom-tabs block as Task 4 Step 1.

- [ ] **Step 4: Mirror dist for all 3 subpages**
```bash
cp pages/ids-ifc-validator.html dist/pages/ids-ifc-validator.html
cp pages/ids-parser-visualizer.html dist/pages/ids-parser-visualizer.html
cp pages/ifc-viewer-multi-file.html dist/pages/ifc-viewer-multi-file.html
```

- [ ] **Step 5: Run tests**
```bash
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 711/711.

- [ ] **Step 6: Commit**
```bash
git add pages/ids-ifc-validator.html dist/pages/ids-ifc-validator.html \
        pages/ids-parser-visualizer.html dist/pages/ids-parser-visualizer.html \
        pages/ifc-viewer-multi-file.html dist/pages/ifc-viewer-multi-file.html
git commit -m "feat(mobile-12a): top bar + bottom tabs HTML in 3 subpages"
```

---

## Task 5: Footer compact + visual smoke test via Puppeteer

**Files:**
- Modify: `assets/css/mobile-nav.css` — append footer rules for <1024px
- Create: `tests/test-suites/mobile-foundation.test.js` — Puppeteer DOM-level smoke test loading actual HTML pages

- [ ] **Step 1: Append footer rules to mobile-nav.css**

Open `assets/css/mobile-nav.css`. At the END of the existing media query block `@media (max-width: 1023px) { ... }`, before its closing `}`, add:
```css

    /* Compact footer < 1024px */
    .footer-modern .footer-tech { display: none; }
    .footer-modern .footer-content {
        flex-direction: column;
        gap: 12px;
        align-items: flex-start;
    }
    .footer-modern .footer-meta {
        flex-wrap: wrap;
        gap: 6px 12px;
    }
```

- [ ] **Step 2: Create tests/test-suites/mobile-foundation.test.js**

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('mobile-foundation (DOM smoke)', () => {
    function injectMarkupForPage(page) {
        document.body.dataset.page = page;
        const topbar = document.createElement('header');
        topbar.className = 'bim-mobile-topbar';
        topbar.innerHTML = '<a class="bim-mobile-topbar__brand"><span class="bim-mobile-topbar__icon">🏗️</span><span class="bim-mobile-topbar__name">BIM Checker</span></a><button class="bim-mobile-topbar__settings">⚙️</button>';
        topbar.setAttribute('data-test-injected', '1');
        document.body.appendChild(topbar);

        const tabs = document.createElement('nav');
        tabs.className = 'bim-mobile-tabs';
        tabs.setAttribute('data-test-injected', '1');
        for (const t of ['home', 'validator', 'parser', 'viewer']) {
            const a = document.createElement('a');
            a.className = 'bim-mobile-tabs__tab';
            a.dataset.tab = t;
            tabs.appendChild(a);
        }
        document.body.appendChild(tabs);
    }

    afterEach(() => {
        delete document.body.dataset.page;
        document.querySelectorAll('[data-test-injected="1"]').forEach(n => n.remove());
    });

    it('topbar contains brand + settings button', () => {
        injectMarkupForPage('home');
        const tb = document.querySelector('.bim-mobile-topbar');
        expect(!!tb.querySelector('.bim-mobile-topbar__brand')).toBe(true);
        expect(!!tb.querySelector('.bim-mobile-topbar__settings')).toBe(true);
    });

    it('bottom tabs contain exactly 4 tabs for each known page key', () => {
        injectMarkupForPage('home');
        const tabs = document.querySelectorAll('.bim-mobile-tabs__tab');
        expect(tabs.length).toBe(4);
        const keys = Array.from(tabs).map(t => t.dataset.tab).sort();
        expect(keys.join(',')).toBe('home,parser,validator,viewer');
    });

    it('mobile-nav.js highlights correct tab when body[data-page] is set', () => {
        injectMarkupForPage('parser');
        window.__bimMobileNav.highlightActiveTab();
        const active = document.querySelector('.bim-mobile-tabs__tab.is-active');
        expect(!!active).toBe(true);
        expect(active.dataset.tab).toBe('parser');
    });
});
```

- [ ] **Step 3: Add test runner script tag**

In `tests/test-runner.html`, after `<script src="test-suites/mobile-nav.test.js"></script>`, add:
```html
    <script src="test-suites/mobile-foundation.test.js"></script>
```

- [ ] **Step 4: Mirror + run tests**
```bash
cp assets/css/mobile-nav.css dist/assets/css/mobile-nav.css
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 714/714 (711 + 3 new).

- [ ] **Step 5: Commit**
```bash
git add assets/css/mobile-nav.css dist/assets/css/mobile-nav.css \
        tests/test-suites/mobile-foundation.test.js tests/test-runner.html
git commit -m "feat(mobile-12a): compact footer < 1024px + DOM smoke tests"
```

---

## Task 6: SW cache bump + PLAN/CHANGELOG + push

**Files:**
- Modify: `sw.js` + `dist/sw.js`
- Modify: `PLAN.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump SW cache + add new files to ASSETS_TO_CACHE**

In `sw.js`:
- Change `const CACHE_VERSION = 'bim-checker-v39';` to `'bim-checker-v40'`
- In `ASSETS_TO_CACHE`, find existing line `'./assets/css/common.css',`. After it add:
```
    './assets/css/mobile-nav.css',
```
- Find existing line `'./assets/js/common/translations.js',`. After it add:
```
    './assets/js/common/mobile-nav.js',
```

Mirror to `dist/sw.js`.

- [ ] **Step 2: Append Phase 12a block to PLAN.md**

After the existing `## Phase 11` section, append:
```markdown
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
```

- [ ] **Step 3: Insert [0.10.0] block in CHANGELOG.md**

After the header line(s), before the first existing version block:
```markdown
## [0.10.0] - 2026-05-11

### Added
- Mobile/tablet responsive foundation (Phase 12a): sticky top bar (48px) + fixed bottom tab bar (64px) for viewports < 1024px
- `assets/css/mobile-nav.css` — styles for top bar, bottom tabs, breakpoint hiding of desktop navbar
- `assets/js/common/mobile-nav.js` — active-tab assignment from `<body data-page>` attribute
- 4 new i18n keys (CZ + EN): `mobile.nav.home`, `mobile.nav.validator`, `mobile.nav.parser`, `mobile.nav.viewer`
- safe-area-inset support for iPhone X+ notch + home indicator
- Settings button in mobile top bar opens existing AI agents modal

### Changed
- Existing desktop `.navbar` hidden < 1024px via media query
- `body` reserves 64px bottom padding < 1024px to clear fixed bottom tabs
- Footer tech badges hidden < 1024px; meta items wrap

### Notes
- Page content inside each route still uses the desktop layout — separate Phase 12b-f handle per-page mobile redesigns.

SW cache bumped v39 → v40.
```

- [ ] **Step 4: Final test pass**
```bash
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 714/714.

- [ ] **Step 5: Commit + push**
```bash
git add sw.js dist/sw.js PLAN.md CHANGELOG.md
git commit -m "chore(phase-12a): SW v39→v40 + PLAN/CHANGELOG"
git push -u origin phase-12a-mobile-foundation
```

Capture and report the PR URL.

---

## Self-Review Notes

**Spec coverage check:**
- Top bar (48px, brand + settings) → Task 1 (CSS) + Tasks 3-4 (HTML) ✓
- Bottom tabs (4 tabs, fixed, 64px) → Task 1 (CSS) + Tasks 3-4 (HTML) + Task 2 (active class JS) ✓
- Breakpoint 1024px → Task 1 ✓
- Hide existing navbar < 1024px → Task 1 ✓
- safe-area insets → Task 1 ✓
- i18n CZ+EN → Task 2 ✓
- Compact footer → Task 5 ✓
- Tablet (768-1023) inherits mobile pattern (per spec) → Task 1 (no special tablet override beyond minor padding) ✓
- Settings button opens existing AI agents modal → Task 3 (via `ai:openSettings` event, already wired in init.js) ✓

**Type consistency:**
- CSS class names: `bim-mobile-topbar`, `bim-mobile-tabs`, `bim-mobile-tabs__tab`, `is-active` — consistent everywhere
- Page identifiers: `home`, `validator`, `parser`, `viewer` — same in `body[data-page]`, `data-tab` attribute, i18n keys
- HTML structure identical across all 4 pages (homepage + 3 subpages just differ in href paths)

**Test count progression:**
- Baseline: 705
- After T1: 705 (CSS only)
- After T2: 711 (+6 mobile-nav tests)
- After T3: 711 (HTML only)
- After T4: 711 (HTML only)
- After T5: 714 (+3 DOM smoke tests)
- After T6: 714 (docs only)

**Risks:**
- `body { padding-bottom: 64px }` < 1024px may conflict with pages that already use bottom positioning (e.g., chat launcher floats bottom-right). Acceptable: launcher uses `position: fixed` with explicit `bottom: 24px` — fixed positioning ignores body padding.
- `.navbar { display: none !important }` < 1024px also hides bug-report button and wizard tour button currently in navbar. Mitigation: those buttons reachable through other UI (chat panel, or future deep links). Not blocking for Phase 12a.
- Desktop CSS may have leftover assumptions about scroll padding-bottom. Verify by visiting desktop and confirming no extra whitespace at bottom of pages.

**Out of scope for Phase 12a:**
- Page content responsive (12b-f handle that)
- Chat panel bottom sheet (Phase 12d)
- File upload touch (Phase 12c)
- Wizard tour mobile-aware (later)

**Final state:** 714 tests, sticky top bar + bottom tabs live on all 4 pages, existing desktop navbar hidden < 1024px. Pages still look desktop-y inside but the navigation chrome is responsive.
