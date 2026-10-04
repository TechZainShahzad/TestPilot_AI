/**
 * Groq implementation of {@link LlmProvider}. Groq's API is OpenAI-shaped
 * chat completions — stateless, unlike Gemini's `Chat` — so this class owns
 * the full message history itself and resends it on every turn.
 *
 * That resend matters for a browsing agent specifically: the Explorer's
 * tool results carry a full ARIA snapshot (up to ~12,000 chars each), and
 * every earlier snapshot becomes dead weight the moment a newer action
 * supersedes it — nothing downstream needs to know what the page looked
 * like two actions ago. Left unchecked, four real tool-calling turns
 * (navigate, fill, fill, click) accumulated enough resent history to blow
 * straight through Groq's free-tier rate limit (8,000 tokens/minute,
 * confirmed live — not a model-specific cap, every model on the free tier
 * shares it) on the fifth call, having done nothing wrong except
 * accumulate its own history. `collapseOlderToolResults()` keeps only the
 * most recent turn's tool results at full size and replaces everything
 * earlier with a short placeholder before every send.
 */
import Groq, { APIError, RateLimitError } from 'groq-sdk';
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'groq-sdk/resources/chat/completions';

import type {
  AssistantTurn,
  LlmProvider,
  ToolCall,
  ToolDefinition,
  ToolResult,
  TokenUsage,
} from './types.js';

/** Tool results shorter than this are cheap enough to leave alone even once stale. */
const COLLAPSE_THRESHOLD_CHARS = 500;
const COLLAPSED_PLACEHOLDER =
  '[earlier tool result omitted to save context — superseded by a more recent action]';

function toChatCompletionTool(tool: ToolDefinition): ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      // `FunctionParameters` is a bare index-signature type; `ToolParameterSchema`
      // is structurally compatible (every value is JSON-serialisable) but TS
      // requires the source to declare its own index signature to satisfy
      // that shape directly, which would loosen an otherwise precise type.
      parameters: tool.parameters as unknown as Record<string, unknown>,
    },
  };
}

export class GroqProvider implements LlmProvider {
  readonly name = 'groq';
  readonly model: string;

  private readonly client: Groq;
  private messages: ChatCompletionMessageParam[] = [];
  private tools: ChatCompletionTool[] = [];
  private usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  constructor(apiKey: string, model: string) {
    this.client = new Groq({ apiKey });
    this.model = model;
  }

  async start(
    systemPrompt: string,
    userMessage: string,
    tools: ToolDefinition[]
  ): Promise<AssistantTurn> {
    this.tools = tools.map(toChatCompletionTool);
    this.messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];
    return this.send();
  }

  async continueWithToolResults(results: ToolResult[]): Promise<AssistantTurn> {
    if (this.messages.length === 0) {
      throw new Error('GroqProvider.continueWithToolResults called before start()');
    }
    this.collapseOlderToolResults();
    for (const result of results) {
      this.messages.push({
        role: 'tool',
        tool_call_id: result.toolCallId,
        content: JSON.stringify(result.result),
      });
    }
    return this.send();
  }

  /** Replaces every existing large tool-result message with a short
   * placeholder, keeping only what the model is about to see fresh. Called
   * before each new batch of results is appended, so exactly one turn's
   * worth of full tool output is ever in flight at a time. */
  private collapseOlderToolResults(): void {
    for (const message of this.messages) {
      if (
        message.role === 'tool' &&
        typeof message.content === 'string' &&
        message.content.length > COLLAPSE_THRESHOLD_CHARS
      ) {
        message.content = COLLAPSED_PLACEHOLDER;
      }
    }
  }

  getUsage(): TokenUsage {
    return { ...this.usage };
  }

  private async send(): Promise<AssistantTurn> {
    const completion = await this.createWithRetry();

    const usage = completion.usage;
    this.usage.promptTokens += usage?.prompt_tokens ?? 0;
    this.usage.completionTokens += usage?.completion_tokens ?? 0;
    this.usage.totalTokens += usage?.total_tokens ?? 0;

    const message = completion.choices[0]?.message;
    if (!message) {
      throw new Error('Groq returned no completion choices.');
    }
    // The assistant's own turn — including its tool call requests — has to
    // go back into the message array, or the model loses track of what it
    // asked for when the next `continueWithToolResults` call resends history.
    this.messages.push(message);

    const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments: parseArguments(call.function.arguments, call.function.name),
    }));

    return { text: message.content ?? undefined, toolCalls };
  }

  /**
   * Retries on a token-budget error using the exact wait time Groq's own
   * error message reports (`"Please try again in 1.7025s."`) — confirmed
   * live: the free tier's 8,000-token/minute budget is tight enough that a
   * single agent occasionally gets throttled by normal, correctly-sized
   * requests, not runaway ones (see the class-level note on
   * `collapseOlderToolResults` for the difference).
   *
   * Groq signals this two different ways for the same underlying budget,
   * confirmed live from two separate failures: `429` ("you've used your
   * budget, wait") comes back as the SDK's own `RateLimitError`, but `413`
   * ("this one request alone is too big") comes back as a plain `APIError`
   * — the SDK only special-cases 429. Checking `RateLimitError` alone
   * silently skipped retrying on the 413 case and crashed the whole run
   * instead of surfacing it after a bounded, backed-off retry like every
   * other token-budget error. Note what retrying does *not* fix: nothing
   * re-shrinks `this.messages` between attempts here, so if a 413 is
   * caused by this one request's own size (no trailing `"Used: ..."` in
   * Groq's message, confirmed live) rather than exhausted budget, retrying
   * reproduces the identical oversized payload and fails again the same
   * way — a real example hit `maxAttempts` doing exactly that, caused by
   * the model re-reading the same two files three times each rather than
   * converging, which `collapseOlderToolResults` cannot help with since it
   * only collapses past rounds' `tool` messages, not the fixed `user`
   * message (which embeds the full plan/exploration JSON on every single
   * turn, never shrinking) or accumulating `assistant` messages. That is a
   * separate, real gap this fix does not close. Both 413 and 429 still
   * carry the same `"rate_limit_exceeded"` code in the response body, so
   * both are retried the same way here, distinguished from every other
   * `APIError` (bad request, auth failure, etc.) by status code, which
   * never retrying on would just waste `maxAttempts` on an error no wait
   * fixes.
   *
   * Falls back to linear backoff if the message format ever changes. Gives
   * up after `maxAttempts`, surfacing the real error.
   */
  private async createWithRetry(maxAttempts = 4): Promise<ChatCompletion> {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.client.chat.completions.create({
          model: this.model,
          messages: this.messages,
          ...(this.tools.length > 0 && { tools: this.tools }),
          // An explicit cap, not Groq's own default: confirmed live that an
          // unbounded completion can get silently truncated mid-JSON when
          // the free tier's remaining per-minute budget runs low, producing
          // a tool call whose arguments fail to parse rather than a clean
          // error. A fixed budget makes that failure mode predictable
          // instead of depending on how much of the rolling window happens
          // to be left.
          max_completion_tokens: 4096,
        });
      } catch (error) {
        const isTokenBudgetError =
          error instanceof RateLimitError || (error instanceof APIError && error.status === 413);
        if (!isTokenBudgetError || attempt === maxAttempts) {
          throw error;
        }
        const waitMs = parseRetryAfterMs(error.message) ?? attempt * 2000;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
    // Unreachable — the loop above always returns or throws — but required
    // so every code path has a return type under `noImplicitReturns`.
    throw new Error('createWithRetry: exhausted retries without a result or a thrown error.');
  }
}

/** Parses `"...try again in 1.7s..."` out of Groq's own rate-limit message,
 * with a 250ms buffer so a clock-skewed retry doesn't immediately re-throttle. */
function parseRetryAfterMs(message: string): number | undefined {
  const match = /try again in ([\d.]+)s/i.exec(message);
  const seconds = match?.[1] !== undefined ? Number(match[1]) : NaN;
  return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) + 250 : undefined;
}

/** Groq (like any OpenAI-shaped API) can hand back malformed JSON arguments
 * — the type system promises a string, reality does not promise it parses. */
function parseArguments(raw: string, toolName: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error(`Arguments for "${toolName}" did not parse to an object.`);
  } catch (error) {
    throw new Error(
      `Failed to parse arguments for tool "${toolName}": ${raw}`,
      error instanceof Error ? { cause: error } : undefined
    );
  }
}
