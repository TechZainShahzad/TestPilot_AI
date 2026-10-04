# Step 3 · 🔍 Explorer

**Type:** LLM agent, tool-calling against a real browser.
**Runs:** always.

## Purpose

Drive a real Chromium browser through the target feature and record what
genuinely exists — pages, elements, flows — so nothing downstream has to
guess a selector from a feature name. An LLM asked to write a locator
cold produces something like `#billpay-submit-btn`: plausible, confidently
wrong, and the single most common reason a generated test fails on its
first run.

## Inputs

- `targetUrl`, `feature`.
- `requirements` — either the raw ticket text (no Analyst ran) or the
  Analyst's briefed version with exploration hints attached (see
  [02-analyst.md](02-analyst.md)).
- `headless` — `true` unless `--headed` was passed.

## Tools available

Backed by a real Playwright `Page`, not Playwright MCP and not a mocked
DOM. The model never sees a screenshot or raw HTML — only an accessibility
(ARIA) snapshot with `[ref=eNN]`-style element references it acts on
directly, the same representation Playwright's own MCP server exposes.

| Tool                        | Purpose                                                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `navigate(url)`             | Go to a URL (absolute, or relative to the current page). Returns the resulting ARIA snapshot.                                                                                                   |
| `snapshot()`                | Re-read the current page's accessibility tree. Required after any action that might have changed the page — refs are scoped to the snapshot that produced them, not to the underlying DOM node. |
| `click(ref)`                | Click the element with that ref from the most recent snapshot.                                                                                                                                  |
| `fill(ref, value)`          | Type text into an input/textarea.                                                                                                                                                               |
| `select_option(ref, value)` | Choose an option in a `<select>`.                                                                                                                                                               |
| `go_back()`                 | Browser-history back.                                                                                                                                                                           |
| `submit_exploration`        | Ends the turn with the full `ExplorationResult`.                                                                                                                                                |

## Key rules

- Start with `navigate`, then explore toward the named feature using what
  each snapshot actually shows.
- Prefer role/label-based locator hints
  (`getByRole('button', { name: 'Submit' })`) over CSS or XPath; fall back
  only when no accessible role or name exists.
- **Stay scoped to the named feature.** A login form only used to reach
  the feature is not itself part of the exploration — don't catalog its
  fields.
- Explore both the success path and at least one way the flow can go
  wrong, when reachable without a destructive action.
- A small, focused exploration (roughly 5–15 elements) beats an
  exhaustive one — both for the Planner's sake and for fitting in one
  response.

## A real timing problem this tool set works around

`page.ariaSnapshot()` on a client-side-routed SPA can return the exact
same stale tree for 4+ seconds in a row if polled too fast — confirmed
live against SauceDemo, where `networkidle` alone settles well before the
React re-render that actually changes the tree. `waitForSnapshotChange()`
polls every 400ms rather than faster; a shorter interval was tried and
reliably returned stale data instead.

## Outputs (files written)

- `exploration.json` — `pages[]`, `elements[]` (each with a locator hint
  and its purpose), `flows[]`, and free-text `notes` for anything
  surprising or ambiguous.

## Source

[`orchestrator/src/agents/explorer.ts`](../../orchestrator/src/agents/explorer.ts) ·
tools in [`tools/browser-tools.ts`](../../orchestrator/src/tools/browser-tools.ts)
