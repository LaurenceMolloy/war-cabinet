import { test, expect } from '@playwright/test';

/**
 * TEST SPECIFICATION: Batch Add (No Expiry User Oversight)
 * --------------------------------------------------------
 * SCOPE: Inventory Management (Logistical Triage & User Oversight)
 * 
 * METADATA:
 * Scenario: No Expiry Set — Warning Modal Resolution
 * Entity: Batch
 * Foundation: foundation_basic_grid_with_types
 * Last Amended: 2026-05-04
 * App Version: 1.0.0
 * Schema Version: 109
 * 
 * INTENT: Verify that the system correctly intercepts a save attempt where 
 * no expiry date has been explicitly set, presents an "EXPIRY NOT SET" warning
 * modal, and correctly handles both resolution paths:
 *   Path A — User corrects the date (SET EXPIRY DATE → picker opens → re-save)
 *   Path B — User confirms the oversight (SAVE ANYWAY → batch saves this month)
 * 
 * TACTICAL VERIFICATIONS:
 * 1. [OVERSIGHT_INTERCEPTION] Warning modal fires when expiry is untouched.
 * 2. [PATH_A_CORRECTION] SET EXPIRY DATE opens the month picker correctly.
 * 3. [PATH_B_GUARD] Warning modal fires a second time if expiry still untouched.
 * 4. [PATH_B_COMMIT] SAVE ANYWAY saves the batch expiring this month.
 * 5. [ENTITY_ISOLATION] Exactly one batch exists after the flow completes.
 */

test.use({
  viewport: { height: 800, width: 360 }
});

test('Tactical Logistics: No Expiry Oversight Flow', async ({ page }) => {

  await test.step('STEP 1: Environment Initialization & Seeding', async () => {
    await page.goto('http://localhost:8081/?setup=foundation_basic_grid_with_types');

    await page.waitForURL('http://localhost:8081/**');
    await page.waitForLoadState('networkidle');

    const seedError = await page.evaluate(() => localStorage.getItem('E2E_SEED_ERROR'));
    expect(seedError, 'Database Seeding Integrity Check').toBeNull();
  });

  await test.step('STEP 2: Attempt Save Without Expiry', async () => {
    await page.getByTestId('category-card-test-category-1').click();

    // Open batch add without touching expiry date at all
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();

    // Scroll to bottom and click SAVE without setting expiry
    await page.getByTestId('save-stock-btn').scrollIntoViewIfNeeded();
    await page.getByTestId('save-stock-btn').click();

    // OVERSIGHT INTERCEPTION: The expiry warning modal must appear
    await expect(page.getByTestId('expiry-warning-set-date-btn')).toBeVisible();
    await expect(page.getByTestId('expiry-warning-save-anyway-btn')).toBeVisible();
  });

  await test.step('STEP 3: Path A — Correct the Date', async () => {
    // Click SET EXPIRY DATE — should close the modal and open the month picker
    await page.getByTestId('expiry-warning-set-date-btn').click();

    // Allow modal close animation and scroll to complete
    await page.waitForTimeout(400);

    // The current month chip should be visible and highlighted in the month picker
    const currentDate = new Date();
    const currentMonthOption = page.getByTestId(`expiry-month-option-${currentDate.getMonth() + 1}`);
    await expect(currentMonthOption).toBeVisible();

    // Click save again — we STILL haven't explicitly selected a month,
    // so the warning modal should fire a second time
    await page.getByTestId('save-stock-btn').scrollIntoViewIfNeeded();
    await page.getByTestId('save-stock-btn').click();

    // GUARD: Warning modal fires again
    await expect(page.getByTestId('expiry-warning-set-date-btn')).toBeVisible();
    await expect(page.getByTestId('expiry-warning-save-anyway-btn')).toBeVisible();
  });

  await test.step('STEP 4: Path B — Save Anyway', async () => {
    // Click SAVE ANYWAY — batch should be committed expiring this month
    await page.getByTestId('expiry-warning-save-anyway-btn').click();

    // ENTITY_ISOLATION: Exactly one batch row in the inventory
    const rowCount = page.getByTestId(/test-category-1-test-item-1-batch-\d+-row/).filter({ visible: true });
    await expect(rowCount).toHaveCount(1);

    // EXPIRY_DEFAULT: Verify it shows "this month"
    // The row ID is dynamic, so we use a partial testID matcher
    const urgencyText = page.getByTestId(/batch-expiry-urgency-test-item-1-\d+/).filter({ visible: true });
    await expect(urgencyText).toContainText('this month');

    // QUANTITY: Default quantity of 1
    const batchQty = page.getByTestId(/test-category-1-test-item-1-batch-\d+-qty/).filter({ visible: true });
    await expect(batchQty).toContainText('1');
  });

});
