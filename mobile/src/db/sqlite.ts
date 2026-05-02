import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

/**
 * STRATEGIC SCHEMA MANIFEST
 * 
 * VERSIONING DOCTRINE:
 * 1. Increment CURRENT_SCHEMA_VERSION for ANY structural database change.
 * 2. DO NOT update BACKUP_MANIFEST_VERSION in BackupService.ts yet.
 * 3. The resulting version discrepancy in the UI tells us that the backup 
 *    script is lagging and requires an audit.
 * 4. Only after auditing BackupService.ts should the versions be re-aligned.
 */
export const CURRENT_SCHEMA_VERSION = 109;

// Helper to record last action for backup context
export const recordActivity = async (db: any, description: string) => {
  try {
    const ts = new Date().toLocaleString();
    const fullDesc = `${description} (${ts})`;
    await db.runAsync('INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)', ['last_activity_log', fullDesc]);
  } catch (e) {
    console.error('[DB] Failed to record activity:', e);
  }
};

export const logTacticalAction = async (db: any, action: string, type: string, id: number | null, name: string, details?: string) => {
  try {
    const ts = Date.now();
    await db.runAsync(
      'INSERT INTO TacticalLogs (timestamp, action_type, entity_type, entity_id, entity_name, details) VALUES (?, ?, ?, ?, ?, ?)',
      [ts, action, type, id, name, details || null]
    );
    // Legacy support for backup summary
    const dateStr = new Date(ts).toLocaleString();
    await db.runAsync('INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)', ['last_activity_log', `${action} ${type}: ${name} (${dateStr})`]);
    await db.runAsync("UPDATE Settings SET value = ? WHERE key = 'last_modified_time'", [ts.toString()]);
  } catch (e) {
    console.error('[LOG] Failed to record tactical action:', e);
  }
};

export async function initializeDatabase(db: SQLite.SQLiteDatabase) {
  try {
    console.log('[DB] Initializing Cabinet Intelligence...');
    
    // Guard PRAGMA for Web to prevent NoModificationAllowedError
    if (Platform.OS !== 'web') {
      await db.execAsync('PRAGMA foreign_keys = ON;');
    }
  
    // 1. Individual Table Initialization (More robust on Web)
    await db.execAsync(`CREATE TABLE IF NOT EXISTS Categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, icon TEXT, is_mess_hall INTEGER DEFAULT 1);`);
    await db.execAsync(`CREATE TABLE IF NOT EXISTS ItemTypes (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER, name TEXT NOT NULL, unit_type TEXT DEFAULT 'weight', default_size TEXT, default_cabinet_id INTEGER, is_favorite INTEGER DEFAULT 0, interaction_count INTEGER DEFAULT 0, min_stock_level INTEGER, max_stock_level INTEGER, freeze_months INTEGER, default_supplier TEXT, default_product_range TEXT, vanguard_resolved INTEGER DEFAULT 0, FOREIGN KEY(category_id) REFERENCES Categories(id));`);
    await db.execAsync(`CREATE TABLE IF NOT EXISTS Inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, item_type_id INTEGER, quantity INTEGER NOT NULL DEFAULT 1, size TEXT NOT NULL, expiry_month INTEGER, expiry_year INTEGER, entry_month INTEGER NOT NULL, entry_year INTEGER NOT NULL, entry_day INTEGER NOT NULL DEFAULT 1, cabinet_id INTEGER, batch_intel TEXT, supplier TEXT, product_range TEXT, portions_total INTEGER, portions_remaining INTEGER, last_rotated_at INTEGER, FOREIGN KEY(item_type_id) REFERENCES ItemTypes(id));`);
    await db.execAsync(`CREATE TABLE IF NOT EXISTS Cabinets (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, location TEXT, rotation_interval_months INTEGER, default_rotation_cabinet_id INTEGER);`);
    await db.execAsync(`CREATE TABLE IF NOT EXISTS Settings (key TEXT PRIMARY KEY, value TEXT);`);
    await db.execAsync(`CREATE TABLE IF NOT EXISTS BarcodeSignatures (barcode TEXT PRIMARY KEY, item_type_id INTEGER NOT NULL, supplier TEXT, size TEXT, FOREIGN KEY(item_type_id) REFERENCES ItemTypes(id) ON DELETE CASCADE);`);
    await db.execAsync(`CREATE TABLE IF NOT EXISTS TacticalLogs (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER NOT NULL, action_type TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id INTEGER, entity_name TEXT, details TEXT);`);
    await db.execAsync(`CREATE TABLE IF NOT EXISTS Missions (id TEXT PRIMARY KEY, completed_at INTEGER NOT NULL, points INTEGER NOT NULL);`);


  // Migration: add unit_type to ItemTypes if it does not exist
  try {
    const columnsRes = await db.getAllAsync<any>('PRAGMA table_info(ItemTypes)');
    const hasUnitType = columnsRes.some(col => col.name === 'unit_type');
    if (!hasUnitType) {
      await db.execAsync("ALTER TABLE ItemTypes ADD COLUMN unit_type TEXT DEFAULT 'weight'");
      await db.execAsync(`
        UPDATE ItemTypes SET unit_type = 'volume' WHERE name LIKE '%Wine%' OR name LIKE '%Oil%' OR name LIKE '%Sauce%';
      `);
    }

    const hasDefaultSize = columnsRes.some(col => col.name === 'default_size');
    if (!hasDefaultSize) {
      await db.execAsync('ALTER TABLE ItemTypes ADD COLUMN default_size TEXT');
    }

    const hasDefaultCabinet = columnsRes.some(col => col.name === 'default_cabinet_id');
    if (!hasDefaultCabinet) {
      await db.execAsync('ALTER TABLE ItemTypes ADD COLUMN default_cabinet_id INTEGER');
    }

    const hasIsFavorite = columnsRes.some(col => col.name === 'is_favorite');
    if (!hasIsFavorite) {
      await db.execAsync('ALTER TABLE ItemTypes ADD COLUMN is_favorite INTEGER DEFAULT 0');
    }

    const hasInteractionCount = columnsRes.some(col => col.name === 'interaction_count');
    if (!hasInteractionCount) {
      await db.execAsync('ALTER TABLE ItemTypes ADD COLUMN interaction_count INTEGER DEFAULT 0');
    }

    const hasMinStock = columnsRes.some(col => col.name === 'min_stock_level');
    if (!hasMinStock) {
      await db.execAsync('ALTER TABLE ItemTypes ADD COLUMN min_stock_level INTEGER');
    }

    const hasMaxStock = columnsRes.some(col => col.name === 'max_stock_level');
    if (!hasMaxStock) {
      await db.execAsync('ALTER TABLE ItemTypes ADD COLUMN max_stock_level INTEGER');
    }

    // Freezer mode: max months an item type should be frozen
    const hasFreezeMonths = columnsRes.some(col => col.name === 'freeze_months');
    if (!hasFreezeMonths) {
      await db.execAsync('ALTER TABLE ItemTypes ADD COLUMN freeze_months INTEGER');
    }

    const hasDefSupplier = columnsRes.some(col => col.name === 'default_supplier');
    if (!hasDefSupplier) {
      await db.execAsync('ALTER TABLE ItemTypes ADD COLUMN default_supplier TEXT');
    }

    const hasDefRange = columnsRes.some(col => col.name === 'default_product_range');
    if (!hasDefRange) {
      await db.execAsync('ALTER TABLE ItemTypes ADD COLUMN default_product_range TEXT');
    }

    const hasVanguardResolved = columnsRes.some(col => col.name === 'vanguard_resolved');
    if (!hasVanguardResolved) {
      await db.execAsync('ALTER TABLE ItemTypes ADD COLUMN vanguard_resolved INTEGER DEFAULT 0');
    }

    // Migration: add is_mess_hall to Categories if it does not exist
    const catColsRes = await db.getAllAsync<any>('PRAGMA table_info(Categories)');
    const hasMessHall = catColsRes.some(col => col.name === 'is_mess_hall');
    if (!hasMessHall) {
      await db.execAsync('ALTER TABLE Categories ADD COLUMN is_mess_hall INTEGER DEFAULT 1');
    }

    const cabColsRes = await db.getAllAsync<any>('PRAGMA table_info(Cabinets)');
    const hasCabinetType = cabColsRes.some(col => col.name === 'cabinet_type');
    if (!hasCabinetType) {
      await db.execAsync("ALTER TABLE Cabinets ADD COLUMN cabinet_type TEXT DEFAULT 'standard'");
      // Intelligence: Auto-classify existing cabinets based on name patterns
      await db.execAsync("UPDATE Cabinets SET cabinet_type = 'freezer' WHERE name LIKE '%Freezer%' OR name LIKE '%Ice%'");
      await db.execAsync("UPDATE Cabinets SET cabinet_type = 'standard' WHERE cabinet_type IS NULL");
    }
    const hasRotInterval = cabColsRes.some(col => col.name === 'rotation_interval_months');
    if (!hasRotInterval) {
      await db.execAsync('ALTER TABLE Cabinets ADD COLUMN rotation_interval_months INTEGER');
    }
    const hasRotDest = cabColsRes.some(col => col.name === 'default_rotation_cabinet_id');
    if (!hasRotDest) {
      await db.execAsync('ALTER TABLE Cabinets ADD COLUMN default_rotation_cabinet_id INTEGER');
      // Cleanup: Accidental '3' default from previous turn's schema migration
      await db.execAsync('UPDATE Cabinets SET rotation_interval_months = NULL WHERE rotation_interval_months = 3');
    }

    const iInv = await db.getAllAsync<any>('PRAGMA table_info(Inventory)');
    if (!iInv.some(col => col.name === 'cabinet_id')) await db.execAsync('ALTER TABLE Inventory ADD COLUMN cabinet_id INTEGER');
    if (!iInv.some(col => col.name === 'batch_intel')) await db.execAsync('ALTER TABLE Inventory ADD COLUMN batch_intel TEXT');
    if (!iInv.some(col => col.name === 'supplier')) await db.execAsync('ALTER TABLE Inventory ADD COLUMN supplier TEXT');
    if (!iInv.some(col => col.name === 'product_range')) await db.execAsync('ALTER TABLE Inventory ADD COLUMN product_range TEXT');
    if (!iInv.some(col => col.name === 'portions_total')) await db.execAsync('ALTER TABLE Inventory ADD COLUMN portions_total INTEGER');
    if (!iInv.some(col => col.name === 'portions_remaining')) await db.execAsync('ALTER TABLE Inventory ADD COLUMN portions_remaining INTEGER');
    if (!iInv.some(col => col.name === 'last_rotated_at')) await db.execAsync('ALTER TABLE Inventory ADD COLUMN last_rotated_at INTEGER');
    
    const hasEntryDay = iInv.some(col => col.name === 'entry_day');
    if (!hasEntryDay) {
      await db.execAsync('ALTER TABLE Inventory ADD COLUMN entry_day INTEGER NOT NULL DEFAULT 1');
      // Migration: Convert 6-digit last_rotated_at (YYYYMM) to 8-digit (YYYYMM01)
      await db.runAsync("UPDATE Inventory SET last_rotated_at = last_rotated_at * 100 + 1 WHERE last_rotated_at IS NOT NULL AND last_rotated_at < 1000000");
    }

    // Iteration 107: Add TacticalLogs table migration
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS TacticalLogs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER,
        entity_name TEXT,
        details TEXT
      );
    `);

    // Iteration 73: Size Standardization - Robust Cross-Platform Cleanup
    if (Platform.OS !== 'web') {
      const dirtyRows = await db.getAllAsync<{id: number, size: string}>(
        "SELECT id, size FROM Inventory WHERE size IS NOT NULL"
      );
      for (const row of dirtyRows) {
        if (/[^0-9.]/.test(row.size)) {
          const cleanSize = row.size.replace(/[^0-9.]/g, '');
          await db.runAsync("UPDATE Inventory SET size = ? WHERE id = ?", [cleanSize, row.id]);
        }
      }
    }

    // Ensure at least one cabinet exists (unless skipping seeds for E2E)
    const cabRes = await db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM Cabinets');
    const shouldSkipSeeds = typeof window !== 'undefined' && (window as any).__E2E_SKIP_SEEDS__;
    if (cabRes && cabRes.count === 0 && !shouldSkipSeeds) {
      const res = await db.runAsync('INSERT INTO Cabinets (name, location) VALUES (?, ?)', ['Main Cabinet', 'Kitchen']);
      const mainCabId = res.lastInsertRowId;
      // Assign existing inventory to main
      await db.runAsync('UPDATE Inventory SET cabinet_id = ? WHERE cabinet_id IS NULL', [mainCabId]);
    }

    // Seed Settings
    const setRes = await db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM Settings WHERE key = ?', 'month_brief_enabled');
    if (!setRes || (setRes as any).count === 0) {
      await db.runAsync('INSERT OR IGNORE INTO Settings (key, value) VALUES (?, ?)', ['month_brief_enabled', '1']);
    }
    
    // Backup settings
    await db.runAsync('INSERT OR IGNORE INTO Settings (key, value) VALUES (?, ?)', ['auto_backup_enabled', '1']);
    await db.runAsync('INSERT OR IGNORE INTO Settings (key, value) VALUES (?, ?)', ['last_modified_time', Date.now().toString()]);
    await db.runAsync('INSERT OR IGNORE INTO Settings (key, value) VALUES (?, ?)', ['last_backup_time', '0']);
    
    /*
    ## Sixty-Fifth Iteration Feedback
    1. **Data Sovereignty (Unit Decoupling)**: To resolve data integrity issues and improve UX, the system now separates numeric values from their unit labels in the database.
        *   **Self-Healing Migration**: A one-time migration has stripped all manual unit suffixes (`g`, `ml`, `UNIT`) from existing database records, converting them to clean numeric strings.
        *   **Numeric-Only Editing**: Form fields for "Size" and "Default Size" now exclusively handle numbers. Users are no longer forced to manually delete unit characters when updating stock.
        *   **Display Metadata Standard**: Units are now treated as UI-level metadata. The application intelligently appends the correct suffix (`g`, `ml`, or `Unit`) based on the item's `unit_type` during rendering, ensuring a consistent and "clutter-free" interface.
        *   **AI Culinary Compliance**: The recipe generation engine continues to provide full context to the AI by re-attaching units to the prompt string, maintaining accuracy in meal suggestions.
    */

    // Iteration 65: Data Sovereignty Migration (Strip units from DB)
    const i65Migrated = await db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM Settings WHERE key = ?', 'migration_v65_complete');
    if ((!i65Migrated || (i65Migrated as any).count === 0) && Platform.OS !== 'web') {
      // 1. Clean ItemTypes.default_size
      const types = await db.getAllAsync<{id: number, default_size: string}>('SELECT id, default_size FROM ItemTypes WHERE default_size IS NOT NULL');
      for (const t of types) {
        const clean = t.default_size.replace(/[^0-9]/g, '');
        if (clean !== t.default_size) {
          await db.runAsync('UPDATE ItemTypes SET default_size = ? WHERE id = ?', [clean, t.id]);
        }
      }

      // 2. Clean Inventory.size
      const inv = await db.getAllAsync<{id: number, size: string}>('SELECT id, size FROM Inventory WHERE size IS NOT NULL');
      for (const i of inv) {
        const clean = i.size.replace(/[^0-9]/g, '');
        if (clean !== i.size) {
          await db.runAsync('UPDATE Inventory SET size = ? WHERE id = ?', [clean, i.id]);
        }
      }

      await db.runAsync('INSERT INTO Settings (key, value) VALUES (?, ?)', ['migration_v65_complete', '1']);
      console.log('Migration v65 (Data Sovereignty) complete.');
    }

    // Iteration 99: Decouple Portions (Marker Only) - Deferring complex migration to UI trigger
    try {
      const migCheck = await db.getAllAsync<{key: string}>('SELECT key FROM Settings WHERE key = ?', 'migration_v99_complete');
      if (migCheck.length === 0) {
        // Fast marker write to satisfy boot
        await db.runAsync('INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)', ['migration_v99_complete', '1']);
      }
    } catch (e: any) {
      console.error('v99 marker failed', e);
    }
    // Migration: ensure BarcodeSignatures has ON DELETE CASCADE (Native Only)
    if (Platform.OS !== 'web') {
      const hasBarcodeCascade = await db.getAllAsync<any>("PRAGMA foreign_key_list(BarcodeSignatures)");
      if (hasBarcodeCascade.length > 0 && !hasBarcodeCascade.some(fk => fk.on_delete === 'CASCADE')) {
        await db.execAsync(`
          CREATE TABLE BarcodeSignatures_new (
            barcode TEXT PRIMARY KEY,
            item_type_id INTEGER NOT NULL,
            supplier TEXT,
            size TEXT,
            FOREIGN KEY(item_type_id) REFERENCES ItemTypes(id) ON DELETE CASCADE
          );
          INSERT INTO BarcodeSignatures_new SELECT * FROM BarcodeSignatures;
          DROP TABLE BarcodeSignatures;
          ALTER TABLE BarcodeSignatures_new RENAME TO BarcodeSignatures;
        `);
      }
    }

    // Iteration 108: Portion Normalization (Repair Aggregate Data)
    const i108Migrated = await db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM Settings WHERE key = ?', 'migration_v108_complete');
    if (!i108Migrated || (i108Migrated as any).count === 0) {
      console.log('[DB] Repairing Tactical Portions (v108)...');
      // If portions_total was aggregate (e.g. 16 for qty 2), normalize it to per-unit (8)
      await db.runAsync('UPDATE Inventory SET portions_total = portions_total / quantity WHERE quantity > 1 AND portions_total > 0');
      // Ensure portions_remaining is initialized if missing
      await db.runAsync('UPDATE Inventory SET portions_remaining = portions_total * quantity WHERE portions_remaining IS NULL AND portions_total > 0');
      await db.runAsync('INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)', ['migration_v108_complete', '1']);
    }

    // Iteration 109: Mission Initialization
    const i109Migrated = await db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM Settings WHERE key = ?', 'migration_v109_complete');
    if (!i109Migrated || (i109Migrated as any).count === 0) {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS Missions (
          id TEXT PRIMARY KEY,
          completed_at INTEGER NOT NULL,
          points INTEGER NOT NULL
        );
      `);
      await db.runAsync('INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)', ['migration_v109_complete', '1']);
    }


    // Migration: Silently populate freezer expiry (Iteration 102)
    const legacyFreezer = await db.getAllAsync<any>(`
      SELECT inv.id, inv.entry_month, inv.entry_year, it.freeze_months 
      FROM Inventory inv
      JOIN ItemTypes it ON inv.item_type_id = it.id
      JOIN Cabinets cab ON inv.cabinet_id = cab.id
      WHERE cab.cabinet_type = 'freezer' AND inv.expiry_month IS NULL
    `);
    for (const row of legacyFreezer) {
      if (row.entry_month && row.entry_year) {
        const limit = row.freeze_months ?? 6;
        let m = row.entry_month + limit;
        let y = row.entry_year;
        while (m > 12) { m -= 12; y += 1; }
        await db.runAsync('UPDATE Inventory SET expiry_month = ?, expiry_year = ? WHERE id = ?', [m, y, row.id]);
      }
    }

    // Set formal schema version
    await db.runAsync('INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)', ['schema_version', CURRENT_SCHEMA_VERSION.toString()]);

  } catch(e) {
    console.error('Migration failed:', e);
  }

  // Seed Categories if empty
  const countRes = await db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM Categories');
  
  // SUPPORT FOR ZERO-TRUST TESTING: Allow E2E tests to bypass seeding
  const shouldSkipSeeds = typeof window !== 'undefined' && (window as any).__E2E_SKIP_SEEDS__;
  
  if (countRes && countRes.count === 0 && !shouldSkipSeeds) {
    const seedCategories = [
      { name: 'Alcohol', icon: 'wine' },
      { name: 'Sweeteners', icon: 'hexagon' },
      { name: 'Carbohydrates', icon: 'wheat' },
      { name: 'Seasonings', icon: 'leaf' },
      { name: 'Canned Goods', icon: 'box' },
      { name: 'Chinese', icon: 'bowl' },
      { name: 'Indian', icon: 'flame' },
      { name: 'Coffee/Tea', icon: 'coffee' },
      { name: 'Tactical Rations', icon: 'shield-star', is_mess_hall: 0 }
    ];

    for (const cat of seedCategories) {
      try {
        const res = await db.runAsync('INSERT INTO Categories (name, icon, is_mess_hall) VALUES (?, ?, ?)', [cat.name, cat.icon || 'box', (cat as any).is_mess_hall !== undefined ? (cat as any).is_mess_hall : 1]);
        const catId = res.lastInsertRowId;
        
        let items: {name: string, unit: string}[] = [];
        if (cat.name === 'Alcohol') items = [{name:'Red Wine', unit:'volume'}, {name:'White Wine', unit:'volume'}, {name:'Rose Wine', unit:'volume'}];
        if (cat.name === 'Sweeteners') items = [{name:'Honey', unit:'weight'}];
        if (cat.name === 'Carbohydrates') items = [{name:'Basmati Rice', unit:'weight'}, {name:'Tagliatelle', unit:'weight'}, {name:'Penne Pasta', unit:'weight'}, {name:'Noodles', unit:'weight'}];
        if (cat.name === 'Seasonings') items = [{name:'Salt', unit:'weight'}, {name:'Black Pepper', unit:'weight'}, {name:'Mixed Herbs', unit:'weight'}, {name:'Oregano', unit:'weight'}, {name:'Paprika', unit:'weight'}, {name:'Coriander', unit:'weight'}, {name:'Cumin', unit:'weight'}];
        if (cat.name === 'Canned Goods') items = [{name:'Tomatoes', unit:'weight'}, {name:'Passata', unit:'weight'}, {name:'Tomato Puree', unit:'weight'}, {name:'Sweetcorn', unit:'weight'}, {name:'Kidney Beans', unit:'weight'}, {name:'Tuna', unit:'weight'}];
        if (cat.name === 'Chinese') items = [{name:'Soy Sauce', unit:'volume'}, {name:'Sesame Oil', unit:'volume'}, {name:'Rice Wine', unit:'volume'}];
        if (cat.name === 'Indian') items = [{name:'Madras Curry Sauce', unit:'weight'}];
        if (cat.name === 'Coffee/Tea') items = [{name:'Instant Coffee', unit:'weight'}, {name:'Tea bags', unit:'count'}];

        for (const item of items) {
          await db.runAsync('INSERT INTO ItemTypes (category_id, name, unit_type) VALUES (?, ?, ?)', [catId, item.name, item.unit]);
        }
      } catch (seedErr) {
        console.warn('[DB] Seeding category failed:', cat.name, seedErr);
      }
    }
  }

    // Returns nothing
  } catch (globalErr) {
    console.error('[DB] CRITICAL HANDSHAKE FAILURE:', globalErr);
  }
}

export async function markModified(db: any) {
  await db.runAsync("UPDATE Settings SET value = ? WHERE key = 'last_modified_time'", [Date.now().toString()]);
}

/**
 * MISSION DEFINITIONS & POINT VALUES
 */
export const MISSION_DATA = {
  FIRST_BATCH: { id: 'FIRST_BATCH', points: 10, label: 'Add First Batch' },
  FIRST_SCAN: { id: 'FIRST_SCAN', points: 15, label: 'Intelligence Scan (Barcode)' },
  FIRST_OCR: { id: 'FIRST_OCR', points: 20, label: 'Surveillance (OCR Expiry)' },
  FIRST_HEALTH: { id: 'FIRST_HEALTH', points: 15, label: 'Medical Clearance (Health Profile)' },
  FIRST_RECIPE: { id: 'FIRST_RECIPE', points: 20, label: 'Mess Hall Deployment (Recipe)' },
  FIRST_RECRUIT: { id: 'FIRST_RECRUIT', points: 20, label: 'Field Recruitment (Share)' }
};

export type MissionId = keyof typeof MISSION_DATA;

/**
 * Record a mission as completed if it hasn't been already.
 */
export async function completeMission(db: any, missionId: MissionId) {
  try {
    const existing = await db.getFirstAsync('SELECT id FROM Missions WHERE id = ?', [missionId]);
    if (!existing) {
      const mission = MISSION_DATA[missionId];
      await db.runAsync(
        'INSERT INTO Missions (id, completed_at, points) VALUES (?, ?, ?)',
        [mission.id, Date.now(), mission.points]
      );
      console.log(`[MISSION] ${mission.label} COMPLETED!`);
      return true; // Newly completed
    }
    return false;
  } catch (e) {
    console.error('[MISSION] Failed to record mission:', e);
    return false;
  }
}

/**
 * Calculate the current rank and readiness score.
 */
export async function getReadinessStats(db: any) {
  try {
    const res = await db.getFirstAsync<{ total_points: number }>('SELECT SUM(points) as total_points FROM Missions');
    let points = res?.total_points || 0;
    
    // E2E TESTING HOOK: Checks the database Settings table for an override.
    // This is Worker-compatible (unlike localStorage).
    try {
      const forceRank = await db.getFirstAsync<{value: string}>("SELECT value FROM Settings WHERE key = 'force_rank'");
      if (forceRank?.value === 'SERGEANT') points = Math.max(points, 60);
      if (forceRank?.value === 'VETERAN') points = Math.max(points, 90);
      if (forceRank?.value === 'GENERAL') points = Math.max(points, 500);
    } catch (e) {}
    
    let rank = 'CADET';
    let icon = 'chevron-triple-down';
    
    if (points >= 90) { rank = 'VETERAN'; icon = 'crown'; }
    else if (points >= 60) { rank = 'SERGEANT'; icon = 'account-star'; }
    else if (points >= 40) { rank = 'CORPORAL'; icon = 'chevron-double-up'; }
    else if (points >= 20) { rank = 'PRIVATE'; icon = 'chevron-up'; }
    else if (points >= 10) { rank = 'RECRUIT'; icon = 'chevron-down'; }
    
    return {
      points,
      percent: Math.min(points, 100),
      rank,
      icon
    };
  } catch (e) {
    console.error('[MISSION] Failed to calculate readiness:', e);
    return { points: 0, percent: 0, rank: 'CADET', icon: 'chevron-triple-down' };
  }
}
