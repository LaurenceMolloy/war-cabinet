import { test, expect } from '@playwright/test';

/**
 * TC-72.1: BATCH INTEL LOGISTICS & CONSOLIDATION
 * Scenarios:
 * 1. Matching item (blank intel) + Confirm = MERGE
 * 2. Matching item (blank intel) + Cancel = NEW BATCH
 * 3. Different intel + Confirm = MERGE
 * 4. Different intel + Cancel = NEW BATCH
 * 5. Same intel => AUTO MERGE
 * 6. Different expiry same intel => NEW BATCH (No Modal)
 */

test.describe('TC-72.1: Batch Intel & Intelligent Consolidation', () => {

  test.beforeEach(async ({ page }) => {
    // Zero-state reset via tactical reload
    await page.goto('http://localhost:8081');
    await page.evaluate(async () => {
       const db = await (window as any).expo_sqlite_proxy.openDatabaseAsync('war_cabinet.db');
       await db.execAsync('DELETE FROM Inventory');
       await db.execAsync('DELETE FROM ItemTypes');
       await db.execAsync('DELETE FROM Categories');
       await db.execAsync('INSERT INTO Categories (id, name, icon) VALUES (1, "Provisions", "food")');
       await db.execAsync('INSERT INTO ItemTypes (id, category_id, name, unit_type) VALUES (1, 1, "Rations", "weight")');
       await db.execAsync('INSERT INTO Cabinets (id, name, location, cabinet_type) VALUES (1, "CENTRAL HUB", "KITCHEN", "pantry")');
    });
    await page.reload();
  });

  test('Scenario 1: Blank Intel + Merge Confirm', async ({ page }) => {
    // 1. Create original batch with "Brand A"
    await page.click('text=Provisions');
    await page.click('[testID="category-plus-btn"]');
    await page.fill('[testID="qty-input"]', '1');
    await page.fill('[testID="size-input"]', '100');
    await page.fill('[placeholder="Batch Intel (optional)"]', 'Brand A');
    await page.click('[testID="save-stock-btn"]');

    // 2. Add matching batch with BLANK intel
    await page.click('[testID="category-plus-btn"]');
    await page.fill('[testID="qty-input"]', '2');
    await page.fill('[testID="size-input"]', '100');
    // Intel left blank
    await page.click('[testID="save-stock-btn"]');

    // 3. Verify Rich Modal and Confirm Merge
    await expect(page.locator('text=Intelligent Consolidation')).toBeVisible();
    await expect(page.locator('text=BRAND A')).toBeVisible(); // Standardized to uppercase in my recent fix
    await page.click('text=MERGE INTO EXISTING');

    // 4. Verify Quantities: 1 + 2 = 3
    await expect(page.locator('text=3')).toBeVisible();
    // Verify Intel is still "Brand A" (merged into existing)
    // Wait, the logic merges NEW into EXISTING, so the EXISTING batch's properties are kept except quantity
    await expect(page.locator('text=Brand A')).toBeVisible();
  });

  test('Scenario 2: Blank Intel + Keep as New', async ({ page }) => {
    await page.click('text=Provisions');
    await page.click('[testID="category-plus-btn"]');
    await page.fill('[testID="qty-input"]', '1');
    await page.fill('[testID="size-input"]', '100');
    await page.fill('[placeholder="Batch Intel (optional)"]', 'Brand A');
    await page.click('[testID="save-stock-btn"]');

    await page.click('[testID="category-plus-btn"]');
    await page.fill('[testID="qty-input"]', '2');
    await page.fill('[testID="size-input"]', '100');
    // Intel left blank
    await page.click('[testID="save-stock-btn"]');

    await page.click('text=KEEP AS NEW BATCH');

    // 5. Verify 2 distinct rows (one with Brand A, one blank)
    await expect(page.locator('text=1')).toBeVisible();
    await expect(page.locator('text=2')).toBeVisible();
  });

  test('Scenario 3: Different Intel + Merge Confirm', async ({ page }) => {
    await page.click('text=Provisions');
    await page.click('[testID="category-plus-btn"]');
    await page.fill('[testID="qty-input"]', '1');
    await page.fill('[testID="size-input"]', '100');
    await page.fill('[placeholder="Batch Intel (optional)"]', 'Brand A');
    await page.click('[testID="save-stock-btn"]');

    await page.click('[testID="category-plus-btn"]');
    await page.fill('[testID="qty-input"]', '1');
    await page.fill('[testID="size-input"]', '100');
    await page.fill('[placeholder="Batch Intel (optional)"]', 'Brand B');
    await page.click('[testID="save-stock-btn"]');

    await expect(page.locator('text=BRAND A')).toBeVisible();
    await page.click('text=MERGE INTO EXISTING');

    // Verify 1+1=2. The target batch is Brand B (merged INTO Brand A)
    // Actually, finalizeCommit(match.id, data) -> UPDATE match.id SET qty = qty + data.q
    // So "Brand A" remains as the identity.
    await expect(page.locator('text=2')).toBeVisible();
    await expect(page.locator('text=Brand A')).toBeVisible();
  });

  test('Scenario 4: Different Intel + Keep as New', async ({ page }) => {
    await page.click('text=Provisions');
    await page.click('[testID="category-plus-btn"]');
    await page.fill('[testID="qty-input"]', '1');
    await page.fill('[testID="size-input"]', '100');
    await page.fill('[placeholder="Batch Intel (optional)"]', 'Brand A');
    await page.click('[testID="save-stock-btn"]');

    await page.click('[testID="category-plus-btn"]');
    await page.fill('[testID="qty-input"]', '1');
    await page.fill('[testID="size-input"]', '100');
    await page.fill('[placeholder="Batch Intel (optional)"]', 'Brand B');
    await page.click('[testID="save-stock-btn"]');

    await page.click('text=KEEP AS NEW BATCH');

    await expect(page.locator('text=Brand A')).toBeVisible();
    await expect(page.locator('text=Brand B')).toBeVisible();
  });

  test('Scenario 5: Same Intel (Auto Merge)', async ({ page }) => {
    await page.click('text=Provisions');
    await page.click('[testID="category-plus-btn"]');
    await page.fill('[testID="qty-input"]', '1');
    await page.fill('[testID="size-input"]', '100');
    await page.fill('[placeholder="Batch Intel (optional)"]', 'Identical');
    await page.click('[testID="save-stock-btn"]');

    await page.click('[testID="category-plus-btn"]');
    await page.fill('[testID="qty-input"]', '100'); // Massive jump
    await page.fill('[testID="size-input"]', '100');
    await page.fill('[placeholder="Batch Intel (optional)"]', 'Identical');
    await page.click('[testID="save-stock-btn"]');

    // No modal should appear. Direct navigation back to dashboard.
    await expect(page.locator('text=Intelligent Consolidation')).not.toBeVisible();
    await expect(page.locator('text=101')).toBeVisible(); // 1+100
  });

  test('Scenario 6: Different Expiry same Intel (New Item)', async ({ page }) => {
    // 1. First batch expires in 2026
    await page.click('text=Provisions');
    await page.click('[testID="category-plus-btn"]');
    await page.fill('[testID="qty-input"]', '1');
    await page.fill('[testID="size-input"]', '100');
    await page.fill('[placeholder="MM"]', '12');
    await page.fill('[placeholder="YYYY"]', '2026');
    await page.click('[testID="save-stock-btn"]');

    // 2. Second batch same intel but DIFFERENT expiry (2027)
    await page.click('[testID="category-plus-btn"]');
    await page.fill('[testID="qty-input"]', '1');
    await page.fill('[testID="size-input"]', '100');
    await page.fill('[placeholder="MM"]', '12');
    await page.fill('[placeholder="YYYY"]', '2027');
    await page.click('[testID="save-stock-btn"]');

    // No modal. Direct creation.
    await expect(page.locator('text=Intelligent Consolidation')).not.toBeVisible();
    
    // Verify two "1" quantity badges exist
    const qtyBadges = page.locator('text=1');
    await expect(qtyBadges).toHaveCount(2);

    // Verify both expiries are shown (01/2026 and 01/2027)
    await expect(page.locator('text=12/2026')).toBeVisible();
    await expect(page.locator('text=12/2027')).toBeVisible();
  });

});
