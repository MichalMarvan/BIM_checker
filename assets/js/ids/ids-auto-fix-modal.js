/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * IDSAutoFixModal — renders the auto-fix picker built from FixDescriptors
 * produced by IDSAutoFix.analyze. Returns the user's choice as a Promise.
 *
 * Resolution shape:
 *   { action: 'fix' | 'ignore', selectedIds: string[] }
 */
window.IDSAutoFixModal = (function () {
    'use strict';

    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        })[c]);
    }

    function show(descriptors) {
        return new Promise((resolve) => {
            const modal = document.getElementById('idsAutoFixModal');
            if (!modal) { resolve({ action: 'ignore', selectedIds: [] }); return; }

            document.getElementById('idsAutoFixTitle').textContent     = t('editor.autoFix.modalTitle');
            document.getElementById('idsAutoFixIntro').textContent     = t('editor.autoFix.intro');
            document.getElementById('idsAutoFixIgnore').textContent    = t('editor.autoFix.ignore');
            document.getElementById('idsAutoFixFixSelected').textContent = t('editor.autoFix.fixSelected');
            document.getElementById('idsAutoFixFixAll').textContent    = t('editor.autoFix.fixAll');

            const list = document.getElementById('idsAutoFixList');
            list.innerHTML = descriptors.map(d => {
                const labelText = d.fixable ? t(d.label) : (d.label || '');
                const before = d.before !== null && d.before !== undefined
                    ? `<div class="fix-diff">${escapeHtml(d.before)} → ${escapeHtml(d.after || '')}</div>` : '';
                const lineLink = d.lineNumber
                    ? `<div class="fix-line"><a data-jump="${d.lineNumber}">${escapeHtml(t('editor.autoFix.line').replace('{n}', d.lineNumber))}</a></div>` : '';
                const cbAttrs = d.fixable
                    ? `type="checkbox" data-id="${escapeHtml(d.id)}" checked`
                    : `type="checkbox" disabled title="${escapeHtml(t('editor.autoFix.unfixableHint'))}"`;
                return `<li>
                    <input ${cbAttrs}>
                    <div class="fix-meta">
                        <div class="fix-label">${escapeHtml(labelText)}</div>
                        ${before}${lineLink}
                    </div>
                </li>`;
            }).join('');

            list.querySelectorAll('a[data-jump]').forEach(a => {
                a.addEventListener('click', () => {
                    const line = a.getAttribute('data-jump');
                    if (typeof window.switchTab === 'function') window.switchTab('raw');
                    requestAnimationFrame(() => {
                        const t = document.getElementById('xml-line-' + line);
                        if (t) t.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    });
                });
            });

            modal.style.display = 'flex';

            function selected() {
                return Array.from(list.querySelectorAll('input[type=checkbox][data-id]:checked'))
                    .map(cb => cb.getAttribute('data-id'));
            }
            function cleanup(action, ids) {
                modal.style.display = 'none';
                document.getElementById('idsAutoFixClose').onclick        = null;
                document.getElementById('idsAutoFixIgnore').onclick       = null;
                document.getElementById('idsAutoFixFixSelected').onclick  = null;
                document.getElementById('idsAutoFixFixAll').onclick       = null;
                resolve({ action, selectedIds: ids });
            }

            document.getElementById('idsAutoFixClose').onclick        = () => cleanup('ignore', []);
            document.getElementById('idsAutoFixIgnore').onclick       = () => cleanup('ignore', []);
            document.getElementById('idsAutoFixFixSelected').onclick  = () => cleanup('fix', selected());
            document.getElementById('idsAutoFixFixAll').onclick       = () => cleanup(
                'fix',
                descriptors.filter(d => d.fixable).map(d => d.id)
            );
        });
    }

    return { show };
})();
