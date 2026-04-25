# PROJECT GOVERNANCE RULES (PGR)
## Core Operational Principles for War Cabinet Development

This skill file defines the mandatory **Project Governance Rules (PGR)** for the War Cabinet repository. The AI assistant MUST adhere to these six rules for every modification and perform a **PGR Compliance Check** before completing any task.

### 1. Centralized UI Architecture
*   **Rule**: All input forms, modals, and data entry components must be centralized.
*   **Location**: `src/components/`
*   **Prohibition**: No inline forms or fragmented state-management logic within the main app screens (e.g., `catalog.tsx`, `index.tsx`).

### 2. Unified Database Access Layer (DAL)
*   **Rule**: All database interactions (SQL queries, transaction logic) must be encapsulated within the DAL.
*   **Location**: `src/database/`
*   **Structure**: Follow the modular pattern established in `src/database/Cabinets.ts` and `src/database/Ledger.ts`.
*   **Prohibition**: No direct `db.runAsync`, `db.getAllAsync`, or `db.execAsync` calls within UI components.

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
