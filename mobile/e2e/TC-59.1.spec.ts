/**
 * NOTE: This test file primarily uses text-based selectors.
 */
import { test, expect } from '@playwright/test';

/**
 * STRATEGIC RESUPPLY & LOGISTICS
 * [TC-59.1] VERIFICATION: Resupply Intel & Deficit Calculation (Web)
 */
test.describe('[TC-59.1] Strategic Resupply & Logistics', () => {
  
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    // 0. Zero-Trust Start (Seed-free)
    await page.addInitScript(() => {
      (window as any).__E2E_SKIP_SEEDS__ = true;
    });

    await page.goto('/');

    // 1. TACTICAL PURGE BEFORE PROVISIONING
    await page.getByTestId('settings-btn').first().click();
    await page.getByText('SYSTEM', { exact: true }).first().click();
    await page.getByTestId('debug-purge-db').first().click();
    await page.waitForURL('**/?timestamp=*', { timeout: 10000 }).catch(() => {});
    await page.goto('/');

    // 2. Setup Data Environment
    await page.getByTestId('settings-btn').first().click();
    
    // Create Pantry
    await page.getByText('CABINETS', { exact: true }).click();
    await page.getByTestId('new-cab-name-input').fill('Pantry');
    await page.getByTestId('create-cab-btn').click();
    await expect(page.getByText('Pantry')).toBeVisible();

    // Create Category and Item with Thresholds
    await page.getByText('CATEGORIES', { exact: true }).click();
    await page.getByTestId('new-cat-input').fill('Grains');
    await page.getByTestId('create-cat-btn').click();
    await expect(page.getByText('Grains')).toBeVisible();

    await page.getByTestId('new-cat-input').fill('Protein');
    await page.getByTestId('create-cat-btn').click();
    await expect(page.getByText('Protein')).toBeVisible();

    // Expand Grains and add Rice with Default Size 1kg, Min 2, Max 5
    await page.getByTestId('expand-add-item-grains').click();
    await page.getByTestId('new-item-name-input').fill('Rice');
    
    // Fill Default Size: 1000 (g) -> 1kg
    await page.getByPlaceholder(/Default Size/i).fill('1000');
    // Ensure unit is Weight
    await page.getByText('Weight (g)', { exact: true }).click();

    // Set Thresholds (Units)
    await page.getByPlaceholder(/Min count/i).fill('2');
    await page.getByPlaceholder(/Max target/i).fill('5');
    
    await page.getByTestId('submit-item-type-btn').click();
    await expect(page.getByText('Rice')).toBeVisible();
    await expect(page.getByText('Targets: 2/5')).toBeVisible();

    // Expand Protein and add Tuna with NO default size, Min 3, Max 6
    await page.getByTestId('expand-add-item-protein').click();
    await page.getByTestId('new-item-name-input').fill('Tuna');
    await page.getByText('Weight (g)', { exact: true }).click();
    await page.getByPlaceholder(/Min count/i).fill('3');
    await page.getByPlaceholder(/Max target/i).fill('6');
    await page.getByTestId('submit-item-type-btn').click();
    await expect(page.getByText('Tuna')).toBeVisible();

    // 2. Baseline Stock: 1 Batch of 1500g (1.5kg)
    await page.goto('/');
    // Check if category is expanded
    if (!(await page.getByTestId('add-btn-rice').isVisible())) {
       await page.getByText('Grains', { exact: true }).click();
    }
    await page.getByTestId('add-btn-rice').click();
    await page.getByTestId('size-input').fill('1500');
    // Default is Weight (g)
    await page.getByTestId('save-stock-btn').click();
    await expect(page.getByTestId('save-stock-btn')).toBeHidden();

    // 2.5 Add single batch of Tuna (150g)
    // Navigate back to home and expand Protein category via testID (same pattern as Rice above)
    await page.goto('/');
    if (!(await page.getByTestId('add-btn-tuna').isVisible())) {
       await page.getByTestId('category-header-protein').first().click();
       await page.waitForTimeout(300);
    }
    await page.getByTestId('add-btn-tuna').click({ force: true });
    await page.getByTestId('size-input').fill('150');
    await page.getByTestId('save-stock-btn').click();
    await expect(page.getByTestId('save-stock-btn')).toBeHidden();
  });

  test('calculates accurate logistics deficits for unit-balanced inventory', async ({ page }) => {
    // 3. Move to Logistics (Direct jump for speed/reliability)
    await page.waitForTimeout(2000); 
    await page.goto('/logistics');
    await expect(page.getByText('Restocking List')).toBeVisible({ timeout: 10000 });

    // 4. Verification of Calculations
    const riceRow = page.getByTestId(/resupply-row-/).first();
    await expect(riceRow).toBeVisible({ timeout: 10000 });
    await expect(riceRow).toContainText('Rice');

    // Current Stock: 1.5kg (1500g formatted as kg)
    const storedText = page.getByTestId(/stored-text-/).first();
    await expect(storedText).toHaveText('Current Stock: 1.5kg');

    // MIN 500g (Goal 2000g - Have 1500g)
    const minBadge = page.getByTestId(/min-deficit-/).first();
    await expect(minBadge).toContainText('MIN 500g');

    // MAX 3.5kg (Goal 5000g - Have 1500g)
    const maxBadge = page.getByTestId(/max-deficit-/).first();
    await expect(maxBadge).toContainText('MAX 3.5kg');

    // Verification for Tuna Fallback Logic (No Default Size + Weight -> Units)
    // Tuna row is the second resupply row
    const tunaRow = page.getByTestId(/resupply-row-/).nth(1);
    await expect(tunaRow).toBeVisible();
    await expect(tunaRow).toContainText('Tuna');

    const tunaStored = page.getByTestId(/stored-text-/).nth(1);
    await expect(tunaStored).toHaveText('Current Stock: 1 unit');

    const tunaMin = page.getByTestId(/min-deficit-/).nth(1);
    await expect(tunaMin).toContainText('MIN 2 units'); // (Goal 3 - Have 1)

    const tunaMax = page.getByTestId(/max-deficit-/).nth(1);
    await expect(tunaMax).toContainText('MAX 5 units'); // (Goal 6 - Have 1)

    // 5. Native Email functionality skip (checked via visual existence of share button)
    // On web, Share button falls back to plain text share sheet which playwright can't easily audit.
    await expect(page.getByText('SHARE')).toBeVisible();
  });
});
