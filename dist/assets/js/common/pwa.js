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

    // Listen for install prompt
    window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        deferredPrompt = e;
        if (installBtn) {
            installBtn.style.display = '';
        }
    });

    // Handle install button click
    if (installBtn) {
        installBtn.addEventListener('click', function() {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(function(result) {
                if (result.outcome === 'accepted') {
                    installBtn.style.display = 'none';
                }
                deferredPrompt = null;
            });
        });
    }

    // Hide button if already installed
    window.addEventListener('appinstalled', function() {
        if (installBtn) {
            installBtn.style.display = 'none';
        }
        deferredPrompt = null;
    });
})();
