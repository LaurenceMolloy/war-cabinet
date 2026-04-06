import { test, expect } from '@playwright/test';

test.describe('TC-61.2: Mess Hall Recipes - Prompt Content Auditing', () => {
    
  test.beforeEach(async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    // Navigate to recipes and ensure clean state
    await page.goto('http://localhost:8081/recipes');
    await page.waitForTimeout(2000); // Wait for bundle sync
    await page.reload(); // Ensure fresh state
    await page.waitForSelector('text=Mess Hall Recipes');
  });

  test('Audit Mode: EXPERIMENTAL - Global Inventory & Safety Audit', async ({ page }) => {
    // Step 1: Set Dietary and multiple Allergens
    await page.getByTestId('dietary-chip-vegan').first().click();
    await page.waitForTimeout(500); 
    
    await page.getByTestId('allergen-chip-peanuts').first().click();
    await page.waitForTimeout(500); 
    await page.getByTestId('allergen-chip-eggs').first().click(); // Add second allergy
    await page.waitForTimeout(500); 
    
    // Step 2: Set Preferred and Avoid
    await page.getByTestId('fav-ingredients-input').first().fill('Saffron, Garlic');
    await page.waitForTimeout(500);
    
    await page.getByTestId('avoid-ingredients-input').first().fill('Onion, Liver');
    await page.waitForTimeout(500);
    
    // Step 3: Set Extra Requests
    await page.getByTestId('extra-requests-input').first().fill('One-pot meal only');
    await page.waitForTimeout(1000); 
    
    // Step 4: Generate Prompt
    await page.getByTestId('generate-prompt-btn').first().click();
    await page.waitForTimeout(2000); 
    
    // Step 5: Copy to clipboard
    await page.getByTestId('copy-to-clipboard-btn').first().click();
    
    // Step 6: Audit Clipboard Content
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    
    // --- DOCTRINAL AUDITS ---
    expect(clipboardText).toMatch(/\*\*Dietary Preference:\*\*\s*Vegan/);
    
    // Audit Allergies (Extract, Sort, Compare)
    const allergiesSection = (clipboardText.match(/\*\*Allergies:\*\*\s*([\s\S]*?)(?=---)/) || [])[1] || "";
    const allergiesItems = allergiesSection.split('\n').map(i => i.replace('-', '').trim()).filter(i => i.length > 0 && !i.includes('None declared')).sort();
    expect(allergiesItems).toEqual(['Eggs', 'Peanuts']);
    
    // --- INVENTORY AUDITS (Inferred from Cabinet) ---
    // Audit Expiring (Should contain Tuna and Peanut Butter from Seed)
    const expiringSection = (clipboardText.match(/### Expiring[^#]+([\s\S]*?)(?=###)/) || [])[1] || "";
    expect(expiringSection).toContain('Tuna');
    expect(expiringSection).toContain('Peanut Butter');
    const expiringCount = expiringSection.split('\n').filter(i => i.trim().length > 0).length;
    expect(expiringCount).toBe(2);

    // Audit Available (Should contain Rice from Seed)
    const availableSection = (clipboardText.match(/### Available[^#]+([\s\S]*?)(?=###)/) || [])[1] || "";
    expect(availableSection).toContain('Rice');
    const availableCount = availableSection.split('\n').filter(i => i.trim().length > 0).length;
    expect(availableCount).toBe(1);

    // --- USER PREFERENCE AUDITS ---
    // Audit Preferred précisément
    const preferredSection = (clipboardText.match(/### Preferred\s*([\s\S]*?)(?=###|$)/) || [])[1] || "";
    const preferredItems = preferredSection.split(',').map(i => i.trim()).filter(i => i.length > 0 && !i.includes('None declared')).sort();
    expect(preferredItems).toEqual(['Garlic', 'Saffron']);
    
    // Audit Avoid précisément
    const avoidSection = (clipboardText.match(/### Avoid\s*([\s\S]*?)(?=###|$)/) || [])[1] || "";
    const avoidItems = avoidSection.split(',').map(i => i.trim()).filter(i => i.length > 0 && !i.includes('None declared')).sort();
    expect(avoidItems).toEqual(['Liver', 'Onion']);
    
    expect(clipboardText).toContain('One-pot meal only'); 
    expect(clipboardText).toContain('Mode: EXPERIMENTAL'); 
    expect(clipboardText).toContain('Ingredients Table'); 
    
    // ASSERT: Absence of higher-mode features
    expect(clipboardText.toLowerCase()).not.toContain("chef's note");
  });

  test('Audit Mode: INSPIRED - Chef Logic & Voice', async ({ page }) => {
    // Step 1: Select INSPIRED mode and Ottolenghi
    await page.getByTestId('mode-tab-inspired').first().click();
    await page.getByTestId('chef-chip-ottolenghi').first().click();
    
    // Step 2: Generate Prompt
    await page.getByTestId('generate-prompt-btn').first().click();
    
    // Step 3: Copy to clipboard
    await page.getByTestId('copy-to-clipboard-btn').first().click();
    
    // Step 4: Audit Clipboard Content
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    
    // ASSERT: Mode-specific Chef Logic (Anchored)
    expect(clipboardText).toContain('Mode: INSPIRED');
    expect(clipboardText).toMatch(/Chef Influence:[^#]+Ottolenghi/s);
    expect(clipboardText).toMatch(/### Chef's Note[^#]+Ottolenghi/s);
  });

  test('Audit Mode: AUTHENTIC - Archival Match & Fallbacks', async ({ page }) => {
    // Step 1: Select AUTHENTIC mode and BBC Good Food
    await page.getByTestId('mode-tab-authentic').first().click();
    await page.getByTestId('chef-chip-bbc-good-food').first().click();
    
    // Step 2: Generate Prompt
    await page.getByTestId('generate-prompt-btn').first().click();
    
    // Step 3: Copy to clipboard
    await page.getByTestId('copy-to-clipboard-btn').first().click();
    
    // Step 4: Audit Clipboard Content
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    
    // ASSERT: Mode-specific Research Logic (Anchored)
    expect(clipboardText).toContain('Mode: AUTHENTIC');
    expect(clipboardText).toMatch(/Target Source:[^#]+BBC Good Food/s);
    expect(clipboardText).toMatch(/Search Intel Fallback[^#]+BBC Good Food/s);
    
    // ASSERT: Strict Format absence
    expect(clipboardText).not.toContain('Ingredients Table');
    expect(clipboardText).not.toContain('Steps');
  });

});
