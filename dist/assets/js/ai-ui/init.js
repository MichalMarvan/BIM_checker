/**
 * AI chat bootstrap — runs on DOMContentLoaded on every page.
 *
 * Wires:
 *   - #aiSettingsBtn click → open settings modal (lazy import)
 *   - <body> launcher button + popover (immediate via launcher.init())
 *   - 'ai:openSettings' / 'ai:openChat' / 'ai:agentsChanged' custom events
 */

import * as launcher from './chat-launcher.js';
import { getSettings } from '../ai/chat-storage.js';

let _settingsModalPromise = null;
let _chatPanelPromise = null;

async function getSettingsModal() {
    if (!_settingsModalPromise) {
        _settingsModalPromise = import('./settings-modal.js');
    }
    return _settingsModalPromise;
}

async function getChatPanel() {
    if (!_chatPanelPromise) {
        _chatPanelPromise = import('./chat-panel.js');
    }
    return _chatPanelPromise;
}

async function init() {
    // Inject launcher button immediately
    await launcher.init();

    // Wire navbar settings button
    const settingsBtn = document.getElementById('aiSettingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', async () => {
            const m = await getSettingsModal();
            await m.open();
        });
    }

    // Listen for custom events from launcher
    window.addEventListener('ai:openSettings', async () => {
        const m = await getSettingsModal();
        await m.open();
    });

    window.addEventListener('ai:openChat', async (e) => {
        const m = await getChatPanel();
        await m.openForAgent(e.detail.agentId);
    });

    window.addEventListener('chatHeads:openHead', async (e) => {
        const m = await getChatPanel();
        await m.openForAgent(e.detail.agentId, e.detail.threadId);
    });

    // When agents change, the launcher's popover re-renders next time it opens
    // (via onLanguageChange-style re-render on each open).

    // Auto-restore chat panel + last thread if it was open before navigation
    try {
        const settings = await getSettings();
        if (settings && settings.chatPanelOpen && settings.lastActiveAgentId) {
            const cp = await getChatPanel();
            if (typeof cp.restoreLastSession === 'function') {
                await cp.restoreLastSession();
            }
        }
    } catch (e) {
        console.warn('[ai-ui] auto-restore failed:', e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
