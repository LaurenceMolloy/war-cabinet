import { test, expect } from '@playwright/test';

/**
 * TEST SPECIFICATION: Batch Modal Merge (Intel Collision)
 * --------------------------------------------------
 * SCOPE: Inventory Management (Consolidation Logic)
 * 
 * METADATA:
 * Scenario: Modal Merge (Intel Collision)
 * Entity: Batch
 * Foundation: foundation_basic_grid_with_types
 * Last Amended: 2026-05-02
 * App Version: 1.0.0
 * Schema Version: 109
 * 
 * INTENT: Verify that compatible (but not identical) batches trigger the 
 * Consolidation Modal and correctly merge metadata upon user approval.
 * 
 * TACTICAL VERIFICATIONS:
 * 1. [UI_INTERACTION] Merge modal visibility on collision.
 * 2. [METADATA_PERSISTENCE] Primary batch intel preserved after merge.
 * 3. [QUANTITY_AGGREGATION] Total quantities correctly summed.
 */

test.use({
  viewport: {
    height: 800,
    width: 360
  }
});

test('Tactical Logistics: Batch Modal Merge Flow', async ({ page }) => {

  await test.step('STEP 1: Environment Initialization & Seeding', async () => {
    await page.goto('http://localhost:8081/?setup=foundation_basic_grid_with_types');
    
    // Wait for the app to perform the setup and auto-refresh back to the clean URL
    await page.waitForURL('http://localhost:8081/**');
    await page.waitForLoadState('networkidle');

    const seedError = await page.evaluate(() => localStorage.getItem('E2E_SEED_ERROR'));
    expect(seedError, 'Database Seeding Integrity Check').toBeNull();
  });

  await test.step('STEP 2: Add Initial Batch with Metadata', async () => {
    await page.getByTestId('category-card-test-category-1').click();

    // Add first batch with a specific supplier
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    await page.getByTestId('supplier-input').fill('TESCO');
    
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-1').click();
    
    await page.getByTestId('save-stock-btn').click();

    // Verify it appeared in the list
    const batchSupplier = page.getByTestId('test-category-1-test-item-1-batch-1-supplier').filter({ visible: true });
    await expect(batchSupplier).toContainText('TESCO');
  });

  await test.step('STEP 3: Add Compatible Batch & Trigger Modal', async () => {
    // Add second batch for same item, but leave supplier blank (compatible)
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-1').click();
    
    await page.getByTestId('save-stock-btn').click();

    // MODAL CHECK: The app should detect the collision and offer a merge
    const mergeModal = page.getByTestId('merge-confirm-btn');
    await expect(mergeModal).toBeVisible();
    
    await mergeModal.click();

    // Assert Quantity Aggregation: The quantity should be 2
    // This serves as our "Guard": Playwright will retry until the new value arrives.
    const batchQty = page.getByTestId('test-category-1-test-item-1-batch-1-qty').filter({ visible: true });
    await expect(batchQty).toContainText('2');
    
    // Assert Unique Entity: Now that the data has settled, verify exactly one entity exists
    const batchRow = page.getByTestId('test-category-1-test-item-1-batch-1-row').filter({ visible: true });
    await expect(batchRow).toHaveCount(1);
    
    // Verify the metadata (Supplier) was preserved from the existing batch
    const finalSupplier = page.getByTestId('test-category-1-test-item-1-batch-1-supplier').filter({ visible: true });
    await expect(finalSupplier).toContainText('TESCO');
  });

});
