# [POC RULES OF ENGAGEMENT]
> **CRITICAL:** This entire protocol must be developed as a **STANDALONE PoC TOOL**. 
> 1. **Zero Contamination:** DO NOT touch or modify any existing app code in `src/app`, `src/components`, or `src/services`.
> 2. **Carbon Copy DAL:** Create a dedicated folder `src/poc/voice_intel/` and carbon-copy the necessary DAL/Database files there.
> 3. **No Mutations:** If a change is needed to a DAL function, create a replica with a `_poc` suffix (e.g., `getInventory_poc`). 
> 4. **Commentary:** All `_poc` changes must be clearly commented with the rationale for future integration.
> 5. **Git Integrity:** Existing app files must remain unchanged in the git history during the PoC phase.

# Specification: Tactical Voice Intel Protocol (TVIP)

## 1. Overview
The **Tactical Voice Intel Protocol (TVIP)** is a hands-free, offline-first voice interaction layer designed for the "War Cabinet" reconnaissance and audit missions. It enables users to perform inventory audits in challenging physical environments (e.g., up a ladder, low light, or with hands full) without requiring physical interaction with the device.

## 2. Hardware Target: "The A21s Standard"
The system is optimized for entry-level mobile hardware (benchmarked on the Galaxy A21s). 
- **Offline Priority:** Zero dependency on Wi-Fi or Cellular data.
- **CPU Efficiency:** Uses "Low-Compute" signal processing to prevent thermal throttling or battery drain on budget octa-core chips.
- **Battery Optimization:** Manual engagement/disengagement to prevent continuous background microphone usage.

## 3. The "Bunker-Ready" Stack
- **Audio Output (TTS):** Uses `expo-speech` to tap into native OS Text-to-Speech engines.
- **Audio Input (STT):** Uses native OS Speech-to-Text (requires one-time offline language pack download).
- **Fallback Input:** Simple "Syllable Pulse" detection using `expo-av` metering (Energy Envelope analysis) for 1-syllable (Found) vs 3-syllable (MIA) distinctions.

## 4. Operational Protocols

### 4.1 Engagement (The "On" Switch)
- **Manual Trigger Only:** To ensure user privacy and battery longevity, voice listening must be manually engaged.
- **Trigger:** Giant "ENGAGE VOICE INTEL" UI button or physical Volume Key sequence.
- **Confirmation:** Low-latency audio chime + TTS: *"Voice Intel Active. Standing by."*

### 4.2 Verbal Framing ("Check... Go")
To reject background noise, chatter, and mechanical clanging, all verbal commands must be framed by anchor words.
- **Syntax:** `[WAKE WORD] + [PAYLOAD] + [TRIGGER WORD]`
- **Default Framing:** `"Check... [Command]... Go!"`

### 4.3 Command Vocabulary
| Command | Payload Examples | App Response |
| :--- | :--- | :--- |
| **Audit/Search** | `"Check... Tomato Soup... Go!"` | Trigger **Confidence Triage** (see Section 5). |
| **Verification** | `"Affirmative"` or `"Yes"` | Resets item staleness; moves to next target. |
| **Casualty** | `"Negative"` or `"MIA"` | Marks item for deletion; records in Casualty Report. |
| **Relocation** | `"Check... Relocate... Go!"` | Updates `cabinet_id` to current sector. |
| **Status** | `"Check... Status... Go!"` | App speaks remaining batch count in current sector. |
| **Secure** | `"Check... Secure... Go!"` | Disengages microphone; speaks session summary. |

## 5. Confidence Triage & Staged Search
To maintain high reliability on budget hardware (A21s) without Wi-Fi, the app uses a multi-tier search strategy:

### 5.1 Ring 1: Local Sector (High Priority)
- **Scope:** Items expected in the current cabinet.
- **Logic:** Fast, low-confusion vocabulary.
- **Match Requirement:** >70% confidence.

### 5.2 Ring 2: Global Catalog (Fallback)
- **Scope:** All `ItemTypes` ever logged in the user's Master Catalog.
- **Use Case:** Items that have been moved to this cabinet but not yet logged here.
- **App Response:** *"Match found in [Original Cabinet]. Relocate to current sector?"*

### 5.3 Ring 3: Field Memo (The Safety Valve)
- **Scope:** "Unidentified Assets" (Case: Brand new item or transcription failure).
- **Logic:** If confidence is <50% across all rings, the app does not attempt automated addition.
- **App Response:** *"Target unknown. Intelligence captured as Field Memo."*
- **HQ Workflow:** The item name, best-guess text, and a timestamp are added to a "New Intel" queue. The user can perform a "Single-Click Authorization" at HQ later to finalize the entry.

## 6. Handling Intelligence "Drift"
When the physical reality differs from the digital ledger:
- **Quantity Drift:** *"Ledger says 4 units. Finding matches?"* -> User: *"Negative... 6... Go!"* -> App flags for bulk update.
- **Expiry Drift:** *"Ledger says 2026. Correct?"* -> User: *"Negative... 2028... Go!"* -> App flags for batch correction.

## 7. Interaction Modes

### 5.1 App-Led (Quartermaster Briefing)
The app leads the audit, announcing targets one by one.
- **App:** "Target 1: Heinz Beanz. Status?" [Beep]
- **User:** "Found."
- **App:** "Acknowledged. Target 2..."

### 5.2 User-Led (Commander Recognition)
The user calls out items as they find them.
- **User:** "Check... Tuna Chunks... Go!"
- **App:** "Match: John West 4-pack. Expiry 2027. Correct?"
- **User:** "Affirmative."

## 6. Error Handling & Ergonomics
- **Timeout:** If "Check" is heard but no "Go" follows within 5 seconds, the buffer is discarded.
- **Collision:** If multiple batches match a name, the app speaks a list: *"Multiple matches. Is it the 2026 or 2027 batch?"*
- **Audio Cues:** Use high-contrast frequencies (Blips/Chirps) to signal when the microphone is active vs. processing.
- **Confirmation Loop:** All critical data changes (deletions) require a second verbal confirmation.

## 7. Configuration Requirements
- **Noise Floor:** User-adjustable sensitivity threshold to account for different environments (e.g., "Silent Pantry" vs. "Noisy Garage").
- **Intel Pack:** Initial setup guide instructs user on downloading the Android/iOS Offline Speech recognition data.
