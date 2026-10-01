/**
 * Helpers for opening isolated test accounts via the API — pure fixture
 * setup, not the behaviour under test, and the live demo's rate limiter
 * doesn't tolerate the extra browser navigations driving Open Account
 * through the UI would cost every spec in the run.
 *
 * Every `ui` spec in a run shares one `storageState` session — by design,
 * see docs/architecture.md — which means they all share one customer's
 * accounts too. A test asserting "transfer $X, balance drops by exactly $X"
 * against the shared registration checking account is only correct in
 * isolation; the moment another balance-mutating spec in the same run
 * touches that account first (and several do, deliberately, to document
 * known validation gaps), the assertion starts reading someone else's
 * delta. Opening a brand-new account that only this test ever touches
 * removes the shared state instead of trying to out-guess it.
 */
import type { ParaBankApiClient } from '../../src/api/parabank-client.js';

/**
 * ParaBank's `createAccount` always debits exactly this much from
 * `fromAccountId` and credits it to the new account as a real transaction
 * pair — confirmed live by reading both accounts' transaction history
 * immediately after creation. A freshly opened account's *true* starting
 * balance is this amount, not `0`, even though `createAccount`'s own
 * response says `0`. See "Known application limitations" in
 * docs/architecture.md.
 */
export const FORCED_OPENING_DEPOSIT = 100;

/**
 * Opens a fresh SAVINGS account. Its real starting balance is
 * {@link FORCED_OPENING_DEPOSIT}, debited from `fundingAccountId` — not the
 * `0` `createAccount`'s own response reports.
 */
export async function openEmptyAccount(
  apiClient: ParaBankApiClient,
  customerId: number,
  fundingAccountId: number
): Promise<number> {
  const account = await apiClient.openAccount(customerId, 'SAVINGS', fundingAccountId);
  return account.id;
}

/**
 * Opens a fresh SAVINGS account and tops it up so its balance is *exactly*
 * `totalBalance` — accounting for the {@link FORCED_OPENING_DEPOSIT} every
 * new account already carries, so callers can reason about a clean target
 * number instead of the deposit quirk.
 */
export async function openFundedAccount(
  apiClient: ParaBankApiClient,
  customerId: number,
  fundingAccountId: number,
  totalBalance: number
): Promise<number> {
  if (totalBalance < FORCED_OPENING_DEPOSIT) {
    throw new Error(
      `openFundedAccount: totalBalance must be >= ${String(FORCED_OPENING_DEPOSIT)} ` +
        `(ParaBank's forced opening deposit), got ${String(totalBalance)}.`
    );
  }

  const accountId = await openEmptyAccount(apiClient, customerId, fundingAccountId);
  const topUp = totalBalance - FORCED_OPENING_DEPOSIT;
  if (topUp > 0) {
    await apiClient.transfer(fundingAccountId, accountId, topUp);
  }
  return accountId;
}
