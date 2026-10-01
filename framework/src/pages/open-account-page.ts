import type { Locator } from '@playwright/test';

import type { AccountType } from '../api/types.js';
import { BasePage } from './base-page.js';

export class OpenAccountPage extends BasePage {
  override async goto(): Promise<void> {
    await super.goto('openaccount.htm');
  }

  get accountTypeSelect(): Locator {
    return this.page.locator('#type');
  }

  get fromAccountSelect(): Locator {
    return this.page.locator('#fromAccountId');
  }

  get openAccountButton(): Locator {
    return this.page.locator('input[value="Open New Account"]');
  }

  get resultHeading(): Locator {
    return this.rightPanel.getByText('Account Opened!');
  }

  /** The newly opened account's number, also a link to its activity page. */
  get newAccountLink(): Locator {
    return this.page.locator('#newAccountId');
  }

  async openAccount(type: AccountType, fromAccountId?: number): Promise<number> {
    await this.accountTypeSelect.selectOption(type);
    if (fromAccountId !== undefined) {
      await this.fromAccountSelect.selectOption(String(fromAccountId));
    }
    await this.openAccountButton.click();
    await this.resultHeading.waitFor();
    return Number((await this.newAccountLink.innerText()).trim());
  }
}
