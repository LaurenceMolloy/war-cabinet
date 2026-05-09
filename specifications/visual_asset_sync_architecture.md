# Visual Asset Sync Architecture (Out-of-Band Media Sync)

## 1. Core Philosophy: Decoupled Sync Streams
The system fundamentally separates textual data (`database.json`) from binary visual data (`.jpg` files).
Because atomic DAL updates cause the text database to be backed up rapidly (potentially dozens of times an hour), embedding images directly into the backup stream or zipping them on every save is prohibited due to bandwidth, battery, and compute overhead.

**The Solution:**
- **The Brains (Text Sync):** The text database backs up instantly via JSON as per the existing PGR Rule #7 protocol.
- **The Visuals (Delta Sync):** Images are stored permanently in local `DocumentDirectory/images/` and individually uploaded to a Google Drive `Images/` folder upon capture.

## 2. Asset Purgatory: The 7-Day Grace Period
To solve the "Referential Integrity Nightmare" (where restoring an old Bunker backup crashes because it asks for an image that was subsequently deleted), the system implements a strict 7-day "Soft Delete" policy for both local and cloud files.

**The Implementation (`AssetDeletionsCache`):**
A dedicated SQLite table acts as the single source of truth for file lifecycles:
`[ id | filename (TEXT) | asset_type (TEXT) | deleted_timestamp (INTEGER) ]`

**The Lifecycle Flow:**
1. **Deletion Triggered:** When a user deletes a catalog item or replaces an image, the file is **NOT** physically deleted from the phone or Google Drive. Instead, a row is inserted into `AssetDeletionsCache` with the current timestamp.
2. **The Garbage Collector (GC):** A background service periodically queries: `SELECT * FROM AssetDeletionsCache WHERE deleted_timestamp < [7 Days Ago]`.
3. **The Execution:** If the 7-day grace period has expired, the file is physically deleted from local storage, a `DELETE` API call is sent to Google Drive, and the row is removed from the purgatory table.

**Auto-Healing Restores:**
If the user restores an older database backup (e.g., reverting a testing mistake), the older database overwrites the current one. This wipes the `AssetDeletionsCache` clean, instantly removing the deletion countdown for any protected images and restoring them to "Active" status.

## 3. The Delta-Sync Restore Protocol
When a user requests a database restore (e.g., returning to a "Bunker" state), the app does not blindly download a massive `.zip` file of images.

1. **Text Reversion:** The `database.json` is applied instantly. The app is fully operational.
2. **Local Delta Check:** A background thread scans every `image_uri` in the newly restored active database. It checks `FileSystem.getInfoAsync` for each file.
3. **Targeted Download:** If the file is already on the phone (which is true 99% of the time during local testing reverts), zero network data is consumed. If the file is missing (e.g., app reinstall or new device), the app makes a targeted Google Drive API request to download *only* that specific missing image in the background.

## 4. Graceful UX Degradation (The "Fog of War" Fallback)
Because image restoration is non-blocking and happens in the background, the user may navigate to an item before its visual asset has finished downloading.

To prevent crashes or visual lag:
1. The UI relies on React Native's `<Image>` or `<SvgImage>` component's built-in `onError` event handler.
2. If the app attempts to render a local file path that hasn't arrived yet, the `onError` event fires instantly.
3. The UI catches this and updates a local component state (e.g., `setImageFailed(true)`).
4. **Silent Fallback:** The UI gracefully degrades to the default Text-Only layout (restoring Brand, Range, and Expiry dividers) completely silently. No spinners, no broken icons, no alert dialogues.
5. The next time the user opens that item, if the background download has completed, the visual profile will render seamlessly.
