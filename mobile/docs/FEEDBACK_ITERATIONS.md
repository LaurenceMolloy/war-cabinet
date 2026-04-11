# War Cabinet — Feedback Iteration Log

This document tracks edge cases, bugs, and UX improvements discovered during manual QA and E2E testing.
Each entry is linked to the affected code and its corresponding E2E test coverage.

---

## FI-001 · SQLite Worker Crash on Duplicate Cabinet Name

**Discovered:** 2026-04-10  
**Screen:** Promotion Centre → Cabinets Tab  
**Severity:** High — app-breaking crash with no user feedback  

### Behaviour Before Fix

When a user attempted to add a cabinet using a name that already existed in the database,
the underlying SQLite `UNIQUE` constraint would fire. On the Web build, this error propagates
through the `expo-sqlite` WebWorker layer as a completely opaque `Unknown` error:

```
Uncaught Error: Unknown
Call Stack:
  workerMessageHandler   node_modules/expo-sqlite/web/WorkerChannel.ts
  worker.addEventListener node_modules/expo-sqlite/web/SQLiteModule.ts
```

The app would effectively barf — no user-facing feedback, no recovery path, crash state.

### Root Cause

`db.runAsync('INSERT INTO Cabinets ...')` was called unconditionally. On the Web platform,
the SQLite WebWorker receives the failing `INSERT` and bubbles the constraint violation as a
generic `Unknown` error that cannot be caught meaningfully at the React layer.

There was a secondary issue: parameters were passed variadically (e.g., `db.runAsync("...", a, b, c)`)
rather than as an array (`db.runAsync("...", [a, b, c])`). The Web SQLite worker requires the array
form. This was corrected across all affected queries in `catalog.tsx` as part of the same fix.

### Fix Applied

**File:** `mobile/src/app/catalog.tsx` — `handleAddCabinet` and `handleUpdateCabinet`

A pre-flight duplicate check was added *before* any SQL is executed. The check is
case-insensitive (`toLowerCase()`) to catch `Echo Base` vs `ECHO BASE` vs `echo base`.

```ts
if (cabinets.some(c => c.name.toLowerCase() === newCabName.trim().toLowerCase())) {
  Alert.alert(
    'Duplicate Designation',
    `A cabinet named "${newCabName.trim()}" already exists in your logistics network.`
  );
  return;
}
```

The same guard is applied on rename (edit), excluding the cabinet being edited from the uniqueness check:

```ts
if (cabinets.some(c => c.id !== cabId && c.name.toLowerCase() === editingCabName.trim().toLowerCase())) {
  // alert...
}
```

Because the `return` fires before `setNewCabName('')`, the form input *intentionally* retains the
value the user typed — making it easy for them to correct the name without re-typing.

### E2E Test Coverage

**File:** `mobile/e2e/TC-74.1.spec.ts`  
**Test:** `should intercept duplicate cabinet designations gracefully without crashing`

The test:
1. Purges state to a clean slate
2. Creates a cabinet named `Echo Base`
3. Waits for the form to clear (proving first creation succeeded)
4. Attempts to create `ECHO BASE` (same name, different casing) as a freezer type
5. Asserts the input **still holds** `ECHO BASE` — proving the early-return fired and
   the app did not crash, navigate away, or silently fail

---

## FI-002 · `cabRows` Lexical Declaration Used Before Initialization

**Discovered:** 2026-04-10  
**Screen:** Any screen that triggers `useFocusEffect` → `load()` in `catalog.tsx`  
**Severity:** High — crashes on screen navigate  

### Behaviour Before Fix

```
Uncaught Error: can't access lexical declaration 'cabRows' before initialization
Call Stack:
  rows.filter$argument_0  src/app/catalog.tsx
  load                    src/app/catalog.tsx
```

Navigating to or from any tab that invoked the `load()` function could trigger this.

### Root Cause

Inside `load()`, `setFreezerItemCount` used a `.filter()` callback that referenced `cabRows`
to resolve default-cabinet freezer membership. However, `const cabRows = await db.getAllAsync(...)`
was declared *after* the filter that consumed it — a temporal dead zone violation.

### Fix Applied

Moved the `cabRows` query above the `setFreezerItemCount` call so it is fully resolved
before being accessed.

---

## FI-003 · Freezer Item Limits Not Enforced on Batch Addition/Move

**Discovered:** 2026-04-10 (during TC-74.1 review)  
**Screen:** Add Batch screen (`add.tsx`) / Edit Batch screen  
**Severity:** Medium — rank-based entitlement gate was missing on the batch-level path  

### Behaviour Before Fix

The 3-item freezer limit for Cadet and Private ranks was correctly enforced when editing
an item type in the Catalog (setting `freeze_months`). However, a user could bypass this
entirely by:

1. Creating a 4th standard item type (no freeze spec)
2. Adding a batch of it directly to a **Freezer Cabinet**

The `add.tsx` batch-save path had no check against `limits.freezer_items`.

### Fix Applied

`add.tsx` → `handleSave`: Added a preflight check that counts distinct item types currently
in any freezer (by `freeze_months IS NOT NULL` or `cabinet_type = 'freezer'`). If the item
being added is *new* to the freezer and would breach the rank limit, `checkEntitlement('FREEZER_LIMIT')`
is called and the save is aborted.

### E2E Test Coverage

**File:** `mobile/e2e/TC-74.1.spec.ts`  
Tests:
- `should enforce limit of 3 freezer item types when adding batches` — verifies block via batch addition to a freezer cabinet
- `should allow more than 3 freezer item types for sergeant rank` — verifies Sergeant rank bypasses all paths (freeze_months setting, batch addition, and batch cabinet move)

---

*This log is append-only. New entries should follow the FI-NNN numbering convention.*
