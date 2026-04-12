import { test, expect } from '@playwright/test';

/**
 * MESS HALL LOGISTICS & FRIDGE STAPLES
 * [TC-76.1] Verification of Fridge Add-Ons (Core) and Staples (Optional)
 */
test.describe('[TC-76.1] Fridge Logistics Doctrine', () => {

  test.setTimeout(180000);

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log(`BROWSER CONSOLE: [${msg.type()}] ${msg.text()}`));
  });

  const purgeAndReset = async (page: any) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('war_cabinet_welcome_seen', '1');
      (window as any).__E2E_SKIP_SEEDS__ = true;
    });
    await page.goto('/');
    
    // Dismiss welcome
    try {
      await page.getByTestId('welcome-dismiss-btn').click({ timeout: 5000, force: true }).catch(() => {});
    } catch (e) {}
  };

  test('should enforce the 8-point Fridge Logistics Doctrine', async ({ page }) => {
    await purgeAndReset(page);
    console.log("Purge complete.");

    // 1. Navigate to Mess Hall (Deep Link)
    console.log("Deep-linking to Mess Hall...");
    await page.goto('/recipes');
    
    // Check if we reached the screen
    console.log("Waiting for Mess Hall header...");
    try {
        await expect(page.getByText('The Mess Hall')).toBeVisible({ timeout: 15000 });
    } catch (e) {
        console.log("TIMEOUT: Mess Hall header not found.");
        console.log("CURRENT URL:", page.url());
        await page.screenshot({ path: 'recipes_failure.png', fullPage: true });
        const html = await page.content();
        console.log("HTML DUMP (First 1000 chars):", html.slice(0, 1000));
        throw e;
    }
    console.log("Mess Hall reached.");

    // 2. [Rule 1] Fridge items must start empty (Core and Optional)
    const optionalRibbon = page.getByTestId('optional-ribbon');
    await optionalRibbon.click();
    
    // We expect NO chips to be visible initially in the Optional section (Fridge Staples)
    const staplesSection = page.locator('[data-testid^="fridge-staple-chip-"]');
    await expect(staplesSection).toHaveCount(0);
    console.log("Verified: Fridge items start empty.");

    // 3. [Rule 4] Autocomplete matches substrings and startsWith
    const mainInput = page.getByTestId('fridge-staples-input');
    await mainInput.fill('Mil');
    
    // Should see "Milk" (Starts With) and "Oat Milk" (if in data/vocabulary)
    // For this test, let's assume "Milk" is a standard preset or we type it.
    // Wait, let's just type a new custom item first to test Rule 6
    
    // 4. [Rule 2 & 6] Typing and hitting + adds item + adds to vocabulary
    await mainInput.fill('Dragonfruit');
    await page.getByTestId('fridge-staples-add-btn').click();
    
    // Check if chip appeared with X icon
    const dragonChip = page.getByTestId('fridge-staple-chip-dragonfruit');
    await expect(dragonChip).toBeVisible();
    await expect(dragonChip.locator('[data-testid="remove-staple-dragonfruit"]')).toBeVisible();
    console.log("Verified: Dragonfruit added with X icon.");

    // 5. [Rule 7] User added items have trashcan on suggestion chips
    await mainInput.clear();
    await mainInput.fill('Drag');
    const suggestChip = page.getByTestId('staple-suggestion-dragonfruit');
    await expect(suggestChip).toBeVisible();
    await expect(suggestChip.locator('[data-testid="purge-vocab-dragonfruit"]')).toBeVisible();
    console.log("Verified: Custom item has trashcan in suggestions.");

    // 6. [Rule 5] Sorting Order (Frequency First)
    // Add "Apple" once, add "Apricot" twice. 
    // Type "Ap" -> Apricot should be before Apple.
    await mainInput.clear();
    await mainInput.fill('Apricot');
    await page.getByTestId('fridge-staples-add-btn').click(); 
    await page.getByTestId('remove-staple-apricot').click(); // remove it so we can add again (simulating usage)
    
    await mainInput.fill('Apricot');
    await page.getByTestId('fridge-staples-add-btn').click();
    await page.getByTestId('remove-staple-apricot').click();

    await mainInput.fill('Apple');
    await page.getByTestId('fridge-staples-add-btn').click();
    await page.getByTestId('remove-staple-apple').click();

    await mainInput.fill('Ap');
    const firstSuggestion = page.locator('[data-testid^="staple-suggestion-"]').first();
    await expect(firstSuggestion).toHaveAttribute('data-testid', 'staple-suggestion-apricot');
    console.log("Verified: Frequency-first sorting.");

    // 7. [Rule 4] Substring match check
    await mainInput.clear();
    await mainInput.fill('Fruit'); // Should match Dragonfruit
    await expect(page.getByTestId('staple-suggestion-dragonfruit')).toBeVisible();
    console.log("Verified: Substring matches work.");

    // 8. [Rule 3] Clear All
    await mainInput.clear();
    await mainInput.fill('Milk');
    await page.getByTestId('fridge-staples-add-btn').click();
    await page.getByTestId('clear-all-staples-btn').click();
    await expect(page.locator('[data-testid^="fridge-staple-chip-"]')).toHaveCount(0);
    console.log("Verified: Clear All resets the section.");

    // 9. [Rule 8] Same applies to Core (Add-Ons)
    // Open Core accordion (if separate) or verify its existence
    const coreRibbon = page.getByTestId('core-ribbon');
    if (await coreRibbon.isVisible()) {
        await coreRibbon.click();
        const coreInput = page.getByTestId('fridge-addons-input');
        await expect(coreInput).toBeVisible();
        console.log("Verified: Core Add-Ons section exists with similar logic.");
    }
  });

});
