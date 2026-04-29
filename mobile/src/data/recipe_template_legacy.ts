export const RECIPE_PROMPT_TEMPLATE = `## Tactical Task
[GEN_TASK_DESCRIPTION]

**Dietary Preference:** [DIETARY_PREF]
**Allergies:** [LIST_ALLERGENS]

---

## Ingredients

### Expiring (mandatory focus)
[LIST_EXPIRING]

### Available (non-perishable/pantry)
[LIST_PANTRY]

### Available (fresh/freezer)
[LIST_FREEZER]

### Available (fresh/fridge)
[LIST_STAPLES]

### Preferred (use if possible)
[LIST_PREFERRED]

### Avoid (strictly forbidden)
[LIST_AVOID]

### Additional user requests (optional, best-effort):
[EXTRA_REQUESTS]

---

## Culinary Strategy
- **Mode:** [RECIPE_MODE]
[CHEF_STRATEGY_LINE]

---

## Core Rules (priority order)
1. ALLERGIES must be taken into account; relevant ingredients MUST be avoided.
2. Never include avoid ingredients  
3. Maximise use of expiring ingredients  
4. Use preferred ingredients where reasonable  
5. Keep extra ingredients common and low-cost  
6. Available ingredients (pantry, freezer, and fridge) are optional support only  
7. Assume fresh ingredients (veg, protein, etc.) can be added if needed  

---

[MODE_SPECIFIC_CONSTRAINTS]

---

[DYNAMIC_OUTPUT_FORMAT]

---

## Conflict Handling

If constraints conflict:
- **Core Rules (Allergens/Avoids) MUST always be respected.**
- Produce the closest valid recipes  
- Briefly note compromises  

---

## Final Self-Check (mandatory before output)

- No forbidden ingredients used  
- Mandatory items utilized as primary components
- Additional requests respected only where safe
- Output matches structural requirements exactly  
- Results are clearly different
`;

export const AUTHENTIC_MODE_SUB_TEMPLATES = {
  TASK: `Identify **3 real, published recipes** from **[CHEF_NAME]** that meaningfully utilize the **Mandatory Expiring Stock** as primary components. Ignore minor missing ingredients in the real recipes so long as the mandatory items are present.`,
  CONSTRAINTS: `## Hard Archival Search & Verification Rules (NON-NEGOTIABLE)
1. **Pilot Your Search Capabilities:** Use your integrated web browsing/search tools specifically on the [CHEF_NAME] archive and reputable third-party records to locate real recipes. 
2. **Hard URL Validation:** You **MUST** confirm that each provided URL returns a valid HTTP 200 status and loads a full recipe page. If you cannot verify this through your search tools, you **MUST** discard the result. 
3. **No Guesswork / Hallucination:** NEVER guess or predict a URL based on common patterns. If you provide a broken, generic, or predicted URL, your **ENTIRE RESPONSE** is considered invalid and must be discarded and regenerated.
4. **404 Recovery Protocol:** If an official recipe URL is broken, attempt to locate a verified archive or trusted "copycat" record (e.g. from a reputable cooking blog) that precisely documents the chef's original version. Verify these alternative URLs with a strict level of rigor.
5. **Direct Links Only:** Always provide the most direct, tested recipe-page URL found during this process.
6. **Google Search Fallback:** An active Google search URL link using the Chef name and Recipe Title MUST be provided as a final tactical redundancy.
7. **Shopping List Generation:** You must compile a list of ingredients required by the recipe that are NOT present in the provided context (Expiring, Available, Fridge Staples, Preferred). Be sure to factor in your suggested Adjustments/substitutions when calculating this list.
8. **Physical State Integrity (NON-NEGOTIABLE):** Every ingredient is tagged with its physical state: (non-perishable), (fresh/frozen), or (fresh).
- **Constraint:** You MUST interpret (non-perishable) as canned, dried, or shelf-stable (e.g., canned tuna, dried beans).
- **Prohibition:** NEVER match a (non-perishable) ingredient with a recipe that assumes raw, fresh, or sushi-grade status. 
- **Enforcement:** If a mandatory item is (non-perishable), do NOT suggest seared, sushi-grade, or rare protein preparations. You MUST use methods appropriate for canned/dried goods. Hallucinating a fresh state for a pantry item is a critical failure.`,
  OUTPUT: `## Output Format (Search-Ready Records)
You must strictly follow this exact markdown formatting to simulate a clean recipe card layout:

---
### [Official Recipe Title]
> *[1–3 sentences describing the appeal, textures, and flavors... sell it in the style of [CHEF_NAME]! This section MUST be formatted as an italicized blockquote]*

**Source:** [CHEF_NAME] (via [Site Name if archival/copycat])
**Why it fits:** [1 sentence explaining how it utilizes your mandatory stock]
**Adjustments:** [1-2 tactical tips on how to swap or omit ingredients to better fit inventory or dietary constraints]

**Shopping List:** [Comma-separated list of items to purchase, or "None required"]

**Direct URL:** [A verified HTTP 200 direct URL from your search results]
**Fallback URL:** [Search Google for this Recipe](https://www.google.com/search?q=[GOOGLE_SEARCH_QUERY])


Act as a professional food editor. Format the above recipe details 
using the following Markdown structure:

    Header: Use ## for the title and italics for the tagline.

    Horizontal Rules: Use --- to separate sections.

    Profile Section: Use bold labels for Style and Source.

    Flavour Architecture: Use a bulleted list with relevant emojis for each key note.

    Why It Works: mandatory items in bold.

    Shopping List: Use a Table with columns for 'Category' and 'Ingredients'.

    Chef’s Note: Place a helpful tip at the end inside a Markdown blockquote (>).




━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(Repeat for exactly 3 results, ensuring you output the bold separating line above between each recipe)
`
};

export const LOGISTICS_MODE_SUB_TEMPLATES = {
  TASK: `Generate **3 distinct, beginner-friendly recipes** using the ingredients below, prioritising those that need to be used soon.`,
  CONSTRAINTS: `## Recipe Constraints
1. Each recipe must use **[MANDATE_RULE]** (not garnish)  
2. Recipes must be clearly different (e.g., cuisine, cooking method, flavour profile)  
3. Keep recipes simple, quick, and beginner-friendly  
4. Avoid niche or expensive ingredients unless preferred  
5. Do not assume prior prep knowledge  
6. **Additional requests** are best-effort; **NEVER** override Core Rules.
7. **Physical State Integrity (NON-NEGOTIABLE):** Every ingredient is tagged with its physical state: (non-perishable), (fresh/frozen), or (fresh).
- **Constraint:** You MUST interpret (non-perishable) as canned, dried, or shelf-stable (e.g., canned tuna, dried beans).
- **Prohibition:** NEVER match a (non-perishable) ingredient with a recipe that assumes raw, fresh, or sushi-grade status. 
- **Enforcement:** If a mandatory item is (non-perishable), do NOT suggest seared, sushi-grade, or rare protein preparations. You MUST use methods appropriate for canned/dried goods. Hallucinating a fresh state for a pantry item is a critical failure.

---

## Ingredient Labelling
Every ingredient must include:
- Quantity (**metric: g / ml**)  
- State (e.g., raw, cooked, drained, sliced)  
- Marker, one of: (fresh/frozen), (non-perishable), (fresh)

---

## Ingredient Ordering (strict)
List ingredients in this exact order: 1. Expiring, 2. Preferred, 3. Available, 4. Pantry, 5. Fresh`,
  OUTPUT: `## Output Format (exact structure required)

### Recipe Name: [Title]

### Ingredients
| Ingredient | Quantity | State | Marker |
|------------|----------|--------|---------|
| rice | 200 g | uncooked | (non-perishable) |

### Steps
- Step with precise instruction (include heat level, timing, quantities where relevant)  
- Avoid vague terms like “cook until done”  

### Estimated prep/cook time
[time]

[CHEF_NOTE_SECTION]

---
(Repeat for 3 recipes)`
};
