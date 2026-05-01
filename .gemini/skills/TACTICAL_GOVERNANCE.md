# PROJECT GOVERNANCE RULES (PGR)
## Core Operational Principles for War Cabinet Development

This skill file defines the mandatory **Project Governance Rules (PGR)** for the War Cabinet repository. The AI assistant MUST adhere to these six rules for every modification and perform a **PGR Compliance Check** before completing any task.

### 1. Centralized UI Architecture
*   **Rule**: All input forms, modals, and data entry components must be centralized.
*   **Location**: `src/components/`
*   **Prohibition**: No inline forms or fragmented state-management logic within the main app screens (e.g., `catalog.tsx`, `index.tsx`).

### 2. Unified Database Access Layer (DAL)

**Location**: `src/database/`

#### 2a. No Raw DB Calls in UI Components
*   **Rule**: No `db.runAsync`, `db.getAllAsync`, `db.getFirstAsync`, or `db.execAsync` calls are permitted directly inside UI components or screens.
*   **Action**: All such calls must be extracted into the appropriate DAL module and called via `Database.<Entity>.<method>(db)`.
*   **Prohibition**: This applies to ALL components — including `ReadinessCommandView`, `logistics.tsx`, `catalog.tsx`, `add.tsx`, and `index.tsx`.

#### 2b. Entity-Based Module Structure (No Screen Aliases)
*   **Rule**: DAL modules are named after **entities** (domain objects), never after screens or features.
*   **Correct**: `ItemTypes.ts`, `Inventory.ts`, `Cabinets.ts`
*   **Prohibited**: `ReadinessDAL.ts`, `ResupplyService.ts`, `CatalogQueries.ts` — these are screen-aliased buckets that guarantee duplication.
*   **Test**: If a method name makes no sense outside the context of one specific screen, it belongs in the wrong module.

#### 2c. Read Methods vs Write Methods
*   **Reads** (queries): Live in entity modules as plain `async` methods, e.g. `ItemTypes.getWithCategories(db)`, `Inventory.getAll(db)`.
*   **Writes** (mutations): Must pass all inputs through the **DAL Bouncer** (`normalizeNumericInput`) before touching the database, and must call `logTacticalAction` + `markModified` after every successful write.
*   **Prohibition**: No write method may skip the Bouncer or Ledger steps.

#### 2d. The DAL Bouncer Pattern (Data Integrity)
*   **Rule**: Any DAL write method that accepts a numeric value from the UI (size, quantity, threshold) must sanitize it via `normalizeNumericInput()` from `src/utils/measurements.ts` before the SQL call.
*   **Purpose**: Prevents unit-string corruption (e.g. `"500g"`) from being persisted to the database regardless of what the UI layer does or does not validate.
*   **Scope**: This applies even when `keyboardType="numeric"` is set on the input — paste and programmatic assignment can bypass keyboard-level enforcement.

#### 2e. Reusability Over Completeness
*   **Rule**: A DAL method should do **one logical thing** that any screen might need. It should not fetch data in a shape that only one screen can consume.
*   **Correct**: `Inventory.getAll(db)` — returns raw batches. All callers aggregate in their own JS.
*   **Prohibited**: `Inventory.getResupplyGroupedByCabinet(db)` — pre-shaped for one screen; useless to others.
*   **Pattern**: Computation (aggregation, ratios, physical quantity maths) belongs in the component or a utility function, not in SQL or the DAL.

#### 2f. Central DAL Export
*   **Rule**: All entity modules must be registered in `src/database/index.ts` and accessed via the `Database` namespace.
*   **Format**: `import { Database } from '../database';` then `Database.ItemTypes.getWithCategories(db)`.
*   **Prohibition**: Do not import individual DAL modules directly (e.g. `import { ItemTypes } from '../database/ItemTypes'`) — always go through the central `Database` object.

### 3. Bi-Directional Event Sourcing
*   **Rule**: Every database "Write" operation must be accompanied by an entry in the Command Ledger.
*   **Format**: Events must record full state transitions: `{ "from": <old_state>, "to": <new_state> }`.
*   **Objective**: Ensure the log supports both forward replication and manual rollback/rewind of the "Logistical Video Tape."

### 4. Schema Version Discipline
*   **Rule**: Any modification to the database schema (adding columns, tables, or altering constraints) requires a version increment.
*   **Location**: Update `CURRENT_SCHEMA_VERSION` in `src/db/sqlite.ts` (or the centralized DB initialization module).

### 5. Backup & Restore Parity
*   **Rule**: Any change to the database schema must be immediately reflected in the Backup/Restore system.
*   **Action**: 
    1. Update the `BackupService` to support new tables/columns.
    2. Synchronize the `BackupManifest` version with the new Database schema version.
    3. Verify that the "Bunker" snapshot logic remains compatible with the new structure.

### 6. Explicit PGR Compliance Acknowledgement
*   **Rule**: The AI must explicitly state how a task met these **PGR** standards in the final response summary.
*   **Requirement**: Confirm the new version numbers (Schema and Manifest) and specifically mention the DAL and Ledger integration as part of the **PGR Compliance Check**.

### 7. Proactive Backup Verification
*   **Rule**: All database "Write" operations (**Add, Edit, and Delete**) within the DAL must trigger a proactive check for scheduled backups.
*   **Implementation**: Call the centralized backup verification method (e.g., `BackupService.proactiveBackupProtocol`) immediately after the ledger entry is recorded for every creation, modification, or removal of an entity.
*   **Objective**: Ensure that high-activity bursts (like inventory audits) are secured immediately, rather than waiting for a time-based fail-safe.

---
**GOVERNANCE ACTIVE**: This document is the primary directive for all AI-led development in the War Cabinet.
