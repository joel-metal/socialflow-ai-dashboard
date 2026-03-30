// @ts-check
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const prettierPlugin = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  // Prevent new files being added directly to src/routes/ (except the legacy
  // v1 aggregator which is being migrated — see backend/docs/architecture.md).
  {
    files: ['src/routes/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program',
          message:
            'src/routes/ is frozen. Add new routes inside src/modules/<feature>/routes.ts instead (see backend/docs/architecture.md).',
        },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      ...tsPlugin.configs['recommended'].rules,
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      // Prevent importing the deprecated authMiddleware shim — use authenticate from ./authenticate instead
      'no-restricted-imports': ['error', {
        paths: [{
          name: '../middleware/authMiddleware',
          message: 'Import authenticate/AuthRequest from ../middleware/authenticate instead.',
        }, {
          name: './authMiddleware',
          message: 'Import authenticate/AuthRequest from ./authenticate instead.',
        }],
      }],
    },
  },
  {
    files: ['src/**/*Example.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program',
          message:
            'Example files (*Example.ts) are not allowed in src/. Move them to examples/.',
        },
      ],
    },
  },
];
