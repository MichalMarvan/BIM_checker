/**
 * Bottom-right circular launcher button + popover with favorite agents.
 *
 * Emits custom events:
 *   ai:openSettings   — user wants to open settings modal
 *   ai:openChat       — { detail: { agentId } } — user wants to chat with agent
 */

import { listFavorites } from '../ai/chat-storage.js';
import { t, onLanguageChange } from './chat-i18n-helpers.js';

let _button = null;
let _popover = null;
let _open = false;

export async function init() {
    _injectButton();
    _injectPopover();
    document.addEventListener('click', _onDocClick);
    onLanguageChange(_rerenderPopover);
}

function _injectButton() {
    if (document.getElementById('chatLauncher')) {
        _button = document.getElementById('chatLauncher');
        return;
    }
    _button = document.createElement('button');
    _button.id = 'chatLauncher';
    _button.className = 'chat-launcher';
    _button.setAttribute('aria-label', t('ai.launcher.tooltip'));
    _button.title = t('ai.launcher.tooltip');
    _button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2"/>
            <circle cx="12" cy="5" r="2"/>
            <path d="M12 7v4"/>
            <line x1="8" y1="16" x2="8" y2="16"/>
            <line x1="16" y1="16" x2="16" y2="16"/>
        </svg>`;
    _button.addEventListener('click', _toggle);
    document.body.appendChild(_button);
}

function _injectPopover() {
    if (document.getElementById('chatLauncherPopover')) {
        _popover = document.getElementById('chatLauncherPopover');
        return;
    }
    _popover = document.createElement('div');
    _popover.id = 'chatLauncherPopover';
    _popover.className = 'chat-launcher-popover';
    document.body.appendChild(_popover);
}

async function _toggle() {
    if (_open) return _close();
    await _rerenderPopover();
    _popover.classList.add('is-open');
    _open = true;
}

function _close() {
    if (!_open) return;
    _popover.classList.remove('is-open');
    _open = false;
}

function _onDocClick(e) {
    if (!_open) return;
    if (e.target === _button || _button.contains(e.target)) return;
    if (e.target === _popover || _popover.contains(e.target)) return;
    _close();
}

async function _rerenderPopover() {
    if (!_popover) return;
    const favs = await listFavorites();
    _popover.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'chat-launcher-popover__title';
    title.textContent = t('ai.launcher.popoverTitle');
    _popover.appendChild(title);

    if (favs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'chat-launcher-popover__item';
        empty.textContent = t('ai.launcher.noAgents');
        empty.style.color = 'var(--text-tertiary)';
        empty.style.fontStyle = 'italic';
        _popover.appendChild(empty);
        const create = document.createElement('div');
        create.className = 'chat-launcher-popover__item';
        create.textContent = t('ai.launcher.createFirst');
        create.addEventListener('click', () => {
            _close();
            window.dispatchEvent(new CustomEvent('ai:openSettings'));
        });
        _popover.appendChild(create);
        return;
    }

    for (const agent of favs.slice(0, 8)) {
        const item = document.createElement('div');
        item.className = 'chat-launcher-popover__item';
        item.innerHTML = `
            <span class="chat-launcher-popover__item__icon">${agent.icon || '🤖'}</span>
            <span>${escapeHtml(agent.name)}</span>`;
        item.addEventListener('click', () => {
            _close();
            window.dispatchEvent(new CustomEvent('ai:openChat', { detail: { agentId: agent.id } }));
        });
        _popover.appendChild(item);
    }

    const divider = document.createElement('div');
    divider.className = 'chat-launcher-popover__divider';
    _popover.appendChild(divider);

    const manage = document.createElement('div');
    manage.className = 'chat-launcher-popover__item';
    manage.textContent = t('ai.launcher.manageAgents');
    manage.addEventListener('click', () => {
        _close();
        window.dispatchEvent(new CustomEvent('ai:openSettings'));
    });
    _popover.appendChild(manage);
}

function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = String(s ?? '');
    return div.innerHTML;
}
