/* ===========================================
   BIM CHECKER - ERROR HANDLER
   Toast notification system
   =========================================== */

class ErrorHandler {
    /**
     * Show a toast notification
     * @param {string} message - The message to display
     * @param {string} type - Type of toast: 'error', 'warning', 'success', 'info'
     * @param {number} duration - Duration in milliseconds (0 = no auto-close)
     */
    static showToast(message, type = 'error', duration = 5000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-icon">${this.getIcon(type)}</div>
            <div class="toast-message">${this.escapeHtml(message)}</div>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        `;

        // Add to container or create one
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        container.appendChild(toast);

        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 10);

        // Auto-close if duration > 0
        if (duration > 0) {
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }
    }

    /**
     * Show error toast
     */
    static error(message, duration = 5000) {
        this.showToast(message, 'error', duration);
    }

    /**
     * Show warning toast
     */
    static warning(message, duration = 5000) {
        this.showToast(message, 'warning', duration);
    }

    /**
     * Show success toast
     */
    static success(message, duration = 5000) {
        this.showToast(message, 'success', duration);
    }

    /**
     * Show info toast
     */
    static info(message, duration = 5000) {
        this.showToast(message, 'info', duration);
    }

    /**
     * Show confirmation dialog with toast-style UI
     * @param {string} message - The confirmation message
     * @param {Function} onConfirm - Callback when confirmed
     * @param {Function} onCancel - Callback when cancelled (optional)
     */
    static confirm(message, onConfirm, onCancel = null) {
        const overlay = document.createElement('div');
        overlay.className = 'toast-confirm-overlay';
        overlay.innerHTML = `
            <div class="toast-confirm-dialog">
                <div class="toast-confirm-icon">❓</div>
                <div class="toast-confirm-message">${this.escapeHtml(message)}</div>
                <div class="toast-confirm-buttons">
                    <button class="toast-btn toast-btn-cancel">${t('error.cancel')}</button>
                    <button class="toast-btn toast-btn-confirm">${t('error.confirm')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const dialog = overlay.querySelector('.toast-confirm-dialog');
        const cancelBtn = overlay.querySelector('.toast-btn-cancel');
        const confirmBtn = overlay.querySelector('.toast-btn-confirm');

        // Trigger animation
        setTimeout(() => {
            overlay.classList.add('show');
            dialog.classList.add('show');
        }, 10);

        const close = () => {
            overlay.classList.remove('show');
            dialog.classList.remove('show');
            setTimeout(() => overlay.remove(), 300);
        };

        cancelBtn.addEventListener('click', () => {
            close();
            if (onCancel) onCancel();
        });

        confirmBtn.addEventListener('click', () => {
            close();
            onConfirm();
        });

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                close();
                if (onCancel) onCancel();
            }
        });
    }

    /**
     * Show prompt dialog with toast-style UI
     * @param {string} message - The prompt message
     * @param {string} defaultValue - Default input value
     * @param {Function} onSubmit - Callback with input value
     * @param {Function} onCancel - Callback when cancelled (optional)
     */
    static prompt(message, defaultValue = '', onSubmit, onCancel = null) {
        const overlay = document.createElement('div');
        overlay.className = 'toast-confirm-overlay';
        overlay.innerHTML = `
            <div class="toast-confirm-dialog">
                <div class="toast-confirm-icon">✏️</div>
                <div class="toast-confirm-message">${this.escapeHtml(message)}</div>
                <input type="text" class="toast-prompt-input" value="${this.escapeHtml(defaultValue)}" autofocus>
                <div class="toast-confirm-buttons">
                    <button class="toast-btn toast-btn-cancel">${t('error.cancel')}</button>
                    <button class="toast-btn toast-btn-confirm">${t('error.confirm')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const dialog = overlay.querySelector('.toast-confirm-dialog');
        const input = overlay.querySelector('.toast-prompt-input');
        const cancelBtn = overlay.querySelector('.toast-btn-cancel');
        const confirmBtn = overlay.querySelector('.toast-btn-confirm');

        // Trigger animation
        setTimeout(() => {
            overlay.classList.add('show');
            dialog.classList.add('show');
            input.focus();
            input.select();
        }, 10);

        const close = () => {
            overlay.classList.remove('show');
            dialog.classList.remove('show');
            setTimeout(() => overlay.remove(), 300);
        };

        const submit = () => {
            const value = input.value.trim();
            if (value) {
                close();
                onSubmit(value);
            }
        };

        cancelBtn.addEventListener('click', () => {
            close();
            if (onCancel) onCancel();
        });

        confirmBtn.addEventListener('click', submit);

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submit();
        });

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                close();
                if (onCancel) onCancel();
            }
        });
    }

    /**
     * Get icon for toast type
     */
    static getIcon(type) {
        const icons = {
            error: '❌',
            warning: '⚠️',
            success: '✅',
            info: 'ℹ️'
        };
        return icons[type] || icons.info;
    }

    /**
     * Escape HTML to prevent XSS
     */
    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Make globally accessible
window.ErrorHandler = ErrorHandler;
