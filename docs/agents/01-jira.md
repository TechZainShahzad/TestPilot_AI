# Step 1 · 🎫 Jira

**Type:** Deterministic — no LLM call.
**Runs:** only when the run was started with `--jira-ticket KEY`. A plain
`--feature "name"` run skips this entirely and starts at
[Explorer](03-explorer.md) (Analyst is skipped too — see
[02-analyst.md](02-analyst.md)).

## Purpose

Fetch one Jira issue and turn it into the two plain strings every later
agent actually consumes: `feature` (the issue's summary) and
`requirements` (its description, converted out of Atlassian Document
Format). This step does no interpretation of the ticket — that is the
Analyst's job, immediately after this one.

## Inputs

- `--jira-ticket KEY` from the CLI.
- `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` from `.env`.

## What it does

1. `fetchIssue()` in [`core/jira.ts`](../../orchestrator/src/core/jira.ts)
   calls Jira Cloud's REST API v3 (`GET /rest/api/3/issue/{key}`) with HTTP
   **Basic** auth (`base64(email:apiToken)`) — Jira Cloud does not accept a
   bearer token here, a real and easy mistake.
2. The issue's `description` field comes back as Atlassian Document
   Format — a JSON tree, not Markdown or plain text.
   `adfToPlainText()` walks it with a small recursive renderer (paragraph,
   text, bulletList/orderedList/listItem, heading, hardBreak) and produces
   the plain text every downstream prompt actually reads. It is
   deliberately not a full ADF renderer — the only consumer is an LLM
   prompt, not a faithful re-rendering of the original document.
3. `findExistingPullRequest()` in
   [`core/github.ts`](../../orchestrator/src/core/github.ts) searches
   GitHub (`type:pr in:title <ticket key>`, no state filter) for a PR that
   already references this ticket. If one exists — open **or** closed —
   the run **warns and continues anyway**: the ticket may legitimately
   need a second pass. This is a live query against GitHub's own search
   API, not a local registry file that could drift out of sync with
   reality (a PR merged or closed outside this tool would leave a local
   record stale).

## Outputs (files written)

**None.** This is the one pipeline stage that writes nothing to
`runs/<timestamp>/` — `run.json` itself isn't created until after this
step resolves `feature`, and the ticket's own key/URL are only persisted
later, by the [Reporter](09-reporter.md), in the branch name and PR body.

## What it explicitly does not do

Write back to Jira — no comment, no status transition, nothing. Changing
a system of record other teams depend on deserves its own pass with its
own review, not a side effect of fetching a description.

## Source

[`orchestrator/src/core/jira.ts`](../../orchestrator/src/core/jira.ts) ·
called from [`cli.ts`](../../orchestrator/src/cli.ts)'s `main()`.
