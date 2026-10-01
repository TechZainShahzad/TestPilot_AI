import { expect, test } from '@playwright/test';

import { env } from '@utils/env.js';

/**
 * Environment health check.
 *
 * ParaBank is a shared public demo: it goes down, it gets slow, and its data
 * is reset on someone else's schedule. When that happens, every other spec
 * fails for the same uninteresting reason. This suite exists so the real
 * cause is the first line of the report rather than something to be inferred
 * from forty timeouts.
 *
 * It is deliberately the only place that asserts against ParaBank's stock
 * `john/demo` customer — everything else creates its own.
 */
test.describe('environment health @smoke @api', () => {
  test('the application landing page is served', async ({ request }) => {
    const response = await request.get(`${env.appUrl}/index.htm`);

    expect(response.status(), 'ParaBank landing page should return 200').toBe(200);
    await expect(response.text()).resolves.toContain('ParaBank');
  });

  test('the public REST API answers a customer lookup', async ({ request }) => {
    // `/services/bank/login/{username}/{password}` is ParaBank's one
    // unauthenticated JSON endpoint, which makes it the cheapest possible
    // proof that the API tier — not just the web tier — is alive.
    const response = await request.get(`${env.apiUrl}/bank/login/john/demo`, {
      headers: { Accept: 'application/json' },
    });

    expect(response.status(), 'REST login lookup should return 200').toBe(200);

    const customer: unknown = await response.json();
    expect(customer).toMatchObject({
      id: expect.any(Number),
      firstName: expect.any(String),
      lastName: expect.any(String),
    });
  });

  test('the session-authenticated JSON API rejects anonymous callers', async ({ request }) => {
    // Guards an assumption the API client is built on: `/services_proxy`
    // requires the JSESSIONID from a UI login. If this ever starts returning
    // data anonymously, the client's whole auth strategy is obsolete and we
    // want to hear about it here.
    const response = await request.get(`${env.apiProxyUrl}/accounts/13344`, {
      headers: { Accept: 'application/json' },
    });

    expect(response.status(), 'services_proxy should refuse unauthenticated reads').toBe(401);
  });
});
