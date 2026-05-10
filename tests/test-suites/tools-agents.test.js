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

    it('register adds 2 tools', async () => {
        let count = 0;
        agentTools.register(() => { count++; });
        expect(count).toBe(2);
    });
});
