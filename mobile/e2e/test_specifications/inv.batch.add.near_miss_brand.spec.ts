import { test, expect } from '@playwright/test';

/**
 * TEST SPECIFICATION: Batch Add (Near Miss Vocabulary Alignment)
 * --------------------------------------------------------------
 * SCOPE: Inventory Management (Data Governance & Taxonomy)
 * 
 * METADATA:
 * Scenario: Near Miss Detected (Fuzzy Match Resolution)
 * Entity: Batch
 * Foundation: foundation_basic_grid_with_types
 * Last Amended: 2026-05-03
 * App Version: 1.0.0
 * Schema Version: 109
 * 
 * INTENT: Verify that the system correctly identifies typographical variations 
 * of established vocabulary (e.g. 'alde' vs 'Aldi') and correctly processes 
 * both the 'Align' and 'Intentional Override' user decisions.
 * 
 * TACTICAL VERIFICATIONS:
 * 1. [VOCABULARY_ALIGNMENT] System corrects typos and aligns to existing taxonomy.
 * 2. [VOCABULARY_OVERRIDE] System permits intentional overrides when rejected by user.
 */

test.use({
  viewport: {
    height: 800,
    width: 360
  }
});

test('Tactical Logistics: Near Miss Resolution Flow', async ({ page }) => {

  await test.step('STEP 1: Environment Initialization & Seeding', async () => {
    await page.goto('http://localhost:8081/?setup=foundation_basic_grid_with_types');
    
    // Wait for the app to perform the setup and auto-refresh back to the clean URL
    await page.waitForURL('http://localhost:8081/**');
    await page.waitForLoadState('networkidle');

    const seedError = await page.evaluate(() => localStorage.getItem('E2E_SEED_ERROR'));
    expect(seedError, 'Database Seeding Integrity Check').toBeNull();
  });

  await test.step('STEP 2: Trigger Near Miss and Align', async () => {
    await page.getByTestId('category-card-test-category-1').click();

    // First Batch
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    // Enter 'alde' which should fuzzy match 'Aldi' (assuming Aldi exists in foundation)
    await page.getByTestId('supplier-input').fill('alde');
    
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-1').click();
    await page.getByTestId('save-stock-btn').click();

    // The Near Miss Modal should appear
    await expect(page.getByText('NEAR MISS DETECTED', { exact: false })).toBeVisible();
    
    // Click Align to Aldi
    await page.getByText('ALIGN TO: ALDI', { exact: false }).click();

    // Wait for save to complete and modal to close, verify the supplier is now ALDI
    const batchSupplier = page.getByTestId('test-category-1-test-item-1-batch-1-supplier').filter({ visible: true });
    await expect(batchSupplier).toContainText('ALDI');
  });

  await test.step('STEP 3: Trigger Near Miss and Override', async () => {
    // Second Batch
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    // Enter 'alde' again
    await page.getByTestId('supplier-input').fill('alde');
    
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-1').click();
    await page.getByTestId('save-stock-btn').click();

    // The Near Miss Modal should appear again
    await expect(page.getByText('NEAR MISS DETECTED', { exact: false })).toBeVisible();
    
    // Click No, This is intentional
    await page.getByText('NO, THIS IS INTENTIONAL', { exact: false }).click();

    // Assert: There should now be two distinct batches
    const rowCount = page.getByTestId(/test-category-1-test-item-1-batch-\d+-row/).filter({ visible: true });
    await expect(rowCount).toHaveCount(2);

    // Verify first batch is still ALDI
    const batch1Supplier = page.getByTestId('test-category-1-test-item-1-batch-1-supplier').filter({ visible: true });
    await expect(batch1Supplier).toContainText('ALDI');

    // Verify second batch is ALDE
    const batch2Supplier = page.getByTestId('test-category-1-test-item-1-batch-2-supplier').filter({ visible: true });
    await expect(batch2Supplier).toContainText('ALDE');
  });

});
