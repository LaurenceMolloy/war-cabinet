import { test, expect } from '@playwright/test';

/**
 * TC-testflow: Tag-Team Test — Welcome Flow + Category Creation
 *
 * ORIGIN: Human-recorded via `npx playwright codegen` (Tag-Team MO).
 * Raw recording: scratch/TC-testflow_recorded.ts
 *
 * USER FLOW:
 *   1. Open app as a fresh user (Welcome Modal visible).
 *   2. Page through the 4-step Welcome Modal and begin mission.
 *   3. Attempt to create a new category "TEST CATEGORY".
 *   4. A paywall fires (Cadet tier cannot create beyond the limit).
 *   5. Perform the simulated Sergeant upgrade (as user did during recording).
 *   6. Click CREATE CATEGORY again to complete.
 *   7. Assert category is visible with "MESS HALL ON" and "NO STOCK STORED".
 *
 * HARDENING NOTES:
 *   - Welcome modal is intentionally NOT bypassed — this tests the genuine new-user flow.
 *   - The simulated purchase follows exactly what the user recorded (lines 13-14 of raw).
 *   - After ENLIST, a 1800ms wait is required for the 1500ms simulated purchase delay.
 */

const CAT_NAME = 'TEST CATEGORY';

test.describe('TC-testflow: Welcome Flow + Category Creation', () => {

  test('navigates welcome screens, creates a category, and verifies its state', async ({ page }) => {

    // ── PHASE 1: Launch & Welcome Modal ───────────────────────────────────────
    await page.goto('http://localhost:8081/');

    // Page through the 4-step welcome modal exactly as a new user would
    await page.getByTestId('welcome-next-btn').click();
    await page.getByTestId('welcome-next-btn').click();
    await page.getByTestId('welcome-next-btn').click();
    await page.getByTestId('welcome-dismiss-btn').click();

    // Wait for home screen to settle
    // TC-0.0.1 Assert rank badge is visible
    await expect(page.getByTestId('rank-badge-pill')).toBeVisible();

    // ── PHASE 2: Attempt Category Deployment (paywall fires) ──────────────────
    await page.getByTestId('global-deploy-btn').click();
    await page.getByTestId('deploy-category-btn').click();

    // Fill in the category name
    await page.getByRole('textbox', { name: 'e.g. Spices, Tinned Goods' }).fill(CAT_NAME);

    // First CREATE CATEGORY attempt — triggers paywall for Cadet tier
    await page.getByTestId('create-category-btn').click();

    // Paywall appears: perform simulated Sergeant purchase (as recorded by user)
    // 1. Click the "Upgrade" button on the Feature Lock prompt
    await page.getByTestId('feature-lock-upgrade-btn').click();
    // 2. Click the specific "Buy Sergeant" button on the full Paywall
    await page.getByTestId('paywall-buy-sergeant-btn').click();

    // Wait for the 1500ms simulated purchase delay to complete
    await page.waitForTimeout(2000);

    // Second CREATE CATEGORY attempt — now succeeds with Sergeant rank
    await page.getByTestId('create-category-btn').click();

    // ── PHASE 3: Assertions ───────────────────────────────────────────────────
    // Scope all assertions to the TEST CATEGORY card to avoid strict-mode
    // violations from other categories also showing "MESS HALL ON".
    // TC-0.0.2 Assert newly created category is visible
    const categoryCard = page.getByTestId('category-card-test-category');
    await expect(categoryCard).toBeVisible();

    // Open the card by clicking its title
    await page.getByText(CAT_NAME).click();

    // TC-0.0.3 Assert Mess Hall state is ON (scoped to this card's toggle testID)
    await expect(page.getByTestId('mess-hall-toggle-test-category').getByText('MESS HALL ON')).toBeVisible();

    // TC-0.0.4 Assert the empty state message is visible within the card
    await expect(categoryCard.getByText('NO STOCK STORED')).toBeVisible();
  });

});
