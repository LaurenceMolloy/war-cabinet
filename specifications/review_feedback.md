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

