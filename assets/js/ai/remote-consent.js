/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

import { isLocalEndpoint } from './agent-manager.js';

export const REMOTE_CONSENT_PREFIX = 'bim_checker_ai_remote_consent:';

function _consentKey(endpoint) {
    try {
        return REMOTE_CONSENT_PREFIX + new URL(endpoint).origin;
    } catch {
        // Unparseable endpoints must not share one consent key — keep the raw
        // string so consenting to one malformed endpoint never covers another.
        return REMOTE_CONSENT_PREFIX + 'invalid:' + String(endpoint);
    }
}

export function hasRemoteConsent(endpoint) {
    if (isLocalEndpoint(endpoint)) {
        return true;
    }
    try {
        return sessionStorage.getItem(_consentKey(endpoint)) === 'yes';
    } catch {
        return false;
    }
}

export function rememberRemoteConsent(endpoint) {
    try {
        sessionStorage.setItem(_consentKey(endpoint), 'yes');
    } catch {
        // Consent still applies to this one request when sessionStorage is unavailable.
    }
}

export function ensureRemoteConsent(endpoint, confirmFn, message) {
    if (hasRemoteConsent(endpoint)) {
        return true;
    }
    if (typeof confirmFn !== 'function' || !confirmFn(message)) {
        return false;
    }
    rememberRemoteConsent(endpoint);
    return true;
}
