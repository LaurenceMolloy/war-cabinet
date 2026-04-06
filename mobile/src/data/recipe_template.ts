export const RECIPE_PROMPT_TEMPLATE = `## Tactical Task
[GEN_TASK_DESCRIPTION]

**Dietary Preference:** [DIETARY_PREF]
**Allergies:** [LIST_ALLERGENS]

---

## Ingredients

### Expiring (mandatory focus)
[LIST_EXPIRING]

### Available (optional pantry)
[LIST_AVAILABLE]

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
6. Available ingredients are optional support only  
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
