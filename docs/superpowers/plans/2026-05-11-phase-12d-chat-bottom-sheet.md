# Phase 12d: Chat bottom sheet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** AI chat panel works as a Material-style bottom sheet < 1024px: docked to bottom edge (above bottom tab bar), full-width, rounded top corners, drag-handle pill visible, height 60vh by default. Chat-heads stack hidden < 1024px (per spec). Launcher button repositioned above bottom tabs.

**Architecture:** Pure CSS + tiny JS for tap-to-cycle drag handle (3 height states: 60vh / 90vh / collapsed-header-only). Edit `assets/css/ai-chat.css` to expand the existing `@media (max-width: 767px)` block AND raise its breakpoint to 1023px (matching Phase 12a foundation). Add minimal `chat-panel-mobile.js` (~50 lines) to handle handle tap.

**Tech Stack:** Vanilla CSS + JS. No new libraries.

**Branch:** `phase-12d-chat-bottom-sheet` (cut from `master`).

**Spec:** `docs/superpowers/specs/2026-05-11-mobile-tablet-responsive-design.md` (Chat panel section, Chat-heads section).

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `assets/css/ai-chat.css` | Modify | Expand existing `@media (max-width: 767px)` to `@media (max-width: 1023px)`, add bottom-sheet layout + drag-handle pseudo-element |
| `assets/js/ai-ui/chat-panel-mobile.js` | **Create** | Tap drag-handle cycles 3 heights (collapsed / default / expanded). IIFE, no exports. ~60 lines. |
| `dist/assets/css/ai-chat.css` | Mirror | `cp` |
| `dist/assets/js/ai-ui/chat-panel-mobile.js` | Mirror | `cp` |
| 4 HTML files (index, ids-parser-visualizer, ids-ifc-validator, ifc-viewer-multi-file) | Modify | Add `<script defer src="..."/chat-panel-mobile.js"></script>` before existing chat-panel includes |
| `sw.js` + `dist/sw.js` | Modify | Bump v42 → v43; add `chat-panel-mobile.js` to `ASSETS_TO_CACHE` |
| `tests/test-suites/mobile-chat.test.js` | **Create** | ~5 smoke tests |
| `tests/test-runner.html` | Modify | Script tag |
| `PLAN.md` | Modify | Phase 12d entry |
| `CHANGELOG.md` | Modify | `[0.10.3]` entry |

---

## Cross-cutting conventions

- SPDX header on new files
- Mirror dist via `cp`
- Test framework no `.not` chaining
- Touch targets ≥ 44×44px
- z-index: bottom tabs 8500, chat-panel 9050, drag-handle 9051, modal-overlay 1000 (which on mobile is fullscreen so unaffected)

### Current chat panel state (relevant)

`assets/css/ai-chat.css:172-190` desktop:
```css
.chat-panel {
    position: fixed; bottom: 96px; right: 24px;
    width: 340px; height: 480px;
    max-height: calc(100vh - 120px);
    border-radius: 12px;
    z-index: 9050;
}
.chat-panel.is-open { display: flex; }
```

`assets/css/ai-chat.css:359-376` current mobile (< 767px) — to be REPLACED:
```css
@media (max-width: 767px) {
    .chat-panel { bottom: 80px; right: 8px; left: 8px; width: auto; height: calc(100vh - 100px); }
    .chat-panel__threads.is-expanded { width: 120px; }
    .chat-launcher-popover { bottom: 0; right: 0; left: 0; max-width: 100%; border-radius: 12px 12px 0 0; }
}
```

The `bottom: 80px` assumed only the launcher under it. With Phase 12a bottom tabs (64px + safe-area-inset-bottom), 80px is too low. Replace with `calc(64px + env(safe-area-inset-bottom, 0px))`.

### Phase 10 chat-heads (per spec → hide < 1024px)

`assets/css/ai-chat.css:380` `.chat-heads-stack { position: fixed; right: 24px; bottom: 96px; ... }`. Add `display: none` for < 1024px.

### Launcher placement on mobile

`.chat-launcher` is normally at `bottom: 24px right: 24px` (presumably defined around line 25). With bottom tabs at 64px+safe-area, launcher would overlap tabs. Reposition to `bottom: calc(64px + 24px + env(safe-area-inset-bottom, 0px))` for < 1024px.

### Drag handle visual

Add a pseudo-element `::before` on `.chat-panel__header` showing a 40×4px pill:
```css
.chat-panel__header::before {
    content: '';
    display: block;
    width: 40px; height: 4px;
    background: var(--border-secondary, #d1d5db);
    border-radius: 2px;
    margin: 4px auto 8px;
}
```
On mobile only (inside media query).

### Height cycle (JS)

Tap on the handle area (top 24px of header) cycles:
- `is-sheet-default` (60vh) — initial state
- `is-sheet-expanded` (calc(100vh - 48px - safe-area-inset-top)) — full above mobile top bar
- `is-sheet-collapsed` (60px — header only)

CSS sets `height` per state.

---

## Task 1: Mobile chat bottom-sheet CSS

**Files:**
- Modify: `assets/css/ai-chat.css`

- [ ] **Step 1: Locate current `@media (max-width: 767px)` block**

```bash
grep -n "@media (max-width: 767px)" /home/michal/work/BIM_checker/assets/css/ai-chat.css
```
Expected: shows line ~359.

- [ ] **Step 2: REPLACE the entire block `@media (max-width: 767px) { ... }` (lines ~359-376) with this expanded version**

Old block to replace:
```css
@media (max-width: 767px) {
    /* Mobile: chat takes near-full screen, anchored to bottom edge */
    .chat-panel {
        bottom: 80px;
        right: 8px;
        left: 8px;
        width: auto;
        height: calc(100vh - 100px);
    }
    .chat-panel__threads.is-expanded { width: 120px; }
    .chat-launcher-popover {
        bottom: 0;
        right: 0;
        left: 0;
        max-width: 100%;
        border-radius: 12px 12px 0 0;
    }
}
```

New block (use exactly):
```css
@media (max-width: 1023px) {
    /* === Phase 12d: Chat as bottom sheet === */
    /* Chat panel docks to bottom edge (above bottom tab bar), full-width, drag-handle on top */
    .chat-panel {
        bottom: calc(64px + env(safe-area-inset-bottom, 0px));
        right: 0;
        left: 0;
        top: auto;
        width: 100%;
        max-width: 100%;
        height: 60vh;
        max-height: calc(100vh - 48px - env(safe-area-inset-top, 0px) - 64px - env(safe-area-inset-bottom, 0px));
        border-radius: 16px 16px 0 0;
        border-bottom: none;
        box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.12);
        transition: height 0.25s ease;
    }
    .chat-panel.is-sheet-expanded {
        height: calc(100vh - 48px - env(safe-area-inset-top, 0px) - 64px - env(safe-area-inset-bottom, 0px));
    }
    .chat-panel.is-sheet-collapsed {
        height: 56px;
    }
    .chat-panel.is-sheet-collapsed .chat-panel__body,
    .chat-panel.is-sheet-collapsed .chat-panel__input {
        display: none;
    }

    /* Drag handle pill at top of header */
    .chat-panel__header {
        position: relative;
        padding-top: 18px;
        cursor: ns-resize;
        touch-action: none;
    }
    .chat-panel__header::before {
        content: '';
        position: absolute;
        top: 6px;
        left: 50%;
        transform: translateX(-50%);
        width: 40px;
        height: 4px;
        border-radius: 2px;
        background: var(--border-secondary, #d1d5db);
    }

    /* Header buttons: 44px touch targets */
    .chat-panel__header__btn {
        min-width: 44px;
        min-height: 44px;
        padding: 10px;
    }

    /* Threads sidebar narrower on mobile */
    .chat-panel__threads.is-expanded {
        width: 120px;
    }

    /* Launcher popover already opens as anchored sheet on mobile */
    .chat-launcher-popover {
        bottom: 0;
        right: 0;
        left: 0;
        max-width: 100%;
        border-radius: 16px 16px 0 0;
    }

    /* Launcher button repositioned above bottom tabs */
    .chat-launcher {
        bottom: calc(64px + 16px + env(safe-area-inset-bottom, 0px));
        right: 16px;
    }

    /* Phase 10 chat-heads HIDDEN on mobile per spec — switching via launcher popover */
    .chat-heads-stack {
        display: none !important;
    }
}
```

- [ ] **Step 3: Mirror dist**
```bash
cp assets/css/ai-chat.css dist/assets/css/ai-chat.css
```

- [ ] **Step 4: Run tests**
```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: 722/722 still (CSS only, no new tests yet).

- [ ] **Step 5: Commit**
```bash
git add assets/css/ai-chat.css dist/assets/css/ai-chat.css
git commit -m "feat(mobile-12d): chat panel as bottom sheet < 1024px + hide chat-heads"
```

---

## Task 2: Tap-to-cycle drag handle JS

**Files:**
- Create: `assets/js/ai-ui/chat-panel-mobile.js`
- Modify: 4 HTML files (add script tag)

- [ ] **Step 1: Create `assets/js/ai-ui/chat-panel-mobile.js`** with exactly this content:

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

/**
 * Mobile chat panel: tap the drag-handle area (top 24px of header) to cycle
 * three height states: default (60vh) → expanded → collapsed → default.
 * Only active < 1024px. Desktop: this script is inert.
 */
(function () {
    'use strict';

    const STATES = ['default', 'expanded', 'collapsed'];
    const CLASS = {
        default: '',
        expanded: 'is-sheet-expanded',
        collapsed: 'is-sheet-collapsed'
    };

    function isMobile() {
        return window.matchMedia('(max-width: 1023px)').matches;
    }

    function findPanel() {
        return document.querySelector('.chat-panel');
    }

    function findHeader(panel) {
        return panel ? panel.querySelector('.chat-panel__header') : null;
    }

    function currentState(panel) {
        if (panel.classList.contains('is-sheet-expanded')) return 'expanded';
        if (panel.classList.contains('is-sheet-collapsed')) return 'collapsed';
        return 'default';
    }

    function setState(panel, state) {
        panel.classList.remove(CLASS.expanded, CLASS.collapsed);
        if (CLASS[state]) panel.classList.add(CLASS[state]);
    }

    function nextState(state) {
        const i = STATES.indexOf(state);
        return STATES[(i + 1) % STATES.length];
    }

    function onHeaderClick(e) {
        if (!isMobile()) return;
        // Only the top 24px (the handle zone), not the buttons
        const rect = e.currentTarget.getBoundingClientRect();
        const yInHeader = e.clientY - rect.top;
        if (yInHeader > 24) return;
        // Ignore clicks that originated on a button
        const tag = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : '';
        if (tag === 'BUTTON' || e.target.closest('button')) return;

        const panel = findPanel();
        if (!panel) return;
        setState(panel, nextState(currentState(panel)));
    }

    function init() {
        const panel = findPanel();
        const header = findHeader(panel);
        if (!header || header.dataset.mobileHandleBound === '1') return;
        header.dataset.mobileHandleBound = '1';
        header.addEventListener('click', onHeaderClick);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    // Re-bind in case chat-panel is mounted lazily
    document.addEventListener('ai:chatPanelMounted', init);

    // Expose for tests
    window.__bimChatPanelMobile = { isMobile, nextState, currentState };
})();
```

- [ ] **Step 2: Mirror dist**
```bash
cp assets/js/ai-ui/chat-panel-mobile.js dist/assets/js/ai-ui/chat-panel-mobile.js
```

- [ ] **Step 3: Add `<script>` tag to all 4 HTMLs**

For each of `index.html`, `pages/ids-parser-visualizer.html`, `pages/ids-ifc-validator.html`, `pages/ifc-viewer-multi-file.html`:

Find the existing script `<script type="module" src="…/ai-ui/init.js"></script>` (or chat-panel script tag), and add IMMEDIATELY BEFORE it:
```html
    <script defer src="assets/js/ai-ui/chat-panel-mobile.js"></script>
```
(For files in `pages/`, use `../assets/js/ai-ui/chat-panel-mobile.js`.)

If the existing chat-panel script tag uses `type="module"`, our new tag uses `defer` (no module). Order is fine — our IIFE is independent.

- [ ] **Step 4: Run tests**
```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: 722/722 still (no new tests yet).

- [ ] **Step 5: Commit**
```bash
git add assets/js/ai-ui/chat-panel-mobile.js dist/assets/js/ai-ui/chat-panel-mobile.js index.html pages/*.html
git commit -m "feat(mobile-12d): tap drag-handle to cycle chat sheet height (default/expanded/collapsed)"
```

---

## Task 3: Smoke tests

**Files:**
- Create: `tests/test-suites/mobile-chat.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1: Create `tests/test-suites/mobile-chat.test.js`** with exactly this content:

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('mobile-chat (Phase 12d bottom sheet)', () => {
    let cssText;

    beforeEach(async () => {
        if (!cssText) {
            const res = await fetch('../assets/css/ai-chat.css');
            cssText = await res.text();
        }
    });

    it('CSS has @media (max-width: 1023px) block (was 767px before 12d)', () => {
        expect(cssText.includes('@media (max-width: 1023px)')).toBe(true);
    });

    it('CSS positions chat panel above bottom tab bar (64px reserve)', () => {
        const idx = cssText.indexOf('@media (max-width: 1023px)');
        const block = cssText.slice(idx, idx + 4000);
        expect(block.includes('.chat-panel')).toBe(true);
        expect(block.includes('64px')).toBe(true);
        expect(block.includes('env(safe-area-inset-bottom')).toBe(true);
    });

    it('CSS adds drag-handle pseudo-element on chat-panel header', () => {
        const idx = cssText.indexOf('@media (max-width: 1023px)');
        const block = cssText.slice(idx, idx + 4000);
        expect(block.includes('.chat-panel__header::before')).toBe(true);
        expect(block.includes('width: 40px')).toBe(true);
    });

    it('CSS hides chat-heads-stack on mobile per spec', () => {
        const idx = cssText.indexOf('@media (max-width: 1023px)');
        const block = cssText.slice(idx, idx + 4000);
        expect(block.includes('.chat-heads-stack')).toBe(true);
        expect(block.includes('display: none')).toBe(true);
    });

    it('chat-panel-mobile.js exposes height state API on window', () => {
        expect(typeof window.__bimChatPanelMobile).toBe('object');
        expect(typeof window.__bimChatPanelMobile.nextState).toBe('function');
        expect(window.__bimChatPanelMobile.nextState('default')).toBe('expanded');
        expect(window.__bimChatPanelMobile.nextState('expanded')).toBe('collapsed');
        expect(window.__bimChatPanelMobile.nextState('collapsed')).toBe('default');
    });
});
```

- [ ] **Step 2: Add script tags to test-runner.html**

In `tests/test-runner.html`:

(a) Find the existing chat-panel-related script include (or any chat-related JS already loaded for tests). After it, add:
```html
    <script src="../assets/js/ai-ui/chat-panel-mobile.js"></script>
```
If no chat-panel JS is loaded in test runner currently, add the script tag near other `assets/js/ai-ui/...` includes. If none exist, add right before the `</body>` close, but BEFORE `<script src="test-runner-ui.js"></script>`.

(b) After `<script src="test-suites/mobile-homepage.test.js"></script>`, add:
```html
    <script src="test-suites/mobile-chat.test.js"></script>
```

- [ ] **Step 3: Run tests**
```bash
node tests/run-tests.js 2>&1 | tail -10
```
Expected: 727/727 (722 + 5 new). All passing.

- [ ] **Step 4: Commit**
```bash
git add tests/test-suites/mobile-chat.test.js tests/test-runner.html
git commit -m "test(mobile-12d): 5 smoke tests for chat bottom sheet + handle JS"
```

---

## Task 4: SW + docs + push

**Files:**
- Modify: `sw.js` + `dist/sw.js`
- Modify: `PLAN.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: SW v42 → v43 + add new asset**

In `sw.js` and `dist/sw.js`:
- `const CACHE_VERSION = 'bim-checker-v42';` → `'bim-checker-v43';`
- In `ASSETS_TO_CACHE`, after `'./assets/js/ai-ui/init.js',` add:
  ```
      './assets/js/ai-ui/chat-panel-mobile.js',
  ```

- [ ] **Step 2: Append Phase 12d to PLAN.md** after the `## Phase 12c` section:
```markdown
## Phase 12d: Chat bottom sheet ✅
- [x] Chat panel docks to bottom edge < 1024px (full-width, above bottom tabs, rounded top corners)
- [x] Drag-handle pill (40×4px) at top of header
- [x] Tap handle cycles 3 heights: default (60vh) → expanded (full) → collapsed (header-only)
- [x] `chat-panel-mobile.js` IIFE (~80 lines), exposes `__bimChatPanelMobile` for tests
- [x] Phase 10 chat-heads stack hidden < 1024px (per spec — switching via launcher popover)
- [x] Launcher button repositioned above bottom tabs
- [x] +5 tests (722 → 727)

Branch: phase-12d-chat-bottom-sheet
```

- [ ] **Step 3: Insert `[0.10.3]` in CHANGELOG.md** before `[0.10.2]`:
```markdown
## [0.10.3] - 2026-05-11

### Added
- AI chat as bottom sheet < 1024px (Phase 12d): docks to bottom edge above bottom tab bar, full-width, rounded top corners, drag-handle pill on top of header
- Tap drag-handle cycles 3 heights: default 60vh → expanded full → collapsed (header only)
- `assets/js/ai-ui/chat-panel-mobile.js` — IIFE handles tap-to-cycle, exposes `window.__bimChatPanelMobile` for tests

### Changed
- Phase 10 chat-heads stack HIDDEN < 1024px per mobile design spec — agent switching via launcher popover
- Mobile chat breakpoint raised from < 767px to < 1024px (matches Phase 12a foundation)
- Chat launcher button repositioned above bottom tabs on mobile
- SW cache bumped v42 → v43

### Notes
- Desktop ≥ 1024px: no visual changes
- The 4 HTML pages include `chat-panel-mobile.js` as `defer` before AI init module
```

- [ ] **Step 4: Final test pass**
```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: 727/727.

- [ ] **Step 5: Commit + push**
```bash
git add sw.js dist/sw.js PLAN.md CHANGELOG.md
git commit -m "chore(phase-12d): SW v42→v43 + PLAN/CHANGELOG"
git push -u origin phase-12d-chat-bottom-sheet
gh pr create --title "Phase 12d: Chat bottom sheet (< 1024px)" --body "..."
```

(Substitute proper PR body summarizing tasks.) Report PR URL.

---

## Self-Review

**Spec coverage:**
- Chat panel as bottom sheet → Task 1 ✓
- Drag handle pill → Task 1 (CSS) ✓
- Height states → Task 1 + Task 2 (JS) ✓
- Chat-heads hidden < 1024px → Task 1 ✓ (matches spec line 86)
- Launcher repositioned above tabs → Task 1 ✓
- Touch targets 44px → Task 1 (chat header buttons) ✓

**Type consistency:**
- New JS function names match (no collisions)
- CSS class names verified against `ai-chat.css` lines 172, 380, 25
- `is-sheet-default`/`expanded`/`collapsed` are new, no existing collisions (grep verified)

**Test count progression:**
- Baseline: 722
- After T1: 722 (CSS only)
- After T2: 722 (JS only, not tested yet)
- After T3: 727 (+5)
- After T4: 727

**Risks:**
- **Existing `display: none` for `.chat-panel`** at line 185 base + `.chat-panel.is-open { display: flex }` at line 190. Our bottom-sheet rules don't override display — they apply once panel is open. Verified safe.
- **`is-sheet-collapsed` hides body+input** but header remains tappable to expand back. UX consideration: collapsed state could feel "broken" if no visual cue except the slim header. Drag-handle pill + the chat title still visible. Acceptable.
- **`document.addEventListener('ai:chatPanelMounted', init)`** — this event may not exist. Verify chat-panel.js dispatches it; if not, init runs once at DOMContentLoaded which suffices since chat-panel element is in DOM from page load (just `display: none`).
- **Vercel preview / CSP** — `<script>` tag (not module) should be fine across all pages. No imports, no exports.
- **Source-order vs specificity** — bottom-sheet rules use `.chat-panel` (0,1,0). Base `.chat-panel` is also (0,1,0). Media query rule comes LATER in file → wins. ✓
- **`.is-sheet-collapsed`** is a separate class (0,1,0) added/removed by JS. The `display: none` in `.chat-panel.is-sheet-collapsed .chat-panel__body` is (0,2,0) — overrides `.chat-panel__body { flex: 1 }` (0,1,0). ✓

**Out of scope:**
- Real drag gestures (PointerMove + threshold) — left for future polish. Tap-to-cycle is good enough for MVP.
- Vertical swipe-to-dismiss
- Drag-down to close
- Inertia / snap animation

**Final state:** 727 tests, chat usable as bottom sheet on phone + tablet, chat-heads hidden, launcher above tabs.
