import { expect, test } from '../../src/fixtures/pages.js';
import {
  DYNAMIC_CATALOG_VIEWS,
  viewPath,
  type DynamicCatalogView,
} from '../../src/pages/dynamic-catalog-page.js';

const LAZY_LOAD_CEILING_MS = 30_000;

const SPINNER_PRODUCTS = [
  { name: 'Sauce Labs Bike Light', price: '$9.99' },
  { name: 'Sauce Labs Bolt T-Shirt', price: '$15.99' },
  { name: 'Sauce Labs Onesie', price: '$7.99' },
  { name: 'Test.allTheThings() T-Shirt (Red)', price: '$15.99' },
  { name: 'Sauce Labs Backpack', price: '$29.99' },
  { name: 'Sauce Labs Fleece Jacket', price: '$49.99' },
];

const LAZY_LOAD_INITIAL_PRODUCTS = [
  'Sauce Labs Bike Light',
  'Sauce Labs Bolt T-Shirt (XS)',
  'Sauce Labs Onesie',
  'Test.allTheThings() T-Shirt (Red) (XS)',
  'Sauce Labs Backpack',
  'Sauce Labs Fleece Jacket (XS)',
  'Sauce Labs Fleece Jacket (S)',
  'Sauce Labs Fleece Jacket (M)',
];

const MENU_LABEL: Record<DynamicCatalogView, string> = {
  'lazy-load': 'Lazy Load',
  spinner: 'Spinner',
  slider: 'Slider',
};

test.describe('dynamic catalog menu @regression', () => {
  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
  });

  test('TC-01 submenu shows exactly Lazy Load, Spinner, Slider', async ({ dynamicCatalogPage }) => {
    await dynamicCatalogPage.expandDynamicCatalog();

    await expect(dynamicCatalogPage.dynamicCatalogButton).toHaveAttribute('aria-expanded', 'true');
    await expect(dynamicCatalogPage.submenuButtons).toHaveCount(3);
    await expect(dynamicCatalogPage.submenuButtons).toHaveText(['Lazy Load', 'Spinner', 'Slider']);
  });

  test('TC-02 submenu is collapsed until Dynamic Catalog is clicked', async ({
    dynamicCatalogPage,
  }) => {
    await dynamicCatalogPage.openMenu();

    await expect(dynamicCatalogPage.dynamicCatalogButton).toBeVisible();
    for (const view of DYNAMIC_CATALOG_VIEWS) {
      await expect(dynamicCatalogPage.submenuItem(view)).toBeHidden();
    }
  });

  for (const view of DYNAMIC_CATALOG_VIEWS) {
    test(`TC-03..05 ${MENU_LABEL[view]} menu item navigates to its page`, async ({
      dynamicCatalogPage,
      page,
    }) => {
      await dynamicCatalogPage.selectView(view);

      expect(page.url()).toContain(`/${viewPath(view)}`);
      await expect(dynamicCatalogPage.header(view)).toBeVisible();
    });
  }
});

test.describe('dynamic catalog: lazy load @regression', () => {
  test('TC-06 initial products render without standard inventory markup', async ({
    dynamicCatalogPage,
    inventoryPage,
    page,
  }) => {
    await inventoryPage.goto();
    await dynamicCatalogPage.selectView('lazy-load');

    for (const name of LAZY_LOAD_INITIAL_PRODUCTS) {
      await expect(page.getByAltText(name, { exact: true })).toBeVisible();
    }
    await expect(dynamicCatalogPage.legacyInventoryItems).toHaveCount(0);
  });

  test('TC-07 all Loading placeholders resolve into products (timed)', async ({
    dynamicCatalogPage,
  }) => {
    const startedAt = Date.now();
    await dynamicCatalogPage.open('lazy-load');

    const elapsed = await dynamicCatalogPage.waitForLazyLoadComplete(
      startedAt,
      LAZY_LOAD_CEILING_MS
    );

    test.info().annotations.push({ type: 'lazy-load-duration-ms', description: String(elapsed) });
    await expect(dynamicCatalogPage.loadingPlaceholders).toHaveCount(0);
    expect(await dynamicCatalogPage.productImages.count()).toBeGreaterThanOrEqual(8);
  });

  test('TC-08 probe: a lazy-loaded product can be added to the cart', async ({
    dynamicCatalogPage,
    page,
  }) => {
    const startedAt = Date.now();
    await dynamicCatalogPage.open('lazy-load');
    await dynamicCatalogPage.waitForLazyLoadComplete(startedAt, LAZY_LOAD_CEILING_MS);

    expect(
      await dynamicCatalogPage.addToCartButtons.count(),
      'AC2 not met: no add-to-cart control on Lazy Load'
    ).toBeGreaterThan(0);

    await dynamicCatalogPage.addToCartButtons.first().click();
    await expect(dynamicCatalogPage.cartBadge).toHaveText('1');
    await expect(page.getByRole('button', { name: 'Remove' }).first()).toBeVisible();
  });

  test('TC-19 All Items while Lazy Load is still loading restores inventory', async ({
    dynamicCatalogPage,
    inventoryPage,
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await dynamicCatalogPage.open('lazy-load', 'domcontentloaded');
    await dynamicCatalogPage.returnToAllItems();

    await expect(inventoryPage.items).toHaveCount(6);
    await expect(page.getByText('Products', { exact: true })).toBeVisible();
    await expect(dynamicCatalogPage.loadingPlaceholders).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe('dynamic catalog: spinner @regression', () => {
  test('TC-09 loading indicator is shown right after navigation', async ({
    dynamicCatalogPage,
  }) => {
    await dynamicCatalogPage.open('spinner', 'commit');

    await expect(dynamicCatalogPage.spinner).toBeVisible();
    await expect(dynamicCatalogPage.productImages).toHaveCount(0);
  });

  test('TC-10 spinner is replaced by the six product tiles', async ({
    dynamicCatalogPage,
    page,
  }) => {
    const startedAt = Date.now();
    await dynamicCatalogPage.open('spinner');

    await expect(dynamicCatalogPage.spinner).toBeHidden({ timeout: 30_000 });
    test
      .info()
      .annotations.push({ type: 'spinner-duration-ms', description: String(Date.now() - startedAt) });

    await expect(dynamicCatalogPage.productImages).toHaveCount(SPINNER_PRODUCTS.length);
    for (const { name, price } of SPINNER_PRODUCTS) {
      await expect(page.getByAltText(name, { exact: true })).toBeVisible();
      await expect(page.getByText(price, { exact: true }).first()).toBeVisible();
    }
  });

  test('TC-11 probe: a spinner-loaded product can be added to the cart', async ({
    dynamicCatalogPage,
  }) => {
    await dynamicCatalogPage.open('spinner');
    await expect(dynamicCatalogPage.spinner).toBeHidden({ timeout: 30_000 });

    expect(
      await dynamicCatalogPage.addToCartButtons.count(),
      'no add-to-cart control on Spinner view'
    ).toBeGreaterThan(0);

    await dynamicCatalogPage.addToCartButtons.first().click();
    await expect(dynamicCatalogPage.cartBadge).toHaveText('1');
  });
});

test.describe('dynamic catalog: slider @regression', () => {
  test('TC-12 renders without error and differs from the inventory grid', async ({
    dynamicCatalogPage,
    inventoryPage,
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await dynamicCatalogPage.open('slider');

    await expect(dynamicCatalogPage.header('slider')).toBeVisible();
    await expect(dynamicCatalogPage.productImages).toHaveCount(1);
    await expect(dynamicCatalogPage.sliderShowButtons).toHaveCount(6);
    await expect(dynamicCatalogPage.legacyInventoryItems).toHaveCount(0);
    await expect(inventoryPage.sortDropdown).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('TC-13 a Show button displays that product', async ({ dynamicCatalogPage, page }) => {
    await dynamicCatalogPage.open('slider');

    await dynamicCatalogPage.sliderShowButton('Sauce Labs Backpack').click();
    await expect(dynamicCatalogPage.productImages.first()).toHaveAttribute(
      'alt',
      'Sauce Labs Backpack'
    );
    await expect(page.getByText('$29.99', { exact: true })).toBeVisible();

    await dynamicCatalogPage.sliderShowButton('Sauce Labs Fleece Jacket').click();
    await expect(dynamicCatalogPage.productImages.first()).toHaveAttribute(
      'alt',
      'Sauce Labs Fleece Jacket'
    );
    await expect(page.getByText('$49.99', { exact: true })).toBeVisible();
  });

  test('TC-14 the displayed product rotates automatically', async ({ dynamicCatalogPage }) => {
    await dynamicCatalogPage.open('slider');
    const initial = await dynamicCatalogPage.currentSliderProduct();
    const startedAt = Date.now();

    await expect
      .poll(() => dynamicCatalogPage.currentSliderProduct(), {
        timeout: 15_000,
        intervals: [500],
      })
      .not.toBe(initial);

    test
      .info()
      .annotations.push({ type: 'slider-rotation-ms', description: String(Date.now() - startedAt) });
  });

  test('TC-15 probe: the displayed product can be added to the cart', async ({
    dynamicCatalogPage,
  }) => {
    await dynamicCatalogPage.open('slider');

    expect(
      await dynamicCatalogPage.addToCartButtons.count(),
      'no add-to-cart control on Slider view'
    ).toBeGreaterThan(0);

    await dynamicCatalogPage.addToCartButtons.first().click();
    await expect(dynamicCatalogPage.cartBadge).toHaveText('1');
  });
});

test.describe('dynamic catalog: return to All Items @regression', () => {
  for (const view of DYNAMIC_CATALOG_VIEWS) {
    test(`TC-16..18 All Items restores the inventory from ${MENU_LABEL[view]}`, async ({
      dynamicCatalogPage,
      inventoryPage,
      page,
    }) => {
      await dynamicCatalogPage.open(view);

      await dynamicCatalogPage.returnToAllItems();

      expect(page.url()).toContain('/inventory.html');
      await expect(page.getByText('Products', { exact: true })).toBeVisible();
      await expect(inventoryPage.sortDropdown).toBeVisible();
      await expect(inventoryPage.items).toHaveCount(6);
      await expect(dynamicCatalogPage.addToCartButtons).toHaveCount(6);
    });
  }
});
