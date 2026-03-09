/**
 * bSDD Autocomplete Dropdown Component
 * Custom autocomplete that replaces native <datalist> for bSDD-enabled fields
 */
class BsddAutocomplete {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.container - Parent element to render into
     * @param {string} options.inputId - ID for the input element
     * @param {string} options.placeholder - Input placeholder text
     * @param {string} options.initialValue - Initial input value
     * @param {Function} options.onSearch - async (query, dictionaryUri) => results[]
     * @param {Function} options.onSelect - (item) => void
     * @param {string} [options.dictionaryFilterId] - ID for dictionary filter select
     */
    constructor(options) {
        this.options = options;
        this.selectedItem = null;
        this.results = [];
        this.highlightIndex = -1;
        this.isOpen = false;
        this.render();
        this.bindEvents();
    }

    render() {
        const container = this.options.container;
        container.classList.add('bsdd-autocomplete-wrapper');

        container.innerHTML = `
            <div class="bsdd-input-row">
                <input type="text"
                       id="${this.options.inputId}"
                       class="bsdd-input"
                       value="${this.options.initialValue || ''}"
                       placeholder="${this.options.placeholder || ''}"
                       autocomplete="off">
                <span class="bsdd-search-icon">🔍</span>
            </div>
            <div class="bsdd-dropdown" id="${this.options.inputId}_dropdown" style="display:none;">
                <div class="bsdd-dropdown-content"></div>
            </div>
        `;

        this.input = container.querySelector('.bsdd-input');
        this.dropdown = container.querySelector('.bsdd-dropdown');
        this.dropdownContent = container.querySelector('.bsdd-dropdown-content');
        this.searchIcon = container.querySelector('.bsdd-search-icon');
    }

    bindEvents() {
        this.input.addEventListener('input', () => this.onInput());
        this.input.addEventListener('keydown', (e) => this.onKeydown(e));
        this.input.addEventListener('focus', () => {
            if (this.results.length > 0) this.showDropdown();
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.options.container.contains(e.target)) {
                this.hideDropdown();
            }
        });
    }

    async onInput() {
        const query = this.input.value.trim();
        if (query.length < 2) {
            this.hideDropdown();
            return;
        }

        this.showLoading();

        try {
            const dictionaryUri = this.getDictionaryFilter();
            this.results = await this.options.onSearch(query, dictionaryUri);
            this.highlightIndex = -1;

            if (this.results.length === 0) {
                this.showNoResults();
            } else {
                this.renderResults();
                this.showDropdown();
            }
        } catch (error) {
            this.showError(error.message);
        }
    }

    getDictionaryFilter() {
        if (this.options.dictionaryFilterId) {
            const select = document.getElementById(this.options.dictionaryFilterId);
            return select ? select.value : null;
        }
        return null;
    }

    renderResults() {
        this.dropdownContent.innerHTML = this.results.map((item, i) => `
            <div class="bsdd-result-item ${i === this.highlightIndex ? 'highlighted' : ''}"
                 data-index="${i}">
                <div class="bsdd-result-name">${this.escapeHtml(item.name)}</div>
                <div class="bsdd-result-meta">
                    ${item.code ? `<span class="bsdd-result-code">${this.escapeHtml(item.code)}</span>` : ''}
                    <span class="bsdd-result-dict">${this.escapeHtml(item.dictionaryName || item.propertySet || '')}</span>
                </div>
            </div>
        `).join('');

        // Bind click events on results
        this.dropdownContent.querySelectorAll('.bsdd-result-item').forEach(el => {
            el.addEventListener('click', () => {
                const index = parseInt(el.dataset.index);
                this.selectItem(index);
            });
        });
    }

    selectItem(index) {
        this.selectedItem = this.results[index];
        this.input.value = this.selectedItem.name;
        this.hideDropdown();
        if (this.options.onSelect) {
            this.options.onSelect(this.selectedItem);
        }
    }

    onKeydown(e) {
        if (!this.isOpen) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.highlightIndex = Math.min(this.highlightIndex + 1, this.results.length - 1);
                this.updateHighlight();
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.highlightIndex = Math.max(this.highlightIndex - 1, 0);
                this.updateHighlight();
                break;
            case 'Enter':
                e.preventDefault();
                if (this.highlightIndex >= 0) {
                    this.selectItem(this.highlightIndex);
                }
                break;
            case 'Escape':
                this.hideDropdown();
                break;
        }
    }

    updateHighlight() {
        this.dropdownContent.querySelectorAll('.bsdd-result-item').forEach((el, i) => {
            el.classList.toggle('highlighted', i === this.highlightIndex);
        });
        const highlighted = this.dropdownContent.querySelector('.highlighted');
        if (highlighted) {
            highlighted.scrollIntoView({ block: 'nearest' });
        }
    }

    showLoading() {
        this.dropdownContent.innerHTML = '<div class="bsdd-loading">Loading...</div>';
        this.showDropdown();
    }

    showNoResults() {
        this.dropdownContent.innerHTML = '<div class="bsdd-no-results">No results found</div>';
        this.showDropdown();
    }

    showError(message) {
        this.dropdownContent.innerHTML = `<div class="bsdd-error">Connection error</div>`;
        this.showDropdown();
    }

    showDropdown() {
        this.dropdown.style.display = 'block';
        this.isOpen = true;
    }

    hideDropdown() {
        this.dropdown.style.display = 'none';
        this.isOpen = false;
    }

    getValue() {
        return this.input.value.trim();
    }

    getSelectedItem() {
        return this.selectedItem;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

window.BsddAutocomplete = BsddAutocomplete;
