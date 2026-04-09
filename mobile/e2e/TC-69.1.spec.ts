import { test, expect } from '@playwright/test';

/**
 * HIGH-DENSITY LOGISTICS & STRICT UI FILTERING
 * [TC-69.1] Strict Filtering, Urgency Tiers & Frozen Parity
 *
 * Covers:
 *  A. Real-time reactivity for search/filters
 *  B. Strict removal of non-matching categories (noise reduction)
 *  C. Expiry filter tiers (Expired, This Month, <3M)
 *  D. Frozen item integration into urgency filters
 */
test.describe('[TC-69.1] Strict Filtering & Logistics Dashboard', () => {

  test.setTimeout(180000);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

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

    // Unlock SERGEANT for unlimited cats/items
    await page.getByTestId('logistics-btn').click();
    try {
      if (await page.getByText('UPGRADE TO SERGEANT').isVisible({ timeout: 3000 })) {
        await page.getByText('UPGRADE TO SERGEANT').click();
        await page.getByText('ENLIST AS SERGEANT').click();
        await page.waitForTimeout(1000); 
        await page.goto('/');
      }
    } catch(e) {}
  };

  const setupScenarios = async (page: any) => {
    // 1. Create Category "Alpha" with ambient item expiring this month
    const settingsBtn = page.getByTestId('settings-btn').first();
    await settingsBtn.click();
    await page.getByTestId('tab-categories').click();
    await page.getByTestId('new-cat-input').fill('Alpha');
    await page.getByTestId('create-cat-btn').click();
    await page.getByTestId('expand-add-item-alpha').click();
    await page.getByTestId('new-item-name-input').fill('Ambient Logic');
    await page.getByTestId('submit-item-type-btn').click();

    // 2. Create Category "Beta" with frozen item (expired)
    await page.getByTestId('new-cat-input').fill('Beta');
    await page.getByTestId('create-cat-btn').click();
    await page.getByTestId('expand-add-item-beta').click();
    await page.getByTestId('new-item-name-input').fill('Frozen Core');
    await page.locator('input[placeholder="e.g. 6"]').first().fill('12'); // 12 month limit
    await page.getByTestId('submit-item-type-btn').click();

    // 3. Create Freezer Cabinet
    await page.getByTestId('tab-cabinets').click();
    await page.getByTestId('new-cab-name-input').fill('Ice Box');
    await page.getByText('Freezer', { exact: true }).click();
    await page.getByTestId('create-cab-btn').click();

    // 4. Return to Dashboard and Add Stock
    await page.getByTestId('app-header-title').click(); // Back home or use back btn
    await page.goto('/');

    // Add Ambient Stock (Current Month)
    await page.getByText('ALPHA').click();
    await page.getByTestId('type-row-ambient-logic').click();
    await page.getByTestId('btn-add-stock-ambient-logic').click();
    await page.getByPlaceholder('Month').fill(String(currentMonth));
    await page.getByPlaceholder('Year').fill(String(currentYear));
    await page.getByTestId('submit-batch-btn').click();

    // Add Frozen Stock (Entered 13 months ago, 12 month limit = EXPIRED)
    await page.getByText('BETA').click();
    await page.getByTestId('type-row-frozen-core').click();
    await page.getByTestId('btn-add-stock-frozen-core').click();
    await page.getByPlaceholder('Month').fill('1'); // Generic old date
    await page.getByPlaceholder('Year').fill(String(currentYear - 1));
    await page.getByText('Ice Box', { exact: true }).click();
    await page.getByTestId('submit-batch-btn').click();
  };

  test('should verify strict filtering and urgency parity', async ({ page }) => {
    await purgeAndReset(page);
    await setupScenarios(page);

    // --- A. Strict Filtering (Search) ---
    await page.getByPlaceholder('FIND STOCK...').fill('Alpha');
    // ALPHA should be visible
    await expect(page.getByText('ALPHA', { exact: true })).toBeVisible();
    // BETA must be strictly REMOVED (not just ghosted)
    await expect(page.getByText('BETA', { exact: true })).not.toBeVisible();

    // Clear search
    await page.getByPlaceholder('FIND STOCK...').fill('');
    await expect(page.getByText('BETA', { exact: true })).toBeVisible();

    // --- B. Expiry Tier Verification ---
    const filterBtn = page.locator('TouchableOpacity').filter({ has: page.locator('MaterialCommunityIcons[name="calendar-search"]') });
    
    // 1. Expired Only (Should show Beta - Frozen)
    await filterBtn.click();
    await page.getByText('EXPIRED', { exact: true }).click();
    await expect(page.getByText('BETA', { exact: true })).toBeVisible();
    await expect(page.getByText('ALPHA', { exact: true })).not.toBeVisible();

    // 2. Expiring This Month (Should show Alpha - Ambient)
    await page.locator('MaterialCommunityIcons[name="calendar-alert"]').click();
    await page.getByText('EXPIRING THIS MONTH', { exact: true }).click();
    await expect(page.getByText('ALPHA', { exact: true })).toBeVisible();
    await expect(page.getByText('BETA', { exact: true })).not.toBeVisible();

    // --- C. Cabinet Filter (Strict Removal) ---
    // Clear urgency first
    await page.getByTestId('icon-filter-remove').first().click(); // if exists or manual
    await page.goto('/'); // reset
    
    await page.locator('MaterialCommunityIcons[name="warehouse"]').first().click();
    await page.getByText('Ice Box', { exact: true }).click();
    // Beta is in Ice Box
    await expect(page.getByText('BETA', { exact: true })).toBeVisible();
    // Alpha is NOT in Ice Box
    await expect(page.getByText('ALPHA', { exact: true })).not.toBeVisible();
  });

});
