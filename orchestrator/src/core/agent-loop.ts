/**
 * Drives one agent's tool-use conversation to completion against whichever
 * {@link LlmProvider} it was given.
 *
 * Every agent in this project (Explorer, Planner, and later Generator /
 * Healer / Reviewer) ends its turn by calling one dedicated "submit" tool
 * with a JSON-Schema-validated payload, rather than being asked to print
 * JSON in a final text message. Free-text JSON is the fragile choice —
 * markdown fences, trailing commentary, and truncation all corrupt it. A
 * tool call is already structured, already validated against a schema
 * before it reaches here, and the SAME mechanism the agent uses for every
 * other action. `runAgentLoop` recognises that one tool by name and stops.
 *
 * Console output here is purely additive presentation — a live spinner
 * while waiting on the model ("thinking") or a tool ("doing"), then a
 * persistent one-line result — layered on top of, never replacing,
 * `run.appendStep`'s lossless JSONL record. See `util/spinner.ts` and
 * `util/agents-meta.ts` for why this degrades to silence outside a real
 * terminal rather than ever touching the forensic log.
 */
import type { AssistantTurn, LlmProvider, ToolDefinition, ToolResult } from '../providers/types.js';
import { agentPrefix } from '../util/agents-meta.js';
import { withSpinner } from '../util/spinner.js';
import type { RunContext } from './run.js';

export interface ToolImplementation {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>): Promise<unknown>;
}

export interface AgentLoopOptions {
  agentName: string;
  provider: LlmProvider;
  systemPrompt: string;
  userMessage: string;
  tools: ToolImplementation[];
  /** Name of the tool that ends the loop; its arguments become `submission`. */
  submitToolName: string;
  maxSteps: number;
  run: RunContext;
}

export interface AgentLoopResult {
  /** The validated arguments of the submit-tool call that ended the loop. */
  submission: Record<string, unknown>;
  steps: number;
}

export class AgentLoopError extends Error {}

/** A short, tool-agnostic preview of a tool call's arguments for the live
 * status line — truncates long values rather than knowing anything about
 * any specific tool's shape, the same generic treatment this file already
 * gives every tool. */
function previewArgs(args: Record<string, unknown>): string {
  const parts = Object.entries(args).map(([key, value]) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    const truncated = text.length > 40 ? `${text.slice(0, 40)}…` : text;
    return `${key}=${truncated}`;
  });
  const joined = parts.join(', ');
  return joined.length > 80 ? `${joined.slice(0, 80)}…` : joined;
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const { agentName, provider, systemPrompt, userMessage, tools, submitToolName, maxSteps, run } =
    options;
  const prefix = agentPrefix(agentName);

  const toolsByName = new Map(tools.map((tool) => [tool.definition.name, tool]));
  if (!toolsByName.has(submitToolName)) {
    throw new AgentLoopError(
      `runAgentLoop: submitToolName "${submitToolName}" is not among the provided tools.`
    );
  }

  let turn: AssistantTurn = await withSpinner(`${prefix} is thinking…`, () =>
    provider.start(
      systemPrompt,
      userMessage,
      tools.map((tool) => tool.definition)
    )
  );
  recordUsage(run, provider, agentName);

  for (let step = 1; step <= maxSteps; step += 1) {
    run.assertWithinBudget();

    if (turn.text !== undefined && turn.text.length > 0) {
      run.appendStep({ agent: agentName, kind: 'assistant_text', detail: { text: turn.text } });
    }

    if (turn.toolCalls.length === 0) {
      throw new AgentLoopError(
        `${agentName}: model stopped calling tools without ever calling "${submitToolName}". ` +
          `Last message: ${turn.text ?? '(none)'}`
      );
    }

    const results: ToolResult[] = [];
    for (const call of turn.toolCalls) {
      run.appendStep({
        agent: agentName,
        kind: 'tool_call',
        detail: { step, name: call.name, arguments: call.arguments },
      });

      if (call.name === submitToolName) {
        console.log(`  ${prefix} → ${call.name} ✓`);
        run.appendStep({
          agent: agentName,
          kind: 'tool_result',
          detail: { step, name: call.name, submitted: true },
        });
        return { submission: call.arguments, steps: step };
      }

      const tool = toolsByName.get(call.name);
      if (!tool) {
        const error = `Unknown tool "${call.name}".`;
        console.log(`  ${prefix} → ${call.name} ✗ ${error}`);
        results.push({ toolCallId: call.id, name: call.name, result: { error } });
        run.appendStep({
          agent: agentName,
          kind: 'error',
          detail: { step, name: call.name, error },
        });
        continue;
      }

      const label = `${prefix} → ${call.name}(${previewArgs(call.arguments)})`;
      const startedAt = Date.now();
      try {
        const result = await withSpinner(label, () => tool.execute(call.arguments));
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(`  ${label} ✓ ${elapsed}s`);
        results.push({ toolCallId: call.id, name: call.name, result });
        run.appendStep({
          agent: agentName,
          kind: 'tool_result',
          detail: { step, name: call.name, result },
        });
      } catch (error) {
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  ${label} ✗ ${elapsed}s`);
        results.push({ toolCallId: call.id, name: call.name, result: { error: message } });
        run.appendStep({
          agent: agentName,
          kind: 'error',
          detail: { step, name: call.name, error: message },
        });
      }
    }

    turn = await withSpinner(`${prefix} is thinking…`, () =>
      provider.continueWithToolResults(results)
    );
    recordUsage(run, provider, agentName);
  }

  throw new AgentLoopError(
    `${agentName}: exceeded its ${String(maxSteps)}-step budget without calling "${submitToolName}".`
  );
}

function recordUsage(run: RunContext, provider: LlmProvider, agentName: string): void {
  run.recordUsage(agentName, provider.getUsage());
}
