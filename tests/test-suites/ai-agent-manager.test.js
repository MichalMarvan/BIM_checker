/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
describe('agent-manager', () => {
    let manager, storage;

    beforeEach(async () => {
        manager = await import('../../assets/js/ai/agent-manager.js');
        storage = await import('../../assets/js/ai/chat-storage.js');
        await storage._internals._delete(storage._internals.KEY_AGENTS);
    });

    it('loadAgents returns empty array initially', async () => {
        expect((await manager.loadAgents()).length).toBe(0);
    });

    it('loadFavorites returns sorted favorites', async () => {
        const a = await storage.saveAgent({ name: 'A', provider: 'google' });
        const b = await storage.saveAgent({ name: 'B', provider: 'google' });
        await storage.setFavorite(a, true, 1);
        await storage.setFavorite(b, true, 0);
        const favs = await manager.loadFavorites();
        expect(favs.length).toBe(2);
        expect(favs[0].name).toBe('B');
    });

    it('getEffectiveEndpoint returns provider default when baseUrl empty', () => {
        const agent = { provider: 'google', baseUrl: '' };
        expect(manager.getEffectiveEndpoint(agent)).toBe('https://generativelanguage.googleapis.com/v1beta/openai');
    });

    it('getEffectiveEndpoint returns baseUrl when set', () => {
        const agent = { provider: 'custom', baseUrl: 'https://my.example.com/v1' };
        expect(manager.getEffectiveEndpoint(agent)).toBe('https://my.example.com/v1');
    });

    it('getEffectiveEndpoint returns "" for null agent', () => {
        expect(manager.getEffectiveEndpoint(null)).toBe('');
    });

    it('validateUrl accepts HTTPS and local HTTP only', () => {
        expect(manager.validateUrl('http://localhost')).toBe(true);
        expect(manager.validateUrl('http://127.0.0.1:11434/v1')).toBe(true);
        expect(manager.validateUrl('https://example.com')).toBe(true);
        expect(manager.validateUrl('http://example.com')).toBe(false);
        expect(manager.validateUrl('http://localhost.example.com')).toBe(false);
        expect(manager.validateUrl('ftp://example.com')).toBe(false);
        expect(manager.validateUrl('javascript:alert(1)')).toBe(false);
        expect(manager.validateUrl('')).toBe(false);
        expect(manager.validateUrl(null)).toBe(false);
    });

    it('isLocalEndpoint only trusts loopback hostnames and addresses', () => {
        expect(manager.isLocalEndpoint('http://localhost:11434/v1')).toBe(true);
        expect(manager.isLocalEndpoint('http://127.0.0.2/v1')).toBe(true);
        expect(manager.isLocalEndpoint('https://localhost.example.com/v1')).toBe(false);
        expect(manager.isLocalEndpoint('https://api.example.com/v1')).toBe(false);
    });
});
