/**
 * Runs the framework's own lint and type-check, scoped to `framework/`, and
 * reports pass/fail with the raw output as evidence.
 *
 * Deliberately not an LLM call, for the same reason as the Executor: this
 * needs no reasoning, just running two commands and reading their exit
 * codes. It exists so the Reviewer's gate is objective — see "The Reviewer
 * gates on objective checks" in docs/agents.md — rather than a model's
 * opinion about whether code "looks" correct.
 */
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import { REPO_ROOT } from './config.js';

const execFileAsync = promisify(execFile);

function resolveBin(packageJsonSpecifier: string, relativeBinPath: string): string {
  const require = createRequire(import.meta.url);
  const packageJsonPath = require.resolve(packageJsonSpecifier);
  return join(dirname(packageJsonPath), relativeBinPath);
}

export interface StaticCheckResult {
  lintPassed: boolean;
  lintOutput: string;
  typecheckPassed: boolean;
  typecheckOutput: string;
}

/** `true` only when both checks pass — the Reviewer's hard gate. */
export function staticCheckPassed(result: StaticCheckResult): boolean {
  return result.lintPassed && result.typecheckPassed;
}

export async function runStaticChecks(): Promise<StaticCheckResult> {
  const [lint, typecheck] = await Promise.all([runLint(), runTypecheck()]);
  return { ...lint, ...typecheck };
}

async function runLint(): Promise<Pick<StaticCheckResult, 'lintPassed' | 'lintOutput'>> {
  const eslintBin = resolveBin('eslint/package.json', 'bin/eslint.js');
  try {
    const { stdout } = await execFileAsync(process.execPath, [eslintBin, 'framework'], {
      cwd: REPO_ROOT,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { lintPassed: true, lintOutput: stdout || 'No lint issues.' };
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string };
    return {
      lintPassed: false,
      lintOutput: (execError.stdout ?? '') + (execError.stderr ?? ''),
    };
  }
}

async function runTypecheck(): Promise<
  Pick<StaticCheckResult, 'typecheckPassed' | 'typecheckOutput'>
> {
  const tscBin = resolveBin('typescript/package.json', 'bin/tsc');
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [tscBin, '--build', 'framework/tsconfig.json'],
      { cwd: REPO_ROOT, maxBuffer: 16 * 1024 * 1024 }
    );
    return { typecheckPassed: true, typecheckOutput: stdout || 'No type errors.' };
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string };
    return {
      typecheckPassed: false,
      typecheckOutput: (execError.stdout ?? '') + (execError.stderr ?? ''),
    };
  }
}
