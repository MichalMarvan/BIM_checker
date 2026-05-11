/* SPDX-License-Identifier: AGPL-3.0-or-later */
describe('tools/_helpers', () => {
    let helpers;

    beforeEach(async () => {
        helpers = await import('../../assets/js/ai/tools/_helpers.js');
        helpers._setCurrentPageForTest(null);
        helpers._clearIfcCacheForTest();
    });

    it('getCurrentPageId returns "home" when override set to home', () => {
        helpers._setCurrentPageForTest('home');
        expect(helpers.getCurrentPageId()).toBe('home');
    });

    it('getCurrentPageId returns "validator" when override set to validator', () => {
        helpers._setCurrentPageForTest('validator');
        expect(helpers.getCurrentPageId()).toBe('validator');
    });

    it('validateArgs throws on missing required arg', () => {
        let threw = false;
        try { helpers.validateArgs({}, { type: { required: true } }); } catch { threw = true; }
        expect(threw).toBe(true);
    });

    it('validateArgs throws on invalid enum value', () => {
        let threw = false;
        try {
            helpers.validateArgs({ type: 'pdf' }, { type: { required: true, enum: ['ifc', 'ids'] } });
        } catch { threw = true; }
        expect(threw).toBe(true);
    });

    it('validateArgs accepts valid args', () => {
        let threw = false;
        try {
            helpers.validateArgs({ type: 'ifc' }, { type: { required: true, enum: ['ifc', 'ids'] } });
        } catch { threw = true; }
        expect(threw).toBe(false);
    });

    it('validateArgs throws when args object is missing', () => {
        let threw = false;
        try { helpers.validateArgs(null, { type: { required: true } }); } catch { threw = true; }
        expect(threw).toBe(true);
    });
});
