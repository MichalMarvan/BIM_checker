describe('ai-ui integration (in-page)', () => {
    let storage;

    beforeEach(async () => {
        storage = await import('../../assets/js/ai/chat-storage.js');
        await storage._internals._delete(storage._internals.KEY_AGENTS);
        await storage._internals._delete(storage._internals.KEY_THREADS);
        // Clean any previously injected DOM
        document.getElementById('chatLauncher')?.remove();
        document.getElementById('chatLauncherPopover')?.remove();
        document.getElementById('aiSettingsModal')?.remove();
        document.getElementById('aiChatPanel')?.remove();
    });

    it('launcher.init injects button + popover into body', async () => {
        const launcher = await import('../../assets/js/ai-ui/chat-launcher.js');
        await launcher.init();
        expect(!!document.getElementById('chatLauncher')).toBe(true);
        expect(!!document.getElementById('chatLauncherPopover')).toBe(true);
    });

    it('launcher popover shows "no agents" when empty', async () => {
        const launcher = await import('../../assets/js/ai-ui/chat-launcher.js');
        await launcher.init();
        document.getElementById('chatLauncher').click();
        await new Promise(r => setTimeout(r, 100));
        const popover = document.getElementById('chatLauncherPopover');
        expect(popover.classList.contains('is-open')).toBe(true);
        const items = popover.querySelectorAll('.chat-launcher-popover__item');
        // First item is "no agents" text, second is "create first" button
        expect(items.length >= 1).toBe(true);
    });

    it('saving favorite agent makes it appear in popover after re-toggle', async () => {
        const launcher = await import('../../assets/js/ai-ui/chat-launcher.js');
        await launcher.init();
        await storage.saveAgent({ name: 'TestAgent', provider: 'google', isFavorite: true });
        // Ensure popover is open — if the module's _open state is true from a prior
        // test, a single click closes rather than opens, so we click until is-open.
        const btn = document.getElementById('chatLauncher');
        const popover = document.getElementById('chatLauncherPopover');
        btn.click();
        await new Promise(r => setTimeout(r, 100));
        if (!popover.classList.contains('is-open')) {
            btn.click();
            await new Promise(r => setTimeout(r, 100));
        }
        const items = document.querySelectorAll('.chat-launcher-popover__item');
        const names = Array.from(items).map(i => i.textContent.trim());
        expect(names.some(n => n.includes('TestAgent'))).toBe(true);
    });

    it('settings-modal.open injects modal into body', async () => {
        const modal = await import('../../assets/js/ai-ui/settings-modal.js');
        await modal.open();
        expect(!!document.getElementById('aiSettingsModal')).toBe(true);
        expect(document.getElementById('aiSettingsModal').classList.contains('active')).toBe(true);
    });

    it('chat-panel.openForAgent opens panel with agent name in header', async () => {
        const id = await storage.saveAgent({ name: 'ChatTest', provider: 'google', icon: '🦊' });
        const panel = await import('../../assets/js/ai-ui/chat-panel.js');
        await panel.openForAgent(id);
        expect(!!document.getElementById('aiChatPanel')).toBe(true);
        expect(document.getElementById('aiChatPanel').classList.contains('is-open')).toBe(true);
        expect(document.getElementById('chatHeaderTitle').textContent.includes('ChatTest')).toBe(true);
    });
});
