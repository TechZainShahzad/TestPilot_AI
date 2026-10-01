/**
 * Common behaviour every ParaBank screen shares: navigation under the
 * `/parabank` app root, the left-hand "Account Services" menu once logged
 * in, and the generic `<h1 class="title">Error!</h1>` panel every AJAX
 * action falls back to on an unhandled server error.
 */
import type { Locator, Page } from '@playwright/test';

import { env } from '@utils/env.js';

export abstract class BasePage {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigates to a path under the app root, e.g. `overview.htm`.
   *
   * Every account-bearing screen (overview, transfer, open account, bill
   * pay, find transactions, request loan) server-renders its shell, then
   * populates its account table or `<select>` via a `$(document).ready`
   * AJAX call to `services_proxy/bank/customers/.../accounts`. `page.goto`
   * only waits for `load`, which fires before that call resolves, so every
   * subclass would otherwise race it. Waiting for `networkidle` here once —
   * a real completion condition, not an arbitrary sleep — covers all of
   * them without each page object re-discovering the same race.
   */
  protected async goto(path: string): Promise<void> {
    await this.page.goto(`${env.appUrl}/${path}`);
    await this.page.waitForLoadState('networkidle');
  }

  get rightPanel(): Locator {
    return this.page.locator('#rightPanel');
  }

  /** The "Welcome <name>" / "Account Services" sidebar shown once logged in. */
  get accountServicesMenu(): Locator {
    return this.page.locator('#leftPanel');
  }

  async logOut(): Promise<void> {
    await this.page.getByRole('link', { name: 'Log Out' }).click();
  }

  /**
   * The generic internal-error fallback (`"An internal error has occurred
   * and has been logged."`) that every AJAX-driven screen shows on an
   * unhandled server error — e.g. a non-numeric transfer amount.
   */
  get genericErrorMessage(): Locator {
    return this.rightPanel.locator('p.error');
  }

  async isShowingGenericError(): Promise<boolean> {
    return this.genericErrorMessage.isVisible();
  }
}
