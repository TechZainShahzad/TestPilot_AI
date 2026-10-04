# Step 7 · 🔧 Healer

**Type:** LLM agent, tool-calling against the real `framework/` source tree.
**Runs:** once per failure, for each Execute → Heal round, up to
`MAX_HEAL_ATTEMPTS`. Skipped entirely for a round with zero failures.

## Purpose

For every failing test, decide whether it's a **test bug** (bad locator,
timing, wrong setup, wrong assertion target) or a genuine **application
bug** — fixing the former, reporting the latter, and never blurring the
two by making a bad test pass instead of fixing it.

## Inputs

- The failing subset of the latest `execution-<n>.json`.
- `read_file` access to the spec and whatever page object/fixture it
  uses, to actually investigate before deciding.

## Tools available

Same file tools as the [Generator](05-generator.md), but with
`guardAssertions: true`.

| Tool                        | Purpose                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `list_files(directory)`     | List files under `framework/`.                                                                  |
| `read_file(path)`           | Read one file.                                                                                  |
| `write_file(path, content)` | Overwrite a file — **rejected** if it would reduce that file's `expect(...)` count (see below). |
| `submit_healing`            | Ends the turn with a verdict for every failing test.                                            |

## The rule that is actually enforced, not just prompted

**The Healer may not weaken an assertion.** The cheapest way to make a
failing test pass is to assert less; a self-healing loop with no
constraint converges on exactly that, and the end state is a green suite
that verifies nothing — strictly worse than a red one, because it's
silent.

This is enforced in the tool itself, not left to the model's judgment:
`write_file` counts `expect(...)` occurrences in the file it would
replace and in the proposed replacement. If the count would drop, the
write is **rejected** and the tool result explains why, handed straight
back to the model as its next turn's input — verified directly, a
scripted attempt to strip an assertion is rejected and the file on disk
is provably unchanged afterward. The system prompt still states the rule
— the model shouldn't _try_ to weaken an assertion, only fail at it — but
the guarantee never depends on it listening.

## The three verdicts

- **`fixed`** — a real test bug, corrected with `write_file`.
- **`suspected_app_bug`** — the test is correct; the application
  genuinely didn't do what it should have. File is left untouched.
- **`could_not_diagnose`** — investigated, but not confident which of the
  above applies. File is left untouched.

If a fix would require weakening an assertion, that is _not_ a fix — the
right verdict is one of the other two, explicitly, by the system prompt's
own rule.

## Outputs (files written)

- `healing-<n>.json` — a verdict per failing test, plus `editedPaths` for
  whatever it actually changed.
- Patched files under `framework/`, for every `fixed` verdict only.

Every `suspected_app_bug` verdict is surfaced in `summary.md` and the PR
body — never hidden. The whole value of an automated healer is destroyed
if it can make real defects disappear.

## Source

[`orchestrator/src/agents/healer.ts`](../../orchestrator/src/agents/healer.ts) ·
assertion guard in [`tools/file-tools.ts`](../../orchestrator/src/tools/file-tools.ts)
