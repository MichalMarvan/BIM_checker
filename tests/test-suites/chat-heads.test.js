describe('chat-heads (state)', () => {
    let chatHeads;
    let storage;
    let savedSettings;

    beforeEach(async () => {
        chatHeads = await import('../../assets/js/ai-ui/chat-heads.js');
        storage = await import('../../assets/js/ai/chat-storage.js');
        chatHeads._resetForTest();
        savedSettings = await storage.getSettings();
        await storage.updateSettings({ activeChatHeads: [] });
    });

    afterEach(async () => {
        await storage.updateSettings(savedSettings);
        chatHeads._resetForTest();
    });

    it('addHead persists head to settings', async () => {
        const agentId = await storage.saveAgent({ name: 'A', provider: 'openai', model: 'm', apiKey: 'k' });
        try {
            await chatHeads.addHead({ agentId, threadId: 't1' });
            const s = await storage.getSettings();
            expect(s.activeChatHeads.length).toBe(1);
            expect(s.activeChatHeads[0].agentId).toBe(agentId);
            expect(s.activeChatHeads[0].threadId).toBe('t1');
            expect(s.activeChatHeads[0].hasUnread).toBe(false);
        } finally {
            await storage.deleteAgent(agentId);
        }
    });

    it('addHead with same agent dedupes and moves to top', async () => {
        const a = await storage.saveAgent({ name: 'A', provider: 'openai', model: 'm', apiKey: 'k' });
        const b = await storage.saveAgent({ name: 'B', provider: 'openai', model: 'm', apiKey: 'k' });
        try {
            await chatHeads.addHead({ agentId: a, threadId: 't1' });
            await chatHeads.addHead({ agentId: b, threadId: 't2' });
            await chatHeads.addHead({ agentId: a, threadId: 't3' });
            const snap = chatHeads.getStateSnapshotForTest();
            expect(snap.heads.length).toBe(2);
            expect(snap.heads[0].agentId).toBe(a);
            expect(snap.heads[0].threadId).toBe('t3');
            expect(snap.heads[1].agentId).toBe(b);
        } finally {
            await storage.deleteAgent(a);
            await storage.deleteAgent(b);
        }
    });

    it('removeHead by threadId removes the matching entry', async () => {
        const a = await storage.saveAgent({ name: 'A', provider: 'openai', model: 'm', apiKey: 'k' });
        try {
            await chatHeads.addHead({ agentId: a, threadId: 't1' });
            await chatHeads.removeHead('t1');
            const snap = chatHeads.getStateSnapshotForTest();
            expect(snap.heads.length).toBe(0);
        } finally {
            await storage.deleteAgent(a);
        }
    });

    it('markUnread / clearUnread toggle flag', async () => {
        const a = await storage.saveAgent({ name: 'A', provider: 'openai', model: 'm', apiKey: 'k' });
        try {
            await chatHeads.addHead({ agentId: a, threadId: 't1' });
            await chatHeads.markUnread(a);
            expect(chatHeads.getStateSnapshotForTest().heads[0].hasUnread).toBe(true);
            await chatHeads.clearUnread(a);
            expect(chatHeads.getStateSnapshotForTest().heads[0].hasUnread).toBe(false);
        } finally {
            await storage.deleteAgent(a);
        }
    });

    it('init() hydrates from storage and drops orphaned agentIds', async () => {
        const a = await storage.saveAgent({ name: 'A', provider: 'openai', model: 'm', apiKey: 'k' });
        await storage.updateSettings({ activeChatHeads: [
            { agentId: a, threadId: 't1', hasUnread: false },
            { agentId: 'agent_ghost', threadId: 't2', hasUnread: false }
        ]});
        try {
            await chatHeads.init();
            const snap = chatHeads.getStateSnapshotForTest();
            expect(snap.heads.length).toBe(1);
            expect(snap.heads[0].agentId).toBe(a);
        } finally {
            await storage.deleteAgent(a);
        }
    });

    it('setOpenHead / getOpenHead reflect open state', async () => {
        const a = await storage.saveAgent({ name: 'A', provider: 'openai', model: 'm', apiKey: 'k' });
        try {
            await chatHeads.addHead({ agentId: a, threadId: 't1' });
            chatHeads.setOpenHead(a);
            const open = chatHeads.getOpenHead();
            expect(open.agentId).toBe(a);
            expect(open.threadId).toBe('t1');
            chatHeads.setOpenHead(null);
            expect(chatHeads.getOpenHead()).toBe(null);
        } finally {
            await storage.deleteAgent(a);
        }
    });
});
