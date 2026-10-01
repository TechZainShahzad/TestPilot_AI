import { expect, test } from '@fixtures/api.js';

test.describe('accounts API @smoke @api', () => {
  test('a freshly registered customer has one CHECKING account with a $100,000 balance', async ({
    apiClient,
    registeredUser,
  }) => {
    const account = await apiClient.getAccount(registeredUser.checkingAccountId);

    expect(account).toMatchObject({
      id: registeredUser.checkingAccountId,
      customerId: registeredUser.customerId,
      type: 'CHECKING',
      balance: 100_000,
    });
  });

  test('getCustomerAccounts lists the same account', async ({ apiClient, registeredUser }) => {
    const accounts = await apiClient.getCustomerAccounts(registeredUser.customerId);

    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ id: registeredUser.checkingAccountId, type: 'CHECKING' });
  });
});
