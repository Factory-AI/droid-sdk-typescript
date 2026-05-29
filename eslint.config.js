import eslint from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import eslintComments from 'eslint-plugin-eslint-comments';
import importPlugin from 'eslint-plugin-import';
import noBarrelFiles from 'eslint-plugin-no-barrel-files';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

import factoryRules from './eslint-rules/index.cjs';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'examples/**/*.ts'],
    plugins: {
      'unused-imports': unusedImports,
      import: importPlugin,
      'no-barrel-files': noBarrelFiles,
      'eslint-comments': eslintComments,
      local: factoryRules,
    },
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.examples.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'never' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-empty-object-type': 'error',
      '@typescript-eslint/no-require-imports': 'error',
      'no-barrel-files/no-barrel-files': 'error',
      'import/no-default-export': 'error',
      'import/named': 'error',
      'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
      'eslint-comments/no-unused-disable': 'error',
      'no-void': ['error', { allowAsStatement: true }],
      'default-case': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-param-reassign': ['error', { props: false }],
      'no-promise-executor-return': 'error',
      'prefer-promise-reject-errors': 'error',
      'prefer-arrow-callback': ['error', { allowNamedFunctions: true }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ForInStatement',
          message:
            'for..in loops iterate over the entire prototype chain, which is virtually never what you want. Use Object.{keys,values,entries}, and iterate over the resulting array.',
        },
        {
          selector: 'LabeledStatement',
          message:
            'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.',
        },
        {
          selector: 'WithStatement',
          message:
            '`with` is disallowed in strict mode because it makes code impossible to predict and optimize.',
        },
        {
          selector: 'ExportAllDeclaration',
          message:
            "Export all doesn't work well if imported in ESM due to how they are transpiled, and they can also lead to unexpected exposure of internal methods.",
        },
      ],
      'unused-imports/no-unused-imports': 'error',
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          pathGroups: [
            {
              pattern: '@factory/droid-sdk',
              group: 'external',
              position: 'before',
            },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-cycle': 'error',
      'import/extensions': ['error', 'ignorePackages', { js: 'always', ts: 'never' }],
      'no-console': 'error',
      'local/no-shell-injection': 'error',
      'local/no-unsafe-json-parse': 'error',
      eqeqeq: ['error', 'smart'],
      'no-throw-literal': 'error',
      'array-callback-return': 'error',
      'no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-expressions': 'error',
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
    },
  },
  {
    files: ['tests/**/*.ts'],
    plugins: {
      vitest,
      local: factoryRules,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/consistent-type-assertions': 'off',
      'no-console': 'off',
      'local/vi-mock-absolute-paths': 'error',
      'local/no-unstable-mock-module': 'error',
      'local/vi-mock-import-actual': 'error',
      'vitest/expect-expect': [
        'error',
        { assertFunctionNames: ['expect', 'expect*', 'assert*'] },
      ],
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
    },
  },
  {
    files: ['examples/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': 'off',
      'no-console': 'off',
    },
  },
  {
    // Dedicated public-API barrels: their sole purpose is re-exporting the
    // package surface, so the no-barrel-files rule does not apply.
    files: [
      'src/index.ts',
      'src/schemas/index.ts',
      'src/daemon/index.ts',
    ],
    rules: {
      'no-barrel-files/no-barrel-files': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.config.*'],
  }
);
