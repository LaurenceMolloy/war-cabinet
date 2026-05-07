# Ontology Restructuring: Item Types → Products, Units → Items

**Author**: Antigravity  
**Date**: 2026-05-07  
**Status**: Analysis Complete — Decisions Confirmed, Awaiting Implementation Sign-Off

---

## 1. The Proposal

| Current Term | Proposed Term | Where Used |
|---|---|---|
| Item Type / Type | Product | Catalog, Readiness, Intelligence, Labels |
| Unit / Units | Item / Items | Stock counts, Readiness, Manifest displays |

---

## 2. Executive Summary

Your instinct is correct: this is **wide-reaching**. The terms "ItemType" and "unit" are deeply embedded across the entire stack — from the SQLite schema table names and column names, through the data access layer, all the way up to UI strings. However, the two terms have **very different risk profiles**:

- **"Item Types → Products"**: Primarily a UX-string change. The database table is `ItemTypes` and internal code variables use `itemType` / `type`, but these are structural references that don't need to change to achieve the UX goal.
- **"Units → Items"**: More nuanced. "Unit" is used in two completely different senses: (a) the **unit of measurement** (weight/volume/count), and (b) the **count of physical items in stock**. These must not be conflated.

---

## 3. The "Units" Ambiguity — Critical Distinction

Before any work begins, this needs to be resolved:

| Context | Current Word | Proposed Word | Safe? |
|---|---|---|---|
| `unit_type` column (weight/volume/count) | "unit" | **Do not rename** | ⚠️ Leave alone |
| Stock count display ("5 units in stock") | "units" | "items" | ✅ Safe UX-only |
| Readiness dashboard ("Total Units") | "Units" | "Items" | ✅ Safe UX-only |
| Manifest display ("1 X 500G (1 unit)") | "unit" | "item" | ✅ Safe UX-only |
| `formatQuantity` util result strings | "unit" | "item" | ✅ Safe UX-only |

> [!CAUTION]
> `unit_type` is a **database column** that drives measurement logic (weight/volume/count). It must **never** be renamed or conflated with the "units in stock" concept. These are two entirely different things that happen to share a word.

---

## 4. Full Scope Analysis

### 4.1 — Database Layer (HIGH RISK if touched, LOW RISK if left alone)

| Entity | Current Name | Risk of Renaming |
|---|---|---|
| Table | `ItemTypes` | 🔴 **Very High** — referenced in every JOIN, every foreign key, BackupService restore logic, and BarcodeSignatures FK |
| Table | `Inventory` | 🟢 Not proposed for rename |
| Column | `ItemTypes.unit_type` | 🔴 **Very High** — drives measurement logic throughout the stack |
| Column | `Inventory.item_type_id` | 🔴 **Very High** — core relational FK used everywhere |
| FK in `BarcodeSignatures` | `item_type_id` | 🔴 High — would require a destructive migration |

**Verdict**: The database layer should be left **completely untouched**. A table rename in SQLite requires a `CREATE + INSERT + DROP + RENAME` migration sequence, which is high-risk on a live production app. The payoff (users never see table names) is zero.

---

### 4.2 — Data Access Layer (LOW RISK if left alone)

**Files affected**: `database/ItemTypes.ts`, `database/Inventory.ts`, `database/Consolidation.ts`, `database/Ledger.ts`, `database/index.ts`

These files contain TypeScript code like `ItemTypes.getAll(db)` and SQL strings referencing the `ItemTypes` table. Internal variable names like `itemType`, `typeId`, `item_type_id` are developer-facing only — users never see them.

**Verdict**: Leave the code-level naming untouched. It's internal plumbing. Renaming it provides no user benefit and introduces significant risk of regression.

---

### 4.3 — Services Layer (LOW RISK if left alone)

**Files affected**: `services/BackupService.ts`, `services/notifications.ts`

`BackupService.ts` specifically serialises/deserialises the `ItemTypes` table by name in backup JSON. Renaming here would **break existing backups** unless a migration shim is added.

**Verdict**: Leave untouched.

---

### 4.4 — UX Strings (SAFE TO CHANGE — Pure UX Layer)

This is where the change should live. These are display-only strings that users actually see:

#### `catalog.tsx` — ~3,376 lines
| Current String | Proposed String | Notes |
|---|---|---|
| "Item Types" (section header) | "Products" | Straightforward |
| "Add Item Type" (button) | "Add Product" | |
| "Edit Item Type" (modal title) | "Edit Product" | |
| "New Item Type" (form label) | "New Product" | |
| "item type" (inline help text) | "product" | Check capitalisation context |
| "type" (where it means item type) | "product" | Context-dependent — some instances of "type" mean `cabinet_type` etc. |

#### `add.tsx`
| Current String | Proposed String |
|---|---|
| "Select Item Type" | "Select Product" |
| "No item types found" | "No products found" |

#### `index.tsx` (Dashboard)
| Current String | Proposed String |
|---|---|
| "X types tracked" or similar | "X products tracked" |
| "units in stock" | "items in stock" |
| "Total Units" | "Total Items" |

#### `intelligence.tsx` (Starburst HUD)
| Current String | Proposed String |
|---|---|
| "TYPE INTEL" (hub orbit label) | "PRODUCT INTEL" |
| Unit count manifests | Already uses `X UNITS` → `X ITEMS` |

#### `logistics.tsx`
| Current String | Proposed String |
|---|---|
| Any "unit" count references | "item" count |
| "item type" references in labels | "product" |

#### `components/ReadinessCommandView.tsx`
| Current String | Proposed String |
|---|---|
| "Types" column header | "Products" |
| "Units" metric | "Items" |

#### `context/BillingContext.tsx`
| Current String | Proposed String |
|---|---|
| Tier limit strings referencing "types" | "products" |
| Any "unit" references in upgrade prompts | "items" |

#### `utils/measurements.ts`
| Current String | Proposed String |
|---|---|
| `formatQuantity` return value "unit" (when `unit_type === 'count'`) | Careful — this is the measurement unit label, **not** the stock count. Leave as "unit" or rename to "item(s)" only where it's used as a stock label. |

---

### 4.5 — E2E Tests (MODERATE RISK)

**Files in `tests/` directory**: These likely use text-based assertions against labels like "Item Types", "units in stock" etc. Any UX string change will break these assertions and require updates.

**Verdict**: After UX changes, a test sweep will be required.

---

### 4.6 — Backup JSON Schema (MODERATE RISK if label-matched)

`BackupService.ts` uses the `ItemTypes` table name as a JSON key in backup files. If any UI logic ever tries to match on the string "Item Type" or "Product" to find backup sections, this would break. Currently this appears to be purely structural (table-name-keyed), so it should be unaffected by UX string changes.

---

## 5. Recommended Approach: UX-Only Label Shim

You are absolutely right to consider a **UX-only approach first**. This is the correct strategy.

### How to implement it cleanly

Create a single constants file — e.g. `src/constants/labels.ts` — that acts as the **single source of truth for all user-facing terminology**:

```typescript
// src/constants/labels.ts
export const LABELS = {
  // Ontology
  PRODUCT: 'Product',
  PRODUCTS: 'Products',
  ITEM: 'Item',
  ITEMS: 'Items',
  
  // Compound
  ADD_PRODUCT: 'Add Product',
  EDIT_PRODUCT: 'Edit Product',
  NO_PRODUCTS: 'No products found',
  TOTAL_ITEMS: 'Total Items',
  ITEMS_IN_STOCK: 'items in stock',
};
```

Every UX string in every component would reference `LABELS.PRODUCT` rather than hardcoding `"Item Type"`. This means:
- **Future renames are a one-line change** in one file.
- **No risk of partial renames** where some screens say "Product" and others still say "Item Type".
- **Code logic is completely untouched** — all variable names, SQL, and data structures remain as-is.

---

## 6. Risk Matrix Summary

| Layer | Touch It? | Risk | Reason |
|---|---|---|---|
| SQLite schema (`ItemTypes` table) | ❌ No | 🔴 Critical | Migration on live data, FK cascades, backup restore |
| SQL column `item_type_id` | ❌ No | 🔴 Critical | Core relational FK, pervasive across all queries |
| SQL column `unit_type` | ❌ No | ✅ Confirmed unambiguous | Measurement dimension only — no entity confusion remains |
| TypeScript variable names (`itemType`, `typeId`) | ❌ No | 🟡 Medium | Internal only, no user value, regression risk |
| `BackupService.ts` table key names | ❌ No | 🔴 Critical | Would break existing backup files |
| UX label strings (all screens) | ✅ Yes | 🟢 Low | Pure display layer, no logic dependency |
| `formatQuantity` output for count type | ✅ Yes | 🟢 Low | Confirmed: "unit(s)" → "item(s)" in display output |
| E2E test assertions | ✅ Yes (after UX change) | 🟡 Medium | Text-anchored assertions will need updating |

---

## 7. Recommended Execution Order (When Ready)

1. **Create `src/constants/labels.ts`** with the full `LABELS` object.
2. **`catalog.tsx` first** — highest surface area, most visible to the user.
3. **`index.tsx`** (Dashboard) — second most visible.
4. **`logistics.tsx` and `ReadinessCommandView.tsx`** — Readiness metrics.
5. **`intelligence.tsx`** — HUD orbital labels.
6. **`add.tsx`** — Stock entry screen.
7. **`BillingContext.tsx`** — Tier limit messaging.
8. **E2E test sweep** — Update any text-anchored assertions.

**Estimated Scope**: ~40–60 individual string replacements across 8 files. Low risk, high visual impact.

---

## 8. Decisions Log

| Question | Decision | Date |
|---|---|---|
| Should `unit_type` be renamed? | ❌ No — confirmed unambiguous once “units” as entity label is retired | 2026-05-07 |
| Should display "3 units" → "3 items"? | ✅ Yes — all stock-count display references use "items" | 2026-05-07 |
| Should `formatQuantity` return `"item"`? | ✅ Yes — for count-type quantities in display output | 2026-05-07 |

## 9. Still To Confirm

1. Are there **push notification strings** in `notifications.ts` that reference "unit" or "item type"? These should be audited in the same pass.
2. Should the tab label `"Catalog"` be reviewed as part of this ontology pass, or is it out of scope?

---

## 10. Implementation Checklist

Track progress screen-by-screen. Mark each file `✅ Done` when complete.

> [!NOTE]
> Line numbers are approximate reference points from the scan — always verify in context before editing. Some lines may contain code-level references (e.g. variable names) that should **not** be changed.

---

### ✅ `src/constants/labels.ts` — **DONE (2026-05-07)**
- [x] Created file with `LABELS` constants object

---

### 🔲 `src/utils/measurements.ts` — Line 7
- [ ] `"unit"` / `"units"` display output → `"item"` / `"items"` (count type only)

---

### 🔲 `src/app/catalog.tsx` — 16 locations
- [ ] L150 — check for "Item Type" / "units" display string
- [ ] L153 — check for "Item Type" / "units" display string
- [ ] L404 — check for "Item Type" / "units" display string
- [ ] L515 — check for "Item Type" / "units" display string
- [ ] L744 — check for "Item Type" / "units" display string
- [ ] L1214 — check for "Item Type" / "units" display string
- [ ] L1426 — check for "Item Type" / "units" display string
- [ ] L1552 — check for "Item Type" / "units" display string
- [ ] L2057 — check for "Item Type" / "units" display string
- [ ] L2079 — check for "Item Type" / "units" display string
- [ ] L2210 — check for "Item Type" / "units" display string
- [ ] L2552 — check for "Item Type" / "units" display string
- [ ] L2562 — check for "Item Type" / "units" display string
- [ ] L2689 — check for "Item Type" / "units" display string
- [ ] L2729 — check for "Item Type" / "units" display string
- [ ] L3106 — check for "Item Type" / "units" display string

---

### 🔲 `src/app/add.tsx` — 8 locations
- [ ] L458 — check for "Item Type" / "units" display string
- [ ] L1077 — check for "Item Type" / "units" display string
- [ ] L1103 — check for "Item Type" / "units" display string
- [ ] L1171 — check for "Item Type" / "units" display string
- [ ] L1177 — check for "Item Type" / "units" display string
- [ ] L1248 — check for "Item Type" / "units" display string
- [ ] L1557 — check for "Item Type" / "units" display string
- [ ] L1680 — check for "Item Type" / "units" display string

---

### 🔲 `src/app/index.tsx` — 6 locations (Dashboard)
- [ ] L385 — check for "Item Type" / "units" display string
- [ ] L402 — check for "Item Type" / "units" display string
- [ ] L442 — check for "Item Type" / "units" display string
- [ ] L1929 — check for "Item Type" / "units" display string
- [ ] L1939 — check for "Item Type" / "units" display string
- [ ] L1971 — check for "Item Type" / "units" display string

---

### ✅ `src/app/intelligence.tsx` — DONE (2026-05-07)
- [x] L9 — comment: `Item Types` → `Products`
- [x] L71 — comment: `Units` → `unit label`
- [x] L143 — comment: `Seed Item Types` → `Seed Products`
- [x] L241 — comment: `MIDDLE RING: Item Types` → `MIDDLE RING: Products`
- [x] L427 — `'TYPE INTEL'` → `'PRODUCT INTEL'` ✅ UX string
- [x] L449 — `"UNITS"` manifest → `"ITEMS"` ✅ UX string
- [x] L451 — `"UNITS"` summary → `"ITEMS"` ✅ UX string
- [x] L535 — `TOTAL UNITS` → `TOTAL ITEMS` ✅ UX string

---

### 🔲 `src/app/logistics.tsx` — 5 locations
- [ ] L35 — check for "Item Type" / "units" display string
- [ ] L184 — check for "Item Type" / "units" display string
- [ ] L390 — check for "Item Type" / "units" display string
- [ ] L424 — check for "Item Type" / "units" display string
- [ ] L499 — check for "Item Type" / "units" display string

---

### 🔲 `src/app/_layout.tsx` — 3 locations
- [ ] L67 — check for "Item Type" / "units" display string
- [ ] L117 — check for "Item Type" / "units" display string
- [ ] L159 — check for "Item Type" / "units" display string

---

### 🔲 `src/components/ReadinessCommandView.tsx` — (from earlier scan)
- [ ] "Types" column header → "Products"
- [ ] "Units" metric label → "Items"

---

### 🔲 `src/components/ConsolidationCarousel.tsx` — Line 62
- [ ] L62 — check for "Item Type" / "units" display string

---

### 🔲 `src/components/QuickThresholdModal.tsx` — Line 74
- [ ] L74 — check for "Item Type" / "units" display string

---

### 🔲 `src/context/BillingContext.tsx` — 5 locations
- [ ] L63 — tier limit string (likely "item types" cap)
- [ ] L64 — tier limit string
- [ ] L65 — tier limit string
- [ ] L95 — tier limit / upgrade prompt string
- [ ] L553 — tier limit / upgrade prompt string

---

### ⛔ Files to Leave Untouched (Do Not Edit Display Strings)

| File | Reason |
|---|---|
| `database/ItemTypes.ts` | Code-level DAL — no user-visible strings |
| `database/Inventory.ts` | Code-level DAL — no user-visible strings |
| `database/Cabinets.ts` | Code-level DAL — no user-visible strings |
| `db/sqlite.ts` | Schema & migration logic — all internal |
| `services/BackupService.ts` | Uses `ItemTypes` as a JSON key — breaking this breaks restores |
| `services/notifications.ts` | Audit first before touching — TBC |
