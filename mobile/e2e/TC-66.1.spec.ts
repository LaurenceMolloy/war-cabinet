import { test, expect } from '@playwright/test';

/**
 * STRATEGIC LOGISTICS: FRIDGE STAPLES & PERISHABLE CONTEXT
 * [TC-66.1] VERIFICATION: Preset selection, persistence of learned items, and alphabetised prompt generation.
 */
test.describe('[TC-66.1] Fridge Staples Integration', () => {
  
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    // Zero-trust initialization: Wipe seeds and clear database
    await page.addInitScript(() => { (window as any).__E2E_SKIP_SEEDS__ = true; });
    await page.goto('/');
    
    // Purge data via System Tab in Catalog
    const settingsBtn = page.getByTestId('settings-btn').first();
    await expect(settingsBtn).toBeVisible({ timeout: 20000 });
    await settingsBtn.click();
    
    await page.getByTestId('tab-system').click();
    await page.getByTestId('debug-purge-db').click();
    await page.waitForTimeout(1000);
    
    // Return to Recipes screen
    await page.goto('/recipes');
    await expect(page.getByText('Mess Hall Mission')).toBeVisible({ timeout: 15000 });
  });

  test('validates staple tokens, custom parsing, and prompt alphabetization', async ({ page }) => {
    // 1. Initial Preset Verification
    // Pre-sets are: Butter, Carrots, Eggs, Leeks, Milk, Peppers
    const eggsChip = page.getByTestId('fridge-staple-chip-eggs');
    await expect(eggsChip).toBeVisible();
    await eggsChip.click();

    // 2. Custom Token Learning (Comma Separated) - NO EXPLICIT BLUR
    const staplesInput = page.getByTestId('fridge-staples-input');
    await staplesInput.fill('Garlic,  onions, Spinach');
    
    // 3. Generate Prompt (This implicitly tests the handleView logic catching unblurred text!)
    // Selected: Eggs (Preset), Garlic, Onions, Spinach (Custom)
    await page.getByRole('button', { name: /generate prompt/i }).click();

    // Handle bypass if no expiring items (which there shouldn't be in a purged DB)
    try { 
        await page.getByRole('button', { name: /continue anyway/i }).click({ timeout: 3000 }); 
    } catch (e) {}

    await expect(page.getByText('Recipe Briefing')).toBeVisible({ timeout: 15000 });
    const briefingText = await page.getByTestId('prompt-text').textContent();

    // 6. Verification of the Fridge Staples section
    expect(briefingText).toContain('Fridge Staples (available/fresh)');
    
    // Verify alphabetical order: Eggs, Garlic, Onions, Spinach
    const eggsIdx = briefingText?.indexOf('Eggs') ?? -1;
    const garlicIdx = briefingText?.indexOf('Garlic') ?? -1;
    const onionsIdx = briefingText?.indexOf('Onions') ?? -1;
    const spinachIdx = briefingText?.indexOf('Spinach') ?? -1;

    expect(eggsIdx).toBeGreaterThan(-1);
    expect(garlicIdx).toBeGreaterThan(eggsIdx);
    expect(onionsIdx).toBeGreaterThan(garlicIdx);
    expect(spinachIdx).toBeGreaterThan(onionsIdx);

    // 6. Verify Persistence after Reload
    await page.reload();
    await expect(page.getByTestId('fridge-staple-chip-garlic')).toBeVisible();
    // Verify Garlic is still selected? In our code, we save selected status too.
  });
});
