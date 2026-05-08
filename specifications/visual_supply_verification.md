# Specification: Visual Supply Verification (Product & Batch Photos)

## 1. Overview
The **Visual Supply Verification** system provides a high-fidelity visual layer to the War Cabinet inventory. By capturing low-resolution reference photos, users can instantly identify stock during high-velocity audits, reducing cognitive load and error rates.

## 2. Tier Placement
*   **Rank: Sergeant (Logistical Authority)**
*   Rationale: This is a professional-tier tool for "Quartermasters" managing high volumes where visual cues are faster than reading labels.

## 3. User Entry Workflow

### 3.1. Catalog Level (Item Type)
*   **Trigger**: In the "Add New Product" or "Edit Product" modal.
*   **Action**: A camera/gallery icon button allows the user to capture a "Generic Reference Photo."
*   **UX**: 
    *   Optional field.
    *   Square-cropped preview once captured.
    *   Ability to retake or delete.
*   **Goal**: Create a default visual identity for the product (e.g., "Kellogg's Corn Flakes 500g Box").

### 3.2. Inventory Level (Batch)
*   **Trigger**: In the "Add Batch" or "Quick Intake" flow.
*   **Action**: Toggle to "Add Batch-Specific Photo."
*   **UX**: 
    *   Inherits the Catalog Photo by default (visible as a ghosted preview).
    *   User can override with a batch-specific photo (useful for packaging changes, limited editions, or bespoke items).
*   **Goal**: Provide surgical precision for specific stock units.

## 4. Display Logic & UI Integration

### 4.1. The Inventory Card (Clean UX)
*   **Principle**: Keep the list view lean. Do NOT show full images by default.
*   **Implementation**: 
    *   If a photo exists (Batch or Item), a small **"Eye" or "Image" icon** appears in the bottom row of the item card (next to the location/quantity).
    *   **Interaction**: Tapping the icon opens a **Tactical Preview Overlay** (centered modal or pop-over) showing the photo + core specs (Brand, Size, Expiry).
    *   Dismiss by tapping anywhere.

### 4.2. The Swipe Audit (Primary Use Case)
*   **Context**: The upcoming "Cabinet Audit" feature where users swipe through stock to confirm quantities.
*   **Implementation**: 
    *   The "Active Card" in the audit stack prominently displays the photo (taking up ~40% of the card height).
    *   **Value**: Instant recognition. "I am looking for *this* box."

### 4.3. Resupply & Shopping Lists
*   **Context**: When a product is flagged for resupply.
*   **Value**: Showing the photo on the shopping list ensures the shopper (who might not be the primary user) buys the EXACT right item/brand.

## 5. Technical Specifications

### 5.1. Image Processing (The "Low-Res" Rule)
To prevent storage bloat, all images MUST be processed before saving:
*   **Resolution**: Resized to exactly **300px x 300px** (1:1 aspect ratio).
*   **Compression**: JPEG compression at **20-30% quality**.
*   **Target Size**: **< 25KB** per image.
*   **Dependencies**: `expo-image-picker` (Selection), `expo-image-manipulator` (Processing).

### 5.2. Database Schema
*   **Table `ItemTypes`**: Add column `image_uri TEXT` (Nullable).
*   **Table `Inventory`**: Add column `image_uri TEXT` (Nullable).

### 5.3. Fallback Logic (The Hierarchy of Sight)
When requesting an image for a specific Batch:
1.  Check `Inventory.image_uri` (Batch-specific).
2.  If null, check `ItemTypes.image_uri` (Product-generic).
3.  If both null, show **Tactical Icon Placeholder** (e.g., MaterialCommunityIcons 'package-variant').

### 5.4. Storage & Self-Healing Strategy
*   **Location**: Images are stored in the app's **DocumentDirectory** (private internal storage).
*   **Persistence**: Images survive app updates but are lost if the app is uninstalled without a backup.
*   **Self-Healing UI**: If the `image_uri` points to a non-existent file (e.g., after a database restore without image assets), the app MUST NOT crash or show a broken link. It will gracefully degrade to the **Tactical Icon Placeholder**. This ensures the inventory remains 100% functional even if the visual library is lost.
*   **Filenames**: Deterministic naming pattern: `img_type_{id}.jpg` or `img_inv_{id}.jpg`.

## 5.5. Visual Library Sync (Off-Device Mirroring)
To ensure the visual library survives hardware upgrades and device failures, images must be mirrored to the secure cloud vault:
*   **Sergeant Tier (Manual)**: One-time "Visual Snapshot" that bundles current images into the manual cloud backup (manual trigger).
*   **General Tier (Automated)**: Real-time "Rolling Mirror" that automatically pushes new low-res captures to a dedicated `images/` folder in the user's Google Drive.
*   **Data Efficiency**: Due to the **<25KB** constraint, a library of 1,000 items totals only ~25MB, making cloud synchronization extremely fast and battery-efficient.

## 6. Future Enhancements
*   **OCR Synergy**: Use the captured photo to re-run OCR if the initial scan was blurry.
*   **AI Auto-Tagging**: Detect brand/color from the photo to auto-fill metadata.
*   **Gallery View**: A visual "Bunker Gallery" to scroll through all supply packaging.
