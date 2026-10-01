/**
 * Explorer: drives a real browser through a feature, using only the
 * accessibility tree (never a screenshot, never raw HTML) to find pages,
 * elements, and flows. Writes `exploration.json`.
 *
 * The output is grounding for the Planner and Generator — it exists so
 * neither of them has to invent a selector from a feature name. See
 * "Why the orchestrator browses the app instead of guessing selectors" in
 * the README.
 */
import { chromium } from 'playwright';

import { runAgentLoop, type ToolImplementation } from '../core/agent-loop.js';
import { zodToToolParameters } from '../core/schema.js';
import type { RunContext } from '../core/run.js';
import type { LlmProvider } from '../providers/types.js';
import { createBrowserTools } from '../tools/browser-tools.js';
import { explorationResultSchema, type ExplorationResult } from './types.js';

const SUBMIT_TOOL = 'submit_exploration';

const SYSTEM_PROMPT = `You are the Explorer agent in an automated test-generation pipeline.

Your job: use the browser tools to actually navigate and interact with the target application and the named feature, and report what you genuinely found — never invent a page, element, or flow you have not visited or seen in a snapshot.

Rules:
- Start with "navigate" to the target URL, then explore toward the named feature using the links, buttons and forms you see in each snapshot.
- Prefer role- and label-based locator hints (e.g. getByRole('button', { name: 'Submit' })) over CSS or XPath; only fall back to a CSS/test-id hint when no accessible role or name exists.
- STAY SCOPED TO THE NAMED FEATURE. A page you only passed through to reach the feature (e.g. a login or registration form used purely to get authenticated) is not itself part of the exploration — do not catalog its fields. Record only pages, elements, and flows that are actually part of the named feature. A small, focused exploration (roughly 5-15 elements) is far more useful downstream than an exhaustive one, and is also far more likely to fit in one response.
- Explore both the success path and at least one way the flow can go wrong (a validation error, an empty field) if you can reach one without destructive or irreversible actions — but only within the named feature's own scope, not the whole app.
- Keep "notes" to 1-3 short sentences — the single most important thing the Planner needs to know, not a narrative.
- When you are confident you have covered the feature, call ${SUBMIT_TOOL} exactly once with your complete findings. Do not call it before exploring — an exploration with zero elements or flows is not useful to anyone downstream.

CRITICAL: your findings leave this conversation ONLY through a ${SUBMIT_TOOL} tool call. Never answer with a plain-text summary, markdown report, or table instead of calling the tool — a text-only reply is treated as a failure and discarded, no matter how complete it looks. If you believe you are done, your very next action must be a ${SUBMIT_TOOL} tool call, not a message.`;

export interface ExplorerOptions {
  provider: LlmProvider;
  run: RunContext;
  targetUrl: string;
  feature: string;
  headless?: boolean;
  maxSteps?: number;
}

export async function runExplorer(options: ExplorerOptions): Promise<ExplorationResult> {
  const { provider, run, targetUrl, feature, headless = true, maxSteps = 25 } = options;

  const browser = await chromium.launch({ headless });
  try {
    const page = await browser.newPage();
    const browserTools = createBrowserTools(page);

    const submitTool: ToolImplementation = {
      definition: {
        name: SUBMIT_TOOL,
        description: 'Submit the final, complete exploration findings. Ends the exploration.',
        parameters: zodToToolParameters(explorationResultSchema),
      },
      // Validation happens after the loop returns, against the full Zod
      // schema; this tool's own execute() is never actually invoked — the
      // agent loop intercepts calls to the submit tool by name.
      execute: () => Promise.reject(new Error('submit tool should never execute')),
    };

    const userMessage = [
      `Target application: ${targetUrl}`,
      `Feature to explore: ${feature}`,
      '',
      'Explore this feature now, then call the submit tool with your findings.',
    ].join('\n');

    const { submission } = await runAgentLoop({
      agentName: 'explorer',
      provider,
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      tools: [...browserTools, submitTool],
      submitToolName: SUBMIT_TOOL,
      maxSteps,
      run,
    });

    // `feature`/`targetUrl` are ours, not the model's to restate — spread
    // the submission first so our trusted values win on conflict.
    const result = explorationResultSchema.parse({
      ...submission,
      feature,
      targetUrl,
    });

    run.saveJson('exploration.json', result);
    return result;
  } finally {
    await browser.close();
  }
}
