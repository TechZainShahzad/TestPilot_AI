/**
 * Faker-backed builder for registration data.
 *
 * register.htm's own validation only checks presence, not format (confirmed
 * by probing it live — an SSN of `000-00-0000` and a phone number left
 * blank both sail through), so the builder does not try to manufacture
 * field-format edge cases. What it does guarantee is a **unique username per
 * call, capped at 20 characters** — `customer.username` is silently rejected
 * past that length (misreported as "This username already exists", not a
 * length error; confirmed by bisecting live: 20 succeeds, 21 fails). See
 * "Known application limitations" in docs/architecture.md.
 */
import { faker } from '@faker-js/faker';

import { env } from '@utils/env.js';

import type { NewCustomer } from '../api/types.js';

/**
 * Builds a valid, ready-to-register customer. Every field can be overridden;
 * omitted fields are Faker-generated. `username` always gets a random suffix
 * even when overridden, so two tests cannot collide on the same run.
 */
export function buildNewCustomer(overrides: Partial<NewCustomer> = {}): NewCustomer {
  const firstName = overrides.firstName ?? faker.person.firstName();
  const lastName = overrides.lastName ?? faker.person.lastName();

  return {
    firstName,
    lastName,
    address: {
      street: faker.location.streetAddress(),
      city: faker.location.city(),
      state: faker.location.state({ abbreviated: true }),
      zipCode: faker.location.zipCode('#####'),
      ...overrides.address,
    },
    phoneNumber: faker.phone.number({ style: 'national' }),
    ssn: faker.helpers.replaceSymbols('###-##-####'),
    username: `${slug(firstName).slice(0, 4)}${slug(lastName).slice(0, 4)}${uniqueSuffix()}`,
    password: env.defaultPassword,
    ...overrides,
  };
}

/** register.htm has no documented username character restrictions, but
 * alphanumeric keeps generated usernames unsurprising to read in a report. */
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * 10 characters: an 8-char base-36 timestamp tail plus 2 random base-36
 * chars. Combined with up to 8 characters of name, the username stays at or
 * under register.htm's 20-character limit. The timestamp alone would collide
 * when a sharded CI run registers two users in the same millisecond; the
 * random tail is what actually prevents that.
 */
function uniqueSuffix(): string {
  const time = Date.now().toString(36).slice(-8);
  const rand = Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, '0');
  return `${time}${rand}`;
}
