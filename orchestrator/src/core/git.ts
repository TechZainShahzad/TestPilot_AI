/**
 * Minimal git wrapper for the Reporter's branch/commit/push step.
 *
 * Every call goes through `execFile` with an argument array — never a
 * shell string — the same reasoning as `executor.ts`'s Playwright
 * invocation: a branch name or file path that ends up concatenated into a
 * shell command is a real injection surface, not a hypothetical one, when
 * any of those strings can trace back to model output (a branch name
 * derived from a feature description, file paths from `generation.json`).
 *
 * Every function takes `cwd` as its final, optional argument (default
 * `REPO_ROOT`) so this module is testable against a disposable scratch
 * repository instead of only the real one.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { REPO_ROOT } from './config.js';

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

export async function currentBranch(cwd: string = REPO_ROOT): Promise<string> {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
}

export async function createBranch(branch: string, cwd: string = REPO_ROOT): Promise<void> {
  await git(['checkout', '-b', branch], cwd);
}

export async function checkoutBranch(branch: string, cwd: string = REPO_ROOT): Promise<void> {
  await git(['checkout', branch], cwd);
}

/** Stages exactly the given paths (relative to the repo root) — never `-A`
 * or `.`, so a run can only ever commit the files it is told about. */
export async function stagePaths(paths: string[], cwd: string = REPO_ROOT): Promise<void> {
  if (paths.length === 0) {
    throw new Error('stagePaths: no paths given — refusing to run a bare `git add`.');
  }
  await git(['add', '--', ...paths], cwd);
}

export async function hasStagedChanges(cwd: string = REPO_ROOT): Promise<boolean> {
  try {
    await execFileAsync('git', ['diff', '--cached', '--quiet'], { cwd });
    return false; // exit 0 means no differences
  } catch {
    return true; // non-zero means there are staged differences
  }
}

export async function commit(message: string, cwd: string = REPO_ROOT): Promise<void> {
  await git(['commit', '-m', message], cwd);
}

export async function push(branch: string, cwd: string = REPO_ROOT): Promise<void> {
  await git(['push', '--set-upstream', 'origin', branch], cwd);
}

/** `true` if `origin` is configured — a run against a local-only clone
 * cannot push, and the Reporter should fall back to dry-run behaviour. */
export async function hasRemote(cwd: string = REPO_ROOT): Promise<boolean> {
  try {
    await git(['remote', 'get-url', 'origin'], cwd);
    return true;
  } catch {
    return false;
  }
}
