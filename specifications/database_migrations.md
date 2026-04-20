# Specification: Deterministic Database Migrations & Backup Integrity

## 1. Objective
To move away from "Ad-Hoc Bootstrapping" (checking if individual columns exist on boot) and implement a strictly governed **Migration Ledger**. This lean, custom framework ensures 100% deterministic knowledge of the database structure, enabling bulletproof backup, restore, and synchronization protocols without relying on bloated off-the-shelf ORMs inside the mobile environment.

---

## 2. The SchemaMigrations Ledger
A dedicated local table acts as the final source of truth for the database state.

### The Ledger Table
```sql
CREATE TABLE IF NOT EXISTS SchemaMigrations (
  version INTEGER PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### The Migration Array
All structural changes to the SQLite database will be centrally registered in an array object instead of scattered conditional block executions.
```typescript
const SCHEMA_MIGRATIONS = [
  {
    version: 104,
    description: "Added Platoon_ID to support Mesh Networking",
    up: async (db) => { /* execution logic */ }
  }
];
```
On boot, the engine queries the `SchemaMigrations` table, executes any missing migration steps sequentially, and strictly records them in the database ledger.

---

## 3. The Strict Manifest Handshake (Backup & Restore)
Because the ledger exists inside the database itself, the application's Backup and Restore protocols no longer have to guess what structural state a raw JSON dump or SQLite snapshot is in.

When a backup is generated, the highest migration version is injected into the wrapper `manifest.json`. During a Restore operation, the system enforces a strict versioning handshake:
- **Exact Match (`App 105 / Backup 105`)**: Perfect match. Restores safely.
- **Forward Migration (`App 105 / Backup 103`)**: The system restores the raw `v103` data, and instantly replays migrations `104` and `105` against the restored records to pull them forward to the current schema before granting access to the UI.
- **Version Breach (`App 105 / Backup 107`)**: The incoming data possesses a structural configuration that the active App cannot safely read. The system aborts the operation entirely and prompts the user to update the app via the App store before restoring.

---

## 4. Cryptographic Validation (Hash Integrity)
To further fortify the backup manifest against tampering or corruption, the app calculates a deterministic checksum (e.g., extracting the `description` lines of the entire migration ledger into a single `SHA-256` string) and binds it to the manifest. 

When importing external data, if the mathematical shape of the payload does not match the app's internal blueprint hash, the system violently rejects the file, preserving the user's current valid state.

---

## 5. The Schema "Dry-Run" (In-Memory Ghost Instance)
For highly sensitive or destructive data restorations, the system leverages SQLite's `:memory:` instance capability.

Before overwriting the active user's local `documentDirectory` database:
1. The app spins up a transient "Ghost Environment" in memory.
2. It inflates the backup payload into the ghost.
3. It attempts to run the required schema migrations on the ghost.
4. If an unhandled SQLite exception is thrown, the operation is crushed harmlessly, and the real database remains untouched.
5. If the ghost instance reaches terminal velocity successfully, the physical commit is authorized.
