import { test, expect } from '@playwright/test';

/**
 * TEST SPECIFICATION: Batch Add (Range Near Miss Detection)
 * ---------------------------------------------------------
 * SCOPE: Inventory Management (Data Governance & Taxonomy)
 * 
 * METADATA:
 * Scenario: Near Miss Detected (Range Fuzzy Match Resolution)
 * Entity: Batch
 * Foundation: foundation_basic_grid_with_types
 * Last Amended: 2026-05-04
 * App Version: 1.0.0
 * Schema Version: 109
 * 
 * INTENT: Verify that the system correctly identifies typographical variations 
 * of established range vocabulary (e.g. 'TEST RANGR 2' vs 'TEST RANGE 2') and 
 * correctly processes both the 'Align' and 'Intentional Override' user decisions.
 * 
 * NOTE: The Range field has no static starter vocabulary (unlike Brand which has brands.json).
 * 'TEST RANGE 2' is available as vocabulary via the foundation_basic_grid_with_types seeder.
 * Different expiry months are used per step to isolate near-miss behaviour from the
 * consolidation carousel (which is tested separately in inv.batch.merge.triaged.spec.ts).
 * 
 * TACTICAL VERIFICATIONS:
 * 1. [VOCABULARY_ALIGNMENT] System corrects range typos and aligns to existing taxonomy.
 * 2. [VOCABULARY_OVERRIDE] System permits intentional overrides when rejected by user.
 */

test.use({
  viewport: {
    height: 800,
    width: 360
  }
});

test('Tactical Logistics: Range Near Miss Resolution Flow', async ({ page }) => {

  await test.step('STEP 1: Environment Initialization & Seeding', async () => {
    await page.goto('http://localhost:8081/?setup=foundation_basic_grid_with_types');

    await page.waitForURL('http://localhost:8081/**');
    await page.waitForLoadState('networkidle');

    const seedError = await page.evaluate(() => localStorage.getItem('E2E_SEED_ERROR'));
    expect(seedError, 'Database Seeding Integrity Check').toBeNull();
  });

  await test.step('STEP 2: Trigger Range Near Miss and Align', async () => {
    await page.getByTestId('category-card-test-category-1').click();

    // First Batch: type a typo of 'TEST RANGE 2' (present in seeded vocabulary)
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();

    // Allow the component to mount and load vocabulary from SQLite
    await page.waitForTimeout(500);

    await page.getByTestId('product-range-input').fill('TEST RANGR 2');

    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-1').click();
    await page.getByTestId('save-stock-btn').click();

    // The Near Miss Modal should appear
    await expect(page.getByText('NEAR MISS DETECTED', { exact: false })).toBeVisible();

    // Click Align to TEST RANGE 2
    await page.getByText('ALIGN TO: TEST RANGE 2', { exact: false }).click();

    // Verify batch saved with the aligned range
    const batchRange = page.getByTestId('test-category-1-test-item-1-batch-1-range').filter({ visible: true });
    await expect(batchRange).toContainText('TEST RANGE 2');
  });

  await test.step('STEP 3: Trigger Range Near Miss and Override', async () => {
    // Second Batch: same typo, different expiry month to avoid consolidation carousel
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();

    // Allow the component to mount and load vocabulary from SQLite
    await page.waitForTimeout(500);

    await page.getByTestId('product-range-input').fill('TEST RANGR 2');

    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-2').click();
    await page.getByTestId('save-stock-btn').click();

    // The Near Miss Modal should appear again
    await expect(page.getByText('NEAR MISS DETECTED', { exact: false })).toBeVisible();

    // Click No, This is intentional
    await page.getByText('NO, THIS IS INTENTIONAL', { exact: false }).click();

    // Assert: Two distinct batches — one aligned (TEST RANGE 2), one overridden (TEST RANGR 2)
    const rowCount = page.getByTestId(/test-category-1-test-item-1-batch-\d+-row/).filter({ visible: true });
    await expect(rowCount).toHaveCount(2);

    const batch1Range = page.getByTestId('test-category-1-test-item-1-batch-1-range').filter({ visible: true });
    await expect(batch1Range).toContainText('TEST RANGE 2');

    const batch2Range = page.getByTestId('test-category-1-test-item-1-batch-2-range').filter({ visible: true });
    await expect(batch2Range).toContainText('TEST RANGR 2');
  });

});
