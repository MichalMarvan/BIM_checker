/**
 * Chat-heads stack manager — single source of truth for active threads
 * shown as circular avatars above the launcher.
 */

import * as storage from '../ai/chat-storage.js';

const MAX_VISIBLE = 5;

const _state = {
    heads: [],
    openAgentId: null,
    inited: false
};

let _container = null;

export async function init() {
    const settings = await storage.getSettings();
    _state.heads = Array.isArray(settings.activeChatHeads) ? [...settings.activeChatHeads] : [];
    _state.openAgentId = settings.chatPanelOpen ? settings.lastActiveAgentId : null;
    _state.inited = true;
    await _validateAgainstStorage();
    _render();
}

async function _validateAgainstStorage() {
    const valid = [];
    for (const h of _state.heads) {
        try {
            const agent = await storage.getAgent(h.agentId);
            if (agent) valid.push(h);
        } catch (e) { /* drop */ }
    }
    if (valid.length !== _state.heads.length) {
        _state.heads = valid;
        await _persist();
    }
}

async function _persist() {
    await storage.updateSettings({ activeChatHeads: [..._state.heads] });
}

export function setContainer(el) { _container = el; }

export async function addHead({ agentId, threadId }) {
    if (!agentId) return;
    const idx = _state.heads.findIndex(h => h.agentId === agentId);
    if (idx >= 0) {
        _state.heads.splice(idx, 1);
    }
    _state.heads.unshift({ agentId, threadId: threadId || null, hasUnread: false });
    await _persist();
    _render();
}

export async function removeHead(threadIdOrAgent) {
    const before = _state.heads.length;
    _state.heads = _state.heads.filter(h =>
        h.threadId !== threadIdOrAgent && h.agentId !== threadIdOrAgent
    );
    if (_state.heads.length !== before) {
        await _persist();
        _render();
    }
}

export async function markUnread(agentId) {
    const h = _state.heads.find(h => h.agentId === agentId);
    if (!h || h.hasUnread) return;
    h.hasUnread = true;
    await _persist();
    _render();
}

export async function clearUnread(agentId) {
    const h = _state.heads.find(h => h.agentId === agentId);
    if (!h || !h.hasUnread) return;
    h.hasUnread = false;
    await _persist();
    _render();
}

export function setOpenHead(agentId) {
    _state.openAgentId = agentId;
    _render();
}

export function getOpenHead() {
    if (!_state.openAgentId) return null;
    const h = _state.heads.find(h => h.agentId === _state.openAgentId);
    return h ? { agentId: h.agentId, threadId: h.threadId } : null;
}

export function getStateSnapshotForTest() {
    return JSON.parse(JSON.stringify(_state));
}

export function _resetForTest() {
    _state.heads = [];
    _state.openAgentId = null;
    _state.inited = false;
    _container = null;
}

function _render() { /* implemented in Task 2 */ }
