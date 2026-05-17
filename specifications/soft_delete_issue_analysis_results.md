LJM NOTE: we have already worked through issues 1-3


Soft-Deletion Flash Points Analysis (Ledger Sweep)
A comprehensive sweep of the codebase has been completed to identify areas where the transition to soft-deleted batches (where depleted items remain in the Inventory table with quantity = 0 to preserve historical integrity, audit logs, and MIA metrics) causes conflicts or unexpected behaviors.

Below are the 6 critical flash points uncovered during this analysis, detailed with their location, technical behavior, user impact, and the recommended correction strategy.

1. Cabinet Decommissioning Lockout
File: 
Cabinets.ts
SQL Query:
sql
SELECT COUNT(*) as c FROM Inventory WHERE cabinet_id = ?
🔴 Technical Behavior
When a user attempts to delete/decommission an empty cabinet, the system queries the Inventory table to check if there are any items inside. However, because depleted items are soft-deleted (quantity = 0), they still exist as rows associated with this cabinet_id.

⚠️ User Impact
The user sees a cabinet is completely empty in the inventory grid, but when they try to delete/decommission it, the app blocks them with an error: "Cannot delete a cabinet that still contains stock." There is no way for the user to clear this without purging the database.

2. Drifting Cabinet Stock Counters
File: 
Cabinets.ts
SQL Query:
sql
SELECT c.*, COUNT(i.id) as stock_count 
FROM Cabinets c 
LEFT JOIN Inventory i ON i.cabinet_id = c.id
GROUP BY c.id
🔴 Technical Behavior
When loading the basic list of cabinets for lists, dashboards, and dropdowns, the system counts the associated Inventory records without filtering out depleted items.

⚠️ User Impact
The main dashboard and selection cards will report that a cabinet contains active stock (e.g., "Freezer 1 · 4 items"), but when the user opens the cabinet, the inventory grid will display absolutely nothing.

3. Ghost Location Conflicts
File: 
Cabinets.ts
SQL Query:
sql
SELECT DISTINCT c.id, c.name 
FROM Inventory v 
JOIN Cabinets c ON v.cabinet_id = c.id 
WHERE v.item_type_id = ?
🔴 Technical Behavior
This query identifies other cabinets that house a specific product type, which is used to trigger "Location Conflicts" (warning a user if they are scattering the same product across too many different cabinets). Because it lacks a quantity > 0 check, it matches soft-deleted batches.

⚠️ User Impact
If a user once had soup in Cabinet A (now depleted to 0), and they add a new batch of soup to Cabinet B, the system will trigger a false location conflict alert warning them that the soup is spread across multiple locations.

4. Resurrection of Stale Metadata (Consolidation Matcher)
File: 
Consolidation.ts
SQL Query:
sql
SELECT id, batch_intel, expiry_month, expiry_year, supplier, product_range, size, image_uri 
FROM Inventory 
WHERE item_type_id = ? AND size = ? AND cabinet_id = ?
  AND (expiry match...)
🔴 Technical Behavior
When new stock is registered, the consolidation matcher looks for structurally matching batches (same size, cabinet, expiry) to merge quantities instead of creating a new row. Since it queries all inventory records, it can find a soft-deleted batch (quantity = 0). If chosen, it increments the quantity (quantity = quantity + new_qty).

⚠️ User Impact
While "resurrecting" a row is mathematically fine, the new batch is forced to inherit the stale, outdated metadata of the old batch (such as old custom supplier tags, stale batch intelligence notes, or old images) from months ago instead of starting fresh.

5. Relocation & Rotation of Depleted Items
File: 
logistics.tsx
SQL Query:
sql
SELECT quantity, size, expiry_month, expiry_year 
FROM Inventory 
WHERE cabinet_id = ? AND item_type_id = ?
🔴 Technical Behavior
When a user commits a stock rotation in the logistics panel, the system locates all matching batches in the source cabinet to write logs and transfer them. Because it queries all batches without quantity > 0, it includes depleted items.

⚠️ User Impact
The system will write redundant, empty records to the RotationLogs history and update the last_rotated_at timestamp on soft-deleted 0 stock, modifying historical ledger records that should have remained untouched.

6. Severe Type Mismatch in Recon Screen Audits (Critical UI/API Bug)
File: 
recon.tsx
 & 
recon.tsx
Function Calls:
Database.Inventory.markAudited(db, currentBatch.id, false) (Found)
Database.Inventory.markAudited(db, item.id, true) (MIA)
Expected API Signature:
typescript
async markAudited(db: any, id: number, outcome: 'VERIFIED' | 'ADJUSTED' | 'MIA' | 'NEW')
🔴 Technical Behavior
In recon.tsx, the calls to markAudited pass boolean values (false/true) instead of the required string categories ('VERIFIED'/'MIA').

In SQLite, these booleans are saved as 'false' or 'true' (or 0/1).
When the Audit Dashboard generates its metrics, it calculates totals using queries like: SUM(CASE WHEN last_audited_at >= ? AND last_audit_outcome = 'VERIFIED' THEN 1 ELSE 0 END) as verified_batches
⚠️ User Impact
Because 'false' and 'true' do not match 'VERIFIED' or 'MIA', all audits committed through Recon Mode are completely ignored by the analytics dashboard. The dashboard will perpetually report "0% Audited" and show no verified items even after the user successfully completes a Recon swipe mission!

TIP

Summary Recommendation:

Restrict all stock counts, storage site checks, and consolidation candidates in the business logic to quantity > 0.
Ensure all table deletion checks (cabinets and categories) use the quantity > 0 condition, and run a quick database purge query on quantity = 0 rows inside the delete transaction.
Standardize the markAudited calls in the swipe-recon interface to pass correct 'VERIFIED' and 'MIA' string outcomes instead of booleans.