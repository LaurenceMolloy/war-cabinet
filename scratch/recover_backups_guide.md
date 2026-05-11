# Guide: Tactical Cloud Backup Extraction

This utility allows you to manually recover your War Cabinet inventory snapshots from the hidden Google Drive Application Data folder. This is useful for auditing backups on a PC or as a fail-safe recovery method.

## Prerequisites
1. **Python 3.x** installed on your laptop.
2. Install the Google API client libraries:
   ```bash
   pip install google-auth-oauthlib google-api-python-client
   ```

## Setup: Obtaining your "Keys to the Bunker"
Because the app's data is private, you must create your own "Desktop App" credential in the Google Cloud Console to access it:

1.  **Go to GCloud:** Log in to the [Google Cloud Console](https://console.cloud.google.com/).
2.  **New Project:** Create a new project (e.g., "Bunker-Extractor").
3.  **Enable API:** Search for **"Google Drive API"** and click **Enable**.
4.  **Consent Screen:** 
    *   Go to **APIs & Services** > **OAuth consent screen**.
    *   Choose **User Type: External**.
    *   Fill in the App Name (e.g., "Bunker Extractor") and your email.
    *   **CRITICAL:** Under "Test users", add your own Google email address.
5.  **Create Credentials:**
    *   Go to **Credentials** > **Create Credentials** > **OAuth client ID**.
    *   Select **Application type: Desktop App**.
    *   Name it "Bunker Extractor Keys".
    *   Click **Download JSON** on the right side of the new credential.
6.  **Place the Key:** Rename the downloaded file to `credentials.json` and move it into this `scratch/` folder.

## Execution
1. Open your terminal in this directory.
2. Run the script:
   ```bash
   python recover_backups.py
   ```
3. A browser window will open. Sign in with your Google account.
4. **Safety Warning:** You will likely see a "Google hasn't verified this app" warning. Click **Advanced** > **Go to Bunker-Extractor (unsafe)**. This is normal for a private script.
5. Click **Allow**.

## Result
The script will create a folder named `recovered_backups/` and download all `.json` snapshots found in your hidden cloud storage.
