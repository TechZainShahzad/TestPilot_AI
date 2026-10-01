import type { Locator } from '@playwright/test';

import { BasePage } from './base-page.js';

/**
 * A single product's detail screen, reached from the inventory grid via
 * `viewDetails()` (`inventory-item.html?id=<n>`). Reuses the grid's
 * `data-test="inventory-item-name"`/`"inventory-item-price"` attributes,
 * but its Add to cart/Remove button always uses the generic
 * `data-test="add-to-cart"`/`"remove"` rather than a product-specific id —
 * confirmed live — since only one product is ever in view here.
 */
export class ProductDetailPage extends BasePage {
  get name(): Locator {
    return this.page.locator('[data-test="inventory-item-name"]');
  }

  get description(): Locator {
    return this.page.locator('[data-test="inventory-item-desc"]');
  }

  get price(): Locator {
    return this.page.locator('[data-test="inventory-item-price"]');
  }

  get addToCartButton(): Locator {
    return this.page.locator('[data-test="add-to-cart"]');
  }

  get removeButton(): Locator {
    return this.page.locator('[data-test="remove"]');
  }

  get backToProductsButton(): Locator {
    return this.page.locator('[data-test="back-to-products"]');
  }

  async addToCart(): Promise<void> {
    await this.addToCartButton.click();
  }

  async remove(): Promise<void> {
    await this.removeButton.click();
  }

  async backToProducts(): Promise<void> {
    await this.backToProductsButton.click();
  }
}
