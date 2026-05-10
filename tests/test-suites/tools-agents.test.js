describe('tool-agents (read)', () => {
    let agentTools;
    let chatStorage;

    beforeEach(async () => {
        agentTools = await import('../../assets/js/ai/tools/tool-agents.js');
        chatStorage = await import('../../assets/js/ai/chat-storage.js');
    });

    afterEach(() => {
        delete window.__bimAiActiveAgentId;
    });

    it('list_agents returns array without apiKey field', async () => {
        const id = await chatStorage.saveAgent({ name: 'Test', provider: 'openai', model: 'gpt-4', apiKey: 'sk-secret' });
        try {
            const list = await agentTools.list_agents({});
            const me = list.find(a => a.id === id);
            expect(!!me).toBe(true);
            expect(me.name).toBe('Test');
            expect('apiKey' in me).toBe(false);
        } finally {
            await chatStorage.deleteAgent(id);
        }
    });

    it('get_active_agent returns no_active_agent when global is unset', async () => {
        delete window.__bimAiActiveAgentId;
        const r = await agentTools.get_active_agent({});
        expect(r.error).toBe('no_active_agent');
    });

    it('get_active_agent returns the agent when global is set', async () => {
        const id = await chatStorage.saveAgent({ name: 'Active', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        window.__bimAiActiveAgentId = id;
        try {
            const r = await agentTools.get_active_agent({});
            expect(r.id).toBe(id);
            expect(r.name).toBe('Active');
            expect('apiKey' in r).toBe(false);
        } finally {
            await chatStorage.deleteAgent(id);
        }
    });

    it('get_active_agent returns not_found when id has no record', async () => {
        window.__bimAiActiveAgentId = 'agent_nope';
        const r = await agentTools.get_active_agent({});
        expect(r.error).toBe('not_found');
    });

    it('create_agent stores a new agent and returns id', async () => {
        const r = await agentTools.create_agent({ name: 'New', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        try {
            expect(r.created).toBe(true);
            expect(typeof r.id).toBe('string');
            const stored = await chatStorage.getAgent(r.id);
            expect(stored.name).toBe('New');
        } finally {
            await chatStorage.deleteAgent(r.id);
        }
    });

    it('create_agent rejects empty name', async () => {
        let threw = false;
        try { await agentTools.create_agent({ name: '   ', provider: 'openai', model: 'gpt-4', apiKey: 'k' }); }
        catch (e) { threw = true; }
        expect(threw).toBe(true);
    });

    it('update_agent patches fields on non-active agent', async () => {
        const id = await chatStorage.saveAgent({ name: 'Old', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        try {
            const r = await agentTools.update_agent({ id, name: 'NewName', temperature: 0.2 });
            expect(r.updated).toBe(true);
            const stored = await chatStorage.getAgent(id);
            expect(stored.name).toBe('NewName');
            expect(stored.temperature).toBe(0.2);
        } finally {
            await chatStorage.deleteAgent(id);
        }
    });

    it('update_agent refuses when target is the active agent', async () => {
        const id = await chatStorage.saveAgent({ name: 'A', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        window.__bimAiActiveAgentId = id;
        try {
            const r = await agentTools.update_agent({ id, name: 'tryRename' });
            expect(r.error).toBe('cannot_modify_active');
            const stored = await chatStorage.getAgent(id);
            expect(stored.name).toBe('A');
        } finally {
            await chatStorage.deleteAgent(id);
        }
    });

    it('update_agent returns not_found for missing id', async () => {
        const r = await agentTools.update_agent({ id: 'agent_nope_1234', name: 'X' });
        expect(r.error).toBe('not_found');
    });

    it('delete_agent refuses when target is active', async () => {
        const id1 = await chatStorage.saveAgent({ name: 'A', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        const id2 = await chatStorage.saveAgent({ name: 'B', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        window.__bimAiActiveAgentId = id1;
        try {
            const r = await agentTools.delete_agent({ id: id1 });
            expect(r.error).toBe('cannot_modify_active');
            const still = await chatStorage.getAgent(id1);
            expect(!!still).toBe(true);
        } finally {
            await chatStorage.deleteAgent(id1);
            await chatStorage.deleteAgent(id2);
        }
    });

    it('delete_agent refuses when only one agent remains', async () => {
        const before = await chatStorage.listAgents();
        for (const a of before) await chatStorage.deleteAgent(a.id);
        const id = await chatStorage.saveAgent({ name: 'Only', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        try {
            const r = await agentTools.delete_agent({ id });
            expect(r.error).toBe('last_agent');
            const still = await chatStorage.getAgent(id);
            expect(!!still).toBe(true);
        } finally {
            await chatStorage.deleteAgent(id);
        }
    });

    it('delete_agent returns cancelled when confirm dismissed', async () => {
        const id1 = await chatStorage.saveAgent({ name: 'A', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        const id2 = await chatStorage.saveAgent({ name: 'B', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        const orig = window.confirm;
        window.confirm = () => false;
        try {
            const r = await agentTools.delete_agent({ id: id1 });
            expect(r.cancelled).toBe(true);
            const still = await chatStorage.getAgent(id1);
            expect(!!still).toBe(true);
        } finally {
            window.confirm = orig;
            await chatStorage.deleteAgent(id1);
            await chatStorage.deleteAgent(id2);
        }
    });

    it('delete_agent succeeds with confirm and non-active id', async () => {
        const id1 = await chatStorage.saveAgent({ name: 'Keep', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        const id2 = await chatStorage.saveAgent({ name: 'Bye', provider: 'openai', model: 'gpt-4', apiKey: 'k' });
        const orig = window.confirm;
        window.confirm = () => true;
        try {
            const r = await agentTools.delete_agent({ id: id2 });
            expect(r.deleted).toBe(true);
            const gone = await chatStorage.getAgent(id2);
            expect(gone).toBe(null);
        } finally {
            window.confirm = orig;
            await chatStorage.deleteAgent(id1).catch(() => {});
            await chatStorage.deleteAgent(id2).catch(() => {});
        }
    });

    it('register adds 5 tools', async () => {
        let count = 0;
        agentTools.register(() => { count++; });
        expect(count).toBe(5);
    });
});
