import { expect, test } from '@fixtures/pages.js';
import { defined } from '@utils/assert.js';

test.describe('account overview @smoke @ui', () => {
  test('a freshly registered customer sees one CHECKING account with a $100,000 balance', async ({
    overviewPage,
  }) => {
    await overviewPage.goto();

    const ids = await overviewPage.accountIds();
    expect(ids).toHaveLength(1);
    const accountId = defined(ids[0], 'account list unexpectedly empty');

    await expect(overviewPage.accountLink(accountId)).toBeVisible();

    const balance = await overviewPage.balanceFor(accountId);
    expect(balance).toBe(100_000);
  });
});
