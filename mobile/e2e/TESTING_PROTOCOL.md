# War Cabinet: Deterministic E2E Testing Protocol

This protocol defines the mandatory standards for writing and maintaining End-to-End (E2E) tests for the War Cabinet mobile application (web-target). Following these "Standing Orders" is essential to prevent "test rot" and flakiness caused by React Native Web's rendering behavior.

## 1. Hierarchical testID Architecture
Avoid "flat" or generic testIDs (e.g., `batch-qty`). Use a hierarchical "Path" system that ensures global uniqueness and logical grouping.

**Standard Pattern:** `{category}-{item}-{entity}-{id}-{attribute}`

*   **Example:** `test-category-1-test-item-1-batch-1-qty`
*   **Rationale:** This creates a unique "postal address" for every entity. When debugging in Playwright, you can immediately tell exactly which item, batch, and attribute you are looking at without context.

## 2. The Visibility Rule (Defeating Phantoms)
React Native Web (and `FlatList`) often preserves "ghost" or "stale" nodes in the DOM for performance optimization. Playwright's "Strict Mode" will fail if it detects these phantoms.

**Mandatory Practice:** Always use `.filter({ visible: true })` for actions and assertions on dynamic list items.

```typescript
// INCORRECT (May find multiple 'ghost' elements)
await expect(page.getByTestId('batch-1-qty')).toContainText('2');

// CORRECT (Targets only the active UI layer)
const qty = page.getByTestId('batch-1-qty').filter({ visible: true });
await expect(qty).toContainText('2');

// GOLD STANDARD: The "Guard Assertion" pattern
// 1. Wait for the Value to change (Wait for state reconciliation)
//    Playwright will retry this until the async reload finishes.
const qty = page.getByTestId('batch-1-qty').filter({ visible: true });
await expect(qty).toContainText('3');

// 2. Now verify the Structure (Unique Entity)
const row = page.getByTestId('batch-1-row').filter({ visible: true });
await expect(row).toHaveCount(1);
```

## 3. Locator Lifecycle (Lazy Selection)
Understand that Locators are **definitions**, not **results**. 

*   **Variable Assignment:** Do NOT `await` the assignment of a locator.
    *   `const batch = page.getByTestId('...');` (Correct)
    *   `const batch = await page.getByTestId('...');` (Incorrect - locators are synchronous)
*   **Action/Assertion:** ALWAYS `await` the usage.
    *   `await batch.click();`
    *   `await expect(batch).toBeVisible();`

This separation keeps test scripts clean and allows you to define locators at the top of a `test.step` even before the element has appeared.

## 4. Deterministic Seeding
Tests must never depend on the existing state of a user's database.

*   Use the `?setup=[seeder_name]` URL parameter to trigger the `E2ESeeder`.
*   Always verify seeder success:
    ```typescript
    const seedError = await page.evaluate(() => localStorage.getItem('E2E_SEED_ERROR'));
    expect(seedError).toBeNull();
    ```

## 5. Fighting "Strict Mode" Violations
If Playwright errors with "Strict mode violation: resolved to X elements":
1.  **Do NOT** use `.first()` or `.nth(n)` as a quick fix. This masks underlying ID clashing.
2.  **DO** increase the specificity of the `testID` in the application code.
3.  **DO** check if the component is double-mounting or if a ternary branch is rendering multiple nodes with the same ID.

## 6. Tactical Pauses
While Playwright "auto-waits," complex React state reconciliation (like database merges) can occasionally lag behind the test runner. 
*   Prefer `expect(...).toPass()` or visibility checks over hard `page.waitForTimeout()`.
*   If a timeout is absolutely necessary, label it: `// TACTICAL PAUSE: Awaiting state reconciliation`.

## 7. Mandatory Test Metadata
Every test specification must begin with a standardized header block. This ensures that intent, scope, and verification steps are clear to all developers and provides traceability for failed runs.

**Standard Header Template:**
```typescript
/**
 * TEST SPECIFICATION: [Descriptive Name]
 * --------------------------------------------------
 * SCOPE: [Primary Domain, e.g., Inventory Management]
 * 
 * METADATA:
 * Scenario: [Short Scenario Identifier]
 * Entity: [Primary Entity, e.g., Batch]
 * Foundation: [Required Seeder]
 * Last Amended: [YYYY-MM-DD]
 * App Version: [Optional: e.g. 1.0.0]
 * Schema Version: [Optional: e.g. 109]
 * 
 * INTENT: [High-level explanation of what is being tested and why]
 * 
 * TACTICAL VERIFICATIONS:
 * 1. [KEY_STEP] Specific assertion or state change to verify.
 */
```

## 8. Reference Examples (Gold Standard)
For the current "Gold Standard" implementation of this protocol, refer to the following specifications:

1.  **Basic Silent Merge:** `inv.batch.merge.basic.spec.ts`
    *   *Focus:* Quantity aggregation and Unique Batch verification.
2.  **Modal Consolidation:** `inv.batch.merge.from_underspecified.spec.ts`
    *   *Focus:* Metadata compatibility and modal UI interaction.
3.  **Chained Creation:** `inv.batch.add.from_new_item_type.spec.ts`
    *   *Focus:* Cross-form state propagation.

## 9. File Naming Convention
Test files must follow a hierarchical "Action-based" naming pattern to ensure logical grouping and discoverability within the repository.

**Standard Pattern:** `[domain].[entity].[action].[scenario].spec.ts`

*   **Domain:** The high-level functional area (e.g., `inv` for Inventory, `led` for Ledger).
*   **Entity:** The primary object being tested (e.g., `batch`, `cabinet`).
*   **Action:** The operation being performed (e.g., `add`, `merge`, `delete`).
*   **Scenario:** The specific variation or edge case being validated (e.g., `basic`, `from_underspecified`).

---
*Protocol Version: 1.2.0*
*Last Updated: 2026-05-02*
