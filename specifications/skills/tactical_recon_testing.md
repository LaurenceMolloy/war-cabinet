# Skill: Tactical Reconnaissance Testing Protocol
## Objective: High-Precision, Zero-Loop E2E Verification

### 1. The Forbidden Workflow: "Blind Scripting"
Agents are EXPLICITLY FORBIDDEN from writing complex E2E test scripts based solely on their interpretation of the source code.
*   **The Problem**: Assumptions about `testID` propagation, DOM hierarchy, and element visibility are often wrong in a dynamic React Native/Expo environment.
*   **The Consequence**: Falling into the "Edit-Run-Fail-Analyze" loop. This is inefficient, consumes excessive tokens, and stalls the development velocity.
*   **The Rule**: Do not guess. Do not assume. Do not attempt to "fix" a failing test by guessing a new selector.

---

### 2. The Mandatory Protocol: "Reconnaissance First"
Before writing a single line of a `.spec.ts` or `.yaml` test file, the agent MUST perform a live UI Reconnaissance.

#### Phase A: Web Reconnaissance
1.  **Launch the App**: Ensure the dev server is running and open the app using the `browser_subagent`.
2.  **Visual Audit**: Ask the subagent to physically "perform" the specific user journey.
3.  **Locator Extraction**: During the walkthrough, the agent MUST precisely identify:
    *   The `data-testid` of every interactive element.
    *   The exact DOM path if `testID` is missing or fails to propagate.
    *   The exact text content (case, spacing, and special characters like ❄).
    *   Any timing/loading delays or animation durations.
4.  **Blueprint Generation**: Document the "Verified Journey"—a list of selectors and waits that *actually work* in the live environment.

#### Phase B: Precision Scripting
1.  **Single-Shot Logic**: Write the test script using ONLY the blueprint from Phase A.
2.  **Explicit Waits**: Use only the timing values observed during Recon.
3.  **One-Pass Execution**: The test should ideally pass on the very first run.

---

### 3. Assertion Resilience
Assertions should be "Observed Truths."
*   If a modal is supposed to close, use the subagent to confirm it *does* close before writing `expect(modal).toBeHidden()`.
*   If a value changes, verify the selector for that value during Recon.

### 4. Failure Protocol
If a test fails despite Recon:
1.  **Do NOT guess a fix.**
2.  **Re-deploy the Subagent**: Have the subagent take a screenshot of the failure state and extract the *new* reality of the DOM.
3.  **Adjust the Blueprint**: Update the Recon data before touching the test code again.

---
**AUTHORITY**: This protocol is mandated to prevent "Development Stalls" and ensure the highest possible accuracy for the War Cabinet inventory system.
