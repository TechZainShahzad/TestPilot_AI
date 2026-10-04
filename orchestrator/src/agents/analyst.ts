/**
 * Analyst: the first agent to actually read a ticket's requirements,
 * before any browser exploration happens. Turns raw ticket text into a
 * plain-language understanding, an explicit list of acceptance criteria,
 * and concrete exploration hints — so the Explorer is pointed at the
 * feature instead of wandering the app blind. Writes `brief.json` and a
 * human-readable `brief.md`.
 *
 * No browser, no tools beyond the submit tool, same reasoning as the
 * Planner: this agent reasons over text it is already given, it doesn't
 * gather new facts.
 */
import { runAgentLoop, type ToolImplementation } from '../core/agent-loop.js';
import { zodToToolParameters } from '../core/schema.js';
import type { RunContext } from '../core/run.js';
import type { LlmProvider } from '../providers/types.js';
import { requirementsBriefSchema, type RequirementsBrief } from './types.js';

const SUBMIT_TOOL = 'submit_brief';

const SYSTEM_PROMPT = `You are the Analyst agent in an automated test-generation pipeline — the first agent to read a ticket's requirements, before any browser exploration happens. Your job is to understand the story, not verify it: you have no browser and no code access, only the ticket's own text.

Rules:
- Restate the feature in your own words, in 1-3 sentences. This is the understanding check: if you cannot restate it clearly, say so in openQuestions instead of guessing.
- Extract every acceptance criterion as its own entry in "acceptanceCriteria", as close to the ticket's own wording as possible. Do not invent criteria that aren't stated, and do not merge two criteria into one.
- Translate the criteria into concrete exploration hints in "explorationHints": which pages, UI states, or user flows should the Explorer specifically look for to exercise each criterion? Be concrete (e.g. "scroll the product grid until every loading placeholder resolves", not "check loading").
- Anything genuinely ambiguous or unverifiable from the text alone goes in "openQuestions", not into a guessed criterion.
- When done, call ${SUBMIT_TOOL} exactly once with your complete brief.

CRITICAL: your brief leaves this conversation ONLY through a ${SUBMIT_TOOL} tool call. Never answer with a plain-text or markdown brief instead of calling the tool — a text-only reply is treated as a failure and discarded, no matter how complete it looks. If you believe you are done, your very next action must be a ${SUBMIT_TOOL} tool call, not a message.`;

export interface AnalystOptions {
  provider: LlmProvider;
  run: RunContext;
  feature: string;
  requirements: string;
  maxSteps?: number;
}

export async function runAnalyst(options: AnalystOptions): Promise<RequirementsBrief> {
  const { provider, run, feature, requirements, maxSteps = 4 } = options;

  const submitTool: ToolImplementation = {
    definition: {
      name: SUBMIT_TOOL,
      description: 'Submit the final requirements brief. Ends analysis.',
      parameters: zodToToolParameters(requirementsBriefSchema),
    },
    execute: () => Promise.reject(new Error('submit tool should never execute')),
  };

  const userMessage = [
    `Feature: ${feature}`,
    '',
    'Ticket requirements (raw text):',
    requirements,
    '',
    'Produce the brief now, then call the submit tool.',
  ].join('\n');

  const { submission } = await runAgentLoop({
    agentName: 'analyst',
    provider,
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    tools: [submitTool],
    submitToolName: SUBMIT_TOOL,
    maxSteps,
    run,
  });

  const brief = requirementsBriefSchema.parse(submission);

  run.saveJson('brief.json', brief);
  run.saveText('brief.md', renderBriefMarkdown(feature, brief));
  return brief;
}

function renderBriefMarkdown(feature: string, brief: RequirementsBrief): string {
  const lines: string[] = [`# Requirements brief: ${feature}`, '', brief.understanding, ''];

  lines.push('## Acceptance criteria', '');
  for (const ac of brief.acceptanceCriteria) lines.push(`- ${ac}`);
  lines.push('');

  lines.push('## Exploration hints', '');
  for (const hint of brief.explorationHints) lines.push(`- ${hint}`);
  lines.push('');

  if (brief.openQuestions.length > 0) {
    lines.push('## Open questions', '');
    for (const question of brief.openQuestions) lines.push(`- ${question}`);
    lines.push('');
  }

  return lines.join('\n');
}

/** Merges the Analyst's brief into the raw ticket text so downstream agents
 * (Explorer, Planner) read a distilled understanding plus concrete
 * exploration hints, not just the raw ticket wall of text — this is the
 * actual mechanism by which "understanding happens before exploring." */
export function briefedRequirements(raw: string, brief: RequirementsBrief): string {
  return [
    raw,
    '',
    "Analyst's understanding:",
    brief.understanding,
    '',
    'Acceptance criteria (extracted):',
    ...brief.acceptanceCriteria.map((ac, index) => `${String(index + 1)}. ${ac}`),
    ...(brief.explorationHints.length > 0
      ? ['', 'Exploration hints:', ...brief.explorationHints.map((hint) => `- ${hint}`)]
      : []),
  ].join('\n');
}
