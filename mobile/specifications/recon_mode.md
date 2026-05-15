# Specification: Recon Mode (Inventory Audit)

## Objective
Establish a high-speed, swipe-based interface for verifying the physical presence of inventory against the digital ledger.

## Core Concepts
1. **The Mission (Flow):** Cabinet → Category → Swipe Session.
2. **The Card:** A tactical representation of a Product/Batch containing key metadata (Image, Name, Size, Brand, Expiry).
3. **The Swipe:**
    *   **Right (Confirmed):** Resource is present. Staleness resets, Reliability is maintained.
    *   **Left (MIA):** Resource is missing. Staleness resets, Reliability decreases.
4. **The Split:** If a batch of 6 items is partially missing (e.g., only 4 found), the user can adjust the quantity before swiping.

## Data Schema Updates
### Inventory Table
*   `last_audited_at` (INTEGER, Unix Timestamp): Records the last time this specific batch was swiped in Recon Mode.

### Cabinets Table
*   `audit_frequency_days` (INTEGER): Target interval for auditing items in this cabinet.

### AuditMetrics Table (New)
*   `id` (PRIMARY KEY)
*   `timestamp` (INTEGER)
*   `cabinet_id` (INTEGER)
*   `item_type_id` (INTEGER)
*   `found_qty` (INTEGER)
*   `missing_qty` (INTEGER)
*   `audit_session_id` (TEXT)

## UI Requirements
*   **Menu Entry:** "Recon" added to the Quartermaster tab bar.
*   **Recon Hub:** A selection screen to choose which Cabinet/Category to audit.
*   **Swipe Deck:** Tinder-style cards sorted by Product, then Expiry.
*   **Mission Control:** A progress bar at the top showing "Found", "Missing", and "% Complete".
*   **Confirmation Phase:** A summary of all "Missing" items before they are finalized in the ledger.

## Metrics
*   **Staleness:** `now() - last_audited_at`. (Derived per batch/product/cabinet).
*   **Reliability:** `found_qty / (found_qty + missing_qty)` over the last N audits.

## Implementation Plan (Phase 1: Core)
1.  **Schema Migration:** Add `last_audited_at` to `Inventory`.
2.  **DAL Update:** Add `Inventory.markAudited(db, id, isMissing)` method.
3.  **Screen Skeleton:** Create `recon.tsx` with a basic swipe deck.
4.  **Navigation:** Link Quartermaster "Recon" button to the new screen.
