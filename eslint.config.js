import globals from 'globals';

export default [
    {
        ignores: [
            'node_modules/**',
            'tests/**',
            'dist/**',
            'build/**',
            '**/*.min.js',
            'assets/js/vendor/**'
        ]
    },
    {
        files: ['assets/js/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                // External libraries
                THREE: 'readonly',
                IFCLoader: 'readonly',
                XLSX: 'readonly',
                // Project globals
                BIMStorage: 'readonly',
                i18n: 'readonly',
                t: 'readonly',
                ErrorHandler: 'readonly',
                translations: 'readonly',
                escapeHtml: 'readonly',
                showError: 'readonly',
                hideError: 'readonly',
                ThemeManager: 'readonly',
                DragDropHandler: 'readonly',
                PerformanceMonitor: 'readonly',
                IFCStreamParser: 'readonly',
                // IDS Editor modules
                idsEditorCore: 'readonly',
                idsEditorModals: 'readonly',
                IDSXMLGenerator: 'readonly',
                IDSExcelParser: 'readonly',
                IDSExcelGenerator: 'readonly',
                IDSExcelTemplate: 'readonly',
                // Storage functions
                initStorageDB: 'readonly',
                // Worker globals
                importScripts: 'readonly',
                // CommonJS (for compatibility checks)
                module: 'readonly',
                // HTML Components
                HTMLComponents: 'readonly'
            }
        },
        rules: {
            'eqeqeq': ['error', 'always'],
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-console': 'off',
            'no-debugger': 'warn',
            'no-var': 'error',
            'prefer-const': 'warn',
            'no-multiple-empty-lines': ['warn', { max: 2 }],
            'no-trailing-spaces': 'warn',
            'semi': ['warn', 'always'],
            'quotes': ['warn', 'single', { avoidEscape: true }],
            'indent': ['warn', 4, { SwitchCase: 1 }],
            'curly': ['warn', 'all'],
            'brace-style': ['warn', '1tbs'],
            'no-undef': 'error',
            'no-redeclare': 'error'
        }
    }
];
