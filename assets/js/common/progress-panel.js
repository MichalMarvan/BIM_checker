/* ===========================================
   BIM CHECKER - PROGRESS PANEL
   UI component for validation progress display
   =========================================== */

class ProgressPanel {
    /**
     * Create a progress panel
     * @param {HTMLElement} container - Container element
     * @param {Object} options
     */
    constructor(container, options = {}) {
        this.container = container;
        this.options = options;
        this.expanded = false;
        this.onCancel = options.onCancel || (() => {});

        this._render();
    }

    /**
     * Render the panel HTML
     * @private
     */
    _render() {
        this.container.innerHTML = `
            <div class="validation-progress">
                <div class="validation-progress__header">
                    <span class="validation-progress__title">Validating...</span>
                    <span class="validation-progress__percent">0%</span>
                </div>
                <div class="validation-progress__bar">
                    <div class="validation-progress__fill" style="width: 0%"></div>
                </div>
                <button class="validation-progress__toggle">
                    <span class="toggle-icon">▼</span> Details
                </button>
                <div class="validation-progress__details">
                    <div class="validation-progress__files"></div>
                    <div class="validation-progress__stats"></div>
                </div>
                <button class="validation-progress__cancel">Cancel</button>
            </div>
        `;

        // Cache elements
        this.elements = {
            title: this.container.querySelector('.validation-progress__title'),
            percent: this.container.querySelector('.validation-progress__percent'),
            fill: this.container.querySelector('.validation-progress__fill'),
            toggle: this.container.querySelector('.validation-progress__toggle'),
            details: this.container.querySelector('.validation-progress__details'),
            files: this.container.querySelector('.validation-progress__files'),
            stats: this.container.querySelector('.validation-progress__stats'),
            cancel: this.container.querySelector('.validation-progress__cancel')
        };

        // Event listeners
        this.elements.toggle.addEventListener('click', () => this._toggleDetails());
        this.elements.cancel.addEventListener('click', () => this.onCancel());
    }

    /**
     * Toggle details visibility
     * @private
     */
    _toggleDetails() {
        this.expanded = !this.expanded;
        this.elements.details.classList.toggle('expanded', this.expanded);
        this.elements.toggle.querySelector('.toggle-icon').textContent =
            this.expanded ? '▲' : '▼';
    }

    /**
     * Update progress display
     * @param {Object} progress
     */
    update(progress) {
        const percent = Math.round(progress.overall || 0);

        // Update header
        this.elements.percent.textContent = `${percent}%`;
        this.elements.fill.style.width = `${percent}%`;

        // Update phase title
        const phaseText = {
            'starting': 'Starting...',
            'parsing': 'Parsing files...',
            'validating': 'Validating...',
            'complete': 'Complete'
        };
        this.elements.title.textContent = phaseText[progress.phase] || 'Processing...';

        // Update file details
        if (progress.files) {
            this._updateFileList(progress.files);
        }
    }

    /**
     * Update file list in details
     * @private
     */
    _updateFileList(files) {
        const filesHtml = Object.entries(files).map(([id, file]) => {
            const percent = Math.round(file.percent || 0);
            const statusText = this._getStatusText(file);
            const icon = percent >= 100 ? '✓' : '📄';

            return `
                <div class="validation-progress__file">
                    <span class="validation-progress__file-icon">${icon}</span>
                    <div class="validation-progress__file-info">
                        <div class="validation-progress__file-name">${this._escapeHtml(file.name)}</div>
                        <div class="validation-progress__file-status">${statusText}</div>
                    </div>
                    <div class="validation-progress__file-bar">
                        <div class="validation-progress__file-fill" style="width: ${percent}%"></div>
                    </div>
                    <span class="validation-progress__file-percent">${percent}%</span>
                </div>
            `;
        }).join('');

        this.elements.files.innerHTML = filesHtml;
    }

    /**
     * Get status text for file
     * @private
     */
    _getStatusText(file) {
        if (file.phase === 'complete') {
            return '✓ Complete';
        }
        if (file.phase === 'parsing') {
            return 'Parsing...';
        }
        if (file.phase === 'validating') {
            if (file.currentSpec) {
                return `Validating: ${file.currentSpec}`;
            }
            if (file.entityCount) {
                return `${file.entityCount.toLocaleString()} entities`;
            }
            return 'Validating...';
        }
        return file.phase || 'Processing...';
    }

    /**
     * Update stats display
     * @param {Object} stats
     */
    updateStats(stats) {
        this.elements.stats.innerHTML = `
            <span>⚡ Workers: ${stats.activeWorkers || 0}/${stats.totalWorkers || 0}</span>
            <span>📊 Memory: ~${stats.memoryMB || 0} MB</span>
        `;
    }

    /**
     * Show the panel
     */
    show() {
        this.container.style.display = 'block';
    }

    /**
     * Hide the panel
     */
    hide() {
        this.container.style.display = 'none';
    }

    /**
     * Show completion state
     * @param {boolean} success
     */
    complete(success = true) {
        this.elements.title.textContent = success ? 'Validation Complete' : 'Validation Failed';
        this.elements.percent.textContent = '100%';
        this.elements.fill.style.width = '100%';
        this.elements.cancel.style.display = 'none';
    }

    /**
     * Escape HTML
     * @private
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Destroy the panel
     */
    destroy() {
        this.container.innerHTML = '';
    }
}

// Export for browser
if (typeof window !== 'undefined') {
    window.ProgressPanel = ProgressPanel;
}
