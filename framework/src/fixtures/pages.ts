/**
 * The `ui` / `ui-guest` project fixture: injects one instance of every page
 * object. There is no `sessionApi`/`testUser` equivalent here — SauceDemo
 * has no backend API and no registration, so there is no second channel to
 * cross-check the UI against and no per-run identity to derive.
 */
import { test as base } from '@playwright/test';

import { CartPage } from '../pages/cart-page.js';
import { CheckoutCompletePage } from '../pages/checkout-complete-page.js';
import { CheckoutStepOnePage } from '../pages/checkout-step-one-page.js';
import { CheckoutStepTwoPage } from '../pages/checkout-step-two-page.js';
import { DynamicCatalogPage } from '../pages/dynamic-catalog-page.js';
import { InventoryPage } from '../pages/inventory-page.js';
import { LoginPage } from '../pages/login-page.js';
import { ProductDetailPage } from '../pages/product-detail-page.js';

export interface PageFixtures {
  loginPage: LoginPage;
  inventoryPage: InventoryPage;
  cartPage: CartPage;
  checkoutStepOnePage: CheckoutStepOnePage;
  checkoutStepTwoPage: CheckoutStepTwoPage;
  checkoutCompletePage: CheckoutCompletePage;
  productDetailPage: ProductDetailPage;
  dynamicCatalogPage: DynamicCatalogPage;
}

export const test = base.extend<PageFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  inventoryPage: async ({ page }, use) => {
    await use(new InventoryPage(page));
  },
  cartPage: async ({ page }, use) => {
    await use(new CartPage(page));
  },
  checkoutStepOnePage: async ({ page }, use) => {
    await use(new CheckoutStepOnePage(page));
  },
  checkoutStepTwoPage: async ({ page }, use) => {
    await use(new CheckoutStepTwoPage(page));
  },
  checkoutCompletePage: async ({ page }, use) => {
    await use(new CheckoutCompletePage(page));
  },
  productDetailPage: async ({ page }, use) => {
    await use(new ProductDetailPage(page));
  },
  dynamicCatalogPage: async ({ page }, use) => {
    await use(new DynamicCatalogPage(page));
  },
});

export { expect } from '@playwright/test';
