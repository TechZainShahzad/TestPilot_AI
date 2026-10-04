# Agents — one file per stage

The nine stages of the orchestrator pipeline, each documented on its own:
what it reads, what it writes, what tools (if any) it has, and the rule
that's actually enforced versus merely prompted. For the visual, all-in-
one-diagram version of how these connect — including every file written
along the way — see [`../workflow.md`](../workflow.md). For the
condensed table-plus-guardrails version of the same material, see
[`../agents.md`](../agents.md).

| #   | Agent                           | Type             | Runs                                    |
| --- | ------------------------------- | ---------------- | --------------------------------------- |
| 1   | [🎫 Jira](01-jira.md)           | Deterministic    | only with `--jira-ticket`               |
| 2   | [🧠 Analyst](02-analyst.md)     | LLM agent        | only with `--jira-ticket`               |
| 3   | [🔍 Explorer](03-explorer.md)   | LLM agent        | always                                  |
| 4   | [📋 Planner](04-planner.md)     | LLM agent        | always                                  |
| 5   | [✍️ Generator](05-generator.md) | LLM agent        | always; re-runs on review rejection     |
| 6   | [▶️ Executor](06-executor.md)   | Deterministic    | always; re-runs after each heal attempt |
| 7   | [🔧 Healer](07-healer.md)       | LLM agent        | only when a round has failures          |
| 8   | [🔬 Reviewer](08-reviewer.md)   | Gate + LLM agent | once per generate round                 |
| 9   | [📣 Reporter](09-reporter.md)   | Deterministic    | always, exactly once                    |

Numbering matches the CLI's own live output
(`orchestrator/src/util/agents-meta.ts`) — "Step 5/9 · Generator" in the
terminal is the same step 5 as this table's.
