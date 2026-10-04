# Step 2 · 🧠 Analyst

**Type:** LLM agent.
**Runs:** only when a Jira ticket's requirements text exists (i.e. only
with `--jira-ticket`). A plain `--feature "name"` run has no ticket to
brainstorm about, so this step is skipped and the pipeline goes straight
to [Explorer](03-explorer.md).

## Purpose

Read the ticket's raw text and understand it **before** anything opens a
browser. This is the direct answer to "how can it explore before
understanding the story?" — without this step, the Explorer received the
raw ticket text and had to extract its own understanding silently, inside
a single turn, with nothing written down to check. The Analyst makes that
understanding an explicit, inspectable artifact first.

## Inputs

- `feature` — the ticket's summary.
- `requirements` — the ticket's description, already converted to plain
  text by [Jira](01-jira.md).

## Tools available

None beyond the submit tool — like the [Planner](04-planner.md), this
agent reasons over text it is already given; it has no browser and no
file access, by design. It cannot gather new facts, only organize the
ones it was handed.

| Tool           | Purpose                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `submit_brief` | Ends the turn with the full `RequirementsBrief`. The only way this agent's output leaves the conversation — a text-only reply is discarded. |

## Key rules

- Restate the feature in 1–3 sentences. If it can't restate the feature
  clearly, that's a signal to raise an open question, not to guess.
- Extract every acceptance criterion as **its own entry**, as close to the
  ticket's own wording as possible — never merged, never invented.
- Translate each criterion into a concrete exploration hint: which pages,
  UI states, or flows should the Explorer specifically look for? ("scroll
  the product grid until every loading placeholder resolves", not "check
  loading".)
- Anything genuinely ambiguous goes in `openQuestions`, never papered over
  as a guessed criterion.

## Outputs (files written)

- `brief.json` / `brief.md` — `understanding`, `acceptanceCriteria[]`,
  `explorationHints[]`, `openQuestions[]`.

## How its output actually gets used

`briefedRequirements()` merges the brief back into the raw ticket text —
understanding, extracted criteria, and exploration hints appended as one
string. **Both** the Explorer and the Planner then receive this merged
text as their `requirements` input instead of the raw ticket alone. This
is the entire mechanism: exploration is pointed at the feature because the
text it's given now says what to look for, not because the Explorer
agent itself changed.

## Example, from a real run

Given a ticket about a "Dynamic Catalog" submenu with five stated
acceptance criteria, a real run's brief surfaced genuine gaps the ticket
left unstated — not generic filler:

> _"What does 'eventually' mean for Lazy Load? There is no stated time
> limit or threshold, so the Explorer must measure it and the pass/fail
> timeout is undefined."_
>
> _"Is Lazy Load triggered by time or by scrolling? The ticket does not
> say."_

Nine such open questions came back from that one ticket — a real
traceability signal, not a rubber stamp.

## Source

[`orchestrator/src/agents/analyst.ts`](../../orchestrator/src/agents/analyst.ts)
