# War Cabinet: Comprehensive Codebase Audit (April 2024)
**Architectural Lead Audit** | **Focus**: Quality, Maintainability, Performance

---

## 1. Executive Summary
The War Cabinet codebase currently exhibits a "Monolithic Growth" pattern. Critical business logic has migrated out of isolated services and into massive "God-Component" UI files. While the application is functional, it is architecturally fragile. The primary risks are **performance degradation** on mobile hardware and **significant regression risks** during schema migrations due to a lack of a formal Data Access Layer (DAL).

---

## 2. High-Severity Issues

### 2.1 The "God Component" Anti-Pattern
*   **Target**: `mobile/src/app/add.tsx` (~2,300 lines), `mobile/src/app/recipes.tsx` (~2,000 lines), `mobile/src/app/index.tsx` (~2,100 lines).
*   **The Problem**: These files violate the Single Responsibility Principle. They manage UI layout, hundred-branch state machines, and direct persistence in a single context.
*   **Why it Matters**: High cognitive load. A simple UI tweak requires navigating thousands of lines of logic. Re-renders are extremely expensive on mobile hardware.
*   **Improvement**: Decompose into functional "Organisms" and extract business logic into custom hooks.

### 2.2 Raw SQL Leakage (Lack of DAL)
*   **Target**: System-wide (especially `add.tsx`, `catalog.tsx`, `recipes.tsx`)
*   **The Problem**: Database queries are written as raw strings directly within UI components. 
    *   *Example*: `await db.runAsync('UPDATE Inventory SET quantity = quantity + ...')`
*   **Why it Matters**: Schema changes (renaming a column) require a dangerous global search-and-replace. There is no type-safety for database entities, making the logic "blind" until a runtime crash occurs.
*   **Improvement**: Implement a simple **Repository Pattern**. UI components should call `InventoryService.updateQuantity(id, amount)` instead of writing SQL.

### 2.3 Serialization Fragility (Backup Service Mapping)
*   **Target**: `mobile/src/services/BackupService.ts`
*   **The Problem**: The `restore` and `createBackup` methods use hardcoded object mappings to rebuild the database. 
    *   *Example*: Lines 306-314 of `BackupService.ts` manually map 14 columns for `ItemTypes`.
*   **Why it Matters**: This is a "Silent Failure" point. If a new column is added to `sqlite.ts` but forgotten in `BackupService.ts`, backups will successfully complete but data will be permanently lost on restore.
*   **Improvement**: Use an introspection pattern or a shared schema definition that both `sqlite.ts` and `BackupService.ts` consume to ensure structural parity.

### 2.4 [Reviewer Addition] Coordinate Wrestling (Hardcoded Metrics)
*   **Target**: `mobile/src/app/index.tsx` (Lines 118-171)
*   **The Problem**: The dashboard uses hardcoded pixel offsets (e.g., `CLOSED_CAT_HEIGHT: 82`) to manually calculate scroll positions for the "Jump to Batch" feature.
*   **Why it Matters**: **Extreme fragility.** The logic will break if font scaling is enabled, if a padding-top is changed in the styles, or if the user is on a high-density screen. This creates a "hidden contract" where a designer cannot change the UI without breaking the search features.
*   **Improvement**: Use the standard `data`-driven approach for FlatList scrolling or implement dynamic measurement (`onLayout`) instead of hardcoded numbers.

### 2.5 [Reviewer Addition] Global Param-to-State Coupling
*   **Target**: `mobile/src/app/index.tsx` (Lines 84-116)
*   **The Problem**: The app uses `useLocalSearchParams` to trigger side-effects like database filtering and feedback banners. 
*   **Why it Matters**: The dashboard cannot be tested in isolation because its state is forced by global navigation parameters rather than being derived from a central store. 
*   **Improvement**: Move navigation parameter handling to a dedicated "Route Handler" hook that updates a central state manager.

---

## 3. Medium-Severity Issues

### 3.1 Algorithmic Duplication & Utility Bloat
*   **Target**: `getLevenshteinDistance`, `NearMissIcon`
*   **The Problem**: Identical utility functions are copy-pasted into multiple files (`add.tsx` and `recipes.tsx`).
*   **Why it Matters**: Bug fixes in the algorithm must be applied in multiple places. It increases the bundle size and violates the DRY (Don't Repeat Yourself) principle.
*   **Improvement**: Move these to a `mobile/src/utils/` directory.

### 3.2 Misleading "Clever" logic in BillingContext
*   **Target**: `mobile/src/context/BillingContext.tsx`
*   **The Problem**: The context mixes data-providing logic with UI-providing logic (Modals).
    *   *Example*: 400+ lines of the 700-line file are taken up by `Modal` JSX for the "Paywall" and "Welcome" screens.
*   **Why it Matters**: A context should be a thin data provider. When UI components are embedded in the context, every state change (e.g., changing a welcome page) can trigger unnecessary re-renders across all context consumers.
*   **Improvement**: Move UI Modals into a dedicated `components/billing/` directory. The context should only provide state (`isPremium`) and triggers (`showPaywall()`).

### 3.3 Poor Migration Lifecycle
*   **Target**: `mobile/src/db/sqlite.ts`
*   **The Problem**: sequential `if (!hasColumn) { ALTER TABLE }` checks within `initializeDatabase`.
*   **Why it Matters**: This approach is non-transactional and serial. If the app crashes during his 10th `ALTER TABLE`, the DB is left in an inconsistent "half-migrated" state that is very difficult to recover from.
*   **Improvement**: Implement a versioned migration runner that executes steps in a block within a single SQL transaction.

---

## 4. Low-Severity / Performance Issues

### 4.1 "Elastic Prefix" Performance
*   **Target**: `updateSupplierSuggestions` in `add.tsx`
*   **The Problem**: Calling Levenshtein distance on every keystroke against a vocabulary of hundreds of items.
*   **Why it Matters**: On mid-range Android devices, this will cause visible keyboard latency as the JS thread saturates on every character input.
*   **Improvement**: Debounce the search or move the fuzzy calculation to a Web Worker / background thread (though difficult in RN, simpler debouncing usually suffices).

### 4.2 Inconsistent Naming Conventions
*   **Target**: Cross-file
*   **The Problem**: `dietary_pref` vs `recipe_dietary`, `isCadet` vs `isTrialActive`.
*   **Why it Matters**: High friction for new developers. They must maintain a mental mapping of "Which key is which?" depending on which screen they are currently editing.
*   **Improvement**: Standardize on a single prefixing convention for `Settings` table keys and variable aliases.

---

## 5. Summary of Technical Debt
| Issue | Severity | Risk Type | Priority |
| :--- | :--- | :--- | :--- |
| **Code Monoliths** | High | Perf / Maintenance | P1 |
| **Coordinate Wrestling** | High | Stability (UX) | P1 |
| **Raw SQL in UI** | High | Stability / Regression | P2 |
| **Param Coupling** | Medium | Maintainability | P2 |
| **Backup Mapping** | High | Data Loss | P2 |
| **UI-in-Context** | Medium | Performance | P3 |
| **Algorithm Dupe** | Medium | Maintainability | P3 |
| **Manual Migrations** | Medium | Stability | P3 |

---
**Audit Complete.** 
*Note: As instructed, no files have been modified. This document serves as a strategic blueprint for upcoming surgical refactors.*
