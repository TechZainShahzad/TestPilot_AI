import type { Locator } from '@playwright/test';

import { BasePage } from './base-page.js';

export type DynamicCatalogMode = 'Lazy Load' | 'Spinner' | 'Slider';

/**
 * The three Dynamic Catalog views reached from the burger menu
 * (`dynamic-catalog-lazy-load.html`, `-spinner.html`, `-slider.html`).
 * They do NOT use the standard `.inventory_item` markup: each product is a
 * plain card of image + name + price, with no Add-to-cart button observed.
 * Locators here are role/text based because no data-test ids were seen.
 */
export class DynamicCatalogPage extends BasePage {
  async gotoLazyLoad(): Promise<void> {
    await super.goto('dynamic-catalog-lazy-load.html');
  }

  async gotoSpinner(): Promise<void> {
    await super.goto('dynamic-catalog-spinner.html');
  }

  async gotoSlider(): Promise<void> {
    await super.goto('dynamic-catalog-slider.html');
  }

  /** Header caption, e.g. "Dynamic Catalog - Spinner". */
  heading(mode: DynamicCatalogMode): Locator {
    return this.page.getByText(`Dynamic Catalog - ${mode}`, { exact: true });
  }

  // --- burger menu (role based; works on inventory and dynamic pages) ---

  get menuOpenButton(): Locator {
    return this.page.getByRole('button', { name: 'Open Menu' });
  }

  get menuButtons(): Locator {
    return this.page.getByRole('navigation').getByRole('button');
  }

  get dynamicCatalogMenuButton(): Locator {
    return this.page.getByRole('button', { name: 'Dynamic Catalog', exact: true });
  }

  get allItemsMenuButton(): Locator {
    return this.page.getByRole('button', { name: 'All Items', exact: true });
  }

  menuOption(mode: DynamicCatalogMode): Locator {
    return this.page.getByRole('button', { name: mode, exact: true });
  }

  async openMenu(): Promise<void> {
    await this.menuOpenButton.click();
    await this.dynamicCatalogMenuButton.waitFor({ state: 'visible' });
  }

  async expandDynamicCatalog(): Promise<void> {
    await this.openMenu();
    await this.dynamicCatalogMenuButton.click();
  }

  async openMode(mode: DynamicCatalogMode): Promise<void> {
    await this.expandDynamicCatalog();
    await this.menuOption(mode).click();
  }

  async goToAllItems(): Promise<void> {
    await this.openMenu();
    await this.allItemsMenuButton.click();
  }

  // --- catalog content ---

  get loadingSpinner(): Locator {
    return this.page.getByRole('status', { name: 'Loading' });
  }

  get loadingPlaceholders(): Locator {
    return this.page.getByText('Loading…');
  }

  /**
   * Lazy Load placeholders sat unchanged for 30s without any scrolling, which
   * suggests loading is scroll-triggered (viewport-intersection based). This
   * keeps scrolling the remaining placeholders into view until none are left.
   * Throws if they never resolve, so a genuine hang still fails the test.
   */
  async scrollUntilFullyLoaded(timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while ((await this.loadingPlaceholders.count()) > 0) {
      if (Date.now() > deadline) {
        const remaining = String(await this.loadingPlaceholders.count());
        throw new Error(
          `Lazy Load still shows ${remaining} "Loading…" placeholders after ${String(timeoutMs)} ms of scrolling`
        );
      }
      await this.loadingPlaceholders
        .last()
        .scrollIntoViewIfNeeded({ timeout: 1_000 })
        .catch(() => undefined);
      await this.page.mouse.wheel(0, 1_000);
      await this.page.waitForTimeout(500);
    }
  }

  /** Product images only (excludes the burger-menu icon). */
  get productImages(): Locator {
    return this.page.getByRole('img', { name: /^(?!Open Menu$|Close Menu$).+/ });
  }

  get addToCartButtons(): Locator {
    return this.page.getByRole('button', { name: /^Add to cart/ });
  }

  get legacyInventoryItems(): Locator {
    return this.page.locator('.inventory_item');
  }

  get sortDropdown(): Locator {
    return this.page.getByRole('combobox', { name: 'Sort products' });
  }

  productName(name: string): Locator {
    return this.page.getByText(name, { exact: true });
  }

  // --- slider ---

  get sliderButtons(): Locator {
    return this.page.getByRole('button', { name: /^Show / });
  }

  sliderButton(productName: string): Locator {
    return this.page.getByRole('button', { name: `Show ${productName}`, exact: true });
  }
}
