import { test, expect } from '@playwright/test';

/**
 * TEST SPECIFICATION: New Product Batch Initialization
 * --------------------------------------------------
 * SCOPE: Inventory Management (Chained Creation Flow)
 * 
 * METADATA:
 * Scenario: Chained Initialization
 * Entity: Batch
 * Foundation: foundation_basic_grid_with_types
 * Last Amended: 2026-05-02
 * App Version: 1.0.0
 * Schema Version: 109
 * 
 * INTENT: Verify the "chained" deployment flow where creating a new Item Type
 * immediately triggers the Batch Add form with correctly propagated defaults.
 * 
 * TACTICAL VERIFICATIONS:
 * 1. [SPEC_PROPAGATION] Item Type defaults correctly pre-fill the Batch form.
 * 2. [DATE_INTELLIGENCE] Auto-calculation of Storage Date and Expiry Drift.
 * 3. [STATE_INTEGRITY] Inventory record correctly reflects input values and IDs.
 */

test.use({
  viewport: { height: 800, width: 360 }
});

test('Tactical Logistics: New Product Initialization Flow', async ({ page }) => {

  await test.step('STEP 1: Environment Initialization & Seeding', async () => {
    await page.goto('http://localhost:8081/?setup=foundation_basic_grid_with_types');
    
    // Wait for the app to perform the setup and auto-refresh back to the clean URL
    await page.waitForURL('http://localhost:8081/**');
    await page.waitForLoadState('networkidle');

    const seedError = await page.evaluate(() => localStorage.getItem('E2E_SEED_ERROR'));
    expect(seedError, 'Database Seeding Integrity Check').toBeNull();
  });

  await test.step('STEP 2: Item Type Specification (Quick Add)', async () => {
    // Note: The add button inside the category card
    await page.getByTestId('add-new-item-to-test-category-1').filter({ visible: true }).click();
    
    await page.getByRole('textbox', { name: 'Item Name' }).fill('TEST ITEM 5');
    await page.getByRole('textbox', { name: 'Size' }).fill('500');
    
    await page.getByRole('textbox', { name: 'Heinz, Nestle, Tesco...' }).fill('H');
    await page.getByText('HÄAGEN-DAZS').click();
    
    await page.getByRole('textbox', { name: 'Product Range (e.g. Dark' }).fill('Essential');
    await page.getByTestId('cabinet-chip-1').click();
    
    await page.getByTestId('deploy-spec-btn').click({ force: true });
  });

  await test.step('STEP 3: Batch Initialization & Smart Default Validation', async () => {
    // Wait for Batch form transition
    await page.waitForTimeout(1000);
    
    await expect(page.getByText('TEST ITEM 5', { exact: false }), 'Verification: Item Name Header').toBeVisible();
    await expect(page.getByTestId('size-input'), 'Verification: Size Default Propagation').toHaveValue('500');
    await expect(page.getByTestId('unit-label'), 'Verification: Unit Type Recognition (Weight)').toContainText('g');
    await expect(page.getByTestId('active-size-chip'), 'Verification: Active Size Chip State').toContainText('500g');
    await expect(page.getByTestId('active-cabinet-chip'), 'Verification: Cabinet Selection Preservation').toContainText('TEST CABINET 1');
    await expect(page.getByTestId('supplier-input'), 'Verification: Supplier Default Propagation').toHaveValue('Häagen-Dazs');
    
    // Fill remaining Batch metadata
    await page.getByTestId('product-range-input').fill('Essential');
    await page.getByTestId('batch-intel-input').fill('TEST INTEL 1');
    
    // Set Expiry to Dec 2028
    await page.getByTestId('expiry-year-trigger').click();
    await page.getByTestId('expiry-year-option-2028').click();
    await page.getByTestId('expiry-month-trigger').click();
    await page.getByTestId('expiry-month-option-12').click();
    
    await page.getByTestId('save-stock-btn').click();
  });

  await test.step('STEP 4: Tactical Inventory Audit (Post-Deployment)', async () => {
    const now = new Date();
    const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
    const currentYear = now.getFullYear();
    const expectedStoredDate = `STORED ${currentMonth}/${currentYear}`;
    
    const monthsRemaining = (2028 - currentYear) * 12 + (12 - (now.getMonth() + 1));
    const expectedMonthsText = `${monthsRemaining} months`;

    // New Hierarchical ID Pattern
    const batchPrefix = 'test-category-1-test-item-5-batch-1';

    await expect(page.getByTestId('type-header-test-item-5'), 'Audit: Item Group Header').toContainText('TEST ITEM 5');
    await expect(page.getByTestId(`${batchPrefix}-location`).filter({ visible: true }), 'Audit: Storage Site Label').toContainText('TEST CABINET 1 • TEST LOCATION 1');
    await expect(page.getByTestId(`${batchPrefix}-supplier`).filter({ visible: true }), 'Audit: Supplier Branding').toContainText('HÄAGEN-DAZS');
    await expect(page.getByTestId(`${batchPrefix}-range`).filter({ visible: true }), 'Audit: Product Range Indicator').toContainText('[ESSENTIAL]');
    await expect(page.getByTestId(`${batchPrefix}-intel`).filter({ visible: true }), 'Audit: Batch Tactical Intel').toContainText('TEST INTEL 1');
    await expect(page.getByTestId(`${batchPrefix}-size`).filter({ visible: true }), 'Audit: Physical Size Metric').toContainText('500g');
    await expect(page.getByTestId(`${batchPrefix}-qty`).filter({ visible: true }), 'Audit: Unit Quantity Count').toContainText('1');
    
    await expect(page.getByTestId(`${batchPrefix}-row`).filter({ visible: true }), 'Audit: Storage Date Recency').toContainText(expectedStoredDate);
    await expect(page.getByTestId(`${batchPrefix}-row`).filter({ visible: true }), 'Audit: Expiry Drift Calculation').toContainText(expectedMonthsText);
  });

});