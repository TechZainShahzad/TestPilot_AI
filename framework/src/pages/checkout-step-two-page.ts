import type { Locator } from '@playwright/test';

import { parseCurrency } from '@utils/money.js';

import { BasePage } from './base-page.js';

/**
 * Checkout step two — the order overview. Tax is a fixed 8% of the item
 * subtotal, confirmed live (`$39.98` subtotal → `$3.20` tax → `$43.18`
 * total, exactly `subtotal + tax`), not assumed from documentation.
 */
export class CheckoutStepTwoPage extends BasePage {
  get cartItems(): Locator {
    return this.page.locator('.cart_item');
  }

  get itemNames(): Locator {
    return this.page.locator('[data-test="inventory-item-name"]');
  }

  get subtotalLabel(): Locator {
    return this.page.locator('[data-test="subtotal-label"]');
  }

  get taxLabel(): Locator {
    return this.page.locator('[data-test="tax-label"]');
  }

  get totalLabel(): Locator {
    return this.page.locator('[data-test="total-label"]');
  }

  get finishButton(): Locator {
    return this.page.locator('[data-test="finish"]');
  }

  get cancelButton(): Locator {
    return this.page.locator('[data-test="cancel"]');
  }

  async getSubtotal(): Promise<number> {
    return parseCurrency(await this.subtotalLabel.textContent().then((t) => t ?? ''));
  }

  async getTax(): Promise<number> {
    return parseCurrency(await this.taxLabel.textContent().then((t) => t ?? ''));
  }

  async getTotal(): Promise<number> {
    return parseCurrency(await this.totalLabel.textContent().then((t) => t ?? ''));
  }

  async finish(): Promise<void> {
    await this.finishButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }
}
