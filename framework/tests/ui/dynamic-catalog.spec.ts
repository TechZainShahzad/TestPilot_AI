import { expect, test } from '../../src/fixtures/pages.js';

const LAZY_LOAD_LIMIT_MS = 30_000;
const SPINNER_LIMIT_MS = 30_000;
const PRODUCT = 'Sauce Labs Backpack';

// aria-expanded -> what the submenu must look like / how we describe it.
const VISIBLE_ITEMS_BY_STATE: Record<string, number> = { true: 3, false: 0 };
const BEHAVIOUR_BY_STATE: Record<string, string> = {
  true: 'submenu stays open',
  false: 'submenu collapses',
};

test.describe('dynamic catalog @regression', () => {
  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
  });

  test.describe('submenu', () => {
    test('TC-01 lists exactly three options', async ({ dynamicCatalogPage }) => {
      await dynamicCatalogPage.expandDynamicCatalog();

      await expect(dynamicCatalogPage.dynamicCatalogButton).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await expect(dynamicCatalogPage.submenuItems).toHaveCount(3);
      await expect(dynamicCatalogPage.submenuItems).toHaveText(['Lazy Load', 'Spinner', 'Slider']);
    });

    test('TC-02 each item navigates to its own URL', async ({ dynamicCatalogPage, inventoryPage, page }) => {
      const expected = [
        ['Lazy Load', /\/dynamic-catalog-lazy-load\.html$/],
        ['Spinner', /\/dynamic-catalog-spinner\.html$/],
        ['Slider', /\/dynamic-catalog-slider\.html$/],
      ] as const;

      for (const [view, url] of expected) {
        await inventoryPage.goto();
        await dynamicCatalogPage.openView(view);
        await expect(page).toHaveURL(url);
      }
    });

    test('TC-03 second click toggles the submenu (records actual behaviour)', async ({
      dynamicCatalogPage,
    }) => {
      await dynamicCatalogPage.expandDynamicCatalog();
      await expect(dynamicCatalogPage.dynamicCatalogButton).toHaveAttribute(
        'aria-expanded',
        'true',
      );

      await dynamicCatalogPage.toggleDynamicCatalog();

      const expanded = (await dynamicCatalogPage.dynamicCatalogButton.getAttribute('aria-expanded')) ?? 'missing';
      test.info().annotations.push({
        type: 'actual behaviour',
        description: BEHAVIOUR_BY_STATE[expanded] ?? `unexpected aria-expanded: ${expanded}`,
      });
      // Whatever the state, aria-expanded and the visible items must agree.
      expect(Object.keys(VISIBLE_ITEMS_BY_STATE)).toContain(expanded);
      expect(await dynamicCatalogPage.visibleSubmenuItems.count()).toBe(VISIBLE_ITEMS_BY_STATE[expanded]);
    });
  });

  test.describe('lazy load', () => {
    test('TC-04 first render shows tiles and Loading placeholders', async ({
      dynamicCatalogPage,
    }) => {
      await dynamicCatalogPage.openView('Lazy Load');

      await expect(dynamicCatalogPage.loadingPlaceholders.first()).toBeVisible();
      expect(await dynamicCatalogPage.loadingPlaceholders.count()).toBeGreaterThan(0);
      expect(await dynamicCatalogPage.productImages.count()).toBeGreaterThan(0);
      await expect(dynamicCatalogPage.inventoryItems).toHaveCount(0);
    });

    test('TC-05 completes loading within the timed limit', async ({ dynamicCatalogPage }) => {
      await dynamicCatalogPage.openView('Lazy Load');
      const start = Date.now();

      await expect
        .poll(async () => dynamicCatalogPage.loadingPlaceholders.count(), {
          intervals: [500],
          timeout: LAZY_LOAD_LIMIT_MS,
          message: `Loading… placeholders still present after ${String(LAZY_LOAD_LIMIT_MS)} ms`,
        })
        .toBe(0);

      const elapsed = Date.now() - start;
      test.info().annotations.push({ type: 'lazy load duration ms', description: String(elapsed) });

      await dynamicCatalogPage.scrollToBottom();
      await expect(dynamicCatalogPage.loadingPlaceholders).toHaveCount(0);
      await expect(dynamicCatalogPage.productImages).toHaveCount(12);
    });

    test('TC-06 add to cart from the lazy load view', async ({
      cartPage,
      dynamicCatalogPage,
    }) => {
      await dynamicCatalogPage.openView('Lazy Load');
      await expect
        .poll(async () => dynamicCatalogPage.loadingPlaceholders.count(), {
          intervals: [500],
          timeout: LAZY_LOAD_LIMIT_MS,
        })
        .toBe(0);

      // Fails (documenting a defect) if products are not interactable.
      await expect(
        dynamicCatalogPage.addToCartButtons.first(),
        'Lazy Load products expose no Add to cart control',
      ).toBeVisible({ timeout: 5_000 });
      await dynamicCatalogPage.addToCartButtons.first().click();

      await expect(dynamicCatalogPage.cartBadge).toHaveText('1');
      await expect(dynamicCatalogPage.removeButtons.first()).toBeVisible();
      await dynamicCatalogPage.goToCart();
      await expect(cartPage.cartItems).toHaveCount(1);
    });

    test('TC-07 shows no error state', async ({ dynamicCatalogPage, page }) => {
      const consoleErrors: string[] = [];
      const failedRequests: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('requestfailed', (req) => failedRequests.push(req.url()));

      await dynamicCatalogPage.openView('Lazy Load');
      await expect
        .poll(async () => dynamicCatalogPage.loadingPlaceholders.count(), {
          intervals: [500],
          timeout: LAZY_LOAD_LIMIT_MS,
        })
        .toBe(0);

      expect(consoleErrors).toEqual([]);
      expect(failedRequests).toEqual([]);
      await expect(dynamicCatalogPage.errorText).toHaveCount(0);
    });
  });

  test.describe('spinner', () => {
    test('TC-08 spinner is displayed immediately after navigation', async ({
      dynamicCatalogPage,
    }) => {
      await dynamicCatalogPage.openView('Spinner');

      await expect(dynamicCatalogPage.spinner).toBeVisible();
      await expect(dynamicCatalogPage.productImages).toHaveCount(0);
    });

    test('TC-09 spinner is replaced by the real catalog', async ({ dynamicCatalogPage }) => {
      await dynamicCatalogPage.openView('Spinner');
      await expect(dynamicCatalogPage.spinner).toBeVisible();
      const start = Date.now();

      await expect(dynamicCatalogPage.spinner).toBeHidden({ timeout: SPINNER_LIMIT_MS });
      test.info().annotations.push({
        type: 'spinner duration ms',
        description: String(Date.now() - start),
      });

      await expect(dynamicCatalogPage.spinner).toHaveCount(0);
      await expect(dynamicCatalogPage.productImages).toHaveCount(6);
    });

    test('TC-10 products are interactable (add to cart)', async ({ dynamicCatalogPage }) => {
      await dynamicCatalogPage.openView('Spinner');
      await expect(dynamicCatalogPage.spinner).toBeHidden({ timeout: SPINNER_LIMIT_MS });

      // Fails (documenting a defect) if products are not interactable.
      await expect(
        dynamicCatalogPage.addToCartButtons.first(),
        'Spinner products expose no Add to cart control',
      ).toBeVisible({ timeout: 5_000 });
      await dynamicCatalogPage.addToCartButtons.first().click();

      await expect(dynamicCatalogPage.cartBadge).toHaveText('1');
    });
  });

  test.describe('slider', () => {
    test('TC-11 renders without errors', async ({ dynamicCatalogPage, page }) => {
      const consoleErrors: string[] = [];
      const failedRequests: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('requestfailed', (req) => failedRequests.push(req.url()));

      await dynamicCatalogPage.openView('Slider');

      await expect(dynamicCatalogPage.slideImage('Sauce Labs Bike Light')).toBeVisible();
      await expect(dynamicCatalogPage.showButtons).toHaveCount(6);
      await expect(dynamicCatalogPage.errorText).toHaveCount(0);
      expect(consoleErrors).toEqual([]);
      expect(failedRequests).toEqual([]);
    });

    test('TC-12 selector switches the displayed slide', async ({ dynamicCatalogPage }) => {
      await dynamicCatalogPage.openView('Slider');
      await expect(dynamicCatalogPage.slideImage('Sauce Labs Bike Light')).toBeVisible();

      await dynamicCatalogPage.showSlide('Sauce Labs Onesie');

      await expect(dynamicCatalogPage.slideImage('Sauce Labs Onesie')).toBeVisible();
      await expect(dynamicCatalogPage.priceText('$7.99')).toBeVisible();
      await expect(dynamicCatalogPage.slideImage('Sauce Labs Bike Light')).toHaveCount(0);
    });

    test('TC-13 content is distinct from the inventory grid', async ({ dynamicCatalogPage }) => {
      await dynamicCatalogPage.openView('Slider');
      await expect(dynamicCatalogPage.slideImage('Sauce Labs Bike Light')).toBeVisible();

      await expect(dynamicCatalogPage.inventoryItems).toHaveCount(0);
      // Only the current slide's product image is rendered, not a 6-item grid.
      await expect(dynamicCatalogPage.slideImage('Sauce Labs Onesie')).toHaveCount(0);
      await expect(dynamicCatalogPage.slideImage('Sauce Labs Backpack')).toHaveCount(0);
    });
  });

  test.describe('return to All Items', () => {
    test('TC-14 All Items from the Slider returns to inventory', async ({
      dynamicCatalogPage,
      inventoryPage,
      page,
    }) => {
      await dynamicCatalogPage.openView('Slider');
      await expect(page).toHaveURL(/dynamic-catalog-slider\.html$/);

      await dynamicCatalogPage.goToAllItems();

      await expect(page).toHaveURL(/\/inventory\.html$/);
      await expect(inventoryPage.items).toHaveCount(6);
      await expect(dynamicCatalogPage.addToCartButtons).toHaveCount(6);
    });

    test('TC-15 All Items from Lazy Load and Spinner returns to inventory', async ({
      dynamicCatalogPage,
      inventoryPage,
      page,
    }) => {
      await dynamicCatalogPage.openView('Lazy Load');
      await expect(page).toHaveURL(/dynamic-catalog-lazy-load\.html$/);
      await dynamicCatalogPage.goToAllItems();
      await expect(page).toHaveURL(/\/inventory\.html$/);
      await expect(inventoryPage.items).toHaveCount(6);

      await dynamicCatalogPage.openView('Spinner');
      await expect(page).toHaveURL(/dynamic-catalog-spinner\.html$/);
      await dynamicCatalogPage.goToAllItems();
      await expect(page).toHaveURL(/\/inventory\.html$/);
      await expect(inventoryPage.items).toHaveCount(6);
    });

    test('TC-16 cart state persists between inventory and Dynamic Catalog pages', async ({
      dynamicCatalogPage,
      inventoryPage,
      page,
    }) => {
      await inventoryPage.resetAppState();
      await expect(inventoryPage.cartBadge).toHaveCount(0);
      await inventoryPage.addToCart(PRODUCT);
      await expect(inventoryPage.cartBadge).toHaveText('1');

      await dynamicCatalogPage.openView('Slider');
      await expect(page).toHaveURL(/dynamic-catalog-slider\.html$/);
      await expect(dynamicCatalogPage.cartBadge).toHaveText('1');

      await dynamicCatalogPage.goToAllItems();
      await expect(page).toHaveURL(/\/inventory\.html$/);
      await expect(inventoryPage.cartBadge).toHaveText('1');
      await expect(
        inventoryPage.items
          .filter({ has: page.getByText(PRODUCT, { exact: true }) })
          .getByRole('button', { name: 'Remove' }),
      ).toBeVisible();
    });
  });
});
