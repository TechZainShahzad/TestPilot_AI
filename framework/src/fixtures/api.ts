/**
 * The `api` project fixture: no browser, no `page`. `apiClient` wraps
 * Playwright's built-in `request` fixture directly, and `registeredUser`
 * self-registers a brand-new customer over plain HTTP before the test body
 * runs — each API test gets its own account, so tests stay parallel-safe and
 * nothing here depends on the `ui` project's `setup` having run first.
 */
import { test as base } from '@playwright/test';

import { env } from '@utils/env.js';

import { ParaBankApiClient } from '../api/parabank-client.js';
import type { RegisteredCustomer } from '../api/types.js';
import { buildNewCustomer } from '../data/customer-builder.js';

export interface ApiFixtures {
  apiClient: ParaBankApiClient;
  registeredUser: RegisteredCustomer;
}

export const test = base.extend<ApiFixtures>({
  apiClient: async ({ request }, use) => {
    await use(new ParaBankApiClient(request, env.appUrl, env.apiUrl, env.apiProxyUrl));
  },

  registeredUser: async ({ apiClient }, use) => {
    const registered = await apiClient.registerCustomer(buildNewCustomer());
    await use(registered);
  },
});

export { expect } from '@playwright/test';
