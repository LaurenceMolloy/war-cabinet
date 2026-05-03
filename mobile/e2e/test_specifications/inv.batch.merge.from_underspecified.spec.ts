import { test, expect } from '@playwright/test';

/**
 * TEST SPECIFICATION: Consolidation Carousel (Full Lifecycle)
 * --------------------------------------------------
 * SCOPE: Inventory Management (Logistical Triage)
 * 
 * METADATA:
 * Scenario: Triage Carousel (Strip, Adopt, Isolate)
 * Entity: Batch
 * Foundation: foundation_basic_grid_with_types
 * Last Amended: 2026-05-02
 * App Version: 1.0.0
 * Schema Version: 109
 * 
 * INTENT: Verify that the Consolidation Carousel correctly handles the full spectrum 
 * of triage strategies (Strip, Adopt, Isolate) when metadata drifts occur between compatible batches.
 * 
 * TACTICAL VERIFICATIONS:
 * 1. [UI_INTERACTION] Carousel validation (Next/Prev swipe navigation and Safe Baseline).
 * 2. [STRATEGY_STRIP] Confirms sanitization of metadata down to an underspecified baseline.
 * 3. [STRATEGY_ADOPT] Confirms inheritance of metadata from an overspecified candidate.
 * 4. [STRATEGY_ISOLATE] Confirms rigid separation of distinct entities on Safe Baseline selection.
 * 5. [QUANTITY_AGGREGATION] Ensures quantities accurately compound across all consolidation states.
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

  await test.step('STEP 2: Add Initial Underspecified Batch', async () => {
    await page.getByTestId('category-card-test-category-1').click();

    // First batch: Underspecified (No supplier)
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-1').click();
    await page.getByTestId('save-stock-btn').click();

    // Verify it appeared and has NO brand
    const batchQty = page.getByTestId('test-category-1-test-item-1-batch-1-qty').filter({ visible: true });
    await expect(batchQty).toContainText('1');
    const batchSupplier = page.getByTestId('test-category-1-test-item-1-batch-1-supplier').filter({ visible: true });
    await expect(batchSupplier).toHaveCount(0);
  });

  await test.step('STEP 3: Overspecify and Strip', async () => {
    // Second batch: Overspecified (TESCO), Qty 1
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    await page.getByTestId('supplier-input').fill('TESCO');
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-1').click();
    await page.getByTestId('save-stock-btn').click();

    // Carousel: Swipe to Strip
    await expect(page.getByTestId('merge-reject-btn')).toBeVisible();
    await page.getByTestId('carousel-next-btn').click();
    await page.getByTestId('merge-strip-btn').click();

    // Assert: Qty 2, Brand missing
    const batchQty = page.getByTestId('test-category-1-test-item-1-batch-1-qty').filter({ visible: true });
    await expect(batchQty).toContainText('2');
    const batchSupplier = page.getByTestId('test-category-1-test-item-1-batch-1-supplier').filter({ visible: true });
    await expect(batchSupplier).toHaveCount(0);
  });

  await test.step('STEP 4: Overspecify and Adopt', async () => {
    // Third batch: Overspecified (TESCO), Qty 3
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    await page.getByTestId('qty-input').fill('3');
    await page.getByTestId('supplier-input').fill('TESCO');
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-1').click();
    await page.getByTestId('save-stock-btn').click();

    // Carousel: Swipe to Adopt
    await expect(page.getByTestId('merge-reject-btn')).toBeVisible();
    await page.getByTestId('carousel-next-btn').click();
    await page.getByTestId('merge-adopt-btn').click();

    // Assert: Qty 5, Brand present
    const batchQty = page.getByTestId('test-category-1-test-item-1-batch-1-qty').filter({ visible: true });
    await expect(batchQty).toContainText('5');
    const batchSupplier = page.getByTestId('test-category-1-test-item-1-batch-1-supplier').filter({ visible: true });
    await expect(batchSupplier).toContainText('TESCO');
  });

  await test.step('STEP 5: Underspecify and Isolate', async () => {
    // Fourth batch: Underspecified (No brand), Qty 2
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    await page.getByTestId('qty-input').fill('2');
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-1').click();
    await page.getByTestId('save-stock-btn').click();

    // Carousel: Isolate (Create Separate Entry)
    const isolationBtn = page.getByTestId('merge-reject-btn');
    await expect(isolationBtn).toBeVisible();
    await isolationBtn.click();

    // Assert: Two distinct batches
    const rowCount = page.getByTestId(/test-category-1-test-item-1-batch-\d+-row/).filter({ visible: true });
    await expect(rowCount).toHaveCount(2);

    // Large Batch (5 units, brand present) -> from previous step
    const batch1Qty = page.getByTestId('test-category-1-test-item-1-batch-1-qty').filter({ visible: true });
    await expect(batch1Qty).toContainText('5');
    const batch1Supplier = page.getByTestId('test-category-1-test-item-1-batch-1-supplier').filter({ visible: true });
    await expect(batch1Supplier).toContainText('TESCO');

    // Small Batch (2 units, missing brand) -> the newly isolated one
    const batch2Qty = page.getByTestId('test-category-1-test-item-1-batch-2-qty').filter({ visible: true });
    await expect(batch2Qty).toContainText('2');
    const batch2Supplier = page.getByTestId('test-category-1-test-item-1-batch-2-supplier').filter({ visible: true });
    await expect(batch2Supplier).toHaveCount(0);
  });

});
