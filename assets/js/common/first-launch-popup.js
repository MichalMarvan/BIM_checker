/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

/**
 * First-launch popup for Local Folder feature.
 * Shows once on first visit to Chromium users; respects dismiss/accept/disable state.
 */

(function () {
    const KEY = 'localFolderOnboarding';
    const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
    const MAX_DISMISS = 3;

    function getState() {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
    }

    function setState(state) {
        localStorage.setItem(KEY, JSON.stringify(state));
    }

    function shouldShow({ isSupported }) {
        if (!isSupported) return false;
        const s = getState();
        if (!s) return true;
        if (s.state === 'disabled' || s.state === 'accepted') return false;
        if (s.state === 'dismissed') {
            if ((s.count || 0) >= MAX_DISMISS) return false;
            if (Date.now() - (s.at || 0) < COOLDOWN_MS) return false;
            return true;
        }
        return false;
    }

    function dismiss() {
        const cur = getState() || { count: 0 };
        setState({ state: 'dismissed', at: Date.now(), count: (cur.count || 0) + 1 });
        remove();
    }

    function disable() {
        setState({ state: 'disabled', at: Date.now() });
        remove();
    }

    function markAccepted() {
        setState({ state: 'accepted', at: Date.now() });
        remove();
    }

    function remove() {
        document.querySelectorAll('.local-folder-popup').forEach(el => el.remove());
    }

    function show() {
        if (document.querySelector('.local-folder-popup')) return;
        const t = (key) => (window.i18n && window.i18n.t) ? window.i18n.t(key) : key;

        const wrap = document.createElement('div');
        wrap.className = 'local-folder-popup';
        wrap.innerHTML = `
            <div class="local-folder-popup__backdrop"></div>
            <div class="local-folder-popup__dialog" role="dialog" aria-labelledby="lfp-title">
                <div class="local-folder-popup__icon">🖥️</div>
                <h2 class="local-folder-popup__title" id="lfp-title" data-i18n="storage.popup.title">New feature: local folder</h2>
                <p class="local-folder-popup__body" data-i18n="storage.popup.body">Your browser supports connecting to a local folder. You can link BIM_checker to a folder on your PC (e.g., a CDE-sync folder) and browse IFC/IDS files directly from disk without uploading.</p>
                <p class="local-folder-popup__note" data-i18n="storage.popup.note">v1 = read-only (write support coming later)</p>
                <div class="local-folder-popup__actions">
                    <button class="btn btn-primary local-folder-popup__try" data-i18n="storage.popup.try">Try now</button>
                    <button class="btn btn-secondary local-folder-popup__later" data-i18n="storage.popup.later">Maybe later</button>
                </div>
                <button class="local-folder-popup__disable" data-i18n="storage.popup.never">Don't show again</button>
            </div>
        `;
        document.body.appendChild(wrap);

        if (window.i18n && window.i18n.updatePage) window.i18n.updatePage();

        wrap.querySelector('.local-folder-popup__try').addEventListener('click', async () => {
            try {
                if (!window.LocalFolderStorageBackend) throw new Error('not loaded');
                const lf = new window.LocalFolderStorageBackend();
                await lf.connect();
                await lf.scan();
                window.BIMStorage.setBackend(lf);
                localStorage.setItem('activeBackend', 'localFolder');
                markAccepted();
            } catch (e) {
                if (e && e.name !== 'AbortError') {
                    console.warn('Folder connect failed:', e);
                }
                dismiss();
            }
        });
        wrap.querySelector('.local-folder-popup__later').addEventListener('click', dismiss);
        wrap.querySelector('.local-folder-popup__disable').addEventListener('click', disable);
        wrap.querySelector('.local-folder-popup__backdrop').addEventListener('click', dismiss);
    }

    function init() {
        const isSupported = !!(window.LocalFolderStorageBackend && window.LocalFolderStorageBackend.isSupported());
        if (shouldShow({ isSupported })) show();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 800));
    } else {
        setTimeout(init, 800);
    }

    window.BIMFirstLaunchPopup = { shouldShow, show, dismiss, disable, markAccepted, getState };
})();
