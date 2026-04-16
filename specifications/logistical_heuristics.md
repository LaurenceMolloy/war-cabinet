# War Cabinet Logistical Intelligence Doctrine: Heuristic Protocols

This document codifies the high-precision heuristics used for data entry normalization and discovery across all War Cabinet logistical interfaces (Inventory Management and Mess Hall).

## 1. Lookahead Completion (Elastic Typeahead)
**Objective**: Real-time discovery and friction reduction.
**Trigger**: Every keystroke during text input.

### Scoring & Hierarchy (The "Elastic" Flow)
Suggestions are ranked via a specialized scoring tier. Lower scores have higher priority:

| Score | Logic | Rationale |
| :--- | :--- | :--- |
| **0.0** | **Exact Match** | The target is identified. |
| **0.5** | **Prefix Match** | Input matches the start of the word. |
| **0.8** | **Inclusion Match** | Input exists anywhere within the entry. |
| **0.9** | **Elastic Prefix Near-Miss** | Distance of 1 against the first N+1 characters of the entry. (Catches early typos). |
| **1.0 - 1.4** | **Fuzzy Full-Word Match** | Distance of 1 (1.2) or 2 (1.4) against the complete entry string. |

### Selection Rules (Elite 3)
*   **Capacity**: Maximum of 3 suggestions.
*   **Tie-Breaking**: If scores are equal, prioritize by `usage_stats` (frequency), then alphabetical order.
*   **Suppression**: Entries with a score > 2.0 are discarded.

---

## 2. Near Miss Detection (Harmonizer Modal)
**Objective**: Mandatory data integrity and vocabulary normalization.
**Trigger**: Field `onBlur` or `onSubmit` (Enter).

### Thresholds & Qualification
A "Near Miss" is only calculated if:
1.  The input is **not** an exact match for an established vocabulary entry.
2.  The input has **not** been previously "Ignored" in the current session.
3.  The input length is $\ge$ 2 characters.

### Comparison Logic (Full-Word Integrity)
Unlike the typeahead, the Harmonizer ignores prefixes and compares the input against the **Full Established Entry**:
*   **Algorithm**: Levenshtein Distance.
*   **Threshold**: Distance $\le$ 2.
*   **Probing**: Candidates with a distance of 1 (D1) or 2 (D2) are pooled together.

### Presentation & Sorting
*   **Capacity**: Best 3 candidates.
*   **Sorting**: 
    1.  **Prefix Continuity**: Candidates starting with the same first character as the input.
    2.  **Proximity**: Lower distance (D1 before D2).
    3.  **Alphabetical**: Fallback sorting.

### Terminal Actions
*   **Align**: The input is replaced by the selected vocabulary term.
*   **Ignore**: The input is saved exactly as typed and added to a temporary session "Ignore Set" to prevent re-triggering.
*   **Edit**: Modal closes, returning focus to the input for manual correction.

---

## 3. Visual Identity (Sticker Query Signature)
*   **Icon**: `NearMissIcon` (Compact bullseye-arrow with a high-contrast, black-bordered orange question mark "sticker" overlay).
*   **Header**: `NEAR MISS DETECTED`.
*   **Prose**: "appears to be a possible near miss. Align this [field] entry with the established vocabulary for this field?"
