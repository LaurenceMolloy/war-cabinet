# Mobile Testing Strategy: War Cabinet

To maintain high development velocity while managing EAS build credits, use the following tiered testing strategy.

## ⚡ Tier 1: Iterative Development (Fastest)
**Goal:** Test UI changes, logic, and data flow instantly.

*   **Tool:** **Development Client (Custom APK)**
*   **Method:**
    1.  Build a "Development Client" shell one time: `npx eas build --profile development --platform android`.
    2.  Install this APK on your physical device.
    3.  Run `npx expo start` on your laptop.
    4.  The Dev Client shell connects to your laptop via Wi-Fi and provides **Live-Reload**.
*   **Benefit:** Zero build credits used after the first shell is built. Updates appear in ~1 second.

## 🧪 Tier 2: Deployment Sanity Check (Slower)
**Goal:** Verify the app as it will appear to final users.

*   **Tool:** **Preview Build (`--profile preview`)**
*   **Method:** `npx eas build --profile preview --platform android`.
*   **Usage:** Only run this when you want a standalone APK for external testing or a final pre-submission audit.
*   **Cost:** Uses 1 EAS credit per build.

## 🖥️ Tier 3: Unlimited Scaling (Local Builds)
**Goal:** Circumvent EAS credit limits entirely.

*   **Tool:** **Local EAS CLI**
*   **Requirement:** Android Studio, JDK 17, and Environment Variables (`ANDROID_HOME`, `JAVA_HOME`) configured on your laptop.
*   **Method:** `npx eas build --platform android --local`.
*   **Benefit:** Zero cost, zero limits. Uses your laptop's CPU to compile the binary.

---

## 🛡️ Troubleshooting Version Mismatches
If you encounter the message *"Project is incompatible with this version of Expo Go"*:

1.  **Cause:** You are likely using a Bleeding-Edge/Canary SDK (like SDK 55) that the standard Expo Go app hasn't caught up to yet.
2.  **Fix:** Do not use Expo Go. Use the **Development Client** (Tier 1) built specifically for your project's SDK. This ensures the phone and the laptop are always in sync.
