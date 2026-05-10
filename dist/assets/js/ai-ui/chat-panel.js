/**
 * Chat panel — right-side floating panel with threads sidebar + messages + streaming input.
 *
 * Public API: openForAgent(agentId), close()
 */

import * as storage from '../ai/chat-storage.js';
import { chatCompletion } from '../ai/ai-client.js';
import { getEffectiveEndpoint } from '../ai/agent-manager.js';
import { TOOL_DEFINITIONS } from '../ai/tool-defs.js';
import { executeToolCall } from '../ai/tool-executor.js';
import { t, onLanguageChange } from './chat-i18n-helpers.js';
import * as chatHeads from './chat-heads.js';

let _panel = null;
const _state = { agentId: null, threadId: null, busy: false, abort: null };

export async function openForAgent(agentId, threadId) {
    if (!_panel) _injectPanel();
    _state.agentId = agentId;
    window.__bimAiActiveAgentId = agentId;
    _state.threadId = null;
    if (threadId) {
        const thread = await storage.getThread(threadId);
        if (thread && thread.agentId === agentId) _state.threadId = threadId;
    }
    await _refreshHeader();
    await _refreshThreadsSidebar();
    await _refreshMessages();
    _panel.classList.add('is-open');
    _panel.classList.remove('is-minimized');
    _hideLauncher(true);
    chatHeads.setOpenHead(agentId);
    await chatHeads.clearUnread(agentId);
    await storage.updateSettings({ chatPanelOpen: true, lastActiveAgentId: agentId, lastActiveThreadId: _state.threadId });
}

export async function restoreLastSession() {
    const settings = await storage.getSettings();
    if (!settings || !settings.chatPanelOpen || !settings.lastActiveAgentId) return false;
    const agent = await storage.getAgent(settings.lastActiveAgentId);
    if (!agent) {
        await storage.updateSettings({ chatPanelOpen: false, lastActiveAgentId: null, lastActiveThreadId: null });
        return false;
    }
    await openForAgent(settings.lastActiveAgentId);
    if (settings.lastActiveThreadId) {
        const thread = await storage.getThread(settings.lastActiveThreadId);
        if (thread && thread.agentId === settings.lastActiveAgentId) {
            _state.threadId = settings.lastActiveThreadId;
            await _refreshMessages();
            await _refreshThreadsSidebar();
        }
    }
    return true;
}

export function close() {
    const removingAgentId = _state.agentId;
    if (_panel) {
        _panel.classList.remove('is-open');
        _panel.classList.remove('is-minimized');
    }
    _hideLauncher(false);
    if (_state.abort) _state.abort.abort();
    window.__bimAiActiveAgentId = null;
    chatHeads.setOpenHead(null);
    if (removingAgentId) chatHeads.removeHead(removingAgentId);
    storage.updateSettings({ chatPanelOpen: false });
}

function _hideLauncher(hide) {
    const launcher = document.getElementById('chatLauncher');
    if (launcher) launcher.style.display = hide ? 'none' : '';
}

function _toggleMinimize() {
    if (!_panel) return;
    const wasMinimized = _panel.classList.contains('is-minimized');
    _panel.classList.toggle('is-minimized');
    if (!wasMinimized) {
        _panel.classList.remove('is-open');
        _hideLauncher(false);
        chatHeads.setOpenHead(null);
        storage.updateSettings({ chatPanelOpen: false });
    }
}

function _injectPanel() {
    _panel = document.createElement('aside');
    _panel.id = 'aiChatPanel';
    _panel.className = 'chat-panel';
    _panel.innerHTML = `
        <div class="chat-panel__header" id="chatHeader">
            <span class="chat-panel__header__title" id="chatHeaderTitle"></span>
            <button class="chat-panel__header__btn" id="chatToggleThreads" title="${t('ai.chat.toggleThreadsBtn')}">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
            </button>
            <button class="chat-panel__header__btn chat-panel__header__minimize" id="chatMinimizeBtn" title="${t('ai.chat.minimizeBtn') || 'Minimalizovat'}">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <button class="chat-panel__header__btn" id="chatCloseBtn" title="${t('ai.chat.closeBtn')}">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
            </button>
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

    _panel.querySelector('#chatCloseBtn').addEventListener('click', (e) => { e.stopPropagation(); close(); });
    _panel.querySelector('#chatMinimizeBtn').addEventListener('click', (e) => { e.stopPropagation(); _toggleMinimize(); });
    _panel.querySelector('#chatToggleThreads').addEventListener('click', (e) => { e.stopPropagation(); _toggleThreadsSidebar(); });
    // Click on header (excluding buttons) toggles minimize
    _panel.querySelector('#chatHeader').addEventListener('click', () => {
        if (_panel.classList.contains('is-minimized')) _toggleMinimize();
    });
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
    sidebar.classList.toggle('is-expanded');
    await storage.updateSettings({ threadsSidebarOpen: sidebar.classList.contains('is-expanded') });
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
        storage.updateSettings({ lastActiveThreadId: null });
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
            storage.updateSettings({ lastActiveThreadId: thread.id });
            chatHeads.addHead({ agentId: _state.agentId, threadId: thread.id });
            chatHeads.setOpenHead(_state.agentId);
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
        await storage.updateSettings({ lastActiveThreadId: _state.threadId });
        await chatHeads.addHead({ agentId: _state.agentId, threadId: _state.threadId });
        chatHeads.setOpenHead(_state.agentId);
    } else {
        await storage.appendMessage(_state.threadId, { role: 'user', content: text });
    }

    _appendBubble('user', text);
    input.value = '';
    _autoGrowInput();

    _state.busy = true;
    _state.abort = new AbortController();

    const MAX_ITERATIONS = 5;
    let iteration = 0;

    try {
        let messages = [];
        if (agent.systemPrompt) messages.push({ role: 'system', content: agent.systemPrompt });
        const allMsgs = await storage.listMessages(_state.threadId);
        for (const m of allMsgs) {
            const cleaned = { role: m.role, content: m.content };
            if (m.tool_calls) cleaned.tool_calls = m.tool_calls;
            if (m.tool_call_id) cleaned.tool_call_id = m.tool_call_id;
            if (m.name && m.role === 'tool') cleaned.name = m.name;
            messages.push(cleaned);
        }

        while (iteration < MAX_ITERATIONS) {
            iteration++;

            const thinkingDiv = document.createElement('div');
            thinkingDiv.className = 'chat-panel__msg chat-panel__msg--thinking';
            thinkingDiv.textContent = t('ai.chat.thinking');
            _panel.querySelector('#chatMessages').appendChild(thinkingDiv);

            let streamed = '';
            const result = await chatCompletion(
                getEffectiveEndpoint(agent),
                agent.apiKey,
                agent.model,
                messages,
                TOOL_DEFINITIONS,
                {
                    temperature: agent.temperature,
                    signal: _state.abort.signal,
                    onStream: (delta, full) => {
                        streamed = full;
                        thinkingDiv.classList.remove('chat-panel__msg--thinking');
                        thinkingDiv.classList.add('chat-panel__msg--assistant');
                        thinkingDiv.textContent = full;
                        _panel.querySelector('#chatMessages').scrollTop = 1e9;
                    }
                }
            );

            const choice = result?.choices?.[0];
            const finishReason = choice?.finish_reason;
            const assistantMsg = choice?.message || { role: 'assistant', content: streamed };
            await storage.appendMessage(_state.threadId, assistantMsg);
            messages.push(assistantMsg);

            if (finishReason !== 'tool_calls') {
                if (!streamed && assistantMsg.content) {
                    thinkingDiv.classList.remove('chat-panel__msg--thinking');
                    thinkingDiv.classList.add('chat-panel__msg--assistant');
                    thinkingDiv.textContent = assistantMsg.content;
                }
                if (_panel && (!_panel.classList.contains('is-open') || _panel.classList.contains('is-minimized'))) {
                    chatHeads.markUnread(_state.agentId);
                }
                break;
            }

            const toolCalls = assistantMsg.tool_calls || [];
            thinkingDiv.remove();
            const callBubble = document.createElement('div');
            callBubble.className = 'chat-panel__msg chat-panel__msg--toolcall';
            callBubble.textContent = `🔧 ${t('ai.chat.toolCalling')}: ${toolCalls.map(tc => tc.function?.name).join(', ')}`;
            _panel.querySelector('#chatMessages').appendChild(callBubble);

            for (const tc of toolCalls) {
                let parsedArgs = {};
                try { parsedArgs = JSON.parse(tc.function?.arguments || '{}'); } catch {}
                const toolResult = await executeToolCall({
                    id: tc.id,
                    name: tc.function?.name,
                    arguments: parsedArgs
                });
                const toolMsg = {
                    role: 'tool',
                    tool_call_id: tc.id,
                    name: tc.function?.name,
                    content: JSON.stringify(toolResult)
                };
                await storage.appendMessage(_state.threadId, toolMsg);
                messages.push(toolMsg);

                const resultBubble = document.createElement('div');
                resultBubble.className = 'chat-panel__msg chat-panel__msg--toolresult';
                const isError = toolResult?.error;
                resultBubble.textContent = `${isError ? '❌' : '✓'} ${t('ai.chat.toolReturned')}: ${JSON.stringify(toolResult).slice(0, 120)}`;
                _panel.querySelector('#chatMessages').appendChild(resultBubble);
            }
            _panel.querySelector('#chatMessages').scrollTop = 1e9;
        }

        if (iteration >= MAX_ITERATIONS) {
            const limitBubble = document.createElement('div');
            limitBubble.className = 'chat-panel__msg chat-panel__msg--assistant';
            limitBubble.textContent = `[${t('ai.chat.maxIterations')}]`;
            _panel.querySelector('#chatMessages').appendChild(limitBubble);
        }
    } catch (err) {
        if (err?.name === 'AbortError') {
            const lastThinking = _panel.querySelector('.chat-panel__msg--thinking');
            if (lastThinking) lastThinking.remove();
            return;
        }
        input.value = text;
        _autoGrowInput();
        const lastThinking = _panel.querySelector('.chat-panel__msg--thinking');
        if (lastThinking) {
            lastThinking.classList.remove('chat-panel__msg--thinking');
            lastThinking.classList.add('chat-panel__msg--assistant');
            lastThinking.textContent = `[Error] ${err.message || err}`;
        }
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
