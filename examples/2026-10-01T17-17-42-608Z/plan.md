# Test plan: Product Detail Page

Covers viewing a product detail page, adding/removing it from the cart from that page, returning to the inventory listing, and repeated add/remove toggling.

## Positive cases

### TC-01 — Viewing a product's detail page shows its name, description, and price (P0)

**Preconditions:**
- Logged in as standard_user
- On the inventory page

**Steps:**
1. Click a product's view-details link
2. Read the name, description, and price on the detail page

**Expected:** The detail page's name and price exactly match the product clicked, and a Back to products button is visible.

### TC-02 — Adding to cart from the detail page updates the button and badge (P0)

**Preconditions:**
- On a product detail page
- Cart is empty

**Steps:**
1. Click Add to cart

**Expected:** The button changes to Remove and the cart badge shows "1".

### TC-03 — Removing from the detail page reverts the button and clears the badge (P1)

**Preconditions:**
- On a product detail page
- The product was just added to the cart

**Steps:**
1. Click Remove

**Expected:** The button reverts to Add to cart and the cart badge is gone.

### TC-04 — Back to products returns to the full inventory listing (P1)

**Preconditions:**
- On a product detail page

**Steps:**
1. Click Back to products

**Expected:** The inventory page is shown with all 6 products listed.

## Boundary cases

### TC-05 — The add/remove toggle is consistent across repeated use (P2)

**Preconditions:**
- On a product detail page
- Cart is empty

**Steps:**
1. Click Add to cart
2. Click Remove
3. Click Add to cart again

**Expected:** After the second Add to cart, the button shows Remove and the badge shows "1" — the same end state as a single add, with no drift from the repeated cycle.
