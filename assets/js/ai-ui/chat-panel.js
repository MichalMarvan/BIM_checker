/**
 * Chat panel — right-side floating panel with threads sidebar + messages + streaming input.
 *
 * Public API: openForAgent(agentId), close()
 */

import * as storage from '../ai/chat-storage.js';
import { chatCompletion } from '../ai/ai-client.js';
import { getEffectiveEndpoint } from '../ai/agent-manager.js';
import { TOOL_DEFINITIONS } from '../ai/tool-defs.js';
import { t, onLanguageChange } from './chat-i18n-helpers.js';

let _panel = null;
const _state = { agentId: null, threadId: null, busy: false, abort: null };

export async function openForAgent(agentId) {
    if (!_panel) _injectPanel();
    _state.agentId = agentId;
    _state.threadId = null;
    await _refreshHeader();
    await _refreshThreadsSidebar();
    await _refreshMessages();
    _panel.classList.add('is-open');
    await storage.updateSettings({ chatPanelOpen: true, lastActiveAgentId: agentId });
}

export function close() {
    if (_panel) _panel.classList.remove('is-open');
    if (_state.abort) _state.abort.abort();
    storage.updateSettings({ chatPanelOpen: false });
}

function _injectPanel() {
    _panel = document.createElement('aside');
    _panel.id = 'aiChatPanel';
    _panel.className = 'chat-panel';
    _panel.innerHTML = `
        <div class="chat-panel__header">
            <span class="chat-panel__header__title" id="chatHeaderTitle"></span>
            <button class="chat-panel__header__btn" id="chatToggleThreads" title="${t('ai.chat.toggleThreadsBtn')}">↔</button>
            <button class="chat-panel__header__btn" id="chatCloseBtn" title="${t('ai.chat.closeBtn')}">✕</button>
        </div>
        <div class="chat-panel__body">
            <aside class="chat-panel__threads" id="chatThreadsSidebar"></aside>
            <main class="chat-panel__messages" id="chatMessages"></main>
        </div>
        <div class="chat-panel__input">
            <textarea id="chatInput" placeholder="${t('ai.chat.inputPlaceholder')}" rows="1"></textarea>
            <button id="chatSendBtn">${t('ai.chat.sendBtn')}</button>
        </div>`;
    document.body.appendChild(_panel);

    _panel.querySelector('#chatCloseBtn').addEventListener('click', close);
    _panel.querySelector('#chatToggleThreads').addEventListener('click', _toggleThreadsSidebar);
    _panel.querySelector('#chatSendBtn').addEventListener('click', _send);
    const input = _panel.querySelector('#chatInput');
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            _send();
        }
    });
    input.addEventListener('input', _autoGrowInput);
    onLanguageChange(() => {
        _refreshHeader();
        _panel.querySelector('#chatInput').placeholder = t('ai.chat.inputPlaceholder');
        _panel.querySelector('#chatSendBtn').textContent = t('ai.chat.sendBtn');
    });
}

function _autoGrowInput() {
    const ta = _panel.querySelector('#chatInput');
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
}

async function _toggleThreadsSidebar() {
    const sidebar = _panel.querySelector('#chatThreadsSidebar');
    sidebar.classList.toggle('is-collapsed');
    await storage.updateSettings({ threadsSidebarOpen: !sidebar.classList.contains('is-collapsed') });
}

async function _refreshHeader() {
    const agent = await storage.getAgent(_state.agentId);
    if (!agent) return;
    const title = t('ai.chat.headerLabel').replace('{agentName}', `${agent.icon || '🤖'} ${agent.name}`);
    _panel.querySelector('#chatHeaderTitle').textContent = title;
}

async function _refreshThreadsSidebar() {
    const sidebar = _panel.querySelector('#chatThreadsSidebar');
    sidebar.innerHTML = '';
    const heading = document.createElement('div');
    heading.className = 'chat-panel__threads__heading';
    heading.textContent = t('ai.thread.threadsHeading');
    sidebar.appendChild(heading);

    const newBtn = document.createElement('button');
    newBtn.className = 'chat-panel__threads__new';
    newBtn.textContent = t('ai.thread.newConversation');
    newBtn.addEventListener('click', () => {
        _state.threadId = null;
        _refreshMessages();
    });
    sidebar.appendChild(newBtn);

    const threads = await storage.listThreads(_state.agentId);
    if (threads.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding: 12px; color: var(--text-tertiary); font-size: 0.85em; text-align: center;';
        empty.textContent = t('ai.thread.noThreads');
        sidebar.appendChild(empty);
        return;
    }

    for (const thread of threads) {
        const item = document.createElement('div');
        item.className = 'chat-panel__threads__item';
        if (thread.id === _state.threadId) item.classList.add('is-active');
        item.innerHTML = `
            <div class="chat-panel__threads__item__title">${escapeHtml(thread.title || t('ai.thread.untitledTitle'))}</div>
            <div class="chat-panel__threads__item__time">${_relativeTime(thread.updatedAt)}</div>`;
        item.addEventListener('click', () => {
            _state.threadId = thread.id;
            _refreshMessages();
            _refreshThreadsSidebar();
        });
        sidebar.appendChild(item);
    }
}

async function _refreshMessages() {
    const main = _panel.querySelector('#chatMessages');
    main.innerHTML = '';

    // Phase 7 banner — tools disabled
    const banner = document.createElement('div');
    banner.className = 'chat-panel__tools-banner';
    banner.textContent = t('ai.chat.toolsDisabled');
    main.appendChild(banner);

    if (!_state.threadId) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align: center; color: var(--text-tertiary); padding: 24px;';
        empty.textContent = t('ai.chat.empty');
        main.appendChild(empty);
        return;
    }

    const msgs = await storage.listMessages(_state.threadId);
    for (const m of msgs) {
        if (m.role === 'system' || m.role === 'tool') continue;
        _appendBubble(m.role, m.content || '');
    }
    main.scrollTop = main.scrollHeight;
}

function _appendBubble(role, content) {
    const main = _panel.querySelector('#chatMessages');
    const div = document.createElement('div');
    div.className = `chat-panel__msg chat-panel__msg--${role}`;
    div.textContent = content;
    main.appendChild(div);
    main.scrollTop = main.scrollHeight;
    return div;
}

async function _send() {
    if (_state.busy) return;
    const input = _panel.querySelector('#chatInput');
    const text = input.value.trim();
    if (!text) return;

    const agent = await storage.getAgent(_state.agentId);
    if (!agent) return;

    if (!_state.threadId) {
        _state.threadId = await storage.createThread(_state.agentId, text);
        await _refreshThreadsSidebar();
    } else {
        await storage.appendMessage(_state.threadId, { role: 'user', content: text });
    }

    _appendBubble('user', text);
    input.value = '';
    _autoGrowInput();

    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'chat-panel__msg chat-panel__msg--thinking';
    thinkingDiv.textContent = t('ai.chat.thinking');
    _panel.querySelector('#chatMessages').appendChild(thinkingDiv);

    _state.busy = true;
    _state.abort = new AbortController();

    try {
        const allMsgs = await storage.listMessages(_state.threadId);
        const apiMessages = [];
        if (agent.systemPrompt) apiMessages.push({ role: 'system', content: agent.systemPrompt });
        for (const m of allMsgs) {
            apiMessages.push({ role: m.role, content: m.content });
        }

        const endpoint = getEffectiveEndpoint(agent);
        let streamed = '';
        const result = await chatCompletion(endpoint, agent.apiKey, agent.model, apiMessages, TOOL_DEFINITIONS, {
            temperature: agent.temperature,
            signal: _state.abort.signal,
            onStream: (delta, full) => {
                streamed = full;
                thinkingDiv.classList.remove('chat-panel__msg--thinking');
                thinkingDiv.classList.add('chat-panel__msg--assistant');
                thinkingDiv.textContent = full;
                _panel.querySelector('#chatMessages').scrollTop = 1e9;
            }
        });

        const finalContent = streamed || result?.choices?.[0]?.message?.content || '';
        thinkingDiv.classList.remove('chat-panel__msg--thinking');
        thinkingDiv.classList.add('chat-panel__msg--assistant');
        thinkingDiv.textContent = finalContent;

        await storage.appendMessage(_state.threadId, { role: 'assistant', content: finalContent });
    } catch (err) {
        thinkingDiv.classList.remove('chat-panel__msg--thinking');
        thinkingDiv.classList.add('chat-panel__msg--assistant');
        thinkingDiv.textContent = `[Error] ${err.message || err}`;
        const errKey = _errorKeyFromException(err);
        if (typeof ErrorHandler !== 'undefined' && errKey) {
            ErrorHandler.error(t(errKey).replace('{provider}', _providerName(agent.provider)));
        }
    } finally {
        _state.busy = false;
        _state.abort = null;
    }
}

function _errorKeyFromException(err) {
    if (!err) return null;
    if (err.code === 'auth') return 'ai.error.invalidApiKey';
    if (err.code === 'rate_limit') return 'ai.error.rateLimit';
    if (err.code === 'server') return 'ai.error.providerDown';
    if (err.message && /Failed to fetch|NetworkError/i.test(err.message)) return 'ai.error.network';
    return 'ai.error.unknown';
}

function _providerName(key) {
    const map = { ollama:'Ollama', google:'Google AI', openai:'OpenAI', openrouter:'OpenRouter', custom:'Custom' };
    return map[key] || key;
}

function _relativeTime(ms) {
    const diff = Date.now() - ms;
    if (diff < 60000) return 'teď';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} h`;
    return new Date(ms).toLocaleDateString();
}

function escapeHtml(s) { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; }
