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
 * @param {string} remote - vzdálená verze
 * @param {string} current - aktuální verze
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
 * @returns {boolean}
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
 * @param {string} version - nová verze
 * @param {string} releaseUrl - URL na GitHub release
 * @param {string} releaseNotes - poznámky k vydání
 */
function showUpdateNotification(version, releaseUrl, releaseNotes) {
    // Pokud už existuje notifikace, nepokazuj další
    if (document.querySelector('.update-notification')) {
        return;
    }

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

    // Styly - přidáme jen pokud ještě neexistují
    if (!document.querySelector('#update-notification-styles')) {
        const style = document.createElement('style');
        style.id = 'update-notification-styles';
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
    }

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
 * @param {boolean} force - vynutit kontrolu bez ohledu na interval
 * @returns {Promise<object|null>} info o nové verzi nebo null
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
 * @returns {string}
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

// Auto-init při importu
initUpdateChecker();
