# Specification: Schema Manifest Protocol (SMP)

## Objective
To establish a self-documenting, forensic history of the application database structure directly within the SQLite state. This allows for instant "Tactical Delta" analysis during restores, forensic audits, and UI version reporting.

## 1. Database Infrastructure
A new authoritative table will be established to track the evolution of the state.

```sql
CREATE TABLE IF NOT EXISTS SchemaManifest (
  version INTEGER PRIMARY KEY,
  manifest_type TEXT NOT NULL, -- 'STRUCTURAL', 'DATA_REPAIR', 'LOGIC'
  summary TEXT NOT NULL,
  technical_delta TEXT,        -- Formatted diff notation
  deployed_at INTEGER NOT NULL -- Unix timestamp
);
```

## 2. The Tactical Delta Notation
To ensure human-readable and machine-parsable clarity, all structural changes will use the following prefix notation:

- **`[+]` Addition**: New tables, columns, or indices.
- **`[*]` Modification**: Altered data types, renamed entities, or changed constraints.
- **`[-]` Deprecation**: Removed or disabled entities.
- **`[~]` Data Repair**: Structural consistency was maintained, but row values were normalized/scrubbed.

### Example Entries:
- `[+] TABLE TacticalLogs (id, timestamp, ...)`
- `[~] FIELD Inventory.portions_total (normalized per-unit)`
- `[*] FIELD ItemTypes.unit_type (added 'count' default)`

## 3. Implementation Workflow (sqlite.ts)
Every version bump in `CURRENT_SCHEMA_VERSION` must be accompanied by a corresponding registration in the manifest.

```typescript
// Example migration block
if (version < 109) {
  // 1. Execute SQL
  await db.execAsync('ALTER TABLE ...');
  
  // 2. Register Manifest
  await registerSchemaManifest(db, 109, 'STRUCTURAL', 'Description', '[+] FIELD ...');
}
```

## 4. UI Integration (Strategic Build Manifest)
The existing **Build Manifest** in the "Backups" tab will be upgraded to support "Forensic Drill-down."
- Tapping the version number (e.g., `v108`) will launch a modal showing the `summary` and `technical_delta` for that version.
- This ensures the user (and the AI assistant) can immediately understand the capabilities of a restored archive.

---
**Status**: PARKED / READY FOR DEPLOYMENT
**Version**: 1.0.0
**Baseline**: v108
