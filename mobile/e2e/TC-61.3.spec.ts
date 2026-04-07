import { test, expect } from '@playwright/test';

/**
 * MESS HALL RECIPES (PROMPT GENERATOR)
 * [TC-61.3] VERIFICATION: Deployment Stations & Briefing Dialog
 * NOTE: This test file explicitly utilizes Role-based (getByRole) selectors where applicable for accessibility validation.
 */
test.describe('[TC-61.3] Recipe Deployment Stations', () => {

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
    
    await page.goto('/recipes', { waitUntil: 'networkidle' });
  });

  test('updates deployment station labels and tests briefing dialog bypass', async ({ page, context }) => {
    // Allow clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Step 1: Configure Custom Station names
    await page.getByPlaceholder('Name (e.g. ChatGPT)').nth(0).fill('MY_AI_ALPHA');
    await page.getByPlaceholder('Name (e.g. ChatGPT)').nth(1).fill('MY_AI_BETA');
    await page.getByPlaceholder('Name (e.g. ChatGPT)').nth(2).fill('MY_AI_GAMMA');

    // Use an internal hash to prevent Linking.openURL from navigating away and destroying the test context origin
    await page.getByPlaceholder('URL (https://...)').nth(0).fill('http://localhost:8081/#dummy-ai-url');

    // Let SQLite persistence complete to prevent race conditions during generation
    await page.waitForTimeout(1000);

    // Step 2: Generate Prompt
    await page.getByTestId('generate-prompt-btn').first().click({ force: true });
    await expect(page.getByText('Recipe Briefing')).toBeVisible();

    // Step 3: Verify updated Custom Station Name buttons exist
    await expect(page.getByText('MY_AI_ALPHA')).toBeVisible();
    await expect(page.getByText('MY_AI_BETA')).toBeVisible();
    await expect(page.getByText('MY_AI_GAMMA')).toBeVisible();

    // Step 4: Click a station, see Deployment Briefing Dialog
    await page.getByRole('button', { name: 'MY_AI_ALPHA' }).click({ force: true });
    
    // Check Title
    await expect(page.getByText('DEPLOYMENT BRIEFING')).toBeVisible();

    // Verify sections exist: Copy message, Instructions, and Rationale
    const copyText = page.getByText(/copy the tactical briefing to your clipboard/i);
    const instructionsHeader = page.getByText('INSTRUCTIONS:');
    const rationaleHeader = page.getByText('WHY THE MANUAL PASTE?');
    await expect(copyText).toBeVisible();
    await expect(instructionsHeader).toBeVisible();
    await expect(rationaleHeader).toBeVisible();

    // Verify checkbox and action buttons exist
    const checkboxLabel = page.getByRole('checkbox', { name: "Don't show this briefing again." });
    const proceedBtn = page.getByRole('button', { name: 'PROCEED TO DEPLOYMENT', exact: true });
    const cancelBtn = page.getByRole('button', { name: 'CANCEL', exact: true });
    await expect(checkboxLabel).toBeVisible();
    await expect(proceedBtn).toBeVisible();
    await expect(cancelBtn).toBeVisible();

    // Enforce ordering via Regex over the text content, allowing anything in between
    const pageText = await page.locator('body').innerText();
    expect(pageText).toMatch(/copy the tactical briefing[\s\S]*INSTRUCTIONS:[\s\S]*WHY THE MANUAL PASTE\?[\s\S]*Don't show this briefing again\.[\s\S]*PROCEED TO DEPLOYMENT[\s\S]*CANCEL/i);
    
    // Step 5: Check 'Don't show this briefing again' box via role
    await checkboxLabel.click({ force: true });
    
    // Cancel the dialog by clicking "CANCEL" via role
    await cancelBtn.click({ force: true });
    await expect(page.getByText('DEPLOYMENT BRIEFING')).toBeHidden();

    // Small delay to ensure the modal state fully unmounts
    await page.waitForTimeout(500);

    // Step 6: Click station again via role and verify the dialog bypass and clipboard assignment
    await page.getByRole('button', { name: 'MY_AI_ALPHA' }).click({ force: true });
    
    // Delay to check if dialog does NOT reappear
    await page.waitForTimeout(500);
    await expect(page.getByText('DEPLOYMENT BRIEFING')).toBeHidden();

    // Verify system copies briefing logic on manual launch bypass
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('## Tactical Task');
  });

});
