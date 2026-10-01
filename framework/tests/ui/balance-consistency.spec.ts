import { expect, test } from '@fixtures/pages.js';

import { openEmptyAccount, openFundedAccount } from '../support/isolated-account.js';

/**
 * Verifies the UI never drifts from the data it is rendering — the
 * Accounts Overview table, the Account Activity page, and a direct REST
 * read must all agree, both before and after a transfer changes the
 * balance. This is the one spec that deliberately reads the same state
 * three different ways instead of picking the cheapest one.
 *
 * Runs against a freshly funded, isolated account — see
 * tests/support/isolated-account.ts — so the balance this test tracks is
 * never touched by any other spec sharing the same `ui` session.
 */
test.describe('balance consistency @regression @ui', () => {
  test('overview, account activity, and the API agree on balance after a transfer', async ({
    testUser,
    overviewPage,
    transferPage,
    accountActivityPage,
    sessionApi,
  }) => {
    const source = await openFundedAccount(
      sessionApi,
      testUser.id,
      testUser.checkingAccountId,
      5000
    );
    const destination = await openEmptyAccount(sessionApi, testUser.id, testUser.checkingAccountId);

    const apiBefore = await sessionApi.getAccount(source);
    expect(apiBefore.balance).toBe(5000);

    await overviewPage.goto();
    expect(await overviewPage.balanceFor(source)).toBe(apiBefore.balance);

    await transferPage.goto();
    await transferPage.transfer({
      amount: '1234.56',
      fromAccountId: source,
      toAccountId: destination,
    });
    await expect(transferPage.resultPanel).toBeVisible();

    const apiAfter = await sessionApi.getAccount(source);
    expect(apiAfter.balance).toBe(apiBefore.balance - 1234.56);

    await overviewPage.goto();
    expect(await overviewPage.balanceFor(source)).toBe(apiAfter.balance);

    await accountActivityPage.gotoAccount(source);
    expect(await accountActivityPage.balance()).toBe(apiAfter.balance);
  });
});
