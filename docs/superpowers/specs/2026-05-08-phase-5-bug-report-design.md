# Phase 5 — In-App Bug Report

**Status:** Approved (design phase)
**Date:** 2026-05-08
**Author:** Michal Marvan (with Claude)

## Goal

Přidat tlačítko „Nahlásit chybu" do navbaru všech 4 stránek, které otevře modal s formulářem. Po odeslání vznikne veřejný GitHub issue v repu `MichalMarvan/BIM_checker` s popisem od uživatele a automatickou metadatou (verze, prohlížeč, URL, jazyk, posledních 5 console errors). Backend je Cloudflare Pages Function, která validuje origin, rate-limituje per IP a volá GitHub API.

## Motivation

Dnes nemáš kanál na uživatelskou zpětnou vazbu. Chyby se hlásí přes osobní kontakt, mail, nebo se vůbec nehlásí. Phase 5 zavádí 1-klik path k vytvoření trackovatelného issue: uživatel klikne ikonu, popíše problém, klikne odeslat, dostane odkaz na issue. Ty dostaneš strukturovaný report s technickým kontextem (browser, recent errors), bez friction o emailu nebo screenshotu.

Strategická hodnota: dodat to **brzy**, abys dostal feedback během vývoje dalších fází (Phase 3, 4).

## Non-Goals

- Screenshot upload v této fázi (uživatel může komentář s obrázkem přidat na vzniklou issue manuálně přes GitHub UI).
- Identifikace uživatele (žádný email, žádný name field). Plně anonymní.
- Auto-detekce duplicit (GitHub Issues má built-in vyhledávání).
- CAPTCHA — origin check + rate limit per IP stačí pro v1 volume.
- Dashboard / správa reportů (GitHub Issues UI je dashboard).
- Push notifikace zpět uživateli (vyžadovalo by identifikaci).

## Architecture

### Komponenty a soubory

```
functions/
└── api/
    └── bug-report.js              # NEW: Cloudflare Pages Function

assets/
├── js/
│   └── common/
│       ├── error-handler.js       # MOD: + ringBuffer + window.onerror listener
│       ├── bug-report.js          # NEW: BugReport namespace, modal injection, submit
│       └── translations.js        # MOD: ~20 nových i18n klíčů × 2 jazyky
├── css/
│   └── common.css                 # MOD: + bug-report-btn + modal styles

pages/
├── index.html                     # MOD: bug button v navbar-actions, meta version, script
├── ids-parser-visualizer.html     # MOD: stejné
├── ids-ifc-validator.html         # MOD: stejné
└── ifc-viewer-multi-file.html     # MOD: stejné

sw.js                              # MOD: precache + version bump

tests/
├── test-runner.html               # MOD: load nové suity
└── test-suites/
    ├── error-handler-buffer.test.js   # NEW: ~5 testů
    └── bug-report-frontend.test.js    # NEW: ~10 testů

dist/                              # sync všeho výše
```

### Závislostní graf

```
[Each page] ─→ assets/js/common/error-handler.js  (ringBuffer + window.onerror)
            ─→ assets/js/common/bug-report.js     (modal, submit handler)
                                ↓
                  POST /api/bug-report
                                ↓
              Cloudflare Pages Function: bug-report.js
                  ├── origin check (allowlist)
                  ├── rate limit per IP (KV)
                  └── GitHub Issues API
                        ↓
                  github.com/MichalMarvan/BIM_checker/issues
```

## Backend — Cloudflare Worker

### Endpoint

`POST /api/bug-report`

### Request shape

```json
{
  "title": "string (≤120 chars)",
  "description": "string (≤5000 chars)",
  "steps": "string (≤2000 chars, optional)",
  "metadata": {
    "appVersion": "0.2.x",
    "userAgent": "Mozilla/...",
    "pagePath": "/pages/...",
    "language": "cs",
    "timestamp": "ISO8601",
    "recentErrors": ["...", "..."]
  }
}
```

Validation: title + description + metadata required. Délkové limity vynucené truncate-with-warning, ne reject (lepší UX).

### Origin check (gate 1)

```js
const ALLOWED_ORIGINS = new Set([
    'https://checkthebim.com',
    'https://www.checkthebim.com',
    'http://localhost:8000',
    'http://localhost:3000',
    'http://raspberrypi:8000'
]);
```

Origin nepovolen → `403 Forbidden`.

### Rate limit (gate 2) — Cloudflare KV

```
KV binding: BUG_REPORT_RATELIMIT
Klíče:
  rl:hour:<ip>:<bucket> → count   (TTL 3600s)
  rl:day:<ip>:<bucket>  → count   (TTL 86400s)
Limity:
  hour: 5
  day:  20
```

IP zdroj: `request.headers.get('CF-Connecting-IP')`.

Limit překročen → `429 Too Many Requests` s `Retry-After: <seconds>` headerem a JSON body `{ "error": "rate_limit", "limit": "hourly" | "daily" }`.

### GitHub API

```
POST https://api.github.com/repos/<GITHUB_REPO>/issues
Headers:
  Authorization: Bearer <GITHUB_TOKEN>
  Accept: application/vnd.github+json
  X-GitHub-Api-Version: 2022-11-28
  User-Agent: BIM-checker-bug-reporter
Body:
  {
    "title": "[Bug] " + user_title,
    "body": <markdown — viz níže>,
    "labels": ["bug-report", "user-submitted", "lang:<cs|en>"]
  }
```

Token scope: `Issues: Read and Write` na `MichalMarvan/BIM_checker` (fine-grained PAT).

### Issue body markdown

```markdown
## Popis

<user description>

## Kroky k reprodukci

<user steps OR "_Neuvedeno_">

---

### Automatická metadata

| Field | Value |
|---|---|
| **App version** | `0.2.x` |
| **Page** | `/pages/...` |
| **Language** | `cs` |
| **Timestamp** | `ISO8601` |
| **User agent** | `...` |

### Recent console errors

```
[2026-05-08T12:34:56.789Z] TypeError: ...
[2026-05-08T12:34:55.123Z] ReferenceError: ...
```

---

*Reportováno přes in-app bug reporter. Kontakt na uživatele zde není — v případě potřeby reagujte komentářem na tuto issue.*
```

`recentErrors` sekce se vynechá pokud prázdné. `steps` sekce zobrazí „_Neuvedeno_" pokud prázdné.

### Response

| Status | Body | Důvod |
|---|---|---|
| 201 | `{ "ok": true, "issueUrl": "...", "issueNumber": 42 }` | Úspěch |
| 400 | `{ "error": "invalid_input", "field": "title" }` | Validace |
| 403 | `{ "error": "forbidden_origin" }` | Origin |
| 429 | `{ "error": "rate_limit", "limit": "hourly"\|"daily" }` | Rate limit |
| 502 | `{ "error": "github_failed", "status": <gh_status> }` | GitHub API |
| 500 | `{ "error": "internal" }` | Cokoli jiného |

### Cloudflare setup (manuální, jednorázový)

1. **Cloudflare dashboard** → Pages → Project → Settings → Functions:
   - KV namespace bindings: vytvořit `BUG_REPORT_RATELIMIT`
   - Environment variables: `GITHUB_REPO=MichalMarvan/BIM_checker`
   - Secrets (encrypted): `GITHUB_TOKEN=<fine-grained PAT>`

2. **GitHub** → Settings → Developer settings → Personal access tokens → Fine-grained:
   - Token scope: repo `MichalMarvan/BIM_checker`
   - Permissions: `Issues: Read and Write`
   - Vlož do CF Worker secret `GITHUB_TOKEN`

3. **GitHub repo** → Issues → Labels:
   - Vytvořit label `bug-report` (barva volitelná, např. žlutá)
   - Label `user-submitted` se vytvoří automaticky při prvním issue

Tyto kroky jsou v implementačním plánu jako manuální task pro uživatele (žádná automatika v kódu).

## Frontend — bug button + modal

### Bug button

Přidá se do `<div class="navbar-actions">` ve všech 4 stránkách (před theme toggle):

```html
<button class="bug-report-btn" id="bugReportBtn"
        title="Nahlásit chybu" data-i18n-title="bugReport.tooltip">
    <svg viewBox="0 0 24 24" ...>...</svg>
</button>
```

CSS sjednocený se vzorem ostatních navbar tlačítek (`.theme-toggle`, `.wizard-header-btn`).

### Modal (injektovaný do DOM)

`BugReport.init()` injektuje modal HTML do `<body>`. Žádná duplicita HTML napříč 4 stránkami.

```html
<div id="bugReportModal" class="modal-overlay" style="display:none">
    <div class="modal-container">
        <div class="modal-header">
            <h2 data-i18n="bugReport.title">Nahlásit chybu</h2>
            <button class="modal-close" id="bugReportClose">&times;</button>
        </div>
        <div class="modal-body">
            <p class="bug-report-intro" data-i18n="bugReport.intro">...</p>

            <div class="form-group">
                <label data-i18n="bugReport.titleField">Krátký název problému *</label>
                <input type="text" id="bugReportTitle" maxlength="120">
            </div>
            <div class="form-group">
                <label data-i18n="bugReport.descField">Co se stalo *</label>
                <textarea id="bugReportDesc" rows="4" maxlength="5000"></textarea>
            </div>
            <div class="form-group">
                <label data-i18n="bugReport.stepsField">Kroky k reprodukci (volitelné)</label>
                <textarea id="bugReportSteps" rows="3" maxlength="2000"></textarea>
            </div>

            <details class="bug-report-metadata">
                <summary data-i18n="bugReport.previewMetadata">Co se automaticky přiloží?</summary>
                <pre id="bugReportMetadataPreview"></pre>
            </details>

            <div id="bugReportError" class="bug-report-error" hidden></div>
            <div id="bugReportSuccess" class="bug-report-success" hidden></div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" id="bugReportCancel" data-i18n="bugReport.cancel">Zrušit</button>
            <button class="btn btn-primary" id="bugReportSubmit" data-i18n="bugReport.submit">Odeslat</button>
        </div>
    </div>
</div>
```

### `BugReport` namespace API

```js
window.BugReport = {
    init(),       // injects modal HTML, wires button click handlers
    open(),       // resets form, shows modal
    close(),     // hides modal
};
```

`init()` je idempotentní — druhé volání nic nedělá. Volá se z DOMContentLoaded handleru každé stránky.

### `buildMetadata()` (interní)

```js
function buildMetadata() {
    return {
        appVersion: getAppVersion(),
        userAgent: navigator.userAgent,
        pagePath: window.location.pathname,
        language: i18n?.getCurrentLanguage?.() || document.documentElement.lang || 'unknown',
        timestamp: new Date().toISOString(),
        recentErrors: ErrorHandler?.getRecentErrors?.() || []
    };
}
```

`appVersion` čte z `<meta name="app-version" content="0.2.x">` v `<head>`. Single source = `package.json`; bump přes manuální update meta tagu (drobná friction, ale jediný způsob bez build systému).

### Error buffer — rozšíření `error-handler.js`

```js
class ErrorHandler {
    static _errorBuffer = [];
    static MAX_BUFFERED_ERRORS = 5;

    static recordError(message) { ... ring buffer push ... }
    static getRecentErrors() { return [...ErrorHandler._errorBuffer]; }
    static _installGlobalListeners() {
        window.addEventListener('error', (e) => { ErrorHandler.recordError(...); });
        window.addEventListener('unhandledrejection', (e) => { ErrorHandler.recordError(...); });
    }
}
ErrorHandler._installGlobalListeners();  // auto-install on script load
```

Listener se zaregistruje při loadu `error-handler.js` (už je loadovaný na všech 4 stránkách). Existující toast metody fungují identicky, jen vedle nich tiše plní buffer.

### UX flow

```
[Klik bug ikona]
     ↓
[Modal opens, formulář prázdný, metadata preview rozbalitelná]
     ↓
[Uživatel typne title + popis (steps optional)]
     ↓
[Klik Odeslat]
     ├── validation fail → inline červený error v modal
     └── ok →
            ↓
       [Submit button: "Odesílám…", disabled]
            ↓
       [POST /api/bug-report]
            ├── 201 → success state s issueUrl + tlačítko "Otevřít na GitHubu"
            ├── 429 → "Příliš mnoho reportů z této IP. Zkus znovu za hodinu."
            ├── 403 → "Origin nepovolen" (legit usecase neměl by se stát)
            └── 500/502/network → "Nepodařilo se odeslat. Otevřít issue ručně? [GitHub link]"
                                   ↑ link s prefilled query parameters jako failsafe
```

### Failsafe ruční fallback link

Pokud Worker selže, success-error message obsahuje **link na ručně otevřený GitHub issue**:

```
https://github.com/MichalMarvan/BIM_checker/issues/new
  ?title=<encoded user title>
  &body=<encoded user description + metadata>
```

Uživatel klikne, otevře GitHub login flow se svým účtem (a může doplnit screenshot).

### Mobile UX

Modal stejný layout jako existující modaly (`storage-picker-modal`, `wizard-help-modal`) — responzivní, scroll uvnitř `.modal-body`. Žádný extra CSS hack.

## Privacy

| Co se NIKDY neposílá | Důvod |
|---|---|
| Jména IFC/IDS souborů | Mohou nést info o projektu/firmě |
| Obsah souborů | Business confidential |
| IP uživatele v issue body | KV ukládá pro rate limit, ne v public issue |
| Email / jméno / kontakt | Anonymita per design |

| Co se posílá | Účel |
|---|---|
| App version | Reproducibility |
| User agent | Browser bug isolation |
| Page path (no query) | Kde se chyba stala |
| Jazyk UI | Lokalizační bugy |
| Timestamp | Korelace s logy |
| Recent console errors | Technický kontext |

GDPR: žádná osobní data se v reportu neukládají. Cloudflare KV rate limit klíče obsahují IP hash + bucket, automaticky expirují za 24 hodin.

## Testing

### Existing infra

Custom Jasmine-like framework přes Puppeteer. Po Phase 2 ~387 testů.

### Nové unit testy

**`tests/test-suites/error-handler-buffer.test.js`** (~5):
- `recordError` přidá záznam
- Buffer drží max 5 (FIFO rotation)
- `getRecentErrors` vrací kopii (nemutovatelné externě)
- `window.error` event triggeruje recordError
- `window.unhandledrejection` event triggeruje recordError

**`tests/test-suites/bug-report-frontend.test.js`** (~10):
- `init()` injektuje modal HTML
- `init()` idempotentní
- `open()` resetuje + zobrazí
- `close()` skryje
- `buildMetadata()` vrací správný shape
- `buildMetadata().recentErrors` obsahuje buffer
- Submit s prázdným title → inline error
- Submit s 201 → success state s issueUrl (mocked fetch)
- Submit s 429 → rate limit error
- Submit s network failure → fallback ruční link

Mocking: `window.fetch = (url, init) => Promise.resolve(new Response(...))` přepsání v testu.

### Worker testing

**Žádné automatické testy.** Worker se otestuje manuálně po deploymentu:

1. Submit ze staging preview URL → ověř issue na GitHubu má správný shape
2. Submit z disallowed origin (curl s vlastním Origin) → ověř 403
3. Submit 6× rychle za sebou → ověř 429 na 6. requestu
4. Submit s GITHUB_TOKEN dočasně neplatným → ověř 502 fallback flow

## Implementation Order

3 commit checkpoints:

### Krok 1 — Frontend modul + error buffer
- `assets/js/common/error-handler.js` rozšíření
- `assets/js/common/bug-report.js` (BugReport namespace)
- CSS pro bug-report-btn + modal styles
- i18n klíče (CZ + EN)
- Tests: error-handler-buffer.test.js, bug-report-frontend.test.js
- ✓ Checkpoint: ~395 testů, modal funguje samostatně bez Workeru

### Krok 2 — Cloudflare Worker + integrace do stránek
- `functions/api/bug-report.js`
- Update 4 stránek: bug button, meta version, script load, BugReport.init() v DOMContentLoaded
- Manuální Cloudflare setup (KV, secrets, env) — dokumentováno v komentáři Workeru
- ✓ Checkpoint: deploy do CF preview, manuální smoke test odešle issue na GitHub

### Krok 3 — PWA + docs + push
- sw.js: precache bug-report.js + bump cache verze
- PLAN.md: Phase 5 done
- CHANGELOG.md: záznam [0.2.2]
- Manuální smoke test full flow
- Push branch, ověř CI green

## Acceptance Criteria

### Funkční (frontend)

- ✅ Bug button v navbar-actions na všech 4 stránkách (cs i en)
- ✅ Klik otevře modal, formulář prázdný, metadata preview rozbalitelná
- ✅ Submit s vyplněným title + popis odešle POST na `/api/bug-report`
- ✅ Validation: prázdný title/popis → inline error, nepošle
- ✅ Success state: link na vytvořenou issue
- ✅ 429 / 500 / network mají specifické hlášky
- ✅ Network failure → fallback link na ruční GitHub issue
- ✅ Modal lze zavřít přes X, Escape, kliknutí mimo

### Funkční (backend)

- ✅ Origin check: legit pages projdou; ostatní 403
- ✅ Rate limit: 5/h/IP, 20/d/IP; 429 s Retry-After
- ✅ GitHub issue: title `[Bug] ...`, labels `bug-report` + `user-submitted` + `lang:<cs|en>`
- ✅ Issue body: Popis, Kroky, Metadata table, Recent errors block
- ✅ Worker vrací JSON `{ ok: true, issueUrl, issueNumber }`

### Funkční (error capture)

- ✅ Po loadu error-handler.js: listenery aktivní
- ✅ Buffer drží jen posledních 5 errors (FIFO)
- ✅ Modal preview ukáže buffer obsah

### Privacy

- ✅ Žádné jméno IFC/IDS souboru v reportu
- ✅ Žádný obsah souborů
- ✅ Žádné PII (žádný email/name field, IP v issue body není)

### i18n

- ✅ Všechny stringy CZ + EN
- ✅ Re-render při switch jazyka

## Rollback Plan

Každý ze 3 kroků = samostatný commit. Krok 1 (frontend bez Worker) je samostatně funkční (Submit selže s network error → fallback link funguje). Krok 2 (Worker) lze revertovat bez vlivu na frontend (frontend zachytí 404/error a ukáže fallback link).

Pokud spam přesto začne procházet po deployi: vypnout Worker (CF dashboard) → frontend automaticky degraduje na fallback ruční link, žádná chybová UI.

## Future Work (mimo Phase 5)

- **Cloudflare Turnstile** — pokud spam přesáhne current rate limits
- **Screenshot upload via R2** — pokud feedback ukáže že popis slovy nestačí
- **Inline duplicate detection** — search GitHub before submit
- **Sentry-style error grouping** — agregace stejných errors
- **Push notifikace** — vyžaduje identifikaci uživatele (mimo current scope)
