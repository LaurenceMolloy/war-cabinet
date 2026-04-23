# Specification: Free Trial & Entitlement Logic

## Objective
To define a conversion-optimized free trial and rank-requirement system for War Cabinet that demonstrates value without cannibalizing one-time license sales.

---

## Strategic Overview
The "War Cabinet" operates on a Rank-Clearance model (Private, Sergeant, General). The 7-day trial must provide enough "Operational Intelligence" to prove utility, while maintaining a "Logistical Squeeze" that encourages upgrading for long-term household management.

---

## Option 1: The "Unlimited Open House" (Current)
*Everything is unlocked during the 7-day trial.*

### Pros
- **Maximum "Wow" Factor**: Users can see the full AI and scale capabilities immediately.
- **Zero Friction**: Simplest implementation.

### Cons
- **Inventory Completion Risk**: A fast user can set up their entire home catalog for free. Once set up, they may never need to add new categories/cabinets, rendering the "Sergeant" upgrade irrelevant.
- **Post-Trial Crash**: The transition from "Unlimited" to "Restricted" can feel like a heavy performance penalty, leading to app deletion.

---

## Option 2: The "Scale-Gated Maintenance"
*Unlimited construction during trial, but "Intelligence Blackout" after trial ends.*

### Pros
- **Intel-Driven Upsell**: Focuses on value (Expiry alerts, Freezer age) rather than just "Adding Items."
- **Data Safety**: Users never lose their data, but they lose the command views that make the data useful.

### Cons
- **Technically Complex**: Requires "degrading" UI features (hiding dates/ages) while keeping the records visible.
- **Potential Confusion**: Users might think the app is broken when data "goes dark."

---

---

## THE TACTICAL PROMOTION SYSTEM (FINAL DEPLOYMENT)
*Restricted scale during trial, transitioning to "Earned Capacity" upon trial completion.*

### 🎖️ Rank: CADET (7-Day Tactical Evaluation)
- **Scale**: 2 Cabinets / 3 Categories / 12 Item Types.
- **Micro-Teaser**: 1 Cabinet can be 'Freezer' type; 3 Items can have 'Freeze Months'.
- **Intel**: Full access to **The Mess Hall (AI)**, **Strategic Alerts**, and **Tactical Backups**.
- **Goal**: Demonstrate maximum utility within a cramped footprint.

### 💂 Rank: PRIVATE (Post-Trial Free Status)
- **Scale (Earned)**: Increases to 6 Cabinets / 6 Categories / 24 Item Types.
- **Blackout**: Loss of AI Suggestions and Expiry Alerts.
- **Experimental Protocol**: Retains limited Freezer Mode (1 Cabinet / 3 Item Specs).

### 🏅 Rank: SERGEANT (£2.99 / One-Time)
- **Scale**: Unlimited.
- **Intel**: Restores Freezer Analytics and reporting.

### ⭐️ Rank: GENERAL (£4.99 / One-Time)
- **Strategic Command**: Restores all AI, Alerts, and Automated Backup features.

---

### Early Graduation Protocol:
To empower user agency, Cadets may choose to "Graduate Early" within the Promotion Centre.
- **Action**: Immediate promotion to Private.
- **Benefit**: Immediate scale increase to 24 items / 6 cabinets / 6 categories.
- **Cost**: Permanent forfeiture of the remaining 7-day trial period (AI, Alerts lock immediately).

---

### Pros
- **Psychological Reward**: Softens the blow of losing premium features by providing a "Present" (Double Scale) at the exact moment of transition.
- **Hook, Reward, Upsell**: Users get used to the AI during the "Cadet" phase, then get enough space to stay in the app as "Private," eventually buying Sergeant to manage their full inventory.
- **High Retention**: Users feel they've "earned" their status by sticking around for a week.

### Early Graduation Protocol:
To empower user agency, Cadets may choose to "Graduate Early" within the Promotion Centre.
- **Action**: Immediate promotion to Private.
- **Benefit**: Immediate scale increase to 24 items / 6 cabinets.
- **Cost**: Permanent forfeiture of the remaining 7-day trial period (AI, Alerts, and Freezer Intel lock immediately).
- **UX Goal**: Forces an explicit value-comparison between "Automation" and "Scale."

### Cons
- **Limited First Impression**: 12 items might feel too small for some power users to even value the trial. (Mitigation: Use clear UI copy explaining the 12-item limit is only for the first 7 days).

---

## Rank-Specific Feature Anchors (Proposed)

### RANK: CADET (Trial - Day 1-30)
- [✓] **Scale**: 2 Cabinets / 4 Categories / 16 batches and 16 item types.
- [✓] **Full Intel**: Full access to AI Suggestions & Alerts.
- [✓] **Experimental Protocol**: Limited Freezer Mode (1 Cabinet / 4 Item Types and Batches).

### RANK: PRIVATE (Post-Trial Free)
- [✓] **Earned Scale**: 8 Cabinets / 8 Categories / 32 batches and 32 item types.
- [✓] **Core Ops**: Basic MANUAL stock tracking only, incl. freezer mode intelligence
- [✓] No AI, data integrity engine, batch consolidation, partial consumption or Alerts.

### RANK: SERGEANT (£4.99 One-Time)
- [✓] **Unlimited Logistics Net**: Unlimited cabinets, categories, batches and item types.
- [✓] **Tactical Consolidation**: Quality-of-life tools (Batch Consolidation).
- [✓] **Portion Tracking**: Fractional pip deductions and bulk decanting support.
- [✓] **Barcode Logistics**: Lightning-fast data entry via memory-mapped physical scanner.
- [✓] **Data Integrity Engine**: Advanced noise cancellation and interactive reconciliation to keep your usage metrics clean. (this includes capturing and correcting all types of user error)
- [✓] **The Quartermaster Hub**: Tactical resupply reports and sharing.
- [✓] **Tactical Stock Rotation**: Manual movement-audit roster for secondary storage zones.

### RANK: GENERAL (£2.49 / month or £19.99 / year)
- [TODO] **Strategic Command**: Automated alerts
    - [TODO] weekly low-stock (predictive)
    - [TODO] monthly overstock (predictive)
    - [✓] expiry (based on actual expiry dates)
    - [✓] stock rotation (alerts for overdue cabinet sweeps)
- [TODO] **SITREP Intelligence**: 90-day BurnRate and "Days of Cover" forecasting.
- [TODO] **Predictive Waste Analysis**: The Intersection Model (Expiry vs. Consumption conflicts).
- [PARKED] **Market & Cost Intelligence**: Personalised inflation tracking, proxy batches, and recon-only (no stock) items.
- [✓] **The Mess Hall**: Full AI-powered recipe suggestions from inventory.
- [✓] **Tactical Backups**: Automated rolling snapshots, friction-free device migration and disaster recovery.

### RANK: FIELD MARSHALL (Pricing TBD)
- [TODO] **Platoon-Level P2P Mesh**: True offline-first multi-device synchronization over local WiFi. Maintain a synchronized "common operational picture" across up to 3 devices—no cloud server required. Your data stays entirely within your perimeter.
- [TODO] **Joint Action Logs**: Decentralized tracking to see which operative consumed, restocked, or relocated tactical assets recently.

---

## Implementation Decisions
- **[AER-69.1]**: Implemented `isPrivate` rename and finalized 2/3/12 Cadet footprint.
- **[AER-69.2]**: Verified custom tactical modal for graduation to replace browser confirm.
