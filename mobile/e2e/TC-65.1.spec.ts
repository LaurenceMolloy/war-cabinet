import { test, expect } from '@playwright/test';

/**
 * STRATEGIC LOGISTICS: DATA SOVEREIGNTY (UNIT DECOUPLING)
 * [TC-65.1] VERIFICATION: Unit Isolation & Dynamic Formatting
 */
test.describe('[TC-65.1] Data Sovereignty & Unit Simplification', () => {
  
  test.setTimeout(120000);

  const openFlourAddForm = async (page: any) => {
    if (!page.url().endsWith('/')) { 
        await page.goto('/'); 
    }
    
    // Ensure Dashboard is stable
    await expect(page.getByTestId('app-header-title')).toBeVisible({ timeout: 15000 });
    
    const catHeader = page.getByTestId('category-header-pantry');
    await expect(catHeader).toBeVisible({ timeout: 20000 });
    
    const typeHeader = page.getByTestId('type-header-flour');
    if (!(await typeHeader.isVisible().catch(() => false))) {
        await catHeader.click();
        await expect(typeHeader).toBeVisible({ timeout: 10000 });
    }
    
    await typeHeader.click(); // Expand batches
    
    const addBtn = page.getByTestId('add-btn-flour');
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await addBtn.click();
    await expect(page.getByTestId('qty-input')).toBeVisible({ timeout: 10000 });
  };

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { (window as any).__E2E_SKIP_SEEDS__ = true; });
    await page.goto('/');
    
    // Purge logic with high patience
    const settingsBtn = page.getByTestId('settings-btn').first();
    await expect(settingsBtn).toBeVisible({ timeout: 20000 });
    await settingsBtn.click();
    
    await page.getByTestId('tab-system').click();
    
    const purgeBtn = page.getByTestId('debug-purge-db').first();
    await expect(purgeBtn).toBeVisible({ timeout: 10000 });
    await purgeBtn.click();
    
    await page.waitForTimeout(2000);
    await page.goto('/');
    
    // Setup initial data path
    await expect(page.getByTestId('settings-btn').first()).toBeVisible({ timeout: 20000 });
    await page.getByTestId('settings-btn').first().click();
    
    await page.getByTestId('tab-categories').click();
  });

  test('enforces numeric-only editing and dynamic unit display', async ({ page }) => {
    // 1. Create Category
    await page.getByTestId('new-cat-input').fill('Pantry');
    await page.getByTestId('create-cat-btn').click();
    await expect(page.getByText('Pantry', { exact: true })).toBeVisible({ timeout: 15000 });

    // 2. Create Item Type
    await page.getByTestId('expand-add-item-pantry').click();
    await page.getByTestId('new-item-name-input').fill('Flour');
    await page.getByTestId('new-item-default-size-input').fill('500');
    await page.getByTestId('submit-item-type-btn').click();
    await expect(page.getByText('Flour', { exact: true })).toBeVisible({ timeout: 10000 });

    // 3. Verify Catalog Badge shows '500g'
    const flourRow = page.getByTestId('type-row-flour');
    await expect(flourRow.getByTestId('default-size-badge')).toContainText('500g', { timeout: 10000 });

    // 4. Verify Edit Input displays numeric '500'
    await flourRow.getByTestId('edit-type-btn-flour').click();
    await expect(page.getByTestId('edit-item-default-size-input')).toHaveValue('500');
    
    // 5. Test auto-scaling: 1500 -> 1.5kg
    await page.getByTestId('edit-item-default-size-input').fill('1500');
    await page.getByTestId('save-item-type-btn').click();
    await page.waitForTimeout(1000);
    await expect(flourRow.getByTestId('default-size-badge')).toContainText('1.5kg', { timeout: 10000 });

    // 6. Add Stock on Dashboard
    await page.goto('/');
    await openFlourAddForm(page);
    await expect(page.getByTestId('size-input')).toHaveValue('1500');
    await page.getByTestId('size-input').fill('250');
    await page.getByTestId('save-stock-btn').click();
    
    // 7. Verify Dashboard Badge shows '250g'
    await expect(page.getByTestId('app-header-title')).toBeVisible({ timeout: 15000 });
    
    const flourTypeHeader = page.getByTestId('type-header-flour');
    await expect(flourTypeHeader).toBeVisible({ timeout: 10000 });
    
    // It might already be expanded from step 6, but let's ensure
    const batchList = page.locator('[data-testid^="batch-flour-"]');
    if (!(await batchList.first().isVisible().catch(() => false))) {
        await flourTypeHeader.click();
    }
    
    const firstBatch = batchList.first();
    const batchIdAttr = await firstBatch.getAttribute('data-testid');
    const bId = batchIdAttr?.replace('batch-flour-', '');
    await expect(page.getByTestId(`size-text-${bId}`)).toContainText('250g', { timeout: 10000 });

    // 8. Verify Dashboard Edit form shows numeric '250'
    await page.getByTestId(`edit-batch-${bId}`).click();
    await expect(page.getByTestId('size-input')).toHaveValue('250');
    await page.getByTestId('cancel-btn').click();

    // 9. Verify AI Prompt re-attaches units correctly
    await page.goto('/recipes');
    await page.getByRole('tab', { name: /inspired/i }).click();
    await page.getByRole('button', { name: /generate prompt/i }).click();
    try { await page.getByRole('button', { name: /continue anyway/i }).click({ timeout: 5000 }); } catch (e) {}

    await expect(page.getByText('Recipe Briefing')).toBeVisible({ timeout: 15000 });
    const briefingText = await page.getByTestId('prompt-text').textContent();
    expect(briefingText).toContain('Flour (250g)');
  });
});
