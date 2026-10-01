import type { Locator } from '@playwright/test';

import type { NewCustomer } from '../api/types.js';
import { BasePage } from './base-page.js';

/** Field keys that map 1:1 onto `register.htm`'s `customer.<field>.errors` ids. */
type CustomerField =
  | 'firstName'
  | 'lastName'
  | 'address.street'
  | 'address.city'
  | 'address.state'
  | 'address.zipCode'
  | 'ssn'
  | 'username'
  | 'password';

export class RegisterPage extends BasePage {
  override async goto(): Promise<void> {
    await super.goto('register.htm');
  }

  get firstNameInput(): Locator {
    return this.page.locator('#customer\\.firstName');
  }
  get lastNameInput(): Locator {
    return this.page.locator('#customer\\.lastName');
  }
  get streetInput(): Locator {
    return this.page.locator('#customer\\.address\\.street');
  }
  get cityInput(): Locator {
    return this.page.locator('#customer\\.address\\.city');
  }
  get stateInput(): Locator {
    return this.page.locator('#customer\\.address\\.state');
  }
  get zipCodeInput(): Locator {
    return this.page.locator('#customer\\.address\\.zipCode');
  }
  get phoneNumberInput(): Locator {
    return this.page.locator('#customer\\.phoneNumber');
  }
  get ssnInput(): Locator {
    return this.page.locator('#customer\\.ssn');
  }
  get usernameInput(): Locator {
    return this.page.locator('#customer\\.username');
  }
  get passwordInput(): Locator {
    return this.page.locator('#customer\\.password');
  }
  get repeatedPasswordInput(): Locator {
    return this.page.locator('#repeatedPassword');
  }

  /**
   * Registration shares this page with the login box in the sidebar, which
   * has its own `input[value="Log In"]` submit — matching by value avoids
   * accidentally submitting the wrong form.
   */
  get registerButton(): Locator {
    return this.page.locator('input[value="Register"]');
  }

  get successHeading(): Locator {
    return this.rightPanel.getByText('Your account was created successfully');
  }

  /** The `<span id="customer.<field>.errors">` next to one form field. */
  fieldError(field: CustomerField | 'repeatedPassword'): Locator {
    const id =
      field === 'repeatedPassword' ? 'repeatedPassword.errors' : `customer.${field}.errors`;
    return this.page.locator(`#${cssEscape(id)}`);
  }

  async fillForm(customer: NewCustomer): Promise<void> {
    await this.firstNameInput.fill(customer.firstName);
    await this.lastNameInput.fill(customer.lastName);
    await this.streetInput.fill(customer.address.street);
    await this.cityInput.fill(customer.address.city);
    await this.stateInput.fill(customer.address.state);
    await this.zipCodeInput.fill(customer.address.zipCode);
    await this.phoneNumberInput.fill(customer.phoneNumber);
    await this.ssnInput.fill(customer.ssn);
    await this.usernameInput.fill(customer.username);
    await this.passwordInput.fill(customer.password);
    await this.repeatedPasswordInput.fill(customer.password);
  }

  async submit(): Promise<void> {
    await Promise.all([this.page.waitForLoadState('networkidle'), this.registerButton.click()]);
  }

  async register(customer: NewCustomer): Promise<void> {
    await this.fillForm(customer);
    await this.submit();
  }
}

function cssEscape(id: string): string {
  return id.replace(/\./g, '\\.');
}
