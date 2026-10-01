/**
 * Gemini implementation of {@link LlmProvider}, backed by `@google/genai`'s
 * `Chat` session — it keeps the turn history, so this class only needs to
 * remember the `Chat` instance itself and running token totals.
 */
import type { Chat, FunctionDeclaration, GenerateContentResponse, Part } from '@google/genai';
import { GoogleGenAI } from '@google/genai';

import type {
  AssistantTurn,
  LlmProvider,
  ToolCall,
  ToolDefinition,
  ToolResult,
  TokenUsage,
} from './types.js';

function toFunctionDeclaration(tool: ToolDefinition): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.parameters,
  };
}

export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  readonly model: string;

  private readonly client: GoogleGenAI;
  private chat: Chat | undefined;
  private usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  constructor(apiKey: string, model: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async start(
    systemPrompt: string,
    userMessage: string,
    tools: ToolDefinition[]
  ): Promise<AssistantTurn> {
    this.chat = this.client.chats.create({
      model: this.model,
      config: {
        systemInstruction: systemPrompt,
        ...(tools.length > 0 && {
          tools: [{ functionDeclarations: tools.map(toFunctionDeclaration) }],
        }),
      },
    });
    const response = await this.chat.sendMessage({ message: userMessage });
    return this.toAssistantTurn(response);
  }

  async continueWithToolResults(results: ToolResult[]): Promise<AssistantTurn> {
    if (!this.chat) {
      throw new Error('GeminiProvider.continueWithToolResults called before start()');
    }
    const parts: Part[] = results.map((r) => ({
      functionResponse: { id: r.toolCallId, name: r.name, response: { output: r.result } },
    }));
    const response = await this.chat.sendMessage({ message: parts });
    return this.toAssistantTurn(response);
  }

  getUsage(): TokenUsage {
    return { ...this.usage };
  }

  private toAssistantTurn(response: GenerateContentResponse): AssistantTurn {
    const usage = response.usageMetadata;
    this.usage.promptTokens += usage?.promptTokenCount ?? 0;
    this.usage.completionTokens += usage?.candidatesTokenCount ?? 0;
    this.usage.totalTokens += usage?.totalTokenCount ?? 0;

    const calls = response.functionCalls ?? [];
    const toolCalls: ToolCall[] = calls.map((call, index) => ({
      id: call.id ?? `${call.name ?? 'call'}_${String(index)}`,
      name: call.name ?? '',
      arguments: call.args ?? {},
    }));

    return { text: response.text, toolCalls };
  }
}
