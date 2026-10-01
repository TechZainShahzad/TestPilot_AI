# Project Brief for Claude Code: AI-Orchestrated Playwright Automation Framework

## Goal

Build a portfolio-grade, open-source project with two parts:

1. **A production-quality Playwright + TypeScript test automation framework** for a public demo fintech/banking website.
2. **A multi-agent orchestrator** that automates the end-to-end development of automation code: it explores the app, plans test cases, writes Playwright tests and page objects, runs them, fixes failures, reviews the code, and opens a pull request.

The goal is a GitHub repo that recruiters and hiring managers can clone, run, and understand in under 10 minutes. Code quality, architecture, and documentation matter as much as features.

---

## Target Application

- Use **ParaBank** (https://parabank.parasoft.com), a public demo banking app with both a UI and a REST API.
- Before building, verify the site is reachable and check its main flows. If it is down or unstable, fall back to **SauceDemo** (https://www.saucedemo.com) and tell me before switching.
- Do not use any real company code or data.

---

## Part 1: Playwright Framework

### Tech stack

- Playwright Test, TypeScript (strict mode), Node LTS
- ESLint + Prettier
- Allure reporter plus Playwright's HTML report
- dotenv for environment config
- GitHub Actions for CI

### Architecture requirements

- **Page Object Model**, with a base page class and one page object per screen
- **Custom fixtures** that inject page objects, API clients, and authenticated sessions
- **API layer**: a typed API client for ParaBank REST endpoints, used for test setup/teardown and for pure API tests
- **Test data**: builders/factories with Faker; no hard-coded data in specs
- **Auth**: log in once via `storageState` and reuse it
- **Config per environment** (`.env.example` committed, real `.env` ignored)
- Tags such as `@smoke`, `@regression`, `@api`, `@ui` so suites can run selectively
- Retries, trace-on-first-retry, screenshots and video on failure

### Test coverage (fintech-focused scenarios)

- Register and log in (valid, invalid, locked/empty fields)
- Open a new account (checking/savings)
- Transfer funds: happy path, insufficient funds, same-account transfer, zero/negative/boundary amounts
- Bill pay with field validation
- Account overview and balance consistency (verify the UI balance matches the API balance after a transfer)
- Find transactions by date, amount, and ID
- Request a loan (approved and denied)
- API tests for accounts, transactions, and transfers, including schema validation

### Folder structure (suggested; adjust if you have a better reason)

```
/framework
  /src
    /pages
    /api
    /fixtures
    /data
    /utils
  /tests
    /ui
    /api
  playwright.config.ts
/orchestrator
  ...(see Part 2)
/docs
  architecture.md
  agents.md
.github/workflows/
README.md
```

### CI/CD

- GitHub Actions workflow: on push/PR, run lint, type-check, and the `@smoke` suite
- Nightly scheduled run of the full regression suite, sharded across parallel jobs
- Publish the Allure report to GitHub Pages so there is a live, shareable report link
- Upload Playwright traces as artifacts on failure

---

## Part 2: Multi-Agent Orchestrator

### Purpose

Given a target URL and a short feature description (e.g. "Bill Pay"), the orchestrator should produce working, reviewed Playwright tests that follow the framework's conventions. Humans stay in control: the final output is a pull request, never a direct push to main.

### Implementation

- TypeScript, using the **Claude Agent SDK** (or the Anthropic API with a tool-use loop if that turns out simpler). Read the latest docs before choosing.
- Use **Playwright MCP** (or the Playwright library directly) so agents can actually browse the app and inspect real DOM/accessibility snapshots instead of guessing selectors.
- Check whether Playwright's built-in test agents (planner/generator/healer) are available in the current version. If they are, explain in `docs/agents.md` how this orchestrator differs from them or builds on them. Don't just duplicate them.
- API key read from an environment variable; never committed.

### Agents

1. **Explorer**: navigates the feature in a real browser and records pages, elements, flows, and locator candidates (prefer role-, label-, and test-id-based locators).
2. **Planner**: turns the exploration output and the feature description into a structured test plan (Markdown + JSON) covering positive, negative, and boundary cases, with priorities.
3. **Generator**: writes or updates page objects, fixtures, data builders, and spec files that follow the existing framework patterns. It must reuse existing page objects rather than creating duplicates.
4. **Executor**: runs the generated tests and collects results, traces, and error output.
5. **Healer**: analyzes failures and decides whether each is a test bug (bad locator, timing, wrong assertion) or a likely app bug. It fixes test bugs and re-runs, with a hard limit on attempts (e.g. 3). It must never "fix" a test by weakening its assertion. Likely app bugs are reported, not hidden.
6. **Reviewer**: checks the generated code against a written checklist (POM followed, no hard waits, no hard-coded data, meaningful assertions, lint and type-check pass) and sends it back to the Generator if it fails.
7. **Reporter**: writes a run summary (what was generated, pass/fail, healed issues, suspected app bugs, token cost) and opens a pull request on a new branch.

### Orchestration requirements

- A clear state machine or pipeline: Explore → Plan → Generate → Execute → (Heal ↔ Execute) → Review → Report
- Shared context passed between agents as typed JSON artifacts saved to a run folder (`/orchestrator/runs/<timestamp>/`), so every run is inspectable and reproducible
- Logging of each agent step, its inputs and outputs, and tokens used
- Configurable limits: max heal attempts, max tokens/cost per run, timeouts
- A CLI entry point, e.g.:
  `npm run orchestrate -- --url https://parabank.parasoft.com --feature "Bill Pay"`
- A `--dry-run` mode that plans and generates without opening a PR

---

## Documentation (important for the portfolio)

- **README.md**: project pitch in 3 lines, architecture diagram (Mermaid), quick start, how to run the tests, how to run the orchestrator, badges for CI status and a link to the live report, and a short "Design decisions" section
- **docs/architecture.md**: framework design and the reasoning behind it
- **docs/agents.md**: each agent's role, inputs/outputs, prompts, and guardrails
- A sample run folder committed under `/examples` so people can see output without running anything

---

## How to work

- Work in phases and stop for my review after each one:
  1. Repo scaffold, tooling, CI skeleton
  2. Framework core (pages, fixtures, API client, data) plus the smoke suite
  3. Full regression coverage and the Allure/GitHub Pages report
  4. Orchestrator: Explorer + Planner
  5. Orchestrator: Generator + Executor + Healer
  6. Orchestrator: Reviewer + Reporter + PR creation
  7. Documentation polish and an example run
- Commit after each meaningful step with clear conventional commit messages.
- Keep all tests green before moving to the next phase.
- If something in this brief is unclear or a better approach exists, ask me or propose it before building.
