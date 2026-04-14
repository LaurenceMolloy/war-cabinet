import { test, expect } from '@playwright/test';

test.describe('TC-79.1: Mess Hall Category Filtering', () => {
  
  test.beforeEach(async ({ page }) => {
    // Environment Hardening: Bypass Welcome Modal and set Trial Start
    await page.addInitScript(() => {
      localStorage.setItem('war_cabinet_welcome_seen', '1');
      localStorage.setItem('war_cabinet_recon_start', '2026-04-09T23:22:05Z');
    });
  });

  test('should exclude/include items based on category mess_hall toggle', async ({ page }) => {
    const testItemName = `MRE Beef Stew ${Date.now()}`;

    // 1. Navigate to Home
    await page.goto('http://localhost:8081');
    await expect(page.getByTestId('rank-badge-pill')).toBeVisible();

    // 2. Ensure 'Tactical Rations' is OFF
    const toggle = page.getByTestId('mess-hall-toggle-tactical-rations');
    await expect(toggle).toContainText('OFF');

    // 3. Verify item is not in Recipes yet
    await page.getByTestId('recipes-btn').click();
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).not.toContainText(testItemName);
    
    // 4. Go Home and Add the item
    await page.goto('http://localhost:8081');
    await page.getByTestId('add-new-item-to-tactical-rations').click();

    // Phase 1: Item Specification
    await page.getByPlaceholder('Item Name').fill(testItemName);
    await page.getByText('Weight').click();
    await page.getByPlaceholder('Size').first().fill('500');
    await page.getByText('DEPLOY SPECIFICATION').click();

    // Phase 2: Batch Logistics
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('qty-input')).toHaveValue('1');
    await page.getByTestId('save-stock-btn').click();

    // 5. Verify STILL NOT in Recipes (Toggle is OFF)
    console.log('Waiting for Home redirect...');
    await page.waitForURL(url => url.origin === 'http://localhost:8081' && (url.pathname === '/' || url.pathname === '/index'), { timeout: 10000 });
    console.log('At Home. URL:', page.url());
    
    const recipesBtn = page.getByTestId('recipes-btn');
    await expect(recipesBtn).toBeVisible({ timeout: 10000 });
    await recipesBtn.click();
    
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).not.toContainText(testItemName);

    // 6. Navigate Home and Toggle ON
    await page.goto('http://localhost:8081');
    const mhToggle = page.getByTestId('mess-hall-toggle-tactical-rations');
    await expect(mhToggle).toBeVisible();
    await mhToggle.click();
    await expect(mhToggle).toContainText('ON');

    // 7. Final Verification: Should now be in Recipes
    await page.getByTestId('recipes-btn').click();
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toContainText(testItemName);
  });

});
