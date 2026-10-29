# Release checklist

- [ ] `npm ci` proběhlo z čistého checkoutu.
- [ ] `npm run check:repo`, `check:vendor`, `check:pwa` a `validate:html` prošly.
- [ ] Lint počet nepřekročil baseline.
- [ ] Unit/integration testy prošly bez neočekávaných browser chyb.
- [ ] buildingSMART IDS corpus audit prošel a report je přiložen.
- [ ] IDS XML → Excel → IDS XML je sémanticky shodný a XSD validní.
- [ ] Hlavní a Worker validační cesta dávají shodný výsledek.
- [ ] Smoke, handoff E2E, offline, accessibility, visual a performance testy prošly.
- [ ] PWA manifest byl znovu vygenerován až po poslední změně assetů.
- [ ] CSP neblokuje lokální funkce a nebyl přidán nezdokumentovaný endpoint.
- [ ] `npm audit --audit-level=high` nemá nález.
- [ ] SBOM a Third-Party Notices odpovídají lockfile/vendor assetům.
- [ ] Verze v `package.json`, CHANGELOG a release poznámkách je synchronní.
- [ ] Je ověřen export projektové zálohy a nedestruktivní obnova.
- [ ] README, support matrices, privacy a known limitations odpovídají releasu.

Tauri ani desktopový `dist` nejsou release cílem.
