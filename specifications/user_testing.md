# War Cabinet: Global Operational UX Testing Scenarios

## Overview
These scenarios test the **War Cabinet** as a complete logistics system. Do not provide testers with step-by-step instructions. Observe if they can navigate the "Chain of Command" (Inventory -> Logistics -> Mess Hall) naturally to solve these real-world kitchen problems.

---

## PILLAR 1: INVENTORY INTEL (Stock Management)

### Scenario 1a: Initial Rations

**Objective**: You've just come back from a big shop. You have 
a. 4 **500g bags of Penne Pasta**, expiring Feb 2027
b. 2 1kg tins of **Chopped Tomatoes**, expiring March 2027
c. A **Whole Chicken** weighing 2.17kg. 

You plan to store the tomatoes in the pantry, the pasta as emergency stocks in a cellar cupboard and freeze the chicken.

TASK: Add these into your kitchen inventory in the correct cabinets.

### Scenario 1b: Corrections

As you are taking the pasta out of the shopping bag, you realise that one of your Penne Pasta bags is expiring in **Jan 2027**, not Feb 2027. 

TASK: Correct this error in the app.

### Scenario 1c: Change of plans

Having recorded them as being stored in the cellar you decide that you should keep these bags of pasta inside afterall. 

TASK: Move the stock between cupboards in the app.

### Scenario 1d: Partial Stock Rotation

A few weeks later, you have **8 bags of Rice** stored in the cellar, all sharing the same expiry date. You're heading upstairs and want to bring **2 bags** into the kitchen cabinet for this week's cooking — but leave the remaining 6 in the cellar.

TASK: Move only 2 of the 8 bags to a different cabinet, keeping the rest where they are.

### Scenario 2: The Intelligence Search (Where is it?)
**Objective**: You know you bought **Curry Paste** two weeks ago, but you can't remember where you put it. Use the app to locate exactly which cabinet it's in.

### Scenario 3: Bulk Deployment
**Objective**: You've bought a 12-pack of **Coke**. You want to add them to your Fridge quickly without entering each one manually. Find the fastest way to record a high-quantity intake.

---

## PILLAR 2: LOGISTICS MANEUVERS (Saving & Moving Stock)

### Scenario 4: The Freezer Save
**Objective**: You have **Beef Mince** in the fridge that expires *tonight*. You aren't going to cook it. Move it to the **Freezer** within the app so the system knows it's "safe" for another 3 months.

### Scenario 5: The Great Re-Org (Movement)
**Objective**: You've decided to move your **Flour** from the "Pantry" to a new "Baking" cupboard you've just set up. Re-organize your digital inventory to reflect its new physical home — without losing any of its stored details.

### Scenario 6: Mirror Synchronization (Backup)
**Objective**: You are worried about losing your phone. Find a way to create a "Mirror" (Backup) of your database to a folder on your device.

---

## PILLAR 3: THE COMMAND CENTRE (Rank & Trials)

### Scenario 7: Reaching the Frontier (Limits)
**Objective**: You are a **Cadet** (free rank). You want to add a **4th Cabinet**. Encounter the system limit and find out how to "Promote" your account to unlock more space.

### Scenario 8: The Trial Countdown
**Objective**: Find out **exactly how much time** you have left before your tactical trial expires.

---

## PILLAR 4: ROTATION & CONSUMPTION (Daily Chores)

### Scenario 9: The Empty Ration (Consumption)
**Objective**: You just finished the **Bag of Pasta**. How do you tell the system it's gone so it doesn't keep showing up or being suggested for recipes?

### Scenario 10: The "Date Reconciliation" (Correction)
**Objective**: You realize you misread the date on the **Milk**. It actually expires tomorrow, not today. Correct the date without deleting the whole item.

### Scenario 11: Stock Rotation (FIFO)
**Objective**: You've bought **New Kidney Beans**. You want to put them in the "Pantry" but you still have **Old Kidney Beans** in there from a previous shop. Ensure the app correctly alerts you to the *old* ones first so you use them up before opening the new ones.

---

## PILLAR 5: THE MESS HALL (Recipe Drafting)

### Scenario 12: The Basic Clearance
**Objective**: You have **Chicken Thighs** and **Milk** expiring today. Use the Mess Hall to generate a mission briefing for an AI chef.

### Scenario 13: Establishing a Beachhead (Personalization)
**Objective**: You *always* have **Garlic** and **Olive Oil** in your kitchen. Set up the app so these are permanently available as "Fridge Staples" for all future missions — without having to type them every time.

### Scenario 14: The Mid-Mission Pivot (Scorched Earth)
**Objective**: You started planning a beef dish, but realized the beef is off. Quickly **reset your draft list** and pivot to a Vegetarian mission using only what's currently expiring.

### Scenario 15: Tactical Purge (Cleaning the Vocabulary)
**Objective**: You previously added "Garrlic" (a typo) to your kitchen. Every time you type "Ga...", the typo appears as a suggestion. Find a way to **permanently delete** this typo so it never appears again.

---

## Observational Checklist for Researchers

*   **Move vs. Delete**: For Scenario 5, does the user find the Cabinet dropdown within the Edit screen, or do they feel forced to delete and re-add the item?
*   **Navigation Logic**: Does the user attempt to "Drag and Drop" items between cabinets (not supported), or do they naturally look for a menu-based move?
*   **Update vs. Delete**: In Scenario 10, do they find the "Edit" action for an item, or do they delete and re-enter?
*   **Batching Awareness**: In Scenario 11, does the user realize they can have two separate entries for the same item with different dates, or do they try to "overwrite" the old one?
*   **Friction Points**: Note any moment the user sighs, pauses, or asks "How do I...?" during stock rotation — these are our next automation targets.
*   **Visual Cues**: Do they understand the "Logistics Red" (Expires soon) vs. "Freezer Blue" (Safe) colour coding?
*   **Vocabulary Management**: Does the user find the Trash icon in the autocomplete suggestions when asked to purge a typo (Scenario 15)?
