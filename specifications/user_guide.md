# War Cabinet: Tactical Operations Manual 🛡️

Welcome to the **War Cabinet**. This guide will walk you through the procedures for maintaining your stockpile and achieving absolute inventory control.

---

## 1. STRATEGIC INFRASTRUCTURE: CUPBOARDS & SITES
Before you can track your goods, you must define where they are stationed. 
*   **Creating Sites:** Navigate to **Settings > Cabinets**. Here you can define your "Front Line" storage (Kitchen, Larder) and your "Deep Storage" (Cellar, Shed, Garage).
*   **Physical Locations:** Add specific notes (e.g., "Left Shelf, Top Tier") to each cupboard. These notes appear on your batch cards for instant retrieval during a blackout or crisis.

> [!TIP]
> **![Image: Cabinet Settings Screen]**
> Use precise site names to ensure that when an alert triggers, you know exactly which room to run to.

---

## 2. THE CATALOG: ENUMERATED INTELLIGENCE
Your **Catalog** is the database of "Types" (e.g., *Basmati Rice*, *Olive Oil*). 
*   **Hierarchy:** Inventory is organized as **Category > Item Type > Individual Batch**. 
*   **Units & Scaling:** Assign each item to a **Unit Category** (Weight [g], Volume [ml], or Count [Units]). No more mixing milliliters with grams!
*   **Default Sizes & Quick Chips:** Setting a "Default Size" (e.g., 500g for Pasta) makes restocking nearly instant. The app will pre-fill this value, allowing you to bypass typing and save stock in seconds.

---

## 3. SENSOR ARRAYS: SEARCH & FILTERING
The **Unified Command Strip** at the top of your dashboard is your primary situational awareness tool.
*   **Instant Find:** Type any part of an item name or cupboard to "thin out" the list.
*   **Site Switching:** Tap the **Warehouse** icon to isolate your view to a single cupboard (e.g., see *only* what’s in the Cellar).
*   **Urgency Brackets:** Tap the **Clock** icon to reveal the Urgency Modal. This allows you to filter specifically for **EXPIRED ONLY** or **DUE SOON (< 3M)** stock.

> [!IMPORTANT]
> **![Image: Unified Command Strip with Expiry Modal open]**
> Use the "Clear All" (red icon) to instantly reset your sensors and return to the global overview.

---

## 4. FIELD ACTIONS: ADDING, MOVING & AGGREGATING
Managing physical units is designed for high-speed friction-less entry.
*   **Smart Aggregation (The Merge):** If you add a batch of "Rice, 1kg, Jan 2026" and another identical batch already exists in that cupboard, War Cabinet **automatically merges them**. No duplicate rows; just one strong stack of 2 units.
*   **Transferring Stock:** Moving items from the Cellar to the Kitchen? Edit the batch (Pencil icon) and change the **Cabinet**. The app will automatically merge it into the new location’s existing stacks.
*   **+/- Increments:** Use the high-contrast buttons on the Dashboard row for rapid daily adjustments without ever leaving the main screen.

---

## 5. THE FRONT LINE (ONE-CLICK USE)
For your daily staples (Milk, Bread, Wine), use the **Front Line Command Deck**.
*   **Starring Items:** Go to the Catalog and tap the **Star** on your most essential items.
*   **One-Click Consumption:** Tap the item on your Dashboard's Front Line.
*   **The Intelligence:** You don't need to choose which box of rice to open. War Cabinet uses **FEFO Logic** (First-Expiry, First-Out) to find the soonest-expiring batch, tells you exactly **where it is located**, and asks for confirmation to use it.

---

## 6. SMART ALERTS: TACTICAL BRIEFINGS
War Cabinet doesn't just sit there; it watches your back.
*   **The Briefing:** You will receive notifications flagging aggregate totals for items hitting the **1-month** and **3-month** expiry windows.
*   **Actionable Directives:** Tapping a notification **deep-links** you directly into a pre-filtered dashboard of those specific expiring items.
*   **Simulation Mode:** Testing your alerts is essential. Go to the Catalog settings and use the **TEST STOCK ALERT** button to simulate a high-urgency briefing immediately.

---

## 7. SITUATIONAL PRIORITIZATION (SORTING)
The War Cabinet is an instrument of **Urgency**.
*   **Waterfall Sorting:** The dashboard maintains a strict hierarchy: 
    1. Categories with the soonest expiring items float to the **TOP**.
    2. Within categories, Item Types with expiring batches float to the **TOP**.
    3. Within types, individual batches are sorted by date.
*   **Category Rollups:** Even when a category is collapsed, you can see the **Total Quantity** and the date of the **Next Expiry** directly on the header.

> [!NOTE]
> **![Image: Dashboard showing "Next Expiry: THIS MONTH" in bold Red]**
> If a category or item is **Safe (> 3 months)**, the dates will appear in neutral grey to minimize visual noise. 

---

## 🛡️ TEST-BASED FUNCTIONALITY GUIDE

### 📡 Iteration 1: Foundation Operations

#### **Incremental Purging ([TC-1.1])**
The War Cabinet handles batch consumption with a safety-first approach. Tapping the row-level `-` button on a batch with multiple units will first decrement the count. Only when you tap `-` on the final unit will the record be purged from your database—ensuring you never accidentally wipe a stockpile with a single misclick.

#### **Quick-Chip Memory & Rotation ([TC-1.2])**
The app actively "learns" your logistics habits. When you enter a custom size (e.g., `777g`), it is instantly memorized and placed as a "Quick Chip" at the front of the list for that item.
*   **The Rotation:** The system maintains a 3-slot "Active Memory." If you use a 4th custom size, the earliest memory is "Evicted" to keep the interface clean.
*   **The Anchor:** Your 5 standard sizes (500g, 1kg, etc.) always remain locked at the end of the row, accessible via horizontal swipe.
*   **Memory Purge:** If you consume your last batch of a custom-sized item (qty -> 0), the app gracefully clears that custom memory to prevent "Ghost Clutter" in your dropdowns.

#### **Catalog/Inventory Synchronization ([TC-1.3])**
Your Catalog is the "Master Blueprint." Items only appear as selectable options in the "Add Stock" form once they have been defined in the Catalog settings. To protect your data, the Catalog will **block** the deletion of any item type if you currently have stock of it in your cupboards—preventing unmanageable "Ghost Stock."

---
 
## 8. THE MESS HALL (AI CULINARY INTELLIGENCE) 🍱
The **Mess Hall Recipe Generator** is a tactical bridge between your stockpile and professional culinary archives.
*   **The Workflow:** The system pulls **Expiring** and **Available** stock directly from your cupboards. You add your **Preferred** and **Avoid** lists (comma-separated), choose a culinary expert, and select one of three generation modes.
*   **Generation Modes:**
    *   🔬 **EXPERIMENTAL:** Zero-waste AI improvisation.
    *   🧂 **INSPIRED:** Adoption of a specific chef's culinary philosophy and voice.
    *   📚 **AUTHENTIC:** Archival research to find real, published recipe matches with 404 recovery protocols.
*   **The Conflict Guardian:** The system automatically flags security and logic risks (e.g. trying to use an Expiring item that is on your Allergy or Avoid list) before you generate the prompt.
*   **Deployment:** Copy the generated results and paste them into any modern Large Language Model (Gemini, ChatGPT, or Claude) to finalize your meal mission.

---

**"If you are prepared, you shall not fear."** 🛡️
