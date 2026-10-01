import { defineConfig, devices } from '@playwright/test';

import { env } from './src/utils/env.js';

/**
 * Playwright configuration for the SauceDemo suite.
 *
 * Project layout and the reasoning behind it:
 *
 *   setup    — logs in as the configured fixed demo account and writes
 *              `storageState` once, so the UI projects never pay for a
 *              login. SauceDemo has no registration flow, so unlike a
 *              per-run-registered identity there is one fixed account
 *              (or one of its deliberately-broken variants) to start from.
 *   ui       — browser tests, depending on `setup` and reusing its session.
 *   ui-guest — the slice of UI tests that must start unauthenticated
 *              (login variants, locked-out account), so they deliberately
 *              opt out of the stored session.
 *
 * There is no `api` project: SauceDemo has no backend REST API (confirmed
 * live — zero XHR/fetch calls across a full login→checkout flow), so the
 * original brief's API-layer requirement does not carry over to this
 * target. See "Why there's no API layer" in docs/architecture.md.
 *
 * Tags (`@smoke`, `@regression`, `@guest`) are applied in the specs and
 * selected with `--grep`, which keeps suite membership visible in the test
 * title rather than hidden in config.
 */
/**
 * Worker count. An explicit `WORKERS` wins; CI is pinned to 2 because the
 * target is a shared public demo and hammering it causes failures that have
 * nothing to do with the code under test. Locally, leaving this unset lets
 * Playwright pick based on the machine — so the key is omitted entirely
 * rather than set to `undefined`, which `exactOptionalPropertyTypes` rejects.
 */
const workers = env.workers ?? (env.isCI ? 2 : undefined);

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',

  /* A spec that takes longer than a minute against this app is stuck. */
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },

  /* Fail the build if someone commits a focused test. */
  forbidOnly: env.isCI,

  fullyParallel: true,
  ...(workers !== undefined && { workers }),
  retries: env.isCI ? 2 : env.retries,

  /* Catch accidental `.only`-style narrowing and silent flake in CI. */
  maxFailures: env.isCI ? 20 : 0,

  reporter: env.isCI
    ? [
        ['list'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['junit', { outputFile: 'test-results/junit.xml' }],
        ['blob', { outputDir: 'blob-report' }],
        [
          'allure-playwright',
          {
            resultsDir: 'allure-results',
            detail: true,
            environmentInfo: {
              base_url: env.baseUrl,
              environment: env.testEnv,
              node: process.version,
              os: `${process.platform} ${process.arch}`,
            },
          },
        ],
      ]
    : [
        ['list'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['allure-playwright', { resultsDir: 'allure-results', detail: true }],
      ],

  use: {
    baseURL: env.appUrl,

    actionTimeout: env.actionTimeout,
    navigationTimeout: env.navigationTimeout,

    /* Artefacts: cheap on success, complete on failure. */
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    testIdAttribute: 'data-test',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        headless: env.headless,
        launchOptions: { slowMo: env.slowMo },
      },
    },

    {
      name: 'ui',
      testDir: './tests/ui',
      testIgnore: /.*\.guest\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        headless: env.headless,
        launchOptions: { slowMo: env.slowMo },
        storageState: '.auth/user.json',
      },
    },

    {
      name: 'ui-guest',
      testDir: './tests/ui',
      testMatch: /.*\.guest\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        headless: env.headless,
        launchOptions: { slowMo: env.slowMo },
        storageState: { cookies: [], origins: [] },
      },
    },
  ],
});
