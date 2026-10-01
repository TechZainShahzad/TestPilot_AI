/** Faker-backed builder for Update Contact Info form data. */
import { faker } from '@faker-js/faker';

export interface ProfileUpdate {
  firstName: string;
  lastName: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  phoneNumber: string;
}

export function buildProfileUpdate(overrides: Partial<ProfileUpdate> = {}): ProfileUpdate {
  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    street: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.location.state({ abbreviated: true }),
    zipCode: faker.location.zipCode('#####'),
    phoneNumber: faker.phone.number({ style: 'national' }),
    ...overrides,
  };
}
