/**
 * Groq implementation of {@link LlmProvider}. Groq's API is OpenAI-shaped
 * chat completions — stateless, unlike Gemini's `Chat` — so this class owns
 * the full message history itself and resends it on every turn.
 */
import Groq from 'groq-sdk';
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
    for (const result of results) {
      this.messages.push({
        role: 'tool',
        tool_call_id: result.toolCallId,
        content: JSON.stringify(result.result),
      });
    }
    return this.send();
  }

  getUsage(): TokenUsage {
    return { ...this.usage };
  }

  private async send(): Promise<AssistantTurn> {
    const completion: ChatCompletion = await this.client.chat.completions.create({
      model: this.model,
      messages: this.messages,
      ...(this.tools.length > 0 && { tools: this.tools }),
    });

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
