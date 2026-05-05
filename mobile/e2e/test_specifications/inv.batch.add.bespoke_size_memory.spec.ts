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
 * Last Amended: 2026-05-04
 * 
 * INTENT: Verify that the app remembers up to 3 non-standard user-entered sizes.
 * These bespoke sizes should be correctly interleaved into the standard size selection
 * chips (ordered by numeric size), and the oldest memory should be pruned when a 4th 
 * bespoke size is introduced.
 * 
 * Also verifies that non-standard sizes create distinct, unmerged batches in the inventory.
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
    await page.getByTestId('category-card-test-category-1').click();
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    // Baseline size check (Standard weight chips)
    const sizeLabels = page.locator('[data-testid^="size-label-"]');
    await expect(sizeLabels).toHaveText(['50g', '100g', '250g', '500g', '1kg']);
    
    // Check no custom sizes yet
    const customChips = page.locator('[data-testid$="-custom"]');
    await expect(customChips).toHaveCount(0);

    // Wait for DB to populate the default size
    await expect(page.getByTestId('size-input')).toHaveValue('100');

    // Enter 75 as custom size
    await page.getByTestId('size-input').fill('75');
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-1').click();
    await page.getByTestId('save-stock-btn').click();

    // Verify 1 batch in inventory
    const qtyBadge1 = page.getByTestId('test-category-1-test-item-1-batch-1-qty');
    const sizeBadge1 = page.getByTestId('test-category-1-test-item-1-batch-1-size');
    await expect(qtyBadge1).toHaveText('1');
    await expect(sizeBadge1).toHaveText('75g');
  });

  await test.step('STEP 3: Second Batch (200g) - Interleaving 75g', async () => {
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    // Verify 75g is cleanly interleaved between 50g and 100g
    const sizeLabels = page.locator('[data-testid^="size-label-"]');
    await expect(sizeLabels).toHaveText(['50g', '75g', '100g', '250g', '500g', '1kg']);

    // Verify 75g is marked custom
    const customChips = page.locator('[data-testid$="-custom"]');
    await expect(customChips).toHaveCount(1);
    await expect(customChips).toHaveText(['75g']);

    // Wait for DB to populate the default size
    await expect(page.getByTestId('size-input')).toHaveValue('100');

    // Enter 200 as custom size, tagged with unique Batch Intel for Step 8 targeting
    await page.getByTestId('size-input').fill('200');
    await page.getByTestId('batch-intel-input').fill('TO BE DELETED');
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-2').click();
    await page.getByTestId('save-stock-btn').click();

    // Verify 2 separate batches in inventory
    const qtyBadge2 = page.getByTestId('test-category-1-test-item-1-batch-2-qty');
    const sizeBadge2 = page.getByTestId('test-category-1-test-item-1-batch-2-size');
    await expect(qtyBadge2).toHaveText('1');
    await expect(sizeBadge2).toHaveText('200g');
  });

  await test.step('STEP 4: Third Batch (400g) - Interleaving 75g & 200g', async () => {
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    // Verify 200g is added to memory and cleanly interleaved
    const sizeLabels = page.locator('[data-testid^="size-label-"]');
    await expect(sizeLabels).toHaveText(['50g', '75g', '100g', '200g', '250g', '500g', '1kg']);

    const customChips = page.locator('[data-testid$="-custom"]');
    await expect(customChips).toHaveCount(2);
    // Custom chips will be ordered numerically too because they are interleaved
    await expect(customChips).toHaveText(['75g', '200g']);

    // Wait for DB to populate the default size
    await expect(page.getByTestId('size-input')).toHaveValue('100');

    // Enter 400 as custom size
    await page.getByTestId('size-input').fill('400');
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-3').click();
    await page.getByTestId('save-stock-btn').click();

    // Verify 3 separate batches in inventory
    const qtyBadge3 = page.getByTestId('test-category-1-test-item-1-batch-3-qty');
    const sizeBadge3 = page.getByTestId('test-category-1-test-item-1-batch-3-size');
    await expect(qtyBadge3).toHaveText('1');
    await expect(sizeBadge3).toHaveText('400g');
  });

  await test.step('STEP 5: Fourth Batch (800g) - Memory Full, 75g Dropped', async () => {
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    // Verify memory contains 3 custom chips properly interleaved
    const sizeLabels = page.locator('[data-testid^="size-label-"]');
    await expect(sizeLabels).toHaveText(['50g', '75g', '100g', '200g', '250g', '400g', '500g', '1kg']);

    const customChips = page.locator('[data-testid$="-custom"]');
    await expect(customChips).toHaveCount(3);
    await expect(customChips).toHaveText(['75g', '200g', '400g']);

    // Wait for DB to populate the default size
    await expect(page.getByTestId('size-input')).toHaveValue('100');

    // Enter 800 as custom size
    await page.getByTestId('size-input').fill('800');
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-4').click();
    await page.getByTestId('save-stock-btn').click();

    // Verify 4 separate batches in inventory
    const qtyBadge4 = page.getByTestId('test-category-1-test-item-1-batch-4-qty');
    const sizeBadge4 = page.getByTestId('test-category-1-test-item-1-batch-4-size');
    await expect(qtyBadge4).toHaveText('1');
    await expect(sizeBadge4).toHaveText('800g');
  });

  await test.step('STEP 6: Memory Pruning Verification', async () => {
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    // Verify 75g was pruned (oldest). 200g, 400g, and 800g remain and are interleaved.
    const sizeLabels = page.locator('[data-testid^="size-label-"]');
    await expect(sizeLabels).toHaveText(['50g', '100g', '200g', '250g', '400g', '500g', '800g', '1kg']);

    const customChips = page.locator('[data-testid$="-custom"]');
    await expect(customChips).toHaveCount(3);
    await expect(customChips).toHaveText(['200g', '400g', '800g']);

    await page.getByTestId('cancel-btn').click();
  });

  await test.step('STEP 7: Standard Size Does Not Consume Custom Memory Slot', async () => {
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();

    // Wait for DB to populate the default size
    await expect(page.getByTestId('size-input')).toHaveValue('100');

    // Select standard size 50g chip
    await page.getByTestId('size-chip-50').click();
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-1').click();
    await page.getByTestId('save-stock-btn').click();

    // Verify the 50g batch was saved correctly
    const sizeBadge5 = page.getByTestId('test-category-1-test-item-1-batch-5-size');
    await expect(sizeBadge5).toHaveText('50g');

    // Re-open - custom memory slots should be unchanged (50g is standard, not bespoke)
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    const customChips = page.locator('[data-testid$="-custom"]');
    await expect(customChips).toHaveCount(3);
    await expect(customChips).toHaveText(['200g', '400g', '800g']);

    await page.getByTestId('cancel-btn').click();
  });

  await test.step('STEP 8: Persistent Memory Decoupling (Batch Deletion)', async () => {
    // RN Web virtualization leaves multiple copies of the row in the DOM.
    // We find all 200g size badges and use the first one to extract the ID.
    const allSizeBadges200g = page.getByTestId(/test-category-1-test-item-1-batch-\d+-size/).filter({ hasText: '200g' });
    const firstSizeBadge200g = allSizeBadges200g.first();
    await expect(firstSizeBadge200g).toBeAttached();

    const testId = await firstSizeBadge200g.getAttribute('data-testid');
    const batchId = testId?.match(/batch-(\d+)-size/)?.[1];
    if (!batchId) throw new Error('Could not determine batch ID for 200g');

    // Click the deduct (minus) button for that specific batch using dispatchEvent.
    await page.getByTestId(`deduct-batch-${batchId}`).first().dispatchEvent('click');

    // Wait for the confirmation modal using the correct title for the row-level delete modal.
    await page.getByText('CONFIRM DELETION').waitFor({ state: 'visible' });
    // Allow the RN Web modal slide-in animation to complete
    await page.waitForTimeout(500);

    // Confirm deletion - use pointer events to reliably trigger RN Web's TouchableOpacity
    const confirmBtn = page.getByTestId('confirm-delete-batch-btn').first();
    await confirmBtn.dispatchEvent('pointerdown');
    await confirmBtn.dispatchEvent('pointerup');

    // Verify all copies of the 200g size badge are gone.
    await expect(allSizeBadges200g).toHaveCount(0);

    // THE CORE ASSERTION: 200g must still appear in smart size chips after deletion.
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    await expect(page.locator('[data-testid$="-custom"]')).toHaveCount(3);
    await expect(page.locator('[data-testid$="-custom"]')).toHaveText(['200g', '400g', '800g']);
    await page.getByTestId('cancel-btn').click();
  });

});
