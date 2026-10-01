/**
 * The `setup` project: registers one fresh customer through the real UI
 * (not an API shortcut — this is the one place where going through the
 * browser matters, since what gets saved is the browser's own session) and
 * persists two things for the rest of the run:
 *
 *   - `.auth/user.json`        — `storageState`, reused by every `ui` spec
 *   - `.auth/user.credentials.json` — the plaintext username/password, for
 *     any spec that needs to re-derive its own customer id via the API
 *
 * ParaBank's data resets on a schedule outside this project's control, which
 * is exactly why this runs once per `playwright test` invocation rather than
 * relying on a fixed, committed account.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { buildNewCustomer } from '@data/customer-builder.js';

import { expect, test } from '../src/fixtures/pages.js';

const AUTH_FILE = '.auth/user.json';
const CREDENTIALS_FILE = '.auth/user.credentials.json';

export interface StoredCredentials {
  username: string;
  password: string;
}

test.describe('authentication setup', () => {
  test('register a fresh customer and save the session', async ({ page, registerPage }) => {
    const customer = buildNewCustomer();

    await registerPage.goto();
    await registerPage.register(customer);
    await expect(registerPage.successHeading).toBeVisible();

    mkdirSync(dirname(AUTH_FILE), { recursive: true });
    await page.context().storageState({ path: AUTH_FILE });

    const credentials: StoredCredentials = {
      username: customer.username,
      password: customer.password,
    };
    writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
  });
});
