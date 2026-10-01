import { expect, test } from '../../src/fixtures/pages.js';

test.describe('product detail @regression', () => {
  test('viewing a product shows its name, description, and price', async ({
    inventoryPage,
    productDetailPage,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.viewDetails('Sauce Labs Backpack');

    await expect(productDetailPage.name).toHaveText('Sauce Labs Backpack');
    await expect(productDetailPage.price).toHaveText('$29.99');
    await expect(productDetailPage.backToProductsButton).toBeVisible();
  });

  test('adding to cart from the detail page updates the button and badge', async ({
    inventoryPage,
    productDetailPage,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.viewDetails('Sauce Labs Backpack');

    await productDetailPage.addToCart();

    await expect(productDetailPage.removeButton).toBeVisible();
    await expect(productDetailPage.cartBadge).toHaveText('1');
  });

  test('removing from the detail page reverts the button and clears the badge', async ({
    inventoryPage,
    productDetailPage,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.viewDetails('Sauce Labs Backpack');
    await productDetailPage.addToCart();

    await productDetailPage.remove();

    await expect(productDetailPage.addToCartButton).toBeVisible();
    await expect(productDetailPage.cartBadge).toHaveCount(0);
  });

  test('back to products returns to the full inventory listing', async ({
    inventoryPage,
    productDetailPage,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.viewDetails('Sauce Labs Backpack');

    await productDetailPage.backToProducts();

    await expect(inventoryPage.items).toHaveCount(6);
  });

  test('the add/remove toggle is consistent across repeated use', async ({
    inventoryPage,
    productDetailPage,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.viewDetails('Sauce Labs Backpack');

    await productDetailPage.addToCart();
    await productDetailPage.remove();
    await productDetailPage.addToCart();

    await expect(productDetailPage.removeButton).toBeVisible();
    await expect(productDetailPage.cartBadge).toHaveText('1');
  });
});
