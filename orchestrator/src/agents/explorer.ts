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
- Record every page you actually visited, every element genuinely relevant to the feature (inputs, buttons, links, result/error messages), and the flow(s) you walked, in the order you walked them.
- Explore both the success path and at least one way the flow can go wrong (a validation error, an empty field) if you can reach one without destructive or irreversible actions.
- When you are confident you have covered the feature, call ${SUBMIT_TOOL} exactly once with your complete findings. Do not call it before exploring — an exploration with zero elements or flows is not useful to anyone downstream.`;

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
