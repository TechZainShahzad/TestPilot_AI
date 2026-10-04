/**
 * Planner: turns the Explorer's findings and the feature description into a
 * structured test plan — positive, negative, and boundary cases, each
 * prioritised. Writes `plan.json` and a human-readable `plan.md`.
 *
 * No browser, no tools beyond the submit tool: the Planner reasons over
 * `exploration.json`, it doesn't gather new facts.
 */
import { runAgentLoop, type ToolImplementation } from '../core/agent-loop.js';
import { zodToToolParameters } from '../core/schema.js';
import type { RunContext } from '../core/run.js';
import type { LlmProvider } from '../providers/types.js';
import { testPlanSchema, type ExplorationResult, type TestPlan } from './types.js';

const SUBMIT_TOOL = 'submit_plan';

const SYSTEM_PROMPT = `You are the Planner agent in an automated test-generation pipeline.

You are given one Explorer agent's findings for a feature — the pages, elements, and flows it actually observed in a real browser — and a short feature description. Turn this into a test plan grounded entirely in what the Explorer found; never invent a case that depends on an element or flow not present in the exploration.

Rules:
- Cover the feature with a mix of positive (happy path), negative (invalid input, error states), and boundary (edge values, empty/zero/maximum) cases. A plan with only positive cases is incomplete.
- When explicit acceptance criteria are given in the requirements text, every criterion must map to at least one case — don't substitute a generic mix for what was explicitly asked for.
- Prioritise: P0 for the primary happy path and any case guarding money/data integrity, P1 for important negative/boundary cases, P2 for edge cases that are good to have but not critical.
- Every case's "steps" must be executable using only the elements and flows the Explorer actually recorded — reference them by the locator hints and page URLs given, not by guessing new ones.
- Every case's "expected" must describe one concrete, observable outcome — not "it should work correctly."
- When the plan is complete, call ${SUBMIT_TOOL} exactly once with the full plan.

CRITICAL: your plan leaves this conversation ONLY through a ${SUBMIT_TOOL} tool call. Never answer with a plain-text or markdown plan instead of calling the tool — a text-only reply is treated as a failure and discarded, no matter how complete it looks. If you believe you are done, your very next action must be a ${SUBMIT_TOOL} tool call, not a message.`;

export interface PlannerOptions {
  provider: LlmProvider;
  run: RunContext;
  feature: string;
  exploration: ExplorationResult;
  /** Free-text requirements (e.g. a Jira ticket's description) to plan against. */
  requirements?: string;
  maxSteps?: number;
}

export async function runPlanner(options: PlannerOptions): Promise<TestPlan> {
  const { provider, run, feature, exploration, requirements, maxSteps = 8 } = options;

  const submitTool: ToolImplementation = {
    definition: {
      name: SUBMIT_TOOL,
      description: 'Submit the final, complete test plan. Ends planning.',
      parameters: zodToToolParameters(testPlanSchema),
    },
    execute: () => Promise.reject(new Error('submit tool should never execute')),
  };

  const userMessage = [
    `Feature: ${feature}`,
    ...(requirements !== undefined
      ? ['', 'Requirements (from the source ticket):', requirements]
      : []),
    '',
    'Explorer findings (JSON):',
    JSON.stringify(exploration, null, 2),
    '',
    'Produce the test plan now, then call the submit tool.',
  ].join('\n');

  const { submission } = await runAgentLoop({
    agentName: 'planner',
    provider,
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    tools: [submitTool],
    submitToolName: SUBMIT_TOOL,
    maxSteps,
    run,
  });

  const plan = testPlanSchema.parse({ ...submission, feature });

  run.saveJson('plan.json', plan);
  run.saveText('plan.md', renderPlanMarkdown(plan));
  return plan;
}

function renderPlanMarkdown(plan: TestPlan): string {
  const lines: string[] = [`# Test plan: ${plan.feature}`, '', plan.summary, ''];

  const byType: Record<string, typeof plan.cases> = { positive: [], negative: [], boundary: [] };
  for (const testCase of plan.cases) {
    byType[testCase.type]?.push(testCase);
  }

  for (const [type, cases] of Object.entries(byType)) {
    if (cases.length === 0) continue;
    lines.push(`## ${capitalise(type)} cases`, '');
    for (const testCase of cases) {
      lines.push(`### ${testCase.id} — ${testCase.title} (${testCase.priority})`, '');
      if (testCase.preconditions.length > 0) {
        lines.push('**Preconditions:**');
        for (const pre of testCase.preconditions) lines.push(`- ${pre}`);
        lines.push('');
      }
      lines.push('**Steps:**');
      testCase.steps.forEach((step, index) => lines.push(`${String(index + 1)}. ${step}`));
      lines.push('', `**Expected:** ${testCase.expected}`, '');
    }
  }

  return lines.join('\n');
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
