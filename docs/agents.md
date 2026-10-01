# Agents

> **Status.** Explorer, Planner, Generator, Executor, and Healer (phases 4–5)
> are implemented — see [`orchestrator/src/agents/`](../orchestrator/src/agents/)
> and [`core/executor.ts`](../orchestrator/src/core/executor.ts) for their
> actual system prompts and logic. The pipeline runs Explore → Plan →
> Generate → Execute ⇄ Heal end to end. Reviewer and Reporter (phase 6) are
> specified below as contracts but not yet built.

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
| **Reviewer**  | diff, checklist, lint/typecheck output                     | `review-<n>.json` — verdict + findings                                           | Lint and type-check must pass; a subjective "looks fine" is not a pass                                                        |
| **Reporter**  | every prior artifact                                       | `summary.md`, pull request                                                       | Opens a PR on a new branch. Never pushes to `main`                                                                            |

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

**The output is a pull request.** Not a push, not a commit to `main`. A human
decides whether generated code enters the repository. The `--dry-run` flag
stops before the PR; it is also forced on when `GITHUB_TOKEN` is absent, so a
fresh clone cannot push by accident.

**Cost and time are capped.** `MAX_TOKENS_PER_RUN`, `MAX_USD_PER_RUN` and
`AGENT_STEP_TIMEOUT_MS` abort the run when exceeded. Token usage is recorded
per agent step and totalled in the run summary.

## Provider layer

The agents talk to a narrow interface — a chat call, tool declarations, and
token accounting — with two implementations behind it:

| Provider             | Default model             | Why                                                                                                              |
| -------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Gemini** (default) | `gemini-2.5-flash`        | Free tier, native function calling, and a context window large enough to pass real framework source as grounding |
| **Groq** (alternate) | `llama-3.3-70b-versatile` | Free tier, very fast; a useful check that nothing in the pipeline has quietly coupled to one vendor              |

The abstraction is not speculative generality: it is what keeps the project
runnable by anyone who clones it, since both tiers are free, and switching is
`LLM_PROVIDER=groq`.

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

- **Unattended vs. interactive.** `npm run orchestrate -- --feature "Bill Pay"`
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
  run.json             options, provider, limits, final status
  run.log              JSONL — every step, input, output, token count
  exploration.json     Explorer output
  plan.md / plan.json  Planner output
  generated/           files written, as a reviewable diff
  execution-1.json     Executor output (one per attempt)
  healing-1.json       Healer verdicts (one per attempt)
  review-1.json        Reviewer findings (one per round)
  summary.md           Reporter output — also the PR body
```

A sample is committed under [`examples/`](../examples/) so the output can be
read without running anything.
