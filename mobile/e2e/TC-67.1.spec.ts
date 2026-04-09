import { test, expect } from '@playwright/test';

/**
 * FREEZER CABINET MODE
 * [TC-67.1] Freezer Cabinet Configuration & Batch Entry
 *
 * Covers:
 *  A. Creating a freezer-type cabinet: snowflake badge appears in list
 *  B. Add form adapts — Date Frozen replaces Expiry Date
 *  C. Date Frozen defaults to current month/year
 *  D. Separate-batch guarantee (same item/size on different dates = 2 rows, no merge)
 *  E. Home screen shows FROZEN label instead of ENTRY/EXPIRY
 *  F. Freeze months configuration drives urgency display
 */
test.describe('[TC-67.1] Freezer Cabinet Mode', () => {

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

    // Unlock SERGEANT tier via the logistics button
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

  const goToCatalogCabinets = async (page: any) => {
    const settingsBtn = page.getByTestId('settings-btn').first();
    await expect(settingsBtn).toBeVisible({ timeout: 15000 });
    await settingsBtn.click();
    await page.getByTestId('tab-cabinets').click();
  };

  const goToCatalogCategories = async (page: any) => {
    const settingsBtn = page.getByTestId('settings-btn').first();
    await expect(settingsBtn).toBeVisible({ timeout: 15000 });
    await settingsBtn.click();
    await page.getByTestId('tab-categories').click();
  };

  const createFreezerCabinet = async (page: any, name: string, location: string) => {
    await page.getByTestId('new-cab-name-input').fill(name);
    await page.getByTestId('new-cab-loc-input').fill(location);
    // Select Freezer type chip by text as it lacks an ARIA role on RN Web
    const freezerChip = page.getByText('Freezer', { exact: true });
    await expect(freezerChip).toBeVisible({ timeout: 5000 });
    await freezerChip.click();
    await page.getByTestId('create-cab-btn').click();
    await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 10000 });
  };

  const createCategoryAndItem = async (page: any, catName: string, itemName: string, freezeMonths = '') => {
    await goToCatalogCategories(page);
    await page.getByTestId('new-cat-input').fill(catName);
    await page.getByTestId('create-cat-btn').click();
    await expect(page.getByText(catName, { exact: true })).toBeVisible({ timeout: 10000 });

    const slug = catName.toLowerCase().replace(/\s+/g, '-');
    await page.getByTestId(`expand-add-item-${slug}`).click();
    await page.getByTestId('new-item-name-input').fill(itemName);
    if (freezeMonths) {
      await page.locator('input[placeholder="e.g. 6"]').first().fill(freezeMonths);
    }
    await page.getByTestId('submit-item-type-btn').click();
    await expect(page.getByText(itemName, { exact: true })).toBeVisible({ timeout: 10000 });
  };

  const switchCabinetInAddForm = async (page: any, cabinetName: string) => {
    await page.getByTestId('cabinet-selector').click();
    await page.getByText(cabinetName, { exact: true }).click();
  };

  // ─── Tests ─────────────────────────────────────────────────────────────────

  test('A: Freezer cabinet shows FREEZER snowflake badge in cabinet list', async ({ page }) => {
    await purgeAndReset(page);
    await goToCatalogCabinets(page);

    await createFreezerCabinet(page, 'Deep Freeze', 'Garage');

    // The FREEZER badge should be visible under the cabinet name
    await expect(page.getByText('FREEZER')).toBeVisible({ timeout: 10000 });
  });

  test('B: Add form shows Date Frozen (not Expiry Date) when cabinet is freezer type', async ({ page }) => {
    await purgeAndReset(page);

    await createCategoryAndItem(page, 'Proteins', 'Chicken Breast', '6');

    await page.goto('/');
    await goToCatalogCabinets(page);
    await createFreezerCabinet(page, 'Chest Freezer', 'Utility Room');

    await page.goto('/');
    const catHeader = page.getByTestId('category-header-proteins');
    await expect(catHeader).toBeVisible({ timeout: 15000 });
    await catHeader.click();
    await page.getByTestId('add-btn-chicken-breast').click();
    await expect(page.getByTestId('qty-input')).toBeVisible({ timeout: 10000 });

    await switchCabinetInAddForm(page, 'Chest Freezer');

    // Freezer form: Date Frozen label visible
    await expect(page.getByText('Date Frozen')).toBeVisible({ timeout: 5000 });
    // Standard form: Expiry Date label must NOT be visible
    await expect(page.getByText('Expiry Date')).not.toBeVisible();
  });

  test('C: Date Frozen defaults to current month and year', async ({ page }) => {
    await purgeAndReset(page);

    const now = new Date();
    const currentMonthPadded = (now.getMonth() + 1).toString().padStart(2, '0');
    const currentYear = now.getFullYear().toString();

    await createCategoryAndItem(page, 'Proteins', 'Mince');

    await page.goto('/');
    await goToCatalogCabinets(page);
    await createFreezerCabinet(page, 'Freezer', 'Kitchen');

    await page.goto('/');
    const catHeader = page.getByTestId('category-header-proteins');
    await expect(catHeader).toBeVisible({ timeout: 15000 });
    await catHeader.click();
    await page.getByTestId('add-btn-mince').click();
    await expect(page.getByTestId('qty-input')).toBeVisible({ timeout: 10000 });

    await switchCabinetInAddForm(page, 'Freezer');

    // Month and year buttons should reflect today
    await expect(page.getByText(`Month: ${currentMonthPadded}`)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(`Year: ${currentYear}`)).toBeVisible({ timeout: 5000 });
  });

  test('D: Two freezer batches of same item on different dates produce 2 separate rows', async ({ page }) => {
    await purgeAndReset(page);

    await createCategoryAndItem(page, 'Proteins', 'Salmon');

    await page.goto('/');
    await goToCatalogCabinets(page);
    await createFreezerCabinet(page, 'Freezer', 'Kitchen');

    const now = new Date();
    const currentMonthPadded = (now.getMonth() + 1).toString().padStart(2, '0');
    const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();

    // Batch 1 — current month (default)
    await page.goto('/');
    const catHeader = page.getByTestId('category-header-proteins');
    await expect(catHeader).toBeVisible({ timeout: 15000 });
    await catHeader.click();
    await page.getByTestId('add-btn-salmon').click();
    await expect(page.getByTestId('qty-input')).toBeVisible({ timeout: 10000 });
    await switchCabinetInAddForm(page, 'Freezer');
    await page.getByTestId('size-input').fill('200');
    await page.getByTestId('save-stock-btn').click();
    await expect(page.getByTestId('app-header-title')).toBeVisible({ timeout: 15000 });

    // Batch 2 — explicitly change to previous month
    await catHeader.click();
    await page.getByTestId('add-btn-salmon').click();
    await expect(page.getByTestId('qty-input')).toBeVisible({ timeout: 10000 });
    await switchCabinetInAddForm(page, 'Freezer');
    await page.getByTestId('size-input').fill('200');
    // Change month
    await page.getByText(`Month: ${currentMonthPadded}`).click();
    await page.getByText(prevMonth.toString(), { exact: true }).first().click();
    await page.getByTestId('save-stock-btn').click();
    await expect(page.getByTestId('app-header-title')).toBeVisible({ timeout: 15000 });

    // Expand type — expect 2 distinct batch rows
    await catHeader.click();
    const typeHeader = page.getByTestId('type-header-salmon');
    await expect(typeHeader).toBeVisible({ timeout: 10000 });
    await typeHeader.click();
    const batches = page.locator('[data-testid^="batch-salmon-"]');
    await expect(batches).toHaveCount(2, { timeout: 10000 });
  });

  test('E: Home screen shows FROZEN label and hides EXPIRY for freezer batches', async ({ page }) => {
    await purgeAndReset(page);

    await createCategoryAndItem(page, 'Proteins', 'Pork');

    await page.goto('/');
    await goToCatalogCabinets(page);
    await createFreezerCabinet(page, 'Freezer', 'Garage');

    await page.goto('/');
    const catHeader = page.getByTestId('category-header-proteins');
    await expect(catHeader).toBeVisible({ timeout: 15000 });
    await catHeader.click();
    await page.getByTestId('add-btn-pork').click();
    await expect(page.getByTestId('qty-input')).toBeVisible({ timeout: 10000 });
    await switchCabinetInAddForm(page, 'Freezer');
    await page.getByTestId('size-input').fill('500');
    await page.getByTestId('save-stock-btn').click();
    await expect(page.getByTestId('app-header-title')).toBeVisible({ timeout: 15000 });

    await catHeader.click();
    const typeHeader = page.getByTestId('type-header-pork');
    await expect(typeHeader).toBeVisible({ timeout: 10000 });
    await typeHeader.click();

    // FROZEN label should appear; EXPIRY: N/A must not appear
    await expect(page.getByText(/FROZEN/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('EXPIRY: N/A')).not.toBeVisible();
  });

  test('F: freeze_months field on item type configures urgency threshold', async ({ page }) => {
    await purgeAndReset(page);

    // Short 2-month freeze limit so a batch frozen last month is already near its limit
    await createCategoryAndItem(page, 'Proteins', 'Fish', '2');

    await page.goto('/');
    await goToCatalogCabinets(page);
    await createFreezerCabinet(page, 'Freezer', 'Kitchen');

    await page.goto('/');
    const catHeader = page.getByTestId('category-header-proteins');
    await expect(catHeader).toBeVisible({ timeout: 15000 });
    await catHeader.click();
    await page.getByTestId('add-btn-fish').click();
    await expect(page.getByTestId('qty-input')).toBeVisible({ timeout: 10000 });
    await switchCabinetInAddForm(page, 'Freezer');
    await page.getByTestId('size-input').fill('300');

    // Change freeze month to last month to put item near its 2-month limit
    const now = new Date();
    const currentMonthPadded = (now.getMonth() + 1).toString().padStart(2, '0');
    const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    await page.getByText(`Month: ${currentMonthPadded}`).click();
    await page.getByText(prevMonth.toString(), { exact: true }).first().click();

    await page.getByTestId('save-stock-btn').click();
    await expect(page.getByTestId('app-header-title')).toBeVisible({ timeout: 15000 });

    await catHeader.click();
    await page.getByTestId('type-header-fish').click();

    // Urgency should be visible — either ″Xmo left″ or ″OVERDUE″
    await expect(page.getByText(/mo left|OVERDUE/)).toBeVisible({ timeout: 10000 });
  });
});
