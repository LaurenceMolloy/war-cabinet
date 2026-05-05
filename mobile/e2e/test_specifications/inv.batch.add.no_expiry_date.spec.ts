import { test, expect } from '@playwright/test';

/**
 * TEST SPECIFICATION: No Expiry Date Fallback
 * -------------------------------------------
 * SCOPE: Inventory Management (Batch Addition - Expiry)
 * 
 * METADATA:
 * Scenario: Explicit clearing of Expiry Date via 'No Date Mark'
 * Entity: Batch / Expiry
 * Foundation: foundation_basic_grid_with_types
 * Last Amended: 2026-05-04
 * 
 * INTENT: Verify that clicking "No Date Mark" cleanly wipes any entered 
 * expiry date, updates the visual MM/YYYY display to reflect the blank state,
 * and successfully saves the batch with an "EXPIRY: N/A" indicator in the 
 * inventory feed.
 */

test.use({
  viewport: {
    height: 800,
    width: 360
  }
});

test('Tactical Logistics: No Expiry Date Fallback', async ({ page }) => {

  await test.step('STEP 1: Initialization', async () => {
    await page.goto('http://localhost:8081/?setup=foundation_basic_grid_with_types');
    await page.waitForURL('http://localhost:8081/**');
    await page.waitForLoadState('networkidle');
  });

  await test.step('STEP 2: Expand Category & Set Initial Date', async () => {
    // Open the first item to add a batch
    await page.getByTestId('category-card-test-category-1').click();
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    // Set a date so the "NO DATE MARK" button appears
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-1').click();

    // Verify visual display shows 01 / YYYY
    await expect(page.getByTestId('visual-expiry-month')).toHaveText('01');
  });

  await test.step('STEP 3: Trigger "No Date Mark" Clear', async () => {
    // Click the clear button
    await page.getByTestId('no-date-mark-btn').click();

    // Verify the visual display resets to MM / YYYY
    await expect(page.getByTestId('visual-expiry-month')).toHaveText('MM');
    await expect(page.getByTestId('visual-expiry-year')).toHaveText('YYYY');
  });

  await test.step('STEP 4: Save & Verify Inventory Feed', async () => {
    // Save the batch without a date
    await page.getByTestId('save-stock-btn').click();

    // The batch should be given ID 1 since it's the first in this foundation
    // Verify the batch displays "EXPIRY: N/A"
    const expiryNaBadge = page.getByTestId('batch-expiry-na-test-item-1-1');
    await expect(expiryNaBadge).toBeVisible();
    await expect(expiryNaBadge).toHaveText('EXPIRY: N/A');
  });

});
