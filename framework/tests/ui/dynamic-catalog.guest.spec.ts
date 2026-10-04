import {
  DYNAMIC_CATALOG_VIEWS,
  viewPath,
} from '../../src/pages/dynamic-catalog-page.js';
import { expect, test } from '../../src/fixtures/pages.js';

/**
 * Unauthenticated access to the Dynamic Catalog pages. The blocked-access
 * behaviour was NOT confirmed during exploration (every visit was logged
 * in), so this asserts the expected outcome — the login form is shown —
 * and will surface the real behaviour if the app serves the catalog instead.
 */
test.describe('dynamic catalog access control @regression', () => {
  for (const view of DYNAMIC_CATALOG_VIEWS) {
    test(`TC-20 ${viewPath(view)} is not served without a session`, async ({
      dynamicCatalogPage,
      loginPage,
    }) => {
      await dynamicCatalogPage.open(view);

      await expect(loginPage.loginButton).toBeVisible();
      await expect(dynamicCatalogPage.productImages).toHaveCount(0);
    });
  }
});
