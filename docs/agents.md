# Agents

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
> confirmed live" below for what that run found and fixed. Generate onward
> is implemented and unit-verified the same way as the rest of the pipeline,
> but not yet exercised end-to-end live: the free tier's 200,000-token daily
> cap was exhausted by the Explore/Plan debugging session before Generate
> could complete a full live pass.

## Pipeline

```
Explore → Plan → Generate → Execute ⇄ Heal → Review → Report
                     ↑__________________________|
                        (review rejection)
```

A linear state machine with exactly two loops: `Execute ⇄ Heal`, bounded by
`MAX_HEAL_ATTEMPTS`, and `Review → Generate`, bounded by `MAX_REVIEW_ROUNDS`.
Both ceilings are configuration, not constants, because an agent that writes
code, runs it, reads the failure and tries again is unbounded by construction.

Each stage reads and writes typed JSON artifacts in
`orchestrator/runs/<timestamp>/`. No stage holds state in memory across a
transition, which is what makes a run inspectable after the fact and
resumable from any step.

## Agent contracts

| Agent         | Reads                                                      | Writes                                                                           | Hard guardrail                                                                                                                |
| ------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Explorer**  | target URL, feature description                            | `exploration.json` — pages, elements, flows, locator candidates                  | Never guesses: every locator candidate is read from a live DOM / accessibility snapshot                                       |
| **Planner**   | `exploration.json`, feature description                    | `plan.md` + `plan.json` — cases with priority, type (positive/negative/boundary) | Must produce negative _and_ boundary cases, not just happy paths                                                              |
| **Generator** | `plan.json`, `exploration.json`, existing framework source | file writes under `framework/`                                                   | Must reuse existing page objects; creating a near-duplicate is a review failure                                               |
| **Executor**  | generated spec paths                                       | `execution-<n>.json` — results, traces, stderr                                   | Read-only with respect to source; it runs tests, it does not edit them                                                        |
| **Healer**    | `execution-<n>.json`, source under test                    | patches + `healing-<n>.json` with a verdict per failure                          | **May not weaken an assertion.** Fixes locators, waits, setup. Classifies anything else as a suspected app bug and reports it |
| **Reviewer**  | `generation.json`, real ESLint/`tsc` output                | `review-<n>.json` — verdict + findings                                           | Lint and type-check must pass first, checked outside the model; has no `write_file` tool, so it cannot alter what it reviews  |
| **Reporter**  | every prior artifact                                       | `summary.md`, pull request                                                       | Opens a PR on a new branch, staging only the exact files generated. Never pushes to `main`. Not an LLM agent — deterministic  |

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

The agents talk to a narrow interface — a chat call, tool declarations, and
token accounting — with two implementations behind it:

| Provider             | Default model         | Why                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gemini** (default) | `gemini-2.5-flash`    | Free tier, native function calling, and a context window large enough to pass real framework source as grounding                                                                                                                                                                                                                                                                                                    |
| **Groq** (alternate) | `openai/gpt-oss-120b` | Free tier, very fast; confirmed live to call tools correctly via Groq's OpenAI-compatible API. (Groq decommissioned the `llama-3.3-70b-versatile` model this was originally built against — model availability on free-tier providers moves faster than most dependencies, worth knowing if `GROQ_MODEL`'s default ever 404s again.) A useful check that nothing in the pipeline has quietly coupled to one vendor. |

The abstraction is not speculative generality: it is what keeps the project
runnable by anyone who clones it, since both tiers are free, and switching is
`LLM_PROVIDER=groq`.

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
