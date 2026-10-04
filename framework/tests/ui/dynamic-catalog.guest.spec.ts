import { expect, test } from '../../src/fixtures/pages.js';

/** Runs unauthenticated (`.guest.spec.ts`): the dynamic pages must not be reachable without a session. */
test.describe('dynamic catalog access control @regression', () => {
  const entries = [
    ['spinner', 'gotoSpinner'],
    ['lazy load', 'gotoLazyLoad'],
    ['slider', 'gotoSlider'],
  ] as const;

  for (const [label, method] of entries) {
    test(`${label} page is not accessible without logging in`, async ({
      dynamicCatalogPage,
      loginPage,
    }) => {
      await dynamicCatalogPage[method]();

      await expect(loginPage.loginButton).toBeVisible();
      await expect(dynamicCatalogPage.productImages).toHaveCount(0);
    });
  }
});
