// ESLint flat config (eslint v9)
import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['src/engine/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*'],
              message: 'Engine layer must not import React. Keep engine pure TypeScript.',
            },
            {
              group: ['*/ui/*', '../ui/*', '../../ui/*'],
              message: 'Engine layer must not import from UI layer.',
            },
            {
              group: ['*/state/*', '../state/*', '../../state/*'],
              message: 'Engine layer must not import from state layer.',
            },
            {
              group: ['*/data/*', '../data/*', '../../data/*'],
              message: 'Engine layer must not import from data layer.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
]
