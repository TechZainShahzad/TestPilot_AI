# Step 4 · 📋 Planner

**Type:** LLM agent.
**Runs:** always.

## Purpose

Turn the Explorer's findings and the feature description into a
structured test plan — grounded entirely in what the Explorer actually
observed, never inventing a case that depends on an element or flow not
present in the exploration.

## Inputs

- `exploration.json` (the full `ExplorationResult`).
- `feature`, and `requirements` if a ticket drove the run (briefed by the
  Analyst, same text the Explorer received).

## Tools available

None beyond the submit tool. The Planner reasons over `exploration.json`;
it doesn't gather new facts.

| Tool          | Purpose                                 |
| ------------- | --------------------------------------- |
| `submit_plan` | Ends the turn with the full `TestPlan`. |

## Key rules

- Cover the feature with a genuine mix: positive (happy path), negative
  (invalid input, error states), and boundary (edge values, empty/zero/
  maximum) cases. A plan with only positive cases is incomplete.
- **When explicit acceptance criteria exist, every criterion must map to
  at least one case** — not a generic mix substituted for what was
  explicitly asked for. This mapping is recorded in `requirementsCoverage`
  (one entry per criterion, naming the case IDs that verify it) — a
  visible traceability record of what was actually understood, not just
  asserted. A criterion with no matching case IDs is a gap, not something
  to paper over by inventing an unrelated case.
- Prioritise: **P0** for the primary happy path and anything guarding
  money/data integrity, **P1** for important negative/boundary cases,
  **P2** for nice-to-have edge cases.
- Every case's steps must be executable using only elements and flows the
  Explorer actually recorded — referenced by their real locator hints,
  never a guessed new one.
- Every case's `expected` describes one concrete, observable outcome —
  never "it should work correctly."

## Outputs (files written)

- `plan.json` / `plan.md` — `summary`, `requirementsCoverage[]`
  (criterion → case IDs, empty when no ticket drove the run), and
  `cases[]` (id, title, type, priority, preconditions, steps, expected).

The CLI also prints `requirementsCoverage` straight to the console right
after this step — "Requirements understood from the ticket" — so a gap is
visible immediately, not just buried in a file.

## Source

[`orchestrator/src/agents/planner.ts`](../../orchestrator/src/agents/planner.ts)
