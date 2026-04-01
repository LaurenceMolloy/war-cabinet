import { test, expect } from '@playwright/test';

/**
 * STRATEGIC VERIFICATION (ITERATION 1)
 * [TC-1.1a] VERIFICATION: New Batch Creation Behaviour
 */
test.describe('[TC-1.1a] New Batch Creation Behaviour', () => {
  
  // Extend timeout for this complex 4-step E2E sequence
  test.setTimeout(60000);

  // Time-Independent Expiry logic
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const getRelativeExpiry = (monthsFromNow: number) => {
    let m = currentMonth + monthsFromNow;
    let y = currentYear;
    while (m > 12) { m -= 12; y++; }
    return { month: m.toString(), year: y.toString() };
  };

  const expBaseline = getRelativeExpiry(2); // e.g., "2 MONTHS"
  const expChanged = getRelativeExpiry(8);  // e.g., "8 MONTHS"

  const ensureExpanded = async (page: any) => {
    await page.waitForTimeout(1000); // Give React/DB a breather
    const riceBtn = page.getByTestId('add-btn-rice');
    if (!(await riceBtn.isVisible())) {
      await page.getByText('Carbs', { exact: true }).click();
      await expect(riceBtn).toBeVisible({ timeout: 5000 });
    }
  };

  const openRiceForm = async (page: any) => {
    await ensureExpanded(page);
    await page.getByTestId('add-btn-rice').click();
    await expect(page.getByTestId('qty-input')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(500);
  };

  const selectExpiry = async (page: any, month: string, year: string) => {
    await page.getByText(/Month:/i).click();
    await page.getByText(month, { exact: true }).click();
    await page.getByText(/Year:/i).click();
    await page.getByText(year, { exact: true }).click();
  };

  test.beforeEach(async ({ page }) => {
    // 0. Zero-Trust Start
    await page.addInitScript(() => {
      (window as any).__E2E_SKIP_SEEDS__ = true;
    });

    await page.goto('/');

    // 1. Provision Cabinets (wait for success)
    await page.getByTestId('settings-btn').click(); 
    await page.getByText('CABINETS', { exact: true }).click();
    
    await page.getByTestId('new-cab-name-input').fill('Pantry'); 
    await page.getByTestId('create-cab-btn').click();
    await expect(page.getByText('Pantry')).toBeVisible();

    await page.getByTestId('new-cab-name-input').fill('Garage');
    await page.getByTestId('create-cab-btn').click();
    await expect(page.getByText('Garage')).toBeVisible();

    // 2. Provision Categories/Items (wait for success)
    await page.getByText('CATEGORIES', { exact: true }).click();
    await page.getByTestId('new-cat-input').fill('Carbs');
    await page.getByTestId('create-cat-btn').click();
    await expect(page.getByText('Carbs')).toBeVisible();

    await page.getByTestId('expand-add-item-carbs').click(); 
    await page.getByTestId('new-item-name-input').fill('Rice');
    await page.getByTestId('submit-item-type-btn').click();
    await expect(page.getByTestId('submit-item-type-btn')).toBeHidden();

    // 3. Baseline Data: Size 500, Expiry +2m, Qty 1, Pantry
    await page.goto('/'); 
    await openRiceForm(page);
    await page.getByTestId('size-input').fill('500');
    await selectExpiry(page, expBaseline.month, expBaseline.year);
    await page.getByTestId('cabinet-selector').click();
    await page.getByText('Pantry', { exact: true }).click();
    await page.getByTestId('save-stock-btn').click();
    await expect(page.getByTestId('save-stock-btn')).toBeHidden();
  });


  test('verifies distinct combinations of Size, Location, Expiry, and Quantity', async ({ page }) => {
    
    // Robust Identity Verification that searches displayed text INSIDE specific batch rows
    const verifyIdentity = async (sizeLabel: string, cabinet: string, monthsRel: number, qty: string) => {
      await ensureExpanded(page);
      
      const row = page.locator('div[data-testid^="batch-rice-"]').filter({
        hasText: sizeLabel,   // "500g"
        hasText: cabinet     // "Pantry"
      }).filter({
        hasText: `${monthsRel} MONTHS`
      });

      await expect(row.first()).toBeVisible();
      // Ensure quantity badge inside the MATCHED row is correct
      await expect(row.first().getByTestId('qty-text')).toHaveText(qty);
    };

    // --- CASE 1: CANCELLED BATCH ---
    await openRiceForm(page);
    await page.getByTestId('cancel-btn').click();
    await expect(page.getByTestId('cancel-btn')).toBeHidden();
    await expect(page.locator('div[data-testid^="batch-rice-"]')).toHaveCount(1);


    // --- CASE 2: SIZE CHANGE -> 750 (display 750g) ---
    await openRiceForm(page);
    await page.getByTestId('size-input').fill('750');
    await selectExpiry(page, expBaseline.month, expBaseline.year);
    await page.getByTestId('save-stock-btn').click();
    await expect(page.getByTestId('save-stock-btn')).toBeHidden();

    await verifyIdentity('500g', 'Pantry', 2, '1');
    await verifyIdentity('750g', 'Pantry', 2, '1');


    // --- CASE 3: LOCATION & QTY CHANGE -> Garage + Qty 2 ---
    await openRiceForm(page);
    await page.getByTestId('size-input').fill('500');
    await page.getByTestId('qty-input').fill('2');
    await page.getByTestId('cabinet-selector').click();
    await page.getByText('Garage', { exact: true }).click();
    await page.getByTestId('save-stock-btn').click();
    await expect(page.getByTestId('save-stock-btn')).toBeHidden();

    await verifyIdentity('500g', 'Garage', 2, '2');


    // --- CASE 4: EXPIRY & QTY CHANGE -> +8 Months + Qty 3 ---
    await openRiceForm(page);
    await page.getByTestId('size-input').fill('500');
    await page.getByTestId('qty-input').fill('3');
    await selectExpiry(page, expChanged.month, expChanged.year);
    await page.getByTestId('save-stock-btn').click();
    await expect(page.getByTestId('save-stock-btn')).toBeHidden();

    // Final Assertion: ALL 4 batches now coexist with their specific metadata
    await verifyIdentity('500g', 'Pantry', 8, '3');
    await expect(page.locator('div[data-testid^="batch-rice-"]')).toHaveCount(4);
  });
});
