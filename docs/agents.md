# Agents

> **Phase 1 scaffold.** The pipeline is built in phases 4–6. This document
> records the contracts the agents are being written against — role,
> inputs/outputs, and guardrails — so the design is reviewable before the
> implementation exists. Prompts and worked examples are added as each agent
> lands.

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

_Pending — phase 4._ Playwright ships planner / generator / healer agent
definitions for use inside coding assistants. Before implementing, the
installed version's capabilities get checked, and this section will state
plainly where TestPilot overlaps them, where it builds on them, and where it
does something they do not: specifically the end-to-end unattended pipeline,
the typed run artifacts, the explicit test-bug/app-bug classification, and the
review gate before a pull request. Duplicating them for its own sake would be
the wrong outcome.

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
