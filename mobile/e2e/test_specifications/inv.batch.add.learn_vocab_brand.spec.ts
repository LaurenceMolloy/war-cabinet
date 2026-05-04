import { test, expect } from '@playwright/test';

/**
 * TEST SPECIFICATION: Batch Add (Vocabulary Learning & Recall)
 * --------------------------------------------------------------
 * SCOPE: Inventory Management (Data Governance & Taxonomy)
 * 
 * METADATA:
 * Scenario: Vocabulary Learning and Auto-Suggestion
 * Entity: Batch
 * Foundation: foundation_basic_grid_with_types
 * Last Amended: 2026-05-03
 * App Version: 1.0.0
 * Schema Version: 109
 * 
 * INTENT: Verify that the system successfully "learns" new vocabulary entered 
 * by the user, immediately serves it as a type-ahead suggestion for future batches,
 * and successfully applies it as a near-miss alignment candidate.
 * 
 * TACTICAL VERIFICATIONS:
 * 1. [VOCABULARY_LEARNING] System stores novel inputs as valid vocabulary.
 * 2. [VOCABULARY_SUGGESTION] System actively suggests learned vocabulary.
 * 3. [FUZZY_ALIGNMENT] System successfully uses learned vocabulary to resolve near-misses.
 */

test.use({
  viewport: {
    height: 800,
    width: 360
  }
});

test('Tactical Logistics: Vocabulary Learning Flow', async ({ page }) => {

  await test.step('STEP 1: Environment Initialization & Seeding', async () => {
    await page.goto('http://localhost:8081/?setup=foundation_basic_grid_with_types');
    
    await page.waitForURL('http://localhost:8081/**');
    await page.waitForLoadState('networkidle');

    const seedError = await page.evaluate(() => localStorage.getItem('E2E_SEED_ERROR'));
    expect(seedError, 'Database Seeding Integrity Check').toBeNull();
  });

  await test.step('STEP 2: Introduce Novel Vocabulary', async () => {
    await page.getByTestId('category-card-test-category-1').click();

    // First Batch
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();

    // PRE-LEARNING CHECK: Prove the suggestion does NOT exist before the word is ever saved
    await page.getByTestId('supplier-input').fill('XENO');
    await expect(page.getByTestId('supplier-suggestion-xenomorph')).toHaveCount(0);

    // Now complete and save the novel vocabulary
    await page.getByTestId('supplier-input').fill('XENOMORPH');
    
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-1').click();
    await page.getByTestId('save-stock-btn').click();

    // Verify it appeared in the list with the new brand
    // NOTE: this is NOT a NEAR MISS - nothing in the vocabulary is close enough to matching
    const batchSupplier = page.getByTestId('test-category-1-test-item-1-batch-1-supplier').filter({ visible: true });
    await expect(batchSupplier).toContainText('XENOMORPH');
  });

  await test.step('STEP 3: Recall Vocabulary and Align Typo', async () => {
    // Second Batch
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();
    
    // Type partial word
    await page.getByTestId('supplier-input').fill('XENO');
    
    // Verify the system suggests the learned vocabulary via the type-ahead dropdown
    await expect(page.getByTestId('supplier-suggestion-xenomorph')).toBeVisible();

    // Complete the field with a deliberate typo
    await page.getByTestId('supplier-input').fill('XENOMMORPH');
    
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-1').click();
    await page.getByTestId('save-stock-btn').click();

    // The Near Miss Modal should appear, offering our custom learned vocabulary
    await expect(page.getByText('NEAR MISS DETECTED', { exact: false })).toBeVisible();
    
    // Click Align
    await page.getByText('ALIGN TO: XENOMORPH', { exact: false }).click();

    // Assert: There should be EXACTLY ONE batch with 2 units (Silent Merge triggered after alignment)
    const rowCount = page.getByTestId(/test-category-1-test-item-1-batch-\d+-row/).filter({ visible: true });
    await expect(rowCount).toHaveCount(1);

    const batchQty = page.getByTestId('test-category-1-test-item-1-batch-1-qty').filter({ visible: true });
    await expect(batchQty).toContainText('2');

    const batchSupplier = page.getByTestId('test-category-1-test-item-1-batch-1-supplier').filter({ visible: true });
    await expect(batchSupplier).toContainText('XENOMORPH');
  });

});
