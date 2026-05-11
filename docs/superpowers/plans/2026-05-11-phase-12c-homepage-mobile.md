# Phase 12c: Homepage mobile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Homepage (`index.html`) usable on phone + tablet: storage cards stack, card-header content stacks (title above 4 icon buttons), touch targets ≥ 44×44px, drop zones compact, tools/about grids single-column at < 1024px.

**Architecture:** Pure CSS change in `assets/css/index.css`. Extend the existing `@media (max-width: 1024px)` block (lines 1434-1442) with new mobile rules. No HTML or JS changes — drop zones already trigger file picker on click, which works on touch.

**Tech Stack:** Vanilla CSS media queries.

**Branch:** `phase-12c-homepage-mobile` (cut from `master`).

**Spec:** `docs/superpowers/specs/2026-05-11-mobile-tablet-responsive-design.md` (file upload + touch targets sections).

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `assets/css/index.css` | Modify | Extend `@media (max-width: 1024px)` block with homepage mobile rules |
| `dist/assets/css/index.css` | Mirror | `cp` |
| `sw.js` + `dist/sw.js` | Modify | Bump v41 → v42 (no new assets) |
| `tests/test-suites/mobile-homepage.test.js` | **Create** | ~3 smoke tests (CSS rules present) |
| `tests/test-runner.html` | Modify | Add script tag |
| `PLAN.md` | Modify | Append Phase 12c entry |
| `CHANGELOG.md` | Modify | `[0.10.2]` entry |

---

## Cross-cutting conventions

- SPDX header on new test file: `/* SPDX-License-Identifier: AGPL-3.0-or-later */\n/* Copyright (C) 2025 Michal Marvan */`
- Mirror dist via `cp` after edit
- Test framework: no `.not` chaining

### Existing index.css structure (relevant lines)

- Line 1434–1442: `@media (max-width: 1024px) { .hero-title { font-size: 3rem } .storage-grid { grid-template-columns: 1fr } }` — extend this block
- Line 1444–1502: `@media (max-width: 768px) { ... }` — leave intact (still applies under 1024 too)
- Line 1504–1523: `@media (max-width: 480px) { ... }` — leave intact

### Storage card anatomy
```html
<div class="storage-card">
    <div class="card-header">
        <div class="card-title-group">[icon + title + subtitle]</div>
        <div class="card-actions">[4 icon buttons: new folder, upload, expand-all, collapse-all]</div>
    </div>
    <div class="drop-zone-modern">[icon + title + subtitle]</div>
    <div class="file-tree-modern">[folders + files]</div>
    <div class="storage-stats-modern">[count + size]</div>
</div>
```

On phone, 4 icon buttons next to a long title overflow. Stacking the header into two rows (title on top, button row below) is the standard mobile pattern.

---

## Task 1: Append homepage mobile CSS to index.css

**Files:**
- Modify: `assets/css/index.css`

- [ ] **Step 1: Read current `@media (max-width: 1024px)` block**

Run:
```bash
sed -n '1430,1445p' /home/michal/work/BIM_checker/assets/css/index.css
```
Expected: shows the small block with `.hero-title` and `.storage-grid` rules.

- [ ] **Step 2: Extend that media query block**

In `assets/css/index.css`, replace the existing block:

```css
/* Responsive Design */
@media (max-width: 1024px) {
    .hero-title {
        font-size: 3rem;
    }
    
    .storage-grid {
        grid-template-columns: 1fr;
    }
}
```

with the extended version below (KEEP existing rules, ADD new ones):

```css
/* Responsive Design */
@media (max-width: 1024px) {
    .hero-title {
        font-size: 3rem;
    }

    .storage-grid,
    .tools-grid-modern,
    .about-grid {
        grid-template-columns: 1fr;
    }

    /* Storage card mobile: stack header, larger touch targets, compact padding */
    .storage-card {
        padding: var(--spacing-lg);
    }

    .card-header {
        flex-direction: column;
        align-items: stretch;
        gap: 16px;
        padding-bottom: 16px;
    }

    .card-actions {
        width: 100%;
        justify-content: flex-start;
        flex-wrap: wrap;
        gap: 8px;
    }

    .btn-icon-modern {
        min-width: 44px;
        min-height: 44px;
        width: 44px;
        height: 44px;
    }

    /* Drop zone compact + still touchable */
    .drop-zone-modern {
        padding: var(--spacing-xl) var(--spacing-md);
    }

    .drop-zone-icon {
        width: 3rem;
        height: 3rem;
        margin: 0 auto 12px;
    }

    .drop-zone-title {
        font-size: 1rem;
    }

    .drop-zone-subtitle {
        font-size: 0.85rem;
    }
}
```

- [ ] **Step 3: Mirror dist**
```bash
cp assets/css/index.css dist/assets/css/index.css
```

- [ ] **Step 4: Run tests**
```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: 718/718 (CSS only, no new tests yet).

- [ ] **Step 5: Commit**
```bash
git add assets/css/index.css dist/assets/css/index.css
git commit -m "feat(mobile-12c): homepage mobile — stacked card headers + 44px touch targets + compact drop zones"
```

---

## Task 2: Add homepage mobile smoke tests

**Files:**
- Create: `tests/test-suites/mobile-homepage.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1: Create `tests/test-suites/mobile-homepage.test.js`**

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('mobile-homepage (CSS at < 1024px)', () => {
    let cssText;

    beforeEach(async () => {
        if (!cssText) {
            const res = await fetch('../assets/css/index.css');
            cssText = await res.text();
        }
    });

    it('CSS has @media (max-width: 1024px) breakpoint for homepage', () => {
        expect(cssText.includes('@media (max-width: 1024px)')).toBe(true);
    });

    it('CSS stacks card-header on mobile (flex-direction: column)', () => {
        const idx = cssText.indexOf('@media (max-width: 1024px)');
        const block = cssText.slice(idx, idx + 2000);
        expect(block.includes('.card-header')).toBe(true);
        expect(block.includes('flex-direction: column')).toBe(true);
    });

    it('CSS enforces 44px touch targets on .btn-icon-modern (WCAG 2.5.5)', () => {
        const idx = cssText.indexOf('@media (max-width: 1024px)');
        const block = cssText.slice(idx, idx + 2000);
        expect(block.includes('.btn-icon-modern')).toBe(true);
        expect(block.includes('min-width: 44px')).toBe(true);
        expect(block.includes('min-height: 44px')).toBe(true);
    });

    it('CSS stacks tools-grid-modern and about-grid at < 1024px', () => {
        const idx = cssText.indexOf('@media (max-width: 1024px)');
        const block = cssText.slice(idx, idx + 2000);
        expect(block.includes('.tools-grid-modern')).toBe(true);
        expect(block.includes('.about-grid')).toBe(true);
        expect(block.includes('grid-template-columns: 1fr')).toBe(true);
    });
});
```

- [ ] **Step 2: Add script tag to test runner**

In `tests/test-runner.html`, after `<script src="test-suites/mobile-modals.test.js"></script>`, add:
```html
    <script src="test-suites/mobile-homepage.test.js"></script>
```

- [ ] **Step 3: Run tests**
```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: 722/722 (718 + 4 new).

- [ ] **Step 4: Commit**
```bash
git add tests/test-suites/mobile-homepage.test.js tests/test-runner.html
git commit -m "test(mobile-12c): 4 smoke tests for homepage mobile CSS"
```

---

## Task 3: SW bump + PLAN/CHANGELOG + push

**Files:**
- Modify: `sw.js` + `dist/sw.js`
- Modify: `PLAN.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump SW cache version**

In `sw.js` and `dist/sw.js`:
- Change `const CACHE_VERSION = 'bim-checker-v41';` to `'bim-checker-v42'`

No ASSETS_TO_CACHE additions (index.css already in cache).

- [ ] **Step 2: Append Phase 12c to PLAN.md**

After the existing `## Phase 12b` section, append:
```markdown
## Phase 12c: Homepage mobile ✅
- [x] Storage cards: header stacks (title on top, 4 icon buttons below)
- [x] `.btn-icon-modern` enforced to 44×44px on touch (WCAG 2.5.5)
- [x] Drop zones compact padding + smaller icon on phone
- [x] `tools-grid-modern` + `about-grid` single-column at < 1024px (was < 768px)
- [x] +4 tests (718 → 722)

Branch: phase-12c-homepage-mobile

No HTML/JS changes — drop zone click→file-picker already works on touch.
```

- [ ] **Step 3: Insert [0.10.2] block in CHANGELOG.md**

After the header `# Changelog ... documented in this file.`, before `## [0.10.1]`:
```markdown
## [0.10.2] - 2026-05-11

### Added
- Homepage mobile responsive (Phase 12c): storage card headers stack, 44×44px touch targets on icon buttons, compact drop zones
- `tools-grid-modern` and `about-grid` now single-column at < 1024px (matches mobile foundation breakpoint)
- +4 smoke tests (718 → 722)

### Changed
- SW cache bumped v41 → v42

### Notes
- No HTML/JS changes — drop zone click handler already triggers native file picker on touch, no DnD-only path
```

- [ ] **Step 4: Final test pass**
```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: 722/722.

- [ ] **Step 5: Commit + push**
```bash
git add sw.js dist/sw.js PLAN.md CHANGELOG.md
git commit -m "chore(phase-12c): SW v41→v42 + PLAN/CHANGELOG"
git push -u origin phase-12c-homepage-mobile
```

Then create PR with `gh pr create`. Capture and report PR URL.

---

## Self-Review

**Spec coverage:**
- Storage cards stack on phone → Task 1 (already single-column < 1024, NEW: internal header layout)
- Drop zones touch-friendly → Task 1 ✓
- Touch targets ≥ 44px → Task 1 (`.btn-icon-modern`) ✓
- Tools/about grids stack < 1024px → Task 1 ✓

**Type consistency:**
- All selectors match existing CSS class names (verified against `index.html` lines 200-360 and `index.css` lines 575-734)
- No invalid CSS values (`justify-content: stretch` issue from Phase 12b avoided)

**Test count progression:**
- Baseline: 718
- After T1: 718 (CSS only)
- After T2: 722 (+4 smoke tests)
- After T3: 722

**Risks:**
- `.btn-icon-modern` is also used on other pages (validator, parser) where it might exist on desktop-only layout — but since rule is inside `@media (max-width: 1024px)`, it only fires on mobile. Other pages: validator/parser/viewer all get this on mobile too, which is fine (touch targets should be ≥ 44px there as well).
- Existing `< 768px` rule `.card-header { flex-direction: column }` (line 1514) is now redundant with our `< 1024px` version but harmless (same value).
- Drop zone padding compression makes the drop area smaller — still functional, just less "inviting." Acceptable.

**Out of scope:**
- File tree row touch targets (folders/files inside `.file-tree-modern`) — handled later if needed
- Hero section refinement — already responsive
- Wizard / tour mobile — separate scope

**Final state:** 722 tests, homepage usable on phone, all storage interactions touch-friendly.
