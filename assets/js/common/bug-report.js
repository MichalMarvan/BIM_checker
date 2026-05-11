/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * BugReport — in-app bug reporting modal that posts to /api/bug-report.
 * Anonymous, no contact field, no screenshot. Failure mode falls back to a
 * link to manual GitHub issue creation with prefilled query parameters.
 */
window.BugReport = (function() {
    'use strict';

    const ENDPOINT = '/api/bug-report';
    const REPO_FALLBACK_URL = 'https://github.com/MichalMarvan/BIM_checker/issues/new';
    const MAX_TITLE = 120;
    const MAX_DESC = 5000;
    const MAX_STEPS = 2000;

    let _injected = false;

    function _t(key) {
        if (typeof t === 'function') return t(key);
        if (typeof window.t === 'function') return window.t(key);
        return key;
    }

    function _injectModalHTML() {
        if (document.getElementById('bugReportModal')) {
            _injected = true;
            return;
        }
        const html = `
<div id="bugReportModal" class="modal-overlay" style="display:none">
    <div class="modal-container">
        <div class="modal-header">
            <h2 id="bugReportHeading"></h2>
            <button class="modal-close" id="bugReportClose">&times;</button>
        </div>
        <div class="modal-body">
            <p class="bug-report-intro" id="bugReportIntro"></p>
            <div class="form-group">
                <label id="bugReportTitleLabel" for="bugReportTitle"></label>
                <input type="text" id="bugReportTitle" maxlength="${MAX_TITLE}">
            </div>
            <div class="form-group">
                <label id="bugReportDescLabel" for="bugReportDesc"></label>
                <textarea id="bugReportDesc" rows="4" maxlength="${MAX_DESC}"></textarea>
            </div>
            <div class="form-group">
                <label id="bugReportStepsLabel" for="bugReportSteps"></label>
                <textarea id="bugReportSteps" rows="3" maxlength="${MAX_STEPS}"></textarea>
            </div>
            <details class="bug-report-metadata">
                <summary id="bugReportPreviewSummary"></summary>
                <pre id="bugReportMetadataPreview"></pre>
            </details>
            <div id="bugReportError" class="bug-report-error" hidden></div>
            <div id="bugReportSuccess" class="bug-report-success" hidden></div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" id="bugReportCancel"></button>
            <button class="btn btn-primary" id="bugReportSubmit"></button>
        </div>
    </div>
</div>`;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html.trim();
        document.body.appendChild(wrapper.firstChild);
        _injected = true;
    }

    function _applyTranslations() {
        document.getElementById('bugReportHeading').textContent = _t('bugReport.title');
        document.getElementById('bugReportIntro').textContent = _t('bugReport.intro');
        document.getElementById('bugReportTitleLabel').textContent = _t('bugReport.titleField');
        document.getElementById('bugReportTitle').placeholder = _t('bugReport.titlePlaceholder');
        document.getElementById('bugReportDescLabel').textContent = _t('bugReport.descField');
        document.getElementById('bugReportDesc').placeholder = _t('bugReport.descPlaceholder');
        document.getElementById('bugReportStepsLabel').textContent = _t('bugReport.stepsField');
        document.getElementById('bugReportSteps').placeholder = _t('bugReport.stepsPlaceholder');
        document.getElementById('bugReportPreviewSummary').textContent = _t('bugReport.previewMetadata');
        document.getElementById('bugReportCancel').textContent = _t('bugReport.cancel');
        document.getElementById('bugReportSubmit').textContent = _t('bugReport.submit');
    }

    function _wireHandlers() {
        document.getElementById('bugReportClose').addEventListener('click', close);
        document.getElementById('bugReportCancel').addEventListener('click', close);
        document.getElementById('bugReportSubmit').addEventListener('click', _submit);
        document.getElementById('bugReportModal').addEventListener('click', (e) => {
            if (e.target.id === 'bugReportModal') close();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('bugReportModal');
                if (modal && modal.style.display !== 'none') close();
            }
        });
    }

    function _wireBugButtons() {
        document.querySelectorAll('.bug-report-btn').forEach(btn => {
            btn.addEventListener('click', open);
        });
    }

    function _getAppVersion() {
        const meta = document.querySelector('meta[name="app-version"]');
        return meta ? meta.getAttribute('content') : 'unknown';
    }

    function _getLanguage() {
        if (window.i18n && typeof window.i18n.getCurrentLanguage === 'function') {
            return window.i18n.getCurrentLanguage();
        }
        return document.documentElement.lang || 'unknown';
    }

    function _buildMetadata() {
        return {
            appVersion: _getAppVersion(),
            userAgent: navigator.userAgent,
            pagePath: window.location.pathname,
            language: _getLanguage(),
            timestamp: new Date().toISOString(),
            recentErrors: (window.ErrorHandler && ErrorHandler.getRecentErrors)
                ? ErrorHandler.getRecentErrors() : []
        };
    }

    function _showError(html) {
        const el = document.getElementById('bugReportError');
        el.innerHTML = html;
        el.removeAttribute('hidden');
        document.getElementById('bugReportSuccess').setAttribute('hidden', '');
    }

    function _showSuccess(html) {
        const el = document.getElementById('bugReportSuccess');
        el.innerHTML = html;
        el.removeAttribute('hidden');
        document.getElementById('bugReportError').setAttribute('hidden', '');
        // Switch Cancel button to "Close" label
        document.getElementById('bugReportCancel').textContent = _t('bugReport.close');
        document.getElementById('bugReportSubmit').setAttribute('hidden', '');
    }

    function _resetModalState() {
        // Re-apply translations on every open so language switch is reflected
        _applyTranslations();
        document.getElementById('bugReportTitle').value = '';
        document.getElementById('bugReportDesc').value = '';
        document.getElementById('bugReportSteps').value = '';
        document.getElementById('bugReportError').setAttribute('hidden', '');
        document.getElementById('bugReportSuccess').setAttribute('hidden', '');
        const submitBtn = document.getElementById('bugReportSubmit');
        submitBtn.removeAttribute('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = _t('bugReport.submit');
        document.getElementById('bugReportCancel').textContent = _t('bugReport.cancel');
        document.getElementById('bugReportMetadataPreview').textContent = JSON.stringify(_buildMetadata(), null, 2);
    }

    function _escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[c]));
    }

    function _buildFallbackUrl(title, description, steps, metadata) {
        const body = [
            `## Description\n\n${description}`,
            steps ? `## Steps to reproduce\n\n${steps}` : '',
            `## Metadata\n\n\`\`\`json\n${JSON.stringify(metadata, null, 2)}\n\`\`\``
        ].filter(Boolean).join('\n\n');
        const params = new URLSearchParams({ title: `[Bug] ${title}`, body });
        return `${REPO_FALLBACK_URL}?${params.toString()}`;
    }

    async function _submit() {
        const title = document.getElementById('bugReportTitle').value.trim();
        const description = document.getElementById('bugReportDesc').value.trim();
        const steps = document.getElementById('bugReportSteps').value.trim();

        if (!title || !description) {
            _showError(_escapeHtml(_t('bugReport.errorMissingFields')));
            return;
        }

        const metadata = _buildMetadata();
        const submitBtn = document.getElementById('bugReportSubmit');
        submitBtn.disabled = true;
        submitBtn.textContent = _t('bugReport.submitting');

        try {
            const response = await fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description, steps, metadata })
            });

            if (response.ok) {
                const data = await response.json();
                const url = data.issueUrl || REPO_FALLBACK_URL;
                _showSuccess(
                    `<strong>${_escapeHtml(_t('bugReport.successTitle'))}</strong><br>` +
                    `<a href="${_escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${_escapeHtml(_t('bugReport.successOpenIssue'))}</a>`
                );
                return;
            }

            if (response.status === 429) {
                _showError(_escapeHtml(_t('bugReport.errorRateLimit')));
                submitBtn.disabled = false;
                submitBtn.textContent = _t('bugReport.submit');
                return;
            }

            // Generic error — show fallback manual link
            const fallback = _buildFallbackUrl(title, description, steps, metadata);
            _showError(
                _escapeHtml(_t('bugReport.errorGeneric')) + ' ' +
                `<a href="${_escapeHtml(fallback)}" target="_blank" rel="noopener noreferrer">${_escapeHtml(_t('bugReport.fallbackOpen'))}</a>`
            );
            submitBtn.disabled = false;
            submitBtn.textContent = _t('bugReport.submit');
        } catch (e) {
            const fallback = _buildFallbackUrl(title, description, steps, metadata);
            _showError(
                _escapeHtml(_t('bugReport.errorNetwork')) + ' ' +
                `<a href="${_escapeHtml(fallback)}" target="_blank" rel="noopener noreferrer">${_escapeHtml(_t('bugReport.fallbackOpen'))}</a>`
            );
            submitBtn.disabled = false;
            submitBtn.textContent = _t('bugReport.submit');
        }
    }

    function init() {
        if (_injected) return;
        _injectModalHTML();
        _applyTranslations();
        _wireHandlers();
        _wireBugButtons();
    }

    function open() {
        if (!_injected) init();
        _resetModalState();
        document.getElementById('bugReportModal').style.display = 'flex';
    }

    function close() {
        const modal = document.getElementById('bugReportModal');
        if (modal) modal.style.display = 'none';
    }

    // Test helper — reset internal state between tests
    function _reset() {
        _injected = false;
    }

    return { init, open, close, _buildMetadata, _submit, _reset };
})();
