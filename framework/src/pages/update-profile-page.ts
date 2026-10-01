import type { Locator } from '@playwright/test';

import type { ProfileUpdate } from '../data/profile-update-builder.js';
import { BasePage } from './base-page.js';

/**
 * Update Contact Info.
 *
 * On load, an AJAX call pre-fills every field from the current customer
 * record — `BasePage.goto()`'s `networkidle` wait covers that race the same
 * way it does for every other account-bearing screen (see
 * docs/architecture.md).
 *
 * The update AJAX call is a genuine app quirk: `services_proxy` answers
 * `200` with a plain-text body (`"Successfully updated customer profile"`)
 * while still claiming `Content-Type: application/json` — confirmed live.
 * jQuery's `dataType: "json"` then fails to parse that body and routes even
 * a successful update through the page's own `error` callback, which
 * special-cases `status === 200` to show the success panel anyway. That
 * handling lives entirely in the app's own script; nothing in this page
 * object or its spec needs to route around it — `resultPanel` becomes
 * visible on a genuine success exactly as it would for a "normal" AJAX
 * success path.
 */
export class UpdateProfilePage extends BasePage {
  override async goto(): Promise<void> {
    await super.goto('updateprofile.htm');
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
  get updateButton(): Locator {
    return this.page.locator('input[value="Update Profile"]');
  }

  get resultPanel(): Locator {
    return this.page.locator('#updateProfileResult');
  }
  get errorPanel(): Locator {
    return this.page.locator('#updateProfileError');
  }

  get firstNameError(): Locator {
    return this.page.locator('#firstName-error');
  }
  get lastNameError(): Locator {
    return this.page.locator('#lastName-error');
  }

  async fillForm(update: ProfileUpdate): Promise<void> {
    await this.firstNameInput.fill(update.firstName);
    await this.lastNameInput.fill(update.lastName);
    await this.streetInput.fill(update.street);
    await this.cityInput.fill(update.city);
    await this.stateInput.fill(update.state);
    await this.zipCodeInput.fill(update.zipCode);
    await this.phoneNumberInput.fill(update.phoneNumber);
  }

  async submit(): Promise<void> {
    await this.updateButton.click();
  }

  async updateProfile(update: ProfileUpdate): Promise<void> {
    await this.fillForm(update);
    await this.submit();
    await this.resultPanel.waitFor({ state: 'visible' });
  }
}
