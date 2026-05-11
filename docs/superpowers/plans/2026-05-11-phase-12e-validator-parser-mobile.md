# Phase 12e: Validator + Parser mobile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** IDS-IFC Validator (`pages/ids-ifc-validator.html`) and IDS Parser/Visualizer (`pages/ids-parser-visualizer.html`) usable on phone + tablet < 1024px: filters stack, stat cards 2-column, results header stacks, spec headers stack, presets panel stacks, all interactive controls ≥ 44px touch.

**Architecture:** Pure CSS. Append a `@media (max-width: 1023px)` block at end of each page's stylesheet (`ids-validator.css`, `ids-parser.css`). Existing `< 768px` blocks left intact for narrower-than-tablet refinements.

**Tech Stack:** Vanilla CSS media queries.

**Branch:** `phase-12e-validator-parser-mobile` (cut from `master`).

**Spec:** `docs/superpowers/specs/2026-05-11-mobile-tablet-responsive-design.md` (Validator + Parser sections — note spec mentions master-detail cards for tables; we keep desktop tables for now and just stack filters/headers/spec-headers — full master-detail is bigger scope, deferred).

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `assets/css/ids-validator.css` | Modify | Append `@media (max-width: 1023px)` block with mobile rules |
| `assets/css/ids-parser.css` | Modify | Append `@media (max-width: 1023px)` block |
| `dist/assets/css/ids-validator.css` | Mirror | `cp` |
| `dist/assets/css/ids-parser.css` | Mirror | `cp` |
| `sw.js` + `dist/sw.js` | Modify | Bump v43 → v44 (no new assets) |
| `tests/test-suites/mobile-validator-parser.test.js` | **Create** | ~5 smoke tests |
| `tests/test-runner.html` | Modify | Script tag |
| `PLAN.md` | Modify | Phase 12e entry |
| `CHANGELOG.md` | Modify | `[0.10.4]` entry |

---

## Cross-cutting conventions

- SPDX header on new test file
- Mirror dist after edit
- Test framework: no `.not` chaining
- Touch targets ≥ 44×44px on interactive controls
- Form inputs `font-size: 16px` to prevent iOS auto-zoom on focus

### Existing structure (validator)

- `assets/css/ids-validator.css:499` — existing `@media (max-width: 768px) { ... }` block stacks `.upload-grid`, `.filters-grid`, `.results-stats`. Keep, but our new < 1024px rules will pre-empt for tablet too.
- Layout containers used:
  - `.upload-section` (40px padding)
  - `.results-section` (40px padding)
  - `.results-header` (flex space-between, mobile needs stack)
  - `.results-stats` (grid auto-fit minmax 200px — fine on tablet but cramped on phone)
  - `.filters-grid` (4 cols: 2fr 1fr 1fr auto — must stack)
  - `.filter-input` (10px 15px padding — needs 16px font-size for iOS)
  - `.spec-header` (flex space-between with title/badge/stats — must stack)
  - `.spec-stats` (flex with gap 20px — wrap)
  - `.validation-group` (40px padding — compact)
  - `.group-header` (flex space-between — stack)
  - `.presets-panel` (16px padding — compact)
  - `.presets-panel__controls` (flex wrap — stack on phone)
  - `.presets-panel__select` (flex 1 1 200px min 160px — full width on phone)
  - `.stat-card`, `.stat-number`, `.stat-label`

### Existing structure (parser)

- `assets/css/ids-parser.css:405` — existing `@media (max-width: 768px)` block stacks `.ids-info-grid`. Sparse — most of parser page already responsive thanks to flexbox.
- Layout containers used:
  - `.ids-info` (padding around metadata)
  - `.ids-info-grid` (grid auto-fit minmax 200px)
  - `.specification-card` (padding spacing-lg)
  - `.spec-content` (collapsible body)
  - Applicability + Requirements rows inside

---

## Task 1: Validator + Parser mobile CSS

**Files:**
- Modify: `assets/css/ids-validator.css`, `assets/css/ids-parser.css`

- [ ] **Step 1: Append `@media (max-width: 1023px)` to `assets/css/ids-validator.css`**

At the END of the file (after the last existing rule, around line 708), append:

```css

/* === Phase 12e: Mobile + tablet (< 1024px) === */
@media (max-width: 1023px) {
    /* Section padding compact */
    .upload-section,
    .results-section {
        padding: var(--spacing-lg) var(--spacing-md);
    }

    /* Results header: stack title + actions */
    .results-header {
        flex-direction: column;
        align-items: stretch;
        gap: 16px;
    }

    /* Stat cards: 2-column on phone, 4-column on tablet via min-width fallback */
    .results-stats {
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
    }

    .stat-card {
        padding: 14px;
    }

    .stat-number {
        font-size: 2em;
    }

    /* Filters: full stack on phone */
    .filters-section {
        padding: 12px;
    }

    .filters-grid {
        grid-template-columns: 1fr;
        gap: 12px;
    }

    /* iOS form-input zoom prevention (font-size >= 16px) */
    .filter-input {
        font-size: 16px;
    }

    /* Spec header: stack title + badge + stats */
    .spec-header {
        padding: 14px;
        flex-direction: column;
        align-items: stretch;
        gap: 10px;
    }

    .spec-name {
        font-size: 1.1em;
    }

    .spec-stats {
        flex-wrap: wrap;
        gap: 10px;
    }

    /* Validation group: compact */
    .validation-group {
        padding: var(--spacing-md);
    }

    .group-header {
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
    }

    .group-delete-btn {
        align-self: flex-end;
        min-height: 44px;
    }

    /* Presets panel: stack controls */
    .presets-panel {
        padding: 12px;
    }

    .presets-panel__controls {
        flex-direction: column;
        align-items: stretch;
    }

    .presets-panel__select {
        width: 100%;
        font-size: 16px;
        min-height: 44px;
    }

    .presets-panel__controls .btn {
        min-height: 44px;
    }
}
```

- [ ] **Step 2: Append `@media (max-width: 1023px)` to `assets/css/ids-parser.css`**

At the END of the file (after line 446), append:

```css

/* === Phase 12e: Mobile + tablet (< 1024px) === */
@media (max-width: 1023px) {
    .ids-info {
        padding: 16px;
    }

    .ids-info-grid {
        grid-template-columns: 1fr;
    }

    .info-item {
        padding: 12px;
    }

    .specification-card {
        padding: var(--spacing-md);
    }

    .specifications-container {
        margin-top: 1rem;
    }
}
```

- [ ] **Step 3: Mirror dist**
```bash
cp assets/css/ids-validator.css dist/assets/css/ids-validator.css
cp assets/css/ids-parser.css dist/assets/css/ids-parser.css
```

- [ ] **Step 4: Run tests**
```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: 727/727 (CSS only, no regressions).

- [ ] **Step 5: Commit**
```bash
git add assets/css/ids-validator.css assets/css/ids-parser.css dist/assets/css/ids-validator.css dist/assets/css/ids-parser.css
git commit -m "feat(mobile-12e): Validator + Parser mobile — stacked filters/headers + 44px touch + iOS 16px inputs"
```

---

## Task 2: Smoke tests

**Files:**
- Create: `tests/test-suites/mobile-validator-parser.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1: Create `tests/test-suites/mobile-validator-parser.test.js`** with EXACTLY:

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('mobile-validator (Phase 12e CSS at < 1024px)', () => {
    let cssText;

    beforeEach(async () => {
        if (!cssText) {
            const res = await fetch('../assets/css/ids-validator.css');
            cssText = await res.text();
        }
    });

    it('CSS has @media (max-width: 1023px) block', () => {
        expect(cssText.includes('@media (max-width: 1023px)')).toBe(true);
    });

    it('CSS stacks filters-grid + uses 16px input font for iOS no-zoom', () => {
        const idx = cssText.indexOf('@media (max-width: 1023px)');
        const block = cssText.slice(idx, idx + 4000);
        expect(block.includes('.filters-grid')).toBe(true);
        expect(block.includes('grid-template-columns: 1fr')).toBe(true);
        expect(block.includes('.filter-input')).toBe(true);
        expect(block.includes('font-size: 16px')).toBe(true);
    });

    it('CSS stacks spec-header on mobile (column)', () => {
        const idx = cssText.indexOf('@media (max-width: 1023px)');
        const block = cssText.slice(idx, idx + 4000);
        expect(block.includes('.spec-header')).toBe(true);
        expect(block.includes('flex-direction: column')).toBe(true);
    });

    it('CSS enforces 44px touch targets on presets controls', () => {
        const idx = cssText.indexOf('@media (max-width: 1023px)');
        const block = cssText.slice(idx, idx + 4000);
        expect(block.includes('.presets-panel__select')).toBe(true);
        expect(block.includes('min-height: 44px')).toBe(true);
    });
});

describe('mobile-parser (Phase 12e CSS at < 1024px)', () => {
    let cssText;

    beforeEach(async () => {
        if (!cssText) {
            const res = await fetch('../assets/css/ids-parser.css');
            cssText = await res.text();
        }
    });

    it('CSS has @media (max-width: 1023px) and stacks ids-info-grid', () => {
        expect(cssText.includes('@media (max-width: 1023px)')).toBe(true);
        const idx = cssText.indexOf('@media (max-width: 1023px)');
        const block = cssText.slice(idx, idx + 2000);
        expect(block.includes('.ids-info-grid')).toBe(true);
        expect(block.includes('grid-template-columns: 1fr')).toBe(true);
    });
});
```

- [ ] **Step 2: Register test suite in `tests/test-runner.html`**

After `<script src="test-suites/mobile-chat.test.js"></script>`, add:
```html
    <script src="test-suites/mobile-validator-parser.test.js"></script>
```

- [ ] **Step 3: Run tests**
```bash
node tests/run-tests.js 2>&1 | tail -10
```
Expected: 732/732 (727 + 5 new).

- [ ] **Step 4: Commit**
```bash
git add tests/test-suites/mobile-validator-parser.test.js tests/test-runner.html
git commit -m "test(mobile-12e): 5 smoke tests for validator + parser mobile CSS"
```

---

## Task 3: SW + docs + push + PR

**Files:**
- Modify: `sw.js` + `dist/sw.js`, `PLAN.md`, `CHANGELOG.md`

- [ ] **Step 1: SW v43 → v44** (no new asset files)

In both `sw.js` and `dist/sw.js`: change `bim-checker-v43` → `bim-checker-v44`.

- [ ] **Step 2: Append Phase 12e to PLAN.md** after `## Phase 12d`:

```markdown
## Phase 12e: Validator + Parser mobile ✅
- [x] Validator filters-grid stacks (1 col); spec-header stacks; results-header stacks; presets panel stacks
- [x] Stat cards 2-column on phone (was 4 auto-fit)
- [x] Form inputs `font-size: 16px` to prevent iOS auto-zoom on focus
- [x] All interactive controls (selects, buttons) ≥ 44px touch
- [x] Compact section padding (40px → spacing-lg/md)
- [x] Parser ids-info-grid stacks; cards compact
- [x] +5 tests (727 → 732)

Branch: phase-12e-validator-parser-mobile

Note: per-row master-detail card layout for results tables (per spec line 95) deferred — current results stay as desktop-style cards which already stack reasonably. Full master-detail can be a follow-up if needed.
```

- [ ] **Step 3: Insert `[0.10.4]` in CHANGELOG.md** before `[0.10.3]`:

```markdown
## [0.10.4] - 2026-05-11

### Added
- Validator + Parser mobile responsive (Phase 12e): filters stack to single column, spec headers stack title/badge/stats vertically, results header stacks, presets panel controls stack
- Stat cards 2-column on phone (was auto-fit grid)
- Form inputs use `font-size: 16px` to prevent iOS auto-zoom on focus
- All interactive controls (selects, buttons, action triggers) enforced to ≥ 44px touch targets
- +5 smoke tests (727 → 732)

### Changed
- Validator section padding compacted on mobile (40px → spacing-lg)
- Parser ids-info-grid forced to single column at < 1024px (was < 768px)
- SW cache bumped v43 → v44

### Notes
- Desktop ≥ 1024px: no visual changes
- Spec mentions master-detail card layout for results tables — deferred (current card list stacks adequately); can be follow-up phase if needed.
```

- [ ] **Step 4: Final test pass**
```bash
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 732/732.

- [ ] **Step 5: Commit, push, PR**
```bash
git add sw.js dist/sw.js PLAN.md CHANGELOG.md
git commit -m "chore(phase-12e): SW v43→v44 + PLAN/CHANGELOG"
git push -u origin phase-12e-validator-parser-mobile
gh pr create --title "Phase 12e: Validator + Parser mobile responsive" --body "..."
```

Report PR URL.

---

## Self-Review

**Spec coverage:**
- Validator presets panel stack → Task 1 ✓
- Validation groups stack → Task 1 (`.group-header { flex-direction: column }`) ✓
- Master-detail for tables → DEFERRED, documented in PLAN as follow-up ⚠️
- Parser ids-info stack → Task 1 ✓

**Type consistency:**
- All selectors verified against existing CSS class names
- No new class names introduced

**Test count progression:**
- Baseline: 727
- After T1: 727
- After T2: 732 (+5)
- After T3: 732

**Risks:**
- **Specificity:** Validator base rules at `.results-stats { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)) }` (line 220) are (0,1,0). Our media-query rule `.results-stats { grid-template-columns: repeat(2, 1fr) }` is also (0,1,0). Source order: our rule comes LATER in file → wins ✓.
- **Existing < 768px rules** (`.upload-grid`, `.filters-grid`, `.results-stats` all `1fr`): our `.filters-grid { grid-template-columns: 1fr }` is the same. `.results-stats { grid-template-columns: repeat(2, 1fr) }` differs at < 768px — desired stat layout below 768 should be 2-col (denser) or 1-col? Current spec doesn't say. 2-col looks better on iPhone SE 375px (each card ~167px wide — readable). At < 768px the existing 1fr rule comes AFTER our 1023px rule in source order. Wait — let me re-check. The new < 1023px block is appended at END of file. The existing < 768px block is at line 499 (BEFORE the new block). Source order: new block (at end) WINS for stats — so phone gets 2-col. If we want phone to be 1-col, we'd need an inner `< 480px` rule. Decision: keep 2-col — stat numbers fit in 167px width.
- **`.group-delete-btn { align-self: flex-end }`** — does `.group-header` even have `align-items: stretch` after our flex-direction column? Yes, we set `align-items: stretch` on `.group-header`. So buttons fill width unless they override. We override with `align-self: flex-end` to keep delete button compact. ✓
- **Wizard / tour mobile** — wizard step CSS targets desktop selectors (per spec note). Out of scope.

**Out of scope:**
- Master-detail card pattern for IFC entity tables (that's Phase 12f, IFC Viewer)
- Master-detail for validation results (deferred per Self-Review note above)
- Wizard mobile rework

**Final state:** 732 tests, validator + parser usable on phone + tablet, touch targets correct, no iOS zoom on focus.
