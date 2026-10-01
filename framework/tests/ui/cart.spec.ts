import { expect, test } from '../../src/fixtures/pages.js';

test.describe('cart @regression', () => {
  test('the cart reflects the products added from the inventory page', async ({
    inventoryPage,
    cartPage,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart('Sauce Labs Backpack');
    await inventoryPage.addToCart('Sauce Labs Onesie');
    await inventoryPage.goToCart();

    await expect(cartPage.cartItems).toHaveCount(2);
    await expect(cartPage.itemNames).toHaveText(['Sauce Labs Backpack', 'Sauce Labs Onesie']);
  });

  test('removing an item from the cart updates both the list and the badge', async ({
    inventoryPage,
    cartPage,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart('Sauce Labs Backpack');
    await inventoryPage.addToCart('Sauce Labs Onesie');
    await inventoryPage.goToCart();

    await cartPage.removeItem('Sauce Labs Backpack');

    await expect(cartPage.cartItems).toHaveCount(1);
    await expect(cartPage.itemNames).toHaveText(['Sauce Labs Onesie']);
    await expect(cartPage.cartBadge).toHaveText('1');
  });

  test('continue shopping returns to the inventory page', async ({ inventoryPage, cartPage }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart('Sauce Labs Backpack');
    await inventoryPage.goToCart();

    await cartPage.continueShopping();

    await expect(inventoryPage.items).toHaveCount(6);
  });
});
