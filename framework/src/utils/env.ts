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
  BASE_URL: z.url().default('https://parabank.parasoft.com'),

  USE_FIXED_USER: booleanish(false),
  FIXED_USERNAME: z.string().optional(),
  FIXED_PASSWORD: z.string().optional(),
  DEFAULT_PASSWORD: z.string().min(1).default('Passw0rd!23'),

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

/**
 * A fixed user is only honoured when it is actually complete. Half-filled
 * credentials would otherwise produce a confusing login failure rather than
 * silently falling back to the per-run registration path.
 */
const fixedUser =
  raw.USE_FIXED_USER && raw.FIXED_USERNAME && raw.FIXED_PASSWORD
    ? { username: raw.FIXED_USERNAME, password: raw.FIXED_PASSWORD }
    : undefined;

if (raw.USE_FIXED_USER && !fixedUser) {
  throw new Error(
    'USE_FIXED_USER=true requires both FIXED_USERNAME and FIXED_PASSWORD to be set in .env.'
  );
}

const baseUrl = raw.BASE_URL.replace(/\/+$/, '');

export const env = {
  /** Which environment block is active. */
  testEnv: raw.TEST_ENV,
  /** Is this a CI run? Drives retries, workers, and artifact retention. */
  isCI: raw.CI,

  /** Origin of the app under test, never with a trailing slash. */
  baseUrl,
  /** ParaBank serves the whole app under a `/parabank` context path. */
  appUrl: `${baseUrl}/parabank`,
  /** Root of the public REST API (`/services/bank/...`). */
  apiUrl: `${baseUrl}/parabank/services`,
  /**
   * Session-authenticated JSON API. ParaBank exposes the same resources twice:
   * `/services` (mostly XML, partly unauthenticated) and `/services_proxy`
   * (JSON, requires the JSESSIONID cookie from a UI login).
   */
  apiProxyUrl: `${baseUrl}/parabank/services_proxy/bank`,

  /** When set, reuse this pre-registered customer instead of making one. */
  fixedUser,
  /** Password assigned to every generated customer. */
  defaultPassword: raw.DEFAULT_PASSWORD,

  headless: raw.HEADLESS,
  slowMo: raw.SLOW_MO,
  actionTimeout: raw.ACTION_TIMEOUT,
  navigationTimeout: raw.NAVIGATION_TIMEOUT,
  workers: raw.WORKERS,
  retries: raw.RETRIES,
} as const;

export type Env = typeof env;
