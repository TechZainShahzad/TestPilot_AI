import type { Locator } from '@playwright/test';

import { BasePage } from './base-page.js';

export class CartPage extends BasePage {
  override async goto(): Promise<void> {
    await super.goto('cart.html');
  }

  get cartItems(): Locator {
    return this.page.locator('.cart_item');
  }

  get itemNames(): Locator {
    return this.page.locator('[data-test="inventory-item-name"]');
  }

  get itemPrices(): Locator {
    return this.page.locator('[data-test="inventory-item-price"]');
  }

  get checkoutButton(): Locator {
    return this.page.locator('[data-test="checkout"]');
  }

  get continueShoppingButton(): Locator {
    return this.page.locator('[data-test="continue-shopping"]');
  }

  private itemByName(productName: string): Locator {
    return this.cartItems.filter({ has: this.page.getByText(productName, { exact: true }) });
  }

  async removeItem(productName: string): Promise<void> {
    await this.itemByName(productName).getByRole('button', { name: 'Remove' }).click();
  }

  async checkout(): Promise<void> {
    await this.checkoutButton.click();
  }

  async continueShopping(): Promise<void> {
    await this.continueShoppingButton.click();
  }
}
