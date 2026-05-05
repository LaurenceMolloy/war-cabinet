import { test, expect } from '@playwright/test';

/**
 * TEST SPECIFICATION: Bespoke Size Memory
 * ---------------------------------------
 * SCOPE: Inventory Management (Batch Addition - Size Memory)
 * 
 * METADATA:
 * Scenario: Interleaved Custom Size Memory Limit (Max 3)
 * Entity: Batch / Size
 * Foundation: foundation_basic_grid_with_types
 * Last Amended: 2026-05-05
 * 
 * INTENT: Verify that the app remembers up to 3 non-standard user-entered sizes.
 * These bespoke sizes should be correctly interleaved into the standard size selection
 * chips (ordered by numeric size), and the oldest memory should be pruned when a 4th 
 * bespoke size is introduced.
 */

test.use({
  viewport: {
    height: 800,
    width: 360
  }
});

test('Tactical Logistics: Custom Size Memory Interleaving', async ({ page }) => {

  await test.step('STEP 1: Initialization', async () => {
    await page.goto('http://localhost:8081/?setup=foundation_basic_grid_with_types');
    await page.waitForURL('http://localhost:8081/**');
    await page.waitForLoadState('networkidle');
  });

  await test.step('STEP 2: Expand Category & First Batch (75g)', async () => {
    await page.getByTestId('category-card-test-category-1').dispatchEvent('click');
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).dispatchEvent('click');
    
    // Baseline size check (Standard weight chips)
    const sizeLabels = page.locator('[data-testid^="size-label-"]');
    await expect(sizeLabels).toHaveText(['50g', '100g', '250g', '500g', '1kg']);

    // Enter 75 as custom size
    await page.getByTestId('size-input').fill('75');
    await page.getByTestId('expiry-month-trigger').dispatchEvent('click');
    await page.getByTestId('expiry-month-option-1').dispatchEvent('click');
    await page.getByTestId('save-stock-btn').dispatchEvent('click');

    // Verify 1 batch in inventory
    await expect(page.getByTestId('test-category-1-test-item-1-batch-1-size')).toHaveText('75g');
  });

  await test.step('STEP 3: Second Batch (200g)', async () => {
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).dispatchEvent('click');
    
    // Verify 75g is interleaved
    await expect(page.locator('[data-testid^="size-label-"]')).toHaveText(['50g', '75g', '100g', '250g', '500g', '1kg']);

    // Enter 200 as custom size
    await page.getByTestId('size-input').fill('200');
    await page.getByTestId('expiry-month-trigger').dispatchEvent('click');
    await page.getByTestId('expiry-month-option-2').dispatchEvent('click');
    await page.getByTestId('save-stock-btn').dispatchEvent('click');

    // Verify batch in inventory
    await expect(page.getByTestId('test-category-1-test-item-1-batch-2-size')).toHaveText('200g');
  });

  await test.step('STEP 4: Third Batch (400g)', async () => {
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).dispatchEvent('click');
    
    // Verify 200g is added to memory and interleaved
    await expect(page.locator('[data-testid^="size-label-"]')).toHaveText(['50g', '75g', '100g', '200g', '250g', '500g', '1kg']);

    // Enter 400 as custom size
    await page.getByTestId('size-input').fill('400');
    await page.getByTestId('expiry-month-trigger').dispatchEvent('click');
    await page.getByTestId('expiry-month-option-3').dispatchEvent('click');
    await page.getByTestId('save-stock-btn').dispatchEvent('click');

    // Verify batch in inventory
    await expect(page.getByTestId('test-category-1-test-item-1-batch-3-size')).toHaveText('400g');
  });

  await test.step('STEP 5: Fourth Batch (800g) - Memory Full, 75g Dropped', async () => {
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).dispatchEvent('click');
    
    // Verify memory contains 3 custom chips properly interleaved
    await expect(page.locator('[data-testid^="size-label-"]')).toHaveText(['50g', '75g', '100g', '200g', '250g', '400g', '500g', '1kg']);

    // Enter 800 as custom size
    await page.getByTestId('size-input').fill('800');
    await page.getByTestId('expiry-month-trigger').dispatchEvent('click');
    await page.getByTestId('expiry-month-option-4').dispatchEvent('click');
    await page.getByTestId('save-stock-btn').dispatchEvent('click');

    // Verify batch in inventory
    await expect(page.getByTestId('test-category-1-test-item-1-batch-4-size')).toHaveText('800g');
  });

  await test.step('STEP 6: Memory Pruning Verification', async () => {
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).dispatchEvent('click');
    
    // Verify 75g was pruned (oldest). 200g, 400g, and 800g remain.
    await expect(page.locator('[data-testid^="size-label-"]')).toHaveText(['50g', '100g', '200g', '250g', '400g', '500g', '800g', '1kg']);

    await page.getByTestId('cancel-btn').dispatchEvent('click');
  });

  await test.step('STEP 7: Standard Size Memory Bug Verification', async () => {
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).dispatchEvent('click');
    
    // Wait for DB to populate the default size
    await expect(page.getByTestId('size-input')).toHaveValue('100');

    // Select standard size 50g. We use dispatchEvent to ensure the click registers in RN Web.
    await page.getByTestId('size-chip-50').dispatchEvent('click');
    await page.getByTestId('expiry-month-trigger').dispatchEvent('click');
    await page.getByTestId('expiry-month-option-1').dispatchEvent('click');
    await page.getByTestId('save-stock-btn').dispatchEvent('click');

    // Verify batch in inventory
    await expect(page.getByTestId('test-category-1-test-item-1-batch-5-size')).toHaveText('50g');

    // Re-open to check memory - custom slots should NOT have been consumed by the standard 50g click.
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).dispatchEvent('click');
    await expect(page.locator('[data-testid$="-custom"]')).toHaveCount(3);
    await expect(page.locator('[data-testid$="-custom"]')).toHaveText(['200g', '400g', '800g']);

    await page.getByTestId('cancel-btn').dispatchEvent('click');
  });

  await test.step('STEP 8: Persistent Memory Decoupling (Batch Deletion)', async () => {
    // Wait for inventory to settle
    await page.waitForTimeout(1000);

    // SQL-like approach: Scoped locator + Direct Event Dispatch
    const targetRow = page.locator('[data-testid$="-row"]').filter({ hasText: '200g' }).first();
    await targetRow.locator('[data-testid^="deduct-batch-"]').first().dispatchEvent('click');

    // Confirm modal - firing directly to bypass visibility hurdles
    const confirmBtn = page.getByTestId('confirm-delete-batch-btn').filter({ visible: true });
    await confirmBtn.waitFor({ state: 'attached' });
    await confirmBtn.dispatchEvent('click');

    // Verify the batch is removed from inventory.
    await expect(page.locator('[data-testid$="-row"]').filter({ hasText: '200g' })).toHaveCount(0);

    // Re-open the batch add form to verify memory persistence
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).dispatchEvent('click');

    // THE CORE ASSERTION: 200g is STILL in the custom size memory despite its batch being deleted.
    await expect(page.locator('[data-testid$="-custom"]')).toHaveCount(3);
    await expect(page.locator('[data-testid$="-custom"]')).toHaveText(['200g', '400g', '800g']);

    await page.getByTestId('cancel-btn').dispatchEvent('click');
  });

});
