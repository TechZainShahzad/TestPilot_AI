#!/usr/bin/env node
/**
 * TestPilot_AI orchestrator — command line entry point.
 *
 *   npm run orchestrate -- --url https://www.saucedemo.com --feature "Checkout Flow"
 *   npm run orchestrate -- --feature "Product Sorting" --dry-run
 *
 * The full pipeline (Explore → Plan → Generate → Execute ⇄ Heal → Review ⇄
 * Generate → Report) runs end to end. This file owns argument parsing, the
 * preflight check, and the stage-by-stage orchestration.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { runExplorer } from './agents/explorer.js';
import { runGenerator } from './agents/generator.js';
import { runHealer } from './agents/healer.js';
import { runPlanner } from './agents/planner.js';
import { runReporter } from './agents/reporter.js';
import { runReviewer } from './agents/reviewer.js';
import type {
  ExecutionResult,
  GenerationResult,
  HealingResult,
  ReviewResult,
} from './agents/types.js';
import {
  PROVIDERS,
  apiKeyEnvVar,
  activeApiKey,
  config,
  jiraCredentials,
  type ProviderName,
} from './core/config.js';
import { runExecutor } from './core/executor.js';
import { findExistingPullRequest } from './core/github.js';
import { fetchIssue, type JiraIssue } from './core/jira.js';
import { RunContext } from './core/run.js';
import { resolveClaudeBin } from './providers/claude-code.js';
import { createProvider } from './providers/index.js';
import { agentPrefix, stageLine } from './util/agents-meta.js';
import { LOG_LEVELS, banner, createLogger, setLogLevel, type LogLevel } from './util/logger.js';
import { withSpinner } from './util/spinner.js';

const log = createLogger('cli');
const execFileAsync = promisify(execFile);

export interface CliOptions {
  /** Target application URL to explore. */
  url: string;
  /** Short feature description, e.g. "Bill Pay". Mutually exclusive with `jiraTicket`. */
  feature: string | undefined;
  /** A Jira issue key, e.g. "PROJ-123", to pull the feature description from. */
  jiraTicket: string | undefined;
  /** Plan and generate, but never open a pull request. */
  dryRun: boolean;
  /** Which LLM provider the agents should use. */
  provider: ProviderName;
  /** Console verbosity. The on-disk run log always keeps everything. */
  logLevel: LogLevel;
  /** Override the per-run heal ceiling from `.env`. */
  maxHealAttempts: number;
  /** Run the Explorer's browser and the real Executor test run visibly
   * instead of headless. */
  headed: boolean;
}

const USAGE = `
TestPilot_AI — AI-orchestrated Playwright test generation

Usage:
  npm run orchestrate -- --feature <name> [options]
  npm run orchestrate -- --jira-ticket <key> [options]

Required (exactly one):
  -f, --feature <name>      Feature to cover, e.g. "Checkout Flow"
  -j, --jira-ticket <key>   Jira issue key to pull the feature from, e.g. "PROJ-123"
                            (requires JIRA_BASE_URL/JIRA_EMAIL/JIRA_API_TOKEN in .env)

Options:
  -u, --url <url>           Target application URL
                            (default: ${config.defaultTargetUrl})
      --dry-run             Plan, generate and run, but do not open a PR
  -p, --provider <name>     LLM provider: ${PROVIDERS.join(' | ')}
                            (default: ${config.provider})
      --max-heal <n>        Max heal attempts before giving up
                            (default: ${String(config.limits.maxHealAttempts)})
  -l, --log-level <level>   ${LOG_LEVELS.join(' | ')} (default: info)
  -H, --headed              Show both the Explorer's browser and the real test run
                            instead of running headless
  -h, --help                Show this message

Examples:
  npm run orchestrate -- --url https://www.saucedemo.com --feature "Checkout Flow"
  npm run orchestrate -- --feature "Product Sorting" --dry-run --log-level debug
  npm run orchestrate -- --feature "Burger Menu" --dry-run --headed
  npm run orchestrate -- --jira-ticket PROJ-123 --dry-run
`;

class UsageError extends Error {}

/** Parse `argv` into validated options. Throws `UsageError` on bad input. */
export function parseArgs(argv: readonly string[]): CliOptions {
  let url: string | undefined;
  let feature: string | undefined;
  let jiraTicket: string | undefined;
  let dryRun = false;
  let provider: ProviderName = config.provider;
  let logLevel: LogLevel = 'info';
  let maxHealAttempts = config.limits.maxHealAttempts;
  let headed = false;

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
      case '-j':
      case '--jira-ticket':
        jiraTicket = valueFor(arg, i);
        i += 1;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '-H':
      case '--headed':
        headed = true;
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

  const trimmedFeature =
    feature !== undefined && feature.trim() !== '' ? feature.trim() : undefined;
  const trimmedJiraTicket =
    jiraTicket !== undefined && jiraTicket.trim() !== '' ? jiraTicket.trim() : undefined;

  if (trimmedFeature === undefined && trimmedJiraTicket === undefined) {
    throw new UsageError(
      'Missing required option: --feature or --jira-ticket. Run with --help for usage.'
    );
  }
  if (trimmedFeature !== undefined && trimmedJiraTicket !== undefined) {
    throw new UsageError('--feature and --jira-ticket are mutually exclusive — pick one.');
  }

  let resolvedUrl = url ?? config.defaultTargetUrl;
  try {
    resolvedUrl = new URL(resolvedUrl).toString().replace(/\/+$/, '');
  } catch {
    throw new UsageError(`--url is not a valid URL: "${resolvedUrl}"`);
  }

  return {
    url: resolvedUrl,
    feature: trimmedFeature,
    jiraTicket: trimmedJiraTicket,
    dryRun,
    provider,
    logLevel,
    maxHealAttempts,
    headed,
  };
}

/** The configured model string for a provider, for display only — `claude-code`
 * has no single configured model unless `CLAUDE_CODE_MODEL` is set, in which
 * case that is what actually gets passed via `--model`. */
function modelFor(provider: ProviderName): string {
  switch (provider) {
    case 'gemini':
      return config.gemini.model;
    case 'groq':
      return config.groq.model;
    case 'claude-code':
      return config.claudeCode.model ?? '(subscription default)';
  }
}

/** `claude-code` has no key to check — confirm the CLI itself is installed
 * and authenticated instead, the same "fail fast with a clear message"
 * spirit as the API-key check for the other providers. Resolves the real
 * binary the same way `providers/claude-code.ts` does for every actual
 * call, rather than the `.cmd` shim directly — see `resolveClaudeBin`'s
 * doc for why. */
async function assertClaudeCliAvailable(): Promise<void> {
  try {
    await execFileAsync(resolveClaudeBin(), ['--version'], { shell: false });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      '`claude` CLI not found or not working. Install Claude Code and run `claude` ' +
        `interactively once to authenticate before using --provider claude-code. (${detail})`,
      error instanceof Error ? { cause: error } : undefined
    );
  }
}

/**
 * Check everything the run depends on before any tokens are spent: a provider
 * key, and — unless this is a dry run — a GitHub token to open the PR with.
 * Returns the effective dry-run flag, which is forced on when no token exists.
 */
export async function preflight(options: CliOptions): Promise<{ dryRun: boolean }> {
  if (options.provider === 'claude-code') {
    await assertClaudeCliAvailable();
  } else {
    const key = activeApiKey(options.provider);
    if (key === undefined) {
      const variable = apiKeyEnvVar(options.provider);
      throw new Error(
        `No API key for provider "${options.provider}". Set ${variable} in .env ` +
          `(see .env.example for where to get a free key).`
      );
    }
  }

  if (options.jiraTicket !== undefined && jiraCredentials() === undefined) {
    throw new Error(
      'JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN must all be set in .env to use --jira-ticket.'
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
    jiraTicket: options.jiraTicket,
    provider: options.provider,
    model: modelFor(options.provider),
    dryRun: options.dryRun,
    headed: options.headed,
    limits: { ...config.limits, maxHealAttempts: options.maxHealAttempts },
  });

  const { dryRun } = await preflight(options);

  let feature: string;
  let requirements: string | undefined;
  let jiraIssue: JiraIssue | undefined;

  if (options.jiraTicket !== undefined) {
    banner(stageLine('jira'));
    const credentials = jiraCredentials();
    if (credentials === undefined) {
      throw new Error('Internal error: preflight should have required Jira credentials.');
    }
    jiraIssue = await fetchIssue(options.jiraTicket, credentials);
    feature = jiraIssue.summary;
    requirements = jiraIssue.description;
    log.info(`Ticket:   ${jiraIssue.key} — ${jiraIssue.summary}`);
    log.info(
      `Status:   ${jiraIssue.status}` +
        (jiraIssue.labels.length > 0 ? ` (${jiraIssue.labels.join(', ')})` : '')
    );
    log.info(`URL:      ${jiraIssue.url}`);

    const existing = await findExistingPullRequest(
      config.github.repo,
      config.github.token,
      jiraIssue.key
    );
    if (existing) {
      log.warn(
        `A pull request already references ${jiraIssue.key}: ${existing.url} ` +
          `(${existing.state}) — continuing anyway, in case this ticket needs more coverage.`
      );
    }
  } else if (options.feature !== undefined) {
    feature = options.feature;
  } else {
    throw new Error(
      'Internal error: parseArgs should guarantee --feature or --jira-ticket is set.'
    );
  }

  log.info(`Target:   ${options.url}`);
  log.info(`Feature:  ${feature}`);
  log.info(`Provider: ${options.provider} (${modelFor(options.provider)})`);
  log.info(`Mode:     ${dryRun ? 'dry run — no pull request' : 'full run — opens a pull request'}`);

  const run = new RunContext(feature, options.url, options.provider);
  log.info(`Run folder: ${run.dir}`);

  const provider = createProvider(options.provider);

  banner(stageLine('explorer'));
  const exploration = await runExplorer({
    provider,
    run,
    targetUrl: options.url,
    feature,
    headless: !options.headed,
    ...(requirements !== undefined && { requirements }),
  });
  log.info(
    `Explorer found ${String(exploration.pages.length)} page(s), ` +
      `${String(exploration.elements.length)} element(s), ${String(exploration.flows.length)} flow(s).`
  );

  banner(stageLine('planner'));
  const plan = await runPlanner({
    provider,
    run,
    feature,
    exploration,
    ...(requirements !== undefined && { requirements }),
  });
  log.info(`Planner produced ${String(plan.cases.length)} test case(s).`);
  if (plan.requirementsCoverage.length > 0) {
    log.info('Requirements understood from the ticket:');
    for (const entry of plan.requirementsCoverage) {
      const cases = entry.caseIds.length > 0 ? entry.caseIds.join(', ') : '— no case maps to this (gap)';
      log.info(`  • ${entry.criterion} → ${cases}`);
    }
  }

  const generations: GenerationResult[] = [];
  const executions: ExecutionResult[] = [];
  const healings: HealingResult[] = [];
  const reviews: ReviewResult[] = [];
  let healAttempt = 0;

  let round = 1;
  for (;;) {
    banner(stageLine('generator', `round ${String(round)}`));
    const lastReview = reviews.at(-1);
    const generation = await runGenerator({
      provider,
      run,
      plan,
      exploration,
      ...(lastReview !== undefined && { reviewFeedback: lastReview }),
    });
    generations.push(generation);
    const specFiles = generation.filesWritten
      .map((f) => f.path)
      .filter((path) => path.endsWith('.spec.ts'));
    log.info(
      `Generator wrote ${String(generation.filesWritten.length)} file(s), ${String(specFiles.length)} of them spec files.`
    );
    if (specFiles.length === 0) {
      throw new Error('Generator produced no spec files — nothing to execute.');
    }

    banner(stageLine('executor'));
    healAttempt += 1;
    let execution = await withSpinner(`${agentPrefix('executor')} is running the suite…`, () =>
      runExecutor({ run, specFiles, attempt: healAttempt, ...(options.headed && { headed: true }) })
    );
    executions.push(execution);
    log.info(
      `Attempt ${String(healAttempt)}: ${String(execution.passed)} passed, ${String(execution.failed)} failed, ${String(execution.skipped)} skipped.`
    );

    while (execution.failed > 0 && healAttempt <= options.maxHealAttempts) {
      banner(stageLine('healer', `attempt ${String(healAttempt)}`));
      const healing = await runHealer({ provider, run, execution, attempt: healAttempt });
      healings.push(healing);
      for (const verdict of healing.verdicts) {
        log.info(`  ${verdict.verdict}: ${verdict.test}`);
      }

      healAttempt += 1;
      banner(stageLine('executor', `attempt ${String(healAttempt)}`));
      execution = await withSpinner(`${agentPrefix('executor')} is running the suite…`, () =>
        runExecutor({
          run,
          specFiles,
          attempt: healAttempt,
          ...(options.headed && { headed: true }),
        })
      );
      executions.push(execution);
      log.info(
        `Attempt ${String(healAttempt)}: ${String(execution.passed)} passed, ${String(execution.failed)} failed, ${String(execution.skipped)} skipped.`
      );
    }

    if (execution.failed > 0) {
      log.warn(
        `${String(execution.failed)} test(s) still failing after ${String(options.maxHealAttempts)} heal attempt(s) — ` +
          'see the last healing-*.json for suspected-app-bug / could-not-diagnose verdicts.'
      );
    }

    banner(stageLine('reviewer', `round ${String(round)}`));
    const review = await runReviewer({ provider, run, generation, round });
    reviews.push(review);
    log.info(
      `Verdict: ${review.verdict} (lint ${review.lintPassed ? 'OK' : 'FAILED'}, typecheck ${review.typecheckPassed ? 'OK' : 'FAILED'}, ${String(review.findings.length)} finding(s))`
    );

    if (review.verdict === 'approved') break;
    if (round >= config.limits.maxReviewRounds) {
      log.warn(`Review rejected after ${String(round)} round(s) — giving up at MAX_REVIEW_ROUNDS.`);
      break;
    }
    round += 1;
  }

  banner(stageLine('reporter'));
  const report = await withSpinner(`${agentPrefix('reporter')} is writing the summary…`, () =>
    runReporter({
      run,
      feature,
      targetUrl: options.url,
      ...(jiraIssue !== undefined && { jiraTicket: { key: jiraIssue.key, url: jiraIssue.url } }),
      provider: options.provider,
      exploration,
      plan,
      generations,
      executions,
      healings,
      reviews,
      dryRun,
    })
  );
  log.info(`Summary written to ${report.summaryPath}`);
  if (report.pullRequestUrl) {
    log.info(`Pull request opened: ${report.pullRequestUrl}`);
  } else if (report.branch) {
    log.info(
      `Branch "${report.branch}" pushed, but no pull request was opened (see warnings above).`
    );
  } else {
    log.info('No branch or pull request was created (dry run, or nothing to commit).');
  }

  const resolvedModel = provider.getResolvedModel?.();
  if (resolvedModel !== undefined && resolvedModel !== modelFor(options.provider)) {
    log.info(`Model used: ${resolvedModel}`);
  }

  const { usage, estimatedUsd } = run.totals();
  const listPriceUsd = provider.getListPriceUsd?.();
  log.info(
    `Tokens used: ${String(usage.totalTokens)} (prompt ${String(usage.promptTokens)}, ` +
      `completion ${String(usage.completionTokens)}) ≈ $${estimatedUsd.toFixed(4)}` +
      (listPriceUsd !== undefined
        ? ` (Claude API list-price equivalent: $${listPriceUsd.toFixed(4)} — not billed; covered by subscription)`
        : '')
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  log.error(message);
  process.exitCode = 1;
});
