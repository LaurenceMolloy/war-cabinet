# Cost Intelligence — Parked Feature Specification

> **Status: PARKED** — This is a significant feature with broad UX implications.
> Do not implement until core stock management is stable and this has been fully designed.
> Recorded here so the thinking isn't lost.

> **Tier: General only** — See rationale below.

---

## Feature Tier

**Cost Intelligence is a General-tier feature.**

Rationale:

- **Sergeant** is the committed stock manager — more cabinets, more logistical
  intelligence about what they already own. Their value is in *what* they have.
- **General** is the strategic operator — they're not just managing stock, they're
  analysing *patterns over time*. Cost Intelligence is fundamentally a data
  analytics layer, not a logistics layer.
- The proxy system, anomaly detection, offer flagging, and trend analysis are
  sophisticated features that reward users disciplined enough to enter prices
  consistently. That is a General mindset.
- Thematically: generals need **supply cost intelligence** to run a campaign.
  The rank fits perfectly.

When the feature is gated:
- No first-entry dialogs are shown to non-General users
- No inflation badges appear on inventory cards
- No price prompts post-add
- The Cost Intelligence modal is inaccessible
- A General upgrade prompt may be shown if a non-General user somehow
  encounters a hook (e.g., long-presses a batch card)

---

## Origin

The user tracks prices in-store to monitor inflation of specific grocery items.
The idea is to capture price data at the point of recording new stock (batches),
then surface inflation signals passively on the inventory dashboard — without
requiring a separate "price tracking" workflow.

---

## Tracking Philosophy: Whitelist (Opt-In), Not Blacklist

The original approach was to track prices for all items and let the user *exclude* anomalies.
This was replaced with a **whitelist model**: tracking is opt-in per item type.

**Why whitelist wins:**
- Most items are not price-sensitive. You don't care if mixed herbs went up 3p.
- Opt-in data is intentional — every price record exists because the user wanted it
- No noise from items the user never cared about
- The app doesn't feel like a finance tool by default

---

## Proposed Data Model

### Change to `ItemTypes` table

A single new column to express the user's tracking intent:

```sql
ALTER TABLE ItemTypes ADD COLUMN is_price_tracked INTEGER DEFAULT NULL;
-- NULL   = not yet decided (will prompt again)
-- 0      = user explicitly opted out (never ask again)
-- 1      = user has opted in to price tracking

ALTER TABLE ItemTypes ADD COLUMN intel_only INTEGER DEFAULT 0;
-- 0      = standard inventory item (requires batch management)
-- 1      = Market Intelligence item (recon-only, no stock tracking)
```

### New Table: `PriceHistory`

An **append-only ledger** — separate from `Inventory` so that price records persist
even after a batch is consumed or deleted. Only written for items where
`ItemTypes.is_price_tracked = 1`.

```sql
CREATE TABLE PriceHistory (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  item_type_id    INTEGER NOT NULL,
  supplier        TEXT,
  product_range   TEXT,
  size            REAL NOT NULL,       -- numeric only, unit inferred from ItemTypes.unit_type
  price           REAL NOT NULL,       -- total price paid (e.g., for quantity N)
  quantity        INTEGER DEFAULT 1,   -- number of units bought at this price
  recorded_date   TEXT NOT NULL,       -- ISO date: "2026-04-17"
  is_offer        INTEGER DEFAULT 0,   -- 1 = user confirmed this was a promotional / offer price
  FOREIGN KEY(item_type_id) REFERENCES ItemTypes(id)
);
```

**Derived at query time:**
```
price_per_unit (ppu) = price / quantity / size
```

Storing `price` as the **total paid** is safer — ppu is always computable.

### Change to `Inventory` table

No changes strictly required. Price data lives in `PriceHistory` exclusively.
A batch entry only triggers a `PriceHistory` write if the item is opted in AND
the user enters a price.

---

## Inflation Calculation

### Core Formula

```
inflation % = ((current_ppu - previous_ppu) / previous_ppu) × 100
```

Where `ppu = price / quantity / size`.

**Price-per-unit normalisation is mandatory** — comparing a 400g tin to a 500g tin
at face value is meaningless. Everything must reduce to a common unit before comparison.

### What counts as "previous price"?

The default comparison target is the **most recent `PriceHistory` record where
`is_offer = 0`** for the same `item_type_id`, regardless of supplier or size
(both normalised away via ppu).

Offer-flagged records are **never** used as the proxy baseline — they represent
aberrant pricing, not the normal market rate. They remain visible in history
but are transparent to proxy auto-advance.

The Cost Intelligence modal should offer a **supplier filter** so the user can
drill into like-for-like comparisons manually.

### Multi-point trend

Where 3+ non-offer data points exist, calculate a **linear trend direction**:
- Consistently rising → show sustained inflation indicator
- Erratic → short-term delta only, no trend arrow

---

## Edge Cases

| Case | Handling |
|---|---|
| **Item not opted in** | No badge shown at all. Clean silence. |
| **Opted in, first purchase** | Show `📍 First price recorded` badge — no delta possible |
| **Opted in, no price entered** | Hide badge — show nothing rather than a `?` |
| **Size mismatch** | Normalise via ppu — this is the whole point of storing size separately |
| **Supplier switch** | Show delta but flag `⚠️ different supplier` — don't suppress it |
| **Promotional / sale price** | System detects >15% downward anomaly and prompts; user can also flag retrospectively from Cost Intelligence modal |
| **Stale data** | Show time delta alongside percentage: `+14% vs 8mo ago` — user judges relevance |
| **Bulk buy** | `quantity` field absorbs this — ppu still correct |
| **Multiple live batches** | Each batch card shows its own delta vs. the previous `PriceHistory` entry |
| **Fewer than 2 data points** | Suppress delta indicator; only show 📍 |

---

## Opting In — The First-Entry Dialog

### Prompt Eligibility

The first-entry dialog only fires when **all** of the following are true:

| Condition | Why |
|---|---|
| User is General tier | Feature is General-only |
| `cost_intelligence_enabled = '1'` | Feature not globally disabled |
| `is_price_tracked IS NULL` | Not yet decided for this item |
| `batch.supplier` is populated | Price data is only meaningful when the product is identified |

If the batch has no supplier, the prompt is **silently suppressed** — no error,
no nudge at point of entry. The user isn't told they need to add a supplier;
that would feel punitive.

**Why supplier but not range?**
- Supplier is the primary product identity for price comparison (Tesco vs. Aldi
  vs. Waitrose is the key variable)
- Range enriches but isn't essential — if a user switches from Tesco Value to
  Tesco Finest, that's detectable via the supplier filter in the modal
- Many items have no meaningful range concept at all
- Mandating range would exclude too many otherwise-valid tracking opportunities

**The indirect nudge:**
If a General user consistently adds batches without suppliers (so the prompt
never fires), the Cost Intelligence modal can surface a gentle informational
note: *"Add a supplier to your batches to start tracking their prices."*
This is informative rather than blocking — the user discovers it when they
actually open the modal, not mid-flow.

### Ongoing Price Prompts (tracked items)

For subsequent batches where `is_price_tracked = 1`, the same supplier check
applies. If a tracked-item batch is added without a supplier, the price prompt
is suppressed for that batch — no supplier means the ppu cannot be meaningfully
attributed to a comparable product. The batch is still recorded normally.

When a user adds a batch for an item where `is_price_tracked IS NULL` and the
batch *does* have a supplier, the dialog is presented **after** the batch is saved
(non-blocking):

> *"Would you like to track price inflation for [Passata]?
> Enter what you paid and we'll use this as your starting point."*

### Dialog Outcomes

| Action | Result |
|---|---|
| **"Yes, track it"** + price entered | `is_price_tracked = 1`, writes to `PriceHistory` |
| **"Not for this item"** | `is_price_tracked = 0`, never prompts again for this item |
| **"Skip"** / dismissed | `is_price_tracked` stays `NULL`, will prompt again next batch |

The dialog defaults to `NULL` on Skip — the user makes no active decision and
nothing changes. This is true zero-friction.

Opting in can also be managed from the **Item Type settings** screen (or within
the Cost Intelligence modal itself) — not just at batch-entry time.

---

## Market Intelligence (Recon-Only) Items

### The Problem: Fresh Produce Paradox
Users care deeply about the price of high-turnover items (milk, eggs, bread) as they are the primary indicators of household inflation. However, tracking these as "batches" in a cabinet is high-overhead and largely unnecessary, as they are consumed almost immediately.

### The Solution: "Recon-Only" Mode
A toggle in the Item Type settings: **"Use for price monitoring only"**.

**When enabled (`intel_only = 1`):**
1.  **Silo Separation**: The item is removed from standard cabinet views (where the user manages actual physical stock).
2.  **The Intelligence Basement**: These items are pooled into a special "Market Intelligence" category that sits permanently at the very bottom of the Inventory screen.
3.  **Ephemeral Data**: Recording a price for these items **never creates a row in the `Inventory` table**. It only appends to the `PriceHistory` ledger.
4.  **Zero Logistics**: These items never trigger "Low Stock" alerts, never expire, and have no "Quantity" value shown in the UI.

### UI Card: The Price Ticker
The card for a Recon-Only item differs from a standard Stock Card:
- **Visuals**: Reduced height, focused on financial metrics.
- **Header**: Item Name + Last Supplier (e.g., "Milk (Semi-Skimmed) — Tesco").
- **Primary Metric**: Current Price-Per-Unit (PPU) is the large glyph, replacing Quantity.
- **Trend**: A small 3-month sparkline or delta (e.g., `📈 +4%`) is shown next to the PPU.
- **CTA**: A prominent **"£ Record Price"** button triggers a specialized **"Quick Injection"** flow.

### Workflow: Quick Price Injection
Tapping the "Record Price" button on a Recon-Only card opens a minimal bottom sheet:
- **Price Input**: Focused by default.
- **Size/Unit**: Pre-filled from the last entry (one-tap to change).
- **Supplier**: Pre-filled from the last entry (one-tap to change).
- **Date**: Always defaults to "Today".

This allows a user to "walk the aisles" and record 5-10 key price points in seconds without ever having to "manage stock."

---

## The "Proxy Batch" Concept

### The Problem It Solves

Not every purchase needs to be a tracked price event. If the user buys Passata
on a 3-for-2 that week, they don't want that contaminating their baseline.
Rather than a blanket exclude mechanism, the user can **nominate a specific purchase
as their canonical price proxy** for that item.

### How It Works

- Inside the Cost Intelligence modal, each recorded price entry has a **"Use as proxy"**
  toggle (radio-button style — only one can be active)
- The nominated proxy becomes the `ppu` reference point for the **next** purchase's
  inflation calculation
- By default, the **first recorded price** is the proxy (the baseline)
- The user can change it at any time — e.g., selecting a known "normal price" purchase
  and demoting a promotional one

### Why This Is Better Than Exclude

| Blacklist (Exclude) | Whitelist (Proxy) |
|---|---|
| Track everything, mark anomalies | Track intentionally, nominate a reference |
| Assumes all price data is wanted | Assumes only opted-in data is wanted |
| Risk of cluttered history | Clean, purposeful history |
| User must remember to exclude | User simply picks their reference point |

The proxy model means the dataset stays lean and deliberate.

---

## Anomaly Detection — The Offer Flag

### The Two Complementary Mechanisms

| Mechanism | When to use | What happens |
|---|---|---|
| **Passive skip** | "I can't be bothered recording this offer price" | No record written at all |
| **Active offer flag** | "I want to record this but mark it as anomalous" | Record written with `is_offer = 1` |

Passive skip loses the offer price data forever. The active flag **preserves it**
— which is interesting in its own right. Knowing Passata was on offer at 65p in
March (vs. the usual 89p) is valuable context, even if you don't want it
distorting your inflation baseline.

### Automatic Detection (15% Threshold)

After the user enters a price, the system computes the new ppu against the
current proxy ppu. If the delta exceeds the threshold **downward**, it prompts:

```
New ppu < proxy_ppu × 0.85  →  "That's 23% cheaper than usual.
                                 Was this a special offer?"
                                 [Yes 🏷️]  [No, that's the new price]  [Skip]
```

**Asymmetric by design** — only downward anomalies trigger the offer question.
A 15%+ *upward* jump is more likely genuine inflation, so it gets a different,
non-accusatory prompt:

```
New ppu > proxy_ppu × 1.15  →  "That's 18% more than usual.
                                 Is this a genuine price rise?"
                                 [Yes, confirm 📈]  [Re-enter price]  [Skip]
```

### Offer Flag Outcomes

| User response | `is_offer` | Proxy advances? | Shown in history? |
|---|---|---|---|
| "Yes, it was an offer" | `1` | ❌ No | ✅ Yes, with 🏷️ tag |
| "No, that's the new price" | `0` | ✅ Yes | ✅ Yes, normally |
| "Skip" | `0` | ✅ Yes | ✅ Yes, normally |

### Retrospective Flagging

The user can toggle `is_offer` on any record from inside the **Cost Intelligence
modal** — useful if they forget to flag at entry time, or change their mind
about whether a price was anomalous. Offer-flagged records are always visible
but visually demoted (🏷️ tag, reduced opacity).

### Threshold Considerations

- **15%** is the proposed default — meaningful for staples, filters normal drift
- Should be **configurable** per-category eventually (alcohol and fresh goods
  fluctuate more than dried pasta) — nice to have, not MVP
- The threshold applies to **ppu** (normalised), not raw price — so size changes
  don't spuriously trigger it

### Proxy Auto-Advance

By default, the proxy **automatically advances** to the most recent price entry —
so the inflation delta shown is always "now vs. last time". This is the most
useful everyday signal.

From the Cost Intelligence modal, the user can **pin a specific historical record**
as the proxy instead — useful for long-term baseline questions like
"how much has this risen since I started tracking?" Both views are valid;
auto-advance just serves the common case without requiring manual curation.

---

## UI Concepts

### Inventory Card — Inflation Badge

Small, non-intrusive badge on each batch card (only rendered for opted-in items
with at least one price record):

```
📈 +12% vs 3mo ago     ← red, tappable
📉 -5%  vs 6mo ago     ← green, tappable
📍                     ← grey, "first recorded price", tappable
[nothing]              ← item not tracked, or no price entered — clean silence
```

Tapping opens the Cost Intelligence bottom sheet.

### Price Prompt — Two Entry Points

For any item with `is_price_tracked = 1`, every new batch addition triggers
a **lightweight price prompt after the action is complete** — never before.
Price entry is always optional; dismissing records no price and moves on.

**The same supplier eligibility check applies** — if the new batch has no
supplier populated, the price prompt is silently suppressed for that batch.

#### Entry Point 1: Full Add Form (`/add` screen)

After the batch is saved, a bottom-sheet prompt appears:

> *"What did you pay for this [Passata]? (optional)"*
> `[Last: £1.20 for 400g, 3mo ago — Same price ✓]`  `[Enter new price]`  `[Skip]`

#### Entry Point 2: Quick-Add (ADD button on inventory card)

The ADD button on a batch card creates the new batch instantly (no friction).
For price-tracked items, a minimal prompt follows:

> *"Price check — [Passata]: still £1.20 for 400g?"*
> `[Yes ✓]`  `[No — enter price]`  `[Skip]`

The quick-add path inherits the **same size as the existing batch**, so ppu
calculation has everything it needs without asking further questions.
If the size has changed, the user should use the full add form — quick-add
is only meaningful for "same product again".

### The "Same Price" Shortcut

Surfacing the last recorded price as a one-tap confirmation serves two purposes:

1. **Reduces friction** — user confirms in one tap if nothing changed
2. **Captures stability data** — re-recording the same ppu on a new date is
   valuable. Over 14 months of `£0.89/100g` followed by a sudden jump to
   `£1.05/100g` tells a much richer story than a single delta.

This means inflation tracking is useful even when prices *aren't* rising —
confirmed stability is a data point too.

### Cost Intelligence Modal (Bottom Sheet)

1. **Header**: Item name + current ppu prominently displayed
2. **Price timeline**: Chronological list or sparkline, most recent first;
   proxy record visually highlighted (📌); offer records demoted (🏷️, reduced opacity)
3. **Supplier filter toggle**: "All suppliers" vs "This supplier only"
4. **Stats row**: Lowest / Average / Highest — non-offer records only by default;
   toggle to include offers
5. **Trend indicator**: Based on linear trend of last N non-offer purchases
6. **Proxy selector**: Radio-style — tap any non-offer record to promote it as
   the comparison baseline; auto-advance is the default
7. **Offer flag toggle**: Tap any record to flip `is_offer` retrospectively
8. **Stop tracking**: Option to set `is_price_tracked = 0` for this item

---

## Feature Fatigue — Escape Hatches

Cost Intelligence involves recurring prompts. Some users will embrace this;
others will find it noise. The design must respect both without punishing either.

### Three Layers of Escape

| Layer | Mechanism | Scope | Reversible? |
|---|---|---|---|
| **Not now** | Skip on every prompt | This batch only | N/A |
| **Not this item** | "Not for this item" on first-entry dialog | This item type, permanently | Yes, via Cost Intelligence modal |
| **Turn it all off** | Global Settings toggle | Entire feature, all items | Yes, via Config screen |

### The Global Kill Switch

A Settings key controls whether Cost Intelligence is active at all:

```sql
INSERT INTO Settings (key, value) VALUES ('cost_intelligence_enabled', '1');
-- '0' = globally disabled — zero prompts, zero badges, complete silence
-- '1' = enabled (default for General tier)
```

When `cost_intelligence_enabled = '0'`:
- No first-entry dialogs
- No price prompts after add or quick-add
- No inflation badges on inventory cards
- No offer detection prompts
- The feature disappears completely until re-enabled in Config

### Escalation Pattern — Don't Lead with the Nuclear Option

The global kill switch should **not** appear on every prompt. This creates
cognitive overload and risks accidental permanent opt-out when the user
merely meant to skip one entry.

Instead, surface the global off switch through escalation:

**1. Every prompt** — unobtrusive secondary text link, low visual weight:
```
┌─────────────────────────────────────────┐
│  Price check — Passata: still £0.89?    │
│                                         │
│  [Yes ✓]   [No — enter price]   [Skip] │
│                                         │
│  Turn off price tracking                │  ← small, secondary, low contrast
└─────────────────────────────────────────┘
```

**2. After N consecutive skips** (proposed: 3), a proactive escalation prompt:
> *"Looks like price tracking isn't for you right now.
> Want to turn it off? You can always re-enable it in Settings."*
> `[Turn it off]`  `[Keep it on]`

The N-skip trigger catches users who are passively ignoring prompts without
realising there's an off switch. The escalation prompt surfaces at exactly
the moment of maximum relevance.

### Key UX Principle

Every route to the global off switch must carry the message:
> *"You can turn this back on in Settings at any time."

This removes permanence anxiety and makes the escape feel safe rather than
final. Users should never feel they're losing something forever.

### Settings Tracking for Escalation

```sql
INSERT INTO Settings (key, value) VALUES ('cost_intel_consecutive_skips', '0');
-- Incremented on each Skip; reset to 0 on any price entry or explicit opt-out
-- When value reaches threshold (e.g. 3), show escalation prompt
```

---

## Design Decisions (TBD at implementation time)

1. **Feature tier** — General only; non-General users see none of the prompts or badges
2. **Prompt eligibility minimum** — Supplier required; range is optional enrichment, not mandatory
3. **Minimum data points for delta display** — Proposed: 2 non-offer records (otherwise just 📍)
4. **Default comparison scope** — All suppliers or same supplier? Proposed: all, with caveat flag
5. **Price prompt timing** — Always post-action, never blocking; price is always optional
6. **Quick-add prompt wording** — "Price check" framing (confirmatory) vs. "What did you pay?" (open entry); TBD
7. **Same-price shortcut** — Always show last recorded proxy price in the prompt for one-tap confirmation
8. **Proxy auto-advance** — Default; skips `is_offer = 1` records automatically
9. **Proxy selection UI** — Cost Intelligence modal only; not exposed on batch card
10. **Offer detection threshold** — 15% default; asymmetric (downward = offer?, upward = price rise?)
11. **Threshold configurability** — Per-category eventually; global setting for MVP
12. **Escape hatch escalation threshold** — Proposed: 3 consecutive skips triggers proactive prompt
13. **Global kill switch placement** — Config/Settings screen + secondary link on every prompt
14. **Bottom sheet vs. separate screen** — Given existing UX patterns, bottom sheet preferred for both prompt and modal
15. **First-entry dialog timing** — After save (non-blocking), never interrupts the add-stock flow
16. **Can the user change their mind?** — Yes. `is_price_tracked`, `is_offer`, and `cost_intelligence_enabled` all reversible

---

## Why Parked

- Large schema addition (`PriceHistory` table + migrations)
- New UI surface (Cost Intelligence modal)
- Optional price field adds cognitive load to the add-stock form
- Requires careful UX to avoid making the app feel like a finance tool
- Core stock management, portion tracking, and recipe intelligence are higher priority

---

## Related Backlog Items (from todo.txt)

- Default supplier per item type (already in `ItemTypes.default_supplier`)
- Batch intel / notes — could overlap with price notes
- Batch merge intelligence — supplier/range already factored in

