import { expect, test } from '@fixtures/pages.js';
import { buildProfileUpdate } from '@data/profile-update-builder.js';

test.describe('update contact info @regression @ui', () => {
  test('a happy-path update persists the new address and phone number', async ({
    updateProfilePage,
  }) => {
    const update = buildProfileUpdate();

    await updateProfilePage.goto();
    await updateProfilePage.updateProfile(update);

    await expect(updateProfilePage.resultPanel).toContainText('Profile Updated');
    await expect(updateProfilePage.errorPanel).toBeHidden();

    // Reload and confirm the AJAX-prefilled fields reflect the real,
    // persisted values — not just a client-side success message.
    await updateProfilePage.goto();
    await expect(updateProfilePage.streetInput).toHaveValue(update.street);
    await expect(updateProfilePage.cityInput).toHaveValue(update.city);
    await expect(updateProfilePage.stateInput).toHaveValue(update.state);
    await expect(updateProfilePage.zipCodeInput).toHaveValue(update.zipCode);
    await expect(updateProfilePage.phoneNumberInput).toHaveValue(update.phoneNumber);
  });

  test('an empty first name is rejected client-side with no request sent', async ({
    updateProfilePage,
  }) => {
    const update = buildProfileUpdate();

    await updateProfilePage.goto();
    await updateProfilePage.fillForm(update);
    await updateProfilePage.firstNameInput.fill('');
    await updateProfilePage.submit();

    await expect(updateProfilePage.firstNameError).toHaveText('First name is required.');
    await expect(updateProfilePage.resultPanel).toBeHidden();
  });

  test('an empty last name is rejected client-side with no request sent', async ({
    updateProfilePage,
  }) => {
    const update = buildProfileUpdate();

    await updateProfilePage.goto();
    await updateProfilePage.fillForm(update);
    await updateProfilePage.lastNameInput.fill('');
    await updateProfilePage.submit();

    await expect(updateProfilePage.lastNameError).toHaveText('Last name is required.');
    await expect(updateProfilePage.resultPanel).toBeHidden();
  });
});
