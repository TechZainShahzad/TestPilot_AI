# Step 5 · ✍️ Generator

**Type:** LLM agent, tool-calling against the real `framework/` source tree.
**Runs:** always; re-runs on review rejection (bounded by
`MAX_REVIEW_ROUNDS`).

## Purpose

Write the actual Playwright spec files — and only the page objects,
fixtures, or data builders genuinely missing — that implement the
Planner's plan. Grounded in two things, never invention: the plan (what
to cover) and the Explorer's locator hints (what elements genuinely
exist).

## Inputs

- `plan.json`, `exploration.json`.
- On a re-run: the previous round's **blocking** findings from the
  [Reviewer](08-reviewer.md), with an explicit instruction not to repeat
  the same mistakes.

## Tools available

Scoped to `framework/` only — every path is resolved against
`FRAMEWORK_ROOT` and rejected if it would escape it (a
`../../etc/passwd`-shaped path from a model is a realistic failure mode
for any LLM-driven file tool, not a hypothetical one).

| Tool                        | Purpose                                                               |
| --------------------------- | --------------------------------------------------------------------- |
| `list_files(directory)`     | List every file under a `framework/`-relative directory, recursively. |
| `read_file(path)`           | Read one file's full contents.                                        |
| `write_file(path, content)` | Create or fully overwrite one file.                                   |
| `submit_generation`         | Ends the turn with the full `GenerationResult`.                       |

## Key rules (framework conventions it must follow, not guess)

- Page objects live in `src/pages/`, one class per screen, extending
  `BasePage`. Locators are getters; actions are async methods.
- Custom fixtures live in `src/fixtures/pages.ts`; specs import
  `{ expect, test }` from there — **never** directly from
  `@playwright/test`.
- Test data comes from Faker-backed builders in `src/data/` — never a
  hard-coded literal a builder could generate.
- Specs live under `tests/ui/`, tagged once at `test.describe` level with
  exactly one of `@smoke` or `@regression`.
- A filename ending `.guest.spec.ts` runs logged out; everything else
  under `tests/ui/` runs with a shared authenticated session — decided by
  filename alone, never a tag.
- **Reuse first.** If a page object, fixture, or spec file already covers
  what's needed, extend it — a new method, a new test inside an existing
  `describe` — rather than creating a near-duplicate. `list_files`/
  `read_file` exist specifically so this agent studies what's there
  before writing anything.
- Never weaken, remove, or skip an assertion to make a case easier to
  write (see [Healer](07-healer.md) for how this is actually enforced,
  not just stated).

## Outputs (files written)

- `generation.json` — `summary`, `filesWritten[]` (path + reason),
  `reusedPageObjects[]`.
- Real files under `framework/` — page objects, fixtures, specs. These
  land directly in the framework, not inside the run folder;
  `generation.json`'s `writtenPaths` is the record of exactly what
  changed, and `git diff` against the Reporter's branch is the actual
  reviewable diff.

If the model calls `submit_generation` without ever calling `write_file`,
the orchestrator throws rather than accepting an empty generation.

## Source

[`orchestrator/src/agents/generator.ts`](../../orchestrator/src/agents/generator.ts) ·
tools in [`tools/file-tools.ts`](../../orchestrator/src/tools/file-tools.ts)
