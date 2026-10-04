# Step 9 · 📣 Reporter

**Type:** Deterministic — no LLM call.
**Runs:** always, exactly once, whether the last review was approved or
the rounds simply ran out.

## Purpose

Template the run summary from artifacts that are already structured JSON
by this point, then — unless this is a dry run — open the pull request.
Like the Executor, this needs no reasoning an LLM call would add latency
and cost for: every input (plan, generation, execution, healing, review)
already exists as typed data.

## Inputs

Every prior artifact: `plan`, `generations[]`, `executions[]`,
`healings[]`, `reviews[]`, plus `feature`, `targetUrl`, `provider`, and
the Jira ticket's key/URL if one drove the run.

## What it does, in order

1. Renders `summary.md` — plan summary and case count, every file
   written (path + reason), the final execution's pass/fail/skip counts,
   healing outcomes, **every suspected application bug, explicitly not
   hidden**, the final review verdict with any blocking findings, and
   total token/cost usage.
2. **Stops here** if `--dry-run` was passed, no git remote `origin`
   exists, or nothing was actually written — no branch, no commit, no PR.
3. Otherwise: creates a new branch —
   `testpilot/<jira-key-or-feature-slug>-<timestamp>` — **never** the
   branch the run was started on. There is no code path in this project
   that commits to the current branch.
4. Stages **only** the exact paths `generation.json` recorded (never
   `git add -A`). If nothing is actually staged (generated files exactly
   match what's already committed), it checks back out to the base
   branch and stops — no empty PR.
5. Commits, pushes, and opens the pull request via GitHub's REST API,
   with `summary.md` as the PR body.

## Outputs (files written)

- `summary.md` — always, even on a dry run.
- `pull-request.json` — `{ url, number }`, only if a PR was actually
  opened.
- A new branch, a commit, and an open PR on GitHub — only on a non-dry
  run with a token and something to commit.

## Why it's this careful about git

**The output is a pull request, never a push to `main`.** A human decides
whether generated code enters the repository. `--dry-run` stops before
any git command runs; it's also forced on automatically when
`GITHUB_TOKEN` is absent, so a fresh clone can't push by accident. Branch
creation, staging, committing, and pushing were all verified against a
disposable scratch repository with its own local bare remote — never the
real `TestPilot_AI` repo — and `stagePaths([])` was confirmed to refuse a
bare `git add`. The GitHub pull-request call itself was separately
verified against a local HTTP test double standing in for
`api.github.com` (correct method, auth header, request body, and error
handling on a non-2xx response) before ever being pointed at the real
API.

## Source

[`orchestrator/src/agents/reporter.ts`](../../orchestrator/src/agents/reporter.ts) ·
git in [`core/git.ts`](../../orchestrator/src/core/git.ts) ·
GitHub API in [`core/github.ts`](../../orchestrator/src/core/github.ts)
