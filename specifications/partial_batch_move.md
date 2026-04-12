# Feature Specification: Partial Batch Move

**Status**: Specified — Pending Implementation  
**Area**: Inventory Management  
**Priority**: Medium (Core Logistics)

---

## Design Philosophy: The Fridge Is Not a Storage Cabinet

The War Cabinet operates on a deliberate design principle: **the fridge is a consumption zone, not a tracked storage location.** Fridge contents are transitory by nature — access is uncontrolled, items are used casually, and keeping precise records of fridge contents is impractical for most households.

As a consequence:

- **Fridge cabinets are not used for tracking stock movements.** Items entering the fridge are considered "in use" and leave the tracked inventory.
- **Defrosting a freezer item** (moving it to the fridge for use) is represented in the app as a **Delete** (mark as consumed), not a Move.
- The **Move** feature therefore only operates between **like-for-like cabinet types**: Pantry-to-Pantry and Freezer-to-Freezer (including freezer drawers, which share the same cabinet type in the data model).

This eliminates an entire class of edge cases around expiry date inheritance across storage environments.

---

## Cabinet Type Rules: Move Is Always Same-Type

The Move feature operates strictly within the same cabinet type:

| Source | Destination | Operation |
|---|---|---|
| Pantry | Pantry | ✅ Move |
| Freezer | Freezer | ✅ Move |
| Fridge (untracked) | Freezer | ✅ **Add** — item enters the system here for the first time |
| Freezer | Fridge (to defrost) | ✅ **Delete** — item leaves the system (consumed) |
| Pantry | Freezer | ❌ Not a valid workflow |

Fresh items being frozen are **never pantry-tracked first**. They live in the fridge (outside the app), and when the user decides to freeze them, they are recorded as a **new Add** directly into the target freezer cabinet with a frozen expiry date. There is no cross-type move involved.

Cross-type moves therefore need no handling in this feature — they do not exist as a user workflow.

---

## Overview

Users need to move some or all of a stock batch from one cabinet to another without losing batch metadata (expiry date, size/unit). This is a common real-world task — e.g., rotating cellar stocks into the kitchen, or reorganising cupboards.

The current method of achieving this (Edit → Change Cabinet → Save) works for whole-batch moves but is completely unworkable for partial moves, which currently require manual quantity arithmetic across two separate screens.

---

## User Stories

- **As a user**, I want to move 2 of my 8 bags of rice from the Cellar to the Kitchen cabinet, so that the app reflects my stock after a partial rotation.
- **As a user**, I want to move an entire batch to a new cabinet after reorganising a cupboard, without losing its stored date history at the destination.
- **As a user**, I want the app to automatically handle the quantity split so I don't have to manually edit two records.

---

## Behaviour Specification

### Triggering the Move
- A **"Move"** action is available on any batch entry, alongside the existing **"Edit"** and **"Delete"** actions.
- The Move UI presents:
  1. **Quantity selector**: Numeric input defaulting to the full batch quantity. Minimum: 1. Maximum: current batch quantity. Hidden if quantity = 1.
  2. **Cabinet selector**: Lists all available cabinets of the **same type** as the source cabinet, **excluding the current one**. This makes same-cabinet moves and cross-type moves structurally impossible without requiring validation.
  3. **Confirm / Cancel** actions.

> **Note**: If only one cabinet of the correct type exists, the Move action should not be offered (or should explain there is no valid destination).

---

### Case A: Moving the Full Batch (Quantity = Total)

Treated as an **in-record update** on the existing batch row. No new record is created.

| Field | Change |
|---|---|
| `cabinet_id` | Updated to destination cabinet |
| `stored_date` | Updated to **today** (date of physical move) |
| `expiry_date` | **Unchanged** |
| `quantity` | **Unchanged** |
| `size`, `unit`, `name` | **Unchanged** |

> **Rationale**: The stored date records "when this stock arrived at this location," which is meaningful for freshness tracking. The expiry date is unchanged — the stock doesn't expire sooner or later because it moved rooms.

---

### Case B: Moving a Partial Batch (Quantity < Total)

A **split operation** producing two records.

**Step 1 — Update original record:**

| Field | Change |
|---|---|
| `quantity` | Reduced by the moved amount |
| All other fields | **Unchanged** |

**Step 2 — Create new record at destination:**

| Field | Value |
|---|---|
| `name` | Copied from source |
| `quantity` | The moved amount |
| `cabinet_id` | Destination cabinet |
| `stored_date` | **Today** (date of physical move) |
| `expiry_date` | Copied from source (**Unchanged**) |
| `size`, `unit` | Copied from source |

> **Rationale**: Two physical piles of the same stock in different locations are logistically distinct entries. Shared expiry date ensures FIFO integrity across locations.

> **Implementation note**: Steps 1 and 2 must execute as a **single atomic database transaction**. A crash between the two writes would result in stock loss.

---

## Edge Cases

| Edge Case | Behaviour |
|---|---|
| Quantity = Total | Treated as Case A (in-record update, no split) |
| Quantity = 1 | Quantity selector hidden; only full-batch move possible |
| No other cabinet of same type exists | Move action hidden or disabled with explanation |
| Destination cabinet is full (rank item limit) | Show Feature Lock upsell if applicable, else prevent move |
| Weight/volume-based items | Quantity selector should show weight/volume units, not count — requires further design |

---

## UI Placement

- **Entry Point**: Swipe action or long-press context menu on a batch row in the cabinet view.
- **Alternatively**: A dedicated "Move" button in the batch detail/edit sheet.
- The Move action should be visually distinct from Edit and Delete to prevent accidental triggering.

---

## Out of Scope (for this version)

- Cross-type cabinet moves (Pantry → Freezer) — see "Freeze" action, to be specified separately.
- Moving stock across multiple destination cabinets in a single action.
- Merging a moved batch with an existing batch of the same item at the destination (future: "Consolidation" feature).
- Undo/redo of move operations.

---

## Related User Testing

See `user_testing.md`: **Scenario 1c** (Whole batch move) and **Scenario 1d** (Partial batch move).
