/**
 * Provider-agnostic interface the agents are written against. Gemini and
 * Groq each hide their own session model behind it — Gemini's `Chat` object
 * keeps server-side-ish turn state; Groq (OpenAI-compatible) is stateless,
 * so its implementation keeps the full message array itself. Neither
 * detail should ever leak into an agent.
 *
 * Tool parameters are plain JSON Schema throughout, deliberately: it is the
 * one shape both `@google/genai`'s `parametersJsonSchema` and groq-sdk's
 * `FunctionDefinition.parameters` accept natively, so a single
 * `ToolDefinition` works unmodified against either provider.
 */

export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}

export interface ToolCall {
  /** Synthesised when a provider doesn't supply one (Gemini usually doesn't). */
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  /** JSON-serialisable; providers stringify it as needed. */
  result: unknown;
}

export interface AssistantTurn {
  text: string | undefined;
  toolCalls: ToolCall[];
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;

  /** Starts a fresh conversation: system prompt, first user message, tools on offer. */
  start(systemPrompt: string, userMessage: string, tools: ToolDefinition[]): Promise<AssistantTurn>;

  /**
   * Continues the conversation with the results of every tool call from the
   * previous turn. Must only be called after `start()`, once per round of
   * tool calls.
   */
  continueWithToolResults(results: ToolResult[]): Promise<AssistantTurn>;

  /** Cumulative usage across every turn this instance has made. */
  getUsage(): TokenUsage;

  /**
   * The concrete model actually used, only when that isn't already known
   * from config (e.g. claude-code's own subscription default, resolved
   * from its response rather than a `--model` flag the caller chose).
   * Gemini/Groq don't implement this — their configured model string is
   * already exact.
   */
  getResolvedModel?(): string | undefined;

  /**
   * Cumulative USD a provider's own backend reports directly, when that
   * figure isn't a static $/1K-token estimate (e.g. claude-code CLI's
   * `total_cost_usd` — a list-price-equivalent figure for a subscription
   * call that is not actually billed per token).
   */
  getListPriceUsd?(): number;
}
