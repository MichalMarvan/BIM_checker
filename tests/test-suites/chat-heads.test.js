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

    it('_render produces .chat-head buttons in container', async () => {
        const a = await storage.saveAgent({ name: 'AA', provider: 'openai', model: 'm', apiKey: 'k' });
        const container = document.createElement('div');
        document.body.appendChild(container);
        chatHeads.setContainer(container);
        try {
            await chatHeads.addHead({ agentId: a, threadId: 't1' });
            const btns = container.querySelectorAll('.chat-head');
            expect(btns.length).toBe(1);
            expect(btns[0].dataset.agentId).toBe(a);
        } finally {
            container.remove();
            await storage.deleteAgent(a);
        }
    });

    it('_render shows +N overflow when more than 5 heads', async () => {
        const ids = [];
        for (let i = 0; i < 7; i++) {
            ids.push(await storage.saveAgent({ name: `A${i}`, provider: 'openai', model: 'm', apiKey: 'k' }));
        }
        const container = document.createElement('div');
        document.body.appendChild(container);
        chatHeads.setContainer(container);
        try {
            for (let i = 0; i < ids.length; i++) {
                await chatHeads.addHead({ agentId: ids[i], threadId: `t${i}` });
            }
            const visible = container.querySelectorAll('.chat-head');
            const pill = container.querySelector('.chat-heads-overflow');
            expect(visible.length).toBe(5);
            expect(!!pill).toBe(true);
            expect(pill.textContent).toBe('+2');
        } finally {
            container.remove();
            for (const id of ids) await storage.deleteAgent(id).catch(() => {});
        }
    });
});
