/* ===========================================
   BIM CHECKER - THEME MODULE
   Dark/Light mode toggle functionality
   =========================================== */

/**
 * Theme Manager - handles dark/light mode switching
 * Usage: Include this script and call ThemeManager.init() on DOMContentLoaded
 */
const ThemeManager = {
    // Default theme if none saved
    defaultTheme: 'light',

    // Storage key for localStorage
    storageKey: 'theme',

    // CSS attribute name on html element
    themeAttribute: 'data-theme',

    // Element references (set during init)
    toggleButton: null,
    lightIcon: null,
    darkIcon: null,
    htmlElement: null,

    /**
     * Initialize the theme manager
     * @param {Object} options - Configuration options
     * @param {string} options.toggleButtonId - ID of the toggle button (default: 'themeToggle')
     * @param {string} options.lightIconClass - Class of light theme icon (default: 'theme-icon-light')
     * @param {string} options.darkIconClass - Class of dark theme icon (default: 'theme-icon-dark')
     */
    init(options = {}) {
        const toggleButtonId = options.toggleButtonId || 'themeToggle';
        const lightIconClass = options.lightIconClass || 'theme-icon-light';
        const darkIconClass = options.darkIconClass || 'theme-icon-dark';

        this.htmlElement = document.documentElement;
        this.toggleButton = document.getElementById(toggleButtonId);

        if (!this.toggleButton) {
            console.warn('ThemeManager: Toggle button not found with id:', toggleButtonId);
            return;
        }

        this.lightIcon = this.toggleButton.querySelector('.' + lightIconClass);
        this.darkIcon = this.toggleButton.querySelector('.' + darkIconClass);

        // Load saved theme or use default
        const savedTheme = this.getSavedTheme();
        this.setTheme(savedTheme);

        // Add click handler
        this.toggleButton.addEventListener('click', () => this.toggle());
    },

    /**
     * Get currently saved theme from localStorage
     * @returns {string} Theme name ('light' or 'dark')
     */
    getSavedTheme() {
        return localStorage.getItem(this.storageKey) || this.defaultTheme;
    },

    /**
     * Get current active theme
     * @returns {string} Current theme name
     */
    getCurrentTheme() {
        return this.htmlElement.getAttribute(this.themeAttribute) || this.defaultTheme;
    },

    /**
     * Set theme
     * @param {string} theme - Theme name ('light' or 'dark')
     */
    setTheme(theme) {
        this.htmlElement.setAttribute(this.themeAttribute, theme);
        localStorage.setItem(this.storageKey, theme);
        this.updateIcons(theme);

        // Dispatch custom event for other components to react
        window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
    },

    /**
     * Toggle between light and dark theme
     */
    toggle() {
        const currentTheme = this.getCurrentTheme();
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    },

    /**
     * Update icon visibility based on current theme
     * @param {string} theme - Current theme name
     */
    updateIcons(theme) {
        if (!this.lightIcon || !this.darkIcon) return;

        if (theme === 'light') {
            // In light mode, show moon icon (to switch to dark)
            this.lightIcon.style.display = 'none';
            this.darkIcon.style.display = 'block';
        } else {
            // In dark mode, show sun icon (to switch to light)
            this.lightIcon.style.display = 'block';
            this.darkIcon.style.display = 'none';
        }
    },

    /**
     * Check if dark mode is active
     * @returns {boolean} True if dark mode is active
     */
    isDarkMode() {
        return this.getCurrentTheme() === 'dark';
    },

    /**
     * Check if light mode is active
     * @returns {boolean} True if light mode is active
     */
    isLightMode() {
        return this.getCurrentTheme() === 'light';
    }
};

// Auto-initialize on DOMContentLoaded if toggle button exists
document.addEventListener('DOMContentLoaded', () => {
    // Only auto-init if the toggle button exists
    if (document.getElementById('themeToggle')) {
        ThemeManager.init();
    }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ThemeManager;
}
