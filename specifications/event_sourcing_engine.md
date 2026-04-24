# Specification: Tactical Event Sourcing Engine (Video Tape Architecture)

## 1. Objective
Transition the War Cabinet from a state-oriented (CRUD) architecture to an immutable **Event Sourcing** model. This "Video Tape" architecture ensures that the database is not just a snapshot of "what is," but a verifiable ledger of "how it became." This provides the foundation for perfect audit trails, infinite undo, and seamless P2P multi-user synchronization.

---

## 2. Core Concepts

### 2.1 The Event Store (The Single Source of Truth)
Instead of updating rows in place, every logistical action is recorded as an immutable event.
*   **Table**: `TacticalEvents`
*   **Columns**:
    *   `sequence_id`: INTEGER PRIMARY KEY AUTOINCREMENT (Guarantees order).
    *   `timestamp`: INTEGER (Unix epoch).
    *   `event_type`: TEXT (e.g., `BATCH_CREATED`, `UNIT_CONSUMED`, `CABINET_RELOCATED`).
    *   `payload`: TEXT (JSON blob containing all necessary data to replay the action).
    *   `author_id`: TEXT (UUID of the device/user that performed the action).
    *   `schema_version`: INTEGER (To handle logic changes over time).

### 2.2 The Projections (The Read Models)
The existing tables (`Inventory`, `Cabinets`, `Categories`, `ItemTypes`) become **Projections**.
*   They represent the current accumulated state of all events.
*   They can be completely deleted and rebuilt at any time by replaying the `TacticalEvents` table from the beginning (or from a known checkpoint).

### 2.3 Checkpoints (Strategic Baselines)
To prevent performance degradation (replaying 100,000 logs on every boot), the system utilizes **Snapshots**.
*   A Snapshot is a serialized version of all Read Models at a specific `sequence_id`.
*   **Current implementation**: Our existing "System Archives" (backups) already serve this purpose. We simply need to attach the `last_sequence_id` to the backup metadata.

---

## 3. The Logistics Engine (Dispatcher)

To support this model, all logistical logic must be centralized. Instead of the UI components executing SQL directly, they dispatch **Commands** to the Engine.

### 3.1 Command Flow
1.  **UI Component**: Dispatches `LogisticsEngine.process(COMMAND)`.
2.  **Validation**: The Engine checks if the command is valid (e.g., does the batch exist?).
3.  **Persistence**: The Engine writes the corresponding **Event** to the `TacticalEvents` table.
4.  **Application**: The Engine "Applies" the event to the **Read Models** (updating the standard SQLite tables).

### 3.2 The "Replay" Mechanism (The Video Tape)
To "Rewind" the system to a specific point in time:
1.  Identify the closest Archive (Checkpoint) prior to the target time.
2.  Load the Archive into the SQLite Read Model tables.
3.  Query `TacticalEvents` for all events where `timestamp` is between the Archive and the target time.
4.  Apply those events sequentially using the Engine's `applyEvent` logic.

---

## 4. Conflict Resolution & P2P Readiness

### 4.1 The Logistical Anomaly
In a multi-user P2P environment, conflicts are resolved via the **Anomaly Queue**:
*   If Device A consumes 5 units and Device B consumes 5 units (when only 7 existed), the ledger processes both.
*   The resulting State shows `-3` units.
*   The system flags this as a **"Phantom Deficit"** (Logistical Anomaly).
*   The user is prompted to reconcile the digital ledger with the physical reality (The "Census").

### 4.2 Sync Protocol
*   Devices exchange their `last_sequence_id`.
*   Missing events are transmitted and "Replayed" on the receiving device.
*   Because the events are immutable and ordered, both devices will eventually arrive at the exact same state (Eventual Consistency).

---

## 5. Implementation Roadmap (Phased Transition)

### Phase 1: Logic Centralization
*   Extract all `db.runAsync` calls from `catalog.tsx` and `add.tsx`.
*   Centralize them into `mobile/src/services/LogisticsEngine.ts`.
*   UI buttons now call `LogisticsEngine.consumeBatch()`, `LogisticsEngine.renameCategory()`, etc.

### Phase 2: Event Schema Formalization
*   Upgrade `TacticalLogs` to a formal `TacticalEvents` table with JSON payloads.
*   Ensure every `LogisticsEngine` function writes to this table in the same transaction as the state update.

### Phase 3: The Replay Engine
*   Implement `LogisticsEngine.rebuildFromLedger()`.
*   Verify that deleting the `Inventory` table and running the replay results in the exact same state.

### Phase 4: Time-Travel UI
*   Add a slider or date-picker to the Command Ledger that allows the user to "view state at [Date]".
