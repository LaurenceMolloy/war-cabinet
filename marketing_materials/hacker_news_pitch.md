# Show HN: War Cabinet – A Local-First, Zero-Cloud Household Logistics Engine

**Title**: Show HN: War Cabinet – A local-first, zero-cloud household logistics engine
**Target Audience**: Hacker News (Founders, Engineers, Data Sovereignty Advocates)

---

Hey HN,

I got tired of household inventory and "smart pantry" apps that harvest personal data, lock core features behind $9.99/mo SaaS subscriptions, break the second AWS has a hiccup, and silently fail the moment human error enters the equation. 

So I spent the last few months over-engineering a household logistics app built like a tank. I call it **War Cabinet**.

It’s currently live, and I’m actively preparing an offline P2P mesh update. I built this around a core philosophy: software should adapt to physical human error, not the other way around. I’d love for this community to pull the UX and logistical logic apart.

Here is what I built and why:

### 1. Zero-Cloud & True Data Sovereignty
Your data never leaves your perimeter. The entire engine runs on local SQLite databases on your device. We use a military-inspired ranking system for pricing (Cadet -> Private -> Sergeant), but it's entirely **One-Time Purchases**. No subscriptions. You buy the capability, you own it forever.

### 2. The Physical Reality Engine (Error Mitigation)
Most inventory apps fail when reality conflicts with the database. If your partner accidentally consumes "Batch A" when they physically consumed "Batch B", standard CRUD apps silently corrupt your expiry data. 
We built an Event Sourced ledger. If the math detects an impossible physical state (e.g., a double-deduction pushing an asset to -100%), it doesn't crash or overwrite. It flags the item and pushes it into a **Logistical Anomaly Queue**. The app then alerts the Commander device, suggesting highly probable alternatives ("Did they mean to consume *this* batch of ammo expiring in 5 days instead?"), forcing manual human reconciliation.

### 3. Deep Logistical Intelligence
It doesn't just tell you that you have 4 tins of beans. It applies deep metrics to your consumption habits:
- **Burn-Rate Forecasting**: Tells you exactly how many "Days of Cover" you have left on critical supplies based on moving averages.
- **Predictive Waste Analysis**: Intersects your expiry dates against your actual consumption rate to warn you *before* food goes bad.
- **Cost Intelligence**: A personal inflation tracker that tags the price of incoming batches, so you know exactly how the cost of your "baseline survival" is trending independently of government CPI.

### 4. The Mess Hall (AI Procurement)
A secure AI sandbox that reads your local inventory state and acts as your Quartermaster. It doesn't just suggest fun recipes; it specifically targets items nearing their expiry date to enforce zero-waste tactical meals. 

### 5. In-Flight: P2P Platoon Mesh (The Field Marshall Tier)
Most apps solve multi-device syncing with a centralized cloud wrapper. We are building a pure Offline-First P2P Mesh sync for up to 3 household devices. Using mDNS discovery and UUID ledgers, the "Master" node passively broadcasts on your local WiFi, and "Slave" nodes autonomously sync their offline action-ledgers during brief foreground sweeps. Zero-config, zero-cloud.

---

I know this community has strong opinions on local-first software, data sovereignty, and anti-SaaS pricing models.

The app is built defensively to catch every conceivable edge case I could think of. I invite you to tear the **product concept and logistical logic** apart. What physical-world human errors did I miss? Where does the UX fall short of a true 'military-grade' tool? 

I’ll be in the comments all day to answer questions, take your feedback, and defend my design choices!

*(Link to App Store / Repo / Landing Page here)*
