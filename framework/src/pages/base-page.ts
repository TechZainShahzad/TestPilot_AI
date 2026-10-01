/**
 * Common behaviour every SauceDemo screen shares: navigation relative to
 * the app root, and the burger-menu sidebar (Logout / Reset App State)
 * that only renders once a session is authenticated.
 */
import type { Locator, Page } from '@playwright/test';

import { env } from '@utils/env.js';

export abstract class BasePage {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Navigates to a path under the app root, e.g. `inventory.html`. */
  protected async goto(path: string): Promise<void> {
    await this.page.goto(`${env.appUrl}/${path}`);
  }

  get burgerMenuButton(): Locator {
    return this.page.locator('#react-burger-menu-btn');
  }

  get closeMenuButton(): Locator {
    return this.page.locator('#react-burger-cross-btn');
  }

  get logoutLink(): Locator {
    return this.page.locator('[data-test="logout-sidebar-link"]');
  }

  get resetAppStateLink(): Locator {
    return this.page.locator('[data-test="reset-sidebar-link"]');
  }

  get cartLink(): Locator {
    return this.page.locator('.shopping_cart_link');
  }

  /** Absent entirely when the cart is empty — callers should check count/visibility first. */
  get cartBadge(): Locator {
    return this.page.locator('.shopping_cart_badge');
  }

  async openBurgerMenu(): Promise<void> {
    await this.burgerMenuButton.click();
    await this.logoutLink.waitFor({ state: 'visible' });
  }

  async logOut(): Promise<void> {
    await this.openBurgerMenu();
    await this.logoutLink.click();
  }

  async resetAppState(): Promise<void> {
    await this.openBurgerMenu();
    await this.resetAppStateLink.click();
    await this.closeMenuButton.click();
  }

  async goToCart(): Promise<void> {
    await this.cartLink.click();
  }
}
