/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
// PWA Install & Service Worker Registration
(function() {
    'use strict';

    let deferredPrompt = null;
    let registration = null;
    let reloading = false;
    let activationRequested = false;
    const installBtn = document.getElementById('pwaInstallBtn');

    function t(key, fallback) {
        return window.i18n?.t?.(key) || fallback;
    }

    function showUpdateAvailable(worker) {
        if (!worker || document.querySelector('.pwa-update-notification')) {
            return;
        }
        const notification = document.createElement('section');
        notification.className = 'pwa-update-notification';
        notification.setAttribute('role', 'status');
        notification.setAttribute('aria-live', 'polite');
        notification.innerHTML = `
            <strong>${t('pwa.update.title', 'Je dostupná aktualizace')}</strong>
            <span>${t('pwa.update.body', 'Načtěte novou verzi, až budete připraveni.')}</span>
            <div class="pwa-update-notification__actions">
                <button type="button" class="btn btn-primary" data-action="apply">${t('pwa.update.apply', 'Aktualizovat')}</button>
                <button type="button" class="btn btn-secondary" data-action="later">${t('pwa.update.later', 'Později')}</button>
            </div>`;
        notification.querySelector('[data-action="apply"]').addEventListener('click', event => {
            event.currentTarget.disabled = true;
            activationRequested = true;
            worker.postMessage({ type: 'SKIP_WAITING' });
        });
        notification.querySelector('[data-action="later"]').addEventListener('click', () => notification.remove());
        document.body.appendChild(notification);
        window.dispatchEvent(new CustomEvent('bim:pwa-update-available', { detail: { registration } }));
    }

    function watchRegistration(current) {
        registration = current;
        if (current.waiting && navigator.serviceWorker.controller) {
            showUpdateAvailable(current.waiting);
        }
        current.addEventListener('updatefound', () => {
            const installing = current.installing;
            installing?.addEventListener('statechange', () => {
                if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                    showUpdateAvailable(installing);
                }
            });
        });
    }

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        // Determine SW path based on page location
        const swPath = location.pathname.includes('/pages/') ? '../sw.js' : './sw.js';
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            // The first installed worker claims uncontrolled pages too. That
            // is not an update and must not reload/interrupt uploads, parsing
            // or a one-shot cross-page handoff.
            if (!activationRequested) {
                return;
            }
            if (reloading) {
                return;
            }
            reloading = true;
            location.reload();
        });
        navigator.serviceWorker.register(swPath).then(watchRegistration).catch(function(err) {
            console.warn('SW registration failed:', err);
        });
    }

    const UNAVAILABLE_CLASS = 'pwa-install-btn--unavailable';

    // Listen for install prompt
    window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        deferredPrompt = e;
        if (installBtn) {
            installBtn.classList.remove(UNAVAILABLE_CLASS);
        }
    });

    // Handle install button click
    if (installBtn) {
        installBtn.addEventListener('click', function() {
            if (!deferredPrompt) {
                return;
            }
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(function(result) {
                if (result.outcome === 'accepted') {
                    installBtn.classList.add(UNAVAILABLE_CLASS);
                }
                deferredPrompt = null;
            });
        });
    }

    // Hide button if already installed
    window.addEventListener('appinstalled', function() {
        if (installBtn) {
            installBtn.classList.add(UNAVAILABLE_CLASS);
        }
        deferredPrompt = null;
    });

    // Phase 9a: programmatic API for AI install_pwa tool
    window.PWA = {
        canInstall: () => !!deferredPrompt,
        getRegistration: () => registration,
        applyUpdate: () => {
            const worker = registration?.waiting;
            if (!worker) {
                return false;
            }
            activationRequested = true;
            worker.postMessage({ type: 'SKIP_WAITING' });
            return true;
        },
        prompt: async () => {
            if (!deferredPrompt) {
                return { available: false };
            }
            deferredPrompt.prompt();
            const result = await deferredPrompt.userChoice;
            const accepted = result.outcome === 'accepted';
            if (accepted && installBtn) {
                installBtn.classList.add(UNAVAILABLE_CLASS);
            }
            deferredPrompt = null;
            return { available: true, accepted };
        }
    };
})();
