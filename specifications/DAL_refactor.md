# DAL Refactor Manifest: Q2 2024
**Surgical Modernization Plan** | **Goal**: Zero-Regression SQL Extraction

This document maps every raw SQL query in the UI to a proposed Service-layer equivalent. Follow this manifest to "strangle" the monolith one query at a time.

---

## 1. Inventory & Batch Logistics
*Core operations for managing physical stock.*

| Plain English Purpose | SQL Template | Files & Usage | Unusual Observations |
| :--- | :--- | :--- | :--- |
| **Increase or Merge Batch** | `UPDATE Inventory SET quantity = ...` | `add:817` | Complex portions logic with IFNULL. |
| **Remove a Batch** | `DELETE FROM Inventory WHERE id = ?` | `add:822` | Non-atomic batch move/delete protocol. |
| **Create New Batch** | `INSERT INTO Inventory (...)` | `add:830` | 13 parameters passed directly from state. |
| **Fetch Expiry History** | `SELECT size FROM Inventory WHERE ...` | `add:487` | Duplicated in recipes:241 for usage stats. |

---

## 2. Item Type & Vocabulary Intelligence
*Global item definitions and fuzzy matching logic.*

| Plain English Purpose | SQL Template | Files & Usage | Unusual Observations |
| :--- | :--- | :--- | :--- |
| **Brand Suggestions** | `SELECT DISTINCT supplier FROM ...` | `add:347`<br/>`catalog:88` | Redundant autocomplete calls across screens. |
| **Fuzzy Duplicate Check** | `SELECT id FROM Inventory WHERE ...` | `add:770` | Hardcoded in the save pipeline logic. |
| **Frequency Intelligence** | `SELECT supplier, COUNT(*) ...` | `add:440`<br/>`add:448` | High-refresh cost brands calculation. |

---

## 3. Structural Logistics (Cabinets & Categories)
*The framework that organizes the inventory.*

| Plain English Purpose | SQL Template | Files & Usage | Unusual Observations |
| :--- | :--- | :--- | :--- |
| **List All Locations** | `SELECT * FROM Cabinets` | `add:342`<br/>`add:903`<br/>`catalog:132` | Prime candidate for global caching. |
| **Assign Default Location** | `UPDATE ItemTypes SET def_cab_id = ...` | `add:2061`<br/>`add:2130` | Scattered conflict resolution logic. |
| **Create New Cabinet** | `INSERT INTO Cabinets (...)` | `add:897` | Hardcoded 'freezer' logic in SQL string. |

---

## 4. Application Pulse (Settings)
*Persistent user preferences and trial state.*

| Plain English Purpose | SQL Template | Files & Usage | Unusual Observations |
| :--- | :--- | :--- | :--- |
| **Get Saved Preference** | `SELECT value FROM Settings ...` | `add:474`<br/>`recipes:170`<br/>`BillingContext:158`<br/>`BillingContext:163`<br/>`BillingContext:170` | Used for licence keys (hard vs legacy). |
| **Update Preference** | `INSERT OR REPLACE INTO Settings ...` | `add:838`<br/>`recipes:312`<br/>`BillingContext:304`<br/>`db/sqlite:327` | No type-safety; high misspelling risk. |

---

## Refactor Protocol: The "Surgical Command"
When tackling an item from this list:
1. **Target**: Choose one row (e.g., "List All Locations").
2. **Abstract**: Code the method in `mobile/src/services/InventoryService.ts`.
3. **Test**: Verify the method returns the correct data from a mock DB.
4. **Swap**: Replace the `db.getAllAsync` call in **ONLY ONE** UI file (e.g., `add`).
5. **Verify**: Manually confirm the dropdown/list still populates in the UI.
6. **Deploy**: Once verified, swap the remaining occurrences in other files.

**DO NOT** attempt to "fix" all occurrences in one commit. Limit the blast radius.
