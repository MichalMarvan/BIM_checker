/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * Ollama setup modal — actionable per-OS instructions for users whose
 * browser cannot reach their local Ollama instance.
 *
 * Public API: open({ reason }) — reason: 'cors_or_down' | 'mixed_content' | 'manual'
 */

import { t } from './chat-i18n-helpers.js';

let _modal = null;
let _currentReason = 'manual';

function _detectOS() {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    const platform = (typeof navigator !== 'undefined' && navigator.platform) || '';
    if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'windows';
    if (/Mac/i.test(platform) || /Macintosh/i.test(ua)) return 'macos';
    return 'linux';
}

function _detectBrowserBlocksLocalhost() {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    const isChromium = /Chrome\/|Chromium\/|Edg\//.test(ua) && !/Firefox\//.test(ua);
    return !isChromium;
}

function _origin() {
    return typeof location !== 'undefined' ? location.origin : 'https://checkthebim.com';
}

function _instructionsFor(os, origin) {
    if (os === 'windows') {
        return {
            title: t('ai.ollamaSetup.windows.title'),
            steps: [
                t('ai.ollamaSetup.windows.step1'),
                t('ai.ollamaSetup.windows.step2'),
                t('ai.ollamaSetup.windows.step3')
            ],
            code: `[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "${origin}", "User")`
        };
    }
    if (os === 'macos') {
        return {
            title: t('ai.ollamaSetup.macos.title'),
            steps: [
                t('ai.ollamaSetup.macos.step1'),
                t('ai.ollamaSetup.macos.step2'),
                t('ai.ollamaSetup.macos.step3')
            ],
            code: `launchctl setenv OLLAMA_ORIGINS "${origin}"`
        };
    }
    return {
        title: t('ai.ollamaSetup.linux.title'),
        steps: [
            t('ai.ollamaSetup.linux.step1'),
            t('ai.ollamaSetup.linux.step2'),
            t('ai.ollamaSetup.linux.step3')
        ],
        code: `sudo systemctl edit ollama\n# Add inside [Service]:\nEnvironment="OLLAMA_ORIGINS=${origin}"\n# Save, then:\nsudo systemctl restart ollama`
    };
}

function _reasonBanner(reason) {
    if (reason === 'mixed_content') {
        return `<div class="ollama-setup__banner is-firefox">
            <strong>${t('ai.ollamaSetup.banner.mixedContent.title')}</strong>
            <p>${t('ai.ollamaSetup.banner.mixedContent.body')}</p>
        </div>`;
    }
    if (reason === 'cors_or_down') {
        return `<div class="ollama-setup__banner is-cors">
            <strong>${t('ai.ollamaSetup.banner.corsOrDown.title')}</strong>
            <p>${t('ai.ollamaSetup.banner.corsOrDown.body')}</p>
        </div>`;
    }
    return '';
}

function _escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = String(s ?? '');
    return d.innerHTML;
}

function _render() {
    const os = _detectOS();
    const origin = _origin();
    const instructions = _instructionsFor(os, origin);
    const blocked = _detectBrowserBlocksLocalhost();
    const body = _modal.querySelector('.ollama-setup__body');

    const tabsHtml = ['windows', 'macos', 'linux'].map(key => `
        <button class="ollama-setup__tab ${key === os ? 'is-active' : ''}" data-os="${key}">
            ${_escapeHtml(t('ai.ollamaSetup.tab.' + key))}
        </button>
    `).join('');

    body.innerHTML = `
        ${_reasonBanner(_currentReason)}
        <p class="ollama-setup__intro">${t('ai.ollamaSetup.intro')}</p>
        ${blocked ? `<div class="ollama-setup__browser-warn">
            ⚠ ${t('ai.ollamaSetup.browserWarn')}
        </div>` : ''}
        <div class="ollama-setup__tabs">${tabsHtml}</div>
        <div class="ollama-setup__panel">
            <h4>${_escapeHtml(instructions.title)}</h4>
            <ol class="ollama-setup__steps">
                ${instructions.steps.map(s => `<li>${_escapeHtml(s)}</li>`).join('')}
            </ol>
            <div class="ollama-setup__code-wrap">
                <pre class="ollama-setup__code"><code>${_escapeHtml(instructions.code)}</code></pre>
                <button class="ollama-setup__copy" type="button">${t('ai.ollamaSetup.copy')}</button>
            </div>
            <p class="ollama-setup__hint">
                ${t('ai.ollamaSetup.endpointHint')} <code>http://localhost:11434/v1</code>
            </p>
        </div>
    `;

    body.querySelectorAll('.ollama-setup__tab').forEach(tab => {
        tab.addEventListener('click', () => {
            _renderOS(tab.dataset.os);
        });
    });

    const copyBtn = body.querySelector('.ollama-setup__copy');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(instructions.code);
                copyBtn.textContent = t('ai.ollamaSetup.copied');
                setTimeout(() => { copyBtn.textContent = t('ai.ollamaSetup.copy'); }, 1500);
            } catch (e) {
                console.warn('Clipboard copy failed:', e);
            }
        });
    }
}

function _renderOS(os) {
    const origin = _origin();
    const instructions = _instructionsFor(os, origin);
    const panel = _modal.querySelector('.ollama-setup__panel');
    panel.innerHTML = `
        <h4>${_escapeHtml(instructions.title)}</h4>
        <ol class="ollama-setup__steps">
            ${instructions.steps.map(s => `<li>${_escapeHtml(s)}</li>`).join('')}
        </ol>
        <div class="ollama-setup__code-wrap">
            <pre class="ollama-setup__code"><code>${_escapeHtml(instructions.code)}</code></pre>
            <button class="ollama-setup__copy" type="button">${t('ai.ollamaSetup.copy')}</button>
        </div>
        <p class="ollama-setup__hint">
            ${t('ai.ollamaSetup.endpointHint')} <code>http://localhost:11434/v1</code>
        </p>
    `;
    _modal.querySelectorAll('.ollama-setup__tab').forEach(tab => {
        tab.classList.toggle('is-active', tab.dataset.os === os);
    });
    const copyBtn = panel.querySelector('.ollama-setup__copy');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(instructions.code);
                copyBtn.textContent = t('ai.ollamaSetup.copied');
                setTimeout(() => { copyBtn.textContent = t('ai.ollamaSetup.copy'); }, 1500);
            } catch (e) {
                console.warn('Clipboard copy failed:', e);
            }
        });
    }
}

function _inject() {
    _modal = document.createElement('div');
    _modal.className = 'modal-overlay ollama-setup-modal';
    _modal.innerHTML = `
        <div class="modal-container ollama-setup__container">
            <div class="modal-header">
                <h2>${t('ai.ollamaSetup.title')}</h2>
                <button class="modal-close" type="button">&times;</button>
            </div>
            <div class="modal-body ollama-setup__body"></div>
        </div>`;
    document.body.appendChild(_modal);
    _modal.querySelector('.modal-close').addEventListener('click', close);
    _modal.addEventListener('click', (e) => {
        if (e.target === _modal) close();
    });
}

export function open(opts = {}) {
    _currentReason = opts.reason || 'manual';
    if (!_modal) _inject();
    _render();
    _modal.classList.add('active');
}

export function close() {
    if (_modal) _modal.classList.remove('active');
}
