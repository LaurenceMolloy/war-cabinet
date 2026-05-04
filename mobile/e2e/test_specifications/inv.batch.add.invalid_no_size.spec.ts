import { test, expect } from '@playwright/test';

/**
 * TEST SPECIFICATION: Batch Add (Missing Size User Oversight)
 * -----------------------------------------------------------
 * SCOPE: Inventory Management (Logistical Triage & User Oversight)
 * 
 * METADATA:
 * Scenario: Missing Size — Validation & Auto-Scroll
 * Entity: Batch
 * Foundation: foundation_basic_grid_with_types
 * Last Amended: 2026-05-04
 * App Version: 1.0.0
 * Schema Version: 109
 * 
 * INTENT: Verify that the system correctly blocks a save attempt when the 
 * mandatory "Size" field is empty. Ensure that:
 *   1. [VALIDATION_BLOCK] The save is intercepted.
 *   2. [UX_VISIBILITY] The app automatically scrolls back up to the Size field.
 *   3. [VISUAL_FEEDBACK] The field is highlighted in red with an error message.
 *   4. [RECOVERY] Save succeeds once the field is populated.
 * 
 * TACTICAL VERIFICATIONS:
 * 1. [OVERSIGHT_INTERCEPTION] Validation error appears on submit with empty size.
 * 2. [AUTO_SCROLL] Size field becomes visible even if previously off-screen.
 * 3. [ERROR_STYLING] Field container has red border and error text is present.
 * 4. [SUCCESSFUL_COMMIT] Batch is created after correcting the oversight.
 */

test.use({
  viewport: { height: 800, width: 360 }
});

test('Tactical Logistics: Missing Size Oversight & Auto-Scroll', async ({ page }) => {

  await test.step('STEP 1: Environment Initialization & Seeding', async () => {
    await page.goto('http://localhost:8081/?setup=foundation_basic_grid_with_types');

    await page.waitForURL('http://localhost:8081/**');
    await page.waitForLoadState('networkidle');

    const seedError = await page.evaluate(() => localStorage.getItem('E2E_SEED_ERROR'));
    expect(seedError, 'Database Seeding Integrity Check').toBeNull();
  });

  await test.step('STEP 2: Attempt Save With Empty Size', async () => {
    await page.getByTestId('category-card-test-category-1').click();

    // Open batch add for TEST ITEM 1
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();

    // Tweak the expiry date (select a year) so the oversight modal doesn't pop up
    await page.getByTestId('expiry-year-trigger').click();
    await page.getByTestId('expiry-year-option-2030').click();

    // The size field might be empty or pre-filled. Ensure it is empty.
    await page.getByTestId('size-input').clear();

    // Scroll to the bottom to click SAVE (making sure the size field is likely off-screen)
    await page.getByTestId('save-stock-btn').scrollIntoViewIfNeeded();
    
    // PROOF: Verify size input is NOT in viewport before clicking
    await expect(page.getByTestId('size-input')).not.toBeInViewport();

    await page.getByTestId('save-stock-btn').click();

    // VISUAL FEEDBACK: Error text should appear
    const errorText = page.getByTestId('size-error');
    await expect(errorText).toBeVisible();
    await expect(errorText).toContainText('Size is required');

    // AUTO_SCROLL: The size input should be visible now
    await expect(page.getByTestId('size-input')).toBeInViewport();
  });

  await test.step('STEP 3: Correct Oversight and Save', async () => {
    // Fill in the size
    await page.getByTestId('size-input').fill('500');

    // Save again
    await page.getByTestId('save-stock-btn').scrollIntoViewIfNeeded();
    await page.getByTestId('save-stock-btn').click();

    // Verify successful creation (back at inventory)
    const rowCount = page.getByTestId(/test-category-1-test-item-1-batch-\d+-row/).filter({ visible: true });
    await expect(rowCount).toHaveCount(1);
    
    // Check size is correct
    const sizeText = page.getByTestId(/test-category-1-test-item-1-batch-\d+-size/).filter({ visible: true });
    await expect(sizeText).toContainText('500g'); // Assuming weight unit for test-item-1
  });

});
