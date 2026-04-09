# Review Feedback

This document tracks items that were strictly specified in the `requirements.md` but were initially overlooked during the first iteration of development.

## Iteration 69: High-Density Logistics & Strict UI Filtering
1. **Strict UI Filtering (Noise Reduction)**: Re-engineered the Dashboard and Quartermaster briefed logic to strictly purge non-matching categories and items when filters or search strings are active. This eliminates visual noise, presenting only relevant mission assets.
2. **Tiered Urgency Protocols**: Refined the expiry filtering system into three distinct mission windows: **EXPIRED**, **EXPIRING THIS MONTH**, and **EXPIRING SOON (1-3 MONTHS)**, providing tiered, mutually exclusive visibility into inventory threats.
3. **Frozen Logistics Parity**: Integrated frozen asset preservation windows into the global urgency engine. Filters now use "Calculated Expiry" (Entry Date + Preservation Months) to ensure cold-stored items are accurately represented in urgency briefings.
4. **Reactive Command States**: Implemented a real-time reactive pipeline for search and filtering. The tactical display now adapts instantly as the user types or adjusts logistical tiers.

---
#### 📡 STRATEGIC VERIFICATION (ITERATION 69)
**[TC-69.1] VERIFICATION: Strict Filtering & Frozen Urgency**
*   **Conditions**: Clean database; Sergeant rank unlocked.
*   **Actions**:
    1. Create two categories: "Alpha" (with stock) and "Beta" (empty).
    2. Search for "Alpha" and verify "Beta" is strictly removed from view.
    3. Filter by a specific Cabinet and verify non-matching categories vanish.
    4. Create a frozen item (Entry: Now, Limit: 0 months) and verify it appears in the **EXPIRED** filter.
    5. Create an ambient item (Expiry: Current Month) and verify it appears in **EXPIRING THIS MONTH**.
*   **Assertions**:
    1. NOISE REDUCTION: Empty or non-matching categories must be completely hidden (not just ghosted) during search/filter operations.
    2. URGENCY ACCURACY: The **THIS MONTH** filter accurately captures both ambient expiries and frozen preservation limits ending in the current month.
    3. REACTIVITY: The UI must update immediately upon search string input without manual refresh.

## Iteration 68: Tactical Catalog & Logistics Orchestration
1. **Tactical Command Dashboard**: Integrated a quad-panel metric overview at the top of the Catalog screen, providing real-time tracking of **CATEGORIES**, **ITEMS**, **MIN TARGETS**, and **MAX TARGETS**.
2. **Accordion Logistics (Concertina Mode)**: Transitioned category sections into collapsible accordions with a strict single-expansion policy, promoting focused management.
3. **Localized Logistical Briefing**: Collapsed category headers now display a dynamic summary briefing: `ITEMS • FAVOURITES • MIN/MAX SET`, allowing for rapid auditing of logistical coverage within each section.
4. **Height-Stabilized Header**: Re-architected the category header into a two-row layout. Primary command icons (Edit, Delete, Expand) are fixed to the top row, ensuring UI stability during expansion.
5. **Logistical Zero-State Advisory**: Implemented a targeted advisory for unconfigured catalogs specifically highlighting the absence of minimum thresholds: *"No minimum desired stock levels have been set. Configure some minimum thresholds below to enable Quartermaster low stock reports and alerts."*
6. **Grammatical Precision**: Standardized all nomenclature across the Catalog dashboard, including automated singular/plural handling for "ITEM/ITEMS" and "FAVOURITE/FAVOURITES".

---
#### 📡 STRATEGIC VERIFICATION (ITERATION 68)
**[TC-68.1] VERIFICATION: Catalog Metrics & Logistical Briefing**
*   **Conditions**: Clean database; Sergeant rank unlocked.
*   **Actions**:
    1. Navigate to **Catalog** (Settings > Catalog).
    2. Add a new Category ("Logistics Alpha").
    3. Add a new Item ("Combat Rations") under "Logistics Alpha".
    4. Set a **MIN TARGET** for "Combat Rations".
    5. Set a **MAX TARGET** for "Combat Rations".
    6. Verify metrics at the top of the screen.
    7. Collapse the category and verify the summary briefing row.
    8. Add a second category and repeat, verifying only one remains open.
*   **Assertions**:
    1. METRICS: Dashboard counts correctly reflect 1 Category, 1 Item, 1 Min Target, and 1 Max Target.
    2. ADVISORY: The low-stock warning disappears as soon as the first MIN target is established.
    3. CONCERTINA: Opening "Logistics Beta" automatically collapses "Logistics Alpha".
    4. ACCURACY: The summary row correctly labels "1 ITEM • 1 MIN/MAX SET" (and "1 FAVOURITE" if starred).

## Iteration 66: Fridge Staples & Authentic Recipe Formatting
1. **Fridge Staples Engine**: Integrated a dedicated "Fridge Staples (often found in your fridge)" text input allowing users to freely enter comma-separated fast-moving perishables. These staples are treated mathematically alongside pantry "Available Ingredients" as optional support components.
2. **"Generate-Action" Memory Catch (Bug Fix)**: Resolved a race condition where tapping "Generate Prompt" immediately after typing custom variables failed to register the string if the field had not explicitly blurred. The 'Generate' engine now actively intercepts, captures, and commits pending text box sequences prior to payload construction.
3. **Shopping List Generation**: Upgraded the Authentic Recipe Mode framework to require the LLM to cross-reference the generated recipe against the combined Expiry/Pantry/Staples context, explicitly printing an exclusionary "Shopping List" for items requiring purchase.
4. **Aggressive Markdown Formatting (Authentic Mode)**: Hardened the Authentic Recipe AI instructional prompt to rigorously utilize structural plain-text Markdown (`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` dividers, `> *` blockquotes, and `[Fallback URL](...search?q=...)` dynamic Google linkages) ensuring premium visual outputs in third-party chatbots without relying on emojis.

---
#### 📡 STRATEGIC VERIFICATION (ITERATION 66)
**[TC-66.1] VERIFICATION: Fridge Staples Instant Memory & Catch Compilation**
*   **Conditions**: Clean database; zero previous fridge staples logged.
*   **Actions**:
    1. Navigate to **Mess Hall Recipes**.
    2. Tap into the Fridge Staples input field.
    3. Type "Garlic, onions, Spinach" (with varied cases and spacing).
    4. **CRITICAL:** Do NOT tap away (blur). Immediately tap **GENERATE PROMPT**.
    5. Close the prompt.
*   **Assertions**:
    1. MEMORY CATCH: The active text box string was successfully intercepted and commited before generation.
    2. ALPHABETIZATION & FORMATTING: The input was parsed, lowercased, alphabetically sorted, and rendered as distinct selectable chips ("garlic", "onions", "spinach").
    3. PROMPT ACCURACY: The generated briefing text correctly registers the staples as "Available" optional support.

## Iteration 64: Memorized Chef Selection
1. **Curated Chef List Refinement**: Streamlined the "Legendary Chef Intel" picker to a high-impact set of 5 core experts (BBC Good Food, Ramsay, Oliver, Nigella, Ottolenghi) for faster operational selection.
2. **"Suggest a Chef" Input**: Added a tactical text input field to the recipe configuration screen, allowing users to define any custom culinary expert for the AI to emulate.
3. **Persistent Chef Memory**: Implemented a 2-slot sliding window memory for custom chef suggestions. The last two unique experts entered are automatically promoted to the clickable chip row, ensuring rapid access to preferred niche styles in future sessions.
4. **Settings Persistence**: Custom chef history and the last-used suggestion are now fully persisted in the `Settings` table, surviving application restarts or backgrounding.

---
#### 📡 STRATEGIC VERIFICATION (ITERATION 64)
**[TC-64.1] VERIFICATION: Memorized Chef Selection & History**
*   **Conditions**: Clean database; Recipes screen accessible.
*   **Actions**:
    1. Navigate to **Mess Hall Recipes**.
    2. Enter "Marco Pierre White" into the **"SUGGEST A CHEF"** input.
    3. Tap **"GENERATE PROMPT"**.
    4. Confirm the prompt is generated, then tap **CLOSE** to return.
    5. Verify: A new chip for "Marco Pierre White" appears in the chef grid.
    6. Enter "Heston Blumenthal" into the suggestion box and tap **"GENERATE PROMPT"**.
    7. Return and verify: Both "Heston Blumenthal" and "Marco Pierre White" chips are visible.
    8. Enter "Alison Roman" and Generate.
    9. Verify: The list now shows "Alison Roman" and "Heston Blumenthal" (Marco Pierre White has been evicted from the 2-slot memory).
*   **Assertions**:
    1. RECOGNITION: Custom chefs are promoted to the selection grid as clickable chips.
    2. SLIDING WINDOW: Only the most recent TWO unique custom suggestions are retained.
    3. SELECTION: Tapping a custom history chip correctly selects that chef and populates the prompt.

## Iteration 63: Restock List Unit Fallback
1. **Logistics Engine Default Sizes**: Fixed a UX issue in the Restocking List where minimum thresholds for items configured as 'weight' or 'volume' would incorrectly format their deficit totals as physical metric capacities (e.g., 'MIN 3g') if no `default_size` was specified in the Catalog. The engine now explicitly prioritizes tracking raw unit count deficits when a standard container size is absent, matching the user's operational reality.

## Iteration 62: External Mirror Rolling 5
1. **SAF Mirror Suffix Pileup**: Resolved an issue on Android where external database backups would indefinitely pile up with `(1)`, `(2)` numeric suffixes instead of overriding the previous files. The Storage Access Framework engine now aggressively filters and purges all previous matching target slots (e.g. `02-WC-BACKUP`) before shifting the waterfall, properly maintaining the strict 5-file rolling stack on external storage and cleaning up any legacy accumulated junk.

## Iteration 61: Recipe Briefing Page
1. **Anchored Command Panel**: Locked clickable elements (Copy, Close, and AI Deployment Stations) to the top of the generated briefing screen for immediate action without scrolling.
2. **Configurable Deployment Stations**: A choice of 3 AI deployment stations added to the configuration screen. Users can configure the labels and URLs, and these match the deploy buttons dynamically (e.g. ChatGPT, Gemini, Claude).
3. **Direct AI Launching**: Tapping a deployment station's button automatically copies the briefing text and routes the user directly to the target AI website via device linking.
4. **Deployment Briefing Dialog**: Integrated a pop-up explanation dialog before launching the AI to inform users about the manual clipboard pasting process and the cost-saving rationale.
5. **Dismissable Prompts**: The deployment briefing dialog includes a "Don't show this briefing again" checkbox, allowing users to opt out of the prompt on future launches through local persistence.

## Iteration 60: Logistics & Restocking Refinement
- [x] Restocking list logic: Silent until MIN breach
- [x] Streamlined nomenclature: "Restocking List", "Current Stock", "Suggested Unit Size:"
- [x] Removed redundant navigation header (white banner) from Logistics screen
- [x] Conditional buy-count suggestions (only shown when Default Size exists)
- [x] Persistence: All logistics settings captured in Backup/Restore

## RESTORED CAPABILITIES (Post-Rollback Recovery)
The following strategic features were lost during an unintended source code revert and were manually restored from the Agent's persistent memory:

1. **Strategic Persistence & Android Channels**: Re-implemented the 'Strategic Alerts' Notification Channel with `MAX` importance and pinned persistence.
2. **Three-Tier Tactical Briefing**: Restored categorization logic for EXPIRED, EXPIRING THIS MONTH, and DUE TO EXPIRE SOON (3M).
3. **Precision Batch Identification**: Re-enabled the 'Batch-Count Brackets' (e.g., "Pasta (3)") to ensure notification clarity.
4. **Tactical Total Aggregation**: Restored the high-visibility Weight/Volume/Count totals in the Dashboard headers with unit-safe scaling (g -> kg, ml -> l).
5. **Proactive Command Settings**: Re-integrated the ALERTS tab and the 'TEST STOCK ALERT' simulation engine into the Catalog.

## Iteration 59: Strategic Resupply & Logistics
> [!NOTE]
> This iteration marked the transition to a Red/Green TDD development workflow. 
> Detailed specifications and verification logic have been moved to [red_green_tdd.md](file:///c:/Users/Laurence%20Molloy/Desktop/GIT/Personal_Github/war-cabinet/specifications/red_green_tdd.md).

## Fifty-Eighth Iteration Feedback

1. **Pixel-Perfect "Ref-Scroll" System**: Replaced the unreliable distance-estimation scroll with a coordinate-based "Two-Pass" measurement system for 100% landing accuracy.
    *   **Two-Pass Refinement**: The list first performs an instant "Pass 1" jump (using a guess) to ensure the target is rendered, then a "Pass 2" measurement using `measureInWindow` to calculate the exact pixel offset required.
    *   **Laser Landing**: Target batches now land exactly **300px** from the top of the viewport, consistently clearing the Search Bar and Front Line panel regardless of item heights or list position.
2. **Smart "Final-Unit" Modal Flow**: Streamlined the quick-use experience by consolidating the Confirm-Use and Confirm-Deletion steps for single-unit batches.
    *   **Contextual Transformation**: If a batch contains only 1 unit, the "Confirm Use" briefing card transforms into a **"USE & DELETE BATCH"** warning in red.
    *   **Single-Step Resolution**: Tapping confirm now performs both the deduction and the deletion in one go, eliminating the previous "Double-Modal Hop" (Confirm Use -> Confirm Deletion).
3. **Tactical Deletion Briefing**: Upgraded the manual deletion modal (triggered via the red minus button) to include the full tactical briefing card.
    *   **Physical Verification**: Users can now see the Cabinet, Location, Size, and Expiry of the batch they are about to remove, ensuring zero accidental deletions of the wrong stock batch.

---
#### 📡 STRATEGIC VERIFICATION (ITERATION 58)
**[TC-58.1] VERIFICATION: Pixel Precision & Smart Final Unit**
*   **Conditions**: 
    1. Item A: 1 unit remaining (starred).
    2. Item B: 5 units remaining (starred, deep in the list).
*   **Actions**:
    1. Tap **Item B** in The Front Line.
    2. Verify Landing: Watch the scroll — confirm the item lands ~300px from top (below search bar).
    3. Tap **Item A** in The Front Line.
    4. Verify Modal: Confirm the title is "USE & DELETE BATCH" and the briefing card is visible.
    5. Confirm Use/Delete: Tap button — verify the item is removed in a single action.
*   **Assertions**:
    1. PRECISION: Item B is perfectly framed and visible for the flash animation.
    2. NO DOUBLE-HOP: Tapping "Use & Delete" on Item A closes the modal and finishes the action immediately.
    3. CONTEXT: The manual red minus button on any batch now also shows the Briefing Card.

## Fifty-Fourth Iteration Feedback

1. **Strategic Disaster Recovery (The Ocean-Proof Safe)**: Re-architected the backup system from a "Chocolate Teapot" (internal storage only) to a durable, multi-layered recovery suite.
    *   **iOS Files App Gateway**: Enabled `UISupportsDocumentBrowser` to expose internal snapshots directly to the native iOS Files app, ensuring they are captured by iCloud system backups and survive app uninstallation.
    *   **Android Shadow Mirroring**: Implemented a "Persistence Mirror" protocol using the Storage Access Framework (SAF). Android users can now designate a public directory (e.g. Downloads) to receive automated shadow copies of every snapshot, protecting data even if the application is wiped.
2. **Waterfall Shift Protocol (The Rolling 5)**: Optimized the mirror folder to act as a chronological stack.
    *   **Premier Naming**: Switched to a "Number-First" naming convention (e.g., `01-WC-BACKUP.json`). This ensures the snapshot ID is always visible in the Android file picker, bypassing filename truncation issues.
    *   **Chronological Promotion**: Implemented a "Waterfall" shift where every new backup pushes existing files up (`01` -> `02`, `02` -> `03`, etc.). Slot **01** is guaranteed to be the most recent record at all times.
3. **Strategic Intelligence Reports (CSV)**: Transformed the raw CSV export into a formatted audit tool.
    *   **Tactical Status Flags**: Added a dynamic `Status` column in the CSV (EXPIRED, URGENT, WARNING, SAFE) to allow for instant situational auditing in Google Sheets or Excel.
    *   **Slot Synchronization**: Reports are now mirrored following the same Waterfall protocol (`01-WC-REPORT.csv`), ensuring human-readable data is always in sync with the latest system restore point.
4. **New Batch Persistence (Bug Fix)**: Resolved a critical regression where new stockpile batches were failing to persist to the database. The logic error was corrected to ensure all new inventory is securely committed to the SQLite store.

---
#### 📡 STRATEGIC VERIFICATION (ITERATION 54)
**[TC-54.1] VERIFICATION: Waterfall Mirroring & Disaster Recovery (Android)**
*   **Conditions**: Android device/emulator; No existing mirror set.
*   **Actions**:
    1. Navigate to **Settings > Backups**.
    2. Tap **"SETUP MIRROR FOLDER"** and select a folder in `Downloads`.
    3. Trigger **"SNAPSHOT NOW"** three times.
    4. Verify: Locate the files in the physical `Downloads` folder using a File Manager.
*   **Assertions**:
    1. WATERFALL: `01-WC-BACKUP.json` is always the freshest file (check timestamp).
    2. SHIFT: The file that was originally `01` is now `03` after three snapshots.
    3. VISIBILITY: The numbers `01`, `02`, etc., are clearly visible at the start of the filenames in the system picker.

## Fifty-Seventh Iteration Feedback
1. **Front Line "Tactical Follow" System**: After confirming use of a starred Front Line item, the dashboard now intelligently follows the action to show the deduction in context.
    *   **Cabinet Switch**: The dashboard filter automatically switches to the cabinet where the soonest-expiring batch lives.
    *   **Expand & Isolate**: The relevant category and item type are automatically expanded; all others collapse.
    *   **Animated Quantity Flash**: The quantity badge pulses green. The DB deduction fires at the animation peak so the number visibly counts down from N to N-1 while the badge is still glowing — matching the same visual feedback the user sees when manually tapping the red minus button.
    *   **Last-Unit Guard**: If the batch only has 1 unit left, the system routes to the standard delete confirmation modal instead of silently removing the batch.
2. **Confirm Use Modal — Tactical Intel Card**: Upgraded the bare "Use 1 unit?" prompt into a full briefing card showing Cabinet, Location, Size, and Expiry date so users can physically locate the item before confirming.
3. **Flash-Scroll via `useEffect` (Bug Fix)**: The previous `setTimeout` scroll used a stale closure of `categories` (pre-reload data) causing the list to jump to the wrong position. Replaced with a `useEffect` that watches both `flashBatchId` and `categories` simultaneously — React guarantees `categories` is the fresh, post-reload value at the time the effect fires. Since batches are FEFO-sorted, the deducted batch always appears at the top of its expanded type row.

---
#### 📡 STRATEGIC VERIFICATION (ITERATION 57)
**[TC-57.1] VERIFICATION: Front Line Tactical Follow & Flash**
*   **Conditions**: At least one starred item with 3+ units in a cabinet that is NOT currently active in the dashboard filter.
*   **Actions**:
    1. Set dashboard to a different cabinet (not the starred item's cabinet).
    2. Tap the starred item chip in The Front Line.
    3. Review the **Confirm Use** modal — verify Location, Size, Expiry are shown.
    4. Tap **CONFIRM USE**.
*   **Assertions**:
    1. FOLLOW: Dashboard switches to the item's cabinet automatically.
    2. EXPAND: The correct category/type row is open; others are collapsed.
    3. SCROLL: The list scrolls so the target batch is visible on screen.
    4. FLASH: The quantity badge glows green and then the number decrements (N → N-1) while the glow is still active.
    5. LAST UNIT: Repeat until 1 unit remains. On next use, the Delete Confirmation modal appears instead.

## Fifty-Sixth Iteration Feedback
1. **Active Filter Pill Row**: Added a compact, always-visible filter status bar that appears directly below the search/command strip whenever one or more filters are active. The row is completely invisible when no filters are set, ensuring zero clutter during normal use.
    *   **Cabinet Pills (Blue)**: Display the name of the active cabinet (e.g. `🏠 PANTRY`) with a dedicated `×` dismiss button.
    *   **Expiry Pills (Urgency-Coloured)**: Display the active urgency mode using the established colour system: `EXPIRED` (red), `THIS MONTH` (orange), `DUE < 3M` (yellow).
    *   **Independent Dismissal**: Each pill clears only its own filter, leaving the other active. Users can cancel a cabinet filter without losing their expiry filter and vice versa.
2. **Front Line Filter Independence (Bug Fix)**: Resolved an issue where The Front Line (starred items belt) would disappear when a Cabinet or Expiry filter was active.
    *   **Root Cause**: Favourites were sourced from the same filtered dataset as the main inventory, so starred items outside the active cabinet's scope lost their stock and were hidden.
    *   **Fix**: Added a separate unfiltered SQL query exclusively for The Front Line. Starred item types with any stock anywhere in the system are now always visible, regardless of what filters are active on the main Dashboard.

---
#### 📡 STRATEGIC VERIFICATION (ITERATION 56)
**[TC-56.1] VERIFICATION: Active Filter Pills**
*   **Conditions**: At least two Cabinets exist; some items with expiry data exist.
*   **Actions**:
    1. Apply a Cabinet filter (e.g., **Pantry**).
    2. Also apply an Expiry filter (e.g., **DUE < 3M**).
    3. Dismiss only the Cabinet pill using its `×` button.
    4. Dismiss the remaining Expiry pill using its `×` button.
*   **Assertions**:
    1. DUAL PILLS (Step 2): Both a blue `PANTRY` pill and a yellow `DUE < 3M` pill are visible below the search bar.
    2. SELECTIVE CLEAR (Step 3): Cabinet filter clears; the `DUE < 3M` pill remains active.
    3. ZERO STATE (Step 4): The pill row disappears entirely, leaving a clean interface.

**[TC-56.2] VERIFICATION: Front Line Filter Independence**
*   **Conditions**: At least one starred item exists. Multiple Cabinets exist.
*   **Actions**:
    1. Confirm The Front Line is visible with its starred items.
    2. Apply a Cabinet filter that **does not** contain any of the starred items.
*   **Assertions**:
    1. The Front Line remains fully visible regardless of the active Cabinet filter.
    2. Tapping a Front Line item still correctly finds the soonest-expiring batch across **all** locations.

## Fifty-Fifth Iteration Feedback
1. **Cabinet Transfer "Follow-the-Action" (Mobile Fix)**: Resolved a regression where the Dashboard would not switch cabinet filters after an item was moved to a new storage site on mobile.
    *   **Root Cause**: The Edit/Pencil button was navigating to the edit screen *without* passing the current dashboard filter context, so the edit screen had no basis to detect a location change.
    *   **Context Propagation**: The Dashboard's Edit action now explicitly passes `inheritedCabinetId` (the current filter) to the edit screen, giving it the intelligence to compare origin vs. destination.
    *   **Timestamp Cache-Busting**: Added a unique `timestamp` to every navigation signal so that sequential moves to the same cabinet are each treated as fresh events, preventing the Dashboard's `useEffect` from skipping the filter switch.
    *   **Explicit Nil Guards**: Replaced truthy checks (`if (params.setCabinetId)`) with strict `!== undefined` guards so that valid cabinet IDs of `0` are not accidentally treated as "no filter."

---
#### 📡 STRATEGIC VERIFICATION (ITERATION 55)
**[TC-55.1] VERIFICATION: Cabinet Transfer "Follow-the-Action"**
*   **Conditions**: Two Cabinets exist (e.g., "Pantry" and "Garage"). At least one batch in "Pantry".
*   **Actions**:
    1. FILTER: Set Dashboard filter to **Pantry**.
    2. Tap the **Pencil (Edit)** icon on any batch.
    3. In the Edit form, change the Storage Site to **Garage**.
    4. Tap **"Save to Stock"**.
*   **Assertions**:
    1. On return, Dashboard filter automatically shifts to **Garage**.
    2. A tactical banner confirms: **"SWITCHED TO GARAGE"**.
    3. The relevant Category is expanded and the moved item is visible.

## Fifty-Fourth Iteration Feedback
1. **Dual-Packet Tactical Backup**: Implemented a resilient cross-platform backup system that generates two distinct artifacts: a **JSON Restore Ledger** (for 100% accurate system recovery) and a **Universal Inventory CSV** (for human-readable spreadsheet audits in Excel or Google Sheets).
2. **Rolling Hourly Archive**: Added a "Black Box" backup regime that performs an automated check every hour. A new snapshot is only captured if the database state has changed since the last check, ensuring no wasted storage.
3. **Snapshot Rotation (The Rolling Five)**: To manage local storage footprint, the system maintains a rolling stack of the last 5 snapshots. Manual backups are integrated into this same sliding window, ensuring the most recent state is always preserved.
4. **Platform-Agnostic Recovery**: Designed the restore engine to be entirely file-driven. Users can "Import" any valid JSON backup file via the platform's native file picker, performing a total "Database Refresh" that wipes current records and re-normalizes the backup data into the live tables.
5. **Tactical Transparency (Settings)**: Added a new "Backups" submenu in Settings that allows users to toggle the Auto-Backup heart-beat, view the status of the 5 rolling slots, and trigger immediate off-device exports using the native Share sheet.

---
#### 📡 STRATEGIC VERIFICATION (ITERATION 53)
**[TC-53.1] VERIFICATION: Automated Check & Rotation**
*   **Conditions**: Clean database; Auto-Backup enabled.
*   **Actions**:
    1. Add a single batch to any item.
    2. SIMULATE: Trigger the hourly background check.
    3. STRESS: Perform 5 distinct edits (e.g., adding/deducting quantity) over 5 simulated hourly intervals.
*   **Assertions**:
    1. INITIAL: A new backup file (`war-cabinet-1.json`) is created after the first edit.
    2. ROTATION: After 6 edits, the storage directory contains exactly 5 files; the oldest snapshot has been purged.
    3. IDLE: Triggering the check when no changes have occurred results in zero new file creation.

**[TC-53.2] VERIFICATION: Cross-Format Integrity (JSON/CSV)**
*   **Conditions**: Database contains at least 3 categories, 2 cabinets, and 5 batches.
*   **Actions**: 
    1. Trigger "Manual Tactical Export" from Settings.
    2. EXCEL AUDIT: Open the exported `.csv` in a spreadsheet viewer.
    3. SYSTEM RESTORE: Perform a "Factory Reset" in Settings, then "Import" the generated `.json` backup.
*   **Assertions**:
    1. CSV READABILITY: The CSV correctly "flattens" the data (e.g. `Category | Item | Cabinet | Qty`) into a single legible sheet.
    2. DATA INTEGRITY: After Restore, every Category, Item Type, and Batch (including quantities and expiry dates) is 100% identical to the pre-reset state.
    3. RELATIONSHIPS: Cabinet associations and Item Type unit-settings are perfectly preserved.

## Fifty-Second Iteration Feedback
1. **Deep Tactical Drill-Down**: Re-architected the inventory hierarchy from a two-tier expanded view into a three-tier "Drill-Down" system (Category → Item Type → Batch). This prevents dashboard overcrowding in large stockpiles.
2. **Single-Batch Exemption (Zero-Friction Access)**: To avoid unnecessary tapping, any Item Type containing only one single batch is exempt from the collapsible drawer and is displayed at full resolution by default.
3. **Aggregated Item Intelligence**: Collapsed item rows now display high-level tactical summaries (Total Quantity, Urgency Status Dot, and Location Count) to allow for rapid situational awareness without drilling down.
4. **Category Command Toggles**: Added "Expand All" and "Collapse All" tactical triggers within each Category header, permitting instant transitions between high-level auditing and deep-dive inspections.
5. **Post-Save Laser Focus**: Upon returning from an edit or save, the Dashboard now isolates the specific Item Type modified, expanding its drawer while collapsing all other items in the category to maintain a tidy workspace.

## Fifty-First Iteration Feedback
1. **Context-Aware Cabinet Defaulting**: The "Add Stock" form now intelligently inherits the active Cabinet context from the Dashboard if a filter is active.
2. **Follow-the-Action UX**: To prevent "ghost item" confusion, the Dashboard filter now automatically switches to the destination Cabinet after a successful save if it differs from the current filter, ensuring the user always sees the result of their action.
3. **Targeted View Isolation**: Upon returning from an edit or addition, the Dashboard now isolates the relevant Category by automatically expanding it and collapsing all other categories to minimize visual noise.
4. **Precision Alignment (Auto-Scroll)**: The Dashboard now leverages a `scrollToId` mechanism to ensure the modified category is immediately scrolled into view, providing instant confirmation of the change.
5. **Contextual Action Feedback (Tactical Banners)**: Added a temporary high-visibility status banner that confirms the cabinet switch (e.g., *"SWITCHED TO [CABINET NAME]"*) to eliminate any ambiguity when the filter context changes.
6. **Action-Pillar Preservation**: Refined the "Ghosting" desaturation logic. While empty categories still recede visually when collapsed, the **"+ ADD"** buttons and primary action paths now always maintain 100% opacity, ensuring they never appear disabled or non-clickable.

---
#### 📡 STRATEGIC VERIFICATION (ITERATION 52)
**[TC-52.1] VERIFICATION: Deep Tactical Drill-Down & Smart Hierarchy**
*   **Conditions**: Clean database; Category "Supplies" exists; Locations "Pantry" and "Garage" exist.
*   **Setup**: 
    1. Add "Rice" (Batch 1: 500g, Pantry).
    2. Add "Pasta" (Batch 1: 500g, Pantry).
    3. Add "Pasta" (Batch 2: 750g, Garage).
*   **Actions**:
    1. OBSERVE: Navigate to Dashboard and expand "Supplies" Category.
    2. DRILL-DOWN: Tap the "Pasta" item row to expand.
    3. BULK-TOGGLE: Tap the "Collapse All" icon in the "Supplies" header.
    4. LASER-FOCUS: Tap "+ ADD" for Rice, add a second matching batch to Garage, and Save.
*   **Assertions**:
    1. EXEMPTION (Step 1): "Rice" (1 batch) is displayed fully expanded by default.
    2. DRILL-DOWN (Step 1): "Pasta" (2 batches) is collapsed by default, showing only its summary.
    3. BULK-TOGGLE (Step 3): All items in the category become collapsed.
    4. LASER-FOCUS (Step 4): On return, the "Supplies" category is open AND the "Rice" item is automatically expanded (as it now has 2 batches), while others are closed.
*   **Clean-up**: Reset filter.

---
#### 📡 STRATEGIC VERIFICATION (ITERATION 51)
**[TC-51.1] VERIFICATION: Cabinet-Aware Context & Post-Save "Follow" Logic**
*   **Conditions**: Clean database; Locations "Pantry" and "Garage" exist.
*   **Actions**:
    1. FILTER: On Dashboard, filter view to **"Pantry"**.
    2. DEFAULTING: Tap "+ ADD" for any Rice item (Category: Carbs).
    3. CROSS-SAVE: In the Add form, change cabinet to **"Garage"** and Save.
*   **Assertions**:
    1. Step 2: The "Storage Cabinet" field in the Add form defaults to **"Pantry"** (inherited from filter).
    2. Step 3: Upon return, the Dashboard filter has automatically shifted to **"Garage"**.
    3. ISOLATION: On return, the **"Carbs"** category is expanded, and all other categories are collapsed.
    4. ALIGNMENT: The UI performs an automated scroll-to-view for the "Carbs" category.
    5. FEEDBACK: A tactical banner appears at the bottom confirming: **"SWITCHED TO GARAGE"**.
*   **Clean-up**: 
    1. Reset filter to "All Sites".

## Fiftieth Iteration Feedback
1. **Recursive Urgency Sorting**: To achieve absolute situational priority, the sorting logic was synchronized across all three levels of the inventory hierarchy (Category -> Item Type -> Batch).
    *   **Tiered Float Logic**: Item Types (e.g., "Pasta") now leapfrog their peers if they contain an expiring batch.
    *   **Tie-Break Standards**: Ties in expiry are broken alphabetically. Empty categories or types are demoted to the bottom of their respective containers.
    *   **Waterfall Flow**: The dashboard now provides a "Zero-Searching" experience—the single most urgent physical unit in the entire stockpile is guaranteed to be at the top-left of the first expanded category.

## Forty-Ninth Iteration Feedback
1. **High-Contrast Tactical Phrasing**: To ensure "Zero-Confusion" during Stock Rotation, the application's expiry vocabulary has been standardized across all views (Dashboard Rows and Category Summaries).
    *   **Alert-First Highlighting**: High-contrast colors and bolding are now strictly reserved for the most critical tiers: `EXPIRED ITEMS`, `THIS MONTH`, and `1 MONTH`. 
    *   **Visual Recedence**: Any item with > 1 month of shelf life now defaults to a neutral grey, ensuring the user's focus is never pulled away from imminent rotation needs.
    *   **Unified Labels**: Phrasing has been standardized as `NEXT EXPIRING: [STATUS]` for category headers.

## Forty-Fifth Iteration Feedback
1. **Strategic Navigation (Deep Linking)**: Tapping a 'War Cabinet Briefing' notification was only applying the filter if the user was already on the Dashboard.
    *   **Global Over-Ride**: The notification listener has been upgraded to force-navigate the user back to the primary Dashboard (`/`) from any administrative page (like Catalog or Add Stock).
    *   **Filter Reset**: Tapping the alert now explicitly clears all 'Cabinet' or 'Site' filters, resulting in a clean "All-Storage" audit focused entirely on the urgently expiring items.
    *   **Unified State**: The dashboard now synchronizes its UI status directly with the deep-link parameters for a zero-friction action loop.

## Forty-Sixth Iteration Feedback
1. **Precision Quantity Reporting (Briefings)**: The tactical briefings were inadvertently counting 'Inventory Rows' (batches) instead of the absolute 'Total Quantity' of stock items.
    *   **Quantity-First Auditing**: The notification engine has been refactored to sum the `quantity` of every expiring batch.
    *   **Smart Multiples Display**: The 'Brackets' (e.g., "Rice (12)") now accurately reflect the total number of physical units. The system remains silent for single items, ensuring high-resolution clarity on lock screens.
    *   **Tier Totals**: The leading count for each tier (e.g., "15 EXPIRED") now reflects the aggregate sum of all affected units across all item types in that category.

## Forty-Seventh Iteration Feedback
1. **Strategic Selection (Instant Global Search)**: Navigating deep categories was identified as a tactical bottleneck for large stockpiles.
    *   **Keywords Filter**: Added a high-speed search bar ("FIND STOCK...") to the primary Dashboard.
    *   **Universal Selection**: Matching now spans Item Names, Categories, and Storage Sites (Cabinets), allowing one-word "Instant-View" capability (e.g., typing "Pantry" shows everything in that location).
    *   **Seamless Hierarchy Integration**: The categorized layout remains intact, but automatically "thins out" to show only matching combat-ready goods.

## Forty-Eighth Iteration Feedback
1. **The "Front Line" (Priority Staples)**: Mobile users spend too much time navigating hierarchies for daily items (Bread, Milk, Wine).
    *   **Zero-Friction Access**: Added a horizontal "Front Line" belt at the top of the Dashboard for "Starred" items.
    *   **Frequency Intelligence**: Items are now tracked via `interaction_count`, ensuring your most used staples naturally float to the premier leftmost position.
    *   **FEFO-Safe Confirmation**: Tapping a "Front Line" item triggers a Smart-Selection engine that finds the **soonest-expiring batch** and prompts for confirmation with location awareness before deduction.
    *   **Administrative Star**: Added "Star" controls to the Catalog for long-term provisioning of staples.

## First Iteration Feedback
1. **Edit/Remove functionality for inventory:** The ability to deduct or completely remove stock was omitted. The user must be able to decrement items as they consume them, removing them entirely when 0.
2. **Smart Size Selection:** The "Quick Chips" design for selecting item sizes (and remembering custom sizes entered for an item) wasn't implemented into the Add Item form.
3. **Cancel option on forms:** The Add Item form was shipped without a mechanism to cancel out and navigate back to the main list.
4. **Catalog Management (Categorization & Item Types):** The overarching functionality to edit the standard "enumerated types" (add/remote categories and stock types) was missing. Users must be able to configure what types of items the app supports.

---
#### 📡 STRATEGIC VERIFICATION (ITERATION 1)

*(Note: When translating these manual protocols into automated test suites, the **Setup** and **Clean-up** paths represent the `beforeEach()` and `afterEach()` teardown fixtures, ensuring a perfectly isolated zero-state database architecture for every run.)*

**[TC-1.1a] VERIFICATION: New Batch Creation & 4-Way Combination Accuracy (Time-Independent)**
*   **Conditions**: Clean, empty database state (Zero-Trust/No Seeds).
*   **Setup**: 
    1. Create Locations: "Pantry" and "Garage".
    2. Create Category "Carbs" -> Item Type "Rice".
    3. Add one baseline "Rice" batch (Size: "500g", Expiry: "Now + 2 Months", Quantity: 1, Location: "Pantry").
*   **Actions**: 
    1. CANCELLED NEW BATCH: Open "Add Stock" for Rice, configure size/expiry, but tap **CANCEL**.
    2. SIZE DISTINCTION: Add a second "Rice" batch with a different size (Size: "750g", Location: "Pantry", Expiry: "Now + 2 Months", Qty: 1).
    3. LOCATION DISTINCTION: Add a third "Rice" batch with a different location (Size: "500g", Location: "Garage", Expiry: "Now + 2 Months", Qty: 2).
    4. EXPIRY DISTINCTION: Add a fourth "Rice" batch with a different relative expiry (Size: "500g", Location: "Pantry", Expiry: "Now + 8 Months", Qty: 3).
*   **Assertions**:
    1. CANCELLED NEW BATCH (Step 1): Dashboard remains unchanged with only 1 baseline row.
    2. COMPOSITE ACCURACY: Every step results in a separate, distinct row on the dashboard.
    3. 4-WAY VERIFICATION: Each of the 4 rows accurately reflects its unique combination of **Size + Location + Expiry Phrasing + Quantity**.
    4. RELATIVE DATES: Expiry labels correctly display "expires 2 MONTHS" and "expires 8 MONTHS" based on current system time.
*   **Clean-up**: 
    1. Delete the "Carbs" Category (cascading purge).
    2. Delete the "Pantry" and "Garage" Locations.


**[TC-1.1b] VERIFICATION: Stock Decrement Behaviour & Batch Deletion**
*   **Conditions**: Clean, empty database state.
*   **Setup**: 
    1. Create Location: "Pantry".
    2. Create Category "Carbs" -> Item Type "Rice".
    3. Add one baseline "Rice" batch (Quantity: 2) to the "Pantry".
*   **Actions**: 
    1. On the Dashboard, tap the - (minus) button on the "Rice" row.
    2. Tap the - (minus) button a second time.
    3. Tap "CANCEL ACTION" on the resulting pop-up modal.
    4. Tap the - (minus) button for a third time.
    5. Tap "CONFIRM DELETE" on the modal.
*   **Assertions**:
    1. First minus tap (Step 1) safely reduces the quantity back down to 1; row remains visible.
    2. Second minus tap (Step 2) correctly triggers the deletion prevention modal.
    3. Tapping "CANCEL ACTION" (Step 3) securely dismisses the modal, leaving the row quantity intact at 1.
    4. Confirming the deletion (Step 5) successfully drops the record and removes the item batch from the UI.
*   **Clean-up**: 
    1. Delete the "Carbs" Category to purge the remaining item records.
    2. Delete the "Pantry" Location to completely wipe the test footprint.


**[TC-1.2] VERIFICATION: Smart Size Chips: Persistence, Rotation, and Memory Removal Behaviour**
*   **Conditions**: Clean, empty database state.
*   **Setup**: 
    1. Create Location: "Pantry".
    2. Create Category "Spices" -> Item Type "Salt".
*   **Actions**:
    1. Add one custom-sized batch each for: 776g, 777g, 778g
    2. Add a 4th custom-sized batch: 779g.
    3. Re-open "Add Stock" and inspect the smart chip row.
    4. Delete batches for 776g, 777g, 778g (reduce quantity to 0).
    5. Re-open "Add Stock" and inspect the smart chip row again.
*   **Assertions**:
    1. After step 3: 
      - First 3 smart chips are 779g, 778g, 777g (in that order).
      - 776g is no longer present (forgotten due to memory limit of 3 custom chips).
      - All 5 static default chips are present.
      - Total chip count = 8 (5 default + 3 custom).
    2. After step 5
      - Smart-chips for 776g, 777g, 778g are not present.
      - 779g smart chip remains present.
      - All 5 static default chips are present.
      - Total chip count = 6 (5 default + 1 custom).
*   **Clean-up**: 
    1. Delete the "Spices" Category. This purges all Salt batch rows and perfectly resets the Smart Size memory limits in the database.
    2. Delete the "Pantry" Location to fully wipe the footprint.


**[TC-1.3] VERIFICATION: Catalog–Inventory Synchronization: Item Visibility and Category Deletion Behaviour**
*   **Conditions**: Clean, empty database state.
*   **Setup**: 
    1. Create Category "Snacks" (Category is empty).
*   **Actions**:
    1. Open the "Snacks" category on the main screen.
    2. Navigate to the Catalog screen.
    3. Add a new Item "Military Ration" to "Snacks"
    4. Return to the main screen and open "Snacks" again.
    5. Navigate back to the Catalog and locate "Snacks".
    6. Delete "Military Ration" using the bin icon.
    7. Return to the main screen and open "Snacks" again.
    8. Navigate back to the Catalog and delete the "Snacks" category.
    9. Return to the main screen and look for the Snacks category.

*   **Assertions**:
    After step 1: "Snacks" category contains no items.
    After step 4: "Military Ration" appears in "Snacks" (no stock required).
    After step 5: "Snacks" category delete option is disabled (category contains an item).
    After step 6: "Snacks" category delete option becomes enabled (category is now empty).
    After step 7: The "Snacks" category contains no items.
    After step 9: The "Snacks" category is no longer visible on the main screen.
*   **Clean-up**: 
    1. Confirm "Snacks" is fully deleted (Step 8 inherently cleans this test up).
    2. System is natively returned to empty zero-state.


## Second Iteration Feedback
1. **Category Management Limits:** It was impossible to delete newly added Categories. Furthermore, Categories could not be renamed (to preserve historic item links under them without losing relationships).
2. **Inventory Adjustments (Plus and Minus):** The `-` deduction button was unclear and seemingly stalled at 1 (due to Web Preview `Alert` blocking), making it hard to delete the final item. Furthermore, a `+` button was missing directly on the dashboard row to quickly restock an exact item batch without navigating away.
3. **Date Selectors:** The input for Expiry Month and Year was manual text entry instead of rotating selectors (spinners) defaulted to the current month and year.

---
#### 📡 STRATEGIC VERIFICATION (ITERATION 2)
**[TC-2.1] VERIFICATION: Category Purge & Dashboard Plus**
*   **Conditions**: Empty "Snacks" category exists; one item "Rice" exists in "Carbs."
*   **Actions**:
    1. In **Catalog**, delete the "Snacks" category.
    2. Tap the `+` increment button on the "Rice" row on the Dashboard.
    3. Open "Add Stock" and inspect the Date Selector defaults.
*   **Assertions**:
    1. "Snacks" is removed from the list.
    2. "Rice" quantity increases by exactly 1 unit without navigating away.
    3. Expiry selectors default to the current `MM/YYYY`.
*   **Clean-up**: Deduct the extra "Rice" unit via the `-` button.

## Third Iteration Feedback
1. **Item Type Editing:** While categories were made editable in the second iteration, the actual items (Item Types) under those categories were not. The user could not fix typos or rename generic "Item Types" once they had been created.

---
#### 📡 STRATEGIC VERIFICATION (ITERATION 3)
**[TC-3.1] VERIFICATION: Item Type Rename Propagation**
*   **Conditions**: Item Type "Tuna" exists under "Canned Goods."
*   **Actions**: Navigate to **Settings > Catalog**, edit "Tuna," rename it to "Safe-Catch Tuna."
*   **Assertions**:
    1. The name "Safe-Catch Tuna" is reflected on every "Tuna" inventory batch on the Dashboard.
    2. Catalog list now displays "Safe-Catch Tuna" alphabetically.
*   **Clean-up**: Rename back to "Tuna" to restore baseline.

## Fourth Iteration Feedback
1. **Inventory Visualization:** The layout of the stock items inside the main list wasn't scannable enough. The layout has been redesigned into rigid columnar blocks on a single line showing `STATUS - QUANTITY - SIZE - ENTRY DATE - EXPIRY DATE` alongside adjustment buttons to make scanning quick and methodical.

## Fifth Iteration Feedback
1. **Unit Type Classification**: The Quick Chips system blindly mixes liquid (`ml/L`) and solid (`g/kg`) suggestions for every item. It was identified that `Item Types` should be explicitly assigned a "Unit Category" (Weight, Volume, or Count) when they are created in the Catalog. This would allow the Add Stock form to exclusively offer context-appropriate chips (e.g. only rendering `500ml` for Olive Oil, and `500g` for Pasta).
2. **Smart Chip Clutter Limiting**: Continually appending new custom sizes to the chips list causes horizontal clutter. Future implementations should limit custom generated chips to the *most recent N sizes* (e.g., the last 3 unique sizes entered) alongside the base static defaults (`50`, `100`, `150`, `200`, `250`, `500`, `1kg/L`).

## Sixth Iteration Feedback
1. **Editing Item Unit Types**: The inline edit tool within the Catalog Settings was limited to only renaming Item Types. The interface needed extending to allow the user to also modify an item's underlying Unit Type (Weight/Volume/Count) if it was categorized incorrectly initially.

## Seventh Iteration Feedback
1. **Duplicate Batch Accumulation (Upsert logic)**: The Add Stock form lacked logic to detect if the user was entering the exact same item, size, and expiry date. Instead of aggregating them into a single stack, it spawned duplicate rows. The saving logic has been refactored to check for an identical matching batch—incrementing its quantity and refreshing its entry date instead of polluting the dashboard with duplicates.

---
#### 📡 STRATEGIC VERIFICATION (ITERATION 7)
**[TC-7.1] VERIFICATION: Duplicate Batch Aggregation (Upsert Logic)**
*   **Conditions**: One "Pasta" batch exists with a quantity of 1, Size "500g", Expiry "05/2026", located in "Pantry".
*   **Actions**:
    1. Open the "Add Stock" form for "Pasta".
    2. Enter a structurally identical match: Size "500g", Expiry "05/2026", Location "Pantry".
    3. Tap "Save to Stock".
*   **Assertions**:
    1. The system does *not* create a second standalone batch row for "Pasta".
    2. The original batch correctly absorbs the new entry, instantly increasing the dashboard quantity pill to 2.
    3. The Entry Date of the successfully merged batch updates to the current month/year.
*   **Clean-up**: Tap `-` once on the aggregate row to return the quantity to 1.

## Eighth Iteration Feedback
1. **Background Suspend State Loss**: The mobile app froze or crashed its action buttons (Add, Minus, Delete, etc.) if the phone went to sleep or the app was backgrounded. This was diagnosed as the OS destroying the ad-hoc SQLite connection. The application's architecture was refactored. The entire render tree is now wrapped in Expo's specialized `<SQLiteProvider>`, maintaining and cleanly reopening database connections automatically whenever the OS suspends and wakes the app lifecycle.

## Ninth Iteration Feedback
1. **Volatile Inventory Sorting (Leapfrogging)**: Adjusting the quantity of an item caused rows of identical goods to arbitrarily swap physical places on the dashboard. This occurred because the SQLite query lacked explicit sorting logic for underlying inventory rows, causing it to fall back to volatile row-update ordering. The `ORDER BY` clause was drastically enhanced to prioritize `Expiry Date` (pushing unspecified dates to the absolute rear) and natively parsing strings to sort by `Size Ascending` (e.g., locking a 50ml bottle firmly above a 100ml bottle).

## Tenth Iteration Feedback
1. **Intelligent Size Pre-filling**: Entering repetitive items still required the user to manually click a size chip every time. The Add Stock architecture was modified to natively auto-populate the designated `size` field immediately upon opening the page by referencing the most recent historically utilized size for that specific item category. The user can now skip size entry entirely for their routine goods!

## Eleventh Iteration Feedback
1. **Explicit Default Size Configuration**: While historical size inference solved most UX friction, brand new items (or heavily irregular items) remained tedious. The database schema and Catalog UI were upgraded to permit users to explicitly dictate a fixed `Default Size` (e.g., locking an item permanently to '750ml' regardless of what the latest entry history says). The Add Stock logic now firmly prioritizes this explicit setting, only falling back to historical inference if the baseline string is blank.

## Twelfth Iteration Feedback
1. **Numeric Standardization of Default Sizes**: Allowing users to input freestyle strings for Default Sizes drastically increased the likelihood of data-entry typo clutter. The Catalog Settings interface for "Default Size" was refactored into a strictly Numeric input panel. Based dynamically on the Item's Unit-Type classification (Weight vs Volume vs Count), the codebase cleanly scrubs stray non-numeric characters and mathematically auto-appends `g`, `ml`, or `Unit` prior to database storage. This locks the application's vocabulary natively into Grams and Milliliters as a baseline.

## Thirteenth Iteration Feedback
1. **Agnostic Stock Terminology**: The primary database injection button was labeled "Save to Cellar." To ensure the tool remains broadly applicable for generic pantry, armory, or bulk storage environments, this label was simplified to the universally agnostic phrase "Save to Stock."

## Fourteenth Iteration Feedback
1. **Category Expiry Rippling**: To allow for high-level technical oversight, the application now "ripples up" the expiry status of individual batches to the Category Header. When a category is collapsed, a status dot and date reference (MM/YYYY) appear on the header showing the single soonest-expiring batch within that category. This allows for rapid identification of which categories require immediate attention.
2. **Stock Refresh (Edit Mode)**: A new "Pencil" icon was added to individual batch rows for rapid date/quantity updates.

## Fifteenth Iteration Feedback
1. **Formalized Expiry Thresholds**: The color-coded status logic has been standardized across the entire application (both at the Category Ripple level and the individual Item Row level) to ensure absolute consistency. The following thresholds are now strictly enforced:
    *   🔴 **Red** (`#b91c1c`): **Expired or Imminent** (Expires within the current calendar month).
    *   🟠 **Orange** (`#f97316`): **Near Term** (Expires within 1–3 months).
    *   🟡 **Yellow** (`#fde047`) : **Mid Term** (Expires within 4–6 months).
    *   🟢 **Green** (`#22c55e`): **Safe** (Expires in more than 6 months).
    *   ⚪ **Grey** (`#94a3b8`): **No Expiry** (No date data available).
    This logic ensures a high-contrast birds-eye view for stock rotation management.

## Thirty-Eighth Iteration Feedback
1. **Automated Batch Merging (Cabinet-Aware)**: To ensure a high-precision inventory without clutter, the system now intelligently merges identical stock records.
    *   **The Merging Standard**: When a stock batch is saved or **Transferred**, the system automatically audits the destination cabinet. If an item of the same Type, Size, and Expiry already exists there, the batches are consolidated into a single record.
    *   **Unified Auditing**: This mechanism ensures that moving stock physically (e.g., from Cellar to Kitchen) also collapses those records digitally, maintaining a 1-to-1 relationship between the app and the shelf.
    *   **Entry Date Reset**: Merged batches reflect the most recent "Stock Move" as their Entry Date, ensuring you know exactly when that location was last restocked.

## Thirty-Seventh Iteration Feedback
1. **Multi-Cabinet Distributed Inventory**: The system has transitioned from a single-site list to a full Multi-Cabinet architecture.
    *   **Cabinet Management**: A new "Cabinets" tab in the Strategic Settings allows for creating, editing, and deleting storage sites (e.g., Kitchen, Cellar, Shed) with associated physical locations.
    *   **Strategic Filtering**: The dashboard now features a Cabinet Filter bar. Users can toggle between "ALL STORAGE" and specific sites. Categories containing NO items at the selected site are automatically ghosted and demoted, maintaining consistent focus.
    *   **Batch Localization**: Every stock card now displays its specific cabinet and physical location in a blue high-contrast label.
    *   **Default Placement**: Item Types can now have a "Default Cabinet" assigned in settings, which will be automatically selected when adding new stock for that type.
    *   **Transfer Ease**: By editing any stock item, users can instantly "Transfer" it to a different cabinet, reflecting moves from deep storage to active use areas.
    *   **Strategic Roadmapping**: Created `specifications/future_ideas.md` to park high-tech concepts like NFC deep-linking for future R&D cycles.

## Thirty-Sixth Iteration Feedback
1. **Human-Readable Expiry Phrasing**: To maximize the "Zero-Math" speed of the dashboard, the numeric MM/YYYY expiry dates were replaced with high-resolution relative durations.
    *   **Contextual Phrasing**:
        *   `expires in X MONTHS`: For future items (no longer capped at 24 months).
        *   `expires THIS MONTH`: For current month rotation.
        *   `expired X MONTH ago`: For overdue inventory (counting backwards).
    *   **Dual-Tonality Styling**: Only the critical capitalized status (e.g., `3 MONTHS`, `THIS MONTH`) is highlighted in the urgency color (Red/Orange/Yellow/Green) and bolded. The surrounding phrasing remains at a neutral secondary grey.
    *   **Clean Visuals**: Anchoring "ENTRY" on the left and "EXPIRES" on the right ensures the sub-row remains stable and legible.

## Thirty-Fifth Iteration Feedback
1. **High-Resolution Expiry Countdowns**: To eliminate mental math during Stock Rotation, the dashboard now explicitly calculates and displays the time remaining for every batch.
    *   **Urgency Markers**: Expiry dates are now suffixed with relative countdowns in parentheses.
        *   **(EXP)**: Already expired or critically imminent.
        *   **(DUE)**: Expiring within the current calendar month.
        *   **(XM)**: High-resolution month countdown (e.g., `3M`, `14M`) up to 24 months.
    *   **Visual Balance**: These labels are right-justified on the batch cards, maintaining the same color and size as the Expiry date for a cohesive, balanced design.
    *   **Entry/Expiry Anchoring**: The sub-row layout was stabilized to anchor "ENTRY" on the left and "EXPIRY" on the far right, maximizing legibility on mobile screens.

## Thirty-Fourth Iteration Feedback
1. **Standardized Date Formatting (MM/YYYY)**: To maintain a professional and consistent visual rhythm across the app, all date displays (Entry and Expiry) have been reformatted.
    *   **Padded Months**: Months are now strictly enforced as 2-digit numbers with leading zeros (e.g. `03/2026` instead of `3/2026`).
    *   **Universal Application**: This standard applies to Category "Soonest" summaries, Batch Entry dates, and Expiry labels on both the Dashboard and Stock entry forms.

## Thirty-Third Iteration Feedback
1. **Protective Category Management**: To prevent accidental data loss and provide intuitive system feedback, the Catalog management screen now features predictive UI for deletions.
    *   **Visual Guardrails**: "Delete" icons are now automatically greyed out (`#334155`) and disabled if the grouping contains data. 
    *   **Contextual Restrictions**: Categories cannot be deleted if they contain Item Types, and Item Types cannot be deleted if they have active stock in the Inventory. 
    *   **Zero-Failure Flow**: This ensures the user is aware of dependencies before they attempt an action, removing the need for error alerts and promoting a cleaner, more robust configuration workflow.

## Thirty-Second Iteration Feedback
1. **Setting Cog Realignment**: For better visual balance and accessibility, the "Settings" cog was moved from the header flow to a pinned position on the right side of the screen.
    *   **Absolute Locking**: By using `position: 'absolute'`, the icon no longer interferes with the central alignment of the Title and Caricature group, maintaining a symmetrical and professional header layout.

## Thirty-First Iteration Feedback
1. **Status Dot Stabilization**: To ensure a rock-solid UI during navigation, the Category Status Dot has been "pinned" to the top baseline of the Category Name.
    *   **Unified Alignment**: By switching to `alignItems: 'flex-start'`, the dot no longer "jumps" vertically when the category's summary statistics sub-row appears or disappears.
    *   **Consistent Positioning**: Regardless of whether a category is expanded or collapsed, the status indicator now remains perfectly horizontally aligned with the primary text label.

## Thirtieth Iteration Feedback
1. **Empty Category "Ghosting" Effect**: To make it instantly obvious which shelves are empty vs. stocked but undated, a desaturation layer was added to unstocked categories.
    *   **Visual Recedence**: Categories with `Total Stock = 0` are now rendered at **50% opacity** when closed. This "Ghosting" effect allows the active inventory to visually dominate the screen.
    *   **Action Isolation**: Actionable elements (like the "+ ADD" button) are exempt from this effect, remaining at 100% opacity to ensure the UI feels alive and functional.
    *   **Dot Differentiation**: The Status Dot for empty categories is desaturated to `#334155`, distinguishing it from the solid Grey dot of "Stocked but Undated" items.
    *   **Active Focus**: Only categories with stock remain at 100% opacity, ensuring the user's attention is never wasted on empty containers.

## Twenty-Ninth Iteration Feedback
1. **Stock Presence Tiered Sorting**: To maximize dashboard utility, the top-level Category sorting now follows a strict Tiered Hierarchy:
    *   **Tier 1 (Stock Priority)**: Categories with at least one item (stock > 0) are anchored at the top.
    *   **Tier 2 (Expiry Urgency)**: Within the "Stocked" group, items are sorted by their most imminent batch.
    *   **Tier 3 (Alphabetical)**: Ties in expiry are broken alphabetically.
    *   **Tier 4 (The Depleted)**: Categories with zero items are automatically demoted to the bottom of the list, ensuring the user's primary focus stays on what is actually in the Cabinet.

## Twenty-Eighth Iteration Feedback
1. **Intelligent Unit Scaling**: To bridge the gap between "Bulk Entry" and "Readable Oversight," the unit logic was upgraded with auto-scaling capabilities.
    *   **Human-Friendly Chips**: The `Add/Edit` chips now display user-friendly labels (1kg, 1l) but intelligently insert the scaled base values (1000) into the database to maintain consistency.
    *   **Auto-Formatting Dashboard**: The main dashboard now automatically restates large quantities for better legibility (e.g., `1234g` is displayed as `1.234kg`, and `1000ml` as `1l`). This ensures the inventory overview remains clean and professional while retaining precision in the underlying database.

## Twenty-Seventh Iteration Feedback
1. **Strict Unit Enforcement**: To prevent "Unit Contamination" (like adding liters to coffee), the stock entry form now intelligently enforces numeric-only input for the `Weight` and `Volume` categories.
    *   **Automatic Suffixing**: The system now strictly enforces the unit based on the item configuration (e.g. `g` for weight, `ml` for volume, `Units` for count). Users only ever enter or tap a number; the unit is appended invisibly during the save process and reflected in all UI chips.
    *   **Data Consistency**: The "Quick Tap" chips for common sizes (50, 100, 500, etc.) have been converted to numeric-only values. This eliminates unit mixing (like `1kg` vs `1000g`) and ensures your inventory is sorted and summed correctly by a single base unit.
    *   **Self-Healing Logic**: When editing older items that still carry manual units, the form auto-strips them for clean numeric editing before re-applying the standardized suffix on save.
    *   **UI Indicators**: A new "Unit Label" appears inside the text input to confirm the expected unit to the user before they even start typing.

## Twenty-Sixth Iteration Feedback
1. **Unmarked Expiry Freedom**: To accommodate non-perishables or items without definitive date markings, a `CLEAR EXPIRY (UNMARKED)` button was added to the stock entry form.
    *   **Explicit Management**: Users can now explicitly remove local date defaults, allowing inventory to be saved as "Unmarked."
    *   **Dashboard Visuals**: These items will correctly appear with the "Grey" status dot on the dashboard, signaling a "Safety/Timeless" state in the rotation overview.

## Twenty-Fifth Iteration Feedback
1. **Intelligent Validation Markers**: To replace silent failures and generic alerts, the stock entry form now features inline validation with red field highlights (`#ef4444`). 
    *   **Contextual Error Messaging**: The system now distinguishes between a missing value ("Size is required") and an invalid format ("weight/volume requires a numeric value").
    *   **Live Cleanup**: Error highlights and messages are automatically cleared as soon as the user begins typing, ensuring a smooth, non-punitive re-entry experience.

## Twenty-Fourth Iteration Feedback
1. **Visual Hierarchy & Depth**: To create a clearer distinction between navigation (Categories) and data (Inventory Items), the batch cards were given a lighter background shade (`#334155`). This subtle contrast ensures that the "actionable" stock records pop out from the deeper, structural category containers, making the UI feel more multi-layered and intuitive.

## Twenty-Third Iteration Feedback
1. **Form Contextual Clarity**: To ensure the user always knows which specific item type they are managing, the `Add Stock` / `Refresh Stock` form now displays the Item Name (e.g. "Pasta") as a primary, uneditable label in the header. This prevents data entry errors by providing persistent context throughout the flow.

## Twenty-Second Iteration Feedback
1. **Global Header Standardisation**: For absolute visual consistency, the Category Header UI was refashioned to mirror the new stacked layout of the item rows.
    *   **Sub-Row Consolidation**: The "Items Stocked" and "Total Count" statistics were moved to a clean secondary line with divider pipes (`|`). 
    *   **Unified Expiry Display**: The "Soonest" expiry date was moved out of the header margin and into this sub-row, using the same "Status Color" coding as the item level. This creates a cohesive "Data Language" across the entire dashboard.

## Twenty-First Iteration Feedback
1. **Mobile-Safe Data Stacking**: To resolve horizontal overcrowding and text overlapping on portrait mobile displays, the inventory batch rows were re-architected from a 5-column table into a two-line "Adaptive Card" layout.
    *   **Primary Line**: Displays the quantity (as a badge) and the item size, with action buttons anchored to the right. 
    *   **Secondary Line**: Stacks the Entry and Expiry dates on an independent row with reduced typography, ensuring ample breathing room for the "Status Color" to remain legible even on narrow devices.
    *   **Header Deprecation**: The cluttered `QTY`, `ENTRY`, and `EXPIRY` table headers were removed to clean up the interface and maximize vertical real estate.

## Twentieth Iteration Feedback
1. **Thematic Header Branding (Safe Mode Implementation)**: To lean into the "War Cabinet" aesthetic, four AI-generated caricatures of high-profile global leaders (The "Big Four") were integrated into the application header. **Note:** Due to Android AAPT asset compilation constraints with certain AI image metadata, these assets are currently implemented but **commented out** in "Safe Mode" to ensure stable APK generation. They can be re-enabled once the files are manually re-saved to standardized PNG formats.

## Nineteenth Iteration Feedback
1. **Top-Level Category Urgency Prioritization**: To ensure the dashboard remains a strictly prioritized tool for stock rotation management, the top-level Category sorting logic was overhauled. The previous numerical (ID-based) ordering was replaced with a dynamic "Expiry First" sort. Categories containing the single most imminent batch in the entire system are now locked to the absolute top of the screen. If multiple categories are "Safe" (all batches > 6 months) or contain no expiry dates, the secondary sort logic falls back to a clean Alphabetical listing. This creates a predictable high-priority rotation view that never hides an expiring item below healthy stock.

## Seventeenth Iteration Feedback
1. **Collapsed Category Summary Statistics**: To prevent the dashboard from becoming an "information black hole" when items are tucked away, a summary line was added to all collapsed Category Headers. The system now performs a secondary audit during rollup to display the exact number of unique stocked items (only those with > 0 quantity) and the total aggregate count of all batches within that category. This provides instant quantitative insight without needing to expand the list.
1. **Thematic Header Branding (Safe Mode Implementation)**: To lean into the "War Cabinet" aesthetic, four AI-generated caricatures of high-profile global leaders (The "Big Four") were integrated into the application header. **Note:** Due to Android AAPT asset compilation constraints with certain AI image metadata, these assets are currently implemented but **commented out** in "Safe Mode" to ensure stable APK generation. They can be re-enabled once the files are manually re-saved to standardized PNG formats.

## Nineteenth Iteration Feedback
1. **Top-Level Category Urgency Prioritization**: To ensure the dashboard remains a strictly prioritized tool for stock rotation management, the top-level Category sorting logic was overhauled. The previous numerical (ID-based) ordering was replaced with a dynamic "Expiry First" sort. Categories containing the single most imminent batch in the entire system are now locked to the absolute top of the screen. If multiple categories are "Safe" (all batches > 6 months) or contain no expiry dates, the secondary sort logic falls back to a clean Alphabetical listing. This creates a predictable high-priority rotation view that never hides an expiring item below healthy stock.

## Seventeenth Iteration Feedback
1. **Collapsed Category Summary Statistics**: To prevent the dashboard from becoming an "information black hole" when items are tucked away, a summary line was added to all collapsed Category Headers. The system now performs a secondary audit during rollup to display the exact number of unique stocked items (only those with > 0 quantity) and the total aggregate count of all batches within that category. This provides instant quantitative insight without needing to expand the list.
