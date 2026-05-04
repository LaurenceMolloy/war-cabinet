import { test, expect } from '@playwright/test';

/**
 * TEST SPECIFICATION: Batch Add (Range Vocabulary Learning & Recall)
 * ------------------------------------------------------------------
 * SCOPE: Inventory Management (Data Governance & Taxonomy)
 * 
 * METADATA:
 * Scenario: Range Vocabulary Learning and Auto-Suggestion
 * Entity: Batch
 * Foundation: foundation_basic_grid_with_types
 * Last Amended: 2026-05-04
 * App Version: 1.0.0
 * Schema Version: 109
 * 
 * INTENT: Verify that the system successfully "learns" new product range vocabulary 
 * entered by the user, immediately serves it as a type-ahead suggestion for future 
 * batches, and successfully applies it as a near-miss alignment candidate.
 * 
 * NOTE: The Range field has NO starter vocabulary (unlike Brand which has brands.json).
 * This test therefore purely validates the dynamic vocabulary learning pipeline.
 * 
 * TACTICAL VERIFICATIONS:
 * 1. [VOCABULARY_ABSENT] System has no suggestion before the word is ever entered.
 * 2. [VOCABULARY_LEARNING] System stores novel range inputs as valid vocabulary.
 * 3. [VOCABULARY_SUGGESTION] System actively suggests learned range vocabulary.
 * 4. [FUZZY_ALIGNMENT] System successfully uses learned vocabulary to resolve near-misses.
 */

test.use({
  viewport: {
    height: 800,
    width: 360
  }
});

test('Tactical Logistics: Range Vocabulary Learning Flow', async ({ page }) => {

  await test.step('STEP 1: Environment Initialization & Seeding', async () => {
    await page.goto('http://localhost:8081/?setup=foundation_basic_grid_with_types');

    await page.waitForURL('http://localhost:8081/**');
    await page.waitForLoadState('networkidle');

    const seedError = await page.evaluate(() => localStorage.getItem('E2E_SEED_ERROR'));
    expect(seedError, 'Database Seeding Integrity Check').toBeNull();
  });

  await test.step('STEP 2: Introduce Novel Range Vocabulary', async () => {
    await page.getByTestId('category-card-test-category-1').click();

    // First Batch
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();

    // PRE-LEARNING CHECK: Prove the suggestion does NOT exist before the word is ever saved
    await page.getByTestId('product-range-input').fill('XENORANGE');
    await expect(page.getByTestId('range-suggestion-xenorange')).toHaveCount(0);

    // Now save the novel vocabulary
    await page.getByTestId('product-range-input').fill('XENORANGE');

    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-1').click();
    await page.getByTestId('save-stock-btn').click();

    // Verify it appeared in the list with the new range
    // NOTE: this is NOT a NEAR MISS - nothing in the vocabulary is close enough to matching
    const batchRange = page.getByTestId('test-category-1-test-item-1-batch-1-range').filter({ visible: true });
    await expect(batchRange).toContainText('XENORANGE');
  });

  await test.step('STEP 3: Recall Vocabulary and Align Typo', async () => {
    // Second Batch
    await page.getByTestId('add-btn-test-category-1-test-item-1').filter({ visible: true }).click();

    // Type partial word — allow component mount/vocab reload first
    await page.waitForTimeout(500);
    await page.getByTestId('product-range-input').fill('XENO');

    // Verify the system suggests the learned vocabulary via the type-ahead dropdown
    await expect(page.getByTestId('range-suggestion-xenorange')).toBeVisible();

    // Complete the field with a deliberate typo
    await page.getByTestId('product-range-input').fill('XENORAANGE');

    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-1').click();
    await page.getByTestId('save-stock-btn').click();

    // The Near Miss Modal should appear, offering our custom learned vocabulary
    await expect(page.getByText('NEAR MISS DETECTED', { exact: false })).toBeVisible();

    // Click Align
    await page.getByText('ALIGN TO: XENORANGE', { exact: false }).click();

    // Assert: There should be EXACTLY ONE batch with 2 units (Silent Merge triggered after alignment)
    const rowCount = page.getByTestId(/test-category-1-test-item-1-batch-\d+-row/).filter({ visible: true });
    await expect(rowCount).toHaveCount(1);

    const batchQty = page.getByTestId('test-category-1-test-item-1-batch-1-qty').filter({ visible: true });
    await expect(batchQty).toContainText('2');

    const batchRange = page.getByTestId('test-category-1-test-item-1-batch-1-range').filter({ visible: true });
    await expect(batchRange).toContainText('XENORANGE');
  });

});
