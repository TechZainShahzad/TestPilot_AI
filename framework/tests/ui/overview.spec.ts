import { expect, test } from '@fixtures/pages.js';

/**
 * Deliberately does not assert "exactly 1 account" or a fixed $100,000
 * balance: every `ui` spec in a run shares one session (see
 * docs/architecture.md), and several regression specs open accounts or
 * transfer money on this same customer. Asserting a snapshot that only
 * holds immediately after registration made this smoke test fail the
 * moment it ran alongside the rest of the suite rather than alone. What it
 * checks instead — the UI shows the known CHECKING account with whatever
 * balance the API currently reports for it — is both fast and true
 * regardless of what else has run.
 */
test.describe('account overview @smoke @ui', () => {
  test('the overview shows the registered CHECKING account with its current balance', async ({
    testUser,
    overviewPage,
    sessionApi,
  }) => {
    await overviewPage.goto();

    await expect(overviewPage.accountLink(testUser.checkingAccountId)).toBeVisible();

    const apiBalance = (await sessionApi.getAccount(testUser.checkingAccountId)).balance;
    const uiBalance = await overviewPage.balanceFor(testUser.checkingAccountId);
    expect(uiBalance).toBe(apiBalance);
  });
});
