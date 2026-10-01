import type { Locator } from '@playwright/test';

import type { Payee } from '../api/types.js';
import { BasePage } from './base-page.js';

export class BillPayPage extends BasePage {
  override async goto(): Promise<void> {
    await super.goto('billpay.htm');
  }

  get payeeNameInput(): Locator {
    return this.page.locator('input[name="payee.name"]');
  }
  get streetInput(): Locator {
    return this.page.locator('input[name="payee.address.street"]');
  }
  get cityInput(): Locator {
    return this.page.locator('input[name="payee.address.city"]');
  }
  get stateInput(): Locator {
    return this.page.locator('input[name="payee.address.state"]');
  }
  get zipCodeInput(): Locator {
    return this.page.locator('input[name="payee.address.zipCode"]');
  }
  get phoneNumberInput(): Locator {
    return this.page.locator('input[name="payee.phoneNumber"]');
  }
  get accountNumberInput(): Locator {
    return this.page.locator('input[name="payee.accountNumber"]');
  }
  get verifyAccountInput(): Locator {
    return this.page.locator('input[name="verifyAccount"]');
  }
  get amountInput(): Locator {
    return this.page.locator('input[name="amount"]');
  }
  get fromAccountSelect(): Locator {
    return this.page.locator('select[name="fromAccountId"]');
  }
  get sendPaymentButton(): Locator {
    return this.page.locator('input[value="Send Payment"]');
  }

  get resultPanel(): Locator {
    return this.page.locator('#billpayResult');
  }
  get errorPanel(): Locator {
    return this.page.locator('#billpayError');
  }

  /** `#payeeName`, `#amount`, `#fromAccountId` scoped to the result panel so
   * they never collide with the identically-named form inputs. */
  get resultPayeeName(): Locator {
    return this.resultPanel.locator('#payeeName');
  }
  get resultAmount(): Locator {
    return this.resultPanel.locator('#amount');
  }
  get resultFromAccount(): Locator {
    return this.resultPanel.locator('#fromAccountId');
  }

  /**
   * Validation runs client-side (jQuery, no network call) before the AJAX
   * submit fires; each field has its own `<span>`, keyed by name below.
   */
  fieldError(field: 'name' | 'address' | 'city' | 'state' | 'zipCode' | 'phoneNumber'): Locator {
    return this.page.locator(`#validationModel-${field}`);
  }

  get accountNumberEmptyError(): Locator {
    return this.page.locator('#validationModel-account-empty');
  }
  get accountNumberInvalidError(): Locator {
    return this.page.locator('#validationModel-account-invalid');
  }
  get verifyAccountEmptyError(): Locator {
    return this.page.locator('#validationModel-verifyAccount-empty');
  }
  get verifyAccountInvalidError(): Locator {
    return this.page.locator('#validationModel-verifyAccount-invalid');
  }
  get verifyAccountMismatchError(): Locator {
    return this.page.locator('#validationModel-verifyAccount-mismatch');
  }
  get amountEmptyError(): Locator {
    return this.page.locator('#validationModel-amount-empty');
  }
  get amountInvalidError(): Locator {
    return this.page.locator('#validationModel-amount-invalid');
  }

  async fill(payee: Payee, amount: string): Promise<void> {
    await this.payeeNameInput.fill(payee.name);
    await this.streetInput.fill(payee.address.street);
    await this.cityInput.fill(payee.address.city);
    await this.stateInput.fill(payee.address.state);
    await this.zipCodeInput.fill(payee.address.zipCode);
    await this.phoneNumberInput.fill(payee.phoneNumber);
    await this.accountNumberInput.fill(payee.accountNumber);
    await this.verifyAccountInput.fill(payee.accountNumber);
    await this.amountInput.fill(amount);
  }

  async submit(): Promise<void> {
    await this.sendPaymentButton.click();
  }

  async payBill(payee: Payee, amount: string): Promise<void> {
    await this.fill(payee, amount);
    await this.submit();
    await this.resultPanel.waitFor({ state: 'visible' });
  }
}
