import { expect, test } from '@fixtures/pages.js';
import { buildPayee } from '@data/payee-builder.js';

import { openFundedAccount } from '../support/isolated-account.js';

test.describe('bill pay @regression @ui', () => {
  test('a happy-path payment debits the paying account by the exact amount', async ({
    testUser,
    billPayPage,
    sessionApi,
  }) => {
    // Isolated: no other spec in this run ever touches this account's
    // balance — see tests/support/isolated-account.ts.
    const payingAccount = await openFundedAccount(
      sessionApi,
      testUser.id,
      testUser.checkingAccountId,
      100
    );

    const payee = buildPayee();
    await billPayPage.goto();
    await billPayPage.payBill(payee, '42.50', payingAccount);

    await expect(billPayPage.resultPayeeName).toHaveText(payee.name);
    await expect(billPayPage.resultAmount).toHaveText('$42.50');

    expect((await sessionApi.getAccount(payingAccount)).balance).toBe(57.5);
  });

  test('an empty payee name is rejected client-side with no request sent', async ({
    billPayPage,
  }) => {
    await billPayPage.goto();
    await billPayPage.accountNumberInput.fill('123456');
    await billPayPage.verifyAccountInput.fill('123456');
    await billPayPage.amountInput.fill('10');
    await billPayPage.submit();

    await expect(billPayPage.fieldError('name')).toHaveText('Payee name is required.');
    await expect(billPayPage.resultPanel).toBeHidden();
  });

  test('a mismatched verify-account number is rejected', async ({ billPayPage }) => {
    const payee = buildPayee({ accountNumber: '111222' });
    await billPayPage.goto();
    await billPayPage.fillForm(payee, '10');
    await billPayPage.verifyAccountInput.fill('999888'); // deliberately different
    await billPayPage.submit();

    await expect(billPayPage.verifyAccountMismatchError).toHaveText(
      'The account numbers do not match.'
    );
    await expect(billPayPage.resultPanel).toBeHidden();
  });

  test('a non-numeric account number is rejected', async ({ billPayPage }) => {
    const payee = buildPayee();
    await billPayPage.goto();
    await billPayPage.fillForm(payee, '10');
    await billPayPage.accountNumberInput.fill('not-a-number');
    await billPayPage.verifyAccountInput.fill('not-a-number');
    await billPayPage.submit();

    await expect(billPayPage.accountNumberInvalidError).toHaveText('Please enter a valid number.');
    await expect(billPayPage.resultPanel).toBeHidden();
  });

  test('an empty amount is rejected', async ({ billPayPage }) => {
    const payee = buildPayee();
    await billPayPage.goto();
    await billPayPage.fillForm(payee, '');
    await billPayPage.submit();

    await expect(billPayPage.amountEmptyError).toHaveText('The amount cannot be empty.');
    await expect(billPayPage.resultPanel).toBeHidden();
  });

  test('a non-numeric amount is rejected', async ({ billPayPage }) => {
    const payee = buildPayee();
    await billPayPage.goto();
    await billPayPage.fillForm(payee, 'abc');
    await billPayPage.submit();

    await expect(billPayPage.amountInvalidError).toHaveText('Please enter a valid amount.');
    await expect(billPayPage.resultPanel).toBeHidden();
  });
});
