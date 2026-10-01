import { env } from '@utils/env.js';

import { ParaBankApiClient } from '../../src/api/parabank-client.js';
import { buildNewCustomer } from '../../src/data/customer-builder.js';
import { expect, test } from '../../src/fixtures/pages.js';

/**
 * No "locked account" case here: ParaBank implements no account-lockout
 * feature after repeated failed logins to probe — confirmed live, see
 * "Known application limitations" in docs/architecture.md. The brief's
 * "locked/empty fields" scenario is covered by the empty-fields case below.
 */
test.describe('login @regression @ui', () => {
  test('valid credentials log the customer in', async ({ request, loginPage }) => {
    const apiClient = new ParaBankApiClient(request, env.appUrl, env.apiUrl, env.apiProxyUrl);
    const customer = buildNewCustomer();
    await apiClient.registerCustomer(customer);

    await loginPage.goto();
    await loginPage.login(customer.username, customer.password);

    await expect(loginPage.accountServicesMenu).toContainText(
      `${customer.firstName} ${customer.lastName}`
    );
  });

  test('an incorrect password is rejected', async ({ request, loginPage }) => {
    const apiClient = new ParaBankApiClient(request, env.appUrl, env.apiUrl, env.apiProxyUrl);
    const customer = buildNewCustomer();
    await apiClient.registerCustomer(customer);

    await loginPage.goto();
    await loginPage.login(customer.username, `wrong-${customer.password}`);

    await expect(loginPage.errorMessage).toHaveText(
      'The username and password could not be verified.'
    );
  });

  test('a username that has never been registered is rejected', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login('no-such-user-ever', 'whatever123');

    await expect(loginPage.errorMessage).toHaveText(
      'The username and password could not be verified.'
    );
  });

  test('empty username and password are rejected', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login('', '');

    await expect(loginPage.errorMessage).toHaveText('Please enter a username and password.');
  });
});
