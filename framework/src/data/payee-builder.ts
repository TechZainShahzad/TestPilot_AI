/** Faker-backed builder for Bill Pay payee data. */
import { faker } from '@faker-js/faker';

import type { Payee } from '../api/types.js';

export function buildPayee(overrides: Partial<Payee> = {}): Payee {
  return {
    name: faker.company.name(),
    address: {
      street: faker.location.streetAddress(),
      city: faker.location.city(),
      state: faker.location.state({ abbreviated: true }),
      zipCode: faker.location.zipCode('#####'),
      ...overrides.address,
    },
    phoneNumber: faker.phone.number({ style: 'national' }),
    accountNumber: faker.finance.accountNumber(9),
    ...overrides,
  };
}
