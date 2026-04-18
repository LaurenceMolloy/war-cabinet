# Specification: Barcode Logistics (Physical Scanning)

> **Status: ACTIVE**  
> **Tier: Sergeant** — Pure data-entry optimisation and physical logistics mapping.

## Strategic Overview
Rather than relying on complex (and potentially messy) AI-driven receipt parsing or external barcode databases that pollute the user's carefully curated taxonomy, War Cabinet relies on a "Memory-Mapped Barcode" system. 

The app starts with "amnesia." It learns exactly how your specific barcodes map to your specific taxonomy, ensuring zero data pollution while delivering lightning-fast data entry after the first scan.

---

## 1. The Database Reality (The Bridge Table)
A barcode does NOT map to an `ItemType`. A 415g tin of Heinz Beanz has a different barcode than a 200g tin of Heinz Beanz. 

Therefore, a barcode maps to a specific **Batch Profile** (Type + Supplier + Size). We handle this via a dedicated mapping table:

```sql
CREATE TABLE BarcodeSignatures (
  barcode TEXT PRIMARY KEY,
  item_type_id INTEGER NOT NULL,
  supplier TEXT,
  size TEXT,
  FOREIGN KEY(item_type_id) REFERENCES ItemTypes(id)
);
```

---

## 2. Workflow A: The Unknown Barcode (First Encounter)

1. **Scan Execution**: The user taps the "Scan" icon on the dashboard and scans a barcode.
2. **Lookup Miss**: The app checks `BarcodeSignatures` and finds no match.
3. **The Taxonomy Handshake (UI modal)**: 
   The app asks: *"Unknown Barcode. Link this to what item?"*
   It presents:
   - **Suggestion 1**: [Top Frequency ItemType]
   - **Suggestion 2**: [2nd Frequency ItemType]
   - **Suggestion 3**: [3rd Frequency ItemType]
   - **[+ SEARCH ALL]**
   - **[+ CREATE BRAND NEW ITEM TYPE]**
4. **The Invisible Memory Handoff**: The barcode string is held invisibly in the React state. The user completes the taxonomy step (e.g. creating the item and setting physical defaults). The app then instantly drops them into the standard `Add Batch` screen. The form auto-populates using the defaults they just set.
5. **The Double Commit**: The user confirms the actual expiry date and taps "SAVE". At that exact millisecond, the app executes two Database queries:
   - *Query A*: Insert the new record into the `Inventory` table.
   - *Query B*: Look at the invisible State memory. Since a barcode exists, insert a record into `BarcodeSignatures` linking the string to the newly finalised Type, Supplier, and Size.

---

## 3. Workflow B: The Known Barcode (Lightning Entry)

1. **Scan Execution**: User scans the exact same 415g Heinz tin two weeks later.
2. **Lookup Hit**: The app finds the signature in `BarcodeSignatures`.
3. **Ghost Loading**: The app immediately drops the user into the `Add Batch` screen with:
   - `ItemType` locked in.
   - `Supplier` pre-filled as "Heinz".
   - `Size` pre-filled as "415g".
4. **Action**: The user simply checks/amends the Expiry Date and taps Save.

---

## 4. Edge Cases & Corrections

- **Mismatched Maps**: A user might scan a 415g can but mistakenly enter "200g". If they correct this in the `Add Batch` screen *after* a ghost load, the app silently updates the `size` value for that barcode in the `BarcodeSignatures` table. The latest save always overwrites the signature.
- **Deletions**: If an `ItemType` is deleted, all `BarcodeSignatures` associated with its `item_type_id` must cascade delete.

---

## 5. Scenario Matrix (Mapping Outcomes)

Because the `barcode` string itself acts as the Primary Key mapping to a "Batch Signature", the logic resolves cleanly regardless of the existing state of the inventory:

**1. Completely New Item Type**
*The user scans a barcode for something they have never bought.*
*   **Result:** `Lookup Miss`. The Taxonomy modal opens.
*   **Action:** User taps `[+ CREATE BRAND NEW ITEM TYPE]`.
*   **Memory Handoff:** The user creates the Type and sets defaults. The UI navigates to `Add Batch`, auto-filling those new defaults. 
*   **Double Commit Outcome:** Upon tapping "SAVE BATCH", the Inventory is generated, and the barcode is forever linked to this brand new taxonomy node in the `BarcodeSignatures` bridge table.

**2. Item Type Exists, but No Active Batches**
*The user manually created "Paprika" weeks ago but never bought it, or they bought it, tracked it, consumed it, and it hit zero.*
*   **Result (First Time Scan):** `Lookup Miss`. User links the barcode to "Paprika" and enters size/brand. 
*   **Result (If previously scanned weeks ago):** `Lookup Hit`. Ghost loads into Add Batch with the exact size and brand they used previously, ready for an expiry date.

**3. Item Type Exists, with active batches of a DIFFERENT Size/Brand**
*User has 415g Heinz Beanz in inventory. They scan a 200g Tesco Beanz tin.*
*   **Result:** `Lookup Miss` (because the 200g EAN is mathematically different to the 415g EAN).
*   **Action:** Modal opens. User links it to "Baked Beans", enters "Tesco", enters "200g".
*   **Outcome:** The database now has *two* barcodes pointing to the "Baked Beans" Type ID, but each barcode pre-fills different Supplier/Size profiles.

**4. Item Type Exists, with active batches of the SAME Size/Brand**
*   **Result:** If they have scanned that exact product before, it's a `Lookup Hit` and Ghost Loads instantly. If they previously entered it manually without a scan, the system asks them to link it once, and then remembers it forever.

---

## 6. Format Compatibility

**QR Codes & 2D Matrices**
Because the system has complete "amnesia" and does not query external API endpoints (like OpenFoodFacts), the schema treats *any extracted string* as a valid signature. Therefore, a generic marketing QR code (e.g., `https://heinz.com/1283`) acts identically to a 1D barcode. It's just a text string in the schema. (*Note: High-density QR codes require mobile-hardware autofocus to resolve, laptop fixed-focus lenses will generally fail to resolve them*).

**Retailer Markdown (Yellow Stickers)**
If a user scans an internal supermarket markdown sticker, the scanner will extract the variable-measure string (e.g. `020456100806`). 
*   This does NOT break the item taxonomy. The user simply maps the string to their existing Item Type. 
*   If the supermarket uses static internal IDs for markdowns, it becomes a permanent shortcut mapping. If the string is purely transient (embedding a unique price variation), it will prompt a manual link each time, guaranteeing zero database pollution.
