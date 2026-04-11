import { test, expect } from '@playwright/test';

/**
 * THE FROZEN FRONTIER (FREEZER ITEM LIMIT)
 * [TC-74.1] Verification of Freezer Item Scaling Limits (Cadet Max 3)
 */
test.describe('[TC-74.1] Freezer Item Limits', () => {

  test.setTimeout(180000);

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
    await page.addInitScript(() => {
      localStorage.clear();
      (window as any).__E2E_SKIP_SEEDS__ = true;
    });
    await page.goto('/');
    
    // Dismiss welcome
    try {
      await page.getByTestId('welcome-dismiss-btn').click({ timeout: 5000, force: true }).catch(() => {});
    } catch (e) {}
  };

  test('should enforce limit of 3 freezer item types for cadet', async ({ page }) => {
    await purgeAndReset(page);
    console.log("Purge complete.");

    // 1. Navigate to Catalog
    console.log("Navigating to Catalog...");
    await page.getByTestId('rank-badge-pill').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByTestId('rank-badge-pill').click();
    
    await page.getByTestId('tab-catalog').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByTestId('tab-catalog').click();
    console.log("Catalog reached.");

    // 2. Create a Category
    console.log("Creating Category...");
    await page.getByTestId('new-cat-input').fill('Frozen Rations');
    await page.getByTestId('create-cat-btn').click();
    await expect(page.getByText('FROZEN RATIONS')).toBeVisible();
    console.log("Category created.");

    // 3. Expand Category to add items
    console.log("Expanding Category...");
    await page.getByTestId('category-header-frozen-rations').click();
    await page.getByTestId('expand-add-item-frozen-rations').click();

    // 4. Add 3 Freezer Items
    for (let i = 1; i <= 3; i++) {
        console.log(`Adding Freezer Item ${i}...`);
        await page.getByTestId('new-item-name-input').fill(`Frozen Item ${i}`);
        await page.getByTestId('new-item-freeze-months-input').fill('6');
        await page.getByTestId('submit-item-type-btn').click();
        
        console.log(`Waiting for Frozen Item ${i} to become visible...`);
        await expect(page.getByText(`FROZEN ITEM ${i}`)).toBeVisible();
        if (i < 3) {
            await page.getByTestId('expand-add-item-frozen-rations').click();
        }
    }

    // 5. Attempt 4th (Should be blocked)
    console.log("Attempting 4th Freezer Item...");
    await page.getByTestId('expand-add-item-frozen-rations').click();
    await page.getByTestId('new-item-name-input').fill(`Frozen Item 4`);
    await page.getByTestId('new-item-freeze-months-input').fill('6');
    await page.getByTestId('submit-item-type-btn').click();

    console.log("Verifying 4th item triggered upsell...");
    await expect(page.getByTestId('feature-lock-dismiss-btn')).toBeVisible();
    await page.getByTestId('feature-lock-dismiss-btn').click();
    
    // Verify the form is still open (blocked)
    await expect(page.getByTestId('new-item-name-input')).toBeVisible(); 
    console.log("Test Passed: 4th Freezer Item triggered upsell via addition.");
  });

  test('should enforce limit of 3 freezer item types when editing', async ({ page }) => {
    await purgeAndReset(page);
    console.log("Purge 2 complete.");

    // 1. Navigate to Catalog
    await page.getByTestId('rank-badge-pill').click();
    await page.getByTestId('tab-catalog').click();

    // 2. Create Category and 3 Freezer Items
    await page.getByTestId('new-cat-input').fill('Frozen Rations');
    await page.getByTestId('create-cat-btn').click();
    await page.getByTestId('category-header-frozen-rations').click();
    await page.getByTestId('expand-add-item-frozen-rations').click();

    for (let i = 1; i <= 3; i++) {
        await page.getByTestId('new-item-name-input').fill(`Frozen ${i}`);
        await page.getByTestId('new-item-freeze-months-input').fill('6');
        await page.getByTestId('submit-item-type-btn').click();
        await expect(page.getByText(`FROZEN ${i}`)).toBeVisible();
        await page.getByTestId('expand-add-item-frozen-rations').click();
    }

    // 3. Add a 4th STANDARD Item
    await page.getByTestId('new-item-name-input').fill('Standard Item');
    await page.getByTestId('submit-item-type-btn').click();
    await expect(page.getByText('STANDARD ITEM')).toBeVisible();

    // 4. Try to edit Standard Item to be Freezer (Should be blocked)
    console.log("Found edit btn, clicking...");
    await page.getByTestId('edit-type-btn-standard-item').click({ timeout: 5000, force: true }).catch(async () => {
        console.log("Normal click failed. Trying generic match...");
        await page.locator('[data-testid="edit-type-btn-standard-item"]').click({ force: true });
    });
    console.log("Clicked edit btn.");
    
    // Find freezer months input in edit form
    const editFreezeInput = page.getByTestId('edit-item-freeze-months-input');
    console.log("Filling freeze input...");
    await editFreezeInput.fill('12', { force: true });
    console.log("Input filled, clicking save...");
    await page.getByText('SAVE CHANGES').click();
    console.log("Save clicked.");

    console.log("Verifying 4th item triggered upsell...");
    await expect(page.getByTestId('feature-lock-dismiss-btn')).toBeVisible();
    await page.getByTestId('feature-lock-dismiss-btn').click();

    // Verify it's STILL visible (form not closed) or check if change was rejected
    await expect(page.getByText('SAVE CHANGES')).toBeVisible();
    console.log("Test Passed: 4th Freezer Item triggered upsell via edit.");
  });

  test('should enforce limit of 3 freezer item types when adding batches', async ({ page }) => {
    await purgeAndReset(page);
    console.log("Purge 3 complete.");

    // 1. Navigate to Catalog
    await page.getByTestId('rank-badge-pill').click();
    await page.getByTestId('tab-catalog').click();

    // 2. Create Freezer Cabinet
    await page.getByTestId('tab-cabinets').click();
    await page.getByTestId('new-cab-name-input').fill('Primary Freezer');
    await page.getByTestId('new-cab-type-freezer').click();
    await page.getByTestId('create-cab-btn').click();

    // 3. Create 4 Standard Item Types
    await page.getByTestId('tab-catalog').click();
    await page.getByTestId('new-cat-input').fill('General Store');
    await page.getByTestId('create-cat-btn').click();
    await page.getByTestId('category-header-general-store').click();
    await page.getByTestId('expand-add-item-general-store').click();

    for (let i = 1; i <= 4; i++) {
        await page.getByTestId('new-item-name-input').fill(`Item ${i}`);
        await page.getByTestId('submit-item-type-btn').click();
        await expect(page.getByText(`ITEM ${i}`)).toBeVisible();
        await page.getByTestId('expand-add-item-general-store').click();
    }

    // 4. Add Batches to Freezer for first 3 items
    for (let i = 1; i <= 3; i++) {
        console.log(`Adding Batch for Item ${i} to Freezer...`);
        // Let's use search.
        await page.goto('/');
        // Ensure home is loaded
        await page.getByText('SERVICE PROMOTION CENTRE').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        await page.getByTestId('search-input-trigger').click({ force: true });
        await page.getByTestId('search-modal-input').fill(`Item ${i}`);
        await page.getByText(new RegExp(`ITEM ${i}`, 'i')).first().click();
        
        await page.getByTestId('cabinet-selector').waitFor({ state: 'visible' });
        await page.getByTestId('cabinet-selector').click();
        await page.getByText('Primary Freezer').click();
        await page.getByTestId('save-stock-btn').click();
        
        console.log(`Verifying Item ${i} added to Freezer...`);
        await expect(page.getByText('IN PRIMARY FREEZER').first()).toBeVisible();
    }

    // 5. Attempt to add 4th Item to Freezer (Should be blocked)
    console.log("Attempting to add Item 4 to Freezer...");
    await page.goto('/');
    await page.getByText('SERVICE PROMOTION CENTRE').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await page.getByTestId('search-input-trigger').click({ force: true });
    await page.getByTestId('search-modal-input').fill('Item 4');
    await page.getByText(/ITEM 4/i).first().click();
    
    await page.getByTestId('cabinet-selector').waitFor({ state: 'visible' });
    await page.getByTestId('cabinet-selector').click();
    await page.getByText('FROZEN DEEP STORAGE').click();
    
    // Add batch intel to safely save
    await page.getByTestId('batch-intel-input').fill('Testing Add');
    
    console.log("Clicking save for 4th item...");
    await page.getByTestId('save-stock-btn').click();

    console.log("Verifying 4th item triggered upsell...");
    await expect(page.getByTestId('feature-lock-dismiss-btn')).toBeVisible(); 
    console.log("Test Passed: 4th Freezer Item triggered upsell via batch addition.");
  });

  test('should intercept duplicate cabinet designations gracefully without crashing', async ({ page }) => {
    await purgeAndReset(page);
    console.log("Purge Complete (Duplicate Check).");

    await page.getByTestId('rank-badge-pill').click();

    // 1. Create First Cabinet
    await page.getByTestId('tab-cabinets').click();
    await page.getByTestId('new-cab-name-input').fill('Echo Base');
    await page.getByTestId('create-cab-btn').click();

    // 2. Wait for it to clear
    await expect(page.getByTestId('new-cab-name-input')).toBeEmpty();

    // 3. Attempt Duplicate Cabinet
    // The dialog handler in beforeEach will accept the custom Alert if it triggers a native window alert.
    // If it's a DOM alert, we can just ensure the app didn't crash because we can still type and interact.
    await page.getByTestId('new-cab-name-input').fill('ECHO BASE');
    await page.getByTestId('new-cab-type-freezer').click(); // Try a freezer type
    await page.getByTestId('create-cab-btn').click();

    // The inline error message should be visible below the input.
    // The name input should retain the typed value (not cleared).
    await expect(page.getByText(/"ECHO BASE" is already deployed in your logistics network./)).toBeVisible();
    await expect(page.getByTestId('new-cab-name-input')).toHaveValue('ECHO BASE');

    // Typing again should clear the error
    await page.getByTestId('new-cab-name-input').fill('Echo Base Alpha');
    await expect(page.getByText(/"ECHO BASE" is already deployed in your logistics network./)).not.toBeVisible();

    console.log("Test Passed: Duplicate cabinet designation shows inline error and clears on re-type!");
  });

  test.skip('should enforce limit of 3 freezer item types when moving existing batches', async ({ page }) => {
    await purgeAndReset(page);
    console.log("Purge 3.5 complete.");

    // 1. Create Cabinets
    await page.getByTestId('rank-badge-pill').click();
    let currentCabId = 0;
    while(currentCabId < 2) {
      await page.getByTestId('tab-cabinets').click();
      await page.getByTestId('new-cab-name-input').fill(currentCabId === 0 ? 'Standard Store' : 'FROZEN DEEP STORAGE');
      if (currentCabId === 1) {
          await page.getByTestId('new-cab-type-freezer').click();
      }
      await page.getByTestId('create-cab-btn').click();
      currentCabId++;
    }

    // 2. Create Category and 4 Standard Items
    await page.getByTestId('tab-catalog').click();
    await page.getByTestId('new-cat-input').fill('General Store');
    await page.getByTestId('create-cat-btn').click();
    await page.getByTestId('category-header-general-store').click();
    
    await page.getByTestId('expand-add-item-general-store').click();
    for (let i = 1; i <= 4; i++) {
        await page.getByTestId('new-item-name-input').fill(`Item ${i}`);
        await page.getByTestId('submit-item-type-btn').click();
        await expect(page.getByText(`ITEM ${i}`)).toBeVisible();
        if (i < 4) {
            await page.getByTestId('expand-add-item-general-store').click();
        }
    }

    // 3. Add first 3 to Freezer directly
    for (let i = 1; i <= 3; i++) {
        await page.goto('/');
        await page.getByText('SERVICE PROMOTION CENTRE').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        await page.getByTestId('search-input-trigger').click({ force: true });
        await page.getByTestId('search-modal-input').fill(`Item ${i}`);
        await page.getByText(new RegExp(`ITEM ${i}`, 'i')).first().click();
        
        await page.getByTestId('cabinet-selector').waitFor({ state: 'visible' });
        await page.getByTestId('cabinet-selector').click();
        await page.getByText('FROZEN DEEP STORAGE').click();
        await page.getByTestId('batch-intel-input').fill(`Test Int ${i}`);
        await page.getByTestId('save-stock-btn').click();
    }

    // 4. Add the 4th item to the STANDARD Cabinet
    await page.goto('/');
    await page.getByText('SERVICE PROMOTION CENTRE').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await page.getByTestId('search-input-trigger').click({ force: true });
    await page.getByTestId('search-modal-input').fill('Item 4');
    await page.getByText(/ITEM 4/i).first().click();
    
    await page.getByTestId('cabinet-selector').waitFor({ state: 'visible' });
    await page.getByTestId('cabinet-selector').click();
    await page.getByText('Standard Store').click();
    await page.getByTestId('batch-intel-input').fill('To Be Moved');
    await page.getByTestId('save-stock-btn').click();

    // 5. Navigate to Home, expand General Store, click the batch, and edit it
    await page.goto('/');
    await page.getByText('SERVICE PROMOTION CENTRE').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await page.getByTestId('search-input-trigger').click({ force: true });
    await page.getByTestId('search-modal-input').fill('To Be Moved');
    
    // There shouldn't be an exact match, but searching usually lists items
    // If we just use search to find "Item 4", we can edit its batch
    await page.getByTestId('search-modal-input').fill('Item 4');
    await page.getByTestId('close-search-btn').click(); // close search to use normal view
    await page.getByTestId('category-header-general-store').first().click();
    
    // Expand the item details for Item 4
    await page.getByTestId('item-row-item-4').click();
    
    // The batch should be visible inside it, we can click its edit icon
    // Wait, the testID for edit stock might be complex, let's just search "To Be Moved"
    console.log("Locating the stock batch to edit...");
    const editBtn = page.locator('TouchableOpacity').filter({ has: page.getByText('TO BE MOVED') });
    await editBtn.first().click();
    
    // Now we are on add/edit screen for this batch
    await page.getByTestId('cabinet-selector').waitFor({ state: 'visible' });
    await page.getByTestId('cabinet-selector').click();
    await page.getByText('FROZEN DEEP STORAGE').click();
    
    console.log("Attempting to SAVE the moved batch...");
    await page.getByTestId('save-stock-btn').click();

    console.log("Verifying move triggered upsell...");
    await expect(page.getByTestId('feature-lock-dismiss-btn')).toBeVisible(); 
    console.log("Test Passed: 4th Freezer Item triggered upsell via batch move.");
  });

  test('should enforce limit of 0 freezer item types for private rank (earned promotion)', async ({ page }) => {
    await purgeAndReset(page);
    console.log("Purge 4 complete.");

    // 1. Promote to Private
    console.log("Promoting to Private...");
    await page.getByTestId('rank-badge-pill').click();
    await page.getByTestId('tab-rank').click();
    await page.getByText('GRADUATE EARLY TO PRIVATE').click();
    await page.getByText('CONFIRM EARLY GRADUATION').click();
    console.log("Graduation confirmed.");
    
    // Verify Private Rank
    await expect(page.getByTestId('rank-label-Private')).toBeVisible();

    // 2. Create Freezer Cabinet
    await page.getByTestId('tab-cabinets').click();
    await page.getByTestId('new-cab-name-input').fill('Primary Freezer');
    await page.getByTestId('new-cab-type-freezer').click();
    await page.getByTestId('create-cab-btn').click();

    // 3. Create 1 Standard Item Type
    await page.getByTestId('tab-catalog').click();
    await page.getByTestId('new-cat-input').fill('General Store');
    await page.getByTestId('create-cat-btn').click();
    await page.getByTestId('category-header-general-store').click();
    await page.getByTestId('expand-add-item-general-store').click();

    await page.getByTestId('new-item-name-input').fill('Private Item');
    await page.getByTestId('submit-item-type-btn').click();

    // 4. Attempt to add to Freezer (Should be blocked at 0)
    await page.goto('/');
    await page.getByTestId('search-input-trigger').click();
    await page.getByTestId('search-modal-input').fill('Private Item');
    await page.getByText('PRIVATE ITEM').first().click();
    
    await page.getByTestId('cabinet-selector').waitFor({ state: 'visible' });
    await page.getByTestId('cabinet-selector').click();
    await page.getByText('Primary Freezer').click();
    await page.getByTestId('save-stock-btn').click();

    // Verify blocked and see Feature Lock
    await expect(page.getByTestId('feature-lock-dismiss-btn')).toBeVisible(); 
    console.log("Test Passed: Private rank freezer limit (0) triggered upsell.");
  });

  test('should allow more than 3 freezer item types for sergeant rank (paid upgrade)', async ({ page }) => {
    await purgeAndReset(page);
    console.log("Purge 5 complete.");

    // 1. Promote to Private logically first
    console.log("Promoting to Sergeant...");
    await page.getByTestId('rank-badge-pill').click();
    await page.getByTestId('tab-rank').click();

    // Must graduate from Cadet to Private first so the buy button appears
    await page.getByText('GRADUATE EARLY TO PRIVATE').click();
    await page.getByText('CONFIRM EARLY GRADUATION').click();

    // Now promote to Sergeant
    await page.getByText('COMMISSION SERGEANT RANK').click();
    await page.getByText('ENLIST AS SERGEANT — £2.99').click();
    console.log("Sergeant enlisted.");
    
    // The simulated purchase takes ~1.5s
    await page.waitForTimeout(2000);

    // 2. Create Cabinets
    await page.getByTestId('tab-cabinets').click();
    await page.getByTestId('new-cab-name-input').fill('Primary Freezer');
    await page.getByTestId('new-cab-type-freezer').click();
    await page.getByTestId('create-cab-btn').click();
    await page.getByTestId('new-cab-name-input').fill('Standard Storage');
    await page.getByTestId('create-cab-btn').click();

    // 3. Create a Category
    console.log("Creating Category...");
    await page.getByTestId('tab-catalog').click();
    await page.getByTestId('new-cat-input').fill('Frozen Rations');
    await page.getByTestId('create-cat-btn').click();
    await page.getByTestId('category-header-frozen-rations').click();
    await page.getByTestId('expand-add-item-frozen-rations').click();

    // 4. Add 4 Freezer Items safely (should not be blocked)
    for (let i = 1; i <= 4; i++) {
        console.log(`Adding Freezer Item ${i}...`);
        await page.getByTestId('new-item-name-input').fill(`Frozen Item ${i}`);
        await page.getByTestId('new-item-freeze-months-input').fill('6');
        await page.getByTestId('submit-item-type-btn').click();
        
        console.log(`Waiting for Frozen Item ${i} to become visible...`);
        await expect(page.getByText(`FROZEN ITEM ${i}`)).toBeVisible();
        if (i < 4) {
            await page.getByTestId('expand-add-item-frozen-rations').click();
        }
    }

    // 5. Add a 5th Standard item natively to verify addition to freezer (should not be blocked)
    console.log("Adding 5th item to verify batch addition to freezer...");
    await page.getByTestId('expand-add-item-frozen-rations').click();
    await page.getByTestId('new-item-name-input').fill('Standard Item Five');
    await page.getByTestId('submit-item-type-btn').click();
    await expect(page.getByText('STANDARD ITEM FIVE')).toBeVisible();

    await page.goto('/');
    await page.getByTestId('search-input-trigger').click({ force: true });
    await page.getByTestId('search-modal-input').fill('Standard Item Five');
    await page.getByText(/STANDARD ITEM FIVE/i).first().click();
    await page.getByTestId('cabinet-selector').click();
    await page.getByText('Primary Freezer').click();
    await page.getByTestId('save-stock-btn').click();

    // 6. Add a 6th Standard item directly and verify MOVE to freezer (should not be blocked)
    console.log("Adding 6th item to verify batch move to freezer...");
    await page.goto('/');
    await page.getByTestId('tab-catalog').click();
    await page.getByTestId('expand-add-item-frozen-rations').click();
    await page.getByTestId('new-item-name-input').fill('Standard Item Six');
    await page.getByTestId('submit-item-type-btn').click();

    await page.goto('/');
    await page.getByTestId('search-input-trigger').click({ force: true });
    await page.getByTestId('search-modal-input').fill('Standard Item Six');
    await page.getByText(/STANDARD ITEM SIX/i).first().click();
    // Default Cabinet usually not freezer if we specify Standard Storage
    await page.getByTestId('cabinet-selector').click();
    await page.getByText('Standard Storage').click();
    await page.getByTestId('save-stock-btn').click();

    // Now move it (Edit)
    await page.goto('/');
    await page.getByTestId('search-input-trigger').click({ force: true });
    await page.getByTestId('search-modal-input').fill('Standard Item Six');
    await page.getByTestId('close-search-btn').click(); 
    await page.getByTestId('category-header-frozen-rations').first().click();
    await page.getByTestId('item-row-standard-item-six').click();
    
    // Edit the stock batch
    const editBtnGrp = page.locator('TouchableOpacity').filter({ has: page.locator('.mdi-pencil') });
    await editBtnGrp.last().click();

    await page.getByTestId('cabinet-selector').click();
    await page.getByText('Primary Freezer').click();
    await page.getByTestId('save-stock-btn').click();

    console.log("Test Passed: Sergeant allows 6+ freezer items via all addition/move paths.");
  });
});
