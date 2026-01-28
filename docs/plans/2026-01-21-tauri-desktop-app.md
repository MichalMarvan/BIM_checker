# Tauri Desktop App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Převést BIM Checker webovou aplikaci na nativní desktopovou aplikaci pomocí Tauri s **portable ZIP distribucí** (bez nutnosti instalace) a automatickou kontrolou aktualizací.

**Architecture:** Tauri wrapper kolem existující vanilla HTML/CSS/JS aplikace. Minimální změny v existujícím kódu - pouze přidání Tauri konfigurace a update checkeru.

**Tech Stack:** Tauri 2.x, Rust (backend), existující HTML/CSS/JS (frontend)

**Distribuce:** Portable ZIP - pouze rozbalit a spustit, žádná instalace, žádná admin práva.

---

## Prerequisites

Před začátkem implementace je nutné nainstalovat:

1. **Rust toolchain**: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
2. **Tauri CLI**: `cargo install tauri-cli`
3. **System dependencies (Linux)**: `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`

---

## Task 1: Inicializace Tauri projektu

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/icons/` (adresář pro ikony)

**Step 1: Vytvořit src-tauri strukturu manuálně**

Protože `cargo tauri init` vyžaduje interaktivní vstup, vytvoříme soubory manuálně.

**Step 2: Vytvořit Cargo.toml**

Create `src-tauri/Cargo.toml`:

```toml
[package]
name = "bim-checker"
version = "0.1.2"
description = "BIM Checker - IFC Viewer, IDS Parser & Validator"
authors = ["Michal Marvan"]
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[profile.release]
panic = "abort"
codegen-units = 1
lto = true
opt-level = "s"
strip = true
```

**Step 3: Vytvořit build.rs**

Create `src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build()
}
```

**Step 4: Vytvořit main.rs**

Create `src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 5: Verify files were created**

Run: `ls -la src-tauri/`
Expected: Cargo.toml, build.rs, src/main.rs existují

---

## Task 2: Konfigurace Tauri pro portable build

**Files:**
- Create: `src-tauri/tauri.conf.json`

**Step 1: Vytvořit tauri.conf.json**

Create `src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "BIM Checker",
  "version": "0.1.2",
  "identifier": "com.bimchecker.app",
  "build": {
    "frontendDist": "..",
    "devUrl": "http://localhost:8000"
  },
  "app": {
    "withGlobalTauri": true,
    "windows": [
      {
        "title": "BIM Checker",
        "width": 1400,
        "height": 900,
        "resizable": true,
        "fullscreen": false,
        "minWidth": 800,
        "minHeight": 600
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis", "appimage", "deb"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "windows": {
      "nsis": {
        "installMode": "currentUser",
        "installerIcon": "icons/icon.ico",
        "displayLanguageSelector": true,
        "languages": ["Czech", "English"]
      }
    },
    "linux": {
      "appimage": {
        "bundleMediaFramework": true
      },
      "deb": {
        "depends": []
      }
    },
    "macOS": {
      "minimumSystemVersion": "10.13"
    }
  }
}
```

**Step 2: Verify JSON is valid**

Run: `cat src-tauri/tauri.conf.json | python3 -c "import json,sys; json.load(sys.stdin); print('Valid JSON')"`
Expected: `Valid JSON`

---

## Task 3: Generování ikon pro aplikaci

**Files:**
- Create: `src-tauri/icons/32x32.png`
- Create: `src-tauri/icons/128x128.png`
- Create: `src-tauri/icons/128x128@2x.png`
- Create: `src-tauri/icons/icon.ico`
- Create: `src-tauri/icons/icon.icns`

**Step 1: Konvertovat SVG na PNG**

Run:
```bash
cd /media/michal/SAMSUNG/work/BIM_checker
mkdir -p src-tauri/icons
# Konvertovat SVG na PNG (vyžaduje ImageMagick nebo Inkscape)
convert -background none -density 300 favicon.svg -resize 1024x1024 src-tauri/icons/app-icon.png 2>/dev/null || \
inkscape favicon.svg --export-type=png --export-filename=src-tauri/icons/app-icon.png --export-width=1024 --export-height=1024
```

**Step 2: Generate all icon sizes**

Run:
```bash
cargo tauri icon src-tauri/icons/app-icon.png
```

Expected: Vygenerované ikony ve složce `src-tauri/icons/`

**Step 3: Verify icons exist**

Run: `ls src-tauri/icons/`
Expected: 32x32.png, 128x128.png, icon.ico, icon.icns existují

---

## Task 4: Aktualizace package.json pro Tauri skripty

**Files:**
- Modify: `package.json`

**Step 1: Přidat Tauri skripty do package.json**

V `package.json` přidat do `scripts`:

```json
{
  "scripts": {
    "test": "node tests/run-tests.js",
    "test:browser": "echo 'Open tests/test-runner.html in browser'",
    "lint": "eslint assets/js/",
    "serve": "python3 -m http.server 8000",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build",
    "tauri:build:portable": "tauri build && echo 'Portable exe in src-tauri/target/release/'"
  }
}
```

**Step 2: Verify package.json is valid**

Run: `cat package.json | python3 -c "import json,sys; json.load(sys.stdin); print('Valid JSON')"`
Expected: `Valid JSON`

---

## Task 5: Vytvoření Update Checker modulu

**Files:**
- Create: `assets/js/common/update-checker.js`
- Modify: `index.html` (přidat import)
- Modify: `pages/*.html` (přidat import)

**Step 1: Vytvořit update-checker.js**

Create `assets/js/common/update-checker.js`:

```javascript
/**
 * Update Checker - kontroluje nové verze na GitHub Releases
 * Funguje v Tauri i ve webové verzi
 */

const UPDATE_CONFIG = {
    githubRepo: 'MichalMarvan/BIM_checker',
    currentVersion: '0.1.2',
    checkIntervalMs: 24 * 60 * 60 * 1000, // 24 hodin
    storageKey: 'bimchecker_last_update_check'
};

/**
 * Porovná dvě verze ve formátu semver (x.y.z)
 * @returns {boolean} true pokud remote > current
 */
function isNewerVersion(remote, current) {
    const remoteParts = remote.replace('v', '').split('.').map(Number);
    const currentParts = current.replace('v', '').split('.').map(Number);

    for (let i = 0; i < 3; i++) {
        const r = remoteParts[i] || 0;
        const c = currentParts[i] || 0;
        if (r > c) return true;
        if (r < c) return false;
    }
    return false;
}

/**
 * Zkontroluje, zda je čas na další check
 */
function shouldCheckForUpdates() {
    try {
        const lastCheck = localStorage.getItem(UPDATE_CONFIG.storageKey);
        if (!lastCheck) return true;

        const elapsed = Date.now() - parseInt(lastCheck, 10);
        return elapsed > UPDATE_CONFIG.checkIntervalMs;
    } catch {
        return true;
    }
}

/**
 * Zobrazí notifikaci o nové verzi
 */
function showUpdateNotification(version, releaseUrl, releaseNotes) {
    // Vytvoř notification element
    const notification = document.createElement('div');
    notification.className = 'update-notification';
    notification.innerHTML = `
        <div class="update-notification-content">
            <div class="update-notification-header">
                <span class="update-notification-icon">🔔</span>
                <span class="update-notification-title" data-i18n="update.newVersion">Nová verze k dispozici!</span>
                <button class="update-notification-close" aria-label="Zavřít">&times;</button>
            </div>
            <div class="update-notification-body">
                <p><strong>BIM Checker ${version}</strong></p>
                ${releaseNotes ? `<p class="update-notification-notes">${releaseNotes.slice(0, 200)}${releaseNotes.length > 200 ? '...' : ''}</p>` : ''}
            </div>
            <div class="update-notification-actions">
                <a href="${releaseUrl}" target="_blank" rel="noopener noreferrer" class="update-notification-btn primary" data-i18n="update.download">Stáhnout novou verzi</a>
                <button class="update-notification-btn secondary update-notification-later" data-i18n="update.later">Později</button>
            </div>
        </div>
    `;

    // Styly
    const style = document.createElement('style');
    style.textContent = `
        .update-notification {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 10000;
            max-width: 400px;
            background: var(--bg-secondary, #1a1a2e);
            border: 1px solid var(--accent-primary, #6366f1);
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            animation: slideInRight 0.3s ease-out;
            font-family: inherit;
        }
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        .update-notification-content {
            padding: 16px;
        }
        .update-notification-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
        }
        .update-notification-icon {
            font-size: 20px;
        }
        .update-notification-title {
            flex: 1;
            font-weight: 600;
            color: var(--text-primary, #fff);
        }
        .update-notification-close {
            background: none;
            border: none;
            color: var(--text-secondary, #888);
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            line-height: 1;
        }
        .update-notification-close:hover {
            color: var(--text-primary, #fff);
        }
        .update-notification-body {
            color: var(--text-secondary, #ccc);
            margin-bottom: 16px;
        }
        .update-notification-body p {
            margin: 0 0 8px 0;
        }
        .update-notification-notes {
            font-size: 0.9em;
            opacity: 0.8;
        }
        .update-notification-actions {
            display: flex;
            gap: 8px;
        }
        .update-notification-btn {
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            text-decoration: none;
            text-align: center;
            transition: all 0.2s;
        }
        .update-notification-btn.primary {
            background: var(--accent-primary, #6366f1);
            color: white;
            border: none;
        }
        .update-notification-btn.primary:hover {
            background: var(--accent-secondary, #818cf8);
        }
        .update-notification-btn.secondary {
            background: transparent;
            color: var(--text-secondary, #888);
            border: 1px solid var(--border-color, #333);
        }
        .update-notification-btn.secondary:hover {
            background: var(--bg-tertiary, #252540);
        }
    `;

    document.head.appendChild(style);
    document.body.appendChild(notification);

    // Event handlers
    notification.querySelector('.update-notification-close').addEventListener('click', () => {
        notification.remove();
    });

    notification.querySelector('.update-notification-later').addEventListener('click', () => {
        notification.remove();
    });
}

/**
 * Hlavní funkce pro kontrolu aktualizací
 */
export async function checkForUpdates(force = false) {
    // Kontroluj pouze pokud je čas nebo je vynuceno
    if (!force && !shouldCheckForUpdates()) {
        return null;
    }

    try {
        const response = await fetch(
            `https://api.github.com/repos/${UPDATE_CONFIG.githubRepo}/releases/latest`,
            {
                headers: {
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        if (!response.ok) {
            console.warn('Update check failed:', response.status);
            return null;
        }

        const release = await response.json();
        const latestVersion = release.tag_name.replace('v', '');

        // Ulož čas posledního checku
        try {
            localStorage.setItem(UPDATE_CONFIG.storageKey, Date.now().toString());
        } catch {
            // localStorage nemusí být dostupný
        }

        // Porovnej verze
        if (isNewerVersion(latestVersion, UPDATE_CONFIG.currentVersion)) {
            console.log(`New version available: ${latestVersion} (current: ${UPDATE_CONFIG.currentVersion})`);

            showUpdateNotification(
                latestVersion,
                release.html_url,
                release.body
            );

            return {
                version: latestVersion,
                url: release.html_url,
                notes: release.body,
                publishedAt: release.published_at
            };
        }

        console.log(`App is up to date (${UPDATE_CONFIG.currentVersion})`);
        return null;

    } catch (error) {
        console.warn('Update check failed:', error);
        return null;
    }
}

/**
 * Získá aktuální verzi aplikace
 */
export function getCurrentVersion() {
    return UPDATE_CONFIG.currentVersion;
}

/**
 * Inicializace - automaticky zkontroluje aktualizace při načtení
 */
export function initUpdateChecker() {
    // Počkej na načtení stránky
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // Malé zpoždění aby se stránka stihla načíst
            setTimeout(() => checkForUpdates(), 3000);
        });
    } else {
        setTimeout(() => checkForUpdates(), 3000);
    }
}

// Auto-init
initUpdateChecker();
```

**Step 2: Přidat import do HTML stránek**

Do každé HTML stránky (index.html, pages/*.html) přidat před `</body>`:

```html
<script type="module">
    import { initUpdateChecker } from './assets/js/common/update-checker.js';
</script>
```

---

## Task 6: Aktualizace .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: Přidat Tauri build artefakty do .gitignore**

Přidat na konec `.gitignore`:

```
# Tauri
src-tauri/target/
src-tauri/gen/
```

---

## Task 7: Test development build

**Files:**
- None (pouze testování)

**Step 1: Spustit HTTP server pro frontend**

Run (v jednom terminálu):
```bash
cd /media/michal/SAMSUNG/work/BIM_checker
python3 -m http.server 8000
```

**Step 2: Spustit Tauri dev**

Run (v druhém terminálu):
```bash
cd /media/michal/SAMSUNG/work/BIM_checker
cargo tauri dev
```

Expected: Otevře se nativní okno s BIM Checker aplikací

**Step 3: Verify functionality**

Manuálně otestovat:
- [ ] Aplikace se načte správně
- [ ] Navigace mezi stránkami funguje
- [ ] Theme toggle funguje
- [ ] Language switcher funguje
- [ ] Drag & drop souborů funguje
- [ ] IndexedDB storage funguje

---

## Task 8: Production build - Portable verze

**Files:**
- None (build output)

**Step 1: Build pro aktuální platformu**

Run:
```bash
cd /media/michal/SAMSUNG/work/BIM_checker
cargo tauri build
```

Expected: Build proběhne úspěšně

**Step 2: Najít portable .exe**

Pro Windows:
```bash
ls -la src-tauri/target/release/bim-checker.exe
```

Pro Linux:
```bash
ls -la src-tauri/target/release/bim-checker
```

**Step 3: Vytvořit portable ZIP**

```bash
# Linux
cd src-tauri/target/release
mkdir -p BIM-Checker-Portable
cp bim-checker BIM-Checker-Portable/
echo "BIM Checker - Portable verze\n\nPožadavky:\n- Linux s WebKitGTK\n\nSpuštění: ./bim-checker" > BIM-Checker-Portable/README.txt
zip -r BIM-Checker-Portable-linux.zip BIM-Checker-Portable/

# Windows (cross-compile nebo na Windows)
# cd src-tauri/target/release
# mkdir BIM-Checker-Portable
# copy bim-checker.exe BIM-Checker-Portable\
# Zabalit do ZIP
```

**Step 4: Verify portable works**

Rozbalit ZIP na jiném místě a spustit aplikaci bez instalace.

---

## Task 9 (Optional): Cross-compile pro Windows

Pro vytvoření Windows .exe z Linuxu:

**Step 1: Přidat Windows target**

```bash
rustup target add x86_64-pc-windows-gnu
sudo apt install mingw-w64
```

**Step 2: Build pro Windows**

```bash
cargo tauri build --target x86_64-pc-windows-gnu
```

---

## Summary

Po dokončení všech tasků budete mít:

1. **Portable desktop aplikaci** - pouze rozbalit a spustit
2. **Bez nutnosti instalace** - žádná admin práva, žádný zápis do registrů
3. **Automatická kontrola aktualizací** - notifikace o nové verzi s odkazem ke stažení
4. **Cross-platform support** - Windows (.exe), Linux (binary), macOS (binary)
5. **Zachovanou web verzi** - původní web aplikace stále funguje

### Distribuce

| Typ | Soubor | Velikost | Admin práva |
|-----|--------|----------|-------------|
| **Portable ZIP** | BIM-Checker-Portable.zip | ~6-10 MB | Ne |
| NSIS Installer | BIM-Checker-Setup.exe | ~8-12 MB | Ne (per-user) |
| Linux AppImage | BIM-Checker.AppImage | ~15-20 MB | Ne |

### Požadavky pro uživatele

| Platforma | Požadavek |
|-----------|-----------|
| Windows 10/11 | WebView2 (předinstalovaný) |
| Linux | WebKitGTK 4.1 |
| macOS | macOS 10.13+ |
