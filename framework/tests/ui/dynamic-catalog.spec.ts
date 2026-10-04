import { expect, test } from '../../src/fixtures/pages.js';

const SPINNER_PRODUCTS = [
  ['Sauce Labs Bike Light', '$9.99'],
  ['Sauce Labs Bolt T-Shirt', '$15.99'],
  ['Sauce Labs Onesie', '$7.99'],
  ['Test.allTheThings() T-Shirt (Red)', '$15.99'],
  ['Sauce Labs Backpack', '$29.99'],
  ['Sauce Labs Fleece Jacket', '$49.99'],
] as const;

/**
 * Dynamic Catalog views. Observed live: none of them use `.inventory_item`
 * markup and none exposed an "Add to cart" button. Cases whose expectations
 * were not directly observed are noted inline.
 */
test.describe('dynamic catalog @regression', () => {
  test.describe('burger submenu', () => {
    test('Dynamic Catalog expands to exactly Lazy Load, Spinner, Slider', async ({
      inventoryPage,
      dynamicCatalogPage,
    }) => {
      await inventoryPage.goto();

      await dynamicCatalogPage.expandDynamicCatalog();

      await expect(dynamicCatalogPage.dynamicCatalogMenuButton).toHaveAttribute(
        'aria-expanded',
        'true'
      );
      await expect(dynamicCatalogPage.menuButtons).toHaveText([
        'All Items',
        'Dynamic Catalog',
        'Lazy Load',
        'Spinner',
        'Slider',
        'Logout',
        'Reset App State',
      ]);
    });

    test('submenu options are hidden until Dynamic Catalog is clicked', async ({
      inventoryPage,
      dynamicCatalogPage,
    }) => {
      await inventoryPage.goto();

      await dynamicCatalogPage.openMenu();

      await expect(dynamicCatalogPage.menuOption('Lazy Load')).toBeHidden();
      await expect(dynamicCatalogPage.menuOption('Spinner')).toBeHidden();
      await expect(dynamicCatalogPage.menuOption('Slider')).toBeHidden();
    });
  });

  test.describe('spinner', () => {
    test('submenu item navigates to the spinner page', async ({
      inventoryPage,
      dynamicCatalogPage,
      page,
    }) => {
      await inventoryPage.goto();

      await dynamicCatalogPage.openMode('Spinner');

      await expect(page).toHaveURL(/dynamic-catalog-spinner\.html$/);
      await expect(dynamicCatalogPage.heading('Spinner')).toBeVisible();
    });

    test('spinner shows immediately, then the six-product catalog replaces it', async ({
      inventoryPage,
      dynamicCatalogPage,
    }) => {
      await inventoryPage.goto();
      await dynamicCatalogPage.openMode('Spinner');

      await expect(dynamicCatalogPage.loadingSpinner).toBeVisible();
      await expect(dynamicCatalogPage.productImages).toHaveCount(0);

      await expect(dynamicCatalogPage.loadingSpinner).toBeHidden({ timeout: 30_000 });
      await expect(dynamicCatalogPage.productImages).toHaveCount(SPINNER_PRODUCTS.length);
      for (const [name, price] of SPINNER_PRODUCTS) {
        await expect(dynamicCatalogPage.productName(name)).toBeVisible();
        await expect(
          dynamicCatalogPage.productName(name).locator('xpath=following-sibling::*[1]')
        ).toHaveText(price);
      }
    });

    test('spinner view does not use the standard inventory markup', async ({
      dynamicCatalogPage,
    }) => {
      await dynamicCatalogPage.gotoSpinner();
      await expect(dynamicCatalogPage.productImages).toHaveCount(SPINNER_PRODUCTS.length, {
        timeout: 30_000,
      });

      await expect(dynamicCatalogPage.legacyInventoryItems).toHaveCount(0);
      await expect(dynamicCatalogPage.sortDropdown).toHaveCount(0);
      await expect(dynamicCatalogPage.addToCartButtons).toHaveCount(0);
    });
  });

  test.describe('lazy load', () => {
    test('shows the header and the first items while others are still loading', async ({
      dynamicCatalogPage,
    }) => {
      await dynamicCatalogPage.gotoLazyLoad();

      await expect(dynamicCatalogPage.heading('Lazy Load')).toBeVisible();
      await expect(dynamicCatalogPage.productImages.first()).toBeVisible();
      // Observed: ~8 items plus 4 "Loading…" placeholders right after load.
      await expect(dynamicCatalogPage.loadingPlaceholders.first()).toBeVisible();
    });

    // Placeholders never resolved in 30s of passive waiting, so loading looks
    // scroll-triggered. The helper scrolls them into view; the original
    // "no placeholders left" assertion is kept unchanged afterwards.
    test('eventually renders the full catalog (timed)', async ({
      dynamicCatalogPage,
    }, testInfo) => {
      const start = Date.now();
      await dynamicCatalogPage.gotoLazyLoad();

      await dynamicCatalogPage.scrollUntilFullyLoaded();
      await expect(dynamicCatalogPage.loadingPlaceholders).toHaveCount(0, { timeout: 30_000 });

      // The elapsed time is recorded as a test annotation (visible in reports).
      const elapsedMs = Date.now() - start;
      testInfo.annotations.push({ type: 'lazy-load-ms', description: String(elapsedMs) });
      expect(await dynamicCatalogPage.productImages.count()).toBeGreaterThanOrEqual(8);
    });

    test('size variants render as separate entries', async ({ dynamicCatalogPage }) => {
      await dynamicCatalogPage.gotoLazyLoad();
      await dynamicCatalogPage.scrollUntilFullyLoaded();
      await expect(dynamicCatalogPage.loadingPlaceholders).toHaveCount(0, { timeout: 30_000 });

      for (const name of [
        'Sauce Labs Fleece Jacket (XS)',
        'Sauce Labs Fleece Jacket (S)',
        'Sauce Labs Fleece Jacket (M)',
      ]) {
        await expect(dynamicCatalogPage.productName(name)).toHaveCount(1);
      }
    });

    // AC2 says products can be added to the cart, but no "Add to cart" control
    // was observed. test.fail() keeps the suite green while the gap exists and
    // turns red ("unexpectedly passed") once the app ships the control.
    test('products can be added to the cart from this view', async ({
      dynamicCatalogPage,
    }) => {
      test.fail(true, 'Known gap: no Add to cart button observed on Lazy Load (AC2)');
      await dynamicCatalogPage.gotoLazyLoad();
      await dynamicCatalogPage.scrollUntilFullyLoaded();
      await expect(dynamicCatalogPage.loadingPlaceholders).toHaveCount(0, { timeout: 30_000 });

      await dynamicCatalogPage.addToCartButtons.first().click({ timeout: 5_000 });

      await expect(dynamicCatalogPage.cartBadge).toHaveText('1');
    });
  });

  test.describe('slider', () => {
    test('renders one product with a selector button per product', async ({
      dynamicCatalogPage,
    }) => {
      await dynamicCatalogPage.gotoSlider();

      await expect(dynamicCatalogPage.heading('Slider')).toBeVisible();
      await expect(dynamicCatalogPage.productImages).toHaveCount(1);
      await expect(dynamicCatalogPage.productName('Sauce Labs Bike Light')).toBeVisible();
      await expect(dynamicCatalogPage.sliderButtons).toHaveCount(6);
      await expect(dynamicCatalogPage.legacyInventoryItems).toHaveCount(0);
    });

    // Not observed live: assumes clicking a selector swaps the displayed product.
    test('selector buttons switch the displayed product', async ({ dynamicCatalogPage }) => {
      await dynamicCatalogPage.gotoSlider();

      await dynamicCatalogPage.sliderButton('Sauce Labs Backpack').click();
      await expect(dynamicCatalogPage.productName('Sauce Labs Backpack')).toBeVisible();
      await expect(dynamicCatalogPage.productName('$29.99')).toBeVisible();

      await dynamicCatalogPage.sliderButton('Sauce Labs Fleece Jacket').click();
      await expect(dynamicCatalogPage.productName('Sauce Labs Fleece Jacket')).toBeVisible();
      await expect(dynamicCatalogPage.productName('$49.99')).toBeVisible();
    });
  });

  test.describe('returning to All Items', () => {
    // The All Items entry on dynamic pages was not clicked during exploration;
    // it is assumed to behave as on the inventory page.
    for (const mode of ['Spinner', 'Lazy Load', 'Slider'] as const) {
      test(`All Items from ${mode} restores the standard inventory`, async ({
        inventoryPage,
        dynamicCatalogPage,
        page,
      }) => {
        await inventoryPage.goto();
        await dynamicCatalogPage.openMode(mode);
        await expect(dynamicCatalogPage.heading(mode)).toBeVisible();

        await dynamicCatalogPage.goToAllItems();

        await expect(page).toHaveURL(/inventory\.html$/);
        await expect(inventoryPage.items).toHaveCount(6);
        await expect(inventoryPage.sortDropdown).toBeVisible();
      });
    }
  });
});
