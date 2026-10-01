import { env } from '@utils/env.js';

import { expect, test } from '../../src/fixtures/pages.js';

test.describe('burger menu @regression', () => {
  test('logout clears the session and returns to the login page', async ({
    inventoryPage,
    loginPage,
    page,
  }) => {
    await inventoryPage.goto();

    await inventoryPage.logOut();

    await expect(loginPage.loginButton).toBeVisible();
    expect(page.url()).toBe(`${env.baseUrl}/`);
  });

  test('reset app state clears the cart', async ({ inventoryPage }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart('Sauce Labs Backpack');
    await expect(inventoryPage.cartBadge).toHaveText('1');

    await inventoryPage.resetAppState();

    await expect(inventoryPage.cartBadge).toHaveCount(0);
  });
});
