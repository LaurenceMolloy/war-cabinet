import { test, expect } from '@playwright/test';

/**
 * STRATEGIC SILENCE (ITERATION 60)
 * [TC-60.1] VERIFICATION: Restocking List item-level threshold isolation
 */
test.describe('[TC-60.1] Logistics Strategic Silence', () => {
    
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    // 0. Zero-State Start
    await page.addInitScript(() => {
      (window as any).__E2E_SKIP_SEEDS__ = true;
    });

    await page.goto('/');

    // 0.5. TACTICAL PURGE
    await page.getByTestId('settings-btn').first().click();
    await page.getByText('SYSTEM', { exact: true }).first().click();
    await page.getByTestId('debug-purge-db').first().click();
    await page.waitForURL('**/?timestamp=*', { timeout: 10000 }).catch(() => {});
    await page.goto('/');

    // 1. Provision Parameters (Coffee & Sugar)
    await page.getByTestId('settings-btn').first().click();
    
    // Create Category
    await page.getByText('CATEGORIES', { exact: true }).click();
    await page.getByTestId('new-cat-input').fill('Pantry Essentials');
    await page.getByTestId('create-cat-btn').click();
    await expect(page.getByText('Pantry Essentials')).toBeVisible();

    // Coffee: Weight, Min 2, Max 5
    await page.getByTestId('expand-add-item-pantry-essentials').click();
    await page.getByTestId('new-item-name-input').fill('Coffee');
    await page.getByTestId('unit-selector-weight').click();
    await page.getByTestId('min-stock-input').fill('2');
    await page.getByTestId('max-stock-input').fill('5');
    await page.getByTestId('submit-item-type-btn').click();
    await expect(page.getByText('Coffee')).toBeVisible();

    // Sugar: Weight, Min 3, Max 6
    await page.getByTestId('expand-add-item-pantry-essentials').click();
    await page.getByTestId('new-item-name-input').fill('Sugar');
    await page.getByTestId('unit-selector-weight').click();
    await page.getByTestId('min-stock-input').fill('3');
    await page.getByTestId('max-stock-input').fill('6');
    await page.getByTestId('submit-item-type-btn').click();
    await expect(page.getByText('Sugar')).toBeVisible();

    // 2. Add Stock
    await page.goto('/');
    
    const ensureCatExpanded = async () => {
        const coffeeBtn = page.getByTestId('add-btn-coffee');
        if (!(await coffeeBtn.isVisible().catch(() => false))) {
            const header = page.getByTestId('category-header-pantry-essentials');
            await header.click();
            await expect(coffeeBtn).toBeVisible({ timeout: 5000 });
        }
    };

    await ensureCatExpanded();
    
    // Coffee: Stock 3 (In Range [2, 5])
    await page.getByTestId('add-btn-coffee').click();
    await page.getByTestId('qty-input').fill('3');
    await page.getByTestId('size-input').fill('1');
    await page.getByTestId('save-stock-btn').click();
    await page.waitForURL('**/');
    await expect(page.getByTestId('save-stock-btn')).toBeHidden();

    await ensureCatExpanded();

    // Sugar: Stock 2 (Breach [Min 3])
    await page.getByTestId('add-btn-sugar').click();
    await page.getByTestId('qty-input').fill('2');
    await page.getByTestId('size-input').fill('1');
    await page.getByTestId('save-stock-btn').click();
    await page.waitForURL('**/');
    await expect(page.getByTestId('save-stock-btn')).toBeHidden();
  });

  test('only shows items that have breached MIN threshold', async ({ page }) => {
    // 3. Move to Restocking List (Logistics)
    await page.waitForTimeout(1000); 
    await page.goto('/logistics');
    await expect(page.getByText('Restocking List')).toBeVisible({ timeout: 10000 });

    // 4. Verification: Sugar should be visible, Coffee should be hidden
    await expect(page.getByText('Sugar')).toBeVisible();
    await expect(page.getByText('Coffee')).toBeHidden();
  });
});
