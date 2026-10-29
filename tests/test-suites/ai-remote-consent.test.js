/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('ai/remote-consent', () => {
    let consent;

    beforeEach(async () => {
        consent = await import('../../assets/js/ai/remote-consent.js');
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith(consent.REMOTE_CONSENT_PREFIX)) sessionStorage.removeItem(key);
        }
    });

    it('does not prompt for a local endpoint', () => {
        let prompts = 0;
        const allowed = consent.ensureRemoteConsent('http://localhost:11434/v1', () => { prompts++; return false; }, 'x');
        expect(allowed).toBe(true);
        expect(prompts).toBe(0);
    });

    it('blocks a remote endpoint when the user declines', () => {
        const allowed = consent.ensureRemoteConsent('https://api.example.com/v1', () => false, 'x');
        expect(allowed).toBe(false);
        expect(consent.hasRemoteConsent('https://api.example.com/v1')).toBe(false);
    });

    it('remembers accepted consent for the provider origin during the session', () => {
        let prompts = 0;
        const ask = () => { prompts++; return true; };
        expect(consent.ensureRemoteConsent('https://api.example.com/v1', ask, 'x')).toBe(true);
        expect(consent.ensureRemoteConsent('https://api.example.com/other', ask, 'x')).toBe(true);
        expect(prompts).toBe(1);
    });
});
