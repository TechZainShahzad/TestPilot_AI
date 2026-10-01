import { expect, test } from '../../src/fixtures/pages.js';

/**
 * SauceDemo ships several deliberately-broken demo accounts as a testing
 * exercise. The two cases below were confirmed live and reproducible across
 * repeated runs — see "Known application limitations" in
 * docs/architecture.md for the full writeup, including accounts that were
 * checked and left out of active coverage because their behavior did not
 * reproduce reliably (`performance_glitch_user` showed no observable delay;
 * an `error_user` cart-rendering issue seen during initial exploration did
 * not reproduce on a second run, so it was not solid enough to assert on).
 *
 * Runs unauthenticated (`.guest.spec.ts`) since each case needs its own
 * non-standard login.
 */
test.describe('seeded-bug demo accounts @regression', () => {
  test('problem_user: every product image is the same broken placeholder', async ({
    loginPage,
    inventoryPage,
  }) => {
    await loginPage.goto();
    await loginPage.login('problem_user', 'secret_sauce');

    const srcs = await inventoryPage.itemImages.evaluateAll((imgs) =>
      imgs.map((img) => (img as HTMLImageElement).src)
    );

    expect(new Set(srcs).size).toBe(1);
    expect(srcs[0]).toContain('sl-404');
  });

  test('problem_user: sorting Z to A has no effect on the listing order', async ({
    loginPage,
    inventoryPage,
  }) => {
    await loginPage.goto();
    await loginPage.login('problem_user', 'secret_sauce');

    const defaultOrder = await inventoryPage.itemNames.allTextContents();
    const trueZtoA = [...defaultOrder].sort((a, b) => b.localeCompare(a));

    await inventoryPage.sortBy('Name (Z to A)');

    await expect(inventoryPage.itemNames).toHaveText(defaultOrder);
    await expect(inventoryPage.itemNames).not.toHaveText(trueZtoA);
  });
});
