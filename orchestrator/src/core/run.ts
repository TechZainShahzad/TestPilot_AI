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

/** Rough USD-per-1K-token pricing, for a ballpark cost estimate in the
 * summary only — not billed anywhere, so approximate is fine. Free tiers
 * mean the honest answer is usually "$0.00", which the summary states. */
const USD_PER_1K_TOKENS: Record<string, number> = {
  gemini: 0,
  groq: 0,
};

export class RunContext {
  readonly dir: string;
  readonly startedAt: Date;
  readonly log: Logger;

  private readonly logPath: string;
  private usageByAgent = new Map<string, TokenUsage>();

  constructor(
    readonly feature: string,
    readonly targetUrl: string,
    readonly provider: string
  ) {
    this.startedAt = new Date();
    const stamp = this.startedAt.toISOString().replace(/[:.]/g, '-');
    this.dir = resolve(RUNS_ROOT, stamp);
    mkdirSync(this.dir, { recursive: true });
    this.logPath = resolve(this.dir, 'run.log');
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
