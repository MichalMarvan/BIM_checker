# Security threat model

## Scope and assets

BIM Checker is a browser/PWA application handling user-selected IFC/IDS files, browser storage, optional local folders, exports, 3D cache, AI credentials, prompts, and validation results. Tauri is explicitly out of scope. The main assets are model confidentiality and integrity, IDS rules, API keys, saved projects, and trustworthy validation output.

## Trust boundaries

- IFC, IDS, Excel, CSV, GeoTIFF, LandXML, BCF/ZIP content and filenames are untrusted input.
- IndexedDB and local-folder content may have been changed by another application or an older BIM Checker release.
- bSDD, basemap, EPSG, GitHub, Hugging Face, and configured AI responses cross a network boundary.
- AI output and tool-call arguments are untrusted even when returned by a configured provider.
- Cloudflare Functions are a separate server-side boundary and must validate origin, method, size, and destination.

## Principal threats and controls

| Threat | Existing control | Required regression check |
|---|---|---|
| Stored/reflected XSS through model names, properties, IDS text, bSDD or errors | context-specific escaping, `textContent`, CSP, no remote runtime JS | hostile-value browser tests and CSP smoke |
| Spreadsheet formula injection | shared CSV/Excel cell neutralization | formula payload golden tests |
| Malicious or oversized files causing resource exhaustion | size checks, workers, bounded parsers/caches | malformed and performance corpus |
| API-key disclosure | keys only in per-session `sessionStorage`, excluded from agent exports/tools | raw IndexedDB migration test |
| Unintended BIM disclosure to remote AI | per-session confirmation; remote tools disabled by default | consent and tool-policy tests |
| Unsafe custom AI transport | HTTPS required except loopback HTTP | endpoint URL tests and CSP `connect-src` |
| Local-folder overwrite or stale write | explicit user grant, mtime conflict detection, copy-first save | conflict and permission tests |
| Supply-chain/runtime CDN compromise | pinned npm lock, reproducible local lazy bundles, SBOM, audit | vendor reproducibility and no-remote-import checks |
| Stale service worker mixing release files | content-versioned atomic precache, coherent cache-first shell, user-controlled update | generated-manifest, first-claim and offline tests |
| Incorrect IDS/IFC result | XSD validation, corpus tests, sync/worker parity, version metadata | release conformance report |

## Security rules for changes

1. Never interpolate untrusted data into HTML without selecting the correct text or attribute context. Prefer DOM APIs and `textContent`.
2. Never persist secrets in IndexedDB, localStorage, exports, logs, or tool results.
3. New remote communication must be documented in `PRIVACY.md`, restricted by CSP, and visible to the user when it can disclose project data.
4. New dependencies must be pinned, audited, listed in `THIRD_PARTY_NOTICES.md`, represented in the SBOM, and bundled locally when they execute code.
5. Import parsers must define size/recursion limits and return structured warnings instead of silently discarding content.
6. Destructive storage actions require an exact target and a recoverable/default-safe path where practical.

## Residual risks

The current CSP still permits inline scripts/styles because legacy pages contain inline bootstraps and event attributes. Removing `'unsafe-inline'` requires migrating them to external listeners or adopting nonces/hashes. Large-file browser exhaustion and the correctness of third-party AI/providers cannot be eliminated; both require explicit limits, clear UI, and continued corpus testing.
