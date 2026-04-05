export const RECIPE_PROMPT_TEMPLATE = `## Task
Generate **3 distinct, beginner-friendly recipes** using the ingredients below, prioritising those that need to be used soon.

**Dietary Preference:** [DIETARY_PREF]
**Allergies:** [LIST_ALLERGENS]

---

## Ingredients

### Expiring (must prioritise)
[LIST_EXPIRING]

### Available (optional pantry)
[LIST_AVAILABLE]

### Preferred (use if possible)
[LIST_PREFERRED]

### Avoid (strictly forbidden)
[LIST_AVOID]

---

## Core Rules (priority order)
1. ALLERGIES must be taken into account; relevant ingredients MUST be avoided.
2. Never include avoid ingredients  
3. Maximise use of expiring ingredients  
4. Use preferred ingredients where reasonable  
5. Keep extra ingredients common and low-cost  
6. Available ingredients are optional support only  
7. Assume fresh ingredients (veg, protein, etc.) can be added if needed  

---

## Recipe Constraints
1. Each recipe must use **[MANDATORY_COUNT_RULE]** (not garnish)  
2. Recipes must be clearly different (e.g., cuisine, cooking method, flavour profile)  
3. Keep recipes simple, quick, and beginner-friendly  
4. Avoid niche or expensive ingredients unless preferred  
5. Do not assume prior prep knowledge  

---

## Ingredient Labelling

Every ingredient must include:
- Quantity (**metric: g / ml**)  
- State (e.g., raw, cooked, drained, sliced)  
- Marker, one of:
  - \`(expiring)\`
  - \`(preferred)\`
  - \`(available)\`
  - \`(pantry)\` → common cupboard items not listed above (e.g., salt, pepper)
  - \`(fresh)\` → newly introduced perishable items  

---

## Ingredient Ordering (strict)

List ingredients in this exact order:
1. Expiring  
2. Preferred  
3. Available  
4. Pantry  
5. Fresh  

---

## Output Format (exact structure required)

### Recipe Name: [Title]

### Ingredients

| Ingredient | Quantity | State | Marker |
|------------|----------|--------|---------|
| rice | 200 g | uncooked | (expiring) |

### Steps
- Step with precise instruction (include heat level, timing, quantities where relevant)  
- Continue clearly, no ambiguity  
- Avoid vague terms like “cook until done”  

### Estimated prep/cook time
[time]

---

## Conflict Handling

If constraints conflict:
- Produce the closest valid recipes  
- Briefly note compromises  

---

## Final Self-Check (mandatory before output)

- No forbidden ingredients used  
- Each recipe uses [MANDATORY_COUNT_RULE_SHORT] properly  
- All ingredients include quantity + state + marker  
- Recipes are clearly different  
- Steps are explicit, beginner-proof, and unambiguous  
`;
