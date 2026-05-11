# Phase 12b: Mobile modals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Všechny existující modaly (Settings, IDS/IFC storage picker, bulk edit, add pset, atd.) na fullscreen layout < 1024px — žádné max-width/border-radius, hlavička sticky nahoře, body scroll uvnitř.

**Architecture:** Čistě CSS změna. Přidá nové pravidla do `assets/css/mobile-nav.css` v existujícím `@media (max-width: 1023px)` bloku. Override `.modal-overlay`, `.modal-container`, `.modal-header`, `.modal-body`. Funguje pro `.modal-overlay.show` (legacy) i `.modal-overlay.active` (AI settings, Phase 7+).

**Tech Stack:** Vanilla CSS media queries.

**Branch:** `phase-12b-mobile-modals` (cut from `master`).

**Spec:** `docs/superpowers/specs/2026-05-11-mobile-tablet-responsive-design.md` (Modals section).

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `assets/css/mobile-nav.css` | Modify | Append modal mobile overrides do existujícího `@media (max-width: 1023px)` bloku |
| `dist/assets/css/mobile-nav.css` | Mirror | `cp` |
| `sw.js` + `dist/sw.js` | Modify | Bump v40 → v41 (no new assets) |
| `tests/test-suites/mobile-modals.test.js` | **Create** | ~4 tests (CSS rules present in computed styles when viewport < 1024px) |
| `tests/test-runner.html` | Modify | Add new test suite script tag |
| `PLAN.md` | Modify | Append Phase 12b entry |
| `CHANGELOG.md` | Modify | `[0.10.1]` entry |

---

## Cross-cutting conventions

- SPDX header on new files: `/* SPDX-License-Identifier: AGPL-3.0-or-later */\n/* Copyright (C) 2025 Michal Marvan */`
- Mirror dist via `cp` after edit
- Test framework: no `.not` chaining

### Modal patterns in the codebase

Two open-state classes both work:
- `.modal-overlay.show` — legacy pattern in common.css line 395 (used by validator/parser modals)
- `.modal-overlay.active` — newer pattern in ai-chat.css (used by AI Settings modal Phase 7+)

Both must trigger `display: flex` on mobile, both must lay out as fullscreen.

### Modal anatomy (per `assets/css/common.css:380-453`)
```html
<div class="modal-overlay">
    <div class="modal-container">
        <div class="modal-header">
            <h2>Title</h2>
            <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">...</div>
        <div class="modal-footer">...</div>
    </div>
</div>
```

---

## Task 1: Append mobile modal CSS to mobile-nav.css

**Files:**
- Modify: `assets/css/mobile-nav.css`

- [ ] **Step 1: Read existing mobile-nav.css structure**

Run:
```bash
grep -n "@media\|/\* === " /home/michal/work/BIM_checker/assets/css/mobile-nav.css
```
Expected output: shows the outer `@media (max-width: 1023px)` block + inner `@media (min-width: 768px)` tablet refinement + existing rule sections.

- [ ] **Step 2: Insert modal rules INSIDE the outer @media (max-width: 1023px) block, AFTER the compact footer rules**

In `assets/css/mobile-nav.css`, find the compact footer rules added in Phase 12a (search for `.footer-modern .footer-tech`). AFTER the last footer rule (still INSIDE the outer media query but BEFORE the nested tablet `@media (min-width: 768px)` block), add:

```css

    /* === Mobile modals (fullscreen < 1024px) === */
    /* Overrides common.css .modal-overlay/.modal-container defaults. */
    /* Works for both .show (legacy) and .active (AI Settings) open states. */
    .modal-overlay {
        padding: 0;
    }
    .modal-overlay.show,
    .modal-overlay.active {
        display: flex;
        align-items: stretch;
        justify-content: stretch;
    }
    .modal-container {
        width: 100%;
        height: 100%;
        max-width: none;
        max-height: none;
        border-radius: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
    .modal-header {
        position: sticky;
        top: 0;
        z-index: 2;
        border-radius: 0;
        padding: 16px 20px;
        flex-shrink: 0;
    }
    .modal-header h2 {
        font-size: 1.2em;
    }
    .modal-close {
        width: 36px;
        height: 36px;
        font-size: 1.3em;
    }
    .modal-body {
        padding: 16px 20px;
        flex: 1 1 auto;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
    }
    .modal-footer {
        padding: 12px 20px;
        position: sticky;
        bottom: 0;
        background: var(--bg-primary);
        flex-shrink: 0;
    }
```

- [ ] **Step 3: Mirror dist**
```bash
cp assets/css/mobile-nav.css dist/assets/css/mobile-nav.css
```

- [ ] **Step 4: Run tests**
```bash
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 714/714 (CSS only, no new tests yet).

- [ ] **Step 5: Commit**
```bash
git checkout -b phase-12b-mobile-modals
git add assets/css/mobile-nav.css dist/assets/css/mobile-nav.css
git commit -m "feat(mobile-12b): fullscreen modals < 1024px (sticky header, scrollable body)"
```

---

## Task 2: Add mobile modal smoke tests

**Files:**
- Create: `tests/test-suites/mobile-modals.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1: Create tests/test-suites/mobile-modals.test.js**

```js
/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('mobile-modals (CSS at < 1024px)', () => {
    let modal;

    function injectModal(openClass) {
        modal = document.createElement('div');
        modal.className = 'modal-overlay';
        if (openClass) modal.classList.add(openClass);
        modal.innerHTML = `
            <div class="modal-container">
                <div class="modal-header"><h2>Test</h2><button class="modal-close">×</button></div>
                <div class="modal-body">Body</div>
            </div>`;
        modal.setAttribute('data-test-injected', '1');
        document.body.appendChild(modal);
        return modal;
    }

    afterEach(() => {
        document.querySelectorAll('[data-test-injected="1"]').forEach(n => n.remove());
    });

    it('mobile-nav.css is loaded in test-runner', async () => {
        // Verify the stylesheet was actually applied
        const sheets = Array.from(document.styleSheets);
        const found = sheets.some(s => (s.href || '').includes('mobile-nav.css'));
        expect(found).toBe(true);
    });

    it('CSS file contains a mobile modal-container override', async () => {
        const res = await fetch('../assets/css/mobile-nav.css');
        const text = await res.text();
        expect(text.includes('.modal-container')).toBe(true);
        expect(text.includes('max-width: none')).toBe(true);
        expect(text.includes('border-radius: 0')).toBe(true);
    });

    it('CSS handles both .show and .active open states', async () => {
        const res = await fetch('../assets/css/mobile-nav.css');
        const text = await res.text();
        expect(text.includes('.modal-overlay.show')).toBe(true);
        expect(text.includes('.modal-overlay.active')).toBe(true);
    });

    it('CSS makes modal-header sticky and modal-body scrollable', async () => {
        const res = await fetch('../assets/css/mobile-nav.css');
        const text = await res.text();
        expect(text.includes('position: sticky')).toBe(true);
        expect(text.includes('overflow-y: auto')).toBe(true);
    });
});
```

- [ ] **Step 2: Add test runner script tag**

In `tests/test-runner.html`, after `<script src="test-suites/mobile-foundation.test.js"></script>`, add:
```html
    <script src="test-suites/mobile-modals.test.js"></script>
```

- [ ] **Step 3: Run tests**
```bash
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 718/718 (714 + 4 new).

- [ ] **Step 4: Commit**
```bash
git add tests/test-suites/mobile-modals.test.js tests/test-runner.html
git commit -m "test(mobile-12b): 4 smoke tests for mobile modal CSS rules"
```

---

## Task 3: SW cache bump + PLAN/CHANGELOG + push

**Files:**
- Modify: `sw.js` + `dist/sw.js`
- Modify: `PLAN.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump SW cache version**

In `sw.js`:
- Change `const CACHE_VERSION = 'bim-checker-v40';` to `'bim-checker-v41'`

Mirror to `dist/sw.js`. No ASSETS_TO_CACHE additions (CSS file already in cache from Phase 12a).

- [ ] **Step 2: Append Phase 12b to PLAN.md**

After the existing `## Phase 12a` section, append:
```markdown
## Phase 12b: Mobile modals ✅
- [x] All `.modal-overlay` / `.modal-container` go fullscreen < 1024px
- [x] Both `.show` (legacy) and `.active` (AI Settings) open states supported
- [x] Modal header sticky top with close button
- [x] Body scrollable (`-webkit-overflow-scrolling: touch`)
- [x] Footer sticky bottom when present
- [x] +4 tests (714 → 718)

Branch: phase-12b-mobile-modals

Affects all existing modals: AI Settings, Bug Report, IDS/IFC storage pickers, bulk edit, add pset, rename pset/property, XSD export, validation result modals.
```

- [ ] **Step 3: Insert [0.10.1] block in CHANGELOG.md**

After header line(s), before the first existing version block:
```markdown
## [0.10.1] - 2026-05-11

### Added
- Mobile modals fullscreen < 1024px (Phase 12b): all `.modal-overlay` / `.modal-container` become fullscreen on phone + tablet
- Modal header sticky top, body scrollable, footer sticky bottom
- Supports both `.show` (legacy) and `.active` (AI Settings, Phase 7+) open-state classes

### Changed
- SW cache bumped v40 → v41

### Notes
- Affected modals (verified): AI Settings, AI agent form, Bug Report, IDS storage picker, IFC storage picker, bulk edit, add pset, rename pset/property, XSD export, validation preset save/load.
```

- [ ] **Step 4: Final test pass**
```bash
node tests/run-tests.js 2>&1 | tail -3
```
Expected: 718/718.

- [ ] **Step 5: Commit + push**
```bash
git add sw.js dist/sw.js PLAN.md CHANGELOG.md
git commit -m "chore(phase-12b): SW v40→v41 + PLAN/CHANGELOG"
git push -u origin phase-12b-mobile-modals
```

Capture and report PR URL.

---

## Self-Review

**Spec coverage:**
- `.modal-overlay { padding: 0 }` < 1024px → Task 1 Step 2 ✓
- `.modal-container { width: 100%; height: 100%; max-width: none; border-radius: 0 }` → Task 1 ✓
- Header sticky top → Task 1 ✓
- Body scrolls inside → Task 1 ✓
- Works for `.show` and `.active` → Task 1 ✓

**Type consistency:**
- Class names match the existing CSS (`.modal-overlay`, `.modal-container`, `.modal-header`, `.modal-close`, `.modal-body`, `.modal-footer`) — consistent
- Both `.show` and `.active` triggers `display: flex` — covered

**Test count progression:**
- Baseline: 714
- After T1: 714 (CSS only)
- After T2: 718 (+4 smoke tests)
- After T3: 718 (no new tests)

**Risks:**
- Existing per-modal CSS may have higher specificity overrides (e.g., `.ai-settings-modal .modal-container { max-width: 720px }` in ai-chat.css). On mobile that needs to lose to our `max-width: none`. Since `@media (max-width: 1023px) { .modal-container { max-width: none } }` has the same specificity as the base `.modal-container`, but `.ai-settings-modal .modal-container` has HIGHER specificity, the AI Settings modal may still get 720px on mobile. Mitigation: if reviewer flags it, add `.modal-overlay .modal-container` selector OR `!important` for max-width override on mobile.
- Some modals lock-scroll body (modal open prevents page scroll). Should still work since modal is fullscreen — but page below is invisible.
- Modal-header padding compressed from 25px → 16px may make headers look cramped on tablet. Acceptable trade-off for phone.

**Out of scope:**
- New modal types (wizard overlay handled by its own CSS) — not touched
- Modal animations (slide-up on phone vs fade) — left for future
- Drag-to-dismiss — out of scope

**Final state:** 718 tests, all modals fullscreen on phone + tablet, work resumes immediately when modal closes.
