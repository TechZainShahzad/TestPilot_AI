/**
 * The `ui` / `ui-guest` project fixture: injects one instance of every page
 * object, plus `sessionApi` — a {@link ParaBankApiClient} bound to
 * `page.request`, so it shares the browser's cookies. That is what lets a
 * spec assert that a REST response matches what the page just rendered,
 * using the exact session the user is in, with no separate login.
 */
import { readFileSync } from 'node:fs';

import { test as base } from '@playwright/test';

import { env } from '@utils/env.js';

import { ParaBankApiClient } from '../api/parabank-client.js';
import type { Account, Customer } from '../api/types.js';
import { AccountActivityPage } from '../pages/account-activity-page.js';
import { BillPayPage } from '../pages/bill-pay-page.js';
import { FindTransactionsPage } from '../pages/find-transactions-page.js';
import { LoginPage } from '../pages/login-page.js';
import { OpenAccountPage } from '../pages/open-account-page.js';
import { OverviewPage } from '../pages/overview-page.js';
import { RegisterPage } from '../pages/register-page.js';
import { RequestLoanPage } from '../pages/request-loan-page.js';
import { TransferPage } from '../pages/transfer-page.js';

export interface PageFixtures {
  loginPage: LoginPage;
  registerPage: RegisterPage;
  overviewPage: OverviewPage;
  openAccountPage: OpenAccountPage;
  transferPage: TransferPage;
  billPayPage: BillPayPage;
  findTransactionsPage: FindTransactionsPage;
  requestLoanPage: RequestLoanPage;
  accountActivityPage: AccountActivityPage;
  /** Authenticated API client sharing the browser's session cookies. */
  sessionApi: ParaBankApiClient;
  /** Full identity of the customer the `setup` project registered. */
  testUser: Customer & { username: string; password: string; checkingAccountId: number };
}

const CREDENTIALS_FILE = '.auth/user.credentials.json';

export const test = base.extend<PageFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  registerPage: async ({ page }, use) => {
    await use(new RegisterPage(page));
  },
  overviewPage: async ({ page }, use) => {
    await use(new OverviewPage(page));
  },
  openAccountPage: async ({ page }, use) => {
    await use(new OpenAccountPage(page));
  },
  transferPage: async ({ page }, use) => {
    await use(new TransferPage(page));
  },
  billPayPage: async ({ page }, use) => {
    await use(new BillPayPage(page));
  },
  findTransactionsPage: async ({ page }, use) => {
    await use(new FindTransactionsPage(page));
  },
  requestLoanPage: async ({ page }, use) => {
    await use(new RequestLoanPage(page));
  },
  accountActivityPage: async ({ page }, use) => {
    await use(new AccountActivityPage(page));
  },
  sessionApi: async ({ page }, use) => {
    await use(new ParaBankApiClient(page.request, env.appUrl, env.apiUrl, env.apiProxyUrl));
  },

  testUser: async ({ sessionApi }, use) => {
    const raw = readFileSync(CREDENTIALS_FILE, 'utf-8');
    const { username, password } = JSON.parse(raw) as { username: string; password: string };

    const customer = await sessionApi.getCustomerByCredentials(username, password);
    const accounts: Account[] = await sessionApi.getCustomerAccounts(customer.id);
    const checking = accounts.find((account) => account.type === 'CHECKING');
    if (!checking) {
      throw new Error(`Setup-registered customer "${username}" has no CHECKING account.`);
    }

    await use({ ...customer, username, password, checkingAccountId: checking.id });
  },
});

export { expect } from '@playwright/test';
