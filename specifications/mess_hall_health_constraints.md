# The Mess Hall: Health & Medical Dietary Constraints

## Overview
This specification expands the "Mess Hall AI Chef" feature from a simple recipe generator into a robust, health-focused household utility. By integrating structured medical and health constraints, the AI Chef transitions from handling basic "allergies" to actively managing complex dietary thresholds (e.g., Low Sodium, Diabetic-Friendly), providing immense value to households managing chronic health conditions alongside inventory rotation.

## Core Philosophy
Standard recipe generators fail users with medical conditions because they lack context of the user's available inventory. The War Cabinet AI Chef solves the cognitive load of answering: *"What can I eat that won't compromise my health, fits my doctor's orders, AND uses up the stock expiring tomorrow?"*

### Allergies vs. Medical Diets
It is crucial to distinguish between different types of dietary restrictions within the system:
1.  **Allergies / Intolerances (Absolute Exclusions):** Zero-tolerance parameters. If an ingredient is present, the recipe is dangerous. (e.g., Peanuts, Celiac/Gluten, Shellfish).
2.  **Medical Guidelines (Thresholds & Balances):** Parameter-driven diets prescribed for health management. It's about overall balance rather than total exclusion. (e.g., Low Sodium, Low Carb, Low Purine).
3.  **Health Goals (Preferences & Lifestyles):** Desired outcomes or philosophies. (e.g., Weight Loss, High Protein, Vegan, Keto).

---

## 1. The "Big 5" Medical Profiles
The system will offer a predefined vocabulary of structured tags to support the most common diet-dependent medical conditions. This structured data allows for precise LLM prompt engineering.

*   **Hypertension / High Blood Pressure**
    *   *Diet Type:* DASH Diet (Dietary Approaches to Stop Hypertension).
    *   *System Tags:* `[Low Sodium]`, `[Heart Healthy]`, `[Potassium Rich]`
*   **Diabetes & Pre-diabetes**
    *   *Diet Type:* Blood sugar and glycemic management.
    *   *System Tags:* `[Diabetic-Friendly]`, `[Low GI]`, `[Low Carb]`, `[Sugar-Free]`
*   **IBS & Digestive Disorders (Crohn's, Colitis)**
    *   *Diet Type:* Minimizing fermentable carbs.
    *   *System Tags:* `[Low FODMAP]`, `[Gut Gentle]`, `[Easy to Digest]`
*   **Heart Disease & High Cholesterol**
    *   *Diet Type:* Saturated fat management, often Mediterranean style.
    *   *System Tags:* `[Low Saturated Fat]`, `[High Fiber]`, `[Cholesterol-Lowering]`
*   **Kidney Disease**
    *   *Diet Type:* Renal management (highly specific and critical).
    *   *System Tags:* `[Renal-Friendly]`, `[Low Potassium]`, `[Low Phosphorus]`

---

## 2. User Experience & Data Collection
The "Mess Hall Profile" setup will move away from a single free-text input and adopt a structured, three-tier selection process.

### Tier 1: The Danger Zone (Absolute Exclusions)
*   **UI/UX:** Multi-select chips or free-text array.
*   **Prompt Instruction:** "NEVER include these ingredients under any circumstances."
*   **Examples:** Peanuts, Shellfish, Gluten, Dairy.

### Tier 2: The Doctor's Orders (Medical Guidelines)
*   **UI/UX:** Pre-defined toggle list based on the "Big 5" profiles above.
*   **Prompt Instruction:** "Design recipes that strictly adhere to these medical dietary rules."
*   **Examples:** Low Sodium, Diabetic-Friendly, Low FODMAP.

### Tier 3: The Objective (Health Goals & Vibe)
*   **UI/UX:** Selectable lifestyle tags.
*   **Prompt Instruction:** "Optimize the recipe to support these lifestyle goals."
*   **Examples:** High Protein, Mediterranean, Weight Loss.

---

## 3. Specialized "Chef Personas"
To complement the medical data, the AI Chef personas will be expanded to include health-focused experts. These personas define the *tone* and *focus* of the AI's output.

1.  **The Clinical Dietician:** Prioritizes strict adherence to medical tags over culinary flair. Provides clear explanations of *why* the recipe is safe, and offers macro-nutrient or sodium/sugar estimates.
2.  **The Sports Nutritionist:** Focuses on fueling, high protein, and macro-balancing for active users.
3.  **The Gut-Health Guru:** Focuses on probiotics, ferments, and gentle digestion, acting as a guide for IBS or microbiome goals.

---

## 4. LLM Prompt Engineering Architecture
When a user requests a recipe, the backend will construct a composite prompt ensuring safety and compliance.

**Example Prompt Template:**
> You are acting as **[{Chef Persona}]**. 
> 
> The user needs a recipe using the following expiring inventory: **[{Expiring Items}]**. 
> You may suggest common pantry staples to complete the meal.
> 
> **CRITICAL SAFETY PARAMETERS:**
> 1. You MUST absolutely exclude the following ingredients: **[{Absolute Exclusions}]**.
> 2. The recipe MUST strictly adhere to the following medical dietary guidelines: **[{Medical Guidelines}]**.
> 3. Where possible, optimize the meal for these goals: **[{Health Goals}]**.
> 
> **Output format:** 
> Provide the recipe, and append a short "Nutritionist's Note" explaining exactly how this meal safely fits their required medical guidelines.
