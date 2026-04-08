# Mess Hall Recipes — Form Redesign Specification

## Background & Rationale

The "Mess Hall Recipes" configuration form has grown organically across multiple iterations and now contains a significant number of interactive sections, resulting in a long vertical scroll before the user reaches the "GENERATE PROMPT" button. While this is functional, empirical review has identified two key friction points:

1. **Cognitive Overload**: The user is presented with every section simultaneously, including sections that rarely change (e.g. Allergies, Dietary Preference). This can feel overwhelming on first use.
2. **Scroll Distance**: Users who simply want to quickly regenerate a prompt (the primary use case) must scroll past all sections to reach the generate button.

The goal of this redesign is to reduce visual fatigue and scroll distance while ensuring that critical, frequently changed settings are always immediately visible. The solution must **not** introduce "out of sight, out of mind" blindspots for active constraints.

---

## Design Approach: Hybrid Accordion

A **pure accordion** (all sections collapsible) would be the wrong solution for this app. Before sending a payload to an external LLM, users need confidence that their full context is correct. Hiding all sections by default destroys the ability to do a quick top-to-bottom visual scan before generating.

A **Hybrid Accordion** is the correct approach:

- **Always-Open Sections** — Volatile, daily-use sections remain fully expanded at all times.
- **Collapsible Sections** — Infrequently-changed, "set once" constraints are hidden behind a collapsible ribbon that clearly shows what is active at a glance.

---

## Section Classification & Display Rules

### TIER 1 — Core Mission (Always Open, Always Prominent)

These sections change on almost every use and represent the core decision-making for tonight's meal.

| Section | Notes |
|---|---|
| **Authentic / Experimental Mode Tabs** | The primary mode toggle — always the first thing visible. |
| **Chef / Flavour Profile** | Chef chip grid + "Suggest a Chef" input. This determines the entire tone of the output. |
| **Expiring Stock Focus** | The core raison d'être of the app. The user must always be able to verify which expiring items are flagged as mandatory. |
| **Mission Directives (Additional Instructions)** | The free-text field for ad-hoc constraints (e.g. "under 30 minutes", "spicy", "one pan"). This is highly situational and volatile. |

### TIER 2 — Soft Inventory (Always Open, Visually Grouped)

These sections represent ingredients the user has available to enrich a recipe. They change regularly (e.g. when something has been used up or restocked) but are less critical than Tier 1.

| Section | Notes |
|---|---|
| **Fridge Staples** | Fast-moving perishables the user commonly has on hand. |
| **Preferred Ingredients** | Pantry favourites and favourite flavours to actively include if possible. |

### TIER 3 — Strict Protocols (Collapsible, Default: CLOSED)

These are hard boundary rules. Once set during onboarding, they almost never change. Taking up half the screen every day is unnecessary overhead.

| Section | Notes |
|---|---|
| **Dietary Preference** | Meat / Vegetarian / Vegan / Pescatarian radio selector. |
| **Allergies Grid** | Multi-select chip grid (Peanuts, Dairy, Gluten, etc.). |
| **Must-Avoid Ingredients** | Free-text field for items the household explicitly rejects. |

#### Collapsed Ribbon Design

When Tier 3 is collapsed, the ribbon heading **must** display a live summary of all active constraints. This prevents "out of sight, out of mind" risk.

**Format:**
```
⌄  STRICT PROTOCOLS   |  Vegetarian  ·  2 Allergies  ·  1 Dislike
```

- If no constraints are set: `⌄  STRICT PROTOCOLS   |  No constraints active`  
- Dietary preference always shown (e.g. `Meat Eater`, `Vegan`)
- Allergy count shown only when > 0
- Dislike count shown only when the field is non-empty
- Tapping the ribbon toggles the section open/closed
- A small chevron icon (`⌄` / `⌃`) rotates to indicate open/closed state

---

## Interaction & UX Rules

1. **Default State on First Launch**: Tier 3 is collapsed by default. Tiers 1 and 2 are always open.
2. **Persistence**: The open/closed state of Tier 3 should be remembered between sessions via the `Settings` table (key: `recipe_protocols_expanded`).
3. **Animation**: The open/close transition should use a smooth height-based animation (same as the existing dashboard category accordion), **not** an instant mount/unmount.
4. **Button Proximity**: The "GENERATE PROMPT" button must remain at the bottom of the form. With Tier 3 collapsed, the scroll distance to reach it should be dramatically reduced.
5. **No Change to Tier 1/2 Behaviour**: These sections are not collapsible and should render identically to their current implementation.

---

## AI Deployment Stations

The "AI Deployment Stations" configuration (the 3 configurable chatbot URL slots) remains in its current position and is unaffected by this redesign. These are used post-generation and live on the briefing screen, not the form itself.

FEEEDBACK COMMENT: this is confusing and wrong. The configuration IS on the recipe configuration form and needs to be dealt with. Maybe its own accordion section? but I leave that to you

---

## Implementation Notes

- The collapsible Tier 3 section can be implemented using the same `Animated.Value` height interpolation pattern already used for category rows on the main dashboard (`index.tsx`).
- The ribbon summary string should be computed from: `selectedDietaryMode` + `selectedAllergens.length` + presence of `avoidText`.
- The persistence key for open/close state: `recipe_protocols_expanded` (Boolean string `'true'`/`'false'`).

---

## E2E Testing Requirements (TC-67.x)

### TC-67.1 — Tier 3 Default Collapsed State & Ribbon Summary

| Step | Action | Assertion |
|---|---|---|
| 1 | Navigate to Mess Hall Recipes on a clean database | Tier 3 ribbon is **closed** |
| 2 | Inspect ribbon text | Shows dietary mode and "No constraints active" if no allergies set |
| 3 | Set Dietary to "Vegan", select 2 allergies, enter "Mushrooms" in Must-Avoid | — |
| 4 | Tap anywhere to dismiss then re-open the screen | Ribbon reads: `Vegan · 2 Allergies · 1 Dislike` |

### TC-67.2 — Open/Close Toggle & Persistence

| Step | Action | Assertion |
|---|---|---|
| 1 | Tap the Tier 3 ribbon | Section animates open; chevron rotates |
| 2 | Set an allergy chip | — |
| 3 | Background and reopen the app | Tier 3 ribbon remains **open** (state persisted) |
| 4 | Tap ribbon again | Section animates closed; chevron resets |
| 5 | Background and reopen the app | Tier 3 ribbon is **closed** (state persisted) |

### TC-67.3 — Prompt Compilation Includes Tier 3 Even When Collapsed

| Step | Action | Assertion |
|---|---|---|
| 1 | Set Dietary to "Vegetarian", 1 Allergy active, Must-Avoid: "Olives" | — |
| 2 | Collapse Tier 3 | Section hidden |
| 3 | Tap **GENERATE PROMPT** | Generated prompt text correctly includes Dietary, Allergy, and Avoid constraints |

---

## Out of Scope

- Making Tier 1 or Tier 2 sections collapsible — deliberately rejected to preserve scan-ability.
- Redesigning the Briefing / Output screen — that is a separate concern.
- Any changes to the AI prompt structure or template — covered separately in `review_feedback.md`.

---

## Status

- [ ] Specification approved
- [ ] Implementation started
- [ ] TC-67.x E2E tests written (RED)
- [ ] Implementation complete (GREEN)
- [ ] Refactor pass complete
