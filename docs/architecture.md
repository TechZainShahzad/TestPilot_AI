# Framework architecture

> **Phase 1 scaffold.** This document grows with the code. Sections marked
> _pending_ are filled in as the phase that builds them lands, so that nothing
> here describes code that does not exist yet.

## Scope

Two independent deliverables share one repository:

- **`framework/`** — a Playwright + TypeScript suite for
  [ParaBank](https://parabank.parasoft.com). It has no knowledge of the
  orchestrator and is useful on its own.
- **`orchestrator/`** — a multi-agent pipeline that writes code _into_ the
  framework. It reads the framework's conventions and shells out to its test
  runner, but the dependency only points one way.

Keeping the arrow one-directional is what makes the framework reviewable as a
normal test suite: a reader can evaluate it without forming an opinion about
the agent layer.

## Layering

```
tests/            specs — intent only, no selectors, no literals
  ↓ uses
fixtures/         dependency injection: page objects, API client, auth session
  ↓ constructs
pages/            page objects — locators and screen-level actions
api/              typed REST client — setup, teardown, pure API specs
data/             builders and factories — all test data originates here
utils/            config, logging, shared primitives
```

A spec is allowed to depend on anything below it; nothing depends upward. The
practical rule: **a selector never appears in a spec, and a literal value
never appears in a spec.** Both belong one layer down.

## Toolchain decisions

| Choice                                        | Reason                                                                                                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript `~6.0.3`, not 7.x                  | TS 7 (the Go-based compiler) shipped, but `typescript-eslint@8` declares `typescript <6.1.0`. Pinning keeps lint and type-check working together; the upgrade waits for the plugin.                    |
| `strict` + 6 extra flags                      | `strict` alone still permits `any` to leak out of index access and optional-property writes. `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are the two that catch real page-object bugs. |
| ESLint flat config, `strictTypeChecked`       | Type-aware linting is the only way to enforce the rules that matter here (`no-floating-promises`, `no-misused-promises`).                                                                              |
| `no-floating-promises` as **error**           | A forgotten `await` on a Playwright action does not throw — the test passes having done nothing. This is the highest-value rule in the config.                                                         |
| `playwright/no-wait-for-timeout` as **error** | Hard waits are the defining smell of a brittle suite. Making it a warning means it accumulates.                                                                                                        |
| npm workspaces                                | Two packages, one lockfile, one `npm ci`. No extra tooling to explain to someone cloning the repo.                                                                                                     |
| Zod-validated env                             | A typo in `.env` fails at startup with the offending key named, instead of appearing 40 seconds later as a navigation timeout.                                                                         |

## Configuration

All environment access funnels through [`framework/src/utils/env.ts`](../framework/src/utils/env.ts),
which parses `process.env` exactly once through a Zod schema and exports a
frozen, typed object. Specs and page objects never read `process.env`.

Every value has a default that works against the live demo app, so a fresh
clone runs with no `.env` at all. `.env.example` is committed and documents
each key; `.env` is ignored.

## Playwright project graph

| Project    | Purpose                                                        | Session               |
| ---------- | -------------------------------------------------------------- | --------------------- |
| `setup`    | Registers a fresh customer, saves `storageState`               | —                     |
| `api`      | Pure REST specs, no browser                                    | API-level login       |
| `ui`       | Browser specs, depends on `setup`                              | Reuses `storageState` |
| `ui-guest` | Specs that must start logged out (registration, invalid login) | Explicitly empty      |

Splitting `ui-guest` out is what lets the authenticated majority log in once.
Without it every spec either pays for a login or fights the stored session.

### Authentication

ParaBank exposes the same resources twice:

- `/parabank/services/bank/...` — partly unauthenticated, mostly XML. The
  endpoint `…/login/{username}/{password}` returns a customer as JSON and is
  the only anonymous read available.
- `/parabank/services_proxy/bank/...` — JSON, and requires the `JSESSIONID`
  cookie issued by a **UI** login. Anonymous calls return `401`.

So the API client authenticates by performing the form login, then reuses that
cookie. [`framework/tests/api/health.spec.ts`](../framework/tests/api/health.spec.ts)
asserts the `401` explicitly: if `services_proxy` ever stops requiring a
session, the client's entire auth strategy is obsolete and that test is where
it should surface.

### Test data

Faker-backed builders in `src/data/` — `buildNewCustomer()`,
`buildPayee()` — generate every field a form needs, with per-call overrides
for the specific fields a negative test cares about. `register.htm`'s own
validation turned out to check presence only, not format, so the builders
don't manufacture field-format edge cases that don't exist; what they do
guarantee is a unique, length-safe username (see "Known application
limitations" below). `USE_FIXED_USER` in `.env` is an escape hatch for fast
local loops against a pinned account, at the cost of the balance-consistency
specs becoming flaky if someone else uses the same account.

## Page objects

One class per screen, extending `BasePage`. `BasePage.goto()` is where the
one non-obvious shared behaviour lives: every account-bearing screen
(overview, transfer, open account, bill pay, find transactions, request
loan) server-renders its shell, then populates its account table or
`<select>` via a `$(document).ready` AJAX call to
`services_proxy/bank/customers/.../accounts`. `page.goto()` only waits for
`load`, which fires before that call resolves — confirmed live, where the
overview page's account table read back empty immediately after navigation.
`BasePage.goto()` waits for `networkidle` once, centrally, rather than
leaving every subclass to rediscover the same race. This is a real
completion condition, not the `waitForTimeout` hard-wait the lint config
bans.

Locators were taken from the live DOM (`innerHTML`, not just rendered text),
not guessed — several of ParaBank's own error-message ids turned out to be
unintuitive (`#validationModel-name` for Bill Pay, `customer.username.errors`
for Register) and would have been wrong on the first try otherwise.

## API client

[`ParaBankApiClient`](../framework/src/api/parabank-client.ts) wraps an
`APIRequestContext` rather than owning one — see "Authentication" above for
why — and builds every URL as a full absolute string rather than relying on
Playwright's `baseURL` + relative-path resolution, which silently drops
`/parabank` when the path starts with `/` (WHATWG URL rules: a base URL
without a trailing slash treats its last segment as a file, not a
directory). `register.htm` and `login.htm` also both 500 on a cold POST —
confirmed live — because the Struts-era backend expects a session to already
exist; `ensureSession()` does a cheap GET first to establish one, the same
way a browser landing on the page naturally would.

## Known application limitations

Found by driving the live app and reading its own client-side JS, not
assumed. Each one shapes a specific regression spec, noted alongside it.

| #   | Limitation                                                                                                                                                                                          | Evidence                                                                                                     | How the suite handles it                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`customer.username` silently rejects anything over 20 characters** — misreported as `"This username already exists."`, not a length error.                                                        | Bisected live: 20 chars succeeds, 21 fails, every time, with brand-new names.                                | [`customer-builder.ts`](../framework/src/data/customer-builder.ts) caps generated usernames at 18 characters.                                                                                                                                             |
| 2   | **Transfer Funds performs no server-side amount validation.** Negative, zero, and balance-exceeding amounts all return `200` with a success message. Only a non-numeric amount is rejected (`400`). | `transfer.htm`'s own `submit()` builds the AJAX URL straight from `$('#amount').val()` with no check at all. | The negative/zero/insufficient-funds specs assert the _correct business behaviour_ via `test.fail()`, with a comment citing this limitation — so the suite documents the gap instead of either hiding it or asserting a rejection the app cannot produce. |
| 3   | **Request Loan approves unconditionally.** Verified by requesting a six-figure loan with zero down payment from a freshly opened, zero-balance account — still `approved: true`.                    | Direct API probing, three different ways, same result.                                                       | The "denied" spec uses `test.fail()` for the same reason as #2; the "approved" spec is a genuine passing test.                                                                                                                                            |
| 4   | **No account lockout after repeated failed logins.**                                                                                                                                                | No lockout feature exists anywhere in the app to probe.                                                      | The brief's "locked" login scenario is interpreted as "empty fields," which the app does validate; the absence of lockout is recorded here rather than asserted as a failing test with nothing concrete to point at.                                      |

These are exactly the shape of finding the orchestrator's **Healer** agent is
designed to surface rather than hide (see [`docs/agents.md`](agents.md)) —
#2 and #3 are real, live instances of "a failure that is not a test bug."

## Reporting

Playwright's HTML report plus Allure. Allure earns its place through trend
history across nightly runs, which is also why the Pages workflow carries the
previous report's `history/` folder forward rather than publishing clean.

Shards produce `blob-report/` output, merged with `playwright merge-reports`
into one HTML report; Allure results merge by concatenation. See
[`.github/workflows/nightly.yml`](../.github/workflows/nightly.yml).

## CI/CD

| Workflow      | Trigger              | Does                                                                                                                                      |
| ------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`      | push/PR to `main`    | Prettier → ESLint → `tsc` → `@smoke`. The browser job runs only after static checks pass, so a lint error never costs a browser download. |
| `nightly.yml` | 02:30 UTC, or manual | Full suite across 4 shards (`fail-fast: false`), merges reports, calls `pages.yml`.                                                       |
| `pages.yml`   | reusable / manual    | Generates the Allure report with restored history and deploys to GitHub Pages.                                                            |

Traces upload on failure; the HTML report uploads always, because a red report
is the most useful artifact a failed run can produce.
