#!/usr/bin/env node
/**
 * TestPilot_AI orchestrator — command line entry point.
 *
 *   npm run orchestrate -- --url https://parabank.parasoft.com --feature "Bill Pay"
 *   npm run orchestrate -- --feature "Transfer Funds" --dry-run
 *
 * The pipeline (Explore → Plan → Generate → Execute ⇄ Heal) runs end to end;
 * Review and Report (phase 6) are not wired up yet. This file owns argument
 * parsing, the preflight check, and the stage-by-stage orchestration.
 */
import { runExplorer } from './agents/explorer.js';
import { runGenerator } from './agents/generator.js';
import { runHealer } from './agents/healer.js';
import { runPlanner } from './agents/planner.js';
import { PROVIDERS, apiKeyEnvVar, activeApiKey, config, type ProviderName } from './core/config.js';
import { runExecutor } from './core/executor.js';
import { RunContext } from './core/run.js';
import { createProvider } from './providers/index.js';
import { LOG_LEVELS, banner, createLogger, setLogLevel, type LogLevel } from './util/logger.js';

const log = createLogger('cli');

export interface CliOptions {
  /** Target application URL to explore. */
  url: string;
  /** Short feature description, e.g. "Bill Pay". */
  feature: string;
  /** Plan and generate, but never open a pull request. */
  dryRun: boolean;
  /** Which LLM provider the agents should use. */
  provider: ProviderName;
  /** Console verbosity. The on-disk run log always keeps everything. */
  logLevel: LogLevel;
  /** Override the per-run heal ceiling from `.env`. */
  maxHealAttempts: number;
}

const USAGE = `
TestPilot_AI — AI-orchestrated Playwright test generation

Usage:
  npm run orchestrate -- --feature <name> [options]

Required:
  -f, --feature <name>      Feature to cover, e.g. "Bill Pay"

Options:
  -u, --url <url>           Target application URL
                            (default: ${config.defaultTargetUrl})
      --dry-run             Plan, generate and run, but do not open a PR
  -p, --provider <name>     LLM provider: ${PROVIDERS.join(' | ')}
                            (default: ${config.provider})
      --max-heal <n>        Max heal attempts before giving up
                            (default: ${String(config.limits.maxHealAttempts)})
  -l, --log-level <level>   ${LOG_LEVELS.join(' | ')} (default: info)
  -h, --help                Show this message

Examples:
  npm run orchestrate -- --url https://parabank.parasoft.com --feature "Bill Pay"
  npm run orchestrate -- --feature "Transfer Funds" --dry-run --log-level debug
`;

class UsageError extends Error {}

/** Parse `argv` into validated options. Throws `UsageError` on bad input. */
export function parseArgs(argv: readonly string[]): CliOptions {
  let url: string | undefined;
  let feature: string | undefined;
  let dryRun = false;
  let provider: ProviderName = config.provider;
  let logLevel: LogLevel = 'info';
  let maxHealAttempts = config.limits.maxHealAttempts;

  /** Read the value that follows a flag, failing loudly when it is missing. */
  const valueFor = (flag: string, index: number): string => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('-')) {
      throw new UsageError(`Option ${flag} requires a value.`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;

    switch (arg) {
      case '-h':
      case '--help':
        console.log(USAGE);
        process.exit(0);
      // eslint-disable-next-line no-fallthrough -- process.exit is unreachable-after
      case '-u':
      case '--url':
        url = valueFor(arg, i);
        i += 1;
        break;
      case '-f':
      case '--feature':
        feature = valueFor(arg, i);
        i += 1;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '-p':
      case '--provider': {
        const raw = valueFor(arg, i);
        if (!(PROVIDERS as readonly string[]).includes(raw)) {
          throw new UsageError(
            `Unknown provider "${raw}". Expected one of: ${PROVIDERS.join(', ')}`
          );
        }
        provider = raw as ProviderName;
        i += 1;
        break;
      }
      case '--max-heal': {
        const raw = valueFor(arg, i);
        const parsedValue = Number(raw);
        if (!Number.isInteger(parsedValue) || parsedValue < 0) {
          throw new UsageError(`--max-heal expects a non-negative integer, got "${raw}".`);
        }
        maxHealAttempts = parsedValue;
        i += 1;
        break;
      }
      case '-l':
      case '--log-level': {
        const raw = valueFor(arg, i);
        if (!(LOG_LEVELS as readonly string[]).includes(raw)) {
          throw new UsageError(
            `Unknown log level "${raw}". Expected one of: ${LOG_LEVELS.join(', ')}`
          );
        }
        logLevel = raw as LogLevel;
        i += 1;
        break;
      }
      default:
        throw new UsageError(`Unrecognised argument "${arg}". Run with --help for usage.`);
    }
  }

  if (feature === undefined || feature.trim() === '') {
    throw new UsageError('Missing required option --feature. Run with --help for usage.');
  }

  let resolvedUrl = url ?? config.defaultTargetUrl;
  try {
    resolvedUrl = new URL(resolvedUrl).toString().replace(/\/+$/, '');
  } catch {
    throw new UsageError(`--url is not a valid URL: "${resolvedUrl}"`);
  }

  return {
    url: resolvedUrl,
    feature: feature.trim(),
    dryRun,
    provider,
    logLevel,
    maxHealAttempts,
  };
}

/**
 * Check everything the run depends on before any tokens are spent: a provider
 * key, and — unless this is a dry run — a GitHub token to open the PR with.
 * Returns the effective dry-run flag, which is forced on when no token exists.
 */
export function preflight(options: CliOptions): { dryRun: boolean } {
  const key = activeApiKey(options.provider);
  if (key === undefined) {
    const variable = apiKeyEnvVar(options.provider);
    throw new Error(
      `No API key for provider "${options.provider}". Set ${variable} in .env ` +
        `(see .env.example for where to get a free key).`
    );
  }

  if (!options.dryRun && config.github.token === undefined) {
    log.warn('GITHUB_TOKEN is not set — falling back to --dry-run, so no pull request will open.');
    return { dryRun: true };
  }

  return { dryRun: options.dryRun };
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`\n  ${error.message}\n${USAGE}`);
      process.exit(2);
    }
    throw error;
  }

  setLogLevel(options.logLevel);

  banner('TestPilot_AI orchestrator');
  log.info('Run configuration resolved', {
    url: options.url,
    feature: options.feature,
    provider: options.provider,
    model: options.provider === 'gemini' ? config.gemini.model : config.groq.model,
    dryRun: options.dryRun,
    limits: { ...config.limits, maxHealAttempts: options.maxHealAttempts },
  });

  const { dryRun } = preflight(options);

  log.info(`Target:   ${options.url}`);
  log.info(`Feature:  ${options.feature}`);
  log.info(
    `Provider: ${options.provider} (${options.provider === 'gemini' ? config.gemini.model : config.groq.model})`
  );
  log.info(`Mode:     ${dryRun ? 'dry run — no pull request' : 'full run — opens a pull request'}`);

  const run = new RunContext(options.feature, options.url, options.provider);
  log.info(`Run folder: ${run.dir}`);

  const provider = createProvider(options.provider);

  banner('Explore');
  const exploration = await runExplorer({
    provider,
    run,
    targetUrl: options.url,
    feature: options.feature,
  });
  log.info(
    `Explorer found ${String(exploration.pages.length)} page(s), ` +
      `${String(exploration.elements.length)} element(s), ${String(exploration.flows.length)} flow(s).`
  );

  banner('Plan');
  const plan = await runPlanner({ provider, run, feature: options.feature, exploration });
  log.info(`Planner produced ${String(plan.cases.length)} test case(s).`);

  banner('Generate');
  const generation = await runGenerator({ provider, run, plan, exploration });
  const specFiles = generation.filesWritten
    .map((f) => f.path)
    .filter((path) => path.endsWith('.spec.ts'));
  log.info(
    `Generator wrote ${String(generation.filesWritten.length)} file(s), ${String(specFiles.length)} of them spec files.`
  );
  if (specFiles.length === 0) {
    throw new Error('Generator produced no spec files — nothing to execute.');
  }

  banner('Execute');
  let attempt = 1;
  let execution = await runExecutor({ run, specFiles, attempt });
  log.info(
    `Attempt ${String(attempt)}: ${String(execution.passed)} passed, ${String(execution.failed)} failed, ${String(execution.skipped)} skipped.`
  );

  while (execution.failed > 0 && attempt <= options.maxHealAttempts) {
    banner(`Heal (attempt ${String(attempt)})`);
    const healing = await runHealer({ provider, run, execution, attempt });
    for (const verdict of healing.verdicts) {
      log.info(`  ${verdict.verdict}: ${verdict.test}`);
    }

    attempt += 1;
    banner(`Execute (attempt ${String(attempt)})`);
    execution = await runExecutor({ run, specFiles, attempt });
    log.info(
      `Attempt ${String(attempt)}: ${String(execution.passed)} passed, ${String(execution.failed)} failed, ${String(execution.skipped)} skipped.`
    );
  }

  if (execution.failed > 0) {
    log.warn(
      `${String(execution.failed)} test(s) still failing after ${String(options.maxHealAttempts)} heal attempt(s) — ` +
        'see the last healing-*.json for suspected-app-bug / could-not-diagnose verdicts.'
    );
  }

  const { usage, estimatedUsd } = run.totals();
  log.info(
    `Tokens used: ${String(usage.totalTokens)} (prompt ${String(usage.promptTokens)}, ` +
      `completion ${String(usage.completionTokens)}) ≈ $${estimatedUsd.toFixed(4)}`
  );

  log.warn(
    'Review / Report are not wired up yet (phase 6). ' +
      `All artifacts so far are saved in ${run.dir}.`
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  log.error(message);
  process.exitCode = 1;
});
