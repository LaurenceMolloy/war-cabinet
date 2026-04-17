# Tactical Recon Intelligence Test (TRIT) — Framework Specification

## Objective
To implement a standardized, natural-language testing protocol that allows Antigravity to:
1.  **Understand** the user's intent with "Passmark-style" clarity.
2.  **Execute** tests iteratively using the internal `browser_subagent`.
3.  **Compile** verified flows into hardened, standalone Playwright `.spec.ts` artifacts.

---

## 1. The "Boilerplate Gold" (Structure)

Passmark’s primary advantage isn't just "writing in English"—it's the **structured atomic step**. TRIT adopts this via a `tests/registry.json` or YAML format that enforces the following boilerplate:

| Field | Purpose | "Gold Dust" Value |
|---|---|---|
| `userFlow` | High-level goal (e.g., "Batch Merge Logic") | Sets the agent's high-level persona and goal. |
| `prerequisites` | DB state or Rank requirement | Prevents tests from failing due to environment mismatch. |
| `steps[]` | Atomic action sequence | Forces logic breaks; prevents prompt drift. |
| `waitUntil` | Success marker for the individual step | Ensures the app is ready before the next action. |
| `assertions` | Independent verification of the final state | Decouples "Doing the work" from "Checking the result." |

---

## 2. TRIT Definition Example (The Input)

Instead of a vague request, tests are defined in a **TRIT Spec Block**:

```json
{
  "userFlow": "Cost Intelligence — Supplier Eligibility",
  "rank": "TRIAL",
  "prerequisite": "Clean Inventory",
  "steps": [
    { 
      "description": "Add a new batch of 'Baked Beans'", 
      "data": { "supplier": "", "size": "400g" },
      "waitUntil": "Batch Card visible in dashboard"
    },
    { 
      "description": "Long-press the new Baked Beans card",
      "waitUntil": "Context menu or Batch Item screen is visible"
    }
  ],
  "verification": [
    { "assertion": "No Price Intelligence prompt is shown (Suppressed due to missing supplier)" }
  ]
}
```

---

## 3. The "Translator" Workflow (Reimplantation)

Unlike Passmark (which runs the AI at runtime), the TRIT workflow uses the AI to **Author the Hardened Artifact**:

### Phase A: The Recon Loop
1.  The user points Antigravity to a **TRIT Spec**.
2.  Antigravity runs the `browser_subagent` to perform the Recon Phase.
3.  As the subagent performs each step, it records the **CSS Selectors** and **Wait States** it successfully used to fulfill the `waitUntil` requirement.

### Phase B: The Artifact Emission
1.  Once the flow is "Proven" by the subagent, Antigravity translates the log into a **Standard Playwright Script**.
2.  **Boilerplate logic**: The script is wrapped in standard `test('name', ...)` blocks with modern data-test-id selectors where available.
3.  **Persistence**: The `.spec.ts` is saved to the `tests/` directory.

---

## 4. Hierarchy of Success (Failure Modes)

TRIT provides three layers of feedback to minimize "testing pain":

1.  **Auto-Healing (Development)**: If the Recon subagent fails a step, it identifies *why* (e.g., "Submit button is hidden by keyboard") and suggests a fix to the codebase immediately.
2.  **Hardened Run (CI)**: The compiled Playwright artifact runs at native speed with zero AI calls.
3.  **Manual Overrule**: If a human changes a core UX flow, they simply update the `TRIT Spec` (the English description), and Antigravity re-compiles the artifact.

---

## 5. Implementation Roadmap

*   **Step 1**: Create `tests/registry.json` as the source of truth for all "Intelligence" features.
*   **Step 2**: Implement an Antigravity "Test Runner" instruction that loads these JSON definitions.
*   **Step 3**: Establish the `playwright.config.ts` for the local Web/WASM environment (Mobile web-simulator).
