import * as SQLite from 'expo-sqlite';

export async function initializeDatabase(db: SQLite.SQLiteDatabase) {
  
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS Categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT
    );

    CREATE TABLE IF NOT EXISTS ItemTypes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER,
      name TEXT NOT NULL,
      unit_type TEXT DEFAULT 'weight',
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

    const invCols = await db.getAllAsync<any>('PRAGMA table_info(Inventory)');
    const hasCabinetId = invCols.some(col => col.name === 'cabinet_id');
    if (!hasCabinetId) {
      await db.execAsync('ALTER TABLE Inventory ADD COLUMN cabinet_id INTEGER');
    }

    // Ensure at least one cabinet exists
    const cabRes = await db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM Cabinets');
    if (cabRes && cabRes.count === 0) {
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
      { name: 'Coffee/Tea', icon: 'coffee' }
    ];

    for (const cat of seedCategories) {
      const res = await db.runAsync('INSERT INTO Categories (name, icon) VALUES (?, ?)', cat.name, cat.icon);
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
