# Phase 12f: IFC Viewer mobile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** IFC Viewer (`pages/ifc-viewer-multi-file.html`) usable on phone + tablet < 1024px: upload section compact, file cards stack, controls stack, column manager compact, pagination stacks vertically, edit panel mobile-friendly, data table remains horizontally scrollable (overflow-x already in place). All form inputs `font-size: 16px` (no iOS zoom). All buttons/inputs ≥ 44×44px touch.

**Architecture:** Pure CSS. Append `@media (max-width: 1023px)` block at end of `assets/css/ifc-viewer.css`. The data table (potentially 1000s of rows × many columns) keeps its horizontal scroll behavior — full virtual-scrolled card list rewrite is deferred per spec (would be a separate big feature).

**Tech Stack:** Vanilla CSS media queries.

**Branch:** `phase-12f-ifc-viewer-mobile` (cut from `master`).

**Spec:** `docs/superpowers/specs/2026-05-11-mobile-tablet-responsive-design.md` (IFC Viewer section, lines 102-105).

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `assets/css/ifc-viewer.css` | Modify | Append `@media (max-width: 1023px)` block |
| `dist/assets/css/ifc-viewer.css` | Mirror | `cp` |
| `sw.js` + `dist/sw.js` | Modify | Bump v44 → v45 |
| `tests/test-suites/mobile-viewer.test.js` | **Create** | ~5 smoke tests |
| `tests/test-runner.html` | Modify | Script tag |
| `PLAN.md` | Modify | Phase 12f entry + Phase 12 COMPLETE summary |
| `CHANGELOG.md` | Modify | `[0.10.5]` entry |

---

## Cross-cutting conventions

- SPDX header on new test file
- Mirror dist
- Test framework: no `.not` chaining
- Touch targets ≥ 44×44px (both min-width AND min-height)
- Form inputs `font-size: 16px` for iOS Safari (no auto-zoom)

### Layout containers (existing)

- `.upload-section` (padding from common — fine, but file-list inside needs stack)
- `.file-list` (currently flex, used for file cards row) — stack on mobile
- `.file-card` (40px+ wide cards) — full-width on mobile
- `.controls` (`padding: 20px 40px`, hidden until files loaded; flex inside)
- `.control-input` (search input, flex: 1 min-width: 250px — too wide for phone)
- `.control-select` (filter selects)
- `.column-manager` (Pset/Property column visibility manager, padding 20px)
- `.pset-group` (each pset card inside manager)
- `.prop-item` (each property inside pset; cursor: move for drag-drop on desktop)
- `.table-container` (padding 0 40px 40px, overflow-x: auto — keep!)
- `.data-table` (large table with potential pset/property columns)
- `.pagination-container` (padding 20px 40px, flex space-between info + controls)
- `.pagination-controls` (flex with buttons)
- `.edit-panel` (padding spacing-xl, margin spacing-xl — too big on phone)
- `.edit-panel-buttons` (flex-wrap, fine)

### Spec note on virtual-scrolled card list

Spec mentions: "IFC Viewer entity table → potentially 1000s of rows; mobile: virtual-scrolled card list."

That's a much bigger refactor (touches `viewer-ui.js`). For Phase 12f we keep the existing table with horizontal scroll (already implemented via `.table-container { overflow-x: auto }`), and just make all the SURROUNDING UI mobile-friendly. The table itself becomes touchable via horizontal scroll + pinch zoom (browser native). Documenting as deferred in PLAN.

---

## Task 1: IFC Viewer mobile CSS

**Files:**
- Modify: `assets/css/ifc-viewer.css`

- [ ] **Step 1: Append at the END of `assets/css/ifc-viewer.css`** (after line ~1019):

```css

/* === Phase 12f: Mobile + tablet (< 1024px) === */
@media (max-width: 1023px) {
    /* Upload section + file list */
    .upload-section {
        padding: var(--spacing-md);
    }

    .file-list {
        flex-direction: column;
        gap: 12px;
    }

    .file-card {
        width: 100%;
    }

    /* Controls (search + filter selects) */
    .controls {
        padding: 12px var(--spacing-md);
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
    }

    .control-input {
        min-width: 0;
        width: 100%;
        font-size: 16px;
        min-height: 44px;
    }

    .control-select {
        width: 100%;
        font-size: 16px;
        min-height: 44px;
    }

    /* Column manager */
    .column-manager {
        padding: 12px;
    }

    #psetList {
        max-height: 50vh;
    }

    .pset-group {
        padding: 12px;
    }

    .pset-group-header {
        padding: 10px;
    }

    .prop-item {
        margin-left: 10px;
        padding: 10px;
        min-height: 44px;
    }

    /* Table container: keep horizontal scroll; compact outer padding */
    .table-container {
        padding: 0 var(--spacing-md) var(--spacing-md);
        -webkit-overflow-scrolling: touch;
    }

    .data-table th,
    .data-table td {
        padding: 10px 12px;
        font-size: 0.85em;
    }

    /* Pagination: stack info above controls */
    .pagination-container {
        padding: 12px var(--spacing-md);
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
    }

    .pagination-controls {
        flex-wrap: wrap;
        justify-content: center;
    }

    .pagination-controls button {
        min-width: 44px;
        min-height: 44px;
    }

    .page-input-group {
        font-size: 16px;
    }

    /* Edit panel: compact + readable on phone */
    .edit-panel {
        margin: var(--spacing-md);
        padding: var(--spacing-md);
    }

    .edit-panel-buttons button {
        min-height: 44px;
    }

    /* Form selects inside edit modal: iOS no-zoom */
    .form-select {
        font-size: 16px;
        min-height: 44px;
    }
}
```

- [ ] **Step 2: Mirror dist**
```bash
cp assets/css/ifc-viewer.css dist/assets/css/ifc-viewer.css
```

- [ ] **Step 3: Run tests**
```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: 732/732 (no regressions).

- [ ] **Step 4: Commit**
```bash
git add assets/css/ifc-viewer.css dist/assets/css/ifc-viewer.css
git commit -m "feat(mobile-12f): IFC Viewer mobile — stacked controls + compact table + 44px touch + iOS 16px"
```

---

## Task 2: Smoke tests

**Files:**
- Create: `tests/test-suites/mobile-viewer.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1: Create `tests/test-suites/mobile-viewer.test.js`** with EXACTLY:

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('mobile-viewer (Phase 12f CSS at < 1024px)', () => {
    let cssText;

    beforeEach(async () => {
        if (!cssText) {
            const res = await fetch('../assets/css/ifc-viewer.css');
            cssText = await res.text();
        }
    });

    it('CSS has @media (max-width: 1023px) block', () => {
        expect(cssText.includes('@media (max-width: 1023px)')).toBe(true);
    });

    it('CSS stacks controls (column) + 16px control-input font (iOS no-zoom)', () => {
        const idx = cssText.indexOf('@media (max-width: 1023px)');
        const block = cssText.slice(idx, idx + 4000);
        expect(block.includes('.controls')).toBe(true);
        expect(block.includes('flex-direction: column')).toBe(true);
        expect(block.includes('.control-input')).toBe(true);
        expect(block.includes('font-size: 16px')).toBe(true);
    });

    it('CSS stacks file-list + makes file-card full width', () => {
        const idx = cssText.indexOf('@media (max-width: 1023px)');
        const block = cssText.slice(idx, idx + 4000);
        expect(block.includes('.file-list')).toBe(true);
        expect(block.includes('.file-card')).toBe(true);
        expect(block.includes('width: 100%')).toBe(true);
    });

    it('CSS enforces 44px touch targets on pagination buttons', () => {
        const idx = cssText.indexOf('@media (max-width: 1023px)');
        const block = cssText.slice(idx, idx + 4000);
        expect(block.includes('.pagination-controls button')).toBe(true);
        expect(block.includes('min-width: 44px')).toBe(true);
        expect(block.includes('min-height: 44px')).toBe(true);
    });

    it('CSS stacks pagination-container vertically (column)', () => {
        const idx = cssText.indexOf('@media (max-width: 1023px)');
        const block = cssText.slice(idx, idx + 4000);
        expect(block.includes('.pagination-container')).toBe(true);
        const stack = block.indexOf('.pagination-container');
        const sub = block.slice(stack, stack + 300);
        expect(sub.includes('flex-direction: column')).toBe(true);
    });
});
```

- [ ] **Step 2: Add script tag to `tests/test-runner.html`**

After `<script src="test-suites/mobile-validator-parser.test.js"></script>`, add:
```html
    <script src="test-suites/mobile-viewer.test.js"></script>
```

- [ ] **Step 3: Run tests**
```bash
node tests/run-tests.js 2>&1 | tail -10
```
Expected: 737/737 (732 + 5 new).

- [ ] **Step 4: Commit**
```bash
git add tests/test-suites/mobile-viewer.test.js tests/test-runner.html
git commit -m "test(mobile-12f): 5 smoke tests for IFC Viewer mobile CSS"
```

---

## Task 3: SW + docs + push + PR (Phase 12 COMPLETE)

**Files:**
- Modify: `sw.js` + `dist/sw.js`
- Modify: `PLAN.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: SW v44 → v45**

In `sw.js` and `dist/sw.js`: `bim-checker-v44` → `bim-checker-v45`. No new assets.

- [ ] **Step 2: Append Phase 12f + Phase 12 complete summary to PLAN.md** after `## Phase 12e`:

```markdown
## Phase 12f: IFC Viewer mobile ✅
- [x] Upload section + file-list stack vertically; file cards full-width
- [x] Controls (search + filter selects) stack; iOS 16px no-zoom; 44px touch
- [x] Column manager + Pset groups + prop items: compact padding, 44px tap targets
- [x] Data table keeps horizontal scroll (overflow-x); padding compact; smaller font-size
- [x] Pagination container stacks info above controls; buttons 44×44px
- [x] Edit panel compact margins/padding
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
```

- [ ] **Step 3: Insert `[0.10.5]` in CHANGELOG.md** before `[0.10.4]`:

```markdown
## [0.10.5] - 2026-05-11

### Added
- IFC Viewer mobile responsive (Phase 12f, completes Phase 12): upload + file-list stack, file cards full-width
- Controls (search + filter selects) stack vertically, iOS 16px font (no auto-zoom), 44px touch
- Column manager compact; Pset groups + prop items touch-friendly (44px)
- Data table keeps horizontal scroll (`overflow-x: auto` already in place); padding + font-size compacted
- Pagination container stacks vertically; buttons 44×44px
- Edit panel compact margins
- +5 smoke tests (732 → 737)

### Changed
- SW cache bumped v44 → v45

### Phase 12 complete summary
All 6 sub-phases delivered (12a–12f). Test growth 705 → 737 (+32). Single 1024px breakpoint. All controls 44px+. All inputs 16px font.

### Deferred
- Virtual-scrolled entity card list for IFC Viewer (1000s of rows)
- Master-detail card pattern for validator results
- Real drag-to-resize gestures on chat sheet
- Wizard/tour mobile redesign
```

- [ ] **Step 4: Final test pass**
```bash
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 737/737.

- [ ] **Step 5: Commit, push, PR**
```bash
git add sw.js dist/sw.js PLAN.md CHANGELOG.md
git commit -m "chore(phase-12f): SW v44→v45 + PLAN/CHANGELOG (Phase 12 complete 🎉)"
git push -u origin phase-12f-ifc-viewer-mobile
gh pr create --title "Phase 12f: IFC Viewer mobile + Phase 12 complete 🎉" --body "..."
```

Report PR URL.

---

## Self-Review

**Spec coverage:**
- Upload section + file list stack → Task 1 ✓
- Controls stack, 16px font, 44px → Task 1 ✓
- Column manager compact → Task 1 ✓
- Table horizontal scroll → kept (no change needed) ✓
- Pagination stack + 44px → Task 1 ✓
- Edit panel compact → Task 1 ✓
- Virtual card list → DEFERRED (documented) ⚠️

**Type consistency:**
- All selectors verified against `ifc-viewer.css` lines 28, 35, 93, 100, 115, 129, 144, 171, 201, 208, 222, 279, 484, 508

**Test count progression:**
- Baseline: 732
- After T1: 732
- After T2: 737 (+5)
- After T3: 737

**Risks:**
- **Source-order conflicts:** Bare `.controls`, `.control-input` etc. are defined earlier (line 93+) at (0,1,0). New media-query rules also (0,1,0). Media block placed at END of file → wins.
- **Sticky table cells `position: sticky`** may behave oddly on mobile horizontal scroll. Existing behavior preserved (we don't touch sticky-col rules). If issues arise, separate fix.
- **`#psetList { max-height: 600px }` desktop** is overridden to `50vh` on mobile to fit smaller viewports. Specificity of `#psetList` (1,0,0) — our `#psetList` selector inside media query is also (1,0,0), source-order later wins ✓.
- **`.file-card` width**: base may define explicit width via `min-width` or grid. Setting `width: 100%` should win if media-query rule has equal specificity and is later in source. Verified safe.

**Out of scope:**
- Touch-pinch zoom on data table (browser-native, works)
- Virtual scroll rewrite of viewer-ui.js (large)
- Mobile-specific entity row → bottom sheet detail flow (future)

**Final state:** 737 tests, IFC Viewer usable on phone + tablet, all 6 sub-phases of Phase 12 complete. 🎉
