# E2E Testing Foundations

This document outlines the available database seeder scenarios (Foundations) used for E2E testing in the War Cabinet mobile application. These scenarios are triggered via the `setup` URL parameter during test initialization.

## Usage
In your Playwright test, initialize the environment using:
```typescript
await page.goto('http://localhost:8081/?setup=foundation_name');
```

---

## 1. `foundation_basic_grid_with_types`
**Rank Context:** `SERGEANT`
**Purpose:** Provides a clean, empty grid for testing addition and metadata learning flows.

### Injected Entities:
*   **Cabinets (4):** 
    *   `TEST CABINET 1` (Standard)
    *   `TEST CABINET 2` (Standard)
    *   `TEST FREEZER 1` (Freezer)
    *   `TEST FREEZER 2` (Freezer)
*   **Categories (4):** 
    *   `TEST CATEGORY 1` (Wheat icon)
    *   `TEST CATEGORY 2` (Water icon)
    *   `TEST CATEGORY 3` (Leaf icon)
    *   `TEST CATEGORY 4` (Apple icon)
*   **Item Types (4):** One per category, all with `vanguard_resolved = 1`.
*   **Inventory:** **NONE**. All new batches will start with ID `1`.

---

## 2. `foundation_with_inventory`
**Rank Context:** `SERGEANT`
**Purpose:** Provides a populated environment for testing logistical oversight, site fragmentation, and conflict resolution.

### Injected Entities:
*   **Cabinets & Categories:** Identical to `foundation_basic_grid_with_types`.
*   **Item Types:** Identical to `foundation_basic_grid_with_types`.
*   **Inventory (4 Batches):** 
    *   `TEST ITEM 1` has 10 units in `TEST CABINET 1`.
    *   `TEST ITEM 2` has 5 units in `TEST CABINET 2`.
    *   `TEST ITEM 3` has 2 units in `TEST FREEZER 1`.
    *   `TEST ITEM 4` has 8 units in `TEST FREEZER 2`.
*   **Note:** All new batches in this scenario will start with ID `5`.

---

## 3. `foundation_oversight`
**Rank Context:** `SERGEANT`
**Purpose:** Provides a hyper-focused environment designed exclusively for testing cabinet site fidelity, Vanguard initialization, and Location Conflict fragmentation protocols.

### Injected Entities:
*   **Cabinets (4):** 
    *   `TEST CABINET 1` (SITE 1, Standard)
    *   `TEST CABINET 2` (SITE 2, Standard)
    *   `TEST CABINET 3` (SITE 3, Standard)
    *   `TEST CABINET 4` (SITE 4, Standard)
*   **Categories (1):** 
    *   `LOGISTICS TEST` (Truck icon, Mess Hall)
*   **Item Types (1):** 
    *   `TEST ITEM 1` (`vanguard_resolved = 1`, `default_cabinet_id = 1`)
*   **Inventory (1 Batch):** 
    *   `TEST ITEM 1` has 10 units of 100g in `TEST CABINET 1` (Baseline Stock).

---

## 4. `foundation_basic_cabinets_and_categories`
**Alias:** This is currently an alias for `foundation_basic_grid_with_types`.

---

## Technical Notes
*   **Sequence Reset:** All scenarios perform a `DELETE FROM sqlite_sequence` to ensure deterministic IDs (1, 2, 3...) regardless of previous runs.
*   **Child-First Wipe:** seeders perform a full wipe of `TacticalLogs`, `Inventory`, `ItemTypes`, `Categories`, and `Cabinets` before deployment.
*   **Rank Persistence:** The `rank` parameter (e.g., `&rank=sergeant`) is persisted to `localStorage` and the database `Settings` table to ensure the app remains in the correct entitlement tier during the session.
