# Example run: Update Contact Info

[`2026-10-01T12-32-30-704Z/`](2026-10-01T12-32-30-704Z/) is a complete,
inspectable orchestrator run folder — exactly the shape `npm run orchestrate`
produces under `orchestrator/runs/<timestamp>/`, committed here so the output
can be read without running anything.

## About this run

**Every mechanical part of the pipeline in this run is real.** The Explorer
drove an actual headless Chromium browser against the live
[ParaBank](https://parabank.parasoft.com) demo — registered a real customer,
navigated to the real `updateprofile.htm`, and read its real accessibility
tree. The Generator wrote real files to `framework/` through its real
`write_file` tool. The Executor ran the real Playwright suite — `4 passed, 0
failed` is a genuine result, not a mocked one. The Reviewer ran the
framework's real ESLint and `tsc --build` before its checklist pass. The
Reporter's `summary.md` is template output over all of the above, exactly as
it would be in a live run.

**What is not real: the model.** This run has no `GEMINI_API_KEY` or
`GROQ_API_KEY` behind it — building this project did not include paid API
access. In place of a live Gemini/Groq call, each agent's "reasoning" steps
(what to explore next, the test plan, the file contents, the review verdict)
were supplied by a short deterministic script standing in for
[`LlmProvider`](../orchestrator/src/providers/types.ts), driving the exact
same `runAgentLoop` every real agent uses. The Explorer's browser actions in
particular were not hand-faked either: the script parses the real ARIA
snapshot returned by each tool call to find the next element's ref, the same
way a real model reading that snapshot would, rather than hardcoding ref
numbers. The build script is not part of the shipped orchestrator — it was a
one-off used to produce this folder and is not in the repository.

Put plainly: **this is what the orchestrator actually does, with a human
standing in for the one component (the LLM) this environment couldn't call.**
Point a real key at it — `cp .env.example .env`, set `GEMINI_API_KEY`, run
`npm run orchestrate -- --feature "Transfer Funds"` — and every one of these
files is produced the same way, for real, end to end.

## What it covers

**Feature:** Update Contact Info (`updateprofile.htm`) — not previously
covered by the framework. The run added:

- `framework/src/pages/update-profile-page.ts` — new page object
- `framework/src/data/profile-update-builder.ts` — new Faker-backed data builder
- `framework/src/fixtures/pages.ts` — registered the new page object as a fixture
- `framework/tests/ui/update-profile.spec.ts` — 3 cases (1 positive, 2 negative)

All four files are committed as real, permanent framework coverage (not just
inside this example folder) — see the root [README](../README.md)'s
"Design decisions" for why: this is exactly the orchestrator's purpose
working as intended, not a demo fabrication.

**A genuine finding**, visible in `exploration.json`'s `notes` and the page
object's own comments: the update endpoint answers `200` with a plain-text
body while claiming `Content-Type: application/json`, so the page's own
jQuery call fails to parse it and is routed through its AJAX *error* handler
even on success — which specifically checks `status === 200` to show the
success panel anyway. Confirmed by calling the endpoint directly. This is
the kind of thing the Explorer finds by actually driving a browser instead
of guessing, and exactly why the project exists.

## Reading the run folder

| File | What it is |
| --- | --- |
| `run.json` | Feature, target URL, provider, start time |
| `run.log` | Every tool call and result, in order, as JSONL |
| `exploration.json` | Explorer output — pages, elements, flows, notes |
| `plan.json` / `plan.md` | Planner output — 3 cases, prioritised |
| `generation.json` | Generator output — files written and why |
| `execution-1.json` | Executor output — 4/4 passed, first attempt, no healing needed |
| `static-check-1.json` | Raw ESLint/`tsc` output the Reviewer gated on |
| `review-1.json` | Reviewer verdict — approved |
| `summary.md` | Reporter output — also what would become the PR body |

No `pull-request.json` — this run used `dryRun: true`, so no branch or PR
was created, the same as passing `--dry-run` on the command line.
