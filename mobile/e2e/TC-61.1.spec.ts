/**
 * NOTE: This test file primarily uses text-based selectors.
 */
import { test, expect } from '@playwright/test';

/**
 * MESS HALL RECIPES (PROMPT GENERATOR)
 * [TC-61.1] VERIFICATION: Prompt Compilation & Clipboard
 */
test.describe('[TC-61.1] Mess Hall Recipes Engine', () => {
  
  test.setTimeout(90000);

  test.beforeEach(async ({ page }) => {
    // 0. Zero-Trust Start
    await page.addInitScript(() => {
      (window as any).__E2E_SKIP_SEEDS__ = true;
    });

    await page.goto('/', { waitUntil: 'networkidle' });
    
    // Authoritative Seed (Native UI Trigger)
    await page.getByTestId('settings-btn').first().click();
    await page.getByText('SYSTEM', { exact: true }).first().click();
    
    // Purge and wait
    await page.getByTestId('debug-purge-db').first().click();
    await page.waitForURL('**/?timestamp=*', { timeout: 10000 }).catch(() => {});
    
    // Return & Seed
    await page.goto('/catalog', { waitUntil: 'networkidle' });
    await page.getByText('SYSTEM', { exact: true }).first().click({ force: true });
    
    // Wait for the dialog event for 'Seeded' alert
    page.once('dialog', dialog => dialog.accept());
    await page.getByTestId('debug-seed-db').first().click();
    await page.waitForTimeout(500); // Wait for alert cycle
    

    // Navigate to Recipes to confirm persistence & generate
    await page.goto('/recipes');
    
    // Set Preferences
    await page.getByText('Vegetarian', { exact: true }).first().click({ force: true });
    await page.getByTestId('fav-ingredients-input').first().fill('Spinach, Garlic');
    await page.getByTestId('avoid-ingredients-input').first().fill('Tuna, Peanuts');
    await page.getByTestId('extra-requests-input').first().fill('Make it a spicy curry');
    
    // Select Mode & Chef
    await page.getByTestId('mode-tab-inspired').first().click();
    await page.getByTestId('chef-chip-gordon-ramsay').first().click();
    
    // Select Allergen
    await page.getByTestId('allergen-chip-peanuts').first().click();
    
    // Wait for auto-save
    await page.waitForTimeout(1000);
    
    // Force reload to ensure bundle is fresh
    await page.reload({ waitUntil: 'networkidle' });
  });

  test('compiles a recipe prompt with persisted preferences and allergens', async ({ page, context }) => {
    // Enable clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto('/recipes');
    
    // Check persistence
    await expect(page.getByText('Vegetarian', { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('allergen-chip-peanuts').first()).toHaveCSS('background-color', 'rgb(239, 68, 68)'); // red
    await expect(page.getByTestId('fav-ingredients-input').first()).toHaveValue('Spinach, Garlic');
    await expect(page.getByTestId('avoid-ingredients-input').first()).toHaveValue('Tuna, Peanuts');
    await expect(page.getByTestId('extra-requests-input').first()).toHaveValue('Make it a spicy curry');
    
    // Verify Persistence
    await expect(page.getByTestId('mode-tab-inspired').first()).toHaveCSS('background-color', 'rgb(51, 65, 85)'); // active tab color
    await expect(page.getByTestId('chef-chip-gordon-ramsay').first()).toHaveCSS('background-color', 'rgb(59, 130, 246)'); // active chip color (blue)

    // Step 1: Generate Prompt (Changes view to Preview)
    await page.getByTestId('generate-prompt-btn').first().click({ force: true });
    await expect(page.getByText('Recipe Briefing')).toBeVisible();

    // Step 2: Copy to Clipboard from Preview
    await page.getByText(/COPY TO CLIPBOARD/i).first().click();
    
    // Step 3: Check feedback
    await expect(page.getByTestId('feedback-banner').first()).toBeVisible();
    await expect(page.getByText(/Prompt copied/i).first()).toBeVisible();

    // Step 4: Audit Clipboard Content
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    
    // VALIDATION
    expect(clipboardText).toContain('## Task');
    expect(clipboardText).toContain('Vegetarian'); // Preference matched
    expect(clipboardText).toContain('Peanuts'); // Allergen included
    expect(clipboardText).toContain('ALLERGIES must be taken into account'); // Safety rule included
    expect(clipboardText).toContain('spicy curry'); // Extra preference included
    expect(clipboardText).toContain('INSPIRED'); // Mode included
    expect(clipboardText).toContain('Gordon Ramsay'); // Chef matched
    expect(clipboardText).toContain('Tuna'); // Soon to expire item should be included
    expect(clipboardText).toContain('Rice'); // Should be included
  });

  test('triggers a consistency warning when zero mandatory items selected', async ({ page }) => {
    await page.goto('/recipes');
    
    // Deselect all expiring items from seed (Tuna + Peanut Butter)
    await page.getByTestId('stock-chip-tuna').first().click();
    await page.getByTestId('stock-chip-peanut-butter').first().click();
    
    // Triggering generate should show inline confirmation
    await page.getByTestId('generate-prompt-btn').first().click();
    
    // Check for inline warning text
    await expect(page.getByText(/No Mandatory Supplies/i)).toBeVisible();
    
    // Click 'CONTINUE ANYWAY'
    await page.getByText(/CONTINUE ANYWAY/i).first().click();
    
    // Should now land on briefing
    await expect(page.getByText('Recipe Briefing')).toBeVisible();
  });

  test('blocks generation on safety conflict (Allergen in Preferred)', async ({ page }) => {
    await page.goto('/recipes');
    
    // Select Eggs as allergen
    await page.getByTestId('allergen-chip-eggs').first().click();
    
    // Add Eggs to Preferred
    await page.getByTestId('fav-ingredients-input').first().fill('Eggs, Garlic');
    
    await page.getByTestId('generate-prompt-btn').first().click();
    
    // Expect feedback banner
    await expect(page.getByTestId('feedback-banner').first()).toBeVisible();
    await expect(page.getByText(/SAFETY CONFLICT/i)).toBeVisible();
    await expect(page.getByText(/EGGS IS A SELECTED ALLERGEN/i)).toBeVisible();
  });

  test('blocks generation on logic conflict (Preferred in Avoided)', async ({ page }) => {
    await page.goto('/recipes');
    
    // Add Lemon to both
    await page.getByTestId('fav-ingredients-input').first().fill('Lemon, Honey');
    await page.getByTestId('avoid-ingredients-input').first().fill('Lemon, Olives');
    
    await page.getByTestId('generate-prompt-btn').first().click();
    
    // Expect feedback banner
    await expect(page.getByTestId('feedback-banner').first()).toBeVisible();
    await expect(page.getByText(/LOGIC CONFLICT/i)).toBeVisible();
    await expect(page.getByText(/LEMON IS BOTH PREFERRED AND FORBIDDEN/i)).toBeVisible();
  });
});
