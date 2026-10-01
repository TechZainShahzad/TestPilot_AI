import type { Locator } from '@playwright/test';

import { BasePage } from './base-page.js';

/**
 * The login screen, which is SauceDemo's root path — there is no
 * registration flow; every identity is one of the app's fixed demo
 * accounts (`standard_user`, `locked_out_user`, `problem_user`, etc.),
 * all sharing the password `secret_sauce`.
 */
export class LoginPage extends BasePage {
  override async goto(): Promise<void> {
    await super.goto('');
  }

  get usernameInput(): Locator {
    return this.page.locator('[data-test="username"]');
  }

  get passwordInput(): Locator {
    return this.page.locator('[data-test="password"]');
  }

  get loginButton(): Locator {
    return this.page.locator('[data-test="login-button"]');
  }

  /** The "Epic sadface: ..." banner shown on a failed login attempt. */
  get errorMessage(): Locator {
    return this.page.locator('[data-test="error"]');
  }

  async login(username: string, password: string): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}
