# Tactical Voice Intel Protocol (TVIP) - As-Built Spec v1.0

## 1. The Tactical Handshake (State Machine)
The interaction follows a strict "Passive-to-Active" handshake to preserve battery and filter background noise.

| Phase | Trigger | App Response | State |
| :---  | :---    | :---         | :--- |
| **Standby** | Button Press | UI: "READY" (Sector Selected) | Listening (Passive) |
| **Wake** | User says "CHECK" (Interim) | **"Got it"** + 100ms Vibration | Listening (Active) |
| **Mission**  | Verbal Payload | Real-time "Acoustic Stream" UI | Recording |
| **Sign-off** | User says "OVER" (Interim) | **[Product Name]** + Double Vibration | Processing / Mic OFF |
| **Recovery** | Processing Done | UI: Results List (Expanded) | Standby |

## 2. Lexical Snapping (Normalization)
To bridge the gap between "Open Vocabulary" speech engines and the "Closed Vocabulary" of the catalog.

### 2.1 The Tactical Vocabulary
The "Snapper" builds its knowledge base on mount from:
- `ItemTypes.name` (Unique full strings)
- `ItemTypes.default_supplier` (Unique brands)
- **Atomization:** All individual words from the above (tokens > 2 chars).

### 2.2 Snapping Rules (Levenshtein Distance)
We apply **Adaptive Sensitivity** to prevent "Ghost Matches":
- **Short Tokens (≤ 4 chars):** Max 1 edit allowed (e.g., `pee` -> `pea`).
- **Long Tokens (> 4 chars):** Max 2 edits allowed (e.g., `cambels` -> `campbells`).
- **Punctuation:** All periods, commas, and apostrophes are stripped prior to snapping.
- **Stop-Word Protection:** Functional words (`and`, `the`, `with`, `for`, etc.) are explicitly **forbidden** from snapping to ensure grammatical structure remains intact.

## 3. Intelligence Search & Scoring
The system uses a "Fuzzy SQL" fetch followed by a "Token Intersection" scoring layer.

### 3.1 Data Acquisition
- **Candidate Pool:** SQL `LIKE` query with a **500-row limit**.
- **Recency Bias:** Results are `ORDER BY inv.id DESC` to prioritize items added today.
- **Identity Priority:** Uses `COALESCE(inv.supplier, it.default_supplier)` to ensure actual **Batch Metadata** overrides product templates.
- **Contextual Pull:** Retrieves both `inv.cabinet_id` and `it.default_cabinet_id` for location-aware scoring.

### 3.2 Scoring Weights
Matches are calculated per token against the candidate's name and brand:
- **Name Match:** +1.5 per token.
- **Brand Match:** +1.0 per token.
- **Range Match:** +0.8 per token.
- **Token Intersection (Bonus):** An exponential boost (`x 1.2`+) applied when the user specifies multiple valid descriptors (e.g., "Aldi" + "Soup"). This prioritizes specific intent over general matches.

### 3.3 Sector Dominance (Cabinet Weighting)
To ensure the app prioritizes items physically in front of the user:
- **Rule:** If the item's current location (Batch layer) OR its default home (Product layer) matches the **Active Sector**, the total score is **DOUBLED (x 2.0)**.
- **Effect:** Combined with the **40% Dominance Filter**, this effectively silences "Ghost Matches" from other cabinets, making the selected sector the dominant search space.

## 4. Hardware & Offline Logic
- **Locale:** Hard-coded to `en-GB` (English UK).
- **Offline Guard:** `requiresOnDeviceRecognition: true`. The app will alert if the local model is missing.
- **Auto-Resurrection:** If the engine hits a `no-speech` timeout or a generic `client` error, it silently restarts after a **500ms** "Breathing Room" delay.
- **Manual Override:** If the user hits "STOP," auto-resurrection is inhibited.

## 6. UI Ergonomics (Heads-Up Display)
The interface is optimized for high-density data viewing during eyes-free audits.
- **Slim Monitor:** Acoustic stream is compressed to the top 25% of the screen.
- **Floating Action Mic (FAB):** The primary control is moved to an absolute-positioned button in the bottom-right, liberating the central column for data.
- **Dominance Filtering:** Only matches within 40% of the top-ranked item are displayed to prevent "Decision Fatigue."
- **Visual Evidence:** Matched tokens are highlighted with "Tactical Badges" for quick visual confirmation.

## 7. Proposed Hybrid Mode (WiFi Fallback)
For users unable to configure offline models, we propose a **"Tactical/Cloud Toggle"**:
- **Tactical Mode (Default):** Strict offline/on-device. Fails if no model.
- **Cloud Mode:** Allows `requiresOnDeviceRecognition: false`.
- **Logic:** If WiFi is active AND "Cloud Mode" is toggled, use Google/Apple cloud servers for higher accuracy at the cost of air-gapped privacy.
