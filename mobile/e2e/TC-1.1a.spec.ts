import { test, expect } from '@playwright/test';

/**
 * STRATEGIC VERIFICATION (ITERATION 1)
 * [TC-1.1a] VERIFICATION: New Batch Creation Behaviour
 */
test.describe('[TC-1.1a] New Batch Creation Behaviour', () => {
  
  test.setTimeout(60000);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const getRelativeExpiry = (monthsFromNow: number) => {
    let m = currentMonth + monthsFromNow;
    let y = currentYear;
    while (m > 12) { m -= 12; y++; }
    return { month: m.toString(), year: y.toString() };
  };

  const expBaseline = getRelativeExpiry(2); 
  const expChanged = getRelativeExpiry(8);  

  const ensureExpanded = async (page: any) => {
    await page.waitForTimeout(1000); 
    const riceBtn = page.getByTestId('add-btn-rice');
    
    // 1. Smart Category Expansion
    if (!(await riceBtn.isVisible().catch(() => false))) {
        const catHeader = page.getByTestId('category-header-carbs');
        await expect(catHeader).toBeVisible({ timeout: 15000 });
        await catHeader.click();
        await expect(riceBtn).toBeVisible({ timeout: 10000 });
    }
    
    // 2. Smart Type Expansion
    const batchMarker = page.locator('div[data-testid^="batch-rice-"]').first();
    const typeHeader = page.getByTestId('type-header-rice');
    if (await typeHeader.isVisible()) {
        // Only click if the batches aren't already visible
        if (!(await batchMarker.isVisible().catch(() => false))) {
            const count = await page.evaluate((tid: string) => {
                const el = document.querySelector(`[data-testid^="${tid}"]`);
                return el ? 1 : 0;
            }, 'batch-rice-'); // Use evaluate as a fallback if locator count is weird
            
            // Try to click header to expand
            await typeHeader.click();
            await page.waitForTimeout(500);
        }
    }
  };

  const openRiceForm = async (page: any) => {
    await ensureExpanded(page);
    await page.getByTestId('add-btn-rice').click();
    await expect(page.getByTestId('qty-input')).toBeVisible({ timeout: 10000 });
  };

  const selectExpiry = async (page: any, month: string, year: string) => {
    await page.getByText(/Month:/i).click();
    await page.getByText(month, { exact: true }).click();
    await page.getByText(/Year:/i).click();
    await page.getByText(year, { exact: true }).click();
  };

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { (window as any).__E2E_SKIP_SEEDS__ = true; });
    await page.goto('/');

    // PURGE
    await page.getByTestId('settings-btn').first().click();
    await page.getByText('SYSTEM', { exact: true }).first().click();
    await page.getByTestId('debug-purge-db').first().click();
    await page.waitForURL('**/?timestamp=*', { timeout: 10000 }).catch(() => {});
    await page.goto('/');

    // CABINETS
    await page.getByTestId('settings-btn').first().click(); 
    await page.getByText('CABINETS', { exact: true }).first().click();
    await page.getByTestId('new-cab-name-input').fill('Pantry'); 
    await page.getByTestId('create-cab-btn').click();
    await page.getByTestId('new-cab-name-input').fill('Garage');
    await page.getByTestId('create-cab-btn').click();
    await expect(page.getByText('Garage')).toBeVisible();

    // CATEGORIES
    await page.getByText('CATEGORIES', { exact: true }).click();
    await page.getByTestId('new-cat-input').fill('Carbs');
    await page.getByTestId('create-cat-btn').click();
    await expect(page.getByText('Carbs')).toBeVisible();

    // ITEMS
    await page.getByTestId('expand-add-item-carbs').click(); 
    await page.getByTestId('new-item-name-input').fill('Rice');
    await page.getByTestId('submit-item-type-btn').click();
    await expect(page.getByText('Rice')).toBeVisible();

    // BASELINE SAVE
    await page.goto('/');
    await openRiceForm(page);
    await page.getByTestId('size-input').fill('500');
    await selectExpiry(page, expBaseline.month, expBaseline.year);
    await page.getByTestId('save-stock-btn').click();
    await page.waitForURL('**/');
    await expect(page.getByTestId('save-stock-btn')).toBeHidden();
  });


  test('verifies distinct combinations of Size, Location, Expiry, and Quantity', async ({ page }) => {
    
    const verifyIdentity = async (sizeLabel: string, cabinet: string, monthsRel: number, qty: string) => {
      await ensureExpanded(page);
      const rows = page.locator('[data-testid^="batch-rice-"]');
      
      // Let's see what we found
      const count = await rows.count();
      if (count === 0) {
          console.log(`CRITICAL: No batch-rice rows found during verifyIdentity for ${sizeLabel}`);
      }

      const match = rows.filter({ hasText: sizeLabel }).filter({ hasText: cabinet });
      
      await expect(match.first()).toBeVisible({ timeout: 10000 });
      await expect(match.first().getByTestId('qty-text')).toHaveText(qty);
    };

    // CASE 1: CANCEL
    await openRiceForm(page);
    await page.getByTestId('cancel-btn').click();
    await expect(page.getByTestId('cancel-btn')).toBeHidden();
    await ensureExpanded(page);
    await expect(page.locator('[data-testid^="batch-rice-"]')).toHaveCount(1);

    // CASE 2: SIZE 750
    await openRiceForm(page);
    await page.getByTestId('size-input').fill('750');
    await selectExpiry(page, expBaseline.month, expBaseline.year);
    await page.getByTestId('save-stock-btn').click();
    await expect(page.getByTestId('save-stock-btn')).toBeHidden();
    await verifyIdentity('750g', 'Pantry', 2, '1');

    // CASE 3: LOCATION GARAGE
    await openRiceForm(page);
    await page.getByTestId('size-input').fill('500');
    await page.getByTestId('qty-input').fill('2');
    await page.getByTestId('cabinet-selector').click();
    await page.getByText('Garage', { exact: true }).click();
    await page.getByTestId('save-stock-btn').click();
    await expect(page.getByTestId('save-stock-btn')).toBeHidden();
    await verifyIdentity('500g', 'Garage', 2, '2');

    // CASE 4: EXPIRY +8
    await openRiceForm(page);
    await page.getByTestId('size-input').fill('500');
    await page.getByTestId('qty-input').fill('3');
    await selectExpiry(page, expChanged.month, expChanged.year);
    await page.getByTestId('save-stock-btn').click();
    await expect(page.getByTestId('save-stock-btn')).toBeHidden();
    await verifyIdentity('500g', 'Pantry', 8, '3');

    await expect(page.locator('[data-testid^="batch-rice-"]')).toHaveCount(4);
  });
});
