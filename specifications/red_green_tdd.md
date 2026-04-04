# Red/Green TDD Log

This document tracks the implementation of new features and bug fixes using the Red/Green/Refactor methodology. All new functionality must begin with a failing test (RED) before implementation (GREEN) and subsequent refinement (REFACTOR).

---

## Iteration 59: Strategic Resupply & Logistics

### 🔴 Phase 1: RED (Requirement & Test)
**Goal**: Transform the system from passive expiry tracking into a proactive logistics tool using unit-count thresholds and automated deficit calculations.

**[TC-59.1] VERIFICATION: Resupply Intel & Deficit Calculation (Web)**
*   **App Status**: Web Deployment
*   **Test Platform**: Playwright (Desktop Chrome)
*   **Conditions**: 
    1. Item "Rice" (Weight) exists with: Min: 2 Units, Max: 5 Units.
    2. Default Size: "1kg".
    3. Initial stock is 1 batch of 1.5kg.
*   **Expected Behavior**:
    1. Navigation to `/logistics` reveals Rice.
    2. Stored amount is correctly parsed as 1.5kg.
    3. Min Deficit calculated as +500g (2kg - 1.5kg).
    4. Max Deficit calculated as +3.5kg (5kg - 1.5kg).
    5. Unit scaling applies correctly (g -> kg).
*   **Status**: 🟢 [PASSING] (Verified via Playwright desktop suite)

### 🟢 Phase 2: GREEN (Implementation)
*   **Action**: Implement `ItemTypes` migration (Min/Max columns), `Catalog` inputs, and `Logistics` dashboard logic.
*   **Code Reference**: [logistics.tsx](file:///c:/Users/Laurence%20Molloy/Desktop/GIT:Personal_Github/war-cabinet/mobile/src/app/logistics.tsx)
*   **Status**: 🟢 [PASSING]

### ⚙️ Phase 3: REFACTOR (Refinement)
*   **Action**: Shifted from raw weight thresholds to "Unit-Count" thresholds multiplied by standard size for intuitive logistics.
*   **Action**: Added "Unit-Scale" math to handle mixed grams vs kilograms in the same calculation.
*   **Action**: Implemented HTML Email fallback for native mobile (SKIP for Web E2E).
*   **Status**: [COMPLETED]


---

## Iteration 60: Strategic Silence (MIN-Triggered Logistics)

### 🔴 Phase 1: RED (Requirement & Test)
**Goal**: Optimize the restocking engine to reduce cognitive load by only surfacing items that have breached their MIN threshold. The MAX shortfall should still be shown once the alert is triggered, but items between the MIN and MAX thresholds remain silent.

**[TC-60.1] VERIFICATION: Strategic Silence (Web/Playwright)**
*   **App Status**: Web Deployment (Playwright)
*   **Conditions**: 
    1. Item "Coffee" (Unit) exists with: Min: 2, Max: 5. 
    2. Initial stock is 3 units (Correct in range: (Min: 2 < 3 < Max: 5)).
    3. Item "Sugar" (Unit) exists with: Min: 3, Max: 6.
    4. Initial stock is 2 units (Breach: (Min: 3 > 2)).
*   **Expected Behavior**:
    1. Navigation to `/logistics` reveals **Sugar** (Breach detected).
    2. **Coffee** is NOT visible (Silent within range).
    3. Sugar correctly shows both MIN and MAX required purchases (to reach 3 and 6 respectively).
*   **Status**: 🔴 [RED] (Verification pending)

### 🟢 Phase 2: GREEN (Implementation)
*   **Status**: [PENDING]

---
