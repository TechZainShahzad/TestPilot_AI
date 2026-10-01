import { env } from '@utils/env.js';

import { problemDetailSchema } from '../../src/api/types.js';
import { expect, test } from '../../src/fixtures/api.js';
import { FORCED_OPENING_DEPOSIT } from '../support/isolated-account.js';

/**
 * `services_proxy/bank/transfer` performs no server-side amount validation
 * — see "Known application limitations" in docs/architecture.md. The one
 * `test.fail()` case here asserts the business rule the endpoint should
 * enforce; the UI regression spec (`tests/ui/transfer.spec.ts`) covers the
 * zero and insufficient-funds variants of the same gap.
 */
test.describe('transfers API @regression @api', () => {
  test('a transfer updates both account balances by the exact amount', async ({
    apiClient,
    registeredUser,
  }) => {
    // openAccount itself debits the funding account FORCED_OPENING_DEPOSIT
    // and credits it to the new account — see
    // tests/support/isolated-account.ts — so both accounts' math below
    // accounts for that before the transfer under test even happens.
    const savings = await apiClient.openAccount(
      registeredUser.customerId,
      'SAVINGS',
      registeredUser.checkingAccountId
    );

    const message = await apiClient.transfer(registeredUser.checkingAccountId, savings.id, 300);
    expect(message).toContain('Successfully transferred $300');

    const checking = await apiClient.getAccount(registeredUser.checkingAccountId);
    const updatedSavings = await apiClient.getAccount(savings.id);
    expect(checking.balance).toBe(100_000 - FORCED_OPENING_DEPOSIT - 300);
    expect(updatedSavings.balance).toBe(FORCED_OPENING_DEPOSIT + 300);
  });

  test('a non-numeric amount returns a 400 matching the problem-detail schema', async ({
    request,
    registeredUser,
  }) => {
    const response = await request.post(
      `${env.apiProxyUrl}/transfer` +
        `?fromAccountId=${String(registeredUser.checkingAccountId)}` +
        `&toAccountId=${String(registeredUser.checkingAccountId)}&amount=not-a-number`,
      { headers: { Accept: 'application/json' } }
    );

    expect(response.status()).toBe(400);
    const parsed = problemDetailSchema.parse(await response.json());
    expect(parsed.status).toBe(400);
  });

  test('a negative amount should be rejected', async ({ apiClient, registeredUser }) => {
    test.fail();

    const savings = await apiClient.openAccount(
      registeredUser.customerId,
      'SAVINGS',
      registeredUser.checkingAccountId
    );
    await apiClient.transfer(registeredUser.checkingAccountId, savings.id, -500);

    const checking = await apiClient.getAccount(registeredUser.checkingAccountId);
    expect(checking.balance).toBe(100_000);
  });
});
