import type { Locator } from '@playwright/test';

import { parseCurrency } from '@utils/money.js';

import { BasePage } from './base-page.js';

export class OverviewPage extends BasePage {
  /**
   * The account table renders server-side but its rows populate via an
   * async request that completes after `load` fires, so `goto()` waits for
   * the first real row rather than returning as soon as the shell appears —
   * otherwise `accountIds()`/`balanceFor()` would race it and read an empty
   * table.
   */
  override async goto(): Promise<void> {
    await super.goto('overview.htm');
    await this.accountRows.first().waitFor();
  }

  get accountTable(): Locator {
    return this.page.locator('#accountTable');
  }

  /** Real account rows only — excludes the trailing "Total" summary row. */
  get accountRows(): Locator {
    return this.accountTable.locator('tbody tr').filter({ has: this.page.locator('a') });
  }

  accountLink(accountId: number): Locator {
    return this.accountTable.locator('a', { hasText: String(accountId) });
  }

  async accountIds(): Promise<number[]> {
    const texts = await this.accountRows.locator('a').allInnerTexts();
    return texts.map((text) => Number(text.trim()));
  }

  /** Parses the rendered `"$1,234.56"` balance cell for one account row. */
  async balanceFor(accountId: number): Promise<number> {
    const row = this.accountRows.filter({
      has: this.page.locator('a', { hasText: String(accountId) }),
    });
    const text = await row.locator('td').nth(1).innerText();
    return parseCurrency(text);
  }

  async goToActivity(accountId: number): Promise<void> {
    await this.accountLink(accountId).click();
  }
}
