import { expect, test } from '@fixtures/pages.js';
import { defined } from '@utils/assert.js';

import { FORCED_OPENING_DEPOSIT } from '../support/isolated-account.js';

test.describe('open new account @regression @ui', () => {
  test('opening a SAVINGS account adds it to the overview with the forced opening deposit', async ({
    openAccountPage,
    overviewPage,
  }) => {
    // Not $0: ParaBank always debits the funding account exactly $100 and
    // credits it to the new account — see "Known application limitations"
    // in docs/architecture.md.
    await openAccountPage.goto();
    const newAccountId = await openAccountPage.openAccount('SAVINGS');

    await overviewPage.goto();
    await expect(overviewPage.accountLink(newAccountId)).toBeVisible();
    expect(await overviewPage.balanceFor(newAccountId)).toBe(FORCED_OPENING_DEPOSIT);
  });

  test('opening a second CHECKING account is permitted', async ({
    openAccountPage,
    overviewPage,
  }) => {
    await overviewPage.goto();
    const before = await overviewPage.accountIds();

    await openAccountPage.goto();
    const newAccountId = await openAccountPage.openAccount('CHECKING');

    await overviewPage.goto();
    const after = await overviewPage.accountIds();
    expect(after).toHaveLength(before.length + 1);
    expect(after).toContain(newAccountId);
  });

  test('the new account can be opened from a specific funding account', async ({
    openAccountPage,
    overviewPage,
  }) => {
    await overviewPage.goto();
    const existingId = defined(
      (await overviewPage.accountIds())[0],
      'expected at least one existing account'
    );

    await openAccountPage.goto();
    const newAccountId = await openAccountPage.openAccount('SAVINGS', existingId);

    await expect(openAccountPage.newAccountLink).toHaveAttribute(
      'href',
      `activity.htm?id=${String(newAccountId)}`
    );
  });
});
