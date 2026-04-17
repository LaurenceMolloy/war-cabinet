# Beta Distribution Protection (BDP) — Specification

## Objective
To provide a secure, time-limited distribution model for side-loaded APKs, ensuring that beta versions "self-destruct" after a specific period or can be remotely disabled in the event of a leak.

---

## 1. Layer 1: The Hardcoded Time-Bomb (Local)

This is the primary offline defense. It ensures that the app becomes unusable after a fixed date, regardless of connectivity.

*   **Mechanism**: A `const BETA_EXPIRY_DATE` is set in the root `BillingContext.tsx`.
*   **Logic**: 
    ```typescript
    const isExpired = new Date() > new Date(BETA_EXPIRY_DATE);
    ```
*   **Action**: If `isExpired` is true, the app replaces the main navigation with a `BetaExpiredScreen`.
*   **Bypass Prevention**: While a user can change their phone's system clock, this is a "High Friction" action that breaks SSL and other apps, making it an effective deterrent for standard users.

---

## 2. Layer 2: The Remote Kill-Switch (Online)

This provides "Real-Time" control if an APK is leaked onto a public forum.

*   **Mechanism**: The app performs an asynchronous `fetch()` to a static JSON file hosted on a public URL (e.g., GitHub Gist or Vercel).
*   **The Payload**: 
    ```json
    {
      "status": "active",
      "latest_beta_version": "1.0.4",
      "kill_message": "This beta version has been retired. Please visit war-cabinet.com for the official release."
    }
    ```
*   **Action**: If `status` is set to `revoked`, the app immediately locks, even if the local `BETA_EXPIRY_DATE` hasn't been reached yet.

---

## 3. Layer 3: Build Obfuscation (The Shield)

To prevent users from simply "deleting" the expiry code from the APK, we use the standard Android **R8/ProGuard** shrinker.

*   **Implementation**: Enable `minifyEnabled true` in the `app/build.gradle` (standard for Expo production builds).
*   **Outcome**: The code is "scrambled." Any attempt to find the expiry logic will reveal meaningless variable names like `a.b.c(d)`, making it significantly harder to "patch" the APK.

---

## 4. UI/UX: The Beta Transition Screen

When a beta expires or is revoked, the user should be met with a "Soft Landing" rather than a crash:

1.  **The Message**: "Tactical Mission Over. This beta has reached its target date."
2.  **The Call to Action**: A link to the official Store listing or an email signup for the production launch.
3.  **Data Export**: Allow the user one final "Backup" of their SQLite data so they can migrate their inventory to the official version later.

---

## 5. Deployment Protocol

1.  **Define Date**: Set `BETA_EXPIRY_DATE` to `+30 days` from today.
2.  **Verify Remote**: Ensure the Remote Kill-Switch URL is live and returning `{ "status": "active" }`.
3.  **Build**: Run `npx expo run:android --variant release`.
4.  **Distribute**: Send the resulting APK via a private link.
