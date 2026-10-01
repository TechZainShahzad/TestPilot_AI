import type { Locator } from '@playwright/test';

import { BasePage } from './base-page.js';

export class FindTransactionsPage extends BasePage {
  override async goto(): Promise<void> {
    await super.goto('findtrans.htm');
  }

  get accountSelect(): Locator {
    return this.page.locator('#accountId');
  }

  get transactionIdInput(): Locator {
    return this.page.locator('#transactionId');
  }
  get findByIdButton(): Locator {
    return this.page.locator('#findById');
  }
  get transactionIdError(): Locator {
    return this.page.locator('#transactionIdError');
  }

  /** `MM-DD-YYYY` — the UI rejects any other format client-side. */
  get dateInput(): Locator {
    return this.page.locator('#transactionDate');
  }
  get findByDateButton(): Locator {
    return this.page.locator('#findByDate');
  }
  get dateError(): Locator {
    return this.page.locator('#transactionDateError');
  }

  get fromDateInput(): Locator {
    return this.page.locator('#fromDate');
  }
  get toDateInput(): Locator {
    return this.page.locator('#toDate');
  }
  get findByDateRangeButton(): Locator {
    return this.page.locator('#findByDateRange');
  }
  get dateRangeError(): Locator {
    return this.page.locator('#dateRangeError');
  }

  get amountInput(): Locator {
    return this.page.locator('#amount');
  }
  get findByAmountButton(): Locator {
    return this.page.locator('#findByAmount');
  }
  get amountError(): Locator {
    return this.page.locator('#amountError');
  }

  get resultTable(): Locator {
    return this.page.locator('#transactionTable');
  }
  get resultRows(): Locator {
    return this.page.locator('#transactionBody tr');
  }
  get errorContainer(): Locator {
    return this.page.locator('#errorContainer');
  }

  async findById(transactionId: number): Promise<void> {
    await this.transactionIdInput.fill(String(transactionId));
    await this.findByIdButton.click();
    await this.resultTable.waitFor({ state: 'visible' });
  }

  /** `date` must already be `MM-DD-YYYY`; see {@link toParaBankDate}. */
  async findByDate(date: string): Promise<void> {
    await this.dateInput.fill(date);
    await this.findByDateButton.click();
    await this.resultTable.waitFor({ state: 'visible' });
  }

  async findByDateRange(from: string, to: string): Promise<void> {
    await this.fromDateInput.fill(from);
    await this.toDateInput.fill(to);
    await this.findByDateRangeButton.click();
    await this.resultTable.waitFor({ state: 'visible' });
  }

  async findByAmount(amount: string): Promise<void> {
    await this.amountInput.fill(amount);
    await this.findByAmountButton.click();
    await this.resultTable.waitFor({ state: 'visible' });
  }
}
