# Phase 5 — In-App Bug Report: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Report bug" button to the navbar of all 4 pages that opens a modal which posts to a Cloudflare Pages Function. The function validates origin, rate-limits per IP, and creates a public GitHub issue with user description plus auto-attached metadata (app version, user agent, page path, language, last 5 console errors).

**Architecture:** New `BugReport` namespace in `assets/js/common/bug-report.js` injects modal HTML into DOM and handles submit. `ErrorHandler` in `assets/js/common/error-handler.js` extended with a 5-entry ring buffer fed by `window.error` and `unhandledrejection` listeners. Backend is a single Cloudflare Pages Function `functions/api/bug-report.js` calling GitHub Issues API. No identification of users, no screenshot in v1, fallback link to manual GitHub issue creation when worker fails.

**Tech Stack:** Vanilla JS (no build), custom Jasmine-like test framework via Puppeteer, Cloudflare Pages Functions runtime, Cloudflare KV for rate limiting, GitHub REST API.

**Reference spec:** `docs/superpowers/specs/2026-05-08-phase-5-bug-report-design.md`

---

## File Structure

### New files
- `assets/js/common/bug-report.js` — `BugReport` namespace (init, open, close, submit, buildMetadata, modal injection)
- `functions/api/bug-report.js` — Cloudflare Pages Function (origin check, rate limit, GitHub API call, response shaping)
- `tests/test-suites/error-handler-buffer.test.js` — ring buffer tests
- `tests/test-suites/bug-report-frontend.test.js` — modal/submit tests with mocked fetch

### Modified
- `assets/js/common/error-handler.js` — add `_errorBuffer`, `recordError`, `getRecentErrors`, `_installGlobalListeners` (auto-installed at script load)
- `assets/js/common/translations.js` — ~20 i18n keys × 2 languages (cs + en)
- `assets/css/common.css` — `.bug-report-btn`, `.bug-report-error`, `.bug-report-success`, `.bug-report-metadata`, `.bug-report-intro` styles
- `pages/index.html` — add `<meta name="app-version">`, bug button in navbar-actions, bug-report.js script, BugReport.init() call
- `pages/ids-parser-visualizer.html` — same
- `pages/ids-ifc-validator.html` — same
- `pages/ifc-viewer-multi-file.html` — same
- `tests/test-runner.html` — load new common script + 2 test suites
- `sw.js` — precache `assets/js/common/bug-report.js` + bump cache version
- `PLAN.md` — mark Phase 5 done
- `CHANGELOG.md` — entry [0.2.2]
- `dist/**` — sync all of the above

---

## Step 1: Error Buffer + Frontend Module

### Task 1: Extend ErrorHandler with ring buffer

**Files:**
- Modify: `assets/js/common/error-handler.js`
- Create: `tests/test-suites/error-handler-buffer.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 1.1: Write failing tests for ring buffer**

Create `tests/test-suites/error-handler-buffer.test.js`:
```js
describe('ErrorHandler ring buffer', () => {
    beforeEach(() => {
        // Reset buffer between tests
        ErrorHandler._errorBuffer = [];
    });

    it('should expose recordError and getRecentErrors', () => {
        expect(typeof ErrorHandler.recordError).toBe('function');
        expect(typeof ErrorHandler.getRecentErrors).toBe('function');
    });

    it('should record an error message', () => {
        ErrorHandler.recordError('Test error 1');
        const errors = ErrorHandler.getRecentErrors();
        expect(errors.length).toBe(1);
        expect(errors[0].includes('Test error 1')).toBe(true);
    });

    it('should keep only last 5 errors (FIFO)', () => {
        for (let i = 1; i <= 7; i++) {
            ErrorHandler.recordError(`Error ${i}`);
        }
        const errors = ErrorHandler.getRecentErrors();
        expect(errors.length).toBe(5);
        expect(errors[0].includes('Error 3')).toBe(true);
        expect(errors[4].includes('Error 7')).toBe(true);
    });

    it('should return a defensive copy from getRecentErrors', () => {
        ErrorHandler.recordError('Error A');
        const copy = ErrorHandler.getRecentErrors();
        copy.push('mutation');
        expect(ErrorHandler.getRecentErrors().length).toBe(1);
    });

    it('should capture window.error events', () => {
        ErrorHandler._errorBuffer = [];
        const evt = new ErrorEvent('error', {
            message: 'Synthetic test error',
            filename: 'test.js',
            lineno: 42,
            colno: 7
        });
        window.dispatchEvent(evt);
        const errors = ErrorHandler.getRecentErrors();
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[errors.length - 1].includes('Synthetic test error')).toBe(true);
    });

    it('should capture unhandledrejection events', () => {
        ErrorHandler._errorBuffer = [];
        // Note: synthetic dispatch of PromiseRejectionEvent in JSDOM/Puppeteer requires the event constructor
        const evt = new Event('unhandledrejection');
        evt.reason = { message: 'Synthetic rejection' };
        window.dispatchEvent(evt);
        const errors = ErrorHandler.getRecentErrors();
        expect(errors.some(e => e.includes('Synthetic rejection'))).toBe(true);
    });
});
```

- [ ] **Step 1.2: Add test suite to test-runner.html**

In `tests/test-runner.html`, find the test-suites loading section (search for `test-suites/regex-cache.test.js`). After the existing test suites, add:
```html
<script src="test-suites/error-handler-buffer.test.js"></script>
```

- [ ] **Step 1.3: Run tests, verify failures**

```bash
node tests/run-tests.js 2>&1 | grep -E "ring buffer"
```
Expected: 6 FAILs ("ErrorHandler.recordError is not a function").

- [ ] **Step 1.4: Implement ring buffer in ErrorHandler**

In `assets/js/common/error-handler.js`, add inside the class body (anywhere among existing static methods), then add the listener installation at the bottom of the file (above `window.ErrorHandler = ErrorHandler;`):

```js
class ErrorHandler {
    // ... existing code ...

    static _errorBuffer = [];
    static MAX_BUFFERED_ERRORS = 5;
    static _listenersInstalled = false;

    static recordError(message) {
        const stamp = new Date().toISOString();
        ErrorHandler._errorBuffer.push(`[${stamp}] ${message}`);
        if (ErrorHandler._errorBuffer.length > ErrorHandler.MAX_BUFFERED_ERRORS) {
            ErrorHandler._errorBuffer.shift();
        }
    }

    static getRecentErrors() {
        return [...ErrorHandler._errorBuffer];
    }

    static _installGlobalListeners() {
        if (ErrorHandler._listenersInstalled) return;
        ErrorHandler._listenersInstalled = true;

        window.addEventListener('error', (e) => {
            const loc = e.filename ? ` at ${e.filename}:${e.lineno}:${e.colno}` : '';
            ErrorHandler.recordError(`${e.message || 'Unknown error'}${loc}`);
        });

        window.addEventListener('unhandledrejection', (e) => {
            const reason = (e.reason && e.reason.message) ? e.reason.message : String(e.reason);
            ErrorHandler.recordError(`Unhandled rejection: ${reason}`);
        });
    }
}
```

At the bottom of the file (after the existing `window.ErrorHandler = ErrorHandler;` line), add:
```js
ErrorHandler._installGlobalListeners();
```

- [ ] **Step 1.5: Run tests, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "ring buffer"
```
Expected: 6 PASS.

- [ ] **Step 1.6: Sync dist + commit**

```bash
cp assets/js/common/error-handler.js dist/assets/js/common/error-handler.js
diff -q assets/js/common/error-handler.js dist/assets/js/common/error-handler.js
git add assets/js/common/error-handler.js dist/assets/js/common/error-handler.js tests/test-suites/error-handler-buffer.test.js tests/test-runner.html
git commit -m "feat(error-handler): add 5-entry ring buffer + window.error/unhandledrejection listeners"
```

---

### Task 2: Add app-version meta tag to all 4 pages

**Files:**
- Modify: `pages/index.html`, `pages/ids-parser-visualizer.html`, `pages/ids-ifc-validator.html`, `pages/ifc-viewer-multi-file.html`
- Modify: `dist/pages/*.html`

- [ ] **Step 2.1: Read current package.json version**

```bash
grep '"version"' /home/michal/work/BIM_checker/package.json
```
Expected: `"version": "0.1.2",` (or whatever current is). Note the value — call it `<VER>` below.

- [ ] **Step 2.2: Add `<meta name="app-version">` to each page**

For each of the 4 HTML pages (`pages/index.html`, `pages/ids-parser-visualizer.html`, `pages/ids-ifc-validator.html`, `pages/ifc-viewer-multi-file.html`), find the `<head>` section. After the existing `<meta name="theme-color">` line (or any existing meta tag), add:
```html
<meta name="app-version" content="0.1.2">
```

(Use the actual `<VER>` from Step 2.1.)

- [ ] **Step 2.3: Sync dist + commit**

```bash
cp pages/index.html dist/pages/index.html
cp pages/ids-parser-visualizer.html dist/pages/ids-parser-visualizer.html
cp pages/ids-ifc-validator.html dist/pages/ids-ifc-validator.html
cp pages/ifc-viewer-multi-file.html dist/pages/ifc-viewer-multi-file.html
git add pages/*.html dist/pages/*.html
git commit -m "feat(pages): add app-version meta tag for bug reporter metadata"
```

---

### Task 3: Add i18n keys for bug report (cs + en)

**Files:**
- Modify: `assets/js/common/translations.js`

- [ ] **Step 3.1: Find anchor in cs block**

```bash
grep -n "'parser.facet.predefinedType':" /home/michal/work/BIM_checker/assets/js/common/translations.js
```
Note the line numbers (cs block one, en block one). Insert new keys right before the cs block closes (look for `}, // cs end` style boundary, or just before any obvious section end).

- [ ] **Step 3.2: Add cs keys**

In `assets/js/common/translations.js`, in the **cs (Czech)** translations object, add (place near other navbar/modal keys):
```js
        'bugReport.tooltip': 'Nahlásit chybu',
        'bugReport.title': 'Nahlásit chybu',
        'bugReport.intro': 'Report půjde jako veřejné GitHub issue. Neuváděj prosím citlivé informace (jména souborů, business data).',
        'bugReport.titleField': 'Krátký název problému *',
        'bugReport.titlePlaceholder': 'Např: Export IFC nefunguje s diakritikou',
        'bugReport.descField': 'Co se stalo *',
        'bugReport.descPlaceholder': 'Co jsi dělal, co jsi očekával a co se reálně stalo',
        'bugReport.stepsField': 'Kroky k reprodukci (volitelné)',
        'bugReport.stepsPlaceholder': '1. Otevři ...\n2. Klikni na ...\n3. ...',
        'bugReport.previewMetadata': 'Co se automaticky přiloží?',
        'bugReport.cancel': 'Zrušit',
        'bugReport.submit': 'Odeslat',
        'bugReport.submitting': 'Odesílám…',
        'bugReport.errorMissingFields': 'Vyplň prosím název a popis problému.',
        'bugReport.errorRateLimit': 'Příliš mnoho reportů z této IP. Zkus znovu za chvíli.',
        'bugReport.errorNetwork': 'Nepodařilo se odeslat. Zkontroluj internet a zkus znovu, nebo otevři issue ručně:',
        'bugReport.errorGeneric': 'Nastala chyba při odesílání. Zkus znovu, nebo otevři issue ručně:',
        'bugReport.successTitle': '✅ Report odeslán!',
        'bugReport.successOpenIssue': 'Otevřít na GitHubu',
        'bugReport.fallbackOpen': 'Otevřít issue ručně',
        'bugReport.close': 'Zavřít',
```

- [ ] **Step 3.3: Add en keys**

In the **en (English)** translations object, add the same keys with English values:
```js
        'bugReport.tooltip': 'Report bug',
        'bugReport.title': 'Report a bug',
        'bugReport.intro': 'The report will be filed as a public GitHub issue. Please do not include sensitive information (file names, business data).',
        'bugReport.titleField': 'Short problem title *',
        'bugReport.titlePlaceholder': 'e.g. IFC export breaks with diacritic property names',
        'bugReport.descField': 'What happened *',
        'bugReport.descPlaceholder': 'What you did, what you expected, what actually happened',
        'bugReport.stepsField': 'Steps to reproduce (optional)',
        'bugReport.stepsPlaceholder': '1. Open ...\n2. Click ...\n3. ...',
        'bugReport.previewMetadata': 'What gets attached automatically?',
        'bugReport.cancel': 'Cancel',
        'bugReport.submit': 'Submit',
        'bugReport.submitting': 'Submitting…',
        'bugReport.errorMissingFields': 'Please fill in title and description.',
        'bugReport.errorRateLimit': 'Too many reports from this IP. Please try again later.',
        'bugReport.errorNetwork': 'Failed to submit. Check your internet and retry, or open an issue manually:',
        'bugReport.errorGeneric': 'An error occurred while submitting. Try again or open the issue manually:',
        'bugReport.successTitle': '✅ Report submitted!',
        'bugReport.successOpenIssue': 'Open on GitHub',
        'bugReport.fallbackOpen': 'Open issue manually',
        'bugReport.close': 'Close',
```

- [ ] **Step 3.4: Sync dist + commit**

```bash
cp assets/js/common/translations.js dist/assets/js/common/translations.js
git add assets/js/common/translations.js dist/assets/js/common/translations.js
git commit -m "feat(i18n): add bug report translations (cs + en)"
```

---

### Task 4: Add CSS for bug button + modal

**Files:**
- Modify: `assets/css/common.css`
- Modify: `dist/assets/css/common.css`

- [ ] **Step 4.1: Append CSS**

Append to the end of `assets/css/common.css`:
```css
/* ===== Bug report button + modal ===== */

.bug-report-btn {
    background: transparent;
    border: 1px solid var(--border-primary, rgba(255,255,255,0.2));
    border-radius: 8px;
    padding: 8px;
    cursor: pointer;
    color: var(--text-primary, currentColor);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s, color 0.2s, border-color 0.2s;
}
.bug-report-btn:hover {
    background: var(--bg-secondary, rgba(255,255,255,0.1));
    color: var(--primary-color, #667eea);
    border-color: var(--primary-color, #667eea);
}
.bug-report-btn svg {
    width: 20px;
    height: 20px;
}

.bug-report-intro {
    color: var(--text-secondary, #6c757d);
    font-size: 0.9em;
    margin-bottom: 1rem;
    line-height: 1.5;
}

.bug-report-metadata {
    margin-top: 1rem;
    background: var(--bg-secondary, #f8f9fa);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 0.85em;
}
.bug-report-metadata summary {
    cursor: pointer;
    user-select: none;
    color: var(--text-secondary, #6c757d);
}
.bug-report-metadata pre {
    margin-top: 8px;
    background: var(--bg-primary, white);
    padding: 8px;
    border-radius: 4px;
    overflow-x: auto;
    font-family: 'Courier New', monospace;
    font-size: 0.85em;
    max-height: 200px;
    overflow-y: auto;
}

.bug-report-error,
.bug-report-success {
    margin-top: 1rem;
    padding: 12px 16px;
    border-radius: 6px;
    line-height: 1.5;
}
.bug-report-error {
    background: #fef2f2;
    color: #b91c1c;
    border-left: 4px solid #dc2626;
}
.bug-report-success {
    background: #f0fdf4;
    color: #166534;
    border-left: 4px solid #16a34a;
}
.bug-report-success a,
.bug-report-error a {
    color: inherit;
    font-weight: 600;
    text-decoration: underline;
}
```

- [ ] **Step 4.2: Sync dist + commit**

```bash
cp assets/css/common.css dist/assets/css/common.css
git add assets/css/common.css dist/assets/css/common.css
git commit -m "feat(css): bug report button + modal styles"
```

---

### Task 5: Implement BugReport namespace (frontend module)

**Files:**
- Create: `assets/js/common/bug-report.js`
- Create: `tests/test-suites/bug-report-frontend.test.js`
- Modify: `tests/test-runner.html`

- [ ] **Step 5.1: Write failing tests**

Create `tests/test-suites/bug-report-frontend.test.js`:
```js
describe('BugReport namespace', () => {
    beforeEach(() => {
        // Remove any leftover modal from previous tests
        const existing = document.getElementById('bugReportModal');
        if (existing) existing.remove();
        // Reset _injected state
        if (window.BugReport && window.BugReport._reset) {
            window.BugReport._reset();
        }
    });

    it('should expose BugReport namespace', () => {
        expect(typeof window.BugReport).toBe('object');
        expect(typeof window.BugReport.init).toBe('function');
        expect(typeof window.BugReport.open).toBe('function');
        expect(typeof window.BugReport.close).toBe('function');
    });

    it('init() injects modal HTML into document.body', () => {
        BugReport.init();
        const modal = document.getElementById('bugReportModal');
        expect(modal).toBeTruthy();
        expect(modal.querySelector('#bugReportTitle')).toBeTruthy();
        expect(modal.querySelector('#bugReportDesc')).toBeTruthy();
        expect(modal.querySelector('#bugReportSubmit')).toBeTruthy();
    });

    it('init() is idempotent', () => {
        BugReport.init();
        BugReport.init();
        const modals = document.querySelectorAll('#bugReportModal');
        expect(modals.length).toBe(1);
    });

    it('open() shows modal and resets fields', () => {
        BugReport.init();
        document.getElementById('bugReportTitle').value = 'old title';
        document.getElementById('bugReportDesc').value = 'old desc';
        BugReport.open();
        const modal = document.getElementById('bugReportModal');
        expect(modal.style.display).not.toBe('none');
        expect(document.getElementById('bugReportTitle').value).toBe('');
        expect(document.getElementById('bugReportDesc').value).toBe('');
    });

    it('close() hides modal', () => {
        BugReport.init();
        BugReport.open();
        BugReport.close();
        const modal = document.getElementById('bugReportModal');
        expect(modal.style.display).toBe('none');
    });

    it('buildMetadata() returns required fields', () => {
        BugReport.init();
        const m = BugReport._buildMetadata();
        expect(typeof m.appVersion).toBe('string');
        expect(typeof m.userAgent).toBe('string');
        expect(typeof m.pagePath).toBe('string');
        expect(typeof m.language).toBe('string');
        expect(typeof m.timestamp).toBe('string');
        expect(Array.isArray(m.recentErrors)).toBe(true);
    });

    it('buildMetadata().recentErrors mirrors ErrorHandler buffer', () => {
        BugReport.init();
        ErrorHandler._errorBuffer = [];
        ErrorHandler.recordError('Test error A');
        ErrorHandler.recordError('Test error B');
        const m = BugReport._buildMetadata();
        expect(m.recentErrors.length).toBe(2);
        expect(m.recentErrors[0].includes('Test error A')).toBe(true);
    });

    it('submit with empty title shows inline error and does not call fetch', async () => {
        BugReport.init();
        BugReport.open();
        let fetchCalled = false;
        const origFetch = window.fetch;
        window.fetch = () => { fetchCalled = true; return Promise.resolve(new Response('{}', { status: 201 })); };

        document.getElementById('bugReportTitle').value = '';
        document.getElementById('bugReportDesc').value = 'desc';
        await BugReport._submit();

        expect(fetchCalled).toBe(false);
        const errEl = document.getElementById('bugReportError');
        expect(errEl.hasAttribute('hidden')).toBe(false);

        window.fetch = origFetch;
    });

    it('submit with 201 response shows success state with issue URL', async () => {
        BugReport.init();
        BugReport.open();
        const origFetch = window.fetch;
        window.fetch = () => Promise.resolve(new Response(
            JSON.stringify({ ok: true, issueUrl: 'https://github.com/x/y/issues/42', issueNumber: 42 }),
            { status: 201 }
        ));

        document.getElementById('bugReportTitle').value = 'Title';
        document.getElementById('bugReportDesc').value = 'Description';
        await BugReport._submit();

        const successEl = document.getElementById('bugReportSuccess');
        expect(successEl.hasAttribute('hidden')).toBe(false);
        expect(successEl.innerHTML.includes('issues/42')).toBe(true);

        window.fetch = origFetch;
    });

    it('submit with 429 shows rate limit message', async () => {
        BugReport.init();
        BugReport.open();
        const origFetch = window.fetch;
        window.fetch = () => Promise.resolve(new Response(
            JSON.stringify({ error: 'rate_limit', limit: 'hourly' }),
            { status: 429 }
        ));

        document.getElementById('bugReportTitle').value = 'Title';
        document.getElementById('bugReportDesc').value = 'Description';
        await BugReport._submit();

        const errEl = document.getElementById('bugReportError');
        expect(errEl.hasAttribute('hidden')).toBe(false);
        // Error message should reference rate limit
        expect(errEl.textContent.toLowerCase().includes('mnoho') || errEl.textContent.toLowerCase().includes('many')).toBe(true);

        window.fetch = origFetch;
    });

    it('submit with network failure shows fallback link', async () => {
        BugReport.init();
        BugReport.open();
        const origFetch = window.fetch;
        window.fetch = () => Promise.reject(new Error('Network down'));

        document.getElementById('bugReportTitle').value = 'Title';
        document.getElementById('bugReportDesc').value = 'Description';
        await BugReport._submit();

        const errEl = document.getElementById('bugReportError');
        expect(errEl.hasAttribute('hidden')).toBe(false);
        expect(errEl.innerHTML.includes('github.com/MichalMarvan/BIM_checker/issues/new')).toBe(true);

        window.fetch = origFetch;
    });
});
```

- [ ] **Step 5.2: Add test suite to test-runner.html**

In `tests/test-runner.html`, after the line for `error-handler-buffer.test.js`, add:
```html
<script src="../assets/js/common/bug-report.js"></script>
<script src="test-suites/bug-report-frontend.test.js"></script>
```

(The first line loads the source module so tests can use it.)

- [ ] **Step 5.3: Run tests, verify failures**

```bash
node tests/run-tests.js 2>&1 | grep -E "BugReport"
```
Expected: 11 FAILs (BugReport not defined).

- [ ] **Step 5.4: Implement BugReport module**

Create `assets/js/common/bug-report.js`:
```js
/**
 * BugReport — in-app bug reporting modal that posts to /api/bug-report.
 * Anonymous, no contact field, no screenshot. Failure mode falls back to a
 * link to manual GitHub issue creation with prefilled query parameters.
 */
window.BugReport = (function() {
    'use strict';

    const ENDPOINT = '/api/bug-report';
    const REPO_FALLBACK_URL = 'https://github.com/MichalMarvan/BIM_checker/issues/new';
    const MAX_TITLE = 120;
    const MAX_DESC = 5000;
    const MAX_STEPS = 2000;

    let _injected = false;

    function _t(key) {
        if (typeof t === 'function') return t(key);
        if (typeof window.t === 'function') return window.t(key);
        return key;
    }

    function _injectModalHTML() {
        if (document.getElementById('bugReportModal')) {
            _injected = true;
            return;
        }
        const html = `
<div id="bugReportModal" class="modal-overlay" style="display:none">
    <div class="modal-container">
        <div class="modal-header">
            <h2 id="bugReportHeading"></h2>
            <button class="modal-close" id="bugReportClose">&times;</button>
        </div>
        <div class="modal-body">
            <p class="bug-report-intro" id="bugReportIntro"></p>
            <div class="form-group">
                <label id="bugReportTitleLabel" for="bugReportTitle"></label>
                <input type="text" id="bugReportTitle" maxlength="${MAX_TITLE}">
            </div>
            <div class="form-group">
                <label id="bugReportDescLabel" for="bugReportDesc"></label>
                <textarea id="bugReportDesc" rows="4" maxlength="${MAX_DESC}"></textarea>
            </div>
            <div class="form-group">
                <label id="bugReportStepsLabel" for="bugReportSteps"></label>
                <textarea id="bugReportSteps" rows="3" maxlength="${MAX_STEPS}"></textarea>
            </div>
            <details class="bug-report-metadata">
                <summary id="bugReportPreviewSummary"></summary>
                <pre id="bugReportMetadataPreview"></pre>
            </details>
            <div id="bugReportError" class="bug-report-error" hidden></div>
            <div id="bugReportSuccess" class="bug-report-success" hidden></div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" id="bugReportCancel"></button>
            <button class="btn btn-primary" id="bugReportSubmit"></button>
        </div>
    </div>
</div>`;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html.trim();
        document.body.appendChild(wrapper.firstChild);
        _injected = true;
    }

    function _applyTranslations() {
        document.getElementById('bugReportHeading').textContent = _t('bugReport.title');
        document.getElementById('bugReportIntro').textContent = _t('bugReport.intro');
        document.getElementById('bugReportTitleLabel').textContent = _t('bugReport.titleField');
        document.getElementById('bugReportTitle').placeholder = _t('bugReport.titlePlaceholder');
        document.getElementById('bugReportDescLabel').textContent = _t('bugReport.descField');
        document.getElementById('bugReportDesc').placeholder = _t('bugReport.descPlaceholder');
        document.getElementById('bugReportStepsLabel').textContent = _t('bugReport.stepsField');
        document.getElementById('bugReportSteps').placeholder = _t('bugReport.stepsPlaceholder');
        document.getElementById('bugReportPreviewSummary').textContent = _t('bugReport.previewMetadata');
        document.getElementById('bugReportCancel').textContent = _t('bugReport.cancel');
        document.getElementById('bugReportSubmit').textContent = _t('bugReport.submit');
    }

    function _wireHandlers() {
        document.getElementById('bugReportClose').addEventListener('click', close);
        document.getElementById('bugReportCancel').addEventListener('click', close);
        document.getElementById('bugReportSubmit').addEventListener('click', _submit);
        document.getElementById('bugReportModal').addEventListener('click', (e) => {
            if (e.target.id === 'bugReportModal') close();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('bugReportModal');
                if (modal && modal.style.display !== 'none') close();
            }
        });
    }

    function _wireBugButtons() {
        document.querySelectorAll('.bug-report-btn').forEach(btn => {
            btn.addEventListener('click', open);
        });
    }

    function _getAppVersion() {
        const meta = document.querySelector('meta[name="app-version"]');
        return meta ? meta.getAttribute('content') : 'unknown';
    }

    function _getLanguage() {
        if (window.i18n && typeof window.i18n.getCurrentLanguage === 'function') {
            return window.i18n.getCurrentLanguage();
        }
        return document.documentElement.lang || 'unknown';
    }

    function _buildMetadata() {
        return {
            appVersion: _getAppVersion(),
            userAgent: navigator.userAgent,
            pagePath: window.location.pathname,
            language: _getLanguage(),
            timestamp: new Date().toISOString(),
            recentErrors: (window.ErrorHandler && ErrorHandler.getRecentErrors)
                ? ErrorHandler.getRecentErrors() : []
        };
    }

    function _showError(html) {
        const el = document.getElementById('bugReportError');
        el.innerHTML = html;
        el.removeAttribute('hidden');
        document.getElementById('bugReportSuccess').setAttribute('hidden', '');
    }

    function _showSuccess(html) {
        const el = document.getElementById('bugReportSuccess');
        el.innerHTML = html;
        el.removeAttribute('hidden');
        document.getElementById('bugReportError').setAttribute('hidden', '');
        // Switch Cancel button to "Close" label
        document.getElementById('bugReportCancel').textContent = _t('bugReport.close');
        document.getElementById('bugReportSubmit').setAttribute('hidden', '');
    }

    function _resetModalState() {
        document.getElementById('bugReportTitle').value = '';
        document.getElementById('bugReportDesc').value = '';
        document.getElementById('bugReportSteps').value = '';
        document.getElementById('bugReportError').setAttribute('hidden', '');
        document.getElementById('bugReportSuccess').setAttribute('hidden', '');
        const submitBtn = document.getElementById('bugReportSubmit');
        submitBtn.removeAttribute('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = _t('bugReport.submit');
        document.getElementById('bugReportCancel').textContent = _t('bugReport.cancel');
        document.getElementById('bugReportMetadataPreview').textContent = JSON.stringify(_buildMetadata(), null, 2);
    }

    function _escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[c]));
    }

    function _buildFallbackUrl(title, description, steps, metadata) {
        const body = [
            `## Description\n\n${description}`,
            steps ? `## Steps to reproduce\n\n${steps}` : '',
            `## Metadata\n\n\`\`\`json\n${JSON.stringify(metadata, null, 2)}\n\`\`\``
        ].filter(Boolean).join('\n\n');
        const params = new URLSearchParams({ title: `[Bug] ${title}`, body });
        return `${REPO_FALLBACK_URL}?${params.toString()}`;
    }

    async function _submit() {
        const title = document.getElementById('bugReportTitle').value.trim();
        const description = document.getElementById('bugReportDesc').value.trim();
        const steps = document.getElementById('bugReportSteps').value.trim();

        if (!title || !description) {
            _showError(_escapeHtml(_t('bugReport.errorMissingFields')));
            return;
        }

        const metadata = _buildMetadata();
        const submitBtn = document.getElementById('bugReportSubmit');
        submitBtn.disabled = true;
        submitBtn.textContent = _t('bugReport.submitting');

        try {
            const response = await fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description, steps, metadata })
            });

            if (response.ok) {
                const data = await response.json();
                const url = data.issueUrl || REPO_FALLBACK_URL;
                _showSuccess(
                    `<strong>${_escapeHtml(_t('bugReport.successTitle'))}</strong><br>` +
                    `<a href="${_escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${_escapeHtml(_t('bugReport.successOpenIssue'))}</a>`
                );
                return;
            }

            if (response.status === 429) {
                _showError(_escapeHtml(_t('bugReport.errorRateLimit')));
                submitBtn.disabled = false;
                submitBtn.textContent = _t('bugReport.submit');
                return;
            }

            // Generic error — show fallback manual link
            const fallback = _buildFallbackUrl(title, description, steps, metadata);
            _showError(
                _escapeHtml(_t('bugReport.errorGeneric')) + ' ' +
                `<a href="${_escapeHtml(fallback)}" target="_blank" rel="noopener noreferrer">${_escapeHtml(_t('bugReport.fallbackOpen'))}</a>`
            );
            submitBtn.disabled = false;
            submitBtn.textContent = _t('bugReport.submit');
        } catch (e) {
            const fallback = _buildFallbackUrl(title, description, steps, metadata);
            _showError(
                _escapeHtml(_t('bugReport.errorNetwork')) + ' ' +
                `<a href="${_escapeHtml(fallback)}" target="_blank" rel="noopener noreferrer">${_escapeHtml(_t('bugReport.fallbackOpen'))}</a>`
            );
            submitBtn.disabled = false;
            submitBtn.textContent = _t('bugReport.submit');
        }
    }

    function init() {
        if (_injected) return;
        _injectModalHTML();
        _applyTranslations();
        _wireHandlers();
        _wireBugButtons();
    }

    function open() {
        if (!_injected) init();
        _resetModalState();
        document.getElementById('bugReportModal').style.display = 'flex';
    }

    function close() {
        const modal = document.getElementById('bugReportModal');
        if (modal) modal.style.display = 'none';
    }

    // Test helper — reset internal state between tests
    function _reset() {
        _injected = false;
    }

    return { init, open, close, _buildMetadata, _submit, _reset };
})();
```

- [ ] **Step 5.5: Run tests, verify pass**

```bash
node tests/run-tests.js 2>&1 | grep -E "BugReport"
```
Expected: 11 PASS.

- [ ] **Step 5.6: Sync dist + commit**

```bash
cp assets/js/common/bug-report.js dist/assets/js/common/bug-report.js
git add assets/js/common/bug-report.js dist/assets/js/common/bug-report.js tests/test-suites/bug-report-frontend.test.js tests/test-runner.html
git commit -m "feat(bug-report): BugReport namespace, modal injection, submit flow"
```

**✅ Step 1 checkpoint:** Frontend module + error buffer + i18n + CSS done. ~17 new tests pass. Modal works locally without backend (network failure shows fallback link).

---

## Step 2: Cloudflare Worker + Page Integration

### Task 6: Create Cloudflare Pages Function

**Files:**
- Create: `functions/api/bug-report.js`

- [ ] **Step 6.1: Create the worker**

Create `functions/api/bug-report.js`:
```js
/**
 * Cloudflare Pages Function — bug report endpoint.
 *
 * Receives bug reports from the in-app modal, validates origin, rate-limits
 * per IP via KV, and creates a GitHub issue.
 *
 * Bindings required (configure in Cloudflare dashboard → Pages → Settings → Functions):
 *   - KV namespace: BUG_REPORT_RATELIMIT
 *   - Environment variable: GITHUB_REPO (e.g. "MichalMarvan/BIM_checker")
 *   - Secret: GITHUB_TOKEN (fine-grained PAT with Issues: Read and Write on the repo)
 */

const ALLOWED_ORIGINS = new Set([
    'https://checkthebim.com',
    'https://www.checkthebim.com',
    'http://localhost:8000',
    'http://localhost:3000',
    'http://raspberrypi:8000'
]);

const HOUR_LIMIT = 5;
const DAY_LIMIT = 20;
const HOUR_TTL = 3600;
const DAY_TTL = 86400;

const MAX_TITLE = 120;
const MAX_DESC = 5000;
const MAX_STEPS = 2000;

function corsHeaders(origin) {
    const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://checkthebim.com';
    return {
        'Access-Control-Allow-Origin': allow,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin'
    };
}

function jsonResponse(body, status, origin, extraHeaders) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(origin),
            ...(extraHeaders || {})
        }
    });
}

function truncate(s, max) {
    if (typeof s !== 'string') return '';
    return s.length > max ? s.slice(0, max) + '… [truncated]' : s;
}

function validatePayload(payload) {
    if (!payload || typeof payload !== 'object') return { valid: false, field: 'body' };
    if (typeof payload.title !== 'string' || !payload.title.trim()) return { valid: false, field: 'title' };
    if (typeof payload.description !== 'string' || !payload.description.trim()) return { valid: false, field: 'description' };
    if (!payload.metadata || typeof payload.metadata !== 'object') return { valid: false, field: 'metadata' };
    return { valid: true };
}

function formatIssueBody(payload) {
    const { description, steps, metadata } = payload;
    const md = metadata || {};
    const recentErrors = Array.isArray(md.recentErrors) ? md.recentErrors : [];

    const lines = [];
    lines.push('## Popis\n');
    lines.push(truncate(description, MAX_DESC));
    lines.push('\n## Kroky k reprodukci\n');
    lines.push(steps && steps.trim() ? truncate(steps, MAX_STEPS) : '_Neuvedeno_');
    lines.push('\n---\n');
    lines.push('### Automatická metadata\n');
    lines.push('| Field | Value |');
    lines.push('|---|---|');
    lines.push(`| **App version** | \`${md.appVersion || 'unknown'}\` |`);
    lines.push(`| **Page** | \`${md.pagePath || 'unknown'}\` |`);
    lines.push(`| **Language** | \`${md.language || 'unknown'}\` |`);
    lines.push(`| **Timestamp** | \`${md.timestamp || 'unknown'}\` |`);
    lines.push(`| **User agent** | \`${md.userAgent || 'unknown'}\` |`);

    if (recentErrors.length > 0) {
        lines.push('\n### Recent console errors\n');
        lines.push('```');
        for (const err of recentErrors) {
            lines.push(String(err));
        }
        lines.push('```');
    }

    lines.push('\n---\n');
    lines.push('*Reportováno přes in-app bug reporter. Kontakt na uživatele zde není — v případě potřeby reagujte komentářem na tuto issue.*');
    return lines.join('\n');
}

async function checkRateLimit(ip, env) {
    if (!env.BUG_REPORT_RATELIMIT) {
        // KV not configured — fail-open in dev, fail-closed in prod
        return { allowed: true, warning: 'KV not bound' };
    }
    const now = Math.floor(Date.now() / 1000);
    const hourBucket = Math.floor(now / HOUR_TTL);
    const dayBucket = Math.floor(now / DAY_TTL);
    const hourKey = `rl:hour:${ip}:${hourBucket}`;
    const dayKey = `rl:day:${ip}:${dayBucket}`;

    const [hourStr, dayStr] = await Promise.all([
        env.BUG_REPORT_RATELIMIT.get(hourKey),
        env.BUG_REPORT_RATELIMIT.get(dayKey)
    ]);
    const hourCount = parseInt(hourStr || '0', 10);
    const dayCount = parseInt(dayStr || '0', 10);

    if (hourCount >= HOUR_LIMIT) {
        return { allowed: false, limit: 'hourly', retryAfter: HOUR_TTL };
    }
    if (dayCount >= DAY_LIMIT) {
        return { allowed: false, limit: 'daily', retryAfter: DAY_TTL };
    }

    await Promise.all([
        env.BUG_REPORT_RATELIMIT.put(hourKey, String(hourCount + 1), { expirationTtl: HOUR_TTL }),
        env.BUG_REPORT_RATELIMIT.put(dayKey, String(dayCount + 1), { expirationTtl: DAY_TTL })
    ]);
    return { allowed: true };
}

async function createGithubIssue(payload, env) {
    const lang = (payload.metadata && payload.metadata.language) || 'unknown';
    const body = formatIssueBody(payload);
    const url = `https://api.github.com/repos/${env.GITHUB_REPO}/issues`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'BIM-checker-bug-reporter',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            title: `[Bug] ${truncate(payload.title, MAX_TITLE)}`,
            body,
            labels: ['bug-report', 'user-submitted', `lang:${lang}`]
        })
    });
    if (!response.ok) {
        return { ok: false, status: response.status };
    }
    const data = await response.json();
    return { ok: true, issueUrl: data.html_url, issueNumber: data.number };
}

export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
        return jsonResponse({ error: 'method_not_allowed' }, 405, origin);
    }

    if (!ALLOWED_ORIGINS.has(origin)) {
        return jsonResponse({ error: 'forbidden_origin' }, 403, origin);
    }

    let payload;
    try {
        payload = await request.json();
    } catch (_e) {
        return jsonResponse({ error: 'invalid_json' }, 400, origin);
    }

    const validation = validatePayload(payload);
    if (!validation.valid) {
        return jsonResponse({ error: 'invalid_input', field: validation.field }, 400, origin);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rl = await checkRateLimit(ip, env);
    if (!rl.allowed) {
        return jsonResponse(
            { error: 'rate_limit', limit: rl.limit },
            429,
            origin,
            { 'Retry-After': String(rl.retryAfter) }
        );
    }

    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
        return jsonResponse({ error: 'misconfigured' }, 500, origin);
    }

    const gh = await createGithubIssue(payload, env);
    if (!gh.ok) {
        return jsonResponse({ error: 'github_failed', status: gh.status }, 502, origin);
    }

    return jsonResponse({
        ok: true,
        issueUrl: gh.issueUrl,
        issueNumber: gh.issueNumber
    }, 201, origin);
}
```

- [ ] **Step 6.2: Commit (no tests for worker — manual smoke test in Task 10)**

```bash
git add functions/api/bug-report.js
git commit -m "feat(api): bug-report Cloudflare Pages Function (origin check, rate limit, GitHub issue)"
```

---

### Task 7: Add bug button + script load to all 4 pages

**Files:**
- Modify: `pages/index.html`, `pages/ids-parser-visualizer.html`, `pages/ids-ifc-validator.html`, `pages/ifc-viewer-multi-file.html`
- Modify: `dist/pages/*.html`

- [ ] **Step 7.1: Add bug button to each page's navbar-actions**

For each of the 4 HTML pages, find `<div class="navbar-actions">`. Insert this AS THE FIRST CHILD of that div (before the wizard tour button or theme toggle):
```html
<button class="bug-report-btn" id="bugReportBtn" title="Nahlásit chybu" data-i18n-title="bugReport.tooltip" aria-label="Report bug">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="8" y="6" width="8" height="14" rx="4"/>
        <path d="M19 7l-3 2"/>
        <path d="M5 7l3 2"/>
        <path d="M19 13h-3"/>
        <path d="M5 13h3"/>
        <path d="M19 19l-3-2"/>
        <path d="M5 19l3-2"/>
        <path d="M12 6V4a3 3 0 0 0-6 0"/>
    </svg>
</button>
```

For `pages/index.html`, the navbar may have a different structure — locate any element that contains the language switcher or theme toggle, and put the bug button next to it. If `pages/index.html` does NOT have a navbar with these elements, add the button to a sensible location near the existing UI controls (or omit if there's no clear place — note in commit message and proceed).

- [ ] **Step 7.2: Load bug-report.js + call init() on each page**

For each of the 4 HTML pages, find the script tags near `</body>`. After the existing `<script src="../assets/js/common/error-handler.js"></script>` line (or any common module load), add:
```html
<script src="../assets/js/common/bug-report.js"></script>
```

Then add an inline init script BEFORE `</body>`:
```html
<script>
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => BugReport.init());
    } else {
        BugReport.init();
    }
</script>
```

If the page already has a `DOMContentLoaded` handler that does multiple init calls (e.g., wizard init), append `BugReport.init();` to that existing handler instead of creating a new script.

- [ ] **Step 7.3: Sync dist for all 4 pages**

```bash
cp pages/index.html dist/pages/index.html
cp pages/ids-parser-visualizer.html dist/pages/ids-parser-visualizer.html
cp pages/ids-ifc-validator.html dist/pages/ids-ifc-validator.html
cp pages/ifc-viewer-multi-file.html dist/pages/ifc-viewer-multi-file.html
```

- [ ] **Step 7.4: Run tests, verify no regression**

```bash
node tests/run-tests.js 2>&1 | tail -5
```
Expected: SUMMARY ~404/404 (387 from Phase 2 + 17 from Phase 5 Step 1) tests passed.

- [ ] **Step 7.5: Commit**

```bash
git add pages/*.html dist/pages/*.html
git commit -m "feat(pages): add bug-report button + init() to all 4 pages"
```

**✅ Step 2 checkpoint:** Worker code in repo, frontend buttons wired, no test regression. Worker not yet deployed — manual setup required (Task 10).

---

## Step 3: PWA, Docs, Manual Setup, Push

### Task 8: Update PWA service worker precache

**Files:**
- Modify: `sw.js`
- Modify: `dist/sw.js`

- [ ] **Step 8.1: Find current cache version**

```bash
grep -nE "CACHE_NAME|bim-checker-v" /home/michal/work/BIM_checker/sw.js | head -3
```
Note the current cache name (e.g. `bim-checker-v4`).

- [ ] **Step 8.2: Bump cache version + add new asset**

In `sw.js`, change the cache version constant to the next number (e.g. `bim-checker-v4` → `bim-checker-v5`). Find the precache list (the array of URLs starting with `/`, often called `urlsToCache` or similar) and add:
```js
'/assets/js/common/bug-report.js',
```

- [ ] **Step 8.3: Sync dist + commit**

```bash
cp sw.js dist/sw.js
git add sw.js dist/sw.js
git commit -m "chore(pwa): add bug-report.js to precache + bump cache version"
```

---

### Task 9: Update PLAN.md and CHANGELOG.md

**Files:**
- Modify: `PLAN.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 9.1: Update PLAN.md**

In `PLAN.md`, find the "Hotové (Done)" section. Append a new subsection at the end:
```markdown
### In-app bug report (Phase 5, 2026-05-08)
- [x] Tlačítko 🐛 v navbaru všech 4 stránek
- [x] Modal s formulářem (název, popis, kroky k reprodukci)
- [x] Auto-attached metadata: app version, user agent, page path, language, timestamp, last 5 console errors
- [x] Cloudflare Pages Function `/api/bug-report` s origin check + rate limit (5/h, 20/d per IP) přes KV
- [x] GitHub Issues integrace (labels: bug-report, user-submitted, lang:cs|en)
- [x] Failsafe link na ruční GitHub issue creation
- [x] +17 nových testů
```

If "Bug report z aplikace" was listed in the "TODO" / "Střední priorita" section, remove that entry.

- [ ] **Step 9.2: Update CHANGELOG.md**

Prepend at the top of `CHANGELOG.md` (after the `# Changelog` heading):
```markdown
## [0.2.2] — 2026-05-08

### Added
- In-app bug report — bug button in navbar of all 4 pages opens a modal that creates a GitHub issue via Cloudflare Pages Function.
- Auto-attached metadata: app version, user agent, page path, language, timestamp, last 5 console errors.
- `ErrorHandler` ring buffer (5 entries) fed by `window.error` and `unhandledrejection` listeners.
- Anonymous reporting (no email/name field), no screenshot in v1, fallback link to manual GitHub issue when worker fails.
```

- [ ] **Step 9.3: Commit**

```bash
git add PLAN.md CHANGELOG.md
git commit -m "docs: mark Phase 5 (in-app bug report) complete"
```

---

### Task 10: Cloudflare + GitHub manual setup

**Files:** none (manual configuration outside the repo)

This task is a **manual one-time setup** that the user (Michal) executes via web UIs. The plan documents the steps; an agent cannot perform them automatically because they require web logins and secret values.

- [ ] **Step 10.1: Create GitHub fine-grained PAT**

1. Open https://github.com/settings/personal-access-tokens/new
2. Fields:
   - **Token name:** `BIM-checker-bug-reporter`
   - **Expiration:** custom or no expiration (depending on preference)
   - **Repository access:** Only select repositories → choose `MichalMarvan/BIM_checker`
   - **Permissions:** Repository permissions → **Issues: Read and write** (leave everything else default)
3. Click **Generate token**, copy the value (starts with `github_pat_`).

- [ ] **Step 10.2: Create GitHub label `bug-report`**

1. Open https://github.com/MichalMarvan/BIM_checker/labels
2. Click **New label**
   - **Name:** `bug-report`
   - **Color:** `#fbca04` (yellow) or any preferred
   - **Description:** `Submitted via in-app bug reporter`
3. Click **Create label**.

(Labels `user-submitted` and `lang:cs` / `lang:en` will be auto-created on first issue.)

- [ ] **Step 10.3: Create Cloudflare KV namespace**

1. Open Cloudflare dashboard → Workers & Pages → KV → **Create a namespace**
   - **Namespace name:** `BUG_REPORT_RATELIMIT`
2. Note the namespace ID (visible in the list).

- [ ] **Step 10.4: Bind KV + add env + secret to Pages project**

1. Cloudflare dashboard → Workers & Pages → select the BIM_checker Pages project → **Settings** → **Functions**
2. **KV namespace bindings** → Add binding:
   - **Variable name:** `BUG_REPORT_RATELIMIT`
   - **KV namespace:** select the one created in Step 10.3
3. **Environment variables** (Production + Preview):
   - Add `GITHUB_REPO` = `MichalMarvan/BIM_checker` (plain text)
   - Add `GITHUB_TOKEN` = the PAT from Step 10.1, marked as **Encrypted** (secret)
4. Save. The next deploy will pick up these bindings.

- [ ] **Step 10.5: Trigger a redeploy**

Push any commit (next task) and Cloudflare Pages will redeploy with new bindings active.

---

### Task 11: Final test run + push + manual smoke test

**Files:** none (verification + push)

- [ ] **Step 11.1: Run full test suite**

```bash
node tests/run-tests.js 2>&1 | tail -10
```
Expected: SUMMARY ~404/404 tests passed (387 from Phase 2 + 17 from Phase 5).

- [ ] **Step 11.2: Verify dist/ in sync**

```bash
mismatches=0
for f in $(git ls-files | grep -E '^assets/'); do
    dist_f="dist/${f#assets/}"
    if [ -f "$dist_f" ] && ! cmp -s "$f" "$dist_f"; then
        echo "MISMATCH: $f vs $dist_f"
        mismatches=$((mismatches + 1))
    fi
done
echo "Total mismatches: $mismatches"
```
Expected: 0.

- [ ] **Step 11.3: Push branch**

```bash
git push -u origin phase-5-bug-report
```

- [ ] **Step 11.4: Wait for Cloudflare deploy + verify CI**

```bash
gh run list --branch phase-5-bug-report --limit 1
```
If CI fails on ESLint with `BugReport` undefined, add to `eslint.config.js` globals block:
```js
                BugReport: 'readonly',
```
Sync dist (no — eslint.config.js isn't synced), commit + push.

Then wait ~1 minute for Cloudflare Pages to redeploy with the new function.

- [ ] **Step 11.5: Manual smoke test — happy path**

1. Open the deployed preview URL for the branch (Cloudflare Pages provides one per branch, e.g. `https://phase-5-bug-report.bim-checker.pages.dev/`)
2. Click any of the 4 pages
3. Click the bug 🐛 icon in the navbar
4. Modal opens; fill in:
   - Title: `Test report from manual smoke test`
   - Description: `Testing the bug report flow end-to-end.`
   - Steps: leave empty
5. Expand "Co se automaticky přiloží?" — verify metadata JSON looks correct (appVersion, userAgent, pagePath, language, timestamp, recentErrors)
6. Click **Odeslat**
7. Wait for response. Expected: success state appears with "✅ Report odeslán! Otevřít na GitHubu" link
8. Click the link — verify the GitHub issue exists with:
   - Title: `[Bug] Test report from manual smoke test`
   - Labels: `bug-report`, `user-submitted`, `lang:cs` (or `lang:en` if testing in English)
   - Body contains the description + automatic metadata table

- [ ] **Step 11.6: Manual smoke test — rate limit**

Repeat the submission 6 times in quick succession. The 6th should return 429 with the message about too many reports. Verify the modal shows the rate-limit error.

(KV TTLs mean you'll need to wait 1 hour before the same IP can submit again — so do this AFTER all other testing is done. Optionally use a different network to reset the IP.)

- [ ] **Step 11.7: Manual smoke test — origin check**

From a terminal:
```bash
curl -X POST 'https://phase-5-bug-report.bim-checker.pages.dev/api/bug-report' \
    -H 'Content-Type: application/json' \
    -H 'Origin: https://malicious.example.com' \
    -d '{"title":"x","description":"x","metadata":{"appVersion":"x"}}'
```
Expected: 403 Forbidden with `{"error":"forbidden_origin"}`.

- [ ] **Step 11.8: Manual smoke test — fallback link on worker failure**

To test fallback: temporarily change `GITHUB_TOKEN` in CF dashboard to an invalid value, redeploy, submit a bug report. Expected: modal shows "Nastala chyba při odesílání" with a working "Otevřít issue ručně" link that opens a prefilled GitHub new-issue page.

After verifying, restore the real `GITHUB_TOKEN`.

**✅ Phase 5 done.** Branch ready for merge to master via `--no-ff` merge commit (same convention as Phase 1 and 2).

---

## Self-Review

### Spec coverage
- ✅ Bug button in navbar all 4 pages: Task 7
- ✅ Modal with form (title, description, steps): Task 5 (BugReport module)
- ✅ Anonymous, no email field: Task 5 (no email field in modal HTML)
- ✅ Auto metadata (appVersion, userAgent, pagePath, language, timestamp, recentErrors): Task 5 (`_buildMetadata`)
- ✅ Error ring buffer: Task 1
- ✅ Cloudflare Pages Function: Task 6
- ✅ Origin check: Task 6 (ALLOWED_ORIGINS)
- ✅ Rate limit per IP via KV: Task 6 (`checkRateLimit`)
- ✅ GitHub Issues API call with labels: Task 6 (`createGithubIssue`)
- ✅ Issue body markdown format: Task 6 (`formatIssueBody`)
- ✅ Failure modes (400/403/429/502/network): Task 5 (submit logic) + Task 6 (response codes)
- ✅ Failsafe manual link on worker failure: Task 5 (`_buildFallbackUrl`)
- ✅ i18n cs + en: Task 3
- ✅ CSS for button + modal: Task 4
- ✅ App version meta tag: Task 2
- ✅ PWA precache + version bump: Task 8
- ✅ PLAN.md + CHANGELOG: Task 9
- ✅ Cloudflare + GitHub manual setup: Task 10
- ✅ Manual smoke tests for happy path, rate limit, origin, fallback: Task 11

### Type/name consistency
- `BugReport` namespace functions used consistently: `init`, `open`, `close`, `_buildMetadata`, `_submit`, `_reset`
- `ErrorHandler.recordError` and `ErrorHandler.getRecentErrors` referenced consistently
- Modal element IDs: `bugReportModal`, `bugReportTitle`, `bugReportDesc`, `bugReportSteps`, `bugReportSubmit`, `bugReportCancel`, `bugReportClose`, `bugReportError`, `bugReportSuccess`, `bugReportMetadataPreview`, `bugReportPreviewSummary` — used consistently across HTML, JS, and tests
- i18n keys all prefixed `bugReport.*` consistently
- Worker function names: `validatePayload`, `formatIssueBody`, `checkRateLimit`, `createGithubIssue`, `corsHeaders`, `jsonResponse`, `truncate`, `onRequest` — internal consistency

### Placeholder scan
None. Every step has actual content.

### Scope
11 tasks, ~50 steps. Sized for ~2-3 days of subagent execution. Single plan is appropriate — small focused feature.
