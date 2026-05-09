describe('AI i18n key coverage', () => {
    const REQUIRED_KEYS = [
        'ai.settings.tooltip','ai.settings.title','ai.settings.agentsHeading','ai.settings.addAgent','ai.settings.close','ai.settings.advancedSection',
        'ai.agent.editTitle','ai.agent.createTitle','ai.agent.nameLabel','ai.agent.iconLabel','ai.agent.providerLabel','ai.agent.endpointLabel','ai.agent.apiKeyLabel','ai.agent.modelLabel','ai.agent.modelLoadBtn','ai.agent.tempLabel','ai.agent.systemPromptLabel','ai.agent.systemPromptPlaceholder','ai.agent.favoriteToggle','ai.agent.cancel','ai.agent.save','ai.agent.nameRequired','ai.agent.urlInvalid','ai.agent.saved','ai.agent.deleted','ai.agent.deleteConfirm',
        'ai.launcher.tooltip','ai.launcher.popoverTitle','ai.launcher.noAgents','ai.launcher.createFirst','ai.launcher.manageAgents',
        'ai.chat.headerLabel','ai.chat.toggleThreadsBtn','ai.chat.closeBtn','ai.chat.inputPlaceholder','ai.chat.sendBtn','ai.chat.thinking','ai.chat.empty','ai.chat.toolsDisabled',
        'ai.thread.newConversation','ai.thread.threadsHeading','ai.thread.noThreads','ai.thread.deleteConfirm','ai.thread.untitledTitle',
        'ai.error.network','ai.error.invalidApiKey','ai.error.modelNotFound','ai.error.rateLimit','ai.error.providerDown','ai.error.cors','ai.error.mixedContent','ai.error.unknown',
        'ai.endpoint.connecting','ai.endpoint.ok','ai.endpoint.fail','ai.endpoint.loadModelsBtn','ai.endpoint.loadModelsFailed'
    ];

    function getCsBlock() {
        return window.translations?.cs || window.translations?.cz || {};
    }

    function getEnBlock() {
        return window.translations?.en || {};
    }

    it('all required ai.* keys are present in CZ', () => {
        const cs = getCsBlock();
        for (const key of REQUIRED_KEYS) {
            expect(typeof cs[key]).toBe('string');
            expect(cs[key].length > 0).toBe(true);
        }
    });

    it('all required ai.* keys are present in EN', () => {
        const en = getEnBlock();
        for (const key of REQUIRED_KEYS) {
            expect(typeof en[key]).toBe('string');
            expect(en[key].length > 0).toBe(true);
        }
    });

    it('total ai.* key count is at least 57 in CZ', () => {
        const cs = getCsBlock();
        const aiKeys = Object.keys(cs).filter(k => k.startsWith('ai.'));
        expect(aiKeys.length >= 57).toBe(true);
    });

    it('total ai.* key count is at least 57 in EN', () => {
        const en = getEnBlock();
        const aiKeys = Object.keys(en).filter(k => k.startsWith('ai.'));
        expect(aiKeys.length >= 57).toBe(true);
    });
});
