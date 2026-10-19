import js from '@eslint/js';
import globals from 'globals';

export default [
    {
        files: ['**/*.user.js'],
        languageOptions: { sourceType: 'script', globals: globals.browser },
        rules: js.configs.recommended.rules
    },
    {
        files: ['test/*.cjs'],
        languageOptions: { globals: globals.node },
        rules: js.configs.recommended.rules
    }
];
