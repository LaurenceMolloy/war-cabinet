# Specification: Tactical Rotation Protocol (TRP)

## 🎯 Objective
Implement a disciplined stock rotation and relocation system to ensure secondary storage zones (Cellars, Pantries, Garages) maintain fresh inventory and follow automated physical migration paths.

## 🏗️ Architecture
### Database Schema
*   **Cabinets**: 
    - `rotation_interval_months` (INTEGER, Default: NULL/Opt-in). Defines the movement cycle.
    - `cabinet_type` (TEXT, Default: 'standard'). Distinguishes between dry storage and `freezer` units.
    - `default_rotation_cabinet_id` (INTEGER). Defines the automated physical target for items during a rotation sweep (e.g., Cellar -> Utility).
*   **Inventory**: 
    - `last_rotated_at` (INTEGER, YYYYMMDD). High-precision timestamp of the last movement.
    - `entry_day` (INTEGER, 1-31). Preserves the exact day of entry for accurate 30-day calendar math.

### Sergeant-Tier Logic (Precision Math)
*   **Tactical Ceiling Math**: Urgency labels use ceiling-rounding with **half-month granularity** (`Math.ceil(m * 2) / 2`).
    - Ensures items recently moved under a multi-month policy correctly reflect their full cycle duration (e.g., a 3M policy item shows as `3 MONTHS` instead of `2 MONTHS`).
*   **Final Countdown Threshold**: When the remaining window drops to **<= 30 days**, the system switches from month-rounding to **Exact Day Counting** for high-priority awareness.
*   **Entitlement**: The Tactical Rotation hub is gated for **Sergeant** rank and above.
*   **Precision Calendar Math**: 
    - Logic uses `adjustedMonthsSince` by comparing the current day of the month against the entry/rotation day.
    - **Bug Mitigation**: Prevents "End-of-Month" false positives (e.g., rotating on April 30 and appearing due on May 1).

## 🖥️ UX / UI Design (Quartermaster Command)
### Top Gear Switch
Unified interface with a Segmented Control toggle:
*   **RESUPPLY**: High-priority shopping list based on inventory deficits.
*   **ROTATION**: Tactical audit roster for physical stock turnover.

### Zonal Command Interface
*   **Collapsible Cabinets**: Roster is grouped by storage zone with expand/collapse capability to reduce cognitive load during multi-zone audits.
*   **Aggregate Metrics**: Minimized cabinet headers display:
    *   **Item Count**: Total batches requiring rotation in that zone.
    *   **Soonest Deadline**: Highest priority deadline (e.g., "DUE TODAY" or "5D OVERDUE").
    *   **Routing Path**: Explicit visual indicator of the default destination (e.g., `MAIN CABINET -> SECOND CABINET`).

### Granular Routing (Movement Audit)
*   **The "Strategic Sweep"**: Renamed to **COMPLETE ROTATION** for professional terminology.
*   **Per-Item Relocation**: 
    - Selection initializes with the cabinet's logistical default (**AUTO**).
    - Selected items display a **"MOVE TO:"** picker for case-by-case tactical overrides.
*   **Movement Enforcement (Strategic Oversight)**: 
    - Rotation is defined as physical movement between storage zones.
    - The system blocks rotation if a batch's target is the same as its current cabinet (**"MOVEMENT REQUIRED"**).
    - An oversight check prevents "COMPLETE ROTATION" if any selected item is staying in place.
*   **Visual Hierarchy**:
    - **Single-Row Selectors**: Destination pickers occupy the same vertical footprint as urgency badges to prevent layout jumping.
    - **History**: Displayed as `Last Rotated: DD/MM/YYYY` for absolute chronological clarity.

## 🥂🫡 Sergeant Strategy
The TRP transforms the app from a simple tracker into a logistics orchestrator. By enforcing physical migration paths and providing high-precision urgency windows, we minimize the human cognitive load required to maintain a multi-zone survival stockpile.
