# Emergency Reversion & Loss Manifest
**Date**: 2026-04-26  
**Context**: Reverting to Git state from ~8 PM April 25th following architectural overreach (aborted DAL refactor).

## 1. Marketing Material Status
The marketing materials were successfully transitioned to a "Subtle-Sell" narrative focused on **Household Logistics & Resilience**.

### Intent & Tone:
- **Core Hook**: "In a world where prices shift and supply isn’t always predictable, staying organised at home matters more than ever."
- **Key Benefit**: **Signal-Independent Logistics** (Selling the "Offline-First" nature for rural/black-spot users).
- **Naming Convention**: Preserved the **Private / Sergeant / General** rank hierarchy while updating the descriptions to be less "aggressive".

### Files Modified (To be preserved/restored):
USER COMMENT: this has been preserved
- **`marketing_materials/pricing_tiers.html`**: Completely redesigned A4 marketing asset with the new tone and £4.99/£2.49 pricing.


---

## 2. Adjustments Made (Since 8 PM April 25th)
The following fixes were implemented after the last git commit and will be LOST during the reversion. They should be manually re-applied:

### [A] BillingContext Recovery (CRITICAL)
USER COMMENT: deleted this as I have just reverted to last commit. Simply amend descriptive text to better fit with the new narratives in the pricing_tiers.html but DO NOT TOUCH THE MILITARY RANKS - we want to keep the theme just tone donw the wording around that. 


### [B] Rank Name Restoration
USER COMMENT: see above - reversion removes the need to worry about this


### [C] Offline-First Branding (Page 0)
- **Adjustment**: Added the `broadcast-off` icon and explicit "Works in garages & rural black spots" copy to the onboarding flow.
- **Action**: Re-verify Page 0 icons and text in `mobile/src/app/index.tsx` (or onboarding component).


### [D] Google Drive Native SDK Migration (FIXED)
- **Problem**: Encountered `TypeError: saveTokens is not a function` during cloud sync.
- **Fix**: Replaced the faulty manual token persistence logic with the **`@react-native-google-signin/google-signin`** Native SDK. 
- **Change**: Tokens are now managed natively. `GoogleDriveService.ts` was simplified to remove `saveTokens`, and `catalog.tsx` was updated to use `GoogleSignin.getTokens()`.
- **Action**: After reversion, ensure `catalog.tsx` doesn't attempt to call `saveTokens` and that the `GoogleSignin` native implementation is preserved.


### [E] Manual Entry Failsafes (Vanguard & Anomalies)
- **Adjustment**: Integrated the **Storage Anomaly Guardrail** and **Location Conflict Modal** into the manual batch addition flow (`handleSave` in `add.tsx`).
- **Benefit**: The app now challenges the user if they try to place a freezer-grade item in a standard cabinet (or vice-versa) during manual entry, just as it does for scanning.
- **Action**: Verify `add.tsx` around line 780+ for the conflict and anomaly logic.
USER COMMENT: what about adding an item to a cabinet that it hasn't previously been added to (this is not just about freezer vs non-freezer).BTW - check that this hasn't already been done before doing anything.

---

## 3. Today's "Lost" Logic (ABORTED)

The following work is NOT to be attempted AT ALL. It is OUT OF SCOPE. Do not be tempted to address it. Attempting to do this in an unauthrosed fashion is what has got us to this place and we do not wish to return there.

- **Item Type Cabinet Inference**: Automatically setting the default cabinet for new item types in `add.tsx`. We discussed this but the user didn't ask for any changes and doesn't want any right now.

- **DAL Extraction**: The creation of `src/database/ItemTypes.ts` and `src/database/Categories.ts` (and the corresponding `proactiveBackupProtocol` integration). We have tackled this for cabinets already as a PoC for a fuller code refactor but the green light has NOT been given to go further just now. The user needs to perform more tests before they are happy to do so.

