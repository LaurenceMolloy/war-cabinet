import { test, expect } from '@playwright/test';

/**
 * TEST SPECIFICATION: Initial Brand Suggestions
 * ---------------------------------------------
 * SCOPE: Inventory Management (Batch Addition - Suggestions)
 * 
 * METADATA:
 * Scenario: Last Logged & Most Frequent
 * Entity: Batch / Brand
 * Foundation: foundation_basic_grid_with_types
 * Last Amended: 2026-05-04
 * 
 * INTENT: Verify that the system correctly calculates and displays "Last Logged" 
 * and "Most Frequent" supplier suggestions based on actual physical unit volume,
 * and handles ties and shifting dominance properly.
 */

test.use({
  viewport: {
    height: 800,
    width: 360
  }
});

test('Tactical Logistics: Brand Suggestion Intelligence', async ({ page }) => {

  await test.step('STEP 1: Initialization', async () => {
    await page.goto('http://localhost:8081/?setup=foundation_basic_grid_with_types');
    await page.waitForURL('http://localhost:8081/**');
    await page.waitForLoadState('networkidle');
  });

  await test.step('STEP 2: First Batch (Heinz) - No suggestions exist', async () => {
    await page.getByTestId('category-card-test-category-1').click();
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    // Assert no suggestions
    await expect(page.getByTestId('brand-suggestion-combined')).toBeHidden();
    await expect(page.getByTestId('brand-suggestion-last-logged')).toBeHidden();
    await expect(page.getByTestId('brand-suggestion-most-frequent')).toBeHidden();

    // Enter Heinz
    await page.getByTestId('supplier-input').fill('heinz');
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-1').click();
    await page.getByTestId('save-stock-btn').click();
  });

  await test.step('STEP 3: Second Batch (Heinz) - Combined Suggestion', async () => {
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    // Heinz is Last Logged and Most Frequent
    const combinedChip = page.getByTestId('brand-suggestion-combined');
    await expect(combinedChip).toBeVisible();
    await expect(combinedChip).toContainText('HEINZ');

    // Click it to auto-fill
    await combinedChip.click();
    await expect(page.getByTestId('supplier-input')).toHaveValue('heinz');

    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-2').click();
    await page.getByTestId('save-stock-btn').click();
  });

  await test.step('STEP 4: Third Batch (Tesco) - Heinz still reigns', async () => {
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    // Heinz is STILL Last Logged and Most Frequent
    const combinedChip = page.getByTestId('brand-suggestion-combined');
    await expect(combinedChip).toBeVisible();
    await expect(combinedChip).toContainText('HEINZ');

    // Manually enter Tesco this time
    await page.getByTestId('supplier-input').fill('tesco');
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-3').click();
    await page.getByTestId('save-stock-btn').click();
  });

  await test.step('STEP 5: Fourth Batch - Split Suggestions', async () => {
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    // Now Tesco is Last Logged, but Heinz is Most Frequent (2 vs 1)
    await expect(page.getByTestId('brand-suggestion-combined')).toBeHidden();
    
    const lastLoggedChip = page.getByTestId('brand-suggestion-last-logged');
    await expect(lastLoggedChip).toBeVisible();
    await expect(lastLoggedChip).toContainText('TESCO');

    const mostFreqChip = page.getByTestId('brand-suggestion-most-frequent');
    await expect(mostFreqChip).toBeVisible();
    await expect(mostFreqChip).toContainText('HEINZ');

    // Add Tesco again (using the chip)
    await lastLoggedChip.click();
    await expect(page.getByTestId('supplier-input')).toHaveValue('tesco');
    
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-4').click();
    await page.getByTestId('save-stock-btn').click();
  });

  await test.step('STEP 6: Fifth Batch - Tesco takes the crown', async () => {
    // Add one more Tesco so it overtly beats Heinz (3 vs 2)
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    // Right now it's 2 vs 2. Let's just enter Tesco again.
    await page.getByTestId('supplier-input').fill('tesco');
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-5').click();
    await page.getByTestId('save-stock-btn').click();

    // Now open for the 6th batch to verify Tesco is king
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();

    const combinedChip = page.getByTestId('brand-suggestion-combined');
    await expect(combinedChip).toBeVisible();
    await expect(combinedChip).toContainText('TESCO');

    await page.getByTestId('cancel-btn').click();
  });

});