/**
 * Settings modal — manage AI agents.
 * Public API: open() — lazy-injects modal on first call.
 */

import * as storage from '../ai/chat-storage.js';
import { PROVIDERS } from '../ai/providers.js';
import { fetchModels } from '../ai/ai-client.js';
import { t, onLanguageChange } from './chat-i18n-helpers.js';
import { TOOL_CATEGORIES, TOTAL_TOOLS } from '../ai/tool-catalog.js';
import { AGENT_PRESETS, getPreset } from '../ai/agent-presets.js';

let _modal = null;
const _state = { view: 'list', editingId: null, modelsCache: {} };

export async function open() {
    if (!_modal) _injectModal();
    await _renderListView();
    _modal.classList.add('active');
}

function _close() {
    if (_modal) _modal.classList.remove('active');
}

function _injectModal() {
    _modal = document.createElement('div');
    _modal.className = 'modal-overlay ai-settings-modal';
    _modal.id = 'aiSettingsModal';
    _modal.innerHTML = `
        <div class="modal-container">
            <div class="modal-header">
                <h2 id="aiSettingsTitle">AI Agenti</h2>
                <button class="modal-close" id="aiSettingsClose">&times;</button>
            </div>
            <div class="modal-body" id="aiSettingsBody"></div>
        </div>`;
    document.body.appendChild(_modal);
    _modal.querySelector('#aiSettingsClose').addEventListener('click', _close);
    _modal.addEventListener('click', (e) => {
        if (e.target === _modal) _close();
    });
    onLanguageChange(() => {
        if (_state.view === 'list') _renderListView();
        else _renderFormView(_state.editingId);
    });
}

async function _renderListView() {
    _state.view = 'list';
    _modal.querySelector('#aiSettingsTitle').textContent = t('ai.settings.title');
    const body = _modal.querySelector('#aiSettingsBody');
    const agents = await storage.listAgents();
    body.innerHTML = '';

    const heading = document.createElement('h3');
    heading.textContent = t('ai.settings.agentsHeading');
    heading.style.cssText = 'margin: 0 0 12px; font-size: 1em;';
    body.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'ai-settings-modal__agents';
    body.appendChild(list);

    for (const agent of agents) {
        const row = document.createElement('div');
        row.className = 'ai-settings-modal__agent-row';
        const provName = PROVIDERS[agent.provider]?.name || agent.provider;
        row.innerHTML = `
            <div class="ai-settings-modal__agent-icon">${escapeHtml(agent.icon || '🤖')}</div>
            <div class="ai-settings-modal__agent-info">
                <div class="ai-settings-modal__agent-name">${escapeHtml(agent.name)}</div>
                <div class="ai-settings-modal__agent-meta">
                    ${escapeHtml(provName)} · ${escapeHtml(agent.model || '(model nezvolen)')}
                    ${agent.isFavorite ? ' · ⭐' : ''}
                </div>
            </div>
            <div class="ai-settings-modal__agent-actions">
                <button class="ai-settings-modal__icon-btn" data-action="edit" title="Upravit">✏️</button>
                <button class="ai-settings-modal__icon-btn" data-action="delete" title="Smazat">🗑️</button>
            </div>`;
        row.querySelector('[data-action="edit"]').addEventListener('click', () => _renderFormView(agent.id));
        row.querySelector('[data-action="delete"]').addEventListener('click', () => _deleteAgent(agent.id));
        list.appendChild(row);
    }

    const addBtn = document.createElement('button');
    addBtn.className = 'ai-settings-modal__add-btn';
    addBtn.textContent = t('ai.settings.addAgent');
    addBtn.addEventListener('click', () => _renderFormView(null));
    body.appendChild(addBtn);

    const advanced = document.createElement('details');
    advanced.className = 'ai-settings-modal__advanced';
    advanced.innerHTML = `<summary>${t('ai.settings.advancedSection')}</summary>
        <p style="color: var(--text-tertiary); padding: 8px 0;">
            (Nepoužito v Phase 7 — připraveno pro budoucí endpoint library.)
        </p>`;
    body.appendChild(advanced);
}

async function _renderFormView(agentId) {
    _state.view = 'form';
    _state.editingId = agentId;
    const agent = agentId ? await storage.getAgent(agentId) : _newAgentDefaults();
    _modal.querySelector('#aiSettingsTitle').textContent = agentId ? t('ai.agent.editTitle') : t('ai.agent.createTitle');
    const body = _modal.querySelector('#aiSettingsBody');

    body.innerHTML = `
        <form class="agent-form" id="agentForm">
            ${!agentId ? `
            <div class="agent-form__row agent-form__preset-row">
                <label>${t('ai.agent.startFromPreset')}</label>
                <select id="agentPresetSelect">
                    <option value="">${t('ai.agent.noPreset')}</option>
                    ${AGENT_PRESETS.map(p => `<option value="${p.id}">${escapeHtml(p.icon + ' ' + p.name)}</option>`).join('')}
                </select>
            </div>
            ` : ''}
            <div class="agent-form__row">
                <label>${t('ai.agent.iconLabel')}</label>
                <input type="text" id="agentIcon" maxlength="4" value="${escapeAttr(agent.icon || '🤖')}" style="width:80px;">
            </div>
            <div class="agent-form__row">
                <label>${t('ai.agent.nameLabel')}</label>
                <input type="text" id="agentName" maxlength="80" value="${escapeAttr(agent.name || '')}">
                <div class="agent-form__error" id="agentNameError">${t('ai.agent.nameRequired')}</div>
            </div>
            <div class="agent-form__row">
                <label>${t('ai.agent.providerLabel')}</label>
                <select id="agentProvider">
                    ${Object.entries(PROVIDERS).map(([k, p]) =>
                        `<option value="${k}"${k === agent.provider ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
                </select>
            </div>
            <div class="agent-form__row">
                <label>${t('ai.agent.endpointLabel')}</label>
                <input type="text" id="agentEndpoint" placeholder="https://..." value="${escapeAttr(agent.baseUrl || '')}">
            </div>
            <div class="agent-form__row">
                <label>${t('ai.agent.apiKeyLabel')}</label>
                <input type="password" id="agentApiKey" value="${escapeAttr(agent.apiKey || '')}">
            </div>
            <div class="agent-form__row">
                <label>${t('ai.agent.modelLabel')}</label>
                <div class="agent-form__row__row">
                    <select id="agentModelSelect" style="display:none"></select>
                    <input type="text" id="agentModelText" value="${escapeAttr(agent.model || '')}" placeholder="model id">
                    <button type="button" id="agentLoadModelsBtn">${t('ai.agent.modelLoadBtn')}</button>
                </div>
            </div>
            <div class="agent-form__row">
                <label>${t('ai.agent.tempLabel')}<span class="agent-form__temp-display" id="tempDisplay">${agent.temperature.toFixed(2)}</span></label>
                <input type="range" id="agentTemp" min="0" max="1" step="0.05" value="${agent.temperature}">
            </div>
            <div class="agent-form__row">
                <label>${t('ai.agent.systemPromptLabel')}</label>
                <textarea id="agentSystemPrompt" placeholder="${escapeAttr(t('ai.agent.systemPromptPlaceholder'))}">${escapeHtml(agent.systemPrompt || '')}</textarea>
            </div>
            <div class="agent-form__row">
                <label>${t('ai.agent.enabledToolsLabel')}</label>
                <div class="agent-form__tool-picker" id="agentToolPicker"></div>
                <div class="agent-form__tool-picker-actions">
                    <button type="button" id="toolPickerSelectAll" class="agent-form__tool-picker-action">${t('ai.agent.selectAllTools')}</button>
                    <button type="button" id="toolPickerSelectNone" class="agent-form__tool-picker-action">${t('ai.agent.selectNoTools')}</button>
                    <span class="agent-form__tool-counter" id="toolPickerCounter">${TOTAL_TOOLS} / ${TOTAL_TOOLS}</span>
                </div>
            </div>
            <div class="agent-form__row">
                <label>
                    <input type="checkbox" id="agentFav"${agent.isFavorite ? ' checked' : ''}>
                    ${t('ai.agent.favoriteToggle')}
                </label>
            </div>
            <div class="agent-form__actions">
                <button type="button" id="agentCancelBtn" class="ai-settings-modal__icon-btn">${t('ai.agent.cancel')}</button>
                <button type="submit" class="ai-settings-modal__add-btn">${t('ai.agent.save')}</button>
            </div>
        </form>`;

    body.querySelector('#agentTemp').addEventListener('input', (e) => {
        body.querySelector('#tempDisplay').textContent = parseFloat(e.target.value).toFixed(2);
    });
    body.querySelector('#agentCancelBtn').addEventListener('click', () => _renderListView());
    body.querySelector('#agentLoadModelsBtn').addEventListener('click', () => _loadModelsIntoForm());
    body.querySelector('#agentForm').addEventListener('submit', (e) => {
        e.preventDefault();
        _saveFromForm();
    });
    _renderToolPicker(agent ? agent.enabledTools : null);

    const presetSelect = _modal.querySelector('#agentPresetSelect');
    if (presetSelect) {
        presetSelect.addEventListener('change', (e) => {
            const preset = getPreset(e.target.value);
            if (!preset) return;
            _modal.querySelector('#agentName').value = preset.name;
            _modal.querySelector('#agentIcon').value = preset.icon;
            _modal.querySelector('#agentSystemPrompt').value = preset.systemPrompt;
            _renderToolPicker(preset.enabledTools);
        });
    }
}

async function _loadModelsIntoForm() {
    const provider = _modal.querySelector('#agentProvider').value;
    const baseUrl = _modal.querySelector('#agentEndpoint').value || PROVIDERS[provider].endpoint;
    const apiKey = _modal.querySelector('#agentApiKey').value;
    if (!baseUrl) return;
    const cacheKey = `${baseUrl}::${apiKey}`;
    const select = _modal.querySelector('#agentModelSelect');
    const text = _modal.querySelector('#agentModelText');
    try {
        const models = _state.modelsCache[cacheKey] || await fetchModels(baseUrl, apiKey);
        _state.modelsCache[cacheKey] = models;
        const current = text.value;
        select.innerHTML = models.map(m => `<option value="${escapeAttr(m)}"${m === current ? ' selected' : ''}>${escapeHtml(m)}</option>`).join('');
        select.style.display = '';
        text.style.display = 'none';
        select.addEventListener('change', () => { text.value = select.value; });
        if (current) select.value = current;
    } catch (e) {
        if (typeof ErrorHandler !== 'undefined') {
            ErrorHandler.error(t('ai.endpoint.loadModelsFailed'));
        }
        console.warn('Failed to load models:', e);
    }
}

async function _saveFromForm() {
    const name = _modal.querySelector('#agentName').value.trim();
    const errEl = _modal.querySelector('#agentNameError');
    if (!name) {
        errEl.classList.add('is-visible');
        return;
    }
    errEl.classList.remove('is-visible');
    const data = {
        id: _state.editingId || undefined,
        name,
        icon: _modal.querySelector('#agentIcon').value || '🤖',
        provider: _modal.querySelector('#agentProvider').value,
        baseUrl: _modal.querySelector('#agentEndpoint').value.trim(),
        apiKey: _modal.querySelector('#agentApiKey').value,
        model: _modal.querySelector('#agentModelSelect').style.display === 'none'
            ? _modal.querySelector('#agentModelText').value.trim()
            : _modal.querySelector('#agentModelSelect').value,
        systemPrompt: _modal.querySelector('#agentSystemPrompt').value,
        temperature: parseFloat(_modal.querySelector('#agentTemp').value),
        isFavorite: _modal.querySelector('#agentFav').checked
    };
    if (!data.model || !data.model.trim()) {
        if (typeof ErrorHandler !== 'undefined') {
            ErrorHandler.error('Vyber nebo zadej model agenta — bez modelu API odmítne request.');
        }
        return;
    }
    data.enabledTools = _collectEnabledTools();
    try {
        await storage.saveAgent(data);
        if (typeof ErrorHandler !== 'undefined') {
            ErrorHandler.success(t('ai.agent.saved').replace('{name}', name));
        }
        await _renderListView();
        window.dispatchEvent(new CustomEvent('ai:agentsChanged'));
    } catch (e) {
        console.error('Save failed:', e);
    }
}

async function _deleteAgent(id) {
    const agent = await storage.getAgent(id);
    if (!agent) return;
    const msg = t('ai.agent.deleteConfirm').replace('{name}', agent.name);
    if (!confirm(msg)) return;
    await storage.deleteAgent(id);
    if (typeof ErrorHandler !== 'undefined') {
        ErrorHandler.success(t('ai.agent.deleted').replace('{name}', agent.name));
    }
    await _renderListView();
    window.dispatchEvent(new CustomEvent('ai:agentsChanged'));
}

function _newAgentDefaults() {
    return {
        icon: '🤖', name: '', provider: 'google', baseUrl: '', apiKey: '',
        model: '', systemPrompt: '', temperature: 0.7, isFavorite: true
    };
}

function _renderToolPicker(enabledTools) {
    const container = _modal.querySelector('#agentToolPicker');
    if (!container) return;
    const allNames = TOOL_CATEGORIES.flatMap(c => c.tools.map(tool => tool.name));
    const enabledSet = (enabledTools === null || enabledTools === undefined)
        ? new Set(allNames)
        : new Set(enabledTools);

    container.innerHTML = '';
    for (const cat of TOOL_CATEGORIES) {
        const details = document.createElement('details');
        details.className = 'tool-picker-category';
        details.dataset.catId = cat.id;
        const enabledInCat = cat.tools.filter(tool => enabledSet.has(tool.name)).length;
        details.innerHTML = `
            <summary>
                <span class="category-icon">${cat.icon}</span>
                <span class="category-label">${escapeHtml(t(cat.labelKey))}</span>
                <span class="category-count">${enabledInCat}/${cat.tools.length}</span>
                <button type="button" class="category-toggle-all" data-cat="${cat.id}">${escapeHtml(t('ai.agent.categoryToggleAll'))}</button>
            </summary>
            <ul class="tool-picker-tool-list">
                ${cat.tools.map(toolDef => `
                    <li>
                        <label>
                            <input type="checkbox" data-tool="${toolDef.name}" ${enabledSet.has(toolDef.name) ? 'checked' : ''}>
                            <span class="tool-name">${escapeHtml(toolDef.name)}</span>
                            <span class="tool-label">${escapeHtml(t(toolDef.labelKey))}</span>
                        </label>
                    </li>
                `).join('')}
            </ul>`;
        container.appendChild(details);
    }
    _updateToolPickerCounter();
    _attachToolPickerListeners();
}

function _attachToolPickerListeners() {
    const container = _modal.querySelector('#agentToolPicker');
    container.querySelectorAll('input[type="checkbox"][data-tool]').forEach(cb => {
        cb.addEventListener('change', () => _updateToolPickerCounter());
    });
    container.querySelectorAll('.category-toggle-all').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const catId = btn.dataset.cat;
            const details = container.querySelector(`details[data-cat-id="${catId}"]`);
            const cbs = details.querySelectorAll('input[type="checkbox"][data-tool]');
            const allChecked = Array.from(cbs).every(cb => cb.checked);
            cbs.forEach(cb => { cb.checked = !allChecked; });
            _updateToolPickerCounter();
        });
    });
    _modal.querySelector('#toolPickerSelectAll').addEventListener('click', () => {
        container.querySelectorAll('input[type="checkbox"][data-tool]').forEach(cb => { cb.checked = true; });
        _updateToolPickerCounter();
    });
    _modal.querySelector('#toolPickerSelectNone').addEventListener('click', () => {
        container.querySelectorAll('input[type="checkbox"][data-tool]').forEach(cb => { cb.checked = false; });
        _updateToolPickerCounter();
    });
}

function _updateToolPickerCounter() {
    const container = _modal.querySelector('#agentToolPicker');
    if (!container) return;
    const total = TOTAL_TOOLS;
    const enabled = container.querySelectorAll('input[type="checkbox"][data-tool]:checked').length;
    const counter = _modal.querySelector('#toolPickerCounter');
    if (counter) counter.textContent = `${enabled} / ${total}`;
    container.querySelectorAll('details.tool-picker-category').forEach(details => {
        const catId = details.dataset.catId;
        const cat = TOOL_CATEGORIES.find(c => c.id === catId);
        const enabledInCat = Array.from(details.querySelectorAll('input[type="checkbox"][data-tool]:checked')).length;
        const countSpan = details.querySelector('.category-count');
        if (countSpan) countSpan.textContent = `${enabledInCat}/${cat.tools.length}`;
    });
}

function _collectEnabledTools() {
    const container = _modal.querySelector('#agentToolPicker');
    if (!container) return null;
    const checked = Array.from(container.querySelectorAll('input[type="checkbox"][data-tool]:checked'))
        .map(cb => cb.dataset.tool);
    if (checked.length === TOTAL_TOOLS) return null;
    return checked;
}

function escapeHtml(s) { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; }
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
