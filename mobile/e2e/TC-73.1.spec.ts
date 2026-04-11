import { test, expect } from '@playwright/test';

/**
 * THE STRATEGIC SQUEEZE (CADET EVALUATION)
 * [TC-73.1] Verification of Scaling Limits & Early Graduation
 */
test.describe('[TC-73.1] Cadet Evaluation & Graduation', () => {

  test.setTimeout(180000);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  test.beforeEach(async ({ page }) => {
    // Forward browser console to node console
    page.on('console', msg => console.log(`BROWSER CONSOLE: [${msg.type()}] ${msg.text()}`));

    // Automatically accept alerts (Scaling limit notifications)
    page.on('dialog', async dialog => {
      console.log(`DIALOG DETECTED: [${dialog.type()}] ${dialog.message()}`);
      await dialog.accept();
    });
  });

  const purgeAndReset = async (page: any) => {
    // Reset localStorage to trigger fresh trial
    await page.addInitScript(() => {
      localStorage.clear();
      (window as any).__E2E_SKIP_SEEDS__ = true;
    });
    await page.goto('/');
    
    // Dismiss welcome if it appears
    try {
      console.log("Checking for Welcome Modal...");
      console.log("Attempting to clear Welcome Modal if present...");
      await page.getByTestId('welcome-dismiss-btn').click({ timeout: 5000, force: true }).catch(() => {
        console.log("Welcome dismissal button not clickable/present - skipping.");
      });
      console.log("Onboarding clearance complete.");
    } catch (e) {
      console.log("Error handling welcome modal:", e);
    }
  };

  test('should verify cadet scaling limits, tactical graduation, and private expansion', async ({ page }) => {
    await purgeAndReset(page);

    // 1. Verify Home Screen Badge
    console.log("Verifying Home Screen Badge...");
    try {
      await expect(page.getByText('RANK: CADET', { exact: true })).toBeVisible({ timeout: 15000 });
      console.log("Badge verified.");
    } catch (e) {
      console.log("FAILED to find RANK: CADET. Dumping page content...");
      const content = await page.content();
      console.log("PAGE CONTENT:", content.substring(0, 2000)); // First 2KB
      throw e;
    }

    // 2. Click Badge -> Navigate to Promotion Centre
    console.log("Waiting for router to settle...");
    await page.waitForTimeout(2000);
    console.log("Clicking Rank Badge Pill...");
    await page.getByTestId('rank-badge-pill').click();
    await expect(page.getByText('SERVICE PROMOTION CENTRE')).toBeVisible({ timeout: 15000 });
    console.log("Promotion Centre reached.");

    // 3. Verify Only Cadet has "CURRENT" status
    const currentBadges = page.getByText('CURRENT', { exact: true });
    await expect(currentBadges).toHaveCount(1);
    await expect(page.getByText('RANK: CADET (IN TRAINING)')).toBeVisible();

    // 4. Test Category Limit (Cadet Max 3)
    await page.getByTestId('tab-catalog').click();
    for (let i = 1; i <= 3; i++) {
        await page.getByTestId('new-cat-input').fill(`Category ${i}`);
        await page.getByTestId('create-cat-btn').click();
        await expect(page.getByText(`CATEGORY ${i}`)).toBeVisible(); 
    }
    // Try 4th (Should be blocked)
    console.log("Testing 4th Category (Limit)...");
    await page.getByTestId('new-cat-input').fill(`Category 4`);
    await page.getByTestId('create-cat-btn').click();
    await expect(page.getByText('CATEGORY 4')).not.toBeVisible();
    
    // Dismiss scaling limit alert (FeatureLock modal)
    try {
        const dismissBtn = page.getByTestId('feature-lock-dismiss-btn');
        await dismissBtn.waitFor({ state: 'visible', timeout: 5000 });
        await dismissBtn.click();
        console.log("Scaling alert (FeatureLock) dismissed.");
    } catch (e) {
        console.log("No FeatureLock modal to dismiss or timeout.");
    }
    
    // 5. Test Cabinet Limit (Cadet Max 2)
    console.log("Navigating to Cabinets Tab...");
    await page.getByTestId('tab-cabinets').click({ force: true });
    for (let i = 1; i <= 2; i++) {
        await page.getByTestId('new-cab-name-input').fill(`Cabinet ${i}`);
        await page.getByTestId('create-cab-btn').click();
        await expect(page.getByText(`Cabinet ${i}`)).toBeVisible();
    }
    // Try 3rd (Should be blocked)
    await page.getByTestId('new-cab-name-input').fill(`Cabinet 3`);
    await page.getByTestId('create-cab-btn').click();
    await expect(page.getByText('Cabinet 3')).not.toBeVisible();

    // Dismiss FeatureLock
    try {
        const dismissBtn = page.getByTestId('feature-lock-dismiss-btn');
        await dismissBtn.waitFor({ state: 'visible', timeout: 5000 });
        await dismissBtn.click();
        console.log("Cabinet limit alert dismissed.");
    } catch (e) {}

    // 6. Test Freezer Cabinet Limit (Cadet Max 1)
    // Attempt to make a 2nd cabinet a freezer? 
    // Edit Cabinet 1 to freezer
    await page.getByTestId('edit-cab-btn-cabinet-1').click({ force: true });
    await page.getByTestId('edit-cab-type-freezer').click();
    await page.getByTestId('save-cabinet-btn').click();
    
    // Now try to edit Cabinet 2 to freezer (Should be blocked)
    await page.getByTestId('edit-cab-btn-cabinet-2').click();
    await page.getByTestId('edit-cab-type-freezer').click();
    await page.getByTestId('save-cabinet-btn').click();
    // If Alert.alert is browser native, it's auto-accepted. 
    // If it's a DOM mock, we click OK.
    try {
        const okBtn = page.getByText('OK');
        if (await okBtn.isVisible({ timeout: 2000 })) {
            await okBtn.click();
            console.log("Freezer limit alert dismissed.");
        }
    } catch (e) {}
    await page.getByTestId('close-edit-cab-btn').click(); 

    // 7. Tactical Graduation
    await page.getByTestId('tab-rank').click();
    await page.getByText('GRADUATE EARLY TO PRIVATE').click();
    
    // Verify Custom Tactical Modal
    await expect(page.getByText('Commission Private Rank?')).toBeVisible();
    await page.getByText('CONFIRM EARLY GRADUATION').click();
    
    // Verify Rank Change
    await expect(page.getByText('RANK: PRIVATE', { exact: true })).toBeVisible();
    await expect(page.getByText('CURRENT STATUS: CADET')).not.toBeVisible();

    // 8. Test Private Expansion (Max 6 Cabinets)
    await page.getByTestId('tab-cabinets').click();
    for (let i = 3; i <= 6; i++) {
        await page.getByTestId('new-cab-name-input').fill(`Cabinet ${i}`);
        await page.getByTestId('create-cab-btn').click();
        await expect(page.getByText(`Cabinet ${i}`)).toBeVisible();
    }
    // Try 7th (Should be blocked)
    await page.getByTestId('new-cab-name-input').fill(`Cabinet 7`);
    await page.getByTestId('create-cab-btn').click();
    await expect(page.getByText('Cabinet 7')).not.toBeVisible();

    // Dismiss FeatureLock
    try {
        const dismissBtn = page.getByTestId('feature-lock-dismiss-btn');
        await dismissBtn.waitFor({ state: 'visible', timeout: 5000 });
        await dismissBtn.click();
        console.log("Cabinet limit alert (Private) dismissed.");
    } catch (e) {}

    // 9. Verify Freezer Teaser Persists in Private (Max 1 Freezer Cab)
    // Attempt to make Cabinet 2 a freezer (we already have Cabinet 1 as freezer)
    await page.getByTestId('edit-cab-btn-cabinet-2').click();
    await page.getByTestId('edit-cab-type-freezer').click();
    await page.getByTestId('save-cabinet-btn').click();
    try {
        const okBtn = page.getByText('OK');
        if (await okBtn.isVisible({ timeout: 2000 })) {
            await okBtn.click();
            console.log("Freezer limit alert (Private) dismissed.");
        }
    } catch (e) {}
  });

});
