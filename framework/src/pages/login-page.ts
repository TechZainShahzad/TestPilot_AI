import type { Locator } from '@playwright/test';

import { BasePage } from './base-page.js';

/**
 * The login box. It appears embedded in the sidebar of every unauthenticated
 * page, not just `index.htm`, but this POM always starts from `index.htm` so
 * every test begins from a known, stable URL.
 */
export class LoginPage extends BasePage {
  override async goto(): Promise<void> {
    await super.goto('index.htm');
  }

  get usernameInput(): Locator {
    return this.page.locator('input[name="username"]');
  }

  get passwordInput(): Locator {
    return this.page.locator('input[name="password"]');
  }

  get loginButton(): Locator {
    return this.page.locator('input[value="Log In"]');
  }

  get registerLink(): Locator {
    return this.page.getByRole('link', { name: 'Register' });
  }

  /**
   * The page-level banner on `login.htm` — "The username and password could
   * not be verified." or "Please enter a username and password." Shares
   * markup with {@link BasePage.genericErrorMessage}; aliased here for
   * readability at call sites.
   */
  get errorMessage(): Locator {
    return this.genericErrorMessage;
  }

  async login(username: string, password: string): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await Promise.all([this.page.waitForLoadState('networkidle'), this.loginButton.click()]);
  }
}
