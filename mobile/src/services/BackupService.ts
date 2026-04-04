import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

const getBackupDir = () => (FileSystem.documentDirectory || "") + 'backups/';
const MAX_BACKUPS = 5;

export interface BackupMetadata {
  name: string;
  timestamp: number;
  uri: string;
}

export const BackupService = {
  /**
   * Generates a tactical backup (JSON + CSV).
   * Slotted into the rolling 5-file stack.
   */
  async createBackup(db: SQLiteDatabase, isManual = false) {
    const backupDir = getBackupDir();
    if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
      console.warn('Local snapshots are not supported on Web. Use tactical export instead.');
      return null;
    }
    try {
      if (!(await FileSystem.getInfoAsync(backupDir)).exists) {
        await FileSystem.makeDirectoryAsync(backupDir, { intermediates: true });
      }

      const timestamp = Date.now();
      const dateStr = new Date(timestamp).toISOString().replace(/[:.]/g, '-');
      
      // 1. DATA COLLECTION (JSON)
      const categories = await db.getAllAsync('SELECT * FROM Categories');
      const itemTypes = await db.getAllAsync('SELECT * FROM ItemTypes');
      const inventory = await db.getAllAsync('SELECT * FROM Inventory');
      const cabinets = await db.getAllAsync('SELECT * FROM Cabinets');
      const settings = await db.getAllAsync('SELECT * FROM Settings');

      const backupData = {
        version: '1.0',
        timestamp,
        tables: {
          Categories: categories,
          ItemTypes: itemTypes,
          Inventory: inventory,
          Cabinets: cabinets,
          Settings: settings
        }
      };

      const jsonUri = `${backupDir}war-cabinet-backup-${dateStr}.json`;
      const jsonContent = JSON.stringify(backupData, null, 2);
      await FileSystem.writeAsStringAsync(jsonUri, jsonContent);

      // 2. SPREADSHEET GENERATION (CSV)
      let csvContent = "";
      const flatRows = await db.getAllAsync<any>(`
        SELECT c.name as Category, it.name as Item, i.size as Size, i.quantity as Qty, 
               it.min_stock_level as MinThreshold, it.max_stock_level as MaxThreshold,
               cab.name as Cabinet, cab.location as Location,
               i.entry_month || '/' || i.entry_year as EntryDate,
               CASE WHEN i.expiry_month IS NOT NULL THEN i.expiry_month || '/' || i.expiry_year ELSE 'N/A' END as ExpiryDate,
               CASE 
                 WHEN i.expiry_year < strftime('%Y', 'now') OR (i.expiry_year = strftime('%Y', 'now') AND i.expiry_month < strftime('%m', 'now')) THEN 'EXPIRED'
                 WHEN i.expiry_year = strftime('%Y', 'now') AND i.expiry_month = strftime('%m', 'now') THEN 'URGENT (THIS MONTH)'
                 WHEN (i.expiry_year * 12 + i.expiry_month) - (strftime('%Y', 'now') * 12 + strftime('%m', 'now')) <= 3 THEN 'WARNING (1-3M)'
                 ELSE 'SAFE'
               END as Status
        FROM Inventory i
        JOIN ItemTypes it ON i.item_type_id = it.id
        JOIN Categories c ON it.category_id = c.id
        LEFT JOIN Cabinets cab ON i.cabinet_id = cab.id
        ORDER BY c.name, it.name, i.expiry_year, i.expiry_month
      `);

      if (flatRows.length > 0) {
        const headers = Object.keys(flatRows[0]).join(',');
        const rows = flatRows.map(row => 
          Object.values(row).map(val => `"${val}"`).join(',')
        ).join('\n');
        csvContent = `${headers}\n${rows}`;
        
        const csvUri = `${backupDir}war-cabinet-inventory-${dateStr}.csv`;
        await FileSystem.writeAsStringAsync(csvUri, csvContent);
      }

      // 2.5 PERSISTENT MIRRORING (ANDROID ONLY - WATERFALL SHIFT PROTOCOL)
      if (Platform.OS === 'android') {
        const settingsRes = await db.getFirstAsync<{value: string}>("SELECT value FROM Settings WHERE key = 'persistence_mirror_uri'");
        if (settingsRes?.value) {
          try {
            const mirrorUri = settingsRes.value;
            const mirrorFiles = await FileSystem.StorageAccessFramework.readDirectoryAsync(mirrorUri);

            // A. CASCADING SHIFT (04->05, 03->04, 02->03, 01->02)
            // We work backwards to avoid overwriting slots before they are shifted
            for (let i = 4; i >= 1; i--) {
              const currS = i.toString().padStart(2, '0');
              const nextS = (i + 1).toString().padStart(2, '0');
              
              const currJSON = mirrorFiles.find(f => f.includes(`${currS}-WC-BACKUP.json`));
              const currCSV = mirrorFiles.find(f => f.includes(`${currS}-WC-REPORT.csv`));

              if (currJSON) {
                // Read and Migrate to next slot
                const content = await FileSystem.readAsStringAsync(currJSON);
                const nextFile = await FileSystem.StorageAccessFramework.createFileAsync(mirrorUri, `${nextS}-WC-BACKUP`, 'application/json');
                await FileSystem.writeAsStringAsync(nextFile, content);
                // The old currJSON will be cleared/overwritten later in the cascade or replaced by 01
              }
              
              if (currCSV) {
                const content = await FileSystem.readAsStringAsync(currCSV);
                const nextFile = await FileSystem.StorageAccessFramework.createFileAsync(mirrorUri, `${nextS}-WC-REPORT`, 'text/csv');
                await FileSystem.writeAsStringAsync(nextFile, content);
              }
            }

            // B. INSERT NEW DATA AT 01 (Clears previous 01 entries as part of write/create cycle)
            // We MUST delete any existing slot 01 to prevent '01 (1).json' behavior
            const p1JSON = mirrorFiles.find(f => f.includes(`01-WC-BACKUP.json`));
            const p1CSV = mirrorFiles.find(f => f.includes(`01-WC-REPORT.csv`));
            if (p1JSON) await FileSystem.StorageAccessFramework.deleteAsync(p1JSON);
            if (p1CSV) await FileSystem.StorageAccessFramework.deleteAsync(p1CSV);

            const bFile = await FileSystem.StorageAccessFramework.createFileAsync(mirrorUri, `01-WC-BACKUP`, 'application/json');
            await FileSystem.writeAsStringAsync(bFile, jsonContent);
            if (csvContent) {
              const rFile = await FileSystem.StorageAccessFramework.createFileAsync(mirrorUri, `01-WC-REPORT`, 'text/csv');
              await FileSystem.writeAsStringAsync(rFile, csvContent);
            }

            // C. STRATEGIC CLEANUP (Remove legacy 'war-cabinet-backup-' naming convention)
            const legacies = mirrorFiles.filter(f => f.includes('war-cabinet-backup-') || f.includes('war-cabinet-inventory-'));
            for (const leg of legacies) {
              await FileSystem.StorageAccessFramework.deleteAsync(leg).catch(() => {});
            }

          } catch (e) {
            console.warn("Mirroring failed (Waterfall):", e);
          }
        }
      }

      // 3. UPDATE METADATA
      await db.runAsync("INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)", "last_backup_time", timestamp.toString());

      // 4. ROTATION
      await this.rotateBackups();

      return { jsonUri, timestamp };
    } catch (error) {
      console.error('Backup generation failed:', error);
      throw error;
    }
  },

  /**
   * Ensures only the last N backups are kept.
   */
  async rotateBackups() {
    const backupDir = getBackupDir();
    if (Platform.OS === 'web' || !FileSystem.documentDirectory) return;
    const files = await FileSystem.readDirectoryAsync(backupDir);
    const backups = files
      .filter(f => f.endsWith('.json'))
      .sort((a,b) => b.localeCompare(a)); // ISO string sort works fine

    if (backups.length > MAX_BACKUPS) {
      // Backups[0] is newest, we keep 0-4
      for (let i = MAX_BACKUPS; i < backups.length; i++) {
        const base = backups[i].replace('.json', '');
        await FileSystem.deleteAsync(`${backupDir}${backups[i]}`, { idempotent: true });
        const csvName = base.replace('backup', 'inventory') + '.csv';
        await FileSystem.deleteAsync(`${backupDir}${csvName}`, { idempotent: true });
      }
    }
  },

  /**
   * Checks if an automated backup is required.
   */
  async checkAndRunAutoBackup(db: SQLiteDatabase) {
    if (Platform.OS === 'web' || !FileSystem.documentDirectory) return;
    const enabled = await db.getFirstAsync<{value: string}>("SELECT value FROM Settings WHERE key = 'auto_backup_enabled'");
    if (enabled?.value === '0') return;

    const lastMod = await db.getFirstAsync<{value: string}>("SELECT value FROM Settings WHERE key = 'last_modified_time'");
    const lastBack = await db.getFirstAsync<{value: string}>("SELECT value FROM Settings WHERE key = 'last_backup_time'");
    
    const modTime = parseInt(lastMod?.value || "0");
    const backTime = parseInt(lastBack?.value || "0");
    const oneHour = 60 * 60 * 1000;

    if (modTime > backTime && Date.now() - backTime > oneHour) {
      await this.createBackup(db);
    }
  },

  /**
   * Lists available local snapshots.
   */
  async getBackupsList(): Promise<BackupMetadata[]> {
    const backupDir = getBackupDir();
    if (Platform.OS === 'web' || !FileSystem.documentDirectory) return [];
    if (!(await FileSystem.getInfoAsync(backupDir)).exists) return [];
    const files = await FileSystem.readDirectoryAsync(backupDir);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => {
        // Filename format: war-cabinet-backup-2026-04-01T21-42-58-724Z.json
        // We must reconstruct the ISO string: 2026-04-01T21:42:58.724Z
        const match = f.match(/backup-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
        let timestamp = 0;
        if (match) {
          const [_, date, h, m, s, ms] = match;
          timestamp = Date.parse(`${date}T${h}:${m}:${s}.${ms}Z`) || 0;
        }
        return {
           name: f,
           timestamp: timestamp,
           uri: `${backupDir}${f}`
        };
      })
      .sort((a,b) => b.timestamp - a.timestamp);
  },

  /**
   * Performs an Off-Device Tactical Export (Share Sheet).
   */
  async shareBackup(uri: string) {
    if (Platform.OS === 'web') {
      // Trigger browser download
      try {
        const content = await FileSystem.readAsStringAsync(uri);
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = uri.split('/').pop() || 'backup.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error('Web export failed:', e);
      }
      return;
    }
    if (!(await Sharing.isAvailableAsync())) {
      console.warn("Sharing is not available on this platform");
      return;
    }
    await Sharing.shareAsync(uri);
  },

  /**
   * Tactical Recovery: Wipes current DB and re-populates from JSON.
   */
  async restore(db: SQLiteDatabase, jsonData: any) {
    try {
      await db.withTransactionAsync(async () => {
        // Clear all
        await db.runAsync("DELETE FROM Inventory");
        await db.runAsync("DELETE FROM ItemTypes");
        await db.runAsync("DELETE FROM Categories");
        await db.runAsync("DELETE FROM Cabinets");
        await db.runAsync("DELETE FROM Settings");

        const { tables } = jsonData;
        for (const cat of tables.Categories) await db.runAsync("INSERT INTO Categories (id, name, icon) VALUES (?, ?, ?)", cat.id, cat.name, cat.icon);
        for (const it of tables.ItemTypes) {
          await db.runAsync(
            "INSERT INTO ItemTypes (id, category_id, name, unit_type, default_size, default_cabinet_id, is_favorite, interaction_count, min_stock_level, max_stock_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", 
            it.id, it.category_id, it.name, it.unit_type, it.default_size, it.default_cabinet_id || null, it.is_favorite || 0, it.interaction_count || 0,
            it.min_stock_level !== undefined ? it.min_stock_level : null,
            it.max_stock_level !== undefined ? it.max_stock_level : null
          );
        }
        for (const cab of tables.Cabinets) await db.runAsync("INSERT INTO Cabinets (id, name, location) VALUES (?, ?, ?)", cab.id, cab.name, cab.location);
        for (const inv of tables.Inventory) await db.runAsync("INSERT INTO Inventory (id, item_type_id, quantity, size, expiry_month, expiry_year, entry_month, entry_year, cabinet_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", inv.id, inv.item_type_id, inv.quantity, inv.size, inv.expiry_month, inv.expiry_year, inv.entry_month, inv.entry_year, inv.cabinet_id);
        for (const s of tables.Settings) await db.runAsync("INSERT INTO Settings (key, value) VALUES (?, ?)", s.key, s.value);
      });
      return true;
    } catch (error) {
      console.error('Restore failed:', error);
      throw error;
    }
  },

  /**
   * Triggers the platform file picker for manual restore.
   */
  async pickAndRestore(db: SQLiteDatabase) {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
    if (!result.canceled && result.assets.length > 0) {
      let content = "";
      if (Platform.OS === 'web') {
        const response = await fetch(result.assets[0].uri);
        content = await response.text();
      } else {
        content = await FileSystem.readAsStringAsync(result.assets[0].uri);
      }
      const data = JSON.parse(content);
      return await this.restore(db, data);
    }
    return false;
  },

  /**
   * Android Only: Requests permission to a public folder for mirroring.
   */
  async pickPersistentFolder(db: SQLiteDatabase) {
    if (Platform.OS !== 'android') return;
    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (permissions.granted) {
      await db.runAsync("INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)", "persistence_mirror_uri", permissions.directoryUri);
      return permissions.directoryUri;
    }
    return null;
  },

  /**
   * Helper to read a local snapshot file.
   */
  async readLocalBackup(uri: string) {
    return await FileSystem.readAsStringAsync(uri);
  }
};
