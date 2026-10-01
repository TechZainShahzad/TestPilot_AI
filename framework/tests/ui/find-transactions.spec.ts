import { toParaBankDate } from '@api/parabank-client.js';
import { expect, test } from '@fixtures/pages.js';
import { defined } from '@utils/assert.js';

/**
 * The transaction under search is always created via `sessionApi.transfer`
 * (API setup), not by driving the Transfer Funds UI — creating it is not
 * the behaviour under test here, and the shared live demo's rate limiter
 * doesn't tolerate the extra browser round-trip across every spec in the
 * run.
 */
test.describe('find transactions @regression @ui', () => {
  test('find by transaction ID returns the matching row', async ({
    testUser,
    findTransactionsPage,
    sessionApi,
  }) => {
    await sessionApi.transfer(testUser.checkingAccountId, testUser.checkingAccountId, 77.0);

    const [transaction] = await sessionApi.getTransactions(testUser.checkingAccountId);
    const target = defined(transaction, 'expected at least one transaction after a transfer');

    await findTransactionsPage.goto();
    await findTransactionsPage.findById(target.id);

    await expect(findTransactionsPage.resultRows).toHaveCount(1);
    await expect(findTransactionsPage.resultRows).toContainText(target.description);
  });

  test('an invalid transaction ID is rejected client-side', async ({ findTransactionsPage }) => {
    await findTransactionsPage.goto();
    await findTransactionsPage.transactionIdInput.fill('not-a-number');
    await findTransactionsPage.findByIdButton.click();

    await expect(findTransactionsPage.transactionIdError).toHaveText('Invalid transaction ID');
    await expect(findTransactionsPage.resultTable).toBeHidden();
  });

  test('find by amount returns every transaction for that amount', async ({
    testUser,
    findTransactionsPage,
    sessionApi,
  }) => {
    await sessionApi.transfer(testUser.checkingAccountId, testUser.checkingAccountId, 88.88);

    await findTransactionsPage.goto();
    await findTransactionsPage.findByAmount('88.88');

    // A same-account transfer records one Debit and one Credit leg.
    await expect(findTransactionsPage.resultRows).toHaveCount(2);
  });

  test('find by amount with no match returns an empty result, not an error', async ({
    findTransactionsPage,
  }) => {
    await findTransactionsPage.goto();
    await findTransactionsPage.findByAmount('194727.33');

    await expect(findTransactionsPage.resultTable).toBeVisible();
    await expect(findTransactionsPage.resultRows).toHaveCount(0);
    await expect(findTransactionsPage.errorContainer).toBeHidden();
  });

  test('find by date returns transactions from today', async ({
    testUser,
    findTransactionsPage,
    sessionApi,
  }) => {
    await sessionApi.transfer(testUser.checkingAccountId, testUser.checkingAccountId, 15.15);

    await findTransactionsPage.goto();
    await findTransactionsPage.findByDate(toParaBankDate(new Date()));

    const count = await findTransactionsPage.resultRows.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('find by date range spanning today returns transactions from today', async ({
    testUser,
    findTransactionsPage,
    sessionApi,
  }) => {
    await sessionApi.transfer(testUser.checkingAccountId, testUser.checkingAccountId, 16.16);

    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    await findTransactionsPage.goto();
    await findTransactionsPage.findByDateRange(toParaBankDate(yesterday), toParaBankDate(today));

    const count = await findTransactionsPage.resultRows.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
