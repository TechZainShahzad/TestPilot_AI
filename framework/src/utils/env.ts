/**
 * Typed, validated environment configuration.
 *
 * Every knob the suite reads lives here, is parsed exactly once, and is
 * validated with Zod so a typo in `.env` fails at startup with a readable
 * message instead of surfacing as a mystery timeout halfway through a run.
 * Specs and page objects never touch `process.env` directly.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
/** Repository root — two levels above `framework/src/utils`. */
export const REPO_ROOT = resolve(here, '../../..');
export const FRAMEWORK_ROOT = resolve(here, '../..');

// A missing .env is normal and fine: every value below has a default, so a
// fresh clone runs with zero setup. CI never writes one.
const dotenvPath = resolve(REPO_ROOT, '.env');
if (existsSync(dotenvPath)) {
  loadDotenv({ path: dotenvPath, quiet: true });
}

/** Coerce the handful of strings people actually write for a boolean. */
const booleanish = (fallback: boolean): z.ZodType<boolean> =>
  z
    .string()
    .optional()
    .transform((raw) => {
      if (raw === undefined || raw.trim() === '') return fallback;
      return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
    });

const integerish = (fallback: number): z.ZodType<number> =>
  z
    .string()
    .optional()
    .transform((raw) => (raw === undefined || raw.trim() === '' ? fallback : Number(raw)))
    .pipe(z.number().int().nonnegative());

/** `WORKERS=` (blank) must mean "let Playwright decide", not "zero workers". */
const optionalInteger = z
  .string()
  .optional()
  .transform((raw) => (raw === undefined || raw.trim() === '' ? undefined : Number(raw)))
  .pipe(z.number().int().positive().optional());

const envSchema = z.object({
  TEST_ENV: z.enum(['demo', 'local']).default('demo'),
  BASE_URL: z.url().default('https://www.saucedemo.com'),

  SAUCE_USERNAME: z.string().min(1).default('standard_user'),
  SAUCE_PASSWORD: z.string().min(1).default('secret_sauce'),

  HEADLESS: booleanish(true),
  SLOW_MO: integerish(0),
  ACTION_TIMEOUT: integerish(15_000),
  NAVIGATION_TIMEOUT: integerish(45_000),
  WORKERS: optionalInteger,
  RETRIES: integerish(0),

  CI: booleanish(false),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(
    `Invalid environment configuration — check your .env against .env.example:\n${issues}`
  );
}

const raw = parsed.data;

const baseUrl = raw.BASE_URL.replace(/\/+$/, '');

export const env = {
  /** Which environment block is active. */
  testEnv: raw.TEST_ENV,
  /** Is this a CI run? Drives retries, workers, and artifact retention. */
  isCI: raw.CI,

  /** Origin of the app under test, never with a trailing slash. SauceDemo serves at root. */
  baseUrl,
  appUrl: baseUrl,

  /** SauceDemo has no registration — every run authenticates as one of its fixed demo accounts. */
  sauceUsername: raw.SAUCE_USERNAME,
  saucePassword: raw.SAUCE_PASSWORD,

  headless: raw.HEADLESS,
  slowMo: raw.SLOW_MO,
  actionTimeout: raw.ACTION_TIMEOUT,
  navigationTimeout: raw.NAVIGATION_TIMEOUT,
  workers: raw.WORKERS,
  retries: raw.RETRIES,
} as const;

export type Env = typeof env;
