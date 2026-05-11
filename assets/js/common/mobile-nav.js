/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

/**
 * Mobile navigation — assigns .is-active class to the bottom tab matching
 * the current page (read from document.body.dataset.page).
 */
(function () {
    'use strict';

    function highlightActiveTab() {
        const page = document.body && document.body.dataset && document.body.dataset.page;
        if (!page) return;
        const tabs = document.querySelectorAll('.bim-mobile-tabs__tab');
        tabs.forEach(function (tab) {
            if (tab.dataset.tab === page) {
                tab.classList.add('is-active');
            } else {
                tab.classList.remove('is-active');
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', highlightActiveTab);
    } else {
        highlightActiveTab();
    }

    window.__bimMobileNav = { highlightActiveTab: highlightActiveTab };
})();
