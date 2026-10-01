/**
 * Faker-backed builder for the checkout step-one form. With no registration
 * flow and no backend to validate against, this is the only generated-data
 * need left in the suite — the form's own validation only checks presence
 * (confirmed live: an arbitrary first/last name and postal code all sail
 * through), so the builder does not try to manufacture field-format edge
 * cases.
 */
import { faker } from '@faker-js/faker';

export interface CheckoutInfo {
  firstName: string;
  lastName: string;
  postalCode: string;
}

export function buildCheckoutInfo(overrides: Partial<CheckoutInfo> = {}): CheckoutInfo {
  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    postalCode: faker.location.zipCode('#####'),
    ...overrides,
  };
}
