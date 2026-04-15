# Skill: Tag-Team Testing MO

## Trigger
Whenever the user says **"Tag-Team Test this"** or requests to **"Tag-Team Test [Feature/Task]"**, immediately initiate this testing protocol.

## Objective
To create bulletproof, zero-guesswork E2E test scripts by leveraging the human user to physically navigate the UI — bypassing AI visual processing limits — while the AI hardens the generated code with exact logical assertions and testing standards.

---

## The Two-Test-Type Doctrine

Every test must be classified before writing begins. The classification determines the paywall strategy.

| Type | Trigger Phrase | Paywall Strategy | Purpose |
|------|----------------|------------------|---------|
| **Feature Test** | Default (no qualifier needed) | **Bypass** via `__E2E_LICENCE__` hook | Test the feature logic in isolation |
| **Paywall Test** | User explicitly says "paywall test" | **Go through** the real purchase flow | Verify the paywall fires at the correct tier |

> **Default Rule:** In the absence of being told this is a paywall test, always treat it as a **Feature Test** and inject a `GENERAL` licence automatically. Do not ask the user which type it is.

### Why This Matters
If TC-79.1 is testing Mess Hall filtering and the paywall button label later changes, TC-79.1 must not fail. Its failure should only indicate that the Mess Hall logic itself is broken. Test isolation is non-negotiable.

---

## The E2E Licence Hook

`BillingContext.tsx` supports a window global bypass for web E2E tests. It is checked at the top of `refreshEntitlements()` before any DB lookup, short-circuiting all entitlement resolution.

**Standard injection (in `test.beforeEach` for Feature Tests):**
```typescript
await page.addInitScript(() => {
  (window as any).__E2E_LICENCE__ = 'GENERAL'; // or 'SERGEANT' | 'TRIAL' | 'PRIVATE'
  localStorage.setItem('war_cabinet_welcome_seen', '1'); // bypass welcome modal
});
```

**Behaviour:** The billing context immediately applies the injected tier without hitting the DB or SecureStore. This follows the same pattern as `__E2E_SKIP_SEEDS__` in `sqlite.ts`.

**Paywall Tests** do NOT use this hook. They navigate the real purchase flow exactly as a user would, as recorded.

---

## The Protocol

### Phase 1: AI Deployment
1. The AI classifies the test (**Feature** or **Paywall**) based on the user's request. Default is Feature.
2. The AI immediately launches the Playwright Code Generator locally on the User's machine, with the `--test-id-attribute` flag to prefer `testID`-based selectors:
   ```
   npx playwright codegen --test-id-attribute=data-testid http://localhost:8081 -o scratch/TC-XX_recorded.ts
   ```
   (run inside `mobile/`)
3. The AI waits. The user takes the wheel.

### Phase 2: Human Reconnaissance
1. A Chromium browser and Playwright Inspector appear on the User's desktop.
2. The User drives the browser — all actions are automatically recorded with high-fidelity selectors (`data-testid`, `getByText`, etc.).
3. **The "Click-to-Assert" Manoeuvre:** When the User reaches a UI state they want verified (a toast, a list item, a toggle state), they perform a **dummy click** on that element so its exact selector is captured in the recording.
4. The User closes the browser to stop the recording.

### Phase 3: The Handoff & Briefing
1. The User returns to the chat and says the recording is complete.
2. The User provides a plain-English **Briefing**: which dummy-clicked elements should become assertions (e.g., *"Convert my click on 'MESS HALL ON' into a visibility check"*).

### Phase 4: AI Hardening
1. The AI reads the raw recorded script (`scratch/TC-XX_recorded.ts`).
2. For **Feature Tests**: The AI injects the `__E2E_LICENCE__` hook and `welcome_seen` bypass via a `test.beforeEach`.
3. For **Paywall Tests**: The AI retains the full recorded purchase flow as-is.
4. The AI merges the recording into the official test file (`e2e/TC-XX.spec.ts`).
5. The AI replaces User "dummy clicks" identified in the Briefing with proper Playwright assertions (`.click()` → `expect(...).toBeVisible()`).
6. **Selector Upgrade & Minting:** The AI audits every `getByText()` **interaction** (a click) in the recording. It must cross-reference the source code for the target element. If a `testID` does not exist on that interactive element (e.g., `TouchableOpacity`), the AI **MUST add a new `testID` prop to the application source code** first. Then, it upgrades the script to use `getByTestId()`. `getByText()` is acceptable only for **assertions** (verifying text is visible), never for **interactions** (clicking). This makes tests immune to UX label changes.
7. The AI scopes ambiguous text assertions to their nearest `testID` container to prevent strict-mode violations from duplicate text across the page.
8. The AI cross-references exact rendered text strings against the source files before writing any assertion.
9. **Assertion ID Comments:** Before every assertion (e.g., `expect(...)`), the AI MUST add an ID comment consisting of the test file name/tracker ID followed by a sequence number, and a succinct description. Example: `// TC-79.2.1 Assert rank badge is visible`. If the file is unnumbered, use `TC-0.0` (e.g., `// TC-0.0.1...`). This enables easy reference to specific assertions during debugging.

---

## Rules of Engagement
- **No Guessing:** All layout navigation and interaction must be based on selectors the User physically recorded. Never speculate about DOM structure.
- **Scope Assertions:** Always scope text assertions to the nearest `testID` container to avoid strict-mode failures from duplicate text on the page.
- **Source Cross-Reference:** When converting a dummy-click into an assertion, verify the exact rendered string in the source before writing.
- **Mint TestIDs Fearlessly:** Do not hesitate to add a missing `testID` prop to the application source code to facilitate a selector upgrade. `testID`s are harmless metadata and vital for tight tests.
- **Fail Fast:** If the AI needs to substantially modify a flow and risks guessing wrong, request a new, focused Tag-Team recording of that specific segment instead of speculating.

---

## LESSONS LEARNED - MUST READ BEFORE STARTING

Based on extensive debugging cycles, you MUST adhere to these rules to avoid catastrophic test looping.

### 1. Things you MUST ALWAYS do when writing tests:
- **Mirror the User's Recording Exactly:** The user's codegen recording captures the exact necessary clicks to reach a specific UI state. If the user clicks an accordion or tab to expand it before making an assertion, you MUST include that click in the final test. If you skip UI state interactions, DOM assertions will fail because elements remain hidden.
- **Run the Test Before Reporting:** NEVER modify a test script and report back to the user that it is "fixed" without physically executing the test locally and confirming it passes.
- **Target Active Router Screens:** In Expo Router, previous screens remain mounted in the DOM natively but are hidden (`display: none`). You MUST target the currently active screen layer.

### 2. Things you MUST PARTICULARLY AVOID doing in future when writing tests:
- **Avoid `.first()` Locators on Global Elements:** Because of Expo Router's hidden navigation stack, `getByTestId('back-btn').first()` or `getByText('SAVE').first()` will almost always target a broken, invisible button from a previous screen in the stack instead of the active one.
- **Do not modify app code secretly:** Never patch `.tsx` app source files to bypass errors or modals without explicit user permission and transparency. Modifying app code to pass a test breaks trust and risks corrupting the application state.

### 3. Things learned through this evening's experiences to bear in mind:
- **The Codegen Trap:** Playwright's local Codegen often generates `.first()` or `.nth(0)` by default. These work initially but fail unpredictably during automated suites if the navigation stack grows. You must manually upgrade these to `.last()` or append `.filter({ state: 'visible' })` when writing the final spec file.
- **"Recon-first" Debugging:** Trial-and-error click timings never work. If an assertion is failing because an element is hidden, dump the DOM state (`await fs.promises.writeFile('dump.html', await page.content())`) to physically see what the test is seeing. This reveals collapsed accordions and hidden routers instantly.
