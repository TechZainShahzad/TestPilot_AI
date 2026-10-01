// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    name: 'testpilot/ignores',
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/blob-report/**',
      '**/allure-results/**',
      '**/allure-report/**',
      '**/orchestrator/runs/**',
      // Committed sample output — it is an artifact, not source we maintain.
      'examples/**',
    ],
  },

  eslint.configs.recommended,

  {
    // Type-aware rules must be scoped to files that a tsconfig actually
    // covers. Applied globally they crash on `eslint.config.mjs` itself,
    // which is not part of any project.
    name: 'testpilot/typescript',
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Unused args are fine when they document a signature, as long as they
      // are explicitly marked.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Type-only imports must say so — `verbatimModuleSyntax` depends on it.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // Floating promises are the single most common source of flaky
      // Playwright tests: a missing `await` on an action silently passes.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/await-thenable': 'error',

      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',

      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-param-reassign': 'error',
    },
  },

  {
    name: 'testpilot/playwright-tests',
    files: ['framework/tests/**/*.ts'],
    extends: [playwright.configs['flat/recommended']],
    rules: {
      // Hard waits are the thing this project exists to not do. Fail the
      // build, do not warn.
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-element-handle': 'error',
      'playwright/no-eval': 'error',
      'playwright/no-force-option': 'error',
      'playwright/no-page-pause': 'error',
      'playwright/no-skipped-test': 'error',
      'playwright/no-conditional-in-test': 'error',
      'playwright/no-conditional-expect': 'error',
      'playwright/expect-expect': 'error',
      'playwright/require-top-level-describe': 'error',
      'playwright/prefer-web-first-assertions': 'error',
      'playwright/no-useless-await': 'error',
      'playwright/valid-expect': 'error',
    },
  },

  {
    // The orchestrator is a CLI. Its whole job is to talk to the operator, so
    // it owns a logger that writes to stdout.
    name: 'testpilot/orchestrator-cli',
    files: ['orchestrator/src/util/logger.ts', 'orchestrator/src/cli.ts'],
    rules: { 'no-console': 'off' },
  },

  {
    name: 'testpilot/config-files',
    files: ['**/*.config.ts', '**/*.config.mjs', 'eslint.config.mjs'],
    rules: { '@typescript-eslint/no-unsafe-assignment': 'off' },
  },

  // Must stay last: turns off every stylistic rule Prettier owns.
  prettier
);
