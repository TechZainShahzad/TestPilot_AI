import { buildCheckoutInfo } from '@data/checkout-info-builder.js';

import { expect, test } from '../../src/fixtures/pages.js';

/**
 * Tax is a fixed 8% of the item subtotal and `total === subtotal + tax` to
 * the cent — confirmed live ($39.98 subtotal → $3.20 tax → $43.18 total),
 * not assumed from documentation. The math assertion below recomputes this
 * from whatever the real subtotal is for the cart under test, rather than
 * hard-coding the figures from that one observation.
 */
test.describe('checkout @regression', () => {
  test('the happy path completes an order', async ({
    inventoryPage,
    cartPage,
    checkoutStepOnePage,
    checkoutStepTwoPage,
    checkoutCompletePage,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart('Sauce Labs Backpack');
    await inventoryPage.goToCart();
    await cartPage.checkout();

    await checkoutStepOnePage.fillInfo(buildCheckoutInfo());
    await checkoutStepOnePage.continueToOverview();
    await checkoutStepTwoPage.finish();

    await expect(checkoutCompletePage.completeHeader).toHaveText('Thank you for your order!');
  });

  test('tax is 8% of the subtotal and the total is their sum', async ({
    inventoryPage,
    cartPage,
    checkoutStepOnePage,
    checkoutStepTwoPage,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart('Sauce Labs Backpack');
    await inventoryPage.addToCart('Sauce Labs Onesie');
    await inventoryPage.goToCart();
    await cartPage.checkout();
    await checkoutStepOnePage.fillInfo(buildCheckoutInfo());
    await checkoutStepOnePage.continueToOverview();

    const subtotal = await checkoutStepTwoPage.getSubtotal();
    const tax = await checkoutStepTwoPage.getTax();
    const total = await checkoutStepTwoPage.getTotal();

    expect(tax).toBeCloseTo(subtotal * 0.08, 2);
    expect(total).toBeCloseTo(subtotal + tax, 2);
  });

  test('an empty first name is rejected', async ({
    inventoryPage,
    cartPage,
    checkoutStepOnePage,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart('Sauce Labs Backpack');
    await inventoryPage.goToCart();
    await cartPage.checkout();

    await checkoutStepOnePage.fillInfo({ ...buildCheckoutInfo(), firstName: '' });
    await checkoutStepOnePage.continueToOverview();

    await expect(checkoutStepOnePage.errorMessage).toHaveText('Error: First Name is required');
  });

  test('an empty last name is rejected', async ({
    inventoryPage,
    cartPage,
    checkoutStepOnePage,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart('Sauce Labs Backpack');
    await inventoryPage.goToCart();
    await cartPage.checkout();

    await checkoutStepOnePage.fillInfo({ ...buildCheckoutInfo(), lastName: '' });
    await checkoutStepOnePage.continueToOverview();

    await expect(checkoutStepOnePage.errorMessage).toHaveText('Error: Last Name is required');
  });

  test('an empty postal code is rejected', async ({
    inventoryPage,
    cartPage,
    checkoutStepOnePage,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart('Sauce Labs Backpack');
    await inventoryPage.goToCart();
    await cartPage.checkout();

    await checkoutStepOnePage.fillInfo({ ...buildCheckoutInfo(), postalCode: '' });
    await checkoutStepOnePage.continueToOverview();

    await expect(checkoutStepOnePage.errorMessage).toHaveText('Error: Postal Code is required');
  });

  test('cancel on step one returns to the cart', async ({
    inventoryPage,
    cartPage,
    checkoutStepOnePage,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart('Sauce Labs Backpack');
    await inventoryPage.goToCart();
    await cartPage.checkout();

    await checkoutStepOnePage.cancel();

    await expect(cartPage.cartItems).toHaveCount(1);
  });

  test('cancel on step two returns to the inventory', async ({
    inventoryPage,
    cartPage,
    checkoutStepOnePage,
    checkoutStepTwoPage,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart('Sauce Labs Backpack');
    await inventoryPage.goToCart();
    await cartPage.checkout();
    await checkoutStepOnePage.fillInfo(buildCheckoutInfo());
    await checkoutStepOnePage.continueToOverview();

    await checkoutStepTwoPage.cancel();

    await expect(inventoryPage.items).toHaveCount(6);
  });
});
