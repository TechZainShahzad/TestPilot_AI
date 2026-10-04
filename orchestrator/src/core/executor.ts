/**
 * Executor: runs the Generator's spec files and reports structured
 * results. Deliberately not an LLM agent — running a test suite and
 * parsing its own JSON reporter output needs no reasoning, and giving it
 * one would only add latency, cost, and a place for hallucination that a
 * plain function can't have.
 */
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import { FRAMEWORK_ROOT } from './config.js';
import type { RunContext } from './run.js';
import {
  executionResultSchema,
  type ExecutionResult,
  type TestResult,
  type TestStatus,
} from '../agents/types.js';

const execFileAsync = promisify(execFile);

/**
 * Resolves `@playwright/test`'s own CLI script and runs it with `node`
 * directly, rather than `npx playwright`. `npx` on Windows is a `.cmd`
 * file, which `execFile` can only launch via `shell: true` — and passing
 * array arguments through a shell means Node string-joins them without
 * escaping, a real command-injection surface, not a hypothetical one, for
 * arguments built from spec file paths. `node <resolved cli.js>` needs no
 * shell on any platform.
 */
function resolvePlaywrightCli(): string {
  // `cli.js` isn't in @playwright/test's package.json "exports", so it has
  // to be derived from the package root rather than resolved directly.
  const require = createRequire(import.meta.url);
  const packageJsonPath = require.resolve('@playwright/test/package.json');
  return join(dirname(packageJsonPath), 'cli.js');
}

// Playwright's own JSON reporter shape — only the fields this module reads.
interface PlaywrightJsonResult {
  status: string;
  duration: number;
  error?: { message?: string };
}
interface PlaywrightJsonTest {
  results: PlaywrightJsonResult[];
}
interface PlaywrightJsonSpec {
  title: string;
  file: string;
  tests: PlaywrightJsonTest[];
}
interface PlaywrightJsonSuite {
  file?: string;
  specs?: PlaywrightJsonSpec[];
  suites?: PlaywrightJsonSuite[];
}
interface PlaywrightJsonReport {
  suites: PlaywrightJsonSuite[];
}

const VALID_STATUSES = new Set<TestStatus>([
  'passed',
  'failed',
  'timedOut',
  'skipped',
  'interrupted',
]);

function toTestStatus(raw: string): TestStatus {
  return VALID_STATUSES.has(raw as TestStatus) ? (raw as TestStatus) : 'failed';
}

function flattenSuite(suite: PlaywrightJsonSuite): TestResult[] {
  const results: TestResult[] = [];
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) {
      const last = test.results.at(-1);
      if (!last) continue;
      results.push({
        file: spec.file,
        title: spec.title,
        status: toTestStatus(last.status),
        durationMs: last.duration,
        ...(last.error?.message !== undefined && { error: last.error.message }),
      });
    }
  }
  for (const nested of suite.suites ?? []) {
    results.push(...flattenSuite(nested));
  }
  return results;
}

export interface ExecutorOptions {
  run: RunContext;
  /** Spec file paths relative to framework/, e.g. "tests/ui/bill-pay.spec.ts". */
  specFiles: string[];
  attempt: number;
  timeoutMs?: number;
  /**
   * When true, forces this real Playwright run to be headed, regardless of
   * the framework's own `HEADLESS` in `.env` — the orchestrator's
   * `--headed` flag controlling the actual test execution the same way it
   * already controls the Explorer's browser, rather than being a second,
   * unrelated setting a user has to remember to also flip. Omitted (not
   * `false`) leaves `.env`'s own value untouched, so an existing
   * `HEADLESS=false` setup keeps working exactly as it did before this
   * flag existed.
   */
  headed?: boolean;
}

export async function runExecutor(options: ExecutorOptions): Promise<ExecutionResult> {
  const { run, specFiles, attempt, timeoutMs = 300_000, headed } = options;

  if (specFiles.length === 0) {
    throw new Error('runExecutor: no spec files to run.');
  }

  let stdout: string;
  try {
    const result = await execFileAsync(
      process.execPath,
      [resolvePlaywrightCli(), 'test', '--reporter=json', ...specFiles],
      {
        cwd: FRAMEWORK_ROOT,
        timeout: timeoutMs,
        maxBuffer: 64 * 1024 * 1024,
        ...(headed === true && { env: { ...process.env, HEADLESS: 'false' } }),
      }
    );
    stdout = result.stdout;
  } catch (error) {
    // A non-zero exit means "tests failed," which is Playwright's normal
    // behaviour and not an error running the command — the JSON report is
    // still on stdout and is what actually matters here.
    const execError = error as { stdout?: string; code?: unknown };
    if (typeof execError.stdout !== 'string' || execError.stdout.length === 0) {
      throw error instanceof Error ? error : new Error(String(error));
    }
    stdout = execError.stdout;
  }

  const report = JSON.parse(stdout) as PlaywrightJsonReport;
  const tests = report.suites.flatMap(flattenSuite);

  const result: ExecutionResult = {
    attempt,
    passed: tests.filter((t) => t.status === 'passed').length,
    failed: tests.filter((t) => t.status === 'failed' || t.status === 'timedOut').length,
    skipped: tests.filter((t) => t.status === 'skipped').length,
    tests,
  };

  const validated = executionResultSchema.parse(result);
  run.saveJson(`execution-${String(attempt)}.json`, validated);
  return validated;
}
