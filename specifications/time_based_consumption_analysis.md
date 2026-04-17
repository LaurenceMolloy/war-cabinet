# Time-Based Consumption Analysis & Alerts (SITREP)

## Objective
To provide **General-Tier** users with automated situational awareness of their supply longevity. By analyzing the rate of deduction from the inventory, the app predicts "Days of Cover" and provides proactive restocking alerts before the user hits zero.

---

## 1. Feature Tiers

| Feature | Rank | Logic |
|---|---|---|
| **Manual Logistics** | Sergeant | Alerts based on static `Minimum Stock` settings. |
| **Logistics Intelligence** | General | Alerts based on `Days of Cover` (Current Stock / Usage Rate). |
| **Quartermaster (Basic)** | Sergeant | Suggestions based on `Current < Min`. |
| **Quartermaster (Enhanced)** | General | Suggestions based on `Will hit zero within 30 days`. |

---

## 2. Data Model: The Consumption Ledger

We cannot rely on the `Inventory` table for history, as batches are deleted upon consumption.

```sql
CREATE TABLE ConsumptionLedger (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  item_type_id    INTEGER NOT NULL,
  recorded_date   TEXT NOT NULL,    -- ISO Date
  amount_consumed REAL NOT NULL,    -- Normalized units (1.0 = 1 whole item)
  is_portion      INTEGER DEFAULT 0,-- 1 if this was a partial/fractional deduction
  FOREIGN KEY(item_type_id) REFERENCES ItemTypes(id)
);
```

### Normalization Logic
To ensure accuracy across different pack sizes:
- If a user deducts 1 whole unit (Size 500g): `amount_consumed = 500`.
- If a user deducts 1 portion (Portion 1 of 5, Size 500g): `amount_consumed = 100`.
**All consumption is stored in the base unit (g, ml, unit) to allow for size-switching over time.**

---

## 3. The Baseline Algorithm (The 3-Usage Rule)

To prevent wildly inaccurate estimates during the initial "Discovery" phase:

1.  **Event 1 (The Cold Start)**: User first records a deduction. System notes the date but calculates no rate.
2.  **Event 2 (The Midpoint)**: Second deduction. System calculates the duration between Event 1 and 2.
3.  **Event 3 (The Baseline)**: Third deduction. System now has two durations. It averages these to create the **Initial Run Rate**.

**General Rank Benefit**: The "Sit-Rep" reports only unlock for an item once the 3-Usage baseline is established. Until then, it falls back to standard "Min Stock" logic.

---

## 4. Alert Logic: The "2-Month SITREP"

### Weekly Intelligence Scan
The app performs a background audit of all General-Tier items every 7 days (the "Resupply Scan"):

1.  **Calculate Burn Rate**: `BurnRate = Total_Consumed_Last_90_Days / 90` (Units per day).
2.  **Calculate Days of Cover**: `DaysOfCover = Total_Active_Stock / BurnRate`.
3.  **Threshold Check**:
    - **CRITICAL**: `DaysOfCover < 14` (Less than 2 weeks — replenish immediately).
    - **WARNING**: `DaysOfCover < 30` (Less than 1 month — add to next shopping list).

### Why the 90-Day Window?
A 3-month rolling window ensures the intelligence adapts quickly to seasonal shifts or household habit changes (e.g., back-to-school, new diets) while providing enough data points for items used 1-2 times per month.

---

## 5. Predictive Waste Analysis (The Intersection Model)

This feature analyzes the "Conflict of Supply" by overlaying two mathematical curves to predict waste events before they are imminent.

### The Two Curves
1.  **Cumulative Expiry Curve**: A step-graph showing the total volume of stock that *must* be consumed by any given date in the future.
2.  **Linear Consumption Curve**: A straight line projection of total volume *likely* to be consumed based on the 90-day BurnRate.

### The "Surplus Conflict" Detection
A warning is triggered if, at any point in the 12-month future projection, the **Expiry Curve rises above the Consumption Curve**.

- **Calculation**: `SurplusAtRisk = CumulativeExpiry(DateX) - ProjectedConsumption(DateX)`. 
- **Actionable Insight**: "You have a surplus of 3 units at risk for Oct 2026."

### Strategic Integration (Mess Hall "Prioritization")
General-tier users get "Smart Priority" in the Mess Hall. When generating recipes, the system automatically prioritizes ingredients that are at **Intersection Risk**, even if their raw expiry date is months away.

---

## 6. Intelligence Overrides (Per-Item)

While the system uses a **Global Default (30 Days)**, General-tier users can set custom thresholds at the `ItemType` level to reflect differing priorities:

- **Mission Critical** (e.g., Medical, Baby, Pet): Set to **45-60 days** to ensure a deep safety buffer.
- **Just-In-Time** (e.g., Snacks, Alcohol): Set to **7-14 days** to minimize storage footprint.
- **Manual Only**: Option to disable Time-Based analysis for specific items, falling back to static Min Stock.

---

## 6. UI Requirements

### The "Intelligence Row" (Inventory Card)
For items with an established baseline, the card shows:
- `⏱ 22 Days of Cover` (Amber)
- `⏱ 8 Days Remaining` (Red/Blinking)
- `⏱ Establishing Baseline...` (Grey - shown during first 2 events)

### The Quartermaster SITREP
A specialized view for Generals:
> *"Intelligence reports suggest you will run out of **Olive Oil** in 18 days. You typically consume 2L per month. Suggested replenishment: 3L (ensures 90 days of cover)."*

---

## 6. Edge Cases & Complexity

### Bulk Deductions (The "Session" Rule)
If a user deducts 3 cans of tomatoes for a large batch cook:
- Deductions for the same `item_type_id` occurring within a **4-hour window** are aggregated into a single `ConsumptionLedger` entry.
- This prevents the algorithm from seeing 3 "High freq" events and thinking the usage rate has spiked; it recognizes it as a single usage event of higher volume.

### Seasonal Fluctuations
- Usage rates are calculated on a **rolling 180-day window**. 
- This ensures that "Summer items" naturally cycle out of the run-rate during winter, and vice-versa, without the user needing to manually reset the intelligence.

### Resetting Intelligence
Users can "Clear Consumption History" for a specific item if they significantly change their habits (e.g., a new diet), forcing the 3-Usage baseline to restart.
