import { test, expect } from '@playwright/test';

/**
 * STRATEGIC SILENCE (MIN-TRIGGERED LOGISTICS)
 * [TC-60.1] VERIFICATION: Items silent until MIN breach
 */
test.describe('[TC-60.1] Strategic Silence (Logistics)', () => {
  
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    // 0. Zero-Trust Start
    await page.addInitScript(() => {
      (window as any).__E2E_SKIP_SEEDS__ = true;
    });

    await page.goto('/');

    // 1. Setup Data Environment
    await page.getByTestId('settings-btn').click();
    
    // Create Grains Category
    await page.getByText('CATEGORIES', { exact: true }).click();
    await page.getByTestId('new-cat-input').fill('Pantry Essentials');
    await page.getByTestId('create-cat-btn').click();
    await expect(page.getByText('Pantry Essentials')).toBeVisible();

    // Add Coffee: Min 2, Max 5 (Units)
    await page.getByTestId('expand-add-item-pantry-essentials').click();
    await page.getByTestId('new-item-name-input').fill('Coffee');
    await page.getByText('Count (Unit)', { exact: true }).click();
    await page.getByPlaceholder(/Min count/i).fill('2');
    await page.getByPlaceholder(/Max target/i).fill('5');
    await page.getByTestId('submit-item-type-btn').click();

    // Add Sugar: Min 3, Max 6 (Units)
    await page.getByTestId('expand-add-item-pantry-essentials').click();
    await page.getByTestId('new-item-name-input').fill('Sugar');
    await page.getByText('Count (Unit)', { exact: true }).click();
    await page.getByPlaceholder(/Min count/i).fill('3');
    await page.getByPlaceholder(/Max target/i).fill('6');
    await page.getByTestId('submit-item-type-btn').click();

    // 2. Add Stock
    await page.goto('/');
    if (!(await page.getByTestId('add-btn-coffee').isVisible())) {
       await page.getByText('Pantry Essentials', { exact: true }).click();
    }
    
    // Coffee: Stock 3 (In Range [2, 5])
    await page.getByTestId('add-btn-coffee').click();
    await page.getByTestId('qty-input').fill('3');
    await page.getByTestId('size-input').fill('1');
    await page.getByTestId('save-stock-btn').click();
    await expect(page.getByTestId('save-stock-btn')).toBeHidden();

    // Sugar: Stock 2 (Breach [Min 3])
    await page.getByTestId('add-btn-sugar').click();
    await page.getByTestId('qty-input').fill('2');
    await page.getByTestId('size-input').fill('1');
    await page.getByTestId('save-stock-btn').click();
    await expect(page.getByTestId('save-stock-btn')).toBeHidden();
  });

  test('only shows items that have breached MIN threshold', async ({ page }) => {
    // 3. Move to Restocking List (Logistics)
    await page.waitForTimeout(1000); 
    await page.goto('/logistics');
    await expect(page.getByText('Restocking List')).toBeVisible({ timeout: 10000 });

    // 4. Verification: Sugar should be visible, Coffee should be hidden
    await expect(page.getByText('Sugar')).toBeVisible();
    await expect(page.getByText('Current Stock: 2 units')).toBeVisible();
    
    // Check MIN/MAX for Sugar (Min 3 / Max 6)
    // Shortfall: MIN 1 unit, MAX 4 units
    await expect(page.getByText('MIN 1 unit')).toBeVisible();
    await expect(page.getByText('MAX 4 units')).toBeVisible();

    // CRITICAL CHECK: Coffee should NOT be in the list at all
    // Because it has 3 units which is > MIN 2.
    await expect(page.getByText('Coffee')).toBeHidden();
  });
});
