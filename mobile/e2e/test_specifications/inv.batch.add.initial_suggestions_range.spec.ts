import { test, expect } from '@playwright/test';

/**
 * TEST SPECIFICATION: Initial Product Range Suggestions
 * -----------------------------------------------------
 * SCOPE: Inventory Management (Batch Addition - Suggestions)
 * 
 * METADATA:
 * Scenario: Last Logged & Most Frequent
 * Entity: Batch / Product Range
 * Foundation: foundation_basic_grid_with_types
 * Last Amended: 2026-05-04
 * 
 * INTENT: Verify that the system correctly calculates and displays "Last Logged" 
 * and "Most Frequent" product range suggestions based on actual physical unit volume,
 * and handles ties and shifting dominance properly.
 */

test.use({
  viewport: {
    height: 800,
    width: 360
  }
});

test('Tactical Logistics: Product Range Suggestion Intelligence', async ({ page }) => {

  await test.step('STEP 1: Initialization', async () => {
    await page.goto('http://localhost:8081/?setup=foundation_basic_grid_with_types');
    await page.waitForURL('http://localhost:8081/**');
    await page.waitForLoadState('networkidle');
  });

  await test.step('STEP 2: First Batch (Organic) - No suggestions exist', async () => {
    await page.getByTestId('category-card-test-category-1').click();
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    // Assert no suggestions
    await expect(page.getByTestId('range-suggestion-combined')).toBeHidden();
    await expect(page.getByTestId('range-suggestion-last-logged')).toBeHidden();
    await expect(page.getByTestId('range-suggestion-most-frequent')).toBeHidden();

    // Enter Organic
    await page.getByTestId('product-range-input').fill('organic');
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-1').click();
    await page.getByTestId('save-stock-btn').click();
  });

  await test.step('STEP 3: Second Batch (Organic) - Combined Suggestion', async () => {
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    // Organic is Last Logged and Most Frequent
    const combinedChip = page.getByTestId('range-suggestion-combined');
    await expect(combinedChip).toBeVisible();
    await expect(combinedChip).toContainText('ORGANIC');

    // Click it to auto-fill
    await combinedChip.click();
    await expect(page.getByTestId('product-range-input')).toHaveValue('organic');

    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-2').click();
    await page.getByTestId('save-stock-btn').click();
  });

  await test.step('STEP 4: Third Batch (Value) - Organic still reigns', async () => {
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    // Organic is STILL Last Logged and Most Frequent
    const combinedChip = page.getByTestId('range-suggestion-combined');
    await expect(combinedChip).toBeVisible();
    await expect(combinedChip).toContainText('ORGANIC');

    // Manually enter Value this time
    await page.getByTestId('product-range-input').fill('value');
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-3').click();
    await page.getByTestId('save-stock-btn').click();
  });

  await test.step('STEP 5: Fourth Batch - Split Suggestions', async () => {
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    // Now Value is Last Logged, but Organic is Most Frequent (2 vs 1)
    await expect(page.getByTestId('range-suggestion-combined')).toBeHidden();
    
    const lastLoggedChip = page.getByTestId('range-suggestion-last-logged');
    await expect(lastLoggedChip).toBeVisible();
    await expect(lastLoggedChip).toContainText('VALUE');

    const mostFreqChip = page.getByTestId('range-suggestion-most-frequent');
    await expect(mostFreqChip).toBeVisible();
    await expect(mostFreqChip).toContainText('ORGANIC');

    // Add Value again (using the chip)
    await lastLoggedChip.click();
    await expect(page.getByTestId('product-range-input')).toHaveValue('value');
    
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-4').click();
    await page.getByTestId('save-stock-btn').click();
  });

  await test.step('STEP 6: Fifth Batch - Value takes the crown', async () => {
    // Add one more Value so it overtly beats Organic (3 vs 2)
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    // Right now it's 2 vs 2. Let's just enter Value again.
    await page.getByTestId('product-range-input').fill('value');
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-5').click();
    await page.getByTestId('save-stock-btn').click();

    // Now open for the 6th batch to verify Value is king
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();

    const combinedChip = page.getByTestId('range-suggestion-combined');
    await expect(combinedChip).toBeVisible();
    await expect(combinedChip).toContainText('VALUE');

    await page.getByTestId('cancel-btn').click();
  });

});
