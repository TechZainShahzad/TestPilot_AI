# Test plan: Update Contact Info

Covers the happy-path profile update (with persistence verified via reload) and the two client-side required-field validations the form actually enforces (First Name, Last Name). The form only validates First/Last Name, Address, City, State, and Zip Code client-side; Phone Number has no validation span in the DOM, so no case asserts a phone validation message.

## Positive cases

### TC-01 — A happy-path update persists the new address and phone number (P0)

**Preconditions:**
- Customer is logged in

**Steps:**
1. Navigate to Update Profile
2. Fill every field with new Faker-generated values
3. Click 'Update Profile'
4. Reload the page

**Expected:** The success panel is shown, and every field reflects the new values after reload.

## Negative cases

### TC-02 — An empty First Name is rejected client-side (P1)

**Preconditions:**
- Customer is logged in

**Steps:**
1. Navigate to Update Profile
2. Clear First Name, fill everything else
3. Click 'Update Profile'

**Expected:** "First name is required." appears inline; the success panel never shows, meaning no request was sent.

### TC-03 — An empty Last Name is rejected client-side (P1)

**Preconditions:**
- Customer is logged in

**Steps:**
1. Navigate to Update Profile
2. Clear Last Name, fill everything else
3. Click 'Update Profile'

**Expected:** "Last name is required." appears inline; the success panel never shows, meaning no request was sent.
