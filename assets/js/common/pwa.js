/* SPDX-License-Identifier: AGPL-3.0-or-later */
// PWA Install & Service Worker Registration
(function() {
    'use strict';

    let deferredPrompt = null;
    const installBtn = document.getElementById('pwaInstallBtn');

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        // Determine SW path based on page location
        const swPath = location.pathname.includes('/pages/') ? '../sw.js' : './sw.js';
        navigator.serviceWorker.register(swPath).catch(function(err) {
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
            if (!deferredPrompt) return;
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
        prompt: async () => {
            if (!deferredPrompt) return { available: false };
            deferredPrompt.prompt();
            const result = await deferredPrompt.userChoice;
            const accepted = result.outcome === 'accepted';
            if (accepted && installBtn) installBtn.classList.add(UNAVAILABLE_CLASS);
            deferredPrompt = null;
            return { available: true, accepted };
        }
    };
})();
