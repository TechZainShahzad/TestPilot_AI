/**
 * The numbered, named, iconned identity of every pipeline stage — the
 * single place `cli.ts`'s stage banners and `core/agent-loop.ts`'s live
 * status lines both pull from, so a viewer sees the same "Step N/8 ·
 * Explorer" framing everywhere instead of two slightly different
 * vocabularies. Icons match the ones already established in the README's
 * architecture diagram, not invented fresh here.
 */
export interface AgentMeta {
  /** 1-indexed position in the fixed 8-stage pipeline. A repeated stage
   * (a heal loop, a second review round) reuses the same step number —
   * it's the same stage recurring, not a new one. */
  step: number;
  icon: string;
  label: string;
}

export const PIPELINE_STEPS = 9;

export const AGENTS_META: Record<string, AgentMeta> = {
  jira: { step: 1, icon: '🎫', label: 'Jira' },
  // Only runs when --jira-ticket is given — there is no ticket to
  // brainstorm about on a plain --feature run. Still reserves step 2 even
  // when skipped, same convention the Jira step itself already uses.
  analyst: { step: 2, icon: '🧠', label: 'Analyst' },
  explorer: { step: 3, icon: '🔍', label: 'Explorer' },
  planner: { step: 4, icon: '📋', label: 'Planner' },
  generator: { step: 5, icon: '✍️', label: 'Generator' },
  executor: { step: 6, icon: '▶️', label: 'Executor' },
  healer: { step: 7, icon: '🔧', label: 'Healer' },
  reviewer: { step: 8, icon: '🔬', label: 'Reviewer' },
  reporter: { step: 9, icon: '📣', label: 'Reporter' },
};

/** Falls back to a generic, still-numbered-looking identity for a key not
 * in the registry — defensive, not expected to trigger in practice, but
 * an unrecognised agent name should never crash the whole run over a
 * cosmetic label. */
function metaFor(key: string): AgentMeta {
  return AGENTS_META[key] ?? { step: 0, icon: '•', label: key };
}

/** "🔍 Step 2/8 · Explorer" or, with a suffix, "✍️ Step 4/8 · Generator — round 1". */
export function stageLine(key: string, suffix?: string): string {
  const meta = metaFor(key);
  const base = `${meta.icon} Step ${String(meta.step)}/${String(PIPELINE_STEPS)} · ${meta.label}`;
  return suffix ? `${base} — ${suffix}` : base;
}

/** "🔍 Explorer" — the short prefix used on live per-action status lines,
 * where the full "Step N/8" framing would just be noise repeated on every
 * tool call within an already-bannered stage. */
export function agentPrefix(key: string): string {
  const meta = metaFor(key);
  return `${meta.icon} ${meta.label}`;
}
