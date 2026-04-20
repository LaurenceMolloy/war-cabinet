# Specification: Tactical P2P Mesh PoC (Field Marshall Tier)

## 1. Objective
To construct a "sterile room" Proof-of-Concept (PoC) application that validates local offline-first mesh synchronization for War Cabinet. By building this outside the main codebase, we eliminate UI/React Native noise and focus purely on resolving multi-device data concurrency, mDNS discovery, and Event Sourcing logic.

Once the PoC successfully syncs without data collisions, its engine will form the exact requirements to be integrated into the main War Cabinet application as the premium "Field Marshall" tier.

---

## 2. The Auto-Increment Trap vs. UUIDs
Currently, the War Cabinet `Inventory` table utilizes SQLite's `ID INTEGER PRIMARY KEY AUTOINCREMENT`. This is lethal for true decentralized networking:
- If Operative A (offline) adds an item, it gets assigned `ID 42`.
- If Operative B (offline) adds a different item, it also gets assigned `ID 42`.
- Upon syncing, the databases corrupt due to primary key collisions.

**Core PoC Requirement**: All assets in the sandbox must utilize standard `UUIDv4` identifiers. This guarantees that any device can create assets entirely offline without fear of collision when later connecting to the central mesh.

---

## 3. The Event Sourcing Protocol (Conflict Resolution)
To successfully reconcile data when two offline units perform actions simultaneously (e.g., partial deductions), we cannot sync "Absolute State."

If Operative A deducts 20% from the ammo box, and Operative B deducts 30% from the ammo box, we cannot blindly sync `"Ammo is now 80%"` and `"Ammo is now 70%"`.
Instead, the PoC will utilize an **Action Ledger** (Event Sourcing):
- The database records actions: `[Timestamp: X, Source: Operative_B, Action: DEDUCT, Asset: Ammo, Value: 0.3]`
- When devices reconnect, they exchange ledgers. The Master tallies all ledgers sequentially, accurately resolving the true ammo state to 50% without data loss.

---

## 4. The Toplogy: Commander & Operatives
We will deploy a Hub-and-Spoke model optimized for local networks.

### The Commander (Central Hub)
- Retains the Master Ledger (Source of Truth).
- **Behavior**: Acts as a passive local server on the WiFi network. It binds to a port and broadcasts an **mDNS (Bonjour / NSD)** signal: *"WarCabinet_Command_Node offline-sync available here."*
- **UI Element**: Toggle set to Commander. Displays "Awaiting Operatives."

### The Operative (Hunter/Slave)
- Runs locally, but actively seeks the Master.
- **Behavior**: Does not host a server. Operates mostly in offline mode, dropping actions into a local SQLite `Outbox`. 
- **Discovery**: Automatically scans for the Commander's mDNS heartbeat upon specific triggers, dropping its payload and pulling the synchronized ledger immediately.

---

## 5. Battery Conservation & Zero-Config Auto-Sync
We must avoid running 24/7 background network sockets which will trigger OS-level battery warnings or app suspensions.

**The Trigger-Based Network Sweep**:
1. **Foreground Acquisition**: The moment the user opens the application, it runs an immediate 2-second background network sweep for the Commander. If found, sync occurs invisibly.
2. **Action-Triggered Sync**: If an Operative performs an action (e.g., relocating an asset), the app checks if a websocket connection is available. If YES, it syncs instantly. If NO, it drops the action to the SQLite Outbox.
3. **Ghost Fetch (Optional)**: Implementation of OS-native `BackgroundFetch` routines, allowing the phone to briefly ping the network once every 15-30 minutes without waking the full application.

---

## 6. The PoC Sandbox Implementation Plan
To build this, we will execute `npx create-expo-app` to create a separate application named `war-cabinet-mesh-poc`.

### The Interface
A single, utilitarian debugging screen containing:
- **Role Toggle**: [ COMMANDER ] / [ OPERATIVE ]

### The 3 Test Assets
These specific assets heavily stress-test every edge case of network concurrency:
1. **Ration Pack**
   - Testing basic integer CRUD logic (+1 Add, -1 Consume).
2. **Medical Kit**
   - Testing String Location updates (Relocate ID from 'Bunker' to 'Vehicle').
3. **Ammunition Box**
   - Testing continuous fractional calculations (Partial deductions: -20% or -0.5), enforcing the Event Sourcing conflict resolution logic natively.

---

## 7. The Logistical Anomaly Queue (Error Handling)
Physical inventory creates a unique problem that pure code cannot solve: if two operatives logically consume the exact same physical UUID while offline, but mathematically they must have consumed two *different* items, the system suffers a "digital twin drift."

### Resolution Protocol:
1. **Mathematical Ledger Reality**: The Event Sourcing ledger does not ignore identical deductions. If two Operatives both report `-100%` on Batch X, the ledger processes both, putting the batch at `-100%` (an impossible physical state).
2. **The Anomaly Flag**: The Master device detects that an asset has fallen below `0`. It instantly flags the item and pushes it into the **"Logistical Anomaly Queue."**
3. **Commander Re-Assignment**: The Commander is alerted to a "Phantom Deficit." The UI presents the over-drafted Batch X alongside other AI-suggested possibilities (e.g., identical batches with different expiries). 
4. **Human Reconciliation**: The Commander physically inspects the cabinet and manually redirects the erroneous deduction to the correct Batch ID, thereby re-balancing the mesh ledger natively.

---

## 8. The Platoon Handshake Protocol (Mesh Security)
To prevent cross-contamination (e.g., an Operative accidentally syncing with a different Commander node on a public or friend's WiFi), the mesh strictly enforces a Zero-Trust commissioning process.

### The Pairing Cipher:
1. **Commissioning (QR Code)**: Upon setting up a Commander node, the app generates a unique network identifier (`Platoon_ID`) and a cryptographic password (`Shared_Secret`). The Commander displays this as a QR code.
2. **Operative Recruitment**: To join the mesh, the Operative scans the QR code, permanently storing the Platoon cipher in secure local storage.
3. **Targeted mDNS Filtering**: When the Operative runs a background network sweep, it does not connect to just any War Cabinet node. It explicitly filters mDNS broadcast signals for its specific `Platoon_ID`.
4. **Zero-Trust Connection**: Before any inventory data is transmitted, the Operative must pass the `Shared_Secret` (via encrypted handshake) over the socket. If the hash fails, the Commander drops the connection instantly, preserving absolute data sovereignty.
