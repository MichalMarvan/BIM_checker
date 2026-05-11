/* SPDX-License-Identifier: AGPL-3.0-or-later */
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

describe('chat-storage settings', () => {
    let storage;
    beforeEach(async () => {
        storage = await import('../../assets/js/ai/chat-storage.js');
        await storage._internals._delete(storage._internals.KEY_SETTINGS);
    });

    it('getSettings returns defaults when empty', async () => {
        const s = await storage.getSettings();
        expect(s.lastActiveAgentId).toBe(null);
        expect(s.chatPanelOpen).toBe(false);
        expect(s.threadsSidebarOpen).toBe(true);
    });

    it('updateSettings merges partial updates', async () => {
        await storage.updateSettings({ chatPanelOpen: true });
        const s1 = await storage.getSettings();
        expect(s1.chatPanelOpen).toBe(true);
        expect(s1.threadsSidebarOpen).toBe(true);
        await storage.updateSettings({ threadsSidebarOpen: false });
        const s2 = await storage.getSettings();
        expect(s2.chatPanelOpen).toBe(true);
        expect(s2.threadsSidebarOpen).toBe(false);
    });
});

describe('chat-storage threads', () => {
    let storage;
    beforeEach(async () => {
        storage = await import('../../assets/js/ai/chat-storage.js');
        await storage._internals._delete(storage._internals.KEY_AGENTS);
        await storage._internals._delete(storage._internals.KEY_THREADS);
    });

    it('createThread creates thread + first user message', async () => {
        const agentId = await storage.saveAgent({ name: 'A', provider: 'google' });
        const tid = await storage.createThread(agentId, 'Hello world');
        expect(typeof tid).toBe('string');
        const thread = await storage.getThread(tid);
        expect(thread.agentId).toBe(agentId);
        expect(thread.title).toBe('Hello world');
        expect(thread.messageCount).toBe(1);
        const msgs = await storage.listMessages(tid);
        expect(msgs.length).toBe(1);
        expect(msgs[0].role).toBe('user');
        expect(msgs[0].content).toBe('Hello world');
    });

    it('createThread truncates long titles to 60 chars', async () => {
        const agentId = await storage.saveAgent({ name: 'A', provider: 'google' });
        const longMsg = 'x'.repeat(200);
        const tid = await storage.createThread(agentId, longMsg);
        const thread = await storage.getThread(tid);
        expect(thread.title.length <= 60).toBe(true);
    });

    it('listThreads filters by agentId, sorted by updatedAt desc', async () => {
        const a1 = await storage.saveAgent({ name: 'A1', provider: 'google' });
        const a2 = await storage.saveAgent({ name: 'A2', provider: 'google' });
        const t1 = await storage.createThread(a1, 'msg1');
        await new Promise(r => setTimeout(r, 5));
        const t2 = await storage.createThread(a2, 'msg2');
        await new Promise(r => setTimeout(r, 5));
        const t3 = await storage.createThread(a1, 'msg3');
        const a1Threads = await storage.listThreads(a1);
        expect(a1Threads.length).toBe(2);
        expect(a1Threads[0].id).toBe(t3);
        expect(a1Threads[1].id).toBe(t1);
    });

    it('appendMessage updates thread.updatedAt + messageCount', async () => {
        const agentId = await storage.saveAgent({ name: 'A', provider: 'google' });
        const tid = await storage.createThread(agentId, 'first');
        const before = (await storage.getThread(tid)).updatedAt;
        await new Promise(r => setTimeout(r, 5));
        await storage.appendMessage(tid, { role: 'assistant', content: 'hi' });
        const after = await storage.getThread(tid);
        expect(after.updatedAt > before).toBe(true);
        expect(after.messageCount).toBe(2);
        const msgs = await storage.listMessages(tid);
        expect(msgs.length).toBe(2);
        expect(msgs[1].role).toBe('assistant');
    });

    it('deleteThread removes thread metadata + messages', async () => {
        const agentId = await storage.saveAgent({ name: 'A', provider: 'google' });
        const tid = await storage.createThread(agentId, 'msg');
        await storage.appendMessage(tid, { role: 'assistant', content: 'reply' });
        const ok = await storage.deleteThread(tid);
        expect(ok).toBe(true);
        expect(await storage.getThread(tid)).toBe(null);
        const msgs = await storage.listMessages(tid);
        expect(msgs.length).toBe(0);
    });

    it('deleteAgent cascades to delete threads + messages', async () => {
        const agentId = await storage.saveAgent({ name: 'A', provider: 'google' });
        const tid = await storage.createThread(agentId, 'msg');
        await storage.appendMessage(tid, { role: 'assistant', content: 'reply' });
        await storage.deleteAgent(agentId);
        expect(await storage.getThread(tid)).toBe(null);
        expect((await storage.listMessages(tid)).length).toBe(0);
    });
});
