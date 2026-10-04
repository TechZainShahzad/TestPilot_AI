# Step 8 · 🔬 Reviewer

**Type:** Deterministic gate, then an LLM agent — in that order.
**Runs:** once per round, up to `MAX_REVIEW_ROUNDS`.

## Purpose

Check the Generator's (and Healer's) output against a written checklist
before anything reaches a human as a pull request. The gate is objective
first, subjective second: a model can rationalise its way past a
checklist item, so the parts that can be checked mechanically are checked
mechanically, outside the model entirely.

## The deterministic gate (runs first, always)

[`core/static-check.ts`](../../orchestrator/src/core/static-check.ts) runs
the framework's real ESLint and `tsc --build`, scoped to `framework/` —
zero model involvement. If **either** fails, the round is rejected
immediately, the real tool output is attached as a blocking finding, and
**no LLM call is made at all** — there is no verdict for a model to
rationalise past, because for a purely mechanical failure, no model is
consulted. Verified directly: a file with a deliberate lint violation
rejects in zero LLM turns; a clean file goes to the model, which reviews
real file contents and whose verdict is honoured.

## Inputs (once static checks pass)

- `generation.json`'s `filesWritten` list.
- `read_file`/`list_files` access to actually read them.

## Tools available

Same file tools as the Generator, with `write_file` explicitly filtered
out.

| Tool                    | Purpose                                    |
| ----------------------- | ------------------------------------------ |
| `list_files(directory)` | List files under `framework/`.             |
| `read_file(path)`       | Read one file.                             |
| `submit_review`         | Ends the turn with findings and a verdict. |

**No `write_file`.** The Reviewer cannot alter the code it is judging —
not by policy, by capability. A review can never accidentally (or
conveniently) fix the thing it's supposed to be grading.

## The checklist (what the model actually judges)

- Page Object Model followed — no raw selectors or `page.locator(...)`
  calls directly in a spec.
- No hard waits — no `page.waitForTimeout(...)`, no arbitrary sleep.
- No hard-coded test data — unless it's a deliberate boundary value the
  plan calls for (testing a zero or negative amount is correct, not a
  violation).
- Every test has at least one meaningful assertion on a specific value or
  state — never just "no error was thrown."
- Specs import `{ expect, test }` from the fixtures file, never directly
  from `@playwright/test`.

Each issue found is classified **blocking** (a real checklist violation)
or **advisory** (a style nit, not worth rejecting over). Verdict is
`approved` only with zero blocking findings.

## Outputs (files written)

- `static-check-<n>.json` — raw ESLint/`tsc` output, every round, pass or
  fail.
- `review-<n>.json` — verdict, findings (with severity), summary. On an
  auto-rejection, this is written directly from the static-check result
  with no LLM call having happened.

## On rejection

Control returns to the [Generator](05-generator.md) with this round's
**blocking** findings attached, up to `MAX_REVIEW_ROUNDS`. Rounds
exhausted without approval still proceeds to the
[Reporter](09-reporter.md) — the PR still opens, with the last review's
findings visible in `summary.md`, rather than the run simply failing.

## Source

[`orchestrator/src/agents/reviewer.ts`](../../orchestrator/src/agents/reviewer.ts) ·
gate in [`core/static-check.ts`](../../orchestrator/src/core/static-check.ts)
