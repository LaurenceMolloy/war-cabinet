/**
 * NOTE: This test file primarily uses role-based selectors where possible.
 */
import { test, expect } from '@playwright/test';

/**
 * MESS HALL RECIPES (MEMORIZED CHEF SELECTION)
 * [TC-64.1] VERIFICATION: Memorized Chef Selection & History
 */
test.describe('[TC-64.1] Memorized Chef Selection', () => {
  
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    // 0. Zero-Trust Start
    await page.addInitScript(() => {
      (window as any).__E2E_SKIP_SEEDS__ = true;
    });

    await page.goto('/', { waitUntil: 'load' });
    
    // Purge DB via System Settings to ensure clean state
    await page.getByRole('button', { name: /settings/i }).first().click();
    await page.getByRole('tab', { name: /system/i }).click();
    await page.getByTestId('debug-purge-db').click();
    
    // Return to Recipes
    await page.goto('/recipes', { waitUntil: 'load' });
  });

  test('memorizes last two custom chef suggestions and evicts the oldest', async ({ page }) => {
    // Select Inspired Mode so Chef Intel is visible
    await page.getByRole('tab', { name: /inspired/i }).click();

    const input = page.getByTestId('custom-chef-input');
    await expect(input).toBeVisible();

    // --- STEP 1: Add First Chef (Marco Pierre White) ---
    await input.fill('Marco Pierre White');
    await page.getByRole('button', { name: /generate prompt/i }).click();
    
    // Handle 'No Mandatory Supplies' warning
    try {
        await page.getByRole('button', { name: /continue anyway/i }).click({ timeout: 5000 });
    } catch (e) {}

    await expect(page.getByText('Recipe Briefing')).toBeVisible();
    await expect(page.getByText(/Marco Pierre White/i)).toBeVisible();
    await page.getByRole('button', { name: /close/i }).click();
    
    // Verify first history chip appears
    await expect(page.getByRole('button', { name: /marco pierre white/i }).first()).toBeVisible();

    // --- STEP 2: Add Second Chef (Heston Blumenthal) ---
    await input.fill('Heston Blumenthal');
    await page.getByRole('button', { name: /generate prompt/i }).click();
    
    try {
        await page.getByRole('button', { name: /continue anyway/i }).click({ timeout: 5000 });
    } catch (e) {}

    await expect(page.getByText('Recipe Briefing')).toBeVisible();
    await expect(page.getByText(/Heston Blumenthal/i)).toBeVisible();
    await page.getByRole('button', { name: /close/i }).click();
    
    // Verify BOTH chips are now visible
    await expect(page.getByRole('button', { name: /marco pierre white/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /heston blumenthal/i }).first()).toBeVisible();

    // --- STEP 3: Add Third Chef (Alison Roman) - Should Evict Marco ---
    await input.fill('Alison Roman');
    await page.getByRole('button', { name: /generate prompt/i }).click();
    
    try {
        await page.getByRole('button', { name: /continue anyway/i }).click({ timeout: 5000 });
    } catch (e) {}

    await expect(page.getByText('Recipe Briefing')).toBeVisible();
    await page.getByRole('button', { name: /close/i }).click();
    
    // Verify Sliding Window: Recent two are Alison and Heston
    await expect(page.getByRole('button', { name: /alison roman/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /heston blumenthal/i }).first()).toBeVisible();
    
    // Verify Eviction: The oldest one (Marco) should be gone
    await expect(page.getByRole('button', { name: /marco pierre white/i })).not.toBeVisible();

    // --- STEP 4: Verify Selection from History ---
    // Clear input to demonstrate chip selection
    await input.fill('');
    await page.getByRole('button', { name: /heston blumenthal/i }).first().click();
    
    await page.getByRole('button', { name: /generate prompt/i }).click();
    try {
        await page.getByRole('button', { name: /continue anyway/i }).click({ timeout: 5000 });
    } catch (e) {}

    await expect(page.getByText('Recipe Briefing')).toBeVisible();
    await expect(page.getByText(/Heston Blumenthal/i)).toBeVisible();
  });
});
