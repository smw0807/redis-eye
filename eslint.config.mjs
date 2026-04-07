import js from '@eslint/js';
import ts from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default ts.config(
  {
    ignores: ['node_modules/**', 'app/node_modules/**', 'dist/**', 'app/dist/**'],
  },

  // Server + CLI (CommonJS Node.js)
  {
    files: ['server/**/*.js', 'bin/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },

  // Vue 3 + TypeScript (app/)
  {
    files: ['app/src/**/*.ts', 'app/src/**/*.vue', 'app/vite.config.ts'],
    extends: [
      js.configs.recommended,
      ...ts.configs.recommended,
      ...vue.configs['flat/recommended'],
    ],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Prettier는 항상 마지막 (포매팅 관련 규칙 비활성화)
  prettier
);
