import { test, expect } from '@playwright/test';

/**
 * TEST SPECIFICATION: Batch Aggregation (Silent/Automatic Merge)
 * --------------------------------------------------------------
 * SCOPE: Inventory Management (Aggregation Logic)
 * 
 * METADATA:
 * Scenario: Silent/Automatic Merge (Aggregation)
 * Entity: Batch
 * Foundation: foundation_basic_grid_with_types
 * Last Amended: 2026-05-02
 * App Version: 1.0.0
 * Schema Version: 109
 * 
 * INTENT: Verify that adding an identical batch correctly aggregates its quantity 
 * into the existing record without user intervention (Silent/Automatic Merge).
 * 
 * TACTICAL VERIFICATIONS:
 * 1. [QUANTITY_AGGREGATION] Correct aggregation of quantities (e.g. 1 + 2 = 3).
 * 2. [UNIQUE_BATCH] Unique entity persistence (No duplicate entries created).
 */

test.use({
  viewport: {
    height: 800,
    width: 360
  }
});

test('Tactical Logistics: New Batch Merge Flow', async ({ page }) => {

  await test.step('STEP 1: Environment Initialization & Seeding', async () => {
    await page.goto('http://localhost:8081/?setup=foundation_basic_grid_with_types');
    
    // Wait for the app to perform the setup and auto-refresh back to the clean URL
    await page.waitForURL('http://localhost:8081/**');
    await page.waitForLoadState('networkidle');

    const seedError = await page.evaluate(() => localStorage.getItem('E2E_SEED_ERROR'));
    expect(seedError, 'Database Seeding Integrity Check').toBeNull();
  });

  await test.step('STEP 2: Add and Merge Batches', async () => {
    await page.getByTestId('category-card-test-category-1').click();

    // First Batch
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-1').click();
    await page.getByTestId('save-stock-btn').click();

    // Second Batch (should now merge silently)
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    // Set quantity to 2 to prove aggregation maths (1 + 2 = 3)
    await page.getByTestId('qty-input').fill('2');
    
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-1').click();
    await page.getByTestId('save-stock-btn').click();

    // Assert Quantity Aggregation: The quantity should be 3 (1 initial + 2 added)
    // This serves as our "Guard": Playwright will retry until the new value arrives.
    const batchQty = page.getByTestId('test-category-1-test-item-1-batch-1-qty').filter({ visible: true });
    await expect(batchQty).toContainText('3');

    // Assert Unique Entity: Now that the data has settled, verify exactly one entity exists
    const batchRow = page.getByTestId('test-category-1-test-item-1-batch-1-row').filter({ visible: true });
    await expect(batchRow).toHaveCount(1);
  });

});