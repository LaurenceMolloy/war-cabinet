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

## Iteration 61: Rations Briefing (Prompt Generator)

### 🔴 Phase 1: RED (Requirement & Test)
**Goal**: Implement a tactical recipe prompt generator that allows users to leverage external LLMs for restocking guidance. The feature must persist dietary and ingredient preferences and compile a comprehensive strategic briefing including the 50 soonest-expiring items.

**[TC-61.1] VERIFICATION: Prompt Compilation & Clipboard (Web/Playwright)**
*   **App Status**: Web Deployment (Playwright)
*   **Conditions**: 
    1. 2 items exist: "Tuna" (Expiring tomorrow) and "Rice" (Expiring next year).
    2. Preferences set: "Pescetarian", Preferred: "Lemon", Avoid: "Olives".
*   **Expected Behavior**:
    1. Navigation to `/rations` reveals the configuration form.
    2. Setting preferences persists them (verified by page reload).
    3. Tapping **GENERATE BRIEFING** copies text to the clipboard.
    4. Compiled text includes: "Tuna" under Expiring, "Rice" under Available, plus the Lemon/Olives overrides.
*   **Status**: 🔴 [RED] (Verification pending)

### 🟢 Phase 2: GREEN (Implementation)
*   **Status**: [PENDING]

---

## Iteration 66: Fridge Staples & Formatting Engine

### 🔴 Phase 1: RED (Requirement & Test)
**Goal**: Integrate user-defined "Fridge Staples" into the prompt engine, ensuring robust instant-catch memory persistence without explicit blur events. Enhance Authentic UI structural output with clean markdown.

**[TC-66.1] VERIFICATION: Fridge Staples Memory (generate-without-blur)**
*   **App Status**: Native Deployment
*   **Test Platform**: Playwright (Mobile)
*   **Conditions**: 
    1. Zero fridge staples logged. User types uncommitted text immediately prior to prompt generation.
*   **Expected Behavior**:
    1. System intercepts uncommitted text instantly upon tapping Generate.
    2. Output text strictly reflects alphabetical injection of custom staples.
*   **Status**: 🟢 [PASSING] (Playwright Suite Hardened)

### 🟢 Phase 2: GREEN (Implementation)
*   **Action**: Implemented `handleStaplesBlurInternal` interceptor within `recipes.tsx` to commit strings synchronously during `handleView()`.
*   **Status**: 🟢 [COMPLETED]

### ⚙️ Phase 3: REFACTOR (Refinement)
*   **Action**: Upgraded the Authentic Recipe Mode format to rigorously utilize structural markdown (Horizontal block dividers, italicized blockquotes).
*   **Action**: Required exclusion-based Shopping List compilation explicitly.
*   **Action**: Transformed Fallback search strings into dynamically structured Markdown URLs (`[Fallback URL](https://www.google.com/search?q=...)`).
*   **Status**: [COMPLETED]

---

## Iteration 73: The Strategic Squeeze (Cadet Evaluation)

### 🔴 Phase 1: RED (Requirement & Test)
**Goal**: Verify that the Cadet rank correctly enforces all tactical evaluation limits (2 Cabinets, 3 Categories, 12 Items) and that the "Graduate Early" flow properly transitions the user to the permanent Private rank with a custom confirmation modal.

**[TC-73.1] VERIFICATION: Cadet Evaluation Limits & Graduation (Web/Playwright)**
*   **App Status**: Web Deployment (Playwright)
*   **Conditions**: 
    1. New User (Cadet Rank).
    2. Zero categories, cabinets, and items.
*   **Expected Behavior**:
    1. **Onboarding**: Welcome Modal appears with correct 2/3/12/3 spec.
    2. **Scale Limits**:
        - Block 3rd Cabinet creation.
        - Block 4th Category creation.
        - Block 13th Item Type creation.
    3. **Freezer Limits**:
        - Limit to 1 Freezer Cabinet.
        - Limit to 3 Freezer-tracked Item Types.
    4. **Rank Promotion**:
        - Clicking Cadet badge navigates to Promotion Centre.
        - Tapping "GRADUATE EARLY" shows custom Tactical Modal (Confirm/Abort).
        - Confirming graduation immediately unlocks Private rank (6/6/24 scale).
*   **Status**: 🔴 [RED] (Test scripted, pending run)

### 🟢 Phase 2: GREEN (Implementation)
*   **Status**: [COMPLETED] (Logic implemented in BillingContext and Catalog)
