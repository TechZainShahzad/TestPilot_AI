import { env } from '@utils/env.js';

import { defined } from '@utils/assert.js';

import { transactionListSchema, transactionSchema } from '../../src/api/types.js';
import { expect, test } from '../../src/fixtures/api.js';

test.describe('transactions API @regression @api', () => {
  test('a transfer produces a Debit and a Credit leg, both schema-valid', async ({
    apiClient,
    registeredUser,
    request,
  }) => {
    await apiClient.transfer(
      registeredUser.checkingAccountId,
      registeredUser.checkingAccountId,
      99.99
    );

    const response = await request.get(
      `${env.apiProxyUrl}/accounts/${String(registeredUser.checkingAccountId)}/transactions`,
      { headers: { Accept: 'application/json' } }
    );
    const transactions = transactionListSchema.parse(await response.json());

    expect(transactions).toHaveLength(2);
    expect(transactions.map((t) => t.type).sort()).toEqual(['Credit', 'Debit']);
    for (const transaction of transactions) {
      expect(transaction.amount).toBe(99.99);
      expect(transaction.accountId).toBe(registeredUser.checkingAccountId);
    }
  });

  test('getTransactionById returns a schema-valid single transaction', async ({
    apiClient,
    registeredUser,
  }) => {
    await apiClient.transfer(
      registeredUser.checkingAccountId,
      registeredUser.checkingAccountId,
      55.55
    );
    const transactions = await apiClient.getTransactions(registeredUser.checkingAccountId);
    const first = defined(transactions[0], 'expected at least one transaction after a transfer');

    const found = await apiClient.getTransactionById(first.id);
    const validated = transactionSchema.parse(found);
    expect(validated.id).toBe(first.id);
  });

  test('getTransactionById returns undefined for an ID that does not exist', async ({
    apiClient,
  }) => {
    const found = await apiClient.getTransactionById(999_999_999);
    expect(found).toBeUndefined();
  });

  test('getTransactionsByAmount filters to the exact amount', async ({
    apiClient,
    registeredUser,
  }) => {
    await apiClient.transfer(
      registeredUser.checkingAccountId,
      registeredUser.checkingAccountId,
      123.45
    );

    const matches = await apiClient.getTransactionsByAmount(
      registeredUser.checkingAccountId,
      123.45
    );
    expect(matches.length).toBeGreaterThanOrEqual(2);
    for (const match of matches) expect(match.amount).toBe(123.45);

    const noMatches = await apiClient.getTransactionsByAmount(
      registeredUser.checkingAccountId,
      987654.32
    );
    expect(noMatches).toEqual([]);
  });

  test('getTransactionsByDateRange spanning today includes today’s transactions', async ({
    apiClient,
    registeredUser,
  }) => {
    await apiClient.transfer(
      registeredUser.checkingAccountId,
      registeredUser.checkingAccountId,
      11.11
    );

    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const matches = await apiClient.getTransactionsByDateRange(
      registeredUser.checkingAccountId,
      yesterday,
      today
    );

    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
