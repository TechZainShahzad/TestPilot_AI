import { expect, type Locator } from '@playwright/test';

import { env } from '@utils/env.js';

import { BasePage } from './base-page.js';

export type DynamicCatalogView = 'lazy-load' | 'spinner' | 'slider';

const VIEW_PATHS: Record<DynamicCatalogView, string> = {
  'lazy-load': 'dynamic-catalog-lazy-load.html',
  spinner: 'dynamic-catalog-spinner.html',
  slider: 'dynamic-catalog-slider.html',
};

const VIEW_HEADERS: Record<DynamicCatalogView, string> = {
  'lazy-load': 'Dynamic Catalog - Lazy Load',
  spinner: 'Dynamic Catalog - Spinner',
  slider: 'Dynamic Catalog - Slider',
};

const MENU_LABELS: Record<DynamicCatalogView, string> = {
  'lazy-load': 'Lazy Load',
  spinner: 'Spinner',
  slider: 'Slider',
};

export const DYNAMIC_CATALOG_VIEWS: readonly DynamicCatalogView[] = [
  'lazy-load',
  'spinner',
  'slider',
];

export function viewPath(view: DynamicCatalogView): string {
  return VIEW_PATHS[view];
}

/**
 * The three "Dynamic Catalog" views reached from the burger menu. None use
 * the standard `.inventory_item` markup and none exposed stable `data-test`
 * ids during exploration, so everything is located by accessible role /
 * visible text as observed in the live accessibility tree.
 */
export class DynamicCatalogPage extends BasePage {
  /** Direct navigation to a view (bypassing the menu). */
  async open(
    view: DynamicCatalogView,
    waitUntil: 'load' | 'domcontentloaded' | 'commit' = 'load'
  ): Promise<void> {
    await this.page.goto(`${env.appUrl}/${VIEW_PATHS[view]}`, { waitUntil });
  }

  // ---- burger menu ----------------------------------------------------

  get allItemsButton(): Locator {
    return this.page.getByRole('button', { name: 'All Items' });
  }

  get dynamicCatalogButton(): Locator {
    return this.page.getByRole('button', { name: 'Dynamic Catalog' });
  }

  submenuItem(view: DynamicCatalogView): Locator {
    return this.page.getByRole('button', { name: MENU_LABELS[view], exact: true });
  }

  /** Every button inside the submenu container (the parent of its first item). */
  get submenuButtons(): Locator {
    return this.submenuItem('lazy-load').locator('..').getByRole('button');
  }

  /** Opens the burger menu and waits until its entries are visible. */
  async openMenu(): Promise<void> {
    await this.burgerMenuButton.click();
    await this.allItemsButton.waitFor({ state: 'visible' });
  }

  async expandDynamicCatalog(): Promise<void> {
    await this.openMenu();
    await this.dynamicCatalogButton.click();
    await this.submenuItem('lazy-load').waitFor({ state: 'visible' });
  }

  /** Menu route from the current page to a Dynamic Catalog view. */
  async selectView(view: DynamicCatalogView): Promise<void> {
    await this.expandDynamicCatalog();
    await this.submenuItem(view).click();
    await this.page.waitForURL(`**/${VIEW_PATHS[view]}`);
  }

  async returnToAllItems(): Promise<void> {
    await this.openMenu();
    await this.allItemsButton.click();
    await this.page.waitForURL('**/inventory.html');
  }

  // ---- shared view content ---------------------------------------------

  header(view: DynamicCatalogView): Locator {
    return this.page.getByText(VIEW_HEADERS[view], { exact: true });
  }

  /** Product images, excluding the burger-menu icons. */
  get productImages(): Locator {
    return this.page.getByRole('img', { name: /^(?!Open Menu|Close Menu)/ });
  }

  get legacyInventoryItems(): Locator {
    return this.page.locator('.inventory_item');
  }

  get addToCartButtons(): Locator {
    return this.page.getByRole('button', { name: 'Add to cart' });
  }

  // ---- lazy load ---------------------------------------------------------

  get loadingPlaceholders(): Locator {
    return this.page.getByText('Loading…', { exact: true });
  }

  async scrollToBottom(): Promise<void> {
    await this.page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
  }

  /**
   * Waits until no "Loading…" placeholder remains, scrolling to the bottom
   * on every poll in case the remaining tiles are scroll-triggered.
   * Returns milliseconds elapsed since `startedAt`.
   */
  async waitForLazyLoadComplete(startedAt: number, timeoutMs: number): Promise<number> {
    const remaining = Math.max(timeoutMs - (Date.now() - startedAt), 1_000);
    await expect
      .poll(
        async () => {
          if ((await this.loadingPlaceholders.count()) === 0) {
            return true;
          }
          await this.scrollToBottom();
          return false;
        },
        {
          timeout: remaining,
          intervals: [500],
          message: `Lazy Load placeholders were still present after ${String(timeoutMs)} ms`,
        }
      )
      .toBe(true);
    return Date.now() - startedAt;
  }

  // ---- spinner -----------------------------------------------------------

  get spinner(): Locator {
    return this.page.getByRole('status', { name: 'Loading' });
  }

  // ---- slider ------------------------------------------------------------

  get sliderShowButtons(): Locator {
    return this.page.getByRole('button', { name: /^Show / });
  }

  sliderShowButton(productName: string): Locator {
    return this.page.getByRole('button', { name: `Show ${productName}`, exact: true });
  }

  /** Name (image alt) of the product the slider is currently showing. */
  async currentSliderProduct(): Promise<string> {
    return (await this.productImages.first().getAttribute('alt')) ?? '';
  }
}
