/**
 * Everything written to `orchestrator/runs/<timestamp>/` — the typed JSON
 * artifacts, the JSONL step log, and token/cost accounting — goes through
 * one `RunContext` per invocation, so a run is reconstructable from its
 * folder alone (see docs/agents.md).
 */
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { TokenUsage } from '../providers/types.js';
import { config, RUNS_ROOT } from './config.js';
import { createLogger, type Logger } from '../util/logger.js';

export interface StepLogEntry {
  ts: string;
  agent: string;
  kind: 'tool_call' | 'tool_result' | 'assistant_text' | 'error';
  detail: Record<string, unknown>;
}

/**
 * One full LLM turn — exactly what was sent and exactly what came back —
 * for every agent, every step. `run.appendStep` already records tool
 * calls/results and assistant text individually, but never the request
 * side (the system prompt, the user message, or the tool-results payload
 * actually sent that turn) paired against the response as one unit. This
 * is the dedicated, lossless answer to "what did we ask, what did it
 * return" that `appendStep`'s per-tool-call granularity doesn't give you.
 */
export interface LlmCallRecord {
  ts: string;
  agent: string;
  /** 0 for the opening `start()` call, then the loop step number for every
   * `continueWithToolResults()` call after it. */
  step: number;
  /** The model that actually handled this call — `provider.getResolvedModel()`
   * when the provider can only know it after a call (claude-code's own
   * subscription default), otherwise `provider.model`. */
  model: string;
  request: {
    systemPrompt?: string;
    userMessage?: string;
    toolResults?: { name: string; result: unknown }[];
  };
  response: {
    text: string | undefined;
    toolCalls: { name: string; arguments: Record<string, unknown> }[];
  };
}

/** Rough USD-per-1K-token pricing, for a ballpark cost estimate in the
 * summary only — not billed anywhere, so approximate is fine. Free tiers
 * mean the honest answer is usually "$0.00", which the summary states. */
// claude-code is the same $0.00 marginal-cost story for a different
// reason: it runs on a Claude subscription (flat monthly rate), not
// pay-per-token — the CLI's own total_cost_usd field reports a
// list-price-equivalent figure, not real incremental billing, so it is
// deliberately not used here.
const USD_PER_1K_TOKENS: Record<string, number> = {
  gemini: 0,
  groq: 0,
  'claude-code': 0,
};

export class RunContext {
  readonly dir: string;
  readonly startedAt: Date;
  readonly log: Logger;

  private readonly logPath: string;
  private readonly llmCallsPath: string;
  private usageByAgent = new Map<string, TokenUsage>();

  constructor(
    readonly feature: string,
    readonly targetUrl: string,
    readonly provider: string,
    /** When true, every LLM call's full request/response is also echoed,
     * truncated, to the console as it happens — see `core/agent-loop.ts`.
     * `llm-calls.jsonl` is written either way; this only controls the
     * live terminal preview. */
    readonly verboseLlm = false
  ) {
    this.startedAt = new Date();
    const stamp = this.startedAt.toISOString().replace(/[:.]/g, '-');
    this.dir = resolve(RUNS_ROOT, stamp);
    mkdirSync(this.dir, { recursive: true });
    this.logPath = resolve(this.dir, 'run.log');
    this.llmCallsPath = resolve(this.dir, 'llm-calls.jsonl');
    this.log = createLogger('run');

    this.saveJson('run.json', {
      feature,
      targetUrl,
      provider,
      startedAt: this.startedAt.toISOString(),
    });
  }

  saveJson(filename: string, data: unknown): void {
    writeFileSync(resolve(this.dir, filename), JSON.stringify(data, null, 2));
  }

  saveText(filename: string, content: string): void {
    writeFileSync(resolve(this.dir, filename), content);
  }

  appendStep(entry: Omit<StepLogEntry, 'ts'>): void {
    const full: StepLogEntry = { ts: new Date().toISOString(), ...entry };
    appendFileSync(this.logPath, `${JSON.stringify(full)}\n`);
  }

  /** Appends one full request/response pair to `llm-calls.jsonl` — every
   * LLM call this run makes, across every agent, in one file. */
  recordLlmCall(entry: Omit<LlmCallRecord, 'ts'>): void {
    const full: LlmCallRecord = { ts: new Date().toISOString(), ...entry };
    appendFileSync(this.llmCallsPath, `${JSON.stringify(full)}\n`);
  }

  recordUsage(agent: string, usage: TokenUsage): void {
    this.usageByAgent.set(agent, usage);
  }

  /** Total tokens and an approximate USD cost across every agent so far. */
  totals(): { usage: TokenUsage; estimatedUsd: number } {
    const usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    for (const u of this.usageByAgent.values()) {
      usage.promptTokens += u.promptTokens;
      usage.completionTokens += u.completionTokens;
      usage.totalTokens += u.totalTokens;
    }
    const perThousand = USD_PER_1K_TOKENS[this.provider] ?? 0;
    const estimatedUsd = (usage.totalTokens / 1000) * perThousand;
    return { usage, estimatedUsd };
  }

  /** Throws once the run has spent more than the configured token budget —
   * checked by the pipeline between agent steps, not inside the loop, so a
   * single runaway tool-call burst can't blow past it unnoticed. */
  assertWithinBudget(): void {
    const { usage } = this.totals();
    if (usage.totalTokens > config.limits.maxTokensPerRun) {
      throw new Error(
        `Run exceeded the token budget: ${String(usage.totalTokens)} > ${String(config.limits.maxTokensPerRun)}. ` +
          `Raise MAX_TOKENS_PER_RUN in .env if this was expected.`
      );
    }
  }
}
