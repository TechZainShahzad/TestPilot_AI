import { expect, test } from '@fixtures/pages.js';

import { openEmptyAccount, openFundedAccount } from '../support/isolated-account.js';

/**
 * Every balance-math test below works against its own freshly opened,
 * freshly funded account rather than the shared registration checking
 * account — see tests/support/isolated-account.ts for why: every `ui` spec
 * in a run shares one session, several specs deliberately mutate the
 * checking account's balance (the known-limitation cases below included),
 * and an exact-delta assertion against shared state is only correct until a
 * second spec touches it first. Account setup goes through the API, not the
 * UI — it is fixture setup, not the behaviour under test, and the live
 * app's rate limiter does not tolerate the extra browser navigations.
 *
 * Transfer Funds performs no server-side amount validation at all — see
 * "Known application limitations" in docs/architecture.md. The three
 * `test.fail()` cases assert the *correct* business rule (negative, zero,
 * and balance-exceeding transfers should be rejected) against this live
 * app, which cannot produce that result. `test.fail()` keeps the suite
 * green while recording the gap: if ParaBank ever starts validating, these
 * tests start failing-to-fail, which is exactly the signal to flip them
 * into real assertions.
 */
test.describe('transfer funds @regression @ui', () => {
  test('a happy-path transfer moves the exact amount between two accounts', async ({
    testUser,
    transferPage,
    sessionApi,
  }) => {
    const source = await openFundedAccount(
      sessionApi,
      testUser.id,
      testUser.checkingAccountId,
      1000
    );
    const destination = await openEmptyAccount(sessionApi, testUser.id, testUser.checkingAccountId);

    await transferPage.goto();
    await transferPage.transfer({
      amount: '250.00',
      fromAccountId: source,
      toAccountId: destination,
    });
    await expect(transferPage.resultPanel).toBeVisible();

    expect((await sessionApi.getAccount(source)).balance).toBe(750);
    // destination opened with the forced $100 deposit (see
    // tests/support/isolated-account.ts), plus the $250 just transferred.
    expect((await sessionApi.getAccount(destination)).balance).toBe(350);
  });

  test('transferring the full available balance empties the source account', async ({
    testUser,
    transferPage,
    sessionApi,
  }) => {
    const source = await openFundedAccount(
      sessionApi,
      testUser.id,
      testUser.checkingAccountId,
      500
    );
    const destination = await openEmptyAccount(sessionApi, testUser.id, testUser.checkingAccountId);

    await transferPage.goto();
    await transferPage.transfer({
      amount: '500.00',
      fromAccountId: source,
      toAccountId: destination,
    });
    await expect(transferPage.resultPanel).toBeVisible();

    expect((await sessionApi.getAccount(source)).balance).toBe(0);
    expect((await sessionApi.getAccount(destination)).balance).toBe(600);
  });

  test('a single-cent transfer moves exactly $0.01', async ({
    testUser,
    transferPage,
    sessionApi,
  }) => {
    // Both start at the forced $100 opening deposit — no extra funding
    // needed for a transfer this small.
    const source = await openEmptyAccount(sessionApi, testUser.id, testUser.checkingAccountId);
    const destination = await openEmptyAccount(sessionApi, testUser.id, testUser.checkingAccountId);

    await transferPage.goto();
    await transferPage.transfer({
      amount: '0.01',
      fromAccountId: source,
      toAccountId: destination,
    });
    await expect(transferPage.resultPanel).toBeVisible();

    expect((await sessionApi.getAccount(source)).balance).toBeCloseTo(99.99, 2);
    expect((await sessionApi.getAccount(destination)).balance).toBeCloseTo(100.01, 2);
  });

  test('transferring to the same account leaves its balance unchanged', async ({
    testUser,
    transferPage,
    sessionApi,
  }) => {
    const account = await openFundedAccount(
      sessionApi,
      testUser.id,
      testUser.checkingAccountId,
      1000
    );

    await transferPage.goto();
    await transferPage.transfer({ amount: '500', fromAccountId: account, toAccountId: account });
    await expect(transferPage.resultPanel).toBeVisible();

    // The debit and credit legs land on the same account, so they cancel —
    // this is the one "same-account transfer" assertion the live app can
    // actually support; both legs still get recorded (see the API
    // regression spec for that).
    expect((await sessionApi.getAccount(account)).balance).toBe(1000);
  });

  test('a non-numeric amount is rejected with a generic error', async ({
    testUser,
    transferPage,
    sessionApi,
  }) => {
    const source = await openEmptyAccount(sessionApi, testUser.id, testUser.checkingAccountId);
    const destination = await openEmptyAccount(sessionApi, testUser.id, testUser.checkingAccountId);

    await transferPage.goto();
    await transferPage.transfer({ amount: 'abc', fromAccountId: source, toAccountId: destination });

    await expect(transferPage.errorPanel).toBeVisible();
  });

  test('a negative amount should be rejected', async ({ testUser, transferPage, sessionApi }) => {
    test.fail();

    const source = await openFundedAccount(
      sessionApi,
      testUser.id,
      testUser.checkingAccountId,
      1000
    );
    const destination = await openEmptyAccount(sessionApi, testUser.id, testUser.checkingAccountId);

    await transferPage.goto();
    await transferPage.transfer({ amount: '-50', fromAccountId: source, toAccountId: destination });

    expect((await sessionApi.getAccount(source)).balance).toBe(1000);
  });

  test('a zero amount should be rejected', async ({ testUser, transferPage, sessionApi }) => {
    test.fail();

    const source = await openEmptyAccount(sessionApi, testUser.id, testUser.checkingAccountId);
    const destination = await openEmptyAccount(sessionApi, testUser.id, testUser.checkingAccountId);

    await transferPage.goto();
    await transferPage.transfer({ amount: '0', fromAccountId: source, toAccountId: destination });

    await expect(transferPage.errorPanel).toBeVisible();
  });

  test('an amount exceeding the source balance should be rejected', async ({
    testUser,
    transferPage,
    sessionApi,
  }) => {
    test.fail();

    const source = await openFundedAccount(
      sessionApi,
      testUser.id,
      testUser.checkingAccountId,
      100
    );
    const destination = await openEmptyAccount(sessionApi, testUser.id, testUser.checkingAccountId);

    await transferPage.goto();
    await transferPage.transfer({
      amount: '1000000.00',
      fromAccountId: source,
      toAccountId: destination,
    });

    await expect(transferPage.errorPanel).toBeVisible();
  });
});
