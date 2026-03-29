# Review Feedback

This document tracks items that were strictly specified in the `requirements.md` but were initially overlooked during the first iteration of development.

## RESTORED CAPABILITIES (Post-Rollback Recovery)
The following strategic features were lost during an unintended source code revert and were manually restored from the Agent's persistent memory:

1. **Strategic Persistence & Android Channels**: Re-implemented the 'Strategic Alerts' Notification Channel with `MAX` importance and pinned persistence.
2. **Three-Tier Tactical Briefing**: Restored categorization logic for EXPIRED, EXPIRING THIS MONTH, and DUE TO EXPIRE SOON (3M).
3. **Precision Batch Identification**: Re-enabled the 'Batch-Count Brackets' (e.g., "Pasta (3)") to ensure notification clarity.
4. **Tactical Total Aggregation**: Restored the high-visibility Weight/Volume/Count totals in the Dashboard headers with unit-safe scaling (g -> kg, ml -> l).
5. **Proactive Command Settings**: Re-integrated the ALERTS tab and the 'TEST STOCK ALERT' simulation engine into the Catalog.

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

## Second Iteration Feedback
1. **Category Management Limits:** It was impossible to delete newly added Categories. Furthermore, Categories could not be renamed (to preserve historic item links under them without losing relationships).
2. **Inventory Adjustments (Plus and Minus):** The `-` deduction button was unclear and seemingly stalled at 1 (due to Web Preview `Alert` blocking), making it hard to delete the final item. Furthermore, a `+` button was missing directly on the dashboard row to quickly restock an exact item batch without navigating away.
3. **Date Selectors:** The input for Expiry Month and Year was manual text entry instead of rotating selectors (spinners) defaulted to the current month and year.

## Third Iteration Feedback
1. **Item Type Editing:** While categories were made editable in the second iteration, the actual items (Item Types) under those categories were not. The user could not fix typos or rename generic "Item Types" once they had been created.

## Fourth Iteration Feedback
1. **Inventory Visualization:** The layout of the stock items inside the main list wasn't scannable enough. The layout has been redesigned into rigid columnar blocks on a single line showing `STATUS - QUANTITY - SIZE - ENTRY DATE - EXPIRY DATE` alongside adjustment buttons to make scanning quick and methodical.

## Fifth Iteration Feedback
1. **Unit Type Classification**: The Quick Chips system blindly mixes liquid (`ml/L`) and solid (`g/kg`) suggestions for every item. It was identified that `Item Types` should be explicitly assigned a "Unit Category" (Weight, Volume, or Count) when they are created in the Catalog. This would allow the Add Stock form to exclusively offer context-appropriate chips (e.g. only rendering `500ml` for Olive Oil, and `500g` for Pasta).
2. **Smart Chip Clutter Limiting**: Continually appending new custom sizes to the chips list causes horizontal clutter. Future implementations should limit custom generated chips to the *most recent N sizes* (e.g., the last 3 unique sizes entered) alongside the base static defaults (`50`, `100`, `150`, `200`, `250`, `500`, `1kg/L`).

## Sixth Iteration Feedback
1. **Editing Item Unit Types**: The inline edit tool within the Catalog Settings was limited to only renaming Item Types. The interface needed extending to allow the user to also modify an item's underlying Unit Type (Weight/Volume/Count) if it was categorized incorrectly initially.

## Seventh Iteration Feedback
1. **Duplicate Batch Accumulation (Upsert logic)**: The Add Stock form lacked logic to detect if the user was entering the exact same item, size, and expiry date. Instead of aggregating them into a single stack, it spawned duplicate rows. The saving logic has been refactored to check for an identical matching batch—incrementing its quantity and refreshing its entry date instead of polluting the dashboard with duplicates.

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
    *   **Visual Recedence**: Categories with `Total Stock = 0` are now rendered at **40% opacity** when closed. This "Ghosting" effect allows the active inventory to visually dominate the screen.
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
