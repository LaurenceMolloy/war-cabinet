# Logistics Intelligence & Metadata Doctrine

## 1. The Location Suggestion Hierarchy (4-Tier)
When an `Item Type` is selected in the Batch Addition form, the `Cabinet` dropdown MUST automatically select the first valid match in this priority order:

1.  **Tier 1: Explicit Configuration (Static)**
    - Check `ItemTypes.default_cabinet_id`. If defined in the item configuration, use this.
2.  **Tier 2: Item History (Predictive)**
    - Check the `Inventory` table for the most recent `cabinet_id` used for this specific `item_type_id`.
3.  **Tier 3: Global Recency (Persistent)**
    - Check the `Settings` table for `last_used_cabinet_id`. This value is updated after every successful batch addition and persists across app restarts.
4.  **Tier 4: Global Fallback (Alpha)**
    - If no data exists for Tiers 1-3, fall back to the first available cabinet in the alphabetical list.

## 2. Advanced Intent Metadata
Adds optional `Supplier` and `Product Range` fields to the `Inventory` table to prevent name pollution (e.g., "Chicken Korma" remains the name, while "M&S" and "Gastropub" are stored as metadata).

### Vocabulary Memory Rules:
- **Learning:** The system automatically adds new Suppliers and Ranges to a persistent vocabulary upon saving.
- **Suggestions:** When typing in these fields, the system suggests the top 3 most frequently/recently used values.
- **Deduplication:** When a vocabulary item is deleted via the Trash icon:
  - The system performs a Levenshtein distance check.
  - If a similar match is found (e.g., "Waitrose" vs "Waitross"), it offers to **Merge** the entries to maintain data integrity.

## 3. Quick-Add Lifecycle
- **Zero-Exit Flow:** The interface must allow creating a new `ItemType` via a modal or overlay without refreshing or leaving the current `Add Batch` screen.
- **Draft Preservation:** Form state (Quantities, Expiry Dates, Sizes) MUST be preserved while the Quick-Add modal is active and restored once the new type is created.
- **Auto-Selection:** The newly created `ItemType` must be automatically selected in the dropdown upon returning to the batch form.
