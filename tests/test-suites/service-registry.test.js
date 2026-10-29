/* SPDX-License-Identifier: AGPL-3.0-or-later */

describe('Explicit service registry', () => {
    it('registers core domain services without removing legacy globals', () => {
        expect(BIMServices.get('storage')).toBe(BIMStorage);
        expect(BIMServices.get('ids')).toBe(IDSParser);
        expect(BIMServices.get('validation')).toBe(ValidationEngine);
        expect(BIMServices.get('viewerHandoff')).toBe(ViewerLink);
    });

    it('exposes feature capabilities independently of UI globals', () => {
        const capabilities = BIMServices.require('networkCapabilities');
        expect(typeof capabilities.indexedDB).toBe('boolean');
        expect(typeof capabilities.webWorkers).toBe('boolean');
        expect(BIMServices.describe().some(item => item.name === 'storage' && item.local)).toBe(true);
    });

    it('does not replace an existing service unless explicitly requested', () => {
        const first = { id: 1 };
        const second = { id: 2 };
        BIMServices.register('testService', first);
        BIMServices.register('testService', second);
        expect(BIMServices.get('testService')).toBe(first);
        BIMServices.register('testService', second, { replace: true });
        expect(BIMServices.get('testService')).toBe(second);
    });
});
