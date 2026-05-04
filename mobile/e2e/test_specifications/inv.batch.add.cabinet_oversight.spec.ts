import { test, expect } from '@playwright/test';

/**
 * TEST SPECIFICATION: Cabinet Logistics & Site Fidelity
 * ======================================================
 * SCOPE:      Inventory Management — Logistical Triage & User Oversight
 * DOMAIN:     inv  |  ENTITY: batch  |  ACTION: add
 * SCENARIO:   cabinet_oversight
 * FOUNDATION: foundation_oversight
 *             → Wipes DB, seeds 4 cabinets (TEST CABINET 1–4, all standard),
 *               1 category (LOGISTICS TEST), and 1 pre-existing item type
 *               (TEST ITEM 1) with default_cabinet_id = 1 and baseline stock.
 * LAST AMENDED: 2026-05-04
 *
 * ─── SYSTEM UNDER TEST ────────────────────────────────────────────────────────
 * The War Cabinet enforces two distinct storage-site fidelity protocols:
 *
 *   [VANGUARD]  Triggered when a brand-new item type (no historical data, no
 *               default home) is committed for the first time. The system asks
 *               the user whether to promote that cabinet to a permanent default.
 *
 *   [LOCATION CONFLICT]  Triggered when an item is committed to a cabinet that differs
 *                        from where existing stock already lives. The system warns of
 *                        fragmentation and offers to correct the destination or
 *                        optionally set a new permanent home site.
 *
 * ─── USER JOURNEYS & PROOFS ───────────────────────────────────────────────────
 *
 * PHASE 1 — Global Default Fallback
 *   Journey:  User opens a brand-new item (no history, no home site set).
 *   Trigger:  No default_cabinet_id on item type, no batch history.
 *   Proves:   The add form falls back to the global last-used cabinet (Cabinet 1
 *             as established by the foundation seeder). No modal fires yet.
 *
 * PHASE 2 — Item History Remembered (No Home Site Established)
 *   Journey:  User saves the first batch to Cabinet 3, but declines Vanguard's
 *             offer to promote it as a permanent home ("Deploy Once").
 *   Trigger:  Vanguard modal → "Deploy Once" (no permanent home written).
 *   Proves:   On the next add, the system recalls the last-used cabinet for
 *             this specific item (Cabinet 3), not the global default. Item
 *             history overrides global default in the absence of a home site.
 *
 * PHASE 3 — Home Site Establishment (via Location Conflict)
 *   Journey:  User saves a second batch, this time to Cabinet 2. Conflict
 *             modal fires because stock already exists in Cabinet 3. User
 *             ticks "Set as primary default home" and proceeds to Cabinet 2.
 *   Trigger:  Location Conflict modal → "Set as default" toggle → Proceed.
 *   Proves:   Cabinet 2 is now persisted as the item type's home site
 *             (default_cabinet_id). Subsequent adds pre-select Cabinet 2.
 *
 * PHASE 4 — Home Site Precedence After Fragmentation (The Smoking Gun)
 *   Journey:  User saves another batch to Cabinet 4 (conflicting with the
 *             established home in Cabinet 2) and proceeds WITHOUT correcting.
 *   Trigger:  Location Conflict modal → "Proceed Anyway" (no home change).
 *   Proves:   Even though the last batch went to Cabinet 4, the next add
 *             still pre-selects Cabinet 2 (the permanent home). Home site
 *             takes precedence over recency / batch history.
 *
 * PHASE 5 — Existing Stock Guardrail (Foundation Item)
 *   Journey:  User taps "Add" on TEST ITEM 1, which already has stock in
 *             Cabinet 1 and a default_cabinet_id set in the seeder.
 *   Trigger:  None — item type has a pre-established default home.
 *   Proves:   The form silently pre-selects Cabinet 1 from the item type's
 *             default_cabinet_id. No Vanguard or Conflict modal fires.
 *
 * PHASE 6 — Pre-established Home Site (Silent Entry)
 *   Journey:  User creates a brand-new item type and explicitly selects
 *             Cabinet 4 as its default during the "Deploy Specification" flow.
 *             They then immediately save the first batch.
 *   Trigger:  None — default_cabinet_id was set at item type creation time.
 *   Proves:   When a default home is declared upfront, the first batch add
 *             is completely silent. No Vanguard fires, no Conflict fires.
 *             The system trusts the declared intent.
 */

test.use({
  viewport: { height: 800, width: 360 }
});

/**
 * After router.replace('/'), React Native Web's unmount cycle means Playwright
 * locators can grab elements during the old add.tsx DOM teardown, causing clicks
 * to fail. We instead: confirm the URL has settled to '/', wait for networkidle,
 * then fire a direct JS click which targets only the stable current DOM.
 */
async function navigateBackAndClick(page: any, testId: string) {
  await page.waitForURL(/localhost:8081\/$|localhost:8081\/\?/, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500); // Single animation frame settle
  await page.evaluate((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (el) (el as HTMLElement).click();
  }, testId);
}

test('Tactical Logistics: Cabinet Oversight Protocols', async ({ page }) => {
  test.setTimeout(60000);

  // Safety net: catch any unexpected app-level alerts during test execution
  page.on('dialog', async dialog => {
    console.error(`[E2E] UNEXPECTED ALERT: ${dialog.message()}`);
    await dialog.accept();
  });

  // ─── PHASE 1: Fallback to Global Default ───────────────────────────────────
  await test.step('PHASE 1: Fallback to Global Default', async () => {
    await page.goto('http://localhost:8081/?setup=foundation_oversight', { timeout: 30000 });
    await page.waitForSelector('[data-testid="category-card-logistics-test"]', { timeout: 20000 });
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="add-new-item-to-logistics-test"]');
      if (el) (el as HTMLElement).click();
    });
    await page.waitForURL(/\/add/, { timeout: 10000 });

    await page.getByRole('textbox', { name: 'Item Name' }).fill('OVERRIDE ITEM');
    await page.getByText('Weight').first().click();
    await page.getByRole('textbox', { name: 'Size' }).fill('100');
    await page.getByTestId('deploy-spec-btn').click();

    await expect(page.getByTestId('save-stock-btn')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('active-cabinet-chip')).toContainText('TEST CABINET 1');
  });

  // ─── PHASE 2: Establish Item-Specific History (No Home Site) ───────────────
  await test.step('PHASE 2: Establish Item-Specific History (No Home)', async () => {
    await expect(page.getByTestId('save-stock-btn')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('expiry-year-trigger').click();
    await page.getByTestId('expiry-year-option-2030').click();
    await page.getByTestId('cabinet-chip-3').click();
    await page.getByTestId('save-stock-btn').click();

    // Vanguard fires — decline promotion
    await expect(page.getByTestId('vanguard-modal-title')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('deploy-once-btn').click();

    // Back on home — open add form again to verify cabinet recall
    await navigateBackAndClick(page, 'add-btn-logistics-test-override-item');
    await expect(page.getByTestId('active-cabinet-chip')).toContainText('TEST CABINET 3', { timeout: 10000 });
  });

  // ─── PHASE 3: Establish Explicit Home Site (via Conflict Modal) ────────────
  await test.step('PHASE 3: Establish Explicit Home Site (via Conflict)', async () => {
    await expect(page.getByTestId('save-stock-btn')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('expiry-year-trigger').click();
    await page.getByTestId('expiry-year-option-2030').click();
    await page.getByTestId('cabinet-chip-2').click();
    await page.getByTestId('save-stock-btn').click();

    // Conflict modal — set Cabinet 2 as home site and proceed
    await expect(page.getByTestId('location-conflict-modal-title')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('set-as-default-home-toggle').click();
    await page.getByTestId('proceed-anyway-cabinet-btn').click();

    // Back on home — verify home site takes effect on next add
    await navigateBackAndClick(page, 'add-btn-logistics-test-override-item');
    await expect(page.getByTestId('active-cabinet-chip')).toContainText('TEST CABINET 2', { timeout: 10000 });
  });

  // ─── PHASE 4: The Smoking Gun (Home Site Precedence After Fragmentation) ───
  await test.step('PHASE 4: The Smoking Gun (Home Site Precedence)', async () => {
    await expect(page.getByTestId('save-stock-btn')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('expiry-year-trigger').click();
    await page.getByTestId('expiry-year-option-2030').click();
    await page.getByTestId('cabinet-chip-4').click();
    await page.getByTestId('save-stock-btn').click();

    // Conflict modal — proceed WITHOUT setting home (fragmentation)
    await expect(page.getByTestId('location-conflict-modal-title')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('proceed-anyway-cabinet-btn').click();

    // Back on home — home site must still win over last-used
    await navigateBackAndClick(page, 'add-btn-logistics-test-override-item');
    await expect(page.getByTestId('active-cabinet-chip')).toContainText('TEST CABINET 2', { timeout: 10000 });

    await page.getByTestId('cancel-btn').click();
  });

  // ─── PHASE 5: Existing Stock Guardrail (Foundation Item) ───────────────────
  await test.step('PHASE 5: Existing Stock Guardrail (TEST ITEM 1)', async () => {
    await page.waitForURL(/localhost:8081\/$|localhost:8081\/\?/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="add-btn-logistics-test-test-item-1"]');
      if (el) (el as HTMLElement).click();
    });
    await expect(page.getByTestId('active-cabinet-chip')).toContainText('TEST CABINET 1', { timeout: 10000 });
    await page.getByTestId('cancel-btn').click();
  });

  // ─── PHASE 6: Pre-established Home Site (Silent Entry) ─────────────────────
  await test.step('PHASE 6: Pre-established Home Site (Silent Entry)', async () => {
    await page.waitForURL(/localhost:8081\/$|localhost:8081\/\?/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="add-new-item-to-logistics-test"]');
      if (el) (el as HTMLElement).click();
    });
    await page.waitForURL(/\/add/, { timeout: 10000 });

    await page.getByRole('textbox', { name: 'Item Name' }).fill('PRE-SET ITEM');
    await page.getByText('Weight').first().click();
    await page.getByRole('textbox', { name: 'Size' }).fill('500');
    await page.getByTestId('cabinet-chip-4').click();
    await page.getByTestId('deploy-spec-btn').click();

    // Cabinet 4 pre-selected immediately — no modal
    await expect(page.getByTestId('active-cabinet-chip')).toContainText('TEST CABINET 4', { timeout: 15000 });
    await page.getByTestId('expiry-year-trigger').click();
    await page.getByTestId('expiry-year-option-2030').click();
    await page.getByTestId('save-stock-btn').click();

    // Verify silent save — no oversight modals fired
    await page.waitForURL(/localhost:8081\/$|localhost:8081\/\?/, { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('vanguard-modal-title')).toBeHidden();
    await expect(page.getByTestId('location-conflict-modal-title')).toBeHidden();
  });
});
