# Agents

> **See also:** [`workflow.md`](workflow.md) for the full pipeline as one
> diagram, including every file each stage writes, and
> [`agents/`](agents/) for a dedicated, detailed page per stage. This
> document is the condensed version — a table plus the guardrails and why
> they exist.

> **Status.** The full pipeline is implemented — Explore → Plan →
> Generate → Execute ⇄ Heal → Review → Report, with Review → Generate on
> rejection. See [`orchestrator/src/agents/`](../orchestrator/src/agents/) and
> [`core/`](../orchestrator/src/core/) (`executor.ts`, `static-check.ts`,
> `git.ts`, `github.ts`) for the actual system prompts and logic. Every
> deterministic and tool-enforced mechanism (file-tool path scoping, the
> assertion-weakening guard, the lint/type-check gate, git branch/commit/push,
> the GitHub PR request) was verified against real code, a disposable scratch
> repo, and a local HTTP test double respectively — never the real
> `TestPilot_AI` repo. **Explore and Plan have additionally been run live
> against Groq** (`openai/gpt-oss-120b`, free tier) — real tool-calling turns,
> real page data, a genuinely well-formed plan — see "Groq's free tier,
> confirmed live" below for what that run found and fixed.
>
> **The full pipeline, Explore through Report, has been run to completion
> once with every mechanical action genuinely real** (the committed
> [`examples/`](../examples/) run) — live browser, live `write_file` calls,
> live Playwright execution, live ESLint/`tsc` — but with a disclosed
> deterministic script standing in for the model's own reasoning, since
> Groq's 200,000-token daily cap was exhausted by earlier debugging before
> a full live pass could complete; see
> [`examples/README.md`](../examples/README.md) for exactly what that means
> and does not mean.
>
> **A fully live run — a real model making every decision, start to
> finish — has since completed successfully on `claude-code`**: Explore (2
> pages, 10 elements), Plan (15 cases), Generate (3 files), Execute (8/8
> passed first try, no healing needed), and a genuinely substantive Review
> (approved, with specific advisory findings, not boilerplate). See "Claude
> Code CLI, confirmed live" below.

## Pipeline

```
(Analyst →) Explore → Plan → Generate → Execute ⇄ Heal → Review → Report
                                 ↑__________________________|
                                    (review rejection)
```

Analyst only runs with `--jira-ticket` — a plain `--feature` run has no ticket
to brainstorm about, so it starts straight at Explore.

A linear state machine with exactly two loops: `Execute ⇄ Heal`, bounded by
`MAX_HEAL_ATTEMPTS`, and `Review → Generate`, bounded by `MAX_REVIEW_ROUNDS`.
Both ceilings are configuration, not constants, because an agent that writes
code, runs it, reads the failure and tries again is unbounded by construction.

Each stage reads and writes typed JSON artifacts in
`orchestrator/runs/<timestamp>/`. No stage holds state in memory across a
transition, which is what makes a run inspectable after the fact and
resumable from any step.

## Where the feature description comes from

A run starts from either `--feature "name"` (a human-typed short
description) or `--jira-ticket KEY` — not both; `parseArgs` in
[`cli.ts`](../orchestrator/src/cli.ts) rejects either zero or both being
given. `--jira-ticket` does not add a new pipeline stage or a new agent:
[`core/jira.ts`](../orchestrator/src/core/jira.ts) fetches the issue (Jira
Cloud's REST API v3, HTTP Basic auth — not a bearer token, a real and easy
mistake), converts its description out of Atlassian Document Format into
plain text with a small recursive walker, and the result becomes the same
`feature`/`requirements` strings the Explorer and Planner already accept —
the ticket's summary becomes `feature`, its converted description becomes
an optional `requirements` string appended to both agents' prompts. The
Planner's system prompt has one added rule for this case: when the
requirements text states explicit acceptance criteria, every criterion
must map to at least one case, not just "a reasonable mix."

Before spending any tokens, `main()` also checks GitHub's search API
(`findExistingPullRequest` in [`core/github.ts`](../orchestrator/src/core/github.ts))
for a PR already referencing the ticket key, and **warns** (does not
block) if one exists — the ticket may legitimately need more coverage
added later. This is deliberately not a separate local "registry" file:
GitHub is already the source of truth for whether a PR exists, and a local
record of past runs could drift out of sync with it (a PR closed or merged
outside this tool would leave a local record lying). When a Jira ticket
drove the run, the Reporter also embeds its key in the branch name and
adds a line linking back to it in the PR body/`summary.md`.

Writing back to Jira (comments, status transitions) is explicitly out of
scope for this — it changes a system of record other teams depend on, and
deserves its own pass with its own review, not a side effect of this one.

## Agent contracts

| Agent         | Reads                                                                                                        | Writes                                                                                            | Hard guardrail                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Jira**      | `--jira-ticket KEY`, Jira Cloud REST API v3                                                                  | nothing to the run folder — feeds `feature`/`requirements` to every stage below                   | Never writes back to Jira; warns (never blocks) if a PR already references the ticket, instead of a local run registry        |
| **Analyst**   | raw ticket text (only runs with `--jira-ticket`)                                                             | `brief.md` + `brief.json` — understanding, acceptance criteria, exploration hints, open questions | No browser, no code access — reasons over the ticket's own text only; never invents a criterion the ticket doesn't state      |
| **Explorer**  | target URL, feature description, requirements text briefed by the Analyst (or raw, with a plain `--feature`) | `exploration.json` — pages, elements, flows, locator candidates                                   | Never guesses: every locator candidate is read from a live DOM / accessibility snapshot                                       |
| **Planner**   | `exploration.json`, feature description, optional requirements text                                          | `plan.md` + `plan.json` — cases with priority, type (positive/negative/boundary)                  | Must produce negative _and_ boundary cases, not just happy paths; every explicit acceptance criterion must map to a case      |
| **Generator** | `plan.json`, `exploration.json`, existing framework source                                                   | file writes under `framework/`                                                                    | Must reuse existing page objects; creating a near-duplicate is a review failure                                               |
| **Executor**  | generated spec paths                                                                                         | `execution-<n>.json` — results, traces, stderr                                                    | Read-only with respect to source; it runs tests, it does not edit them                                                        |
| **Healer**    | `execution-<n>.json`, source under test                                                                      | patches + `healing-<n>.json` with a verdict per failure                                           | **May not weaken an assertion.** Fixes locators, waits, setup. Classifies anything else as a suspected app bug and reports it |
| **Reviewer**  | `generation.json`, real ESLint/`tsc` output                                                                  | `review-<n>.json` — verdict + findings                                                            | Lint and type-check must pass first, checked outside the model; has no `write_file` tool, so it cannot alter what it reviews  |
| **Reporter**  | every prior artifact, optional Jira ticket key/URL                                                           | `summary.md`, pull request                                                                        | Opens a PR on a new branch, staging only the exact files generated. Never pushes to `main`. Not an LLM agent — deterministic  |

## Guardrails, and why each one exists

**The Healer may not weaken an assertion.** The cheapest way to make a failing
test pass is to assert less. A self-healing loop with no constraint converges
on exactly that, and the end state is a green suite that verifies nothing —
strictly worse than a red one, because it is silent. So the Healer's remit is
locators, waits and setup; a failure that cannot be fixed within that remit is
escalated as a _suspected application bug_, which is a legitimate and useful
output rather than a dead end.

This is enforced, not just prompted. The Healer's `write_file` tool
([`tools/file-tools.ts`](../orchestrator/src/tools/file-tools.ts)) counts
`expect(...)` occurrences in the file it would replace and in the proposed
replacement; if the count would drop, the write is rejected and the tool
result explains why, handed straight back to the model as the next turn's
input. The system prompt still states the rule — the model should not _try_
to weaken an assertion, not just fail when it does — but the guarantee does
not depend on the model reading or obeying the prompt. Verified directly: a
scripted attempt to overwrite a spec with an assertion removed is rejected by
`write_file` and the file on disk is provably unchanged afterward.

**Suspected app bugs are reported, never hidden.** The whole value of an
automated healer is destroyed if it can make real defects disappear. Every
failure it declines to fix appears in `summary.md` and in the PR body.

**The Explorer browses; it does not imagine.** An LLM asked to write a
locator from a feature name produces `#billpay-submit-btn` — plausible,
confidently wrong, and the reason most generated tests fail on first run. The
Explorer drives a real browser and records the accessibility tree, so the
Generator is choosing among elements that demonstrably exist. Preference order
for locators: **role → label → test id → text → CSS**, matching Playwright's
own guidance.

**The Reviewer gates on objective checks.** Its checklist includes items a
model can rationalise its way past, so the lint and type-check results are
attached as evidence and a failing either is an automatic rejection,
independent of the model's opinion.

This, too, is enforced ahead of the model rather than left to it.
[`core/static-check.ts`](../orchestrator/src/core/static-check.ts) runs the
framework's real ESLint and `tsc --build` — scoped to `framework/`,
deterministic, zero model involvement — before the Reviewer agent is even
started. If either fails, the round is rejected immediately with the real
tool output attached as findings, and **no LLM call is made at all**: there
is no verdict for a model to rationalise past, because it is never consulted.
Only when both pass does the Reviewer agent run, and even then it is handed
`read_file`/`list_files` only — it has no `write_file` tool, so a review can
never itself alter the code it is judging. Verified directly: a scripted
run against a file with a deliberate lint violation rejects in zero LLM
turns; a clean file goes to the model, which reviews real file contents and
its verdict is honoured.

**The output is a pull request.** Not a push, not a commit to `main`. A human
decides whether generated code enters the repository. The `--dry-run` flag
stops before the PR; it is also forced on when `GITHUB_TOKEN` is absent, so a
fresh clone cannot push by accident. The Reporter
([`agents/reporter.ts`](../orchestrator/src/agents/reporter.ts)) always
creates a new `testpilot/<feature>-<timestamp>` branch before touching git in
any other way — there is no code path that commits to the current branch —
and stages only the exact files `generation.json` recorded, never `git add
-A`. Verified against a disposable scratch repository with its own local
bare remote (never the real `TestPilot_AI` repo): branch creation, staging,
committing, and pushing all behave correctly, and `stagePaths([])` refuses to
run a bare `git add`. The GitHub pull-request call itself was verified
against a local HTTP test double standing in for `api.github.com` — correct
method, auth header, and request body, plus correct error handling on a
non-2xx response — again without ever contacting the real API.

**Cost and time are capped.** `MAX_TOKENS_PER_RUN`, `MAX_USD_PER_RUN` and
`AGENT_STEP_TIMEOUT_MS` abort the run when exceeded. Token usage is recorded
per agent step and totalled in the run summary.

## Provider layer

The agents talk to a narrow interface — `start()` / `continueWithToolResults()`
/ `getUsage()` — with three implementations behind it:

| Provider                         | Default model                          | Why                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gemini** (default)             | `gemini-2.5-flash`                     | Free tier, native function calling, and a context window large enough to pass real framework source as grounding                                                                                                                                                                                                                                                                                                    |
| **Groq**                         | `openai/gpt-oss-120b`                  | Free tier, very fast; confirmed live to call tools correctly via Groq's OpenAI-compatible API. (Groq decommissioned the `llama-3.3-70b-versatile` model this was originally built against — model availability on free-tier providers moves faster than most dependencies, worth knowing if `GROQ_MODEL`'s default ever 404s again.) A useful check that nothing in the pipeline has quietly coupled to one vendor. |
| **Claude Code CLI** (local-only) | whatever `claude` is configured to use | No per-minute/per-day token ceiling to work around — confirmed live, see below. Trades that for being unusable in CI: it shells out to an already-authenticated `claude` CLI session (a Claude subscription), not an API key.                                                                                                                                                                                       |

The abstraction is not speculative generality: it is what keeps the project
runnable by anyone who clones it on a free tier, and also what let a third,
materially different provider — one with no HTTP API at all — slot in as
"just another `LlmProvider` implementation" rather than a special case
threaded through every agent.

### Claude Code CLI, confirmed live

Groq and Gemini's free tiers are tight enough that a single agent turn in
this pipeline can exceed them — confirmed live, see "Groq's free tier"
below, and more sharply: a real run hit a `413 Request too large` mid-Generate
that crashed the whole process (the SDK only retries `429`s; see
`groq.ts`'s `createWithRetry`). `claude-code` exists for local runs where
that headroom matters, built on three things confirmed live against the
real CLI before writing any code against them, not assumed from `--help`:

- **The prompt goes over stdin**, not argv — confirmed with a 10,000+
  character prompt. A Planner/Generator turn carrying a full
  `exploration.json`/`plan.json` payload would otherwise blow Windows'
  ~8KB command-line length limit.
- **`--json-schema` reliably disambiguates multiple tools in one call** —
  confirmed with two tools offering different argument shapes, asked for
  both in sequence, got back exactly the right `{name, arguments}` pair for
  each, correctly ordered. This is the whole mechanism `claude-code.ts`'s
  `buildToolCallSchema` depends on: the CLI's own `--tools` flag only
  restricts its built-in tools (Bash, Edit, Read, ...), it doesn't accept
  arbitrary custom tool schemas the way a function-calling API does, so
  every turn instead asks for schema-validated JSON matching a
  `oneOf`-by-tool-name wrapper built from the same `ToolDefinition[]`
  Groq/Gemini consume, with `--tools ""` disabling every built-in tool so
  the CLI only ever produces text.
- **`--resume <sessionId>` carries context across calls** — confirmed live
  (told it a fact in one call, asked for it back via `--resume` in the
  next, got the right answer with nothing resent manually). Sidesteps
  `GroqProvider`'s whole stateless-resend-everything problem structurally.

**A real deployment wrinkle, also confirmed live and worth knowing about
before touching this code again:** a global `claude` install on Windows is
a `.cmd` shim, which cannot be launched directly by `CreateProcess` without
a shell. The first fix tried — `shell: true` with an args array — looked
reasonable and was wrong: Node deprecated exactly this (`DEP0190`) because
arguments aren't actually escaped under it, only concatenated, which
silently corrupted the quote-heavy `--json-schema` value in practice (a
real run failed with "Unexpected token... is not valid JSON" because of
it). The actual fix, in `resolveClaudeBin()`: read the `.cmd` shim's own
contents once to find the real `claude.exe` it wraps, cache that path, and
spawn it directly with `shell: false` — the same convention as everywhere
else in this project.

**What this does not do:** write back to anything, use any tool but its
own text generation, or run in CI — `.github/workflows/orchestrate.yml`
deliberately only offers `groq`/`gemini` as provider choices, since a
GitHub Actions runner has no interactive Claude session to shell out to.
Its own `total_cost_usd` field is a list-price-equivalent figure, not real
billing under a subscription — `core/run.ts`'s cost estimate deliberately
reports $0.00 for it instead, the same honest-default reasoning as the free
tiers.

### Groq's free tier, confirmed live

Running this pipeline live against Groq's free tier (no paid plan) surfaced
three real constraints, in the order they were hit:

1. **8,000 tokens/minute, shared across every model on the account** — not
   per-model. A stateless chat API resending full conversation history (see
   `GroqProvider`'s class-level docs) blew through this in four ordinary
   tool-calling turns before anything was fixed.
2. **A single request can still be throttled** even once #1 is handled,
   simply because the free tier's per-minute budget is tight enough that
   normal, correctly-sized traffic gets rate-limited sometimes. Groq's own
   error message states exactly how long to wait
   (`"Please try again in 1.7s"`), so `GroqProvider` retries using that
   value rather than guessing.
3. **200,000 tokens/day, account-wide.** Iterative live testing while
   building this feature exhausted it in one afternoon. This is a hard
   stop, not a bug — there is nothing in-process to retry around; the fix
   is time (it resets on a rolling window) or Groq's paid Dev Tier.

`GroqProvider` now: collapses every tool result's content to a short
placeholder once a newer one supersedes it (constraint #1); retries
`RateLimitError` using Groq's own reported wait time, up to 4 attempts
(#2); and sets an explicit `max_completion_tokens` (4096) rather than
Groq's own default, because an unbounded completion was observed getting
silently truncated mid-JSON when the remaining per-minute budget ran low —
producing a tool call whose arguments failed to parse, rather than a clean
error. Every agent's system prompt also states explicitly that it must end
by calling its submit tool, never by answering in prose — `gpt-oss-120b`
did exactly that once, mid-debugging, producing a complete and genuinely
good markdown report instead of a `submit_exploration` call, which the
agent loop correctly rejected (see "CRITICAL" in each agent's prompt).

None of this is specific to Groq in principle — a stateless, free-tier,
rate-limited API is a realistic target for anyone running this project
without a paid plan, and Gemini's `Chat` object sidesteps constraint #1
only because it manages history server-side, not because the free tier is
unlimited.

## Relationship to Playwright's built-in test agents

Playwright `1.63` (the version this repo pins) does ship built-in agents —
`npx playwright init-agents` installs `playwright-test-planner`,
`playwright-test-generator`, and `playwright-test-healer` as `.agent.md`
subagent definitions (read directly from
`node_modules/playwright/lib/agents/` while building this phase, not assumed).
They are genuinely useful, and this orchestrator is not a reimplementation of
them — it solves a different problem.

**What they are.** Subagent definitions for an MCP-capable coding assistant
(Claude Code, by their own frontmatter: `model: sonnet`). Each one is a system
prompt plus a tool allow-list drawn from the **Playwright MCP server**
(`playwright-test/browser_*`, `planner_save_plan`, `generator_write_test`,
`test_debug`, …). You invoke one at a time, inside an IDE chat session, with a
human present throughout.

**What they do, concretely:**

| Agent                       | Input → Output                                                                                                                 | Mechanism                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `playwright-test-planner`   | Explores via `browser_*` tools, writes **one markdown file** via `planner_save_plan`                                           | Explore and Plan are one step; no structured JSON                                     |
| `playwright-test-generator` | Replays each plan step as a real `browser_*` action, then `generator_write_test` emits **one spec file** from the recorded log | Essentially guided codegen — it does the actions for real and transcribes them        |
| `playwright-test-healer`    | `test_run` → `test_debug` the failures → edit → rerun, looped until green or given up on                                       | On persistent failure: `test.fixme()` + a comment, not a reported "suspected app bug" |

**Where this orchestrator is a different tool, not a bigger version of theirs:**

- **Unattended vs. interactive.** `npm run orchestrate -- --feature "Checkout Flow"`
  runs Explore → Plan → Generate → Execute → Heal → Review → Report to
  completion with no human in the loop until the PR review. Their agents are
  invoked one at a time by a person in an IDE chat; nothing strings them into
  a pipeline or opens a PR.
- **No MCP server or IDE host required.** This orchestrator drives Playwright
  directly as a library — `chromium.launch()` plus `page.ariaSnapshot({mode:
'ai'})` for the same ref-annotated accessibility tree their MCP tools
  expose — callable from a plain `node` CLI in CI. Their agents require the
  Playwright MCP server running and an MCP-capable host; they cannot run
  headless in a GitHub Actions job as-is.
- **Typed, validated artifacts at every stage**, not markdown-then-source.
  `exploration.json` and `plan.json` are Zod-validated and saved before
  Generate even starts, which is what makes a run resumable and inspectable
  from disk — see "Run artifacts" below. Their planner's only output is a
  markdown file; nothing downstream consumes it programmatically.
- **An explicit test-bug/app-bug split with a hard attempt cap, and a
  Reviewer gate before anything reaches a human as a PR** — stages their
  agents don't have. Their healer's failure mode is `test.fixme()` with a
  comment; this orchestrator's is a structured, reported suspected-app-bug
  that does not disable the assertion.
- **Provider-agnostic** (Gemini or Groq, both free-tier) instead of whatever
  model the host IDE happens to be configured with.

None of this makes the built-in agents worse at their job — interactive,
IDE-assisted test authoring with a human steering every step is a reasonable
thing to want, and interactive healing with `test_debug` has a tighter
feedback loop than this orchestrator's batch retry-and-report can offer. They
are built for a different moment in the workflow (an engineer, in an editor,
writing one test) than this orchestrator is (CI or a terminal, unattended,
producing a reviewable PR). A future iteration could have the Generator shell
out to `playwright-test-generator` when an MCP host is available rather than
re-deriving code generation from scratch — noted here, not built, since nothing
in this phase needed it yet.

## Run artifacts

```
orchestrator/runs/<timestamp>/
  run.json                 feature, target URL, provider, start time
  run.log                  JSONL — every tool call, result, and error, per agent
  llm-calls.jsonl          JSONL — every LLM request/response, full and untruncated,
                           across every agent (`--verbose-llm` also previews this live)
  brief.md / brief.json    Analyst output (only with --jira-ticket)
  exploration.json         Explorer output
  plan.md / plan.json      Planner output (plan.md is the human-readable render)
  generation.json          Generator output — files written, reused page objects (one per round)
  execution-<n>.json       Executor output (one per Execute/Heal attempt)
  healing-<n>.json         Healer verdicts (one per attempt)
  static-check-<n>.json    Raw ESLint/tsc output the Reviewer gated on (one per round)
  review-<n>.json          Reviewer verdict + findings (one per round)
  pull-request.json        { url, number } — only written if a PR was actually opened
  summary.md               Reporter output — also the PR body
```

Generated and healed source files land directly in `framework/`, not inside
the run folder — the run folder has the paths and reasons
(`generation.json`'s `filesWritten`), and `git diff` against the branch the
Reporter created is the actual reviewable diff.

A sample is committed under [`examples/`](../examples/) so the output can be
read without running anything.
