/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('i18n-completeness — no hardcoded Czech outside allowlist', () => {
    const CS_CHARS_REGEX = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;

    const FILES_TO_SCAN = [
        '../index.html',
        '../pages/ids-ifc-validator.html',
        '../pages/ids-parser-visualizer.html',
        '../pages/ifc-viewer-multi-file.html',
        '../assets/js/index.js',
        '../assets/js/parser.js',
        '../assets/js/validator.js',
        '../assets/js/common/update-checker.js',
        '../assets/js/common/wizard.js',
        '../assets/js/common/progress-panel.js',
        '../assets/js/ifc/viewer-parser.js',
        '../assets/js/ai/tools/tool-validator.js',
        '../assets/js/ai/tools/tool-agents.js',
        '../assets/js/ai/tools/tool-storage.js',
        '../assets/js/ai/tools/tool-settings.js',
        '../assets/js/ai/tools/tool-ids.js',
        '../assets/js/ai/tools/tool-ui.js',
        '../assets/js/ai/tools/tool-bsdd.js',
        '../assets/js/ai/tools/tool-presets.js',
        '../assets/js/ai/tools/tool-ifc.js',
        '../assets/js/ai/chat-storage.js',
        '../assets/js/ai/tool-defs.js',
        '../assets/js/ai-ui/settings-modal.js',
        '../assets/js/ai-ui/chat-panel.js',
        '../assets/js/ids/ids-editor-modals.js'
    ];

    function stripComments(text) {
        return text
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/.*$/gm, '$1');
    }

    function stripDataI18nFallbackText(text) {
        // Match opening tag with data-i18n through the next opening of any tag (multi-line OK via [\s\S])
        return text.replace(/<([a-z][a-z0-9]*)\b[^>]*\bdata-i18n[^>]*>([\s\S]*?)</gi, '<$1>__I18N_FALLBACK__<');
    }

    it('all scanned files are reachable', async () => {
        let allOk = true;
        for (const path of FILES_TO_SCAN) {
            const res = await fetch(path);
            if (!res.ok) {
                console.warn('Not found:', path);
                allOk = false;
            }
        }
        expect(allOk).toBe(true);
    });

    it('no CS diacritics in JS files outside comments', async () => {
        const findings = [];
        for (const path of FILES_TO_SCAN) {
            if (!path.endsWith('.js')) continue;
            const res = await fetch(path);
            if (!res.ok) continue;
            const text = stripComments(await res.text());
            const lines = text.split('\n');
            lines.forEach((line, i) => {
                if (CS_CHARS_REGEX.test(line)) {
                    findings.push(`${path}:${i + 1}: ${line.trim().slice(0, 100)}`);
                }
            });
        }
        if (findings.length > 0) {
            console.error('CS diacritics found in JS files:\n' + findings.join('\n'));
        }
        expect(findings.length).toBe(0);
    });

    it('no CS diacritics in HTML files outside data-i18n fallback', async () => {
        const findings = [];
        for (const path of FILES_TO_SCAN) {
            if (!path.endsWith('.html')) continue;
            const res = await fetch(path);
            if (!res.ok) continue;
            let text = stripComments(await res.text());
            text = stripDataI18nFallbackText(text);
            const lines = text.split('\n');
            lines.forEach((line, i) => {
                if (CS_CHARS_REGEX.test(line)) {
                    findings.push(`${path}:${i + 1}: ${line.trim().slice(0, 100)}`);
                }
            });
        }
        if (findings.length > 0) {
            console.error('CS diacritics found in HTML files:\n' + findings.join('\n'));
        }
        expect(findings.length).toBe(0);
    });
});
