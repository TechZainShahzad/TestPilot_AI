/**
 * Healer: looks at the Executor's failures and, for each one, decides
 * whether it's a test bug (bad locator, timing, wrong assertion target) or
 * a likely application bug — fixing the former, reporting the latter.
 *
 * The "may not weaken an assertion" rule is not just a prompt instruction
 * here: `write_file` itself refuses an edit that reduces a file's
 * `expect(...)` count (see tools/file-tools.ts). The prompt still states the
 * rule, because the model should not *try* to weaken an assertion and only
 * fail at it — but the enforcement does not depend on it listening.
 */
import { runAgentLoop, type ToolImplementation } from '../core/agent-loop.js';
import { zodToToolParameters } from '../core/schema.js';
import type { RunContext } from '../core/run.js';
import type { LlmProvider } from '../providers/types.js';
import { createFileTools } from '../tools/file-tools.js';
import { healingResultSchema, type ExecutionResult, type HealingResult } from './types.js';

const SUBMIT_TOOL = 'submit_healing';

const SYSTEM_PROMPT = `You are the Healer agent in an automated test-generation pipeline.

You are given the results of a failed test run. For each FAILED test, investigate using read_file (the spec, and any page object or fixture it uses) and reach one of three verdicts:

- "fixed": the failure is a test bug — a bad locator, a timing issue, wrong test setup, or an assertion checking the wrong thing. Use write_file to correct it.
- "suspected_app_bug": the test is correct and the application genuinely did not do what it should have. Do not edit the file. Explain what the app did instead of the expected behaviour.
- "could_not_diagnose": you investigated but cannot confidently tell which of the above it is. Do not edit the file.

Absolute rule: you may NEVER make a test pass by removing, weakening, or disabling an assertion (deleting an expect(...) call, loosening its matcher, or skipping the test). This is enforced — write_file will reject an edit that reduces a file's assertion count — but do not attempt it in the first place; if a fix would require weakening an assertion, it is not a fix, the test is correctly failing, and the right verdict is "suspected_app_bug" or "could_not_diagnose".

When you have a verdict for every failed test, call ${SUBMIT_TOOL} exactly once.`;

export interface HealerOptions {
  provider: LlmProvider;
  run: RunContext;
  execution: ExecutionResult;
  attempt: number;
  maxSteps?: number;
}

export async function runHealer(options: HealerOptions): Promise<HealingResult> {
  const { provider, run, execution, attempt, maxSteps = 30 } = options;

  const failures = execution.tests.filter((t) => t.status === 'failed' || t.status === 'timedOut');
  if (failures.length === 0) {
    const empty: HealingResult = { attempt, verdicts: [] };
    run.saveJson(`healing-${String(attempt)}.json`, empty);
    return empty;
  }

  const writtenPaths = new Set<string>();
  const fileTools = createFileTools(writtenPaths, { guardAssertions: true });

  const submitTool: ToolImplementation = {
    definition: {
      name: SUBMIT_TOOL,
      description: 'Submit a verdict for every failed test. Ends healing for this attempt.',
      parameters: zodToToolParameters(healingResultSchema),
    },
    execute: () => Promise.reject(new Error('submit tool should never execute')),
  };

  const userMessage = [
    `Attempt ${String(attempt)}. ${String(failures.length)} failing test(s):`,
    '',
    JSON.stringify(failures, null, 2),
    '',
    'Diagnose and, where it is a real test bug, fix each one, then call the submit tool with a verdict per test.',
  ].join('\n');

  const { submission } = await runAgentLoop({
    agentName: 'healer',
    provider,
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    tools: [...fileTools, submitTool],
    submitToolName: SUBMIT_TOOL,
    maxSteps,
    run,
  });

  const result = healingResultSchema.parse({ ...submission, attempt });
  run.saveJson(`healing-${String(attempt)}.json`, {
    ...result,
    editedPaths: [...writtenPaths].sort(),
  });
  return result;
}
