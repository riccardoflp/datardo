// ESLint for Datardo: typescript-eslint's strict type-checked rules, warnings as errors (R12.2), and the rules of
// code-rules.md that a linter can check, each named beside the setting that enforces it.
import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const pureFolders = ['src/shared/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}'];

export default tseslint.config(
  { ignores: ['out/**', 'release/**', 'node_modules/**', 'test-results/**', '.data/**', 'coverage/**', '.claude/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['*.mjs', 'scripts/*.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    rules: {
      // R6.1, R6.2: size and shape.
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', 4],
      'max-depth': ['error', 3],
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      // R6.4: a switch over a union handles every case.
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      // R4.6: nothing is caught and dropped.
      'no-empty': ['error', { allowEmptyCatch: false }],
      '@typescript-eslint/no-floating-promises': 'error',
      // R9.1: what the user types is parsed, never evaluated.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // R8.1: every exported item has a doc comment.
    files: ['src/**/*.{ts,tsx}'],
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: { FunctionDeclaration: true, ClassDeclaration: true, ArrowFunctionExpression: false },
          contexts: [
            'TSInterfaceDeclaration',
            'TSTypeAliasDeclaration',
            'ExportNamedDeclaration > VariableDeclaration',
          ],
        },
      ],
    },
  },
  {
    // R1.5, R3.1: shared and features run anywhere and read no clock, no randomness, no environment.
    files: pureFolders,
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'document',
          'process',
          'require',
          'Buffer',
          'setTimeout',
          'setInterval',
          'fetch',
          'navigator',
        ].map((name) => ({ name, message: 'src/shared and src/features are pure (R1.5).' })),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'electron', 'react', 'react-dom', 'mongodb', 'redis', 'ssh2', 'fs', 'path'],
              message: 'src/shared and src/features are pure (R1.5).',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'The time is context.now (R3.1).',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'The time is context.now (R3.1).',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'A seed is an argument (R3.1).',
        },
      ],
    },
  },
  {
    // R15.4: only src/storage writes to the disk; the window process never waits (R10.6).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/storage/**', 'src/main/**', 'src/engines/**', 'src/runner/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:fs', 'node:fs/*', 'fs', 'fs/*'], message: 'Only src/storage writes to the disk (R15.4).' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // R14.5: no component sets HTML from a value.
      'react/no-danger': 'error',
      // R6.1: a component has at most 120 lines.
      'max-lines-per-function': ['error', { max: 120, skipBlankLines: true, skipComments: true }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'electron', 'mongodb', 'redis', 'ssh2'],
              message: 'The window process reaches these only through the bridge.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/preload/**/*.ts'],
    rules: {
      // R10.6: the window process never waits.
      'no-restricted-properties': ['error', { object: 'ipcRenderer', property: 'sendSync', message: 'R10.6' }],
    },
  },
  {
    files: [
      'test/**/*.{ts,tsx}',
      '*.config.{ts,mjs}',
      'electron.vite.config.ts',
      'scripts/**/*.mjs',
      'eslint.config.mjs',
    ],
    rules: {
      'max-lines-per-function': 'off',
      'max-lines': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.mjs', '.dependency-cruiser.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
);
