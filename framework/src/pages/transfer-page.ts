import type { Locator } from '@playwright/test';

import { BasePage } from './base-page.js';

/**
 * Transfer Funds.
 *
 * `#transferForm`'s submit handler builds its AJAX call straight from
 * `$('#amount').val()` with no client-side validation at all — there is no
 * amount-format check, no positivity check, nothing. A non-numeric amount
 * reaches the server and comes back as a generic `#showError`; every other
 * amount (negative, zero, far beyond the account balance) returns `200` and
 * `#showResult`. See "Known application limitations" in
 * docs/architecture.md — the regression specs document this with
 * `test.fail()` rather than asserting a rejection the app cannot produce.
 */
export class TransferPage extends BasePage {
  override async goto(): Promise<void> {
    await super.goto('transfer.htm');
  }

  get amountInput(): Locator {
    return this.page.locator('#amount');
  }

  get fromAccountSelect(): Locator {
    return this.page.locator('#fromAccountId');
  }

  get toAccountSelect(): Locator {
    return this.page.locator('#toAccountId');
  }

  get transferButton(): Locator {
    return this.page.locator('input[value="Transfer"]');
  }

  get resultPanel(): Locator {
    return this.page.locator('#showResult');
  }

  get resultAmount(): Locator {
    return this.page.locator('#amountResult');
  }

  get resultFromAccount(): Locator {
    return this.page.locator('#fromAccountIdResult');
  }

  get resultToAccount(): Locator {
    return this.page.locator('#toAccountIdResult');
  }

  /** Shown only for a genuinely malformed amount (non-numeric input). */
  get errorPanel(): Locator {
    return this.page.locator('#showError');
  }

  async transfer(options: {
    amount: string;
    fromAccountId?: number;
    toAccountId?: number;
  }): Promise<void> {
    if (options.fromAccountId !== undefined) {
      await this.fromAccountSelect.selectOption(String(options.fromAccountId));
    }
    if (options.toAccountId !== undefined) {
      await this.toAccountSelect.selectOption(String(options.toAccountId));
    }
    await this.amountInput.fill(options.amount);
    await this.transferButton.click();
    await Promise.race([
      this.resultPanel.waitFor({ state: 'visible' }),
      this.errorPanel.waitFor({ state: 'visible' }),
    ]);
  }
}
