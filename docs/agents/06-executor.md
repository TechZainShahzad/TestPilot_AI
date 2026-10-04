# Step 6 · ▶️ Executor

**Type:** Deterministic — no LLM call.
**Runs:** once per round, and again after every Healer attempt (bounded
by `MAX_HEAL_ATTEMPTS`).

## Purpose

Run the Generator's spec files for real and parse the results into
structured JSON. Deliberately not an LLM agent: running a test suite and
parsing its own JSON reporter output needs no reasoning, and giving it a
model would only add latency, cost, and a place for hallucination that a
plain function can't have.

## Inputs

- The spec file paths the Generator just wrote (or the same paths again,
  re-run after a heal).
- `--headed`, if passed — forces this real Playwright run visible,
  independent of `.env`'s own `HEADLESS` setting (only overrides it when
  explicitly `true`; omitted leaves an existing `.env` setup untouched).

## What it does

Resolves `@playwright/test`'s own CLI script and runs it with `node`
directly — `node <resolved cli.js> test --reporter=json <specFiles>` —
rather than `npx playwright`. `npx` on Windows is a `.cmd` file, only
launchable via a shell, and passing an argument array through a shell
means Node string-joins them without escaping: a real command-injection
surface for arguments built from file paths, not a hypothetical one.
`node <cli.js>` needs no shell on any platform.

A non-zero exit code is treated as "tests failed" (Playwright's normal
behaviour), not a tool error — the JSON report is still on stdout and is
what actually matters.

## Tools available

None — this isn't an agent in the tool-calling sense at all.

## Outputs (files written)

- `execution-<n>.json` — `passed`/`failed`/`skipped` counts and, per
  test, `file`, `title`, `status`, `durationMs`, and `error` if it
  failed. `<n>` is the attempt number across the whole
  Execute ⇄ Heal loop.

## Source

[`orchestrator/src/core/executor.ts`](../../orchestrator/src/core/executor.ts)
