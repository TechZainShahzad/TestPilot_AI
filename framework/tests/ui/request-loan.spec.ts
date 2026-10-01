import { expect, test } from '@fixtures/pages.js';

import { openEmptyAccount } from '../support/isolated-account.js';

/**
 * This demo deployment's `requestLoan` endpoint approves unconditionally —
 * verified by requesting a six-figure loan with zero down payment from a
 * freshly opened, minimal-balance account and still getting back
 * `approved: true`. See "Known application limitations" in
 * docs/architecture.md. The "denied" case below uses `test.fail()` for the
 * same reason as the transfer-validation specs: it asserts the business
 * rule the app should enforce, against an app that cannot produce that
 * result, so the gap stays visible instead of silently passing or failing.
 */
test.describe('request loan @regression @ui', () => {
  test('a modest loan with a reasonable down payment is approved', async ({ requestLoanPage }) => {
    await requestLoanPage.goto();
    await requestLoanPage.apply({ amount: '5000', downPayment: '2000' });

    await expect(requestLoanPage.status).toHaveText('Approved');
    await expect(requestLoanPage.approvedPanel).toBeVisible();
    await expect(requestLoanPage.newAccountLink).not.toHaveText('');
  });

  test('a six-figure loan with no down payment from a near-empty account should be denied', async ({
    testUser,
    requestLoanPage,
    sessionApi,
  }) => {
    test.fail();

    // A freshly opened account carries only ParaBank's forced $100 opening
    // deposit (see tests/support/isolated-account.ts) — nowhere near enough
    // to service a six-figure loan with zero down payment.
    const minimalBalanceAccountId = await openEmptyAccount(
      sessionApi,
      testUser.id,
      testUser.checkingAccountId
    );

    await requestLoanPage.goto();
    await requestLoanPage.apply({
      amount: '100000',
      downPayment: '0',
      fromAccountId: minimalBalanceAccountId,
    });

    await expect(requestLoanPage.status).toHaveText('Denied');
    await expect(requestLoanPage.deniedPanel).toBeVisible();
  });
});
