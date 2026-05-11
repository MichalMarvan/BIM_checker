/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

/**
 * Mobile chat panel: tap the drag-handle area (top 24px of header) to cycle
 * three height states: default (60vh) → expanded → collapsed → default.
 * Only active < 1024px. Desktop: this script is inert.
 */
(function () {
    'use strict';

    const STATES = ['default', 'expanded', 'collapsed'];
    const CLASS = {
        default: '',
        expanded: 'is-sheet-expanded',
        collapsed: 'is-sheet-collapsed'
    };

    function isMobile() {
        return window.matchMedia('(max-width: 1023px)').matches;
    }

    function findPanel() {
        return document.querySelector('.chat-panel');
    }

    function findHeader(panel) {
        return panel ? panel.querySelector('.chat-panel__header') : null;
    }

    function currentState(panel) {
        if (panel.classList.contains('is-sheet-expanded')) return 'expanded';
        if (panel.classList.contains('is-sheet-collapsed')) return 'collapsed';
        return 'default';
    }

    function setState(panel, state) {
        panel.classList.remove(CLASS.expanded, CLASS.collapsed);
        if (CLASS[state]) panel.classList.add(CLASS[state]);
    }

    function nextState(state) {
        const i = STATES.indexOf(state);
        return STATES[(i + 1) % STATES.length];
    }

    function onHeaderClick(e) {
        if (!isMobile()) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const yInHeader = e.clientY - rect.top;
        if (yInHeader > 24) return;
        const tag = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : '';
        if (tag === 'BUTTON' || (e.target.closest && e.target.closest('button'))) return;

        const panel = findPanel();
        if (!panel) return;
        setState(panel, nextState(currentState(panel)));
    }

    function init() {
        const panel = findPanel();
        const header = findHeader(panel);
        if (!header || header.dataset.mobileHandleBound === '1') return;
        header.dataset.mobileHandleBound = '1';
        header.addEventListener('click', onHeaderClick);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    document.addEventListener('ai:chatPanelMounted', init);

    window.__bimChatPanelMobile = { isMobile, nextState, currentState };
})();
