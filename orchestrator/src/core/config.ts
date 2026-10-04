/**
 * Orchestrator configuration: environment, provider credentials, and the
 * guardrails that bound a run.
 *
 * The limits here are not decoration. An agent loop that writes code, runs it,
 * reads the failure and tries again is unbounded by construction, so cost,
 * attempts, and wall-clock all need a ceiling that is configured rather than
 * hard-coded.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, '../../..');
export const ORCHESTRATOR_ROOT = resolve(here, '../..');
export const FRAMEWORK_ROOT = resolve(REPO_ROOT, 'framework');
export const RUNS_ROOT = resolve(ORCHESTRATOR_ROOT, 'runs');

const dotenvPath = resolve(REPO_ROOT, '.env');
if (existsSync(dotenvPath)) {
  loadDotenv({ path: dotenvPath, quiet: true });
}

const integerish = (fallback: number): z.ZodType<number> =>
  z
    .string()
    .optional()
    .transform((raw) => (raw === undefined || raw.trim() === '' ? fallback : Number(raw)))
    .pipe(z.number().int().positive());

const numberish = (fallback: number): z.ZodType<number> =>
  z
    .string()
    .optional()
    .transform((raw) => (raw === undefined || raw.trim() === '' ? fallback : Number(raw)))
    .pipe(z.number().positive());

const optionalString = z
  .string()
  .optional()
  .transform((raw) => (raw === undefined || raw.trim() === '' ? undefined : raw.trim()));

export const PROVIDERS = ['gemini', 'groq', 'claude-code'] as const;
export type ProviderName = (typeof PROVIDERS)[number];

const configSchema = z.object({
  LLM_PROVIDER: z.enum(PROVIDERS).default('gemini'),

  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GROQ_API_KEY: optionalString,
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
  // No API key: authenticates via the locally-installed `claude` CLI's own
  // session (a Claude subscription), not a key stored in .env. Local-only
  // — see "Claude Code CLI, confirmed live" in docs/agents.md.
  CLAUDE_CODE_MODEL: optionalString,

  MAX_HEAL_ATTEMPTS: integerish(3),
  MAX_REVIEW_ROUNDS: integerish(2),
  MAX_TOKENS_PER_RUN: integerish(400_000),
  MAX_USD_PER_RUN: numberish(1),
  AGENT_STEP_TIMEOUT_MS: integerish(180_000),

  GITHUB_TOKEN: optionalString,
  GITHUB_REPO: z.string().default('TechZainShahzad/TestPilot_AI'),
  GITHUB_BASE_BRANCH: z.string().default('main'),

  JIRA_BASE_URL: optionalString,
  JIRA_EMAIL: optionalString,
  JIRA_API_TOKEN: optionalString,

  BASE_URL: z.url().default('https://www.saucedemo.com'),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(
    `Invalid orchestrator configuration — check your .env against .env.example:\n${issues}`
  );
}

const raw = parsed.data;

export const config = {
  provider: raw.LLM_PROVIDER,

  gemini: {
    apiKey: raw.GEMINI_API_KEY,
    model: raw.GEMINI_MODEL,
  },
  groq: {
    apiKey: raw.GROQ_API_KEY,
    model: raw.GROQ_MODEL,
  },
  claudeCode: {
    model: raw.CLAUDE_CODE_MODEL,
  },

  limits: {
    maxHealAttempts: raw.MAX_HEAL_ATTEMPTS,
    maxReviewRounds: raw.MAX_REVIEW_ROUNDS,
    maxTokensPerRun: raw.MAX_TOKENS_PER_RUN,
    maxUsdPerRun: raw.MAX_USD_PER_RUN,
    agentStepTimeoutMs: raw.AGENT_STEP_TIMEOUT_MS,
  },

  github: {
    token: raw.GITHUB_TOKEN,
    repo: raw.GITHUB_REPO,
    baseBranch: raw.GITHUB_BASE_BRANCH,
  },

  jira: {
    baseUrl: raw.JIRA_BASE_URL,
    email: raw.JIRA_EMAIL,
    apiToken: raw.JIRA_API_TOKEN,
  },

  defaultTargetUrl: raw.BASE_URL,

  paths: {
    repoRoot: REPO_ROOT,
    frameworkRoot: FRAMEWORK_ROOT,
    runsRoot: RUNS_ROOT,
  },
} as const;

export type OrchestratorConfig = typeof config;

/**
 * The API key for whichever provider is selected, or `undefined` if unset.
 * `claude-code` has no key to check here — it authenticates via the local
 * CLI's own session, verified separately by `cli.ts`'s preflight as a
 * liveness check (`claude --version`), not a key lookup. It still returns
 * a non-undefined sentinel so the generic "every provider has a key" gate
 * in `providers/index.ts`'s `createProvider()` doesn't misfire for it.
 */
export function activeApiKey(provider: ProviderName = config.provider): string | undefined {
  switch (provider) {
    case 'gemini':
      return config.gemini.apiKey;
    case 'groq':
      return config.groq.apiKey;
    case 'claude-code':
      return 'local-cli';
  }
}

/** Human-readable name of the env var a missing key should be set in. */
export function apiKeyEnvVar(provider: ProviderName = config.provider): string {
  switch (provider) {
    case 'gemini':
      return 'GEMINI_API_KEY';
    case 'groq':
      return 'GROQ_API_KEY';
    case 'claude-code':
      return '(none — run `claude` interactively once to authenticate)';
  }
}

/**
 * Jira credentials, only when all three are present. A fixed-user-style
 * half-filled config (e.g. a base URL with no token) would otherwise
 * produce a confusing fetch failure rather than a clear "you haven't set
 * this up" message at startup.
 */
export function jiraCredentials():
  { baseUrl: string; email: string; apiToken: string } | undefined {
  const { baseUrl, email, apiToken } = config.jira;
  if (baseUrl === undefined || email === undefined || apiToken === undefined) {
    return undefined;
  }
  return { baseUrl, email, apiToken };
}
