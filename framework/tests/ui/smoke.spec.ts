import { expect, test } from '../../src/fixtures/pages.js';

/**
 * Environment health check. SauceDemo has no separate API tier to ping, so
 * this is the UI equivalent: the fastest possible proof the app is up, the
 * configured demo account can authenticate, and the landing page renders
 * real product data — before the rest of the suite spends time on anything
 * more specific.
 */
test.describe('inventory landing page @smoke', () => {
  test('the authenticated session lands on a populated product listing', async ({
    inventoryPage,
  }) => {
    await inventoryPage.goto();

    await expect(inventoryPage.items).toHaveCount(6);
    await expect(inventoryPage.itemPrices.first()).toHaveText(/^\$\d+\.\d{2}$/);
  });
});
