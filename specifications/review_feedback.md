This document tracks items that were strictly specified in the `requirements.md` but were initially overlooked during the first iteration of development.

## Iteration 83: Cabinet Intelligence & The Vanguard Handshake
1. **Scenario 3 Guardrail (The Context-Switch Guard)**: Implemented the "Cabinet Silo" audit logic in `add.tsx`.
2. **Scenario 4: The Vanguard Handshake**: First-entry integrity for brand new items.
3. **Active Silence Rule**: Persistent resolution tracking (vanguard_resolved) ensuring prompts are one-time learning moments.
4. **Zero-Ground Aesthetics**: Pure black `#000000` ground and tiered slate gradient.

---

## Iteration 84: Quantity Intelligence (The Accidental Zero)
*   **Tactical Goal**: Detect anomalous quantities caused by "Double Taps" or "Stray Zeros" (e.g., 10 instead of 1).
*   **Intelligent Guard**: 
    *   **Trigger**: Current Quantity > 300% of the historical maximum for this item type (requires at least 2 historical batches).
    *   **Handshake**: A "Quantity Check" pulse next to the Save button or a soft modal: *"Entering [10] units. Usual purchase is [1-2]. Confirm?"*
*   **Learning**: If confirmed, the "Standard Range" is updated to include the new outlier.

## Iteration 85: Thermal Intelligence (Climate Silos)
*   **Tactical Goal**: Prevent climate-inappropriate storage (e.g. Frozen Peas in the Pantry).
*   **Intelligent Guard**: 
    *   **Trigger**: Cabinet Type (Standard/Freezer) conflicts with Category Thermal Profile.
    *   **Handshake**: Thermal warning icon appears. If saving passively, a prompt asks: *"This item usually requires [Freezer] storage. Set [Ambient Cabinet] as an exception for this batch?"*
*   **Low Friction**: Only triggers on passive acceptance. Manual cabinet choice implies a deliberate exception.

## Iteration 86: Dimensional Intelligence (Size Scaling)
*   **Tactical Goal**: Detect scale errors (e.g. entering 500 units instead of 500g) while catching significant new spend patterns (e.g. 5L vs 1L).
*   **Intelligent Guard**: 
    *   **Trigger**: Current Size < 50% of historical minimum OR > 200% of historical maximum.
    *   **Heuristic**: Suppressed for the first 3 entries of any item to establish a baseline.
    *   **Handshake**: *"Significant size shift detected (5L). Promote this as the new default size?"*
    *   **Learning**: Confirmation updates the `default_size` in the item specification.

---

## Iteration 87: Fuzzy Intel (Brand / Supplier) [COMPLETE]
*   **Tactical Goal**: Prevent brand fragmentation (e.g., "Tesco" vs "Tescos") using Levenshtein distance audits.
*   **Logic**: 
    1.  **Autocomplete**: Suggests items with Dist 1-2 if prefix matches are sparse.
    2.  **Harmonizer Gate**: On save, triggers a "Standardize?" modal if a new brand is a near-miss of an existing one.
*   **Status**: Implemented in `add.tsx` with `getLevenshteinDistance` utility.

## Iteration 88: Fuzzy Intel (Product Range)
*   **Tactical Goal**: Harmonize internal ranges (e.g. "Finest" vs "Finest Range").
*   **Implementation**: Migration of the Iteration 87 logic to the `productRange` field and suggestions.

## Iteration 89: Fuzzy Intel (Fresh Ingredients)
*   **Tactical Goal**: Harmonize Mess Hall inventory components (e.g. "Tomatoes" vs "Tomato").
*   **Implementation**: Migration of the Iteration 87 logic to the Mess Hall ingredient entry screens.

---

#### 📡 STRATEGIC VERIFICATION (ITERATION 83)
**[TC-83.1] VERIFICATION: Cabinet Silo Guardrail (Scenario 3)**
*   **Conditions**: Olive Oil in Pantry; Global Memory = Garage.
*   **Assertions**: Discrepancy Modal triggers on passive save.

**[TC-83.2] VERIFICATION: Vanguard Handshake (Scenario 4)**
*   **Conditions**: Brand new item "Saffron"; Global Memory = Pantry.
*   **Assertions**: Vanguard Modal triggers; resolution silences future prompts for Saffron.

---

## Iteration 96: Intel Collision Harmonisation
*   **Tactical Goal**: Enforce strict data non-clobbering rules when resolving batch collisions, whilst ensuring high-fidelity conditional feedback.
*   **Implementation**: 
    1.  **Cascading Validation**: Integrated sequential `onSubmitEditing` and Save-time fuzzy checks to prevent overlapping modal collisions and eliminate race conditions.
    2.  **Explicit Context**: Rebuilt the "Intel Collision" modal to explicitly render Brand, Range, Size, Expiry, and Intel for completely transparent user verification.
    3.  **The Priority Void Rule**: Branded/Detailed entries cannot be merged into Brand-Free/Empty Inventory slots. NULL (new) seamlessly adopts Inventory fields (`!cleanNewSupplier || cleanNewSupplier === m.supplier`), but populated new items cleanly partition into separate batches to prevent data erosion.

---

## Iteration 97: Segmented Logistics (Fractional Bulk)
*   **Tactical Goal**: Support decanting/partial consumption from bulk items (e.g. 5L Olive Oil, 10kg Rice) without the friction of numeric measurement entry.
*   **Concept**: **Segmented Pips (Tactical Charges)**.
*   **Logic**: 
    1.  **Portioning**: Allow items to be defined by "Segments per Unit" (e.g., a 5L bottle has 5 segments of 1L).
    2.  **Discrete Interaction**: Consumption is handled by tapping/emptying a "pip" rather than typing decimals.
    3.  **Low Friction**: Maintains the core "Speed" principle by treating partials as discrete "charges" (like an ammo clip).
*   **Status**: Conceptual (Spit-balled). Held for future implementation.

---

## Iteration 98: Expiry Omission Guard (Silent Error Mitigation)
*   **Tactical Goal**: Prevent the "Error of Omission" where a user inadvertently submits a batch with the default "Current Month" expiry date.
*   **Implementation**: 
    1.  **Interaction Logging**: Introduced `expiryTouched` ref in `add.tsx` to detect active engagement with the date pickers.
    2.  **Handshake Intercept**: Save logic now pauses for non-freezer items if `expiryTouched` is false and the date matches the current month/year.
    3.  **Two-Path Resolution**: 
        - **[SET EXPIRY DATE]**: Triggers an orchestrated UI transition—closing the modal, auto-scrolling the form to the pinned date badge, and opening the month picker.
        - **[SAVE ANYWAY]**: Explicitly confirms the user's intent to record a "near-expiry" item, preventing future prompts for that specific save attempt.
    4.  **UX Polish**: Added a prominent **Pinned Date Badge** (MM/YYYY) that remains visible at the top of the expiry section during interaction to maintain temporal context.

---

## Iteration 99: Category Reclassification
*   **Tactical Goal**: Allow users to correct misclassified items and fluidly move item types between categories directly from the edit modal.
*   **Implementation**: 
    1.  **Context Extraction**: Implemented cross-category selection within the `catalog.tsx` item edit UI.
    2.  **State Fluidity**: Enabled the `category_id` attribute to be mutable via an interactive chip row, allowing seamless reassignment in the database.
    3.  **UI Integrity**: Maintains proper list rendering behavior where updated items instantly vanish from their old category block and populate their new designated category.

---

## Iteration 100: OCR Expiry Scanning (Logistical Date Intel)
*   **Tactical Goal**: Implement a high-speed, noise-robust "Logistical Date" extraction engine to eliminate manual typing during resupply.
*   **Implementation**: 
    1.  **Coordinate-Based Filtering**: Restricts OCR processing to a center viewfinder area to ignore peripheral "serving suggestion" noise without requiring image cropping.
    2.  **Strict Year Validation**: Enforces that years must be 2 or 4 digits. 4-digit years must start with `20`; 2-digit years must be `≥ 25` (the 2025 relevance threshold).
    3.  **Ambiguity Logic**: Handles both UK (`DD/MM`) and US (`MM/DD`) numeric formats by requiring at least one value to be `≤ 12`. Defaults to UK if both are low (e.g., `05/06` → June).
    4.  **Noise Handlers**: Uses digit-based boundaries (instead of word boundaries) to extract dates from cluttered strings like `BBE30/03/2026` or `12MAY359Leppc`.

### 📡 TEST RANGE (DATE VARIATIONS)
| Category | Format Examples | Expected Output (Logistical Date) |
| :--- | :--- | :--- |
| **Standard Numeric** | `30/03/2026`, `30-03-26`, `30.03.26` | `03/2026` |
| **US Format** | `03/30/2026`, `03/30/26` | `03/2026` |
| **Full Text Month** | `23 January 2027`, `Jan 23 2027` | `01/2027` |
| **Yearless** | `23 JUN`, `07 MAY` | `06/2026` (Presumes current year) |
| **Month-Year Only** | `JUN 27`, `MAY/2027`, `MAY/27` | `06/2027`, `05/2027` |
| **Threshold Logic** | `MAY 07` (7 < 25 threshold) | `05/2026` (Treated as Day, current year) |
| **Threshold Logic** | `MAY 26` (26 >= 25 threshold) | `05/2026` (Treated as Year) |
| **Noise Recovery** | `BBE JUN 27`, `DRe30/03/26` | `06/2027`, `03/2026` |
| **Invalid/Rejected** | `13/14/26`, `12 May 359` | `NO DATE DETECTED` (or `05/2026` fallback) |
## Iteration 101: Strategic Preparedness Dashboard (The Command Ledger)
*   **Tactical Goal**: Surface global stock health and categorical preparedness through a centralized, honest command interface.
*   **Implementation**:
    1.  **Honest Preparedness Pulse**: Implemented "Pessimistic Averaging" for global and category scores. Item-level readiness is capped at 100% for the aggregate calculation, ensuring that massive surpluses in one area cannot mask critical deficits in another.
    2.  **Category Drill-Down**: Interactive Heat Map tiles that allow deep-diving into specific sectors to identify individual item strengths and shortfalls.
    3.  **Tactical Threshold Scaling**: Item bars feature a **Brilliant White** center line representing the Minimum Target. The bar scales to **200%**, turning into a "Dark Green" surplus once the target is exceeded, and reaching full width at the Max Desired level.
    4.  **Zero-Threshold Neutrality**: Items with a Minimum Stock of `0` are excluded from all readiness measures to ensure the dashboard reflects only active tactical requirements.
    5.  **Priority Sorting**: The dashboard and drill-down views automatically order assets by their readiness level (**Lowest First**), with alphabetical tie-breaking, ensuring that critical supply gaps always float to the top of the "Command Ledger."
    6.  **"White Heat" Surplus Logic**: Refined surplus triggers to strictly target levels **above** the defined Maximum Desired stock, preventing optimal inventory from being flagged as over-stock.

---

## Iteration 102: Centralised Measurement Architecture (Unit Display Integrity)

*   **Tactical Goal**: Eliminate all instances of double-unit display (`gg`, `mlml`), missing units on history chips, and scattered manual unit concatenation logic across the codebase.

*   **Root Cause**: Unit suffixes were being appended manually at the render layer in multiple screens using inline ternary expressions (e.g. `item.size + (unit_type === 'weight' ? 'g' : 'ml')`). Simultaneously, quantity values fetched from the database sometimes already contained the suffix (legacy "dirty" data), causing double-suffix rendering. History-based smart chips also stored raw numerics and rendered them without any suffix.

*   **Implementation**:
    1.  **`src/utils/measurements.ts`** *(New — Single Source of Truth)*: Created a centralised measurement utility module containing:
        -   `normalizeNumericInput(val)` — DAL bouncer that strips all non-numeric characters before any database write.
        -   `formatQuantity(val, unitType)` — Display formatter that pairs a raw numeric with the correct suffix (`g`, `ml`, `kg`, `L`), with auto-abbreviation for values ≥ 1000.
        -   `getUnitSuffix(unitType)` — Returns the plain suffix string for use in placeholders and labels.
        -   `formatStockLabel(qty, size, unitType)` — Formats a batch count × pack size into a total weight/volume string.
    2.  **`src/database/ItemTypes.ts`** *(DAL Bouncer)*: All `updateThresholds` and `updateDefaultSize` calls now pass through `normalizeNumericInput`, ensuring no dirty string data (`500g`, `1kg`) can be persisted to `default_size` columns.
    3.  **`src/app/add.tsx`** *(Smart Chips Fix)*: Refactored `allChips` from a flat `string[]` to a typed `{ label: string; value: string }[]` array. History-sourced chips (`customChips`) now render via `formatQuantity()`, ensuring `500` displays as `500g` for a weight item. Generic chips (`50g`, `100ml`) retain their pre-labelled strings. The numeric `value` used for state and deduplication is always clean.
    4.  **`src/app/logistics.tsx`** *(Resupply & Rotation Screens)*: Replaced a broken `formatQtyStr` reference and two manual inline ternary concatenations with `formatQuantity()`. Also updated the "Suggested Unit Size" label to render with correct units via `formatQuantity()`.
    5.  **`src/app/index.tsx`** *(Inventory Modals)*: Replaced manual unit concatenation in three confirmation modals (Delete Batch, Move Batch, Confirm Consumption) with `formatQuantity()`.
    6.  **`src/app/catalog.tsx`** *(Catalog Stat Badges)*: Replaced manual string concatenation on default size badges with `formatQuantity()`.
    7.  **`src/components/ReadinessCommandView.tsx`** *(Readiness Dashboard)*: Replaced local `getUnitSuffix` duplicate and all manual unit expressions with centralised imports.

---

### 🧪 TEST RANGE — Unit Display

> All tests below should be performed with items covering **all three unit types**: `weight` (g/kg), `volume` (ml/L), and `count` (no suffix).

| Screen / Feature | Navigation Path | What to Test | Pass Condition |
| :--- | :--- | :--- | :--- |
| **Add Batch — History Chips** | Home → `+` → Select existing item type | Smart chips drawn from past batch history | History chips show units (e.g. `500g`, `250ml`) — not bare numbers (`500`, `250`) |
| **Add Batch — Generic Chips** | Home → `+` → Select existing item type | Preset chips for weight/volume/count | Chips show `50g`, `100g`, `1kg` / `50ml`, `1l` / `1`, `6`, `12` — no doubles |
| **Add Batch — Active Chip** | Home → `+` → Tap any chip | Chip selection highlights and populates text input | Text input shows raw numeric only (e.g. `500`), chip label shows units |
| **Add Batch — Mixed Chips** | Home → `+` → Select item with 1–3 past batches | Both generic and history chips visible | No duplicate entries for same value; history chips not missing units |
| **Delete Batch Modal** | Home → Inventory List → Long-press or swipe batch → Delete | Pack size shown in confirmation modal | Displays `500g` / `250ml` — not `500g g` or bare `500` |
| **Move Batch Modal** | Home → Inventory List → Move batch action | Pack size shown in move confirmation | Displays correct formatted quantity with unit |
| **Confirm Consumption Modal** | Home → Inventory List → Consume/use batch | Pack size shown in consumption confirmation | Displays correct formatted quantity with unit |
| **Catalog — Default Size Badge** | Catalog tab → Any item type with a default size | Stat badge on item type card | Shows `500g` / `1L` — not `500gg` / `1Lml` or bare `500` |
| **Catalog — Edit Item Type** | Catalog → Edit item type → Save | Default size persisted after editing | Saved value is numeric only in DB; display shows units |
| **Catalog — Add Item Type** | Catalog → Add new item type | Default size field for new type | Input accepts numeric; unit suffix displayed alongside, not inside, the field |
| **Logistics — Resupply Tab** | Logistics → Resupply tab | "Current Stock" and "Pack size" labels per item | Displays formatted quantity (e.g. `1.5kg`, `2L`); "Pack size:" label shows units |
| **Logistics — Rotation Tab (Freezer)** | Logistics → Rotation tab → Freezer items | Batch size in frozen item rows | Shows `500g` / `250ml` not double-suffixed or bare |
| **Logistics — Deficit Badges** | Logistics → Resupply → Items below min/max target | MIN / MAX deficit badges | Values formatted correctly with unit suffix |
| **Readiness Dashboard — Pip Array** | Logistics → Readiness tab | Asset health pips and drill-down deficit list | All quantities show correct unit; no `gg` / `mlml` |
| **Readiness Dashboard — Drill-down** | Logistics → Readiness → Tap category tile | Per-item stock level and deficit values | Formatted via `formatQuantity`; suffix appears exactly once |
| **Large Value Abbreviation** | Any screen with items ≥ 1000g or ≥ 1000ml | Display of 1000g / 2000g / 1000ml items | Auto-abbreviates: `1000g` → `1kg`, `1000ml` → `1L`, `2000g` → `2kg` |
| **Count Items (No Units)** | Any screen with a `count` unit type item | All display locations listed above | No unit suffix appended — shows bare number only (e.g. `6`) |

---

### ⚠️ PENDING: One-Time DB Scrub

> The DAL bouncer prevents **new** dirty data from entering the database. However, any `size` or `default_size` values entered **before** this fix may still contain embedded unit suffixes (e.g. `"500g"`, `"1L"`).

**Recommended action**: Run a one-time migration sweep against `ItemTypes.default_size` and `Inventory.size` to strip non-numeric characters from existing rows. This should be implemented as an idempotent migration in `sqlite.ts` and guarded by a version check to ensure it runs only once.

Until this scrub is performed, the `normalizeNumericInput` call in the DAL bouncer and the `.replace(/[^0-9.]/g, '')` calls in `add.tsx` act as runtime guards to prevent dirty legacy data from causing display issues.
