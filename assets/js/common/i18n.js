/**
 * BIM Checker - Internationalization (i18n)
 * Language switching and translation management
 */

class I18n {
  constructor() {
    // Load saved preference or detect system language
    this.currentLang = this.detectLanguage();
    this.translations = window.translations || {};

    // Initialize when page is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  /**
   * Detect language (localStorage > browser > default)
   */
  detectLanguage() {
    // 1. Try localStorage
    const saved = localStorage.getItem('bim_checker_language');
    if (saved && (saved === 'cs' || saved === 'en')) {
      return saved;
    }

    // 2. Detect from browser
    const browserLang = navigator.language || navigator.userLanguage;
    if (browserLang && browserLang.startsWith('cs')) {
      return 'cs';
    }

    // 3. Default to Czech
    return 'cs';
  }

  /**
   * Initialize - set language and attach event listeners
   */
  init() {
    this.updatePage();
    this.attachListeners();
    this.updateActiveButton();
  }

  /**
   * Get translation by key
   * @param {string} key - Translation key (e.g., 'app.title')
   * @returns {string} Translated text
   */
  t(key) {
    // Handle undefined, null, or non-string keys
    if (key === undefined || key === null || typeof key !== 'string') {
      console.warn(`Translation missing for key: ${key} (${this.currentLang})`);
      return String(key || '');
    }

    const translation = this.translations[this.currentLang]?.[key];
    if (!translation) {
      console.warn(`Translation missing for key: ${key} (${this.currentLang})`);
      return key;
    }
    return translation;
  }

  /**
   * Change language
   * @param {string} lang - 'cs' or 'en'
   */
  setLanguage(lang) {
    if (lang !== 'cs' && lang !== 'en') {
      console.error('Invalid language:', lang);
      return;
    }

    this.currentLang = lang;
    localStorage.setItem('bim_checker_language', lang);
    this.updatePage();
    this.updateActiveButton();

    // Trigger custom event so pages can update dynamic content
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
  }

  /**
   * Update all texts on the page
   */
  updatePage() {
    // 1. Elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translation = this.t(key);

      // Special handling for elements with icons
      if (el.innerHTML.includes('🇨🇿') || el.innerHTML.includes('🇬🇧') ||
          el.innerHTML.includes('📦') || el.innerHTML.includes('📁') ||
          el.innerHTML.includes('📋') || el.innerHTML.includes('🔍') ||
          el.innerHTML.includes('✏️') || el.innerHTML.includes('⬆️') ||
          el.innerHTML.includes('⬇️') || el.innerHTML.includes('☑️') ||
          el.innerHTML.includes('☐') || el.innerHTML.includes('🌳') ||
          el.innerHTML.includes('⚙️') || el.innerHTML.includes('✓') ||
          el.innerHTML.includes('➕') || el.innerHTML.includes('🔄') ||
          el.innerHTML.includes('💾')) {
        // Keep the icon, replace only text
        const iconMatch = el.innerHTML.match(/^([^\w\s]+)\s*/);
        if (iconMatch) {
          el.innerHTML = iconMatch[1] + ' ' + translation;
        } else {
          el.textContent = translation;
        }
      } else {
        el.textContent = translation;
      }
    });

    // 2. Placeholders (input fields)
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = this.t(key);
    });

    // 3. Title attributes (tooltips)
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      el.title = this.t(key);
    });

    // 4. Row selector options (e.g., "500 rows")
    document.querySelectorAll('[data-i18n-rows]').forEach(el => {
      const key = el.getAttribute('data-i18n-rows');
      const value = el.value || el.getAttribute('value');
      el.textContent = `${value} ${this.t(key)}`;
    });

    // 5. HTML lang attribute
    document.documentElement.lang = this.currentLang;
  }

  /**
   * Highlight active button
   */
  updateActiveButton() {
    document.querySelectorAll('.lang-btn').forEach(btn => {
      const btnLang = btn.getAttribute('data-lang');
      if (btnLang === this.currentLang) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  /**
   * Attach event listeners to buttons
   */
  attachListeners() {
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.getAttribute('data-lang');
        this.setLanguage(lang);
      });
    });
  }

  /**
   * Get current language
   */
  getCurrentLanguage() {
    return this.currentLang;
  }
}

// Create global instance
const i18n = new I18n();

// Make globally accessible
if (typeof window !== 'undefined') {
  window.i18n = i18n;

  // Also expose a simple t() function for easier use
  window.t = function(key) {
    return i18n.t(key);
  };
}
