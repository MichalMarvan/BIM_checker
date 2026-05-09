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

    it('validateUrl accepts http and https only', () => {
        expect(manager.validateUrl('http://localhost')).toBe(true);
        expect(manager.validateUrl('https://example.com')).toBe(true);
        expect(manager.validateUrl('ftp://example.com')).toBe(false);
        expect(manager.validateUrl('javascript:alert(1)')).toBe(false);
        expect(manager.validateUrl('')).toBe(false);
        expect(manager.validateUrl(null)).toBe(false);
    });
});
