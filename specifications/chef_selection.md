# Specification: Chef Selection Enhancement

## Overview
Enhance the "Legendary Chef Intel" section in the Mess Hall Recipes tool to support a curated list of high-impact chefs, user-provided suggestions, and a persistent memory of the last two custom suggestions.

## User Requirements
- **Curated List**: A refined "High Impact" list of chefs for quick selection.
- **Custom Suggestion**: A way for users to enter a chef not in the list.
- **Short-Term Memory**: The last two custom chefs entered by the user should be saved and displayed as clickable chips in future sessions.

## Technical Implementation

### 1. Curated Chef List
Refine the `chefs` constant to a high-impact set:
- BBC Good Food
- Gordon Ramsay
- Jamie Oliver
- Nigella Lawson
- Ottolenghi

### 2. State & Persistence
- **State**: `customChefs` (string array, max 2).
- **Settings Keys**: `recipe_custom_chefs` (comma-separated string).
- **Update Logic**: When a user enters a custom chef, if it's not in the curated list or already in the history, prepend it to `customChefs` and truncate to size 2.

### 3. UI Changes
- **Chef Selection Grid**:
    - Display curated chips first.
    - Display saved custom chips second (with a distinct "memory" style if needed, or just same as others).
    - Add a "Suggest / Custom" text input field below the chips.
- **Interaction**:
    - Tapping a chip updates `selectedChef`.
    - Typing in the "Custom" field updates `selectedChef` and triggers the "memory" logic upon generation of the prompt.

### 4. Database Integration
- Load `recipe_custom_chefs` on component mount.
- Save `recipe_custom_chefs` whenever a new suggestion is committed.

## Edge Cases
- **Duplicates**: If a user suggests a chef already in the curated list, don't add to memory.
- **Persistence**: Ensure the custom list doesn't grow beyond 2 items.
