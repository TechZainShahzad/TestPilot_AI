/**
 * Generator: writes or updates page objects, fixtures, data builders, and
 * spec files for a plan — following the existing framework's conventions,
 * and reusing what's already there rather than duplicating it.
 *
 * Grounded in two things, not invention: the Planner's cases (what to
 * cover) and the Explorer's locator hints (what elements genuinely exist).
 * `list_files`/`read_file` let it study the current framework's patterns —
 * fixtures, BasePage conventions, tagging — before writing anything.
 */
import { runAgentLoop, type ToolImplementation } from '../core/agent-loop.js';
import { zodToToolParameters } from '../core/schema.js';
import type { RunContext } from '../core/run.js';
import type { LlmProvider } from '../providers/types.js';
import { createFileTools } from '../tools/file-tools.js';
import {
  generationResultSchema,
  type ExplorationResult,
  type GenerationResult,
  type ReviewResult,
  type TestPlan,
} from './types.js';

const SUBMIT_TOOL = 'submit_generation';

const SYSTEM_PROMPT = `You are the Generator agent in an automated test-generation pipeline for a Playwright + TypeScript framework.

You are given a test plan and the Explorer's findings for the feature it covers. Your job is to write the Playwright spec file(s) — and only the page objects, fixtures, or data builders genuinely missing — that implement the plan.

Framework conventions you MUST follow (study the existing code with list_files/read_file before writing anything — do not guess them):
- Page objects live in src/pages/, one class per screen, extending BasePage. Locators are exposed as getters; actions are async methods.
- Custom fixtures live in src/fixtures/ (pages.ts for the \`ui\`/\`ui-guest\` projects, api.ts for the \`api\` project) and are imported into specs as \`{ expect, test }\` from the appropriate fixtures file — never import directly from '@playwright/test' in a spec.
- Test data comes from builders in src/data/ (Faker-backed) — never hard-code a literal value a builder could generate, and never hard-code a username, email, or account number.
- Specs live under tests/ui/ or tests/api/, tagged in the test.describe title with the tags from the plan's cases (map "positive"/"negative"/"boundary" case types onto @regression plus @ui or @api as appropriate — never invent a new tag).
- A file ending in .guest.spec.ts runs logged out; anything else under tests/ui/ runs with a shared authenticated session — pick correctly based on whether the case needs to start unauthenticated.
- Every assertion must be meaningful — assert on a specific rendered value or state, never just "no error was thrown."
- NEVER weaken, remove, or skip an assertion to make a case easier to write.

Critical rule: if a page object, fixture, or spec file already exists that covers what you need, REUSE it — extend it with a new method or a new test inside its existing describe block rather than creating a near-duplicate file or class. Check with list_files and read_file before creating anything new.

When every case in the plan has corresponding, real, written test code, call ${SUBMIT_TOOL} exactly once summarising what you wrote and why.`;

export interface GeneratorOptions {
  provider: LlmProvider;
  run: RunContext;
  plan: TestPlan;
  exploration: ExplorationResult;
  /** A prior round's rejection, when this call is a re-generation. */
  reviewFeedback?: ReviewResult;
  maxSteps?: number;
}

export async function runGenerator(options: GeneratorOptions): Promise<GenerationResult> {
  const { provider, run, plan, exploration, reviewFeedback, maxSteps = 40 } = options;

  const writtenPaths = new Set<string>();
  const fileTools = createFileTools(writtenPaths);

  const submitTool: ToolImplementation = {
    definition: {
      name: SUBMIT_TOOL,
      description: 'Submit a summary of the generation work. Ends generation.',
      parameters: zodToToolParameters(generationResultSchema),
    },
    execute: () => Promise.reject(new Error('submit tool should never execute')),
  };

  const userMessage = [
    `Test plan (JSON):`,
    JSON.stringify(plan, null, 2),
    '',
    `Explorer findings (JSON):`,
    JSON.stringify(exploration, null, 2),
    ...(reviewFeedback
      ? [
          '',
          'The previous round was REJECTED by review. Fix every blocking finding below before ' +
            'resubmitting — do not repeat the same mistakes:',
          JSON.stringify(
            reviewFeedback.findings.filter((f) => f.severity === 'blocking'),
            null,
            2
          ),
        ]
      : []),
    '',
    'Study the existing framework code relevant to this feature first, then write the test code, then call the submit tool.',
  ].join('\n');

  const { submission } = await runAgentLoop({
    agentName: 'generator',
    provider,
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    tools: [...fileTools, submitTool],
    submitToolName: SUBMIT_TOOL,
    maxSteps,
    run,
  });

  const result = generationResultSchema.parse(submission);

  if (writtenPaths.size === 0) {
    throw new Error('generator: submitted generation but never called write_file.');
  }

  run.saveJson('generation.json', { ...result, writtenPaths: [...writtenPaths].sort() });
  return result;
}
