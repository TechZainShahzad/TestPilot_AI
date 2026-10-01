import type { Locator } from '@playwright/test';

import { BasePage } from './base-page.js';

/**
 * Request Loan.
 *
 * The UI has a full denied-state rendering path (`#loanRequestDenied`, four
 * distinct insufficient-funds messages keyed off `response.message`), but
 * this demo deployment's `requestLoan` endpoint approves unconditionally —
 * verified by requesting a six-figure amount with zero down payment from a
 * freshly opened, zero-balance account. See "Known application limitations"
 * in docs/architecture.md. The locators for the denied path are kept below
 * because the POM should describe the screen, not just the paths this
 * environment happens to reach; the regression spec that exercises denial
 * uses `test.fail()`.
 */
export class RequestLoanPage extends BasePage {
  override async goto(): Promise<void> {
    await super.goto('requestloan.htm');
  }

  get amountInput(): Locator {
    return this.page.locator('#amount');
  }
  get downPaymentInput(): Locator {
    return this.page.locator('#downPayment');
  }
  get fromAccountSelect(): Locator {
    return this.page.locator('#fromAccountId');
  }
  get applyButton(): Locator {
    return this.page.locator('input[value="Apply Now"]');
  }

  get resultPanel(): Locator {
    return this.page.locator('#requestLoanResult');
  }
  get providerName(): Locator {
    return this.page.locator('#loanProviderName');
  }
  get status(): Locator {
    return this.page.locator('#loanStatus');
  }

  get approvedPanel(): Locator {
    return this.page.locator('#loanRequestApproved');
  }
  get newAccountLink(): Locator {
    return this.page.locator('#newAccountId');
  }

  get deniedPanel(): Locator {
    return this.page.locator('#loanRequestDenied');
  }
  get deniedMessage(): Locator {
    return this.deniedPanel.locator('p.error');
  }

  get errorPanel(): Locator {
    return this.page.locator('#requestLoanError');
  }

  async apply(options: {
    amount: string;
    downPayment: string;
    fromAccountId?: number;
  }): Promise<void> {
    await this.amountInput.fill(options.amount);
    await this.downPaymentInput.fill(options.downPayment);
    if (options.fromAccountId !== undefined) {
      await this.fromAccountSelect.selectOption(String(options.fromAccountId));
    }
    await this.applyButton.click();
    await this.resultPanel.waitFor({ state: 'visible' });
  }
}
