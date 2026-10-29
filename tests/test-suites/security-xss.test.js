/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */

describe('security — hostile values stay text', () => {
    const payload = '\"><img src=x onerror="window.__bimXssExecuted=true"><script>window.__bimXssExecuted=true<\/script>';

    beforeEach(() => { window.__bimXssExecuted = false; });

    it('escapes markup and quotes for text and attribute contexts', () => {
        const escapedText = BIMSafeHTML.escapeHtml(payload);
        const escapedAttr = BIMSafeHTML.escapeAttr(payload);
        const host = document.createElement('div');
        host.innerHTML = `<input value="${escapedAttr}"><span>${escapedText}</span>`;
        expect(host.querySelector('input').value).toBe(payload);
        expect(host.querySelector('span').textContent).toBe(payload);
        expect(host.querySelector('img')).toBe(null);
        expect(host.querySelector('script')).toBe(null);
        expect(window.__bimXssExecuted).toBe(false);
    });

    it('renders hostile bSDD values without creating executable elements', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const autocomplete = new BsddAutocomplete({
            container: host,
            inputId: `x${payload}`,
            placeholder: payload,
            initialValue: payload,
            onSearch: async () => [],
            onSelect: () => {}
        });
        autocomplete.results = [{ name: payload, code: payload, dictionaryName: payload }];
        autocomplete.renderResults();
        expect(autocomplete.input.value).toBe(payload);
        expect(host.querySelectorAll('img, script').length).toBe(0);
        expect(host.querySelector('.bsdd-result-name').textContent).toBe(payload);
        expect(window.__bimXssExecuted).toBe(false);
        host.remove();
    });
});
