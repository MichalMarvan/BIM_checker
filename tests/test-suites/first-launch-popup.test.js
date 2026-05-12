/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('First-launch popup state machine', () => {
    const KEY = 'localFolderOnboarding';

    beforeEach(() => {
        localStorage.removeItem(KEY);
        document.querySelectorAll('.local-folder-popup').forEach(n => n.remove());
    });

    afterEach(() => {
        localStorage.removeItem(KEY);
    });

    it('shouldShow returns true when state is null and supported', () => {
        const result = window.BIMFirstLaunchPopup.shouldShow({ isSupported: true });
        expect(result).toBe(true);
    });

    it('shouldShow returns false when not supported', () => {
        const result = window.BIMFirstLaunchPopup.shouldShow({ isSupported: false });
        expect(result).toBe(false);
    });

    it('shouldShow returns false when state is "disabled"', () => {
        localStorage.setItem(KEY, JSON.stringify({ state: 'disabled' }));
        const result = window.BIMFirstLaunchPopup.shouldShow({ isSupported: true });
        expect(result).toBe(false);
    });

    it('shouldShow returns false when state is "accepted"', () => {
        localStorage.setItem(KEY, JSON.stringify({ state: 'accepted' }));
        const result = window.BIMFirstLaunchPopup.shouldShow({ isSupported: true });
        expect(result).toBe(false);
    });

    it('shouldShow respects 7-day cooldown after dismiss', () => {
        const yesterday = Date.now() - 24 * 60 * 60 * 1000;
        localStorage.setItem(KEY, JSON.stringify({ state: 'dismissed', at: yesterday, count: 1 }));
        const result = window.BIMFirstLaunchPopup.shouldShow({ isSupported: true });
        expect(result).toBe(false);
    });

    it('shouldShow returns true after 7+ days dismissed', () => {
        const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
        localStorage.setItem(KEY, JSON.stringify({ state: 'dismissed', at: eightDaysAgo, count: 1 }));
        const result = window.BIMFirstLaunchPopup.shouldShow({ isSupported: true });
        expect(result).toBe(true);
    });

    it('shouldShow returns false after 3 dismisses regardless of age', () => {
        const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
        localStorage.setItem(KEY, JSON.stringify({ state: 'dismissed', at: eightDaysAgo, count: 3 }));
        const result = window.BIMFirstLaunchPopup.shouldShow({ isSupported: true });
        expect(result).toBe(false);
    });

    it('show() creates DOM element with local-folder-popup class', () => {
        window.BIMFirstLaunchPopup.show();
        const el = document.querySelector('.local-folder-popup');
        expect(el !== null).toBe(true);
    });

    it('dismiss() updates state to dismissed with count', () => {
        window.BIMFirstLaunchPopup.dismiss();
        const raw = localStorage.getItem(KEY);
        const state = JSON.parse(raw);
        expect(state.state).toBe('dismissed');
        expect(state.count).toBe(1);
    });

    it('disable() updates state to disabled', () => {
        window.BIMFirstLaunchPopup.disable();
        const raw = localStorage.getItem(KEY);
        const state = JSON.parse(raw);
        expect(state.state).toBe('disabled');
    });

    it('markAccepted() updates state to accepted', () => {
        window.BIMFirstLaunchPopup.markAccepted();
        const raw = localStorage.getItem(KEY);
        const state = JSON.parse(raw);
        expect(state.state).toBe('accepted');
    });
});
