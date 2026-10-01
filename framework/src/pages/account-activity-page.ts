import type { Locator } from '@playwright/test';

import { parseCurrency } from '@utils/money.js';

import { BasePage } from './base-page.js';

export class AccountActivityPage extends BasePage {
  async gotoAccount(accountId: number): Promise<void> {
    await super.goto(`activity.htm?id=${String(accountId)}`);
  }

  get accountNumber(): Locator {
    return this.page.locator('#accountDetails #accountId');
  }
  get accountType(): Locator {
    return this.page.locator('#accountType');
  }
  get balanceCell(): Locator {
    return this.page.locator('#balance');
  }
  get availableBalanceCell(): Locator {
    return this.page.locator('#availableBalance');
  }

  async balance(): Promise<number> {
    return parseCurrency(await this.balanceCell.innerText());
  }

  async availableBalance(): Promise<number> {
    return parseCurrency(await this.availableBalanceCell.innerText());
  }
}
