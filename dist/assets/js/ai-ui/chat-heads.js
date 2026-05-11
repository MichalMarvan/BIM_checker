/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
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
    await _refreshAgentCache();
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
    await _refreshAgentCache();
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

function _render() {
    if (!_container) return;
    _container.innerHTML = '';
    const visible = _state.heads.slice(0, MAX_VISIBLE);
    const overflow = _state.heads.slice(MAX_VISIBLE);
    for (const head of visible) {
        const btn = document.createElement('button');
        btn.className = 'chat-head';
        if (head.hasUnread) btn.classList.add('chat-head--unread');
        if (head.agentId === _state.openAgentId) btn.classList.add('chat-head--open');
        btn.dataset.agentId = head.agentId;
        btn.dataset.threadId = head.threadId || '';
        btn.innerHTML = `
            <span class="chat-head__circle">${_escapeHtml(_iconFor(head.agentId))}</span>
            <span class="chat-head__label">${_escapeHtml(_labelFor(head.agentId))}</span>`;
        btn.addEventListener('click', () => _onHeadClick(head.agentId, head.threadId));
        _container.appendChild(btn);
    }
    if (overflow.length > 0) {
        const pill = document.createElement('button');
        pill.className = 'chat-heads-overflow';
        pill.dataset.count = String(overflow.length);
        pill.textContent = `+${overflow.length}`;
        pill.addEventListener('click', () => _onOverflowClick(overflow));
        _container.appendChild(pill);
    }
}

function _iconFor(agentId) {
    const cached = _agentCache.get(agentId);
    return cached?.icon || '🤖';
}

function _labelFor(agentId) {
    const cached = _agentCache.get(agentId);
    if (!cached) return '…';
    const name = String(cached.name || '').trim();
    return name.length > 16 ? name.slice(0, 15) + '…' : name;
}

function _escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
}

const _agentCache = new Map();

async function _refreshAgentCache() {
    _agentCache.clear();
    for (const h of _state.heads) {
        try {
            const a = await storage.getAgent(h.agentId);
            if (a) _agentCache.set(h.agentId, { name: a.name, icon: a.icon || '🤖' });
        } catch (e) { /* skip */ }
    }
}

function _onHeadClick(agentId, threadId) {
    window.dispatchEvent(new CustomEvent('chatHeads:openHead', { detail: { agentId, threadId } }));
}

function _onOverflowClick(overflow) {
    let popover = document.getElementById('chatHeadsOverflowPopover');
    if (popover) { popover.remove(); return; }
    popover = document.createElement('div');
    popover.id = 'chatHeadsOverflowPopover';
    popover.className = 'chat-heads-overflow-popover is-open';
    for (const head of overflow) {
        const item = document.createElement('div');
        item.className = 'chat-heads-overflow-popover__item';
        item.dataset.agentId = head.agentId;
        const cached = _agentCache.get(head.agentId);
        item.innerHTML = `
            <span style="font-size:1.4em">${_escapeHtml(cached?.icon || '🤖')}</span>
            <span>${_escapeHtml(cached?.name || '…')}</span>`;
        item.addEventListener('click', () => {
            popover.remove();
            window.dispatchEvent(new CustomEvent('chatHeads:openHead', { detail: { agentId: head.agentId, threadId: head.threadId } }));
        });
        popover.appendChild(item);
    }
    document.body.appendChild(popover);
    setTimeout(() => {
        const closeOnOutside = (e) => {
            if (!popover.contains(e.target) && !e.target.classList.contains('chat-heads-overflow')) {
                popover.remove();
                document.removeEventListener('click', closeOnOutside);
            }
        };
        document.addEventListener('click', closeOnOutside);
    }, 0);
}
