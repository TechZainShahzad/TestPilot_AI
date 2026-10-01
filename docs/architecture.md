# Framework architecture

> **Status.** The framework (phases 1–3) is complete — page objects, data
> builders, fixtures, and full regression coverage. This document describes
> what is actually built, not a plan.
>
> **Target application.** Originally built against ParaBank. Migrated to
> [SauceDemo](https://www.saucedemo.com) after ParaBank's shared Cloudflare-
> fronted demo temporarily rate-limited active developers (automated testing
> itself was unaffected — confirmed live). Everything below describes the
> SauceDemo build; where a design decision is a direct consequence of that
> switch, it says so.

## Scope

Two independent deliverables share one repository:

- **`framework/`** — a Playwright + TypeScript suite for
  [SauceDemo](https://www.saucedemo.com). It has no knowledge of the
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
fixtures/         dependency injection: page objects, auth session
  ↓ constructs
pages/            page objects — locators and screen-level actions
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

| Project    | Purpose                                                                | Session               |
| ---------- | ---------------------------------------------------------------------- | --------------------- |
| `setup`    | Logs in as the configured demo account, saves `storageState`           | —                     |
| `ui`       | Browser specs, depends on `setup`                                      | Reuses `storageState` |
| `ui-guest` | Specs that must start logged out (login variants, seeded-bug accounts) | Explicitly empty      |

Splitting `ui-guest` out is what lets the authenticated majority log in once.
Without it every spec either pays for a login or fights the stored session.

### Identity

SauceDemo has no registration — every identity is one of its fixed demo
accounts (`standard_user`, plus deliberately-broken variants like
`locked_out_user`, `problem_user`, `performance_glitch_user`, `error_user`,
`visual_user`), all sharing the password `secret_sauce`. The `setup` project
logs in once as the account configured via `SAUCE_USERNAME`/`SAUCE_PASSWORD`
in `.env` (default `standard_user`) and every `ui` spec reuses that session.
Specs that need a different account (login failure cases, the seeded-bug
accounts) run unauthenticated under `ui-guest` and log in themselves — there
is no session-sharing complexity to manage, unlike a target with a real
backend session API.

### Test data

A single Faker-backed builder, `buildCheckoutInfo()` in `src/data/`,
generates the checkout step-one form's first name, last name, and postal
code. With no registration and no other form in the app, this is the only
generated-data need — confirmed live that the form's own validation checks
presence only, not format (an arbitrary postal code with no digits at all
sails through to the order overview).

## Page objects

One class per screen, extending `BasePage`. Locators are taken from the live
DOM (`innerHTML`), not guessed — SauceDemo consistently exposes a
`data-test="..."` attribute on every interactive element, which is what
every page object locates against (`playwright.config.ts` also sets
`testIdAttribute: 'data-test'` for the same reason). The one exception is
the burger-menu's open/close buttons, which have no `data-test` and are
located by their stable `id`s instead — confirmed live, not assumed.

Unlike ParaBank, there is no client-side AJAX race to wait out: SauceDemo's
screens render their data synchronously, so page objects navigate with a
plain `page.goto()` and no extra `networkidle` wait.

## Why there's no API layer

SauceDemo has no backend REST API — confirmed live: zero XHR/fetch calls to
any `saucedemo.com` endpoint across a full login → add-to-cart → checkout
flow (only third-party telemetry beacons to `events.backtrace.io`). The
original brief called for API-tier coverage alongside the UI suite; that
requirement does not carry over to this target and is dropped here
explicitly rather than silently. There is no `api` Playwright project, no
`src/api/` client, and no `@api`-tagged spec anywhere in the suite.

## Known application limitations

SauceDemo deliberately ships several broken demo accounts as a QA-training
exercise. Each row below was confirmed live and found reproducible across
repeated runs before being written into a spec — an account's reputation
alone was never enough; several candidates were checked and dropped for lack
of reproducible evidence (see the last row).

| #   | Limitation                                                                                                                                                                                                                                                                                                | Evidence                                                                                                                                       | How the suite handles it                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`problem_user`'s product images are all identical** — every item on the inventory page resolves to the same broken `sl-404-....jpg` placeholder, regardless of which product it is.                                                                                                                     | Logged in live and read every `<img>` `src` on the inventory page: all 6 resolve to one URL.                                                   | [`known-limitations.guest.spec.ts`](../framework/tests/ui/known-limitations.guest.spec.ts) asserts all image sources collapse to a single URL. |
| 2   | **`problem_user`'s "Name (Z to A)" sort option has no effect.** Selecting it leaves the listing in its default order instead of reversing it.                                                                                                                                                             | Captured the default order, selected the option, compared: the rendered order after sorting still matches the default, not a true Z-to-A sort. | Same spec file asserts the order is unchanged by the sort action and explicitly does not match a true reverse-alphabetical order.              |
| 3   | **Accounts checked and excluded from active coverage for lack of reproducible evidence:** `performance_glitch_user` showed no measurable login delay in a timed check (31ms); an `error_user` cart-rendering anomaly seen once during initial exploration did not reproduce on a second, independent run. | Live timing measurement for the first; two independent runs for the second, with different outcomes.                                           | Neither is asserted on — a reputation from the wider SauceDemo community is not, by itself, evidence this build of the app still exhibits it.  |

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

**A note on load.** SauceDemo is a small, shared public demo, not a
load-tested target, and it fronts with Cloudflare — the same class of
infrastructure that temporarily rate-limited a developer's own browser
while this project was still targeting ParaBank (see the status note at the
top of this document). SauceDemo's own concurrency tolerance hasn't been
separately characterized, so each nightly shard stays conservative and runs
`--workers=1` rather than assume it can take more. Locally, prefer
`--workers=2` or fewer, and reach for `--grep` to target the specs actually
under development rather than re-running the whole suite.
