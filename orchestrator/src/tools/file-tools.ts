/**
 * File tools for the Generator and Healer agents, scoped to `framework/`.
 *
 * Every path argument is resolved against `FRAMEWORK_ROOT` and checked to
 * still be inside it afterward — an agent asked to "write a spec file" gets
 * exactly that capability and no more, not arbitrary filesystem access. A
 * `../../etc/passwd`-shaped path from a model is a realistic failure mode
 * for any LLM-driven file tool, not a hypothetical one.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { z } from 'zod';

import type { ToolImplementation } from '../core/agent-loop.js';
import { zodToToolParameters } from '../core/schema.js';
import { FRAMEWORK_ROOT } from '../core/config.js';

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'test-results',
  'playwright-report',
  'allure-results',
  '.auth',
]);

/** Resolves `path` against `framework/` and rejects any escape attempt. */
function resolveInFramework(path: string): string {
  const resolved = resolve(FRAMEWORK_ROOT, path);
  const rel = relative(FRAMEWORK_ROOT, resolved);
  if (rel.startsWith('..') || resolved === FRAMEWORK_ROOT) {
    throw new Error(`Path "${path}" resolves outside framework/, which is not allowed.`);
  }
  return resolved;
}

function listRecursive(dir: string, baseDir: string): string[] {
  const entries: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      entries.push(...listRecursive(full, baseDir));
    } else {
      entries.push(relative(baseDir, full).split(sep).join('/'));
    }
  }
  return entries;
}

const listFilesArgs = z.object({
  directory: z
    .string()
    .describe(
      'Directory relative to framework/, e.g. "src/pages" or "tests/ui". Use "." for everything.'
    ),
});

const readFileArgs = z.object({
  path: z.string().describe('File path relative to framework/, e.g. "src/pages/bill-pay-page.ts"'),
});

const writeFileArgs = z.object({
  path: z.string().describe('File path relative to framework/ to create or overwrite'),
  content: z.string().describe('Full file content — this replaces the entire file'),
});

const ASSERTION_PATTERN = /\bexpect\s*\(/g;

function countAssertions(content: string): number {
  return (content.match(ASSERTION_PATTERN) ?? []).length;
}

export interface FileToolsOptions {
  /**
   * When true, `write_file` refuses to overwrite an existing file with a
   * version that has fewer `expect(...)` calls than the one it would
   * replace — a real, enforced version of "the Healer may not weaken an
   * assertion," not just a prompt instruction. The write is rejected (the
   * tool result explains why) rather than silently dropped, so the model
   * can try a real fix instead.
   */
  guardAssertions?: boolean;
}

/** Builds the Generator/Healer's file tools. All writes are tracked in
 * `writtenPaths` (relative, forward-slash) so the caller can report an
 * accurate diff without re-deriving it from the filesystem. */
export function createFileTools(
  writtenPaths: Set<string>,
  options: FileToolsOptions = {}
): ToolImplementation[] {
  const { guardAssertions = false } = options;
  return [
    {
      definition: {
        name: 'list_files',
        description: 'List every file under a directory inside the framework, recursively.',
        parameters: zodToToolParameters(listFilesArgs),
      },
      execute: (args) => {
        const { directory } = listFilesArgs.parse(args);
        const dir = resolveInFramework(directory);
        if (!statSync(dir).isDirectory()) {
          return Promise.reject(new Error(`"${directory}" is not a directory.`));
        }
        return Promise.resolve({ files: listRecursive(dir, FRAMEWORK_ROOT) });
      },
    },
    {
      definition: {
        name: 'read_file',
        description: 'Read the full contents of one file in the framework.',
        parameters: zodToToolParameters(readFileArgs),
      },
      execute: (args) => {
        const { path } = readFileArgs.parse(args);
        const content = readFileSync(resolveInFramework(path), 'utf-8');
        return Promise.resolve({ path, content });
      },
    },
    {
      definition: {
        name: 'write_file',
        description:
          'Create or overwrite one file in the framework with the given full content. ' +
          'Always read_file first if the file already exists — this replaces it entirely.',
        parameters: zodToToolParameters(writeFileArgs),
      },
      execute: (args) => {
        const { path, content } = writeFileArgs.parse(args);
        const target = resolveInFramework(path);

        if (guardAssertions && existsSync(target)) {
          const before = countAssertions(readFileSync(target, 'utf-8'));
          const after = countAssertions(content);
          if (after < before) {
            return Promise.resolve({
              rejected: true,
              reason:
                `This write was rejected: it would reduce the number of expect(...) assertions ` +
                `in "${path}" from ${String(before)} to ${String(after)}. Weakening an assertion ` +
                `to make a test pass is not allowed — fix the actual cause of the failure, or if ` +
                `you believe this is an application bug rather than a test bug, leave this file ` +
                `unchanged and report it as such.`,
            });
          }
        }

        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content);
        writtenPaths.add(path.split(sep).join('/'));
        return Promise.resolve({ path, bytesWritten: Buffer.byteLength(content) });
      },
    },
  ];
}
