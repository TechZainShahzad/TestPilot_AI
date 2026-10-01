import { expect, test } from '../../src/fixtures/pages.js';

/**
 * All error strings asserted here were captured live from the real app, not
 * assumed from documentation — including the exact "Epic sadface: ..."
 * wording, which SauceDemo does not publish anywhere.
 */
test.describe('login @regression', () => {
  test('valid credentials log the demo account in', async ({ loginPage, inventoryPage }) => {
    await loginPage.goto();
    await loginPage.login('standard_user', 'secret_sauce');

    await expect(inventoryPage.items).toHaveCount(6);
  });

  test('a locked-out account is rejected', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login('locked_out_user', 'secret_sauce');

    await expect(loginPage.errorMessage).toHaveText(
      'Epic sadface: Sorry, this user has been locked out.'
    );
  });

  test('an incorrect password is rejected', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login('standard_user', 'wrong-password');

    await expect(loginPage.errorMessage).toHaveText(
      'Epic sadface: Username and password do not match any user in this service'
    );
  });

  test('an empty username is rejected', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login('', 'secret_sauce');

    await expect(loginPage.errorMessage).toHaveText('Epic sadface: Username is required');
  });

  test('an empty password is rejected', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login('standard_user', '');

    await expect(loginPage.errorMessage).toHaveText('Epic sadface: Password is required');
  });
});
