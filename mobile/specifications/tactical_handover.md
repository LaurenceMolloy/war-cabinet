# Tactical Inventory Triage: Handover & Specification

## 1. Objective
Finalize the "Tactical Pulse" workflow: a high-speed, scanner-driven inventory consumption loop that provides visual confirmation (scroll-to-batch + decrement animation) while maintaining strict database integrity.

## 2. Core Requirements
### A. The Scanner Interface
- **Lockdown**: Prevent "Double Scans" by gating the camera with `isProcessingScan` and `isScannerClosing`.
- **Triage Logic**:
    - **Single Match**: Automatically suggest "Quick Use" of the oldest batch via an overlay.
    - **Conflict/Multiple**: Open the `TriageModal` for selection if dates or locations differ.
    - **New Barcode**: Transition to Workflow A (handshake/link) or the `/add` screen.

### B. The Tactical Pulse (UI/UX)
- **Synchronization**: Upon confirming use, the scanner must close *immediately*.
- **Logic Reuse**: The triage workflow MUST re-use the existing `triggerTacticalConsume` engine used by the Favorites/Single-Click rail.
- **Visual Sequence**: 
    - Scroll to the target batch automatically.
    - Highlight the quantity with a visual pulse.
    - Pause for 1200ms (Tactical Verification) before decrementing.
    - Ensure zero duplication of this logic between standard clicks and scanner events.
- **Atomic Decrement**: The quantity must drop by 1 exactly once, with a secondary `load()` to verify the state.

## 3. Post-Mortem: Unresolved Issues
### A. The "Ghost Batch" (Phantom Double-Deletion)
**Symptoms**: User consumes one item; two items disappear from the UI; the second item (usually the oldest) "magically" reappears after a manual refresh or screen change.
**Radical Honesty**:
- **The Failure**: This is a classic race condition in React's asynchronous state updates. Because `load()` is triggered by both `useEffect` (on cabinet/search changes) and manually (after a DB write), multiple `setCategories` calls are firing with overlapping data.
- **The "Phantom" Reason**: The UI briefly reflects a state where a batch is missing because a stale `load()` (from *before* the DB write finished) is competing with a fresh one. The "reappearance" happens when the correct DB state finally wins the render cycle.
- **The "Oldest Item" Coincidence**: My suggestion logic prioritizes the oldest item. If the UI state is messy, the logic that "picks" which row to hide in the filter might be defaulting to the first index of the array, creating the illusion that the oldest item was deleted twice.

### B. Scanner Persistence ("The Blackout")
**Symptoms**: The scanner window remains visible after "Confirm," blocking the view of the animation on the main screen.
**Radical Honesty**:
- **The Failure**: React Native `Modal` dismissal is not instantaneous. If `triggerTacticalConsume` starts the animation before the Modal has fully unmounted, the "Pulse" happens behind the black camera view.
- **The Friction**: I attempted to use `isScannerClosing` as a gate, but the logic was fragmented across `index.tsx`. The scanner should likely be a dedicated route or a more decoupled component rather than a 400-line JSX block inside the 2,300-line `index.tsx`.

## 4. Architectural Advice for "Big Brother"
1. **Refactor index.tsx**: The file is too large for reliable LLM modification. Split the Modals (Triage, Scanner, CabinetForm) into their own files with clean, prop-driven interfaces.
2. **Centralize State**: Move inventory state to a dedicated hook or Context. Currently, `load()` is a "God Function" that does too much (filtering, sorting, calculating totals, and fetching).
3. **Deterministic Persistence**: Use a transaction-safe "Queue" for consumption. Instead of calling `load()` multiple times, the UI should optimistically update and then verify against the DB once.
4. **Modal Lifecycle**: Ensure the Tactical Pulse is strictly tied to the `onDismiss` callback of the Scanner Modal. Never trigger animations while a Modal is in the process of closing.

## 5. Current State of index.tsx
- **Syntax**: Verified clean. No dangling braces or reserved words.
- **Load Lock**: `loadVersionRef` is implemented to help discard stale async updates, but it requires a clean `load()` function to be effective.
- **Triage Integration**: `TriageModal` is wired to the `triggerTacticalConsume` engine.
