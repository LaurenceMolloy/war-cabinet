import * as SQLite from 'expo-sqlite';

export async function initializeDatabase(db: SQLite.SQLiteDatabase) {
  
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS Categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT,
      is_mess_hall INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS ItemTypes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER,
      name TEXT NOT NULL,
      unit_type TEXT DEFAULT 'weight',
      default_size TEXT,
      default_cabinet_id INTEGER,
      is_favorite INTEGER DEFAULT 0,
      interaction_count INTEGER DEFAULT 0,
      min_stock_level INTEGER,
      max_stock_level INTEGER,
      freeze_months INTEGER,
      default_supplier TEXT,
      default_product_range TEXT,
      FOREIGN KEY(category_id) REFERENCES Categories(id)
    );

    CREATE TABLE IF NOT EXISTS Inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_type_id INTEGER,
      quantity INTEGER NOT NULL DEFAULT 1,
      size TEXT NOT NULL,
      expiry_month INTEGER,
      expiry_year INTEGER,
      entry_month INTEGER NOT NULL,
      entry_year INTEGER NOT NULL,
      cabinet_id INTEGER,
      batch_intel TEXT,
      supplier TEXT,
      product_range TEXT,
      FOREIGN KEY(item_type_id) REFERENCES ItemTypes(id)
    );

    CREATE TABLE IF NOT EXISTS Cabinets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      location TEXT
    );

    CREATE TABLE IF NOT EXISTS Settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Migration: add unit_type to ItemTypes if it does not exist
  try {
    const columnsRes = await db.getAllAsync<any>('PRAGMA table_info(ItemTypes)');
    const hasUnitType = columnsRes.some(col => col.name === 'unit_type');
    if (!hasUnitType) {
      await db.execAsync('ALTER TABLE ItemTypes ADD COLUMN unit_type TEXT DEFAULT "weight"');
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

    // Migration: add is_mess_hall to Categories if it does not exist
    const catColsRes = await db.getAllAsync<any>('PRAGMA table_info(Categories)');
    const hasMessHall = catColsRes.some(col => col.name === 'is_mess_hall');
    if (!hasMessHall) {
      await db.execAsync('ALTER TABLE Categories ADD COLUMN is_mess_hall INTEGER DEFAULT 1');
    }

    const cabColsRes = await db.getAllAsync<any>('PRAGMA table_info(Cabinets)');
    const hasCabinetType = cabColsRes.some(col => col.name === 'cabinet_type');
    if (!hasCabinetType) {
      await db.execAsync('ALTER TABLE Cabinets ADD COLUMN cabinet_type TEXT DEFAULT "standard"');
    }

    const invCols = await db.getAllAsync<any>('PRAGMA table_info(Inventory)');
    const hasCabinetId = invCols.some(col => col.name === 'cabinet_id');
    if (!hasCabinetId) {
      await db.execAsync('ALTER TABLE Inventory ADD COLUMN cabinet_id INTEGER');
    }

    const hasBatchIntel = invCols.some(col => col.name === 'batch_intel');
    if (!hasBatchIntel) {
      await db.execAsync('ALTER TABLE Inventory ADD COLUMN batch_intel TEXT');
    }

    const hasSupplier = invCols.some(col => col.name === 'supplier');
    if (!hasSupplier) {
      await db.execAsync('ALTER TABLE Inventory ADD COLUMN supplier TEXT');
    }

    const hasProductRange = invCols.some(col => col.name === 'product_range');
    if (!hasProductRange) {
      await db.execAsync('ALTER TABLE Inventory ADD COLUMN product_range TEXT');
    }

    // Iteration 73: Size Standardization - Robust Cross-Platform Cleanup
    const dirtyRows = await db.getAllAsync<{id: number, size: string}>(
      "SELECT id, size FROM Inventory WHERE size IS NOT NULL"
    );
    for (const row of dirtyRows) {
      if (/[^0-9.]/.test(row.size)) {
        const cleanSize = row.size.replace(/[^0-9.]/g, '');
        await db.runAsync("UPDATE Inventory SET size = ? WHERE id = ?", [cleanSize, row.id]);
      }
    }

    // Ensure at least one cabinet exists (unless skipping seeds for E2E)
    const cabRes = await db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM Cabinets');
    const shouldSkipSeeds = typeof window !== 'undefined' && (window as any).__E2E_SKIP_SEEDS__;
    if (cabRes && cabRes.count === 0 && !shouldSkipSeeds) {
      const res = await db.runAsync('INSERT INTO Cabinets (name, location) VALUES (?, ?)', 'Main Cabinet', 'Kitchen');
      const mainCabId = res.lastInsertRowId;
      // Assign existing inventory to main
      await db.runAsync('UPDATE Inventory SET cabinet_id = ? WHERE cabinet_id IS NULL', mainCabId);
    }

    // Seed Settings
    const setRes = await db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM Settings WHERE key = ?', 'month_brief_enabled');
    if (!setRes || (setRes as any).count === 0) {
      await db.runAsync('INSERT OR IGNORE INTO Settings (key, value) VALUES (?, ?)', 'month_brief_enabled', '1');
    }
    
    // Backup settings
    await db.runAsync('INSERT OR IGNORE INTO Settings (key, value) VALUES (?, ?)', 'auto_backup_enabled', '1');
    await db.runAsync('INSERT OR IGNORE INTO Settings (key, value) VALUES (?, ?)', 'last_modified_time', Date.now().toString());
    await db.runAsync('INSERT OR IGNORE INTO Settings (key, value) VALUES (?, ?)', 'last_backup_time', '0');
    
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
    if (!i65Migrated || (i65Migrated as any).count === 0) {
      // 1. Clean ItemTypes.default_size
      const types = await db.getAllAsync<{id: number, default_size: string}>('SELECT id, default_size FROM ItemTypes WHERE default_size IS NOT NULL');
      for (const t of types) {
        const clean = t.default_size.replace(/[^0-9]/g, '');
        if (clean !== t.default_size) {
          await db.runAsync('UPDATE ItemTypes SET default_size = ? WHERE id = ?', clean, t.id);
        }
      }

      // 2. Clean Inventory.size
      const inv = await db.getAllAsync<{id: number, size: string}>('SELECT id, size FROM Inventory WHERE size IS NOT NULL');
      for (const i of inv) {
        const clean = i.size.replace(/[^0-9]/g, '');
        if (clean !== i.size) {
          await db.runAsync('UPDATE Inventory SET size = ? WHERE id = ?', clean, i.id);
        }
      }

      await db.runAsync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'migration_v65_complete', '1');
      console.log('Migration v65 (Data Sovereignty) complete.');
    }

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
      const res = await db.runAsync('INSERT INTO Categories (name, icon, is_mess_hall) VALUES (?, ?, ?)', cat.name, cat.icon || 'box', (cat as any).is_mess_hall !== undefined ? (cat as any).is_mess_hall : 1);
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
        await db.runAsync('INSERT INTO ItemTypes (category_id, name, unit_type) VALUES (?, ?, ?)', catId, item.name, item.unit);
      }
    }
  }

  // Returns nothing
}

export async function markModified(db: any) {
  await db.runAsync("UPDATE Settings SET value = ? WHERE key = 'last_modified_time'", Date.now().toString());
}
