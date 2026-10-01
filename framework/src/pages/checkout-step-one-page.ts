import type { Locator } from '@playwright/test';

import { BasePage } from './base-page.js';

/** Checkout step one — the customer-info form. All three fields are required. */
export class CheckoutStepOnePage extends BasePage {
  override async goto(): Promise<void> {
    await super.goto('checkout-step-one.html');
  }

  get firstNameInput(): Locator {
    return this.page.locator('[data-test="firstName"]');
  }

  get lastNameInput(): Locator {
    return this.page.locator('[data-test="lastName"]');
  }

  get postalCodeInput(): Locator {
    return this.page.locator('[data-test="postalCode"]');
  }

  get continueButton(): Locator {
    return this.page.locator('[data-test="continue"]');
  }

  get cancelButton(): Locator {
    return this.page.locator('[data-test="cancel"]');
  }

  /** The "Error: <field> is required" banner, validated on the first empty field. */
  get errorMessage(): Locator {
    return this.page.locator('[data-test="error"]');
  }

  async fillInfo(info: { firstName: string; lastName: string; postalCode: string }): Promise<void> {
    await this.firstNameInput.fill(info.firstName);
    await this.lastNameInput.fill(info.lastName);
    await this.postalCodeInput.fill(info.postalCode);
  }

  async continueToOverview(): Promise<void> {
    await this.continueButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }
}
