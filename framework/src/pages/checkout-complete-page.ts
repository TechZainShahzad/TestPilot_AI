import type { Locator } from '@playwright/test';

import { BasePage } from './base-page.js';

export class CheckoutCompletePage extends BasePage {
  get completeHeader(): Locator {
    return this.page.locator('[data-test="complete-header"]');
  }

  get completeText(): Locator {
    return this.page.locator('[data-test="complete-text"]');
  }

  get backHomeButton(): Locator {
    return this.page.locator('[data-test="back-to-products"]');
  }

  async backToProducts(): Promise<void> {
    await this.backHomeButton.click();
  }
}
