import { env } from '@utils/env.js';

import { ParaBankApiClient } from '../../src/api/parabank-client.js';
import { buildNewCustomer } from '../../src/data/customer-builder.js';
import { expect, test } from '../../src/fixtures/pages.js';

test.describe('registration @regression @ui', () => {
  test('valid details register a new customer and log them in', async ({ registerPage }) => {
    const customer = buildNewCustomer();

    await registerPage.goto();
    await registerPage.register(customer);

    await expect(registerPage.successHeading).toBeVisible();
    await expect(registerPage.accountServicesMenu).toContainText(
      `${customer.firstName} ${customer.lastName}`
    );
  });

  test('a duplicate username is rejected with an inline error', async ({
    request,
    registerPage,
  }) => {
    // Pre-register one customer over plain HTTP so there is a username
    // guaranteed to already exist, independent of any other project's state.
    const apiClient = new ParaBankApiClient(request, env.appUrl, env.apiUrl, env.apiProxyUrl);
    const existing = buildNewCustomer();
    await apiClient.registerCustomer(existing);

    const duplicate = buildNewCustomer({ username: existing.username });
    await registerPage.goto();
    await registerPage.register(duplicate);

    await expect(registerPage.fieldError('username')).toHaveText('This username already exists.');
    await expect(registerPage.successHeading).toBeHidden();
  });

  test('a mismatched confirmation password is rejected', async ({ registerPage }) => {
    const customer = buildNewCustomer();

    await registerPage.goto();
    await registerPage.fillForm(customer);
    await registerPage.repeatedPasswordInput.fill(`not-${customer.password}`);
    await registerPage.submit();

    await expect(registerPage.fieldError('repeatedPassword')).toHaveText(
      'Passwords did not match.'
    );
  });

  test('empty required fields are each rejected individually', async ({ registerPage }) => {
    await registerPage.goto();
    await registerPage.submit();

    await expect(registerPage.fieldError('firstName')).toHaveText('First name is required.');
    await expect(registerPage.fieldError('lastName')).toHaveText('Last name is required.');
    await expect(registerPage.fieldError('address.street')).toHaveText('Address is required.');
    await expect(registerPage.fieldError('address.city')).toHaveText('City is required.');
    await expect(registerPage.fieldError('address.state')).toHaveText('State is required.');
    await expect(registerPage.fieldError('address.zipCode')).toHaveText('Zip Code is required.');
    await expect(registerPage.fieldError('ssn')).toHaveText('Social Security Number is required.');
    await expect(registerPage.fieldError('username')).toHaveText('Username is required.');
    await expect(registerPage.fieldError('password')).toHaveText('Password is required.');
    await expect(registerPage.fieldError('repeatedPassword')).toHaveText(
      'Password confirmation is required.'
    );
  });
});
