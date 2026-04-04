## Task
Generate **3 distinct, beginner-friendly recipes** using the ingredients below, prioritising those that need to be used soon.

**Dietary Preference:** Pescetarian

---

## Ingredients

### Expiring (must prioritise)
[LIST OF INGREDIENTS EXPIRING IN THE NEXT 3 MONTHS OR EXPIRED]

### Available (optional pantry)
[FULL LIST OF ITEMS RECORDED AS CURRENTLY STORED IN THE APP]

### Preferred (use if possible)
[LIST OF INGREDIENTS ADDED BY USER WHEN REQUESTING RECIPES]

### Avoid (strictly forbidden)
[LIST OF INGREDIENTS ADDED BY USER - USER HATES THESE]

---

## Core Rules (priority order)
1. Never include avoid ingredients  
2. Maximise use of expiring ingredients  
3. Use preferred ingredients where reasonable  
4. Keep extra ingredients common and low-cost  
5. Available ingredients are optional support only  
6. Assume fresh ingredients (veg, protein, etc.) can be added if needed  

---

## Recipe Constraints
1. Each recipe must use **at least 2 expiring ingredients meaningfully** (not garnish)  
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
  - `(expiring)`
  - `(preferred)`
  - `(available)`
  - `(pantry)` → common cupboard items not listed above (e.g., salt, pepper)
  - `(fresh)` → newly introduced perishable items  

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
- Each recipe uses ≥2 expiring ingredients properly  
- All ingredients include quantity + state + marker  
- Recipes are clearly different  
- Steps are explicit, beginner-proof, and unambiguous  