import { test, expect } from '@playwright/test';

/**
 * QUARTERMASTER CATALOG & TACTICAL METRICS
 * [TC-68.1] Catalog Dashboard, Accordion & Logistics Summary
 *
 * Covers:
 *  A. Quad-panel metrics: Categories, Items, Min Targets, Max Targets
 *  B. Advisory Warning: Specifically linked to MIN levels
 *  C. Single-Expand Accordion: Only one category open at a time
 *  D. Category Summary: Correct mapping of ITEMS, FAVOURITES, and MIN/MAX SET
 */
test.describe('[TC-68.1] Quartermaster Catalog', () => {

  test.setTimeout(180000);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const purgeAndReset = async (page: any) => {
    await page.addInitScript(() => { (window as any).__E2E_SKIP_SEEDS__ = true; });
    await page.goto('/');

    try {
      if (await page.getByText("LET'S GO  →").isVisible({ timeout: 2000 })) {
        await page.getByText("LET'S GO  →").click();
      }
    } catch (e) {}

    const settingsBtn = page.getByTestId('settings-btn').first();
    await expect(settingsBtn).toBeVisible({ timeout: 20000 });
    await settingsBtn.click();
    await page.getByTestId('tab-system').click();
    const purgeBtn = page.getByTestId('debug-purge-db').first();
    await expect(purgeBtn).toBeVisible({ timeout: 10000 });
    await purgeBtn.click();
    await page.waitForTimeout(2000);
    await page.goto('/');

    try {
      if (await page.getByText("LET'S GO  →").isVisible({ timeout: 3000 })) {
        await page.getByText("LET'S GO  →").click();
      }
    } catch (e) {}

    await expect(page.getByTestId('app-header-title')).toBeVisible({ timeout: 20000 });

    // Unlock SERGEANT tier to allow unlimited categories/items
    await page.getByTestId('logistics-btn').click();
    try {
      if (await page.getByText('UPGRADE TO SERGEANT').isVisible({ timeout: 3000 })) {
        await page.getByText('UPGRADE TO SERGEANT').click();
        await page.getByText('ENLIST AS SERGEANT').click();
        await page.waitForTimeout(2000); 
        await page.goto('/');
      }
    } catch(e) {}
  };

  const goToCatalog = async (page: any) => {
    const settingsBtn = page.getByTestId('settings-btn').first();
    await expect(settingsBtn).toBeVisible({ timeout: 15000 });
    await settingsBtn.click();
    await page.getByTestId('tab-categories').click();
  };

  test('should verify metrics, advisory, and accordion behavior', async ({ page }) => {
    await purgeAndReset(page);
    await goToCatalog(page);

    // 1. Check Initial State (Advisory Present)
    await expect(page.getByText('No minimum desired stock levels have been set')).toBeVisible();
    await expect(page.getByText('0', { exact: true }).nth(0)).toBeVisible(); // Categories
    await expect(page.getByText('0', { exact: true }).nth(1)).toBeVisible(); // Items
    await expect(page.getByText('0', { exact: true }).nth(2)).toBeVisible(); // Min Targets
    await expect(page.getByText('0', { exact: true }).nth(3)).toBeVisible(); // Max Targets

    // 2. Add Category
    await page.getByTestId('new-cat-input').fill('Logistics Alpha');
    await page.getByTestId('create-cat-btn').click();
    await expect(page.getByText('1', { exact: true }).nth(0)).toBeVisible(); // Categories increments

    // 3. Add Item
    await page.getByTestId('expand-add-item-logistics-alpha').click();
    await page.getByTestId('new-item-name-input').fill('Combat Rations');
    await page.getByTestId('submit-item-type-btn').click();
    await expect(page.getByText('1', { exact: true }).nth(1)).toBeVisible(); // Items increments

    // 4. Set Max Target (Advisory should still be visible)
    await page.getByTestId('edit-type-combat-rations').click();
    await page.locator('input[placeholder="MAX"]').fill('10');
    await page.getByTestId('save-type-edit-btn').click();
    await expect(page.getByText('1', { exact: true }).nth(3)).toBeVisible(); // Max Targets increments
    await expect(page.getByText('No minimum desired stock levels have been set')).toBeVisible();

    // 5. Set Min Target (Advisory should disappear)
    await page.getByTestId('edit-type-combat-rations').click();
    await page.locator('input[placeholder="MIN"]').fill('5');
    await page.getByTestId('save-type-edit-btn').click();
    await expect(page.getByText('1', { exact: true }).nth(2)).toBeVisible(); // Min Targets increments
    await expect(page.getByText('No minimum desired stock levels have been set')).not.toBeVisible();

    // 6. Test Accordion & Summary (Items & Min/Max Set)
    // Collapse Logistics Alpha
    await page.getByText('LOGISTICS ALPHA').click();
    await expect(page.getByText('1 ITEM', { exact: true })).toBeVisible();
    await expect(page.getByText('1 MIN/MAX SET', { exact: true })).toBeVisible();

    // Add Favourites check
    await page.getByText('LOGISTICS ALPHA').click(); // Re-expand
    await page.getByTestId('fav-toggle-combat-rations').click();
    await page.getByText('LOGISTICS ALPHA').click(); // Collapse
    await expect(page.getByText('1 ITEM', { exact: true })).toBeVisible();
    await expect(page.getByText('1 FAVOURITE', { exact: true })).toBeVisible();

    // 7. Single Expand Verification
    await page.getByTestId('new-cat-input').fill('Logistics Beta');
    await page.getByTestId('create-cat-btn').click();
    
    // Open Beta
    await page.getByText('LOGISTICS BETA').click();
    await expect(page.getByTestId('expand-add-item-logistics-beta')).toBeVisible();
    // Alpha should now be collapsed (summary visible)
    await expect(page.getByText('1 MIN/MAX SET', { exact: true })).toBeVisible();
    
    // Close Beta, Open Alpha
    await page.getByText('LOGISTICS ALPHA').click();
    await expect(page.getByTestId('expand-add-item-logistics-alpha')).toBeVisible();
    // Beta summary should be visible (0 items)
    await expect(page.getByText('0 ITEMS', { exact: true }).last()).toBeVisible();
  });

});
