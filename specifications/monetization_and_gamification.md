# Monetization & Gamification Strategy: "Basic Training"

## 1. Tactical Pricing Tiers (Price Discovery)
To validate product-market fit and ensure early momentum, the **Sergeant Tier** will be deployed in three progressive "Tranches."

| Phase | Designation | Price | Inventory Limit | Target |
| :--- | :--- | :--- | :--- | :--- |
| **Tranche 1** | **Reconnaissance Force** | **£3.99** | 100 Slots | Validation & Early Intel |
| **Tranche 2** | **Company Advance** | **£4.99** | 100 Slots | Momentum & Optimization |
| **Tranche 3** | **Standard Issue** | **£5.99** | Unlimited | Permanent Deployment |

### Execution Logic:
*   **Manual Propagation:** Prices will be manually updated in the Google Play Console upon hitting sale targets.
*   **Themed Scarcity:** Marketing copy will explicitly state "Only X Recon slots remaining" to drive urgency.
*   **Grandfather Clause:** Early adopters (Recon/Company) lock in their price for life.

---

## 2. Gamified Onboarding: "Bootcamp Missions"
To ensure users explore all clinical and logistical features, we replace the standard "Trial" with **Operational Challenges**.

### Mission List (Basic Training):
1.  **Mission: Inventory Alpha** — Create a new Cabinet.
2.  **Mission: Intelligence Scan** — Scan a barcode to identify an Item Type.
3.  **Mission: Surveillance** — Use the OCR scanner to log an expiry date.
4.  **Mission: Medical Clearance** — Configure a Medical Guideline or Health Goal.
5.  **Mission: Mess Hall Deployment** — Generate a recipe using expiring stock.
6.  **Mission: Field Recruitment** — Share the app with a contact via the Recruitment portal.

### Reward Structure:
*   **50% Completion (Field Promotion):** Unlocks 7 days of full Sergeant Access.
*   **100% Completion (Veteran Status):** Unlocks 1 month of full Sergeant Access.

---

## 3. Growth Protocol: "Field Recruitment"
Users can recruit new Sergeants to the app using the native OS Share Sheet.

*   **Mechanism:** Native `Share` API (zero permissions required).
*   **Theme:** "RECRUIT NEW SERGEANT" button in Settings.
*   **Payload:** A pre-written, themed text message with the Play Store link.
*   **Incentive:** Completion of "Field Recruitment" is a required mission for the 1-month reward.

---

## 4. Anti-Abuse & Security ("The Cheater Problem")
To prevent users from simply uninstalling and reinstalling to reset trials.

### Multi-Layered Defense:
1.  **SecureStore (Keychain):** Store a persistent flag (`training_phase_completed`) using `expo-secure-store`. This often persists across uninstalls on iOS and certain Android versions.
2.  **Database Signature:** If a user restores a cloud backup, the DB contains their original "Installation Date." The app checks this to see if they are a returning user.
3.  **Device Fingerprinting:** Use `expo-device` to log a unique ID locally.

### The "Indie Reality" Philosophy:
*   **Focus on the 95%:** Most users will not go through the effort of wiping their phone or manually editing SQLite files to save £3.99.
*   **Generosity over DRM:** It is better to allow a few "cheaters" to use the app for free than to build a rigid, buggy DRM system that locks out legitimate users. A happy free user is still a potential referral source.

---

## 5. Technical Implementation Notes
*   **Database:** Create a `Missions` table in SQLite to track completion status.
*   **UI:** A "Readiness Meter" on the Home Screen showing the percentage toward the next Promotion.
*   **State:** Use a global `isSergeantActive()` helper that checks both `isPaid` and `promotionExpiryDate`.
