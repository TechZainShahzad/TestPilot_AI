/**
 * The `setup` project: logs in once as the configured SauceDemo demo
 * account (`env.sauceUsername`/`env.saucePassword`, default
 * `standard_user`/`secret_sauce`) and saves `storageState` for every `ui`
 * spec to reuse. There is no registration step — SauceDemo's accounts are
 * fixed, so unlike a per-run-registered identity there is nothing to
 * persist beyond the session itself.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { env } from '@utils/env.js';

import { expect, test } from '../src/fixtures/pages.js';

const AUTH_FILE = '.auth/user.json';

test.describe('authentication setup', () => {
  test('log in as the configured demo account and save the session', async ({
    page,
    loginPage,
    inventoryPage,
  }) => {
    await loginPage.goto();
    await loginPage.login(env.sauceUsername, env.saucePassword);
    await expect(inventoryPage.items.first()).toBeVisible();

    mkdirSync(dirname(AUTH_FILE), { recursive: true });
    await page.context().storageState({ path: AUTH_FILE });
  });
});
