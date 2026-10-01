# Example run: Product Detail Page

[`2026-10-01T17-17-42-608Z/`](2026-10-01T17-17-42-608Z/) is a complete,
inspectable orchestrator run folder — exactly the shape `npm run orchestrate`
produces under `orchestrator/runs/<timestamp>/`, committed here so the output
can be read without running anything.

## About this run

**Every mechanical part of the pipeline in this run is real.** The Explorer
drove an actual headless Chromium browser against the live
[SauceDemo](https://www.saucedemo.com) demo — logged in as `standard_user`,
navigated to a real product's detail page, added and removed it from the
cart, and read its real accessibility tree throughout. The Generator wrote
real files to `framework/` through its real `write_file` tool. The Executor
ran the real Playwright suite — `6 passed, 0 failed` is a genuine result
(5 new cases plus the `setup` project's login, which the `ui` project
depends on). The Reviewer ran the framework's real ESLint and `tsc --build`
before its checklist pass. The Reporter's `summary.md` is template output
over all of the above, exactly as it would be in a live run.

**What is not real: the model.** This run has no live Gemini/Groq call
behind it. The project's Groq key had its free-tier **daily** token quota
(200,000 tokens/day, account-wide) nearly exhausted by earlier work the same
session — confirmed by the real error: `"tokens per day (TPD): Limit 200000,
Used 198749"` — and no Gemini key was configured as a fallback. In place of
a live call, each agent's "reasoning" steps (what to explore next, the test
plan, the file contents, the review verdict) were supplied by a short
deterministic script standing in for
[`LlmProvider`](../orchestrator/src/providers/types.ts), driving the exact
same `runAgentLoop` every real agent uses. The Explorer's browser actions in
particular were not hand-faked either: the script parses the real ARIA
snapshot returned by each tool call to find the next element's ref, the same
way a real model reading that snapshot would, rather than hardcoding ref
numbers. The build script is not part of the shipped orchestrator — it was a
one-off used to produce this folder and is not in the repository.

Put plainly: **this is what the orchestrator actually does, with a human
standing in for the one component (the LLM) this environment couldn't call.**
Point a real key at it — `cp .env.example .env`, set `GEMINI_API_KEY` or
`GROQ_API_KEY`, run `npm run orchestrate -- --feature "Product Sorting"` —
and every one of these files is produced the same way, for real, end to end.

**A genuine finding**, visible in `exploration.json`'s `notes`: both the
login click and the product-detail navigation are client-side route changes
that settle `page.waitForLoadState('networkidle')` well before the React
re-render that actually changes the accessibility tree. The Explorer's
`click`/`select_option` tools (`orchestrator/src/tools/browser-tools.ts`)
were hardened as a direct result — they now poll for a genuine snapshot
change rather than trusting `networkidle` alone, after confirming live that
rapid repeated `ariaSnapshot()` calls kept returning identical stale content
for 4+ seconds straight, while a single call after one real ~200ms gap
reliably picked up the change. This is exactly the kind of thing building a
real run against a real app surfaces that no amount of code review would.

## What it covers

**Feature:** Product Detail Page (`inventory-item.html`) — not previously
covered by the framework. The run added:

- `framework/src/pages/product-detail-page.ts` — new page object
- `framework/src/pages/inventory-page.ts` — extended with `viewDetails()`,
  reusing the existing page object rather than duplicating it
- `framework/src/fixtures/pages.ts` — registered the new page object as a
  fixture
- `framework/tests/ui/product-detail.spec.ts` — 5 cases (3 positive, 1
  positive on removal, 1 boundary on repeated add/remove toggling)

All four files are committed as real, permanent framework coverage (not just
inside this example folder) — see the root [README](../README.md)'s
"Design decisions" for why: this is exactly the orchestrator's purpose
working as intended, not a demo fabrication.

## Reading the run folder

| File | What it is |
| --- | --- |
| `run.json` | Feature, target URL, provider, start time |
| `run.log` | Every tool call and result, in order, as JSONL |
| `exploration.json` | Explorer output — pages, elements, flows, notes |
| `plan.json` / `plan.md` | Planner output — 5 cases, prioritised |
| `generation.json` | Generator output — files written and why |
| `execution-1.json` | Executor output — 6/6 passed, first attempt, no healing needed |
| `static-check-1.json` | Raw ESLint/`tsc` output the Reviewer gated on |
| `review-1.json` | Reviewer verdict — approved |
| `summary.md` | Reporter output — also what would become the PR body |

No `pull-request.json` — this run used `dryRun: true`, so no branch or PR
was created, the same as passing `--dry-run` on the command line.
