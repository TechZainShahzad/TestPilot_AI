import { expect, test } from '../../src/fixtures/pages.js';

test.describe('inventory @regression', () => {
  test('sorting by name A to Z orders the listing alphabetically', async ({ inventoryPage }) => {
    await inventoryPage.goto();
    const defaultNames = await inventoryPage.itemNames.allTextContents();
    const expected = [...defaultNames].sort((a, b) => a.localeCompare(b));

    await inventoryPage.sortBy('Name (A to Z)');

    await expect(inventoryPage.itemNames).toHaveText(expected);
  });

  test('sorting by name Z to A reverses the alphabetical order', async ({ inventoryPage }) => {
    await inventoryPage.goto();
    const defaultNames = await inventoryPage.itemNames.allTextContents();
    const expected = [...defaultNames].sort((a, b) => b.localeCompare(a));

    await inventoryPage.sortBy('Name (Z to A)');

    await expect(inventoryPage.itemNames).toHaveText(expected);
  });

  test('sorting by price low to high orders ascending', async ({ inventoryPage }) => {
    await inventoryPage.goto();
    const defaultPrices = await inventoryPage.itemPrices.allTextContents();
    const expected = [...defaultPrices].sort(
      (a, b) => Number.parseFloat(a.replace('$', '')) - Number.parseFloat(b.replace('$', ''))
    );

    await inventoryPage.sortBy('Price (low to high)');

    await expect(inventoryPage.itemPrices).toHaveText(expected);
  });

  test('sorting by price high to low orders descending', async ({ inventoryPage }) => {
    await inventoryPage.goto();
    const defaultPrices = await inventoryPage.itemPrices.allTextContents();
    const expected = [...defaultPrices].sort(
      (a, b) => Number.parseFloat(b.replace('$', '')) - Number.parseFloat(a.replace('$', ''))
    );

    await inventoryPage.sortBy('Price (high to low)');

    await expect(inventoryPage.itemPrices).toHaveText(expected);
  });

  test('adding a product to the cart updates the cart badge', async ({ inventoryPage }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart('Sauce Labs Backpack');

    await expect(inventoryPage.cartBadge).toHaveText('1');
  });

  test('adding multiple products accumulates the cart badge count', async ({ inventoryPage }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart('Sauce Labs Backpack');
    await inventoryPage.addToCart('Sauce Labs Bike Light');
    await inventoryPage.addToCart('Sauce Labs Bolt T-Shirt');

    await expect(inventoryPage.cartBadge).toHaveText('3');
  });

  test('removing a product from the inventory page decrements the cart badge', async ({
    inventoryPage,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart('Sauce Labs Backpack');
    await inventoryPage.addToCart('Sauce Labs Bike Light');
    await inventoryPage.removeFromCart('Sauce Labs Backpack');

    await expect(inventoryPage.cartBadge).toHaveText('1');
  });
});
