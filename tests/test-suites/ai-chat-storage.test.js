describe('chat-storage agents', () => {
    let storage;

    beforeEach(async () => {
        storage = await import('../../assets/js/ai/chat-storage.js');
        // Wipe all AI keys before each test
        await storage._internals._delete(storage._internals.KEY_AGENTS);
        await storage._internals._delete(storage._internals.KEY_SETTINGS);
        await storage._internals._delete(storage._internals.KEY_THREADS);
    });

    it('listAgents() returns [] when nothing saved', async () => {
        const agents = await storage.listAgents();
        expect(Array.isArray(agents)).toBe(true);
        expect(agents.length).toBe(0);
    });

    it('saveAgent creates new agent with generated id', async () => {
        const id = await storage.saveAgent({ name: 'Test', provider: 'google' });
        expect(typeof id).toBe('string');
        expect(id.length > 0).toBe(true);
        const agents = await storage.listAgents();
        expect(agents.length).toBe(1);
        expect(agents[0].name).toBe('Test');
        expect(agents[0].provider).toBe('google');
    });

    it('saveAgent applies defaults: temperature, isFavorite, icon, systemPrompt', async () => {
        const id = await storage.saveAgent({ name: 'D', provider: 'openai' });
        const agent = await storage.getAgent(id);
        expect(agent.temperature).toBe(0.7);
        expect(agent.isFavorite).toBe(true);
        expect(agent.icon).toBe('🤖');
        expect(agent.systemPrompt).toBe('');
    });

    it('saveAgent with id updates existing agent (preserves createdAt)', async () => {
        const id = await storage.saveAgent({ name: 'Orig', provider: 'google' });
        const created = (await storage.getAgent(id)).createdAt;
        await new Promise(r => setTimeout(r, 5));
        await storage.saveAgent({ id, name: 'Updated', provider: 'google' });
        const after = await storage.getAgent(id);
        expect(after.name).toBe('Updated');
        expect(after.createdAt).toBe(created);
        expect(after.updatedAt > created).toBe(true);
    });

    it('saveAgent throws on empty name', async () => {
        let threw = false;
        try { await storage.saveAgent({ name: '   ', provider: 'google' }); } catch { threw = true; }
        expect(threw).toBe(true);
    });

    it('getAgent returns null for unknown id', async () => {
        expect(await storage.getAgent('nope')).toBe(null);
    });

    it('deleteAgent removes; list no longer contains', async () => {
        const id = await storage.saveAgent({ name: 'A', provider: 'google' });
        await storage.saveAgent({ name: 'B', provider: 'google' });
        const ok = await storage.deleteAgent(id);
        expect(ok).toBe(true);
        const list = await storage.listAgents();
        expect(list.length).toBe(1);
        expect(list[0].name).toBe('B');
    });

    it('deleteAgent returns false for unknown id', async () => {
        expect(await storage.deleteAgent('nope')).toBe(false);
    });

    it('setFavorite toggles isFavorite + favoriteOrder', async () => {
        const id = await storage.saveAgent({ name: 'F', provider: 'google' });
        await storage.setFavorite(id, false, 0);
        let agent = await storage.getAgent(id);
        expect(agent.isFavorite).toBe(false);
        await storage.setFavorite(id, true, 5);
        agent = await storage.getAgent(id);
        expect(agent.isFavorite).toBe(true);
        expect(agent.favoriteOrder).toBe(5);
    });

    it('listFavorites returns only favorites sorted by favoriteOrder', async () => {
        const a = await storage.saveAgent({ name: 'A', provider: 'google' });
        const b = await storage.saveAgent({ name: 'B', provider: 'google' });
        const c = await storage.saveAgent({ name: 'C', provider: 'google' });
        await storage.setFavorite(a, true, 2);
        await storage.setFavorite(b, false, 0);
        await storage.setFavorite(c, true, 1);
        const favs = await storage.listFavorites();
        expect(favs.length).toBe(2);
        expect(favs[0].name).toBe('C');
        expect(favs[1].name).toBe('A');
    });
});
