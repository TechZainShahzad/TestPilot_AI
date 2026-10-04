/**
 * Claude Code CLI implementation of {@link LlmProvider} — shells out to the
 * locally-installed, already-authenticated `claude` CLI rather than calling
 * an API directly. This is the one provider that is NOT usable in CI: it
 * depends on an interactive Claude subscription session on the machine
 * running the orchestrator, not an API key in `.env`. See "Claude Code
 * CLI, confirmed live" in docs/agents.md for what was verified and why
 * each design choice here is load-bearing, not incidental.
 *
 * Tool-calling isn't native the way Groq/Gemini's function-calling is: the
 * CLI's own `--tools` flag only restricts its own built-in tools (Bash,
 * Edit, Read, ...), it doesn't accept arbitrary custom tool schemas the
 * way a function-calling API does, and real custom tools only arrive via
 * MCP servers — a different shape than "the orchestrator executes
 * browser/file tools itself, turn by turn" (see `core/agent-loop.ts`).
 * Instead, every turn asks for a structured JSON response via
 * `--json-schema` — a `oneOf`-by-tool-name wrapper built from the same
 * `ToolDefinition[]` the other providers consume — with `--tools ""`
 * disabling every one of Claude Code's own built-in tools, so it only
 * ever produces text, never actually touches the filesystem or a shell on
 * its own.
 *
 * Confirmed live: the prompt goes over stdin, not argv — Windows' ~8KB
 * command-line length limit would otherwise be blown by a Planner/
 * Generator turn carrying a full `exploration.json`/`plan.json` payload.
 * `--resume <sessionId>` keeps the conversation stateful across turns
 * without resending history manually (unlike `GroqProvider`), and
 * `--json-schema` reliably disambiguates between multiple tools with
 * different argument shapes offered in the same call.
 */
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type {
  AssistantTurn,
  LlmProvider,
  ToolCall,
  ToolDefinition,
  ToolResult,
  TokenUsage,
} from './types.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let cachedClaudeBin: string | undefined;

/**
 * Resolves the real `claude` binary to invoke, bypassing Windows' `.cmd`
 * shim rather than working around it with `shell: true` — confirmed live
 * that `shell: true` plus an args array does NOT safely escape each
 * argument (Node's own DEP0190: "arguments are not escaped, only
 * concatenated"), which silently corrupted a quote-heavy `--json-schema`
 * value in practice. A global npm install of `claude` on Windows is a
 * `.cmd` wrapper (`where claude` resolves to `claude.cmd`) that itself
 * just launches a real `claude.exe` next to it — `.cmd`/`.bat` files
 * can't be launched directly by `CreateProcess` without a shell, a
 * Windows OS fact, not a Node limitation, so this reads the shim's own
 * (plain, trusted — it's our own machine's npm install, not external
 * input) contents once to find and cache the real executable, letting
 * every call spawn it directly with `shell: false` like everywhere else
 * in this project. Not needed outside Windows, where `claude` is already
 * directly executable.
 */
export function resolveClaudeBin(): string {
  if (cachedClaudeBin !== undefined) return cachedClaudeBin;

  if (process.platform !== 'win32') {
    cachedClaudeBin = 'claude';
    return cachedClaudeBin;
  }

  const whereOutput = execFileSync('where', ['claude'], { encoding: 'utf-8' });
  const cmdPath = whereOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().endsWith('.cmd'));
  if (cmdPath === undefined) {
    throw new Error(`\`where claude\` did not return a .cmd shim to resolve:\n${whereOutput}`);
  }

  const shimContent = readFileSync(cmdPath, 'utf-8');
  const match = /"%dp0%\\(.+?\.exe)"/.exec(shimContent);
  if (!match?.[1]) {
    throw new Error(`Could not find the wrapped .exe path inside ${cmdPath}.`);
  }

  cachedClaudeBin = join(dirname(cmdPath), match[1]);
  return cachedClaudeBin;
}

interface ClaudeCliEnvelope {
  session_id: string;
  result: string;
  is_error: boolean;
  usage?: { input_tokens?: number; output_tokens?: number };
  /** List-price-equivalent USD for this turn — real for an API key, a
   * notional "what this would have cost" figure under a subscription.
   * Never summed into the budget/billing path, only surfaced for display. */
  total_cost_usd?: number;
  /** Keyed by the actual model the CLI resolved to run this turn — present
   * even when no `--model` flag was passed, so this is the only reliable
   * way to learn what "subscription default" actually resolved to. */
  modelUsage?: Record<string, unknown>;
}

interface ToolCallBody {
  toolCalls: { name: string; arguments: Record<string, unknown> }[];
  text?: string;
}

/** Builds a `oneOf`-by-`name` JSON Schema so `--json-schema` can
 * disambiguate between tools with different argument shapes in one call —
 * each tool's own {@link ToolDefinition.parameters} is already plain JSON
 * Schema, embedded directly as that branch's `arguments`. */
function buildToolCallSchema(tools: ToolDefinition[]): object {
  return {
    type: 'object',
    properties: {
      toolCalls: {
        type: 'array',
        minItems: 1,
        items: {
          oneOf: tools.map((tool) => ({
            type: 'object',
            properties: {
              name: { const: tool.name },
              arguments: tool.parameters,
            },
            required: ['name', 'arguments'],
          })),
        },
      },
      text: { type: 'string' },
    },
    required: ['toolCalls'],
  };
}

/**
 * Spawns the real `claude` executable (via {@link resolveClaudeBin}) with
 * an argument array — `shell: false`, same injection-safety convention as
 * `core/git.ts`/`core/executor.ts` — and collects stdout, killing the
 * process after `timeoutMs` so a hung CLI can't hang the whole run.
 */
function runClaudeCli(args: string[], stdinText: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveClaudeBin(), args, { shell: false });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`claude CLI timed out after ${String(timeoutMs)}ms.`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`claude CLI exited with code ${String(code)}: ${stderr}`));
        return;
      }
      resolve(stdout);
    });

    child.stdin.write(stdinText);
    child.stdin.end();
  });
}

export class ClaudeCodeProvider implements LlmProvider {
  readonly name = 'claude-code';
  readonly model: string;

  private sessionId: string | undefined;
  private systemPrompt = '';
  private tools: ToolDefinition[] = [];
  private usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  private resolvedModels = new Set<string>();
  private listPriceUsd = 0;

  constructor(
    model: string | undefined,
    private readonly timeoutMs: number
  ) {
    this.model = model ?? 'default';
  }

  async start(
    systemPrompt: string,
    userMessage: string,
    tools: ToolDefinition[]
  ): Promise<AssistantTurn> {
    // Every agent (Explorer, Planner, Generator, Healer, Reviewer) shares
    // one `ClaudeCodeProvider` instance for the whole run (see cli.ts), but
    // each must get its OWN fresh conversation with its OWN system prompt —
    // the shared `LlmProvider` contract's "Starts a fresh conversation"
    // promise. Without resetting `sessionId` here, every agent after the
    // first would silently `--resume` the previous agent's session: `invoke`
    // only sends `--system-prompt` when `sessionId` is undefined, so the
    // Planner/Generator/Healer/Reviewer would never actually receive their
    // own role prompt, continuing instead as an unbroken extension of the
    // Explorer's conversation.
    this.sessionId = undefined;
    this.systemPrompt = systemPrompt;
    this.tools = tools;
    return this.invoke(userMessage);
  }

  async continueWithToolResults(results: ToolResult[]): Promise<AssistantTurn> {
    if (this.sessionId === undefined) {
      throw new Error('ClaudeCodeProvider.continueWithToolResults called before start()');
    }
    const resultsText = results
      .map((r) => `Tool "${r.name}" result:\n${JSON.stringify(r.result)}`)
      .join('\n\n');
    return this.invoke(resultsText);
  }

  getUsage(): TokenUsage {
    return { ...this.usage };
  }

  /** The model(s) the CLI actually ran, resolved from live responses rather
   * than asserted — plural because a run that mixed an explicit
   * `CLAUDE_CODE_MODEL` with a differently-resolved default (or Claude
   * Code's own internal use of a smaller model for a sub-step) would
   * otherwise silently collapse to one misleading name. `undefined` before
   * any call has completed. */
  getResolvedModel(): string | undefined {
    return this.resolvedModels.size > 0 ? [...this.resolvedModels].join(', ') : undefined;
  }

  /** Cumulative `total_cost_usd` across every turn — see the field's own
   * docstring on {@link ClaudeCliEnvelope} for why this is a display-only,
   * list-price-equivalent figure, never the run's actual billed cost. */
  getListPriceUsd(): number {
    return this.listPriceUsd;
  }

  private async invoke(promptText: string): Promise<AssistantTurn> {
    const schema = buildToolCallSchema(this.tools);
    const args = [
      '-p',
      '--output-format',
      'json',
      '--tools',
      '',
      '--json-schema',
      JSON.stringify(schema),
    ];

    if (this.sessionId !== undefined) {
      args.push('--resume', this.sessionId);
    } else {
      args.push('--system-prompt', this.systemPrompt);
    }
    if (this.model !== 'default') {
      args.push('--model', this.model);
    }

    const raw = await runClaudeCli(args, promptText, this.timeoutMs);
    const envelope = JSON.parse(raw) as ClaudeCliEnvelope;
    // Validated before being trusted as an argv value on the next call —
    // see the "safe here" note on runClaudeCli for why this matters with
    // shell: true.
    if (!UUID_PATTERN.test(envelope.session_id)) {
      throw new Error(`claude CLI returned a non-UUID session_id: "${envelope.session_id}"`);
    }
    this.sessionId = envelope.session_id;

    if (envelope.is_error) {
      throw new Error(`claude CLI returned an error: ${envelope.result}`);
    }

    this.usage.promptTokens += envelope.usage?.input_tokens ?? 0;
    this.usage.completionTokens += envelope.usage?.output_tokens ?? 0;
    this.usage.totalTokens +=
      (envelope.usage?.input_tokens ?? 0) + (envelope.usage?.output_tokens ?? 0);
    this.listPriceUsd += envelope.total_cost_usd ?? 0;
    for (const modelName of Object.keys(envelope.modelUsage ?? {})) {
      this.resolvedModels.add(modelName);
    }

    const body = JSON.parse(envelope.result) as ToolCallBody;
    const toolCalls: ToolCall[] = body.toolCalls.map((call) => ({
      id: randomUUID(),
      name: call.name,
      arguments: call.arguments,
    }));

    return { text: body.text, toolCalls };
  }
}
