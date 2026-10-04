import type { Locator } from '@playwright/test';

import { BasePage } from './base-page.js';

export type DynamicCatalogView = 'Lazy Load' | 'Spinner' | 'Slider';

const VIEW_PATHS: Record<DynamicCatalogView, string> = {
  'Lazy Load': 'dynamic-catalog-lazy-load.html',
  Spinner: 'dynamic-catalog-spinner.html',
  Slider: 'dynamic-catalog-slider.html',
};

/**
 * The three Dynamic Catalog views (lazy load, spinner, slider) and the
 * burger-menu submenu that leads to them. The views share no markup with
 * the standard inventory grid (no `.inventory_item`).
 */
export class DynamicCatalogPage extends BasePage {
  async gotoView(view: DynamicCatalogView = 'Lazy Load'): Promise<void> {
    await this.goto(VIEW_PATHS[view]);
  }

  // ---- burger menu ----
  get dynamicCatalogButton(): Locator {
    return this.page.getByRole('button', { name: 'Dynamic Catalog', exact: true });
  }

  get allItemsButton(): Locator {
    return this.page.getByRole('button', { name: 'All Items', exact: true });
  }

  submenuItem(view: DynamicCatalogView): Locator {
    return this.page.getByRole('button', { name: view, exact: true });
  }

  /** Every submenu entry, in the order the menu declares them. */
  get submenuItems(): Locator {
    return this.page.getByRole('button', { name: /^(Lazy Load|Spinner|Slider)$/ });
  }

  /** Submenu entries that are currently visible. */
  get visibleSubmenuItems(): Locator {
    return this.submenuItems.locator('visible=true');
  }

  async expandDynamicCatalog(): Promise<void> {
    await this.burgerMenuButton.click();
    await this.dynamicCatalogButton.click();
  }

  async toggleDynamicCatalog(): Promise<void> {
    await this.dynamicCatalogButton.click();
  }

  async openView(view: DynamicCatalogView): Promise<void> {
    await this.expandDynamicCatalog();
    await this.submenuItem(view).click();
  }

  async goToAllItems(): Promise<void> {
    await this.burgerMenuButton.click();
    await this.allItemsButton.click();
  }

  // ---- shared ----
  get inventoryItems(): Locator {
    return this.page.locator('.inventory_item');
  }

  get addToCartButtons(): Locator {
    return this.page.getByRole('button', { name: 'Add to cart' });
  }

  get removeButtons(): Locator {
    return this.page.getByRole('button', { name: 'Remove' });
  }

  /** Product images only (alt text is the product name), excluding page chrome images. */
  get productImages(): Locator {
    return this.page.getByRole('img', { name: /Sauce Labs|Test\.allTheThings/ });
  }

  get errorText(): Locator {
    return this.page.getByText(/error|failed|something went wrong/i);
  }

  priceText(price: string): Locator {
    return this.page.getByText(price, { exact: true });
  }

  // ---- lazy load ----
  get loadingPlaceholders(): Locator {
    return this.page.getByText('Loading…');
  }

  async scrollToBottom(): Promise<void> {
    await this.page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
  }

  // ---- spinner ----
  get spinner(): Locator {
    return this.page.getByRole('status', { name: 'Loading' });
  }

  // ---- slider ----
  get showButtons(): Locator {
    return this.page.getByRole('button', { name: /^Show / });
  }

  slideImage(productName: string): Locator {
    return this.page.getByRole('img', { name: productName });
  }

  async showSlide(productName: string): Promise<void> {
    await this.page.getByRole('button', { name: `Show ${productName}` }).click();
  }
}
