# Cloud Backup Specification (Google Drive Integration)

## 1. Overview
This specification details the implementation of automated, cloud-based data backups for the War Cabinet application. To adhere to the project's offline-first ethos, this feature operates as an "opt-in" failsafe that piggybacks on the existing local JSON backup ecosystem, rather than introducing a siloed cloud synchronization state.

## 2. Answers to Outstanding Design Questions

* **On Encryption & Restoration Code Reuse:** 
My previous reference to "encrypted copies" was specifically regarding transit and Google Drive's native at-rest encryption. To guarantee 100% reuse of the existing local restoration logic, the file should be uploaded as the exact same plain JSON structure used for the in-app backups. The retrieval flow will simply fetch the JSON from the cloud, store it temporarily in memory, and pass it directly into the existing local restore script. No new database ingestion flow will be built. 

* **On "Snapshot Now" Behavior:**
When a user explicitly presses the "Snapshot Now" button, the system should **always** trigger the cloud upload, bypassing the schedule threshold limit entirely. A manual interaction strongly indicates the user has just performed critical data entry and wants an immediate, forceful guarantee that it is safe across all mediums, regardless of when it last synced automatically.

## 3. UI and User Experience

### Opt-In Consent
The feature defaults to `Off`. Tapping the toggle triggers a mandatory consent warning:
> **Warning: Automated Cloud Backup** 
> Enabling this will automatically send copies of your data to Google Drive on a schedule. Your data will leave this device. If you prefer manual control, keep this disabled and use the 'Manual Share' option.
> `[Cancel]` `[Enable & Login]`

### Telemetry Dashboard
A "Cloud Status" block near the settings toggle will display:
* **Account:** Connected (`user@gmail.com`) / Disconnected
* **Target:** Daily / Weekly / Monthly
* **Last Successful Sync:** `YYYY-MM-DD HH:MM`
* **Last Status:** Success / Failed (Auth Error) / Failed (Network Error)

## 4. Architectural Logic Flow

The integration avoids standalone cron jobs by attaching to the existing internal application snapshot pipeline.

**Execution Order:**
1. **Extraction:** SQLite database is queried and parsed into the standard JSON string format.
   * *Halt Check:* Abort everything if DB extraction fails.
2. **In-App Backup:** JSON written to secure app storage layer. (Wrapped in independent Try/Catch)
3. **Device Mirror:** JSON written to user-accessible device storage. (Wrapped in independent Try/Catch)
4. **Cloud Hook (The Failsafe):** 
   * Check if Cloud Backup is Enabled.
   * Check if `Date.now() > lastSuccessfulDriveSync + scheduleThreshold`, OR if the trigger was purely manual via "Snapshot Now".
   * If True: Upload the exact JSON payload generated in Step 1 to Google Drive.

## 5. Google Drive Integration Details

* **Storage Location (Friction-Free Migration):** The app will strictly use a fixed, programmatic directory (such as the Drive API's `appDataFolder`). It will **never** ask the user to manually select or create a folder. This deterministic approach ensures that if a user installs the app on a new phone and authorizes Google Drive, the app will instantly locate the existing backup chain and facilitate a seamless, zero-friction device migration.
* **Authentication:** Requests Offline Access during OAuth to secure a long-lived `refresh_token`, stored locally in `SecureStore`.
* **Naming Convention:** Filenames use ISO 8601 timestamps (e.g., `war-cabinet-backup-20260421T143000.json`).
* **5-Backup Rolling Window:**
  During step 4, after a successful upload, the application queries the Google Drive app data folder. It sorts files by creation date. If the array length exceeds 5, all files from index 5 onward (the oldest) are targeted and deleted via the Drive API to prevent quota bloat.

---

## 6. Codebase Blast Radius Assessment

Integrating this feature will require surgically modifying specific areas of the application. Here is the anticipated blast radius and justification:

### Proposed Changes

1. **The Snapshot / Backup Worker Logic (Core)**
   * **Change:** Inject an async call at the very end of the existing snapshot function. Wrap it in a non-blocking `try/catch` so its failure does not derail the prior local backups.
   * **Why:** This is the nexus of data extraction. Keeping the cloud upload attached to the end of this pipeline guarantees data symmetry across all backup locations.

2. **`SecureStore` / Auth Storage Layer**
   * **Change:** Add secure key-value pairs for `google_refresh_token` and standard local storage for `cloud_sync_preferences` (Schedule setting, LastSyncDate metric).
   * **Why:** Standard state/AsyncStorage is notoriously insecure for long-lived OAuth tokens.

3. **`Settings`/`Configuration` UI (UI Layer)**
   * **Change:** Add the UI toggle, consent modal, telemetry text blocks, and OAuth sign-in/sign-out flow triggers.
   * **Why:** To give the user a transparent interface to authorize the application and verify sync history.

4. **The Restoration UI / Logic (Core)**
   * **Change:** Add UI to select the "Google Drive" source, and a function to fetch the API blob. Once fetched into memory, pass the blob into the identical, existing local `restore` function.
   * **Why:** Bypasses rebuilding complicated DB drop/re-ingest SQL statements.

### Risk Level: LOW
Because we are modifying the very *end* of an existing outbound data pipeline, the risk of breaking current core functionality is incredibly minor. The most "dangerous" element of this feature is simply ensuring the package dependencies for OAuth and Google Drive APIs do not cause build conflicts with the existing React Native / Expo environment.
