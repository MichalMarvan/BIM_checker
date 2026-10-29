/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Shared keyboard and screen-reader behavior for classic modal overlays. */
(function () {
    'use strict';

    const openDialogs = new Map();
    let lastInteraction = null;
    const focusableSelector = [
        'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    function isOpen(overlay) {
        // A detached overlay (modal closed via .remove()) is never open. Without this,
        // getComputedStyle returns empty values for it and it would read as visible,
        // leaving the keydown trap hijacking Tab/Escape page-wide.
        if (!overlay.isConnected || overlay.hidden || overlay.getAttribute('aria-hidden') === 'true') {
            return false;
        }
        const style = getComputedStyle(overlay);
        return style.display !== 'none' && style.visibility !== 'hidden';
    }

    function enhance(overlay) {
        const dialog = overlay.querySelector('.modal-container, [role="dialog"]');
        if (!dialog) {
            return;
        }
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        if (!dialog.hasAttribute('aria-label') && !dialog.hasAttribute('aria-labelledby')) {
            const heading = dialog.querySelector('h1, h2, h3, .modal-title');
            if (heading) {
                if (!heading.id) {
                    heading.id = `dialog-title-${Math.random().toString(36).slice(2, 9)}`;
                }
                dialog.setAttribute('aria-labelledby', heading.id);
            }
        }
        const close = dialog.querySelector('.modal-close');
        if (close && !close.getAttribute('aria-label')) {
            close.setAttribute('aria-label', window.i18n?.t?.('dialog.close') || 'Zavřít dialog');
        }
    }

    function sync(overlay) {
        enhance(overlay);
        const opened = isOpen(overlay);
        if (opened && !openDialogs.has(overlay)) {
            openDialogs.set(overlay, lastInteraction instanceof HTMLElement ? lastInteraction : document.activeElement);
            requestAnimationFrame(() => {
                const target = overlay.querySelector('[autofocus], input:not([type="hidden"]), select, textarea, button, [tabindex]:not([tabindex="-1"])');
                target?.focus?.();
            });
        } else if (!opened && openDialogs.has(overlay)) {
            const opener = openDialogs.get(overlay);
            openDialogs.delete(overlay);
            if (opener?.isConnected) {
                requestAnimationFrame(() => opener.focus());
            }
        }
    }

    document.addEventListener('pointerdown', event => {
        lastInteraction = event.target;
    }, true);
    document.addEventListener('keydown', event => {
        const overlays = [...openDialogs.keys()].filter(isOpen);
        const overlay = overlays.at(-1);
        if (!overlay) {
            return;
        }
        if (event.key === 'Escape') {
            const close = overlay.querySelector('.modal-close, [data-action="close"], [data-role="close"]');
            if (close) {
                event.preventDefault();
                close.click();
            }
            return;
        }
        if (event.key !== 'Tab') {
            return;
        }
        const focusable = [...overlay.querySelectorAll(focusableSelector)].filter(element => element.getClientRects().length > 0);
        if (!focusable.length) {
            event.preventDefault();
            return;
        }
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!overlay.contains(document.activeElement)) {
            // Focus escaped the modal (e.g. after a backdrop click landed on body);
            // pull it back in instead of letting Tab reach the page behind the modal.
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });

    const observe = () => {
        const observer = new MutationObserver(records => {
            const overlays = new Set();
            for (const record of records) {
                const own = record.target instanceof Element ? record.target.closest('.modal-overlay') : null;
                if (own) {
                    overlays.add(own);
                }
                for (const node of record.addedNodes) {
                    if (!(node instanceof Element)) {
                        continue;
                    }
                    if (node.matches('.modal-overlay')) {
                        overlays.add(node);
                    }
                    node.querySelectorAll?.('.modal-overlay').forEach(item => overlays.add(item));
                }
                // Modals close via .remove(); sync the detached overlay so its opener
                // regains focus and it is dropped from openDialogs (isOpen now false).
                for (const node of record.removedNodes) {
                    if (!(node instanceof Element)) {
                        continue;
                    }
                    if (node.matches('.modal-overlay') && openDialogs.has(node)) {
                        overlays.add(node);
                    }
                    node.querySelectorAll?.('.modal-overlay').forEach(item => {
                        if (openDialogs.has(item)) {
                            overlays.add(item);
                        }
                    });
                }
            }
            overlays.forEach(sync);
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'] });
        document.querySelectorAll('.modal-overlay').forEach(sync);
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observe, { once: true });
    } else {
        observe();
    }
})();
