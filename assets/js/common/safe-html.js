/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

(function exposeSafeHtml(global) {
    'use strict';

    const REPLACEMENTS = Object.freeze({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    });

    function escapeHtml(value) {
        if (value === null || value === undefined) {
            return '';
        }
        return String(value).replace(/[&<>"']/g, character => REPLACEMENTS[character]);
    }

    // Attribute values must escape quotes as well as markup delimiters.
    // Keeping this separate makes the rendering context explicit at call sites.
    function escapeAttr(value) {
        return escapeHtml(value);
    }

    global.BIMSafeHTML = Object.freeze({ escapeHtml, escapeAttr });
})(window);
