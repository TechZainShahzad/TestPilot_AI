/**
 * Reviewer: checks the Generator's (and Healer's) output against a written
 * checklist before anything reaches a human as a pull request.
 *
 * The gate is objective first, subjective second. `runStaticChecks()` runs
 * the framework's real lint and type-check — deterministically, no model
 * involved — and a failure in either is an automatic rejection with zero
 * LLM calls spent, matching "lint and type-check must pass; a subjective
 * 'looks fine' is not a pass" in docs/agents.md. Only once both pass does
 * the model review the actual written files against the qualitative parts
 * of the checklist (POM conventions, no hard waits, no hard-coded data,
 * meaningful assertions) that only a reader, not a command, can judge.
 */
import { runAgentLoop, type ToolImplementation } from '../core/agent-loop.js';
import { zodToToolParameters } from '../core/schema.js';
import {
  runStaticChecks,
  staticCheckPassed,
  type StaticCheckResult,
} from '../core/static-check.js';
import type { RunContext } from '../core/run.js';
import type { LlmProvider } from '../providers/types.js';
import { createFileTools } from '../tools/file-tools.js';
import { reviewResultSchema, type GenerationResult, type ReviewResult } from './types.js';

const SUBMIT_TOOL = 'submit_review';

// The model only ever submits the fields it can actually judge; round and
// the static-check results are stamped on afterward from ground truth.
const reviewSubmissionSchema = reviewResultSchema.omit({
  round: true,
  lintPassed: true,
  typecheckPassed: true,
});

const SYSTEM_PROMPT = `You are the Reviewer agent in an automated test-generation pipeline. Lint and type-check have already run outside your control and passed — you are not re-checking that; you are reviewing code that is already known to compile and lint cleanly.

Read every file in the generation's file list with read_file, then check it against this checklist:
- Page Object Model followed: specs do not contain raw selectors or page.locator(...) calls directly; those belong in a page object.
- No hard waits: no page.waitForTimeout(...), no arbitrary sleep.
- No hard-coded test data: no literal usernames, emails, account numbers, or amounts that should come from a data builder — unless the literal is a deliberate boundary value the test plan calls for (e.g. testing a zero or negative amount), which is correct, not a violation.
- Every test has at least one meaningful assertion that checks a specific value or state, not just "no error was thrown."
- Imports follow convention: specs import { expect, test } from the appropriate fixtures file, never directly from '@playwright/test'.

Classify each issue you find as "blocking" (a real violation of the checklist above) or "advisory" (a style nit worth mentioning but not worth rejecting over). Verdict is "approved" only if there are zero blocking findings. When done, call ${SUBMIT_TOOL} exactly once.`;

export interface ReviewerOptions {
  provider: LlmProvider;
  run: RunContext;
  generation: GenerationResult;
  round: number;
  maxSteps?: number;
}

export async function runReviewer(options: ReviewerOptions): Promise<ReviewResult> {
  const { provider, run, generation, round, maxSteps = 20 } = options;

  const staticChecks = await runStaticChecks();
  run.saveJson(`static-check-${String(round)}.json`, staticChecks);

  if (!staticCheckPassed(staticChecks)) {
    const result = buildAutoRejection(round, staticChecks);
    run.saveJson(`review-${String(round)}.json`, result);
    return result;
  }

  const writtenPaths = new Set<string>(); // the Reviewer never writes; tracked only to satisfy createFileTools
  const fileTools = createFileTools(writtenPaths).filter(
    (tool) => tool.definition.name !== 'write_file'
  );

  const submitTool: ToolImplementation = {
    definition: {
      name: SUBMIT_TOOL,
      description: 'Submit the final review verdict and findings. Ends the review.',
      parameters: zodToToolParameters(reviewSubmissionSchema),
    },
    execute: () => Promise.reject(new Error('submit tool should never execute')),
  };

  const userMessage = [
    `Round ${String(round)}. Lint and type-check both passed.`,
    '',
    'Files this generation wrote or changed:',
    JSON.stringify(generation.filesWritten, null, 2),
    '',
    'Review them now, then call the submit tool.',
  ].join('\n');

  const { submission } = await runAgentLoop({
    agentName: 'reviewer',
    provider,
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    tools: [...fileTools, submitTool],
    submitToolName: SUBMIT_TOOL,
    maxSteps,
    run,
  });

  const parsedSubmission = reviewSubmissionSchema.parse(submission);
  const result = reviewResultSchema.parse({
    ...parsedSubmission,
    round,
    lintPassed: staticChecks.lintPassed,
    typecheckPassed: staticChecks.typecheckPassed,
  });

  run.saveJson(`review-${String(round)}.json`, result);
  return result;
}

function buildAutoRejection(round: number, staticChecks: StaticCheckResult): ReviewResult {
  const findings = [
    ...(!staticChecks.lintPassed
      ? [
          {
            file: 'framework/',
            issue: `ESLint failed:\n${staticChecks.lintOutput}`,
            severity: 'blocking' as const,
          },
        ]
      : []),
    ...(!staticChecks.typecheckPassed
      ? [
          {
            file: 'framework/',
            issue: `Type-check failed:\n${staticChecks.typecheckOutput}`,
            severity: 'blocking' as const,
          },
        ]
      : []),
  ];

  return {
    round,
    verdict: 'rejected',
    lintPassed: staticChecks.lintPassed,
    typecheckPassed: staticChecks.typecheckPassed,
    findings,
    summary: 'Automatically rejected: lint and/or type-check failed. No LLM review was performed.',
  };
}
