import { expect, test } from '@fixtures/api.js';

test.describe('accounts API @smoke @api', () => {
  test('a freshly registered customer has one CHECKING account with a positive starting balance', async ({
    apiClient,
    registeredUser,
  }) => {
    // Not asserting a specific balance: this demo's starting balance is not
    // a documented, stable contract — it was $100,000 for most of this
    // project's development and changed to $515.50 partway through the
    // same day, confirmed by two independent fresh registrations. What
    // genuinely matters — and is stable — is that registration funds the
    // account at all.
    const account = await apiClient.getAccount(registeredUser.checkingAccountId);

    expect(account).toMatchObject({
      id: registeredUser.checkingAccountId,
      customerId: registeredUser.customerId,
      type: 'CHECKING',
    });
    expect(account.balance).toBeGreaterThan(0);
  });

  test('getCustomerAccounts lists the same account', async ({ apiClient, registeredUser }) => {
    const accounts = await apiClient.getCustomerAccounts(registeredUser.customerId);

    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ id: registeredUser.checkingAccountId, type: 'CHECKING' });
  });
});
