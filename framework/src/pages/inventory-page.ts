import type { Locator } from '@playwright/test';

import { BasePage } from './base-page.js';

export type SortOption =
  'Name (A to Z)' | 'Name (Z to A)' | 'Price (low to high)' | 'Price (high to low)';

/**
 * The product listing (`inventory.html`), the landing page after login.
 * Add/remove-from-cart buttons toggle in place per product — this POM
 * locates them by the product's visible name rather than by guessing the
 * `data-test="add-to-cart-<slug>"` id pattern, so callers never need to
 * know how a product name gets slugified.
 */
export class InventoryPage extends BasePage {
  override async goto(): Promise<void> {
    await super.goto('inventory.html');
  }

  get sortDropdown(): Locator {
    return this.page.locator('[data-test="product-sort-container"]');
  }

  get items(): Locator {
    return this.page.locator('.inventory_item');
  }

  get itemNames(): Locator {
    return this.page.locator('[data-test="inventory-item-name"]');
  }

  get itemPrices(): Locator {
    return this.page.locator('[data-test="inventory-item-price"]');
  }

  get itemImages(): Locator {
    return this.page.locator('.inventory_item_img img');
  }

  async sortBy(option: SortOption): Promise<void> {
    await this.sortDropdown.selectOption({ label: option });
  }

  private itemByName(productName: string): Locator {
    return this.items.filter({ has: this.page.getByText(productName, { exact: true }) });
  }

  async addToCart(productName: string): Promise<void> {
    await this.itemByName(productName).getByRole('button', { name: 'Add to cart' }).click();
  }

  async removeFromCart(productName: string): Promise<void> {
    await this.itemByName(productName).getByRole('button', { name: 'Remove' }).click();
  }

  /**
   * Navigates to a product's detail page. Each product renders this link
   * twice (wrapping its image and its name, both sharing the same
   * accessible name) — `.first()` picks either, they lead to the same page.
   */
  async viewDetails(productName: string): Promise<void> {
    await this.itemByName(productName)
      .getByRole('button', { name: `View details for ${productName}` })
      .first()
      .click();
  }
}
