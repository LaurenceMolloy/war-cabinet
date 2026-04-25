import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { GoogleDriveService } from './GoogleDriveService';
import * as Network from 'expo-network';

/**
 * BACKUP MANIFEST INTEGRITY
 * 
 * Only increment BACKUP_MANIFEST_VERSION after manually auditing 
 * createBackup and restore methods to account for all structural 
 * changes in sqlite.ts.
 */
export const BACKUP_MANIFEST_VERSION = 107; // SYNCED TO ITERATION 107

const getBackupDir = () => (FileSystem.documentDirectory || "") + 'backups/';
const MAX_BACKUPS = 7;

export interface BackupMetadata {
  name: string;
  timestamp: number;
  uri: string;
  note?: string;
  summary?: string; // e.g. "54 Batches | 8 Types"
  lastAction?: string; // e.g. "Consumed 500g Flour (2026-04-23 00:50)"
  logCount?: number;
  version?: string;
  counts?: {
    units: number;
    batches: number;
    types: number;
    categories: number;
    cabinets: number;
  };
}

let isAutoBackupRunning = false;

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
      const categories = await db.getAllAsync<any>('SELECT * FROM Categories');
      const itemTypes = await db.getAllAsync<any>('SELECT * FROM ItemTypes');
      const inventory = await db.getAllAsync<any>('SELECT * FROM Inventory');
      const cabinets = await db.getAllAsync<any>('SELECT * FROM Cabinets');
      const settings = await db.getAllAsync<any>('SELECT * FROM Settings');
      const barcodeSignatures = await db.getAllAsync<any>('SELECT * FROM BarcodeSignatures');
      const tacticalLogs = await db.getAllAsync<any>('SELECT * FROM TacticalLogs');

      const lastActionRes = settings.find((s: any) => s.key === 'last_activity_log');
      let lastAction = lastActionRes ? lastActionRes.value : 'No operational changes recorded';

      // PREVENT REDUNDANT LOGS: Check the most recent local backup to see if this action was already archived
      try {
        const files = await FileSystem.readDirectoryAsync(backupDir);
        const latestBackupFile = files
          .filter(f => f.endsWith('.json') && !f.startsWith('bunker_'))
          .sort((a, b) => b.localeCompare(a))[0];
          
        if (latestBackupFile) {
          const prevContent = await FileSystem.readAsStringAsync(`${backupDir}${latestBackupFile}`);
          const prevParsed = JSON.parse(prevContent);
          if (prevParsed.lastAction === lastAction) {
            lastAction = 'No changes recorded since previous archive';
          }
        }
      } catch (e) {
        // Fallback to original action if comparison fails
      }

      const counts = {
        units: inventory.reduce((sum, r) => sum + Number(r.quantity || 0), 0),
        batches: inventory.length,
        types: itemTypes.length,
        categories: categories.length,
        cabinets: cabinets.length
      };
      const summary = `${counts.units} Units | ${inventory.length} Batches`;

      const ts = Date.now();
      const fileName = `war-cabinet-backup-${ts}.json`;
      const csvFileName = `war-cabinet-backup-${ts}.csv`;
      const uri = `${backupDir}${fileName}`;
      const csvUri = `${backupDir}${csvFileName}`;

      const backupData = {
        version: BACKUP_MANIFEST_VERSION.toString(),
        timestamp: ts,
        note: isManual ? (typeof isManual === 'string' ? isManual : 'Manual Snapshot') : 'System Archive',
        summary,
        counts,
        lastAction,
        logCount: tacticalLogs.length,
        tables: {
          Categories: categories,
          ItemTypes: itemTypes,
          Inventory: inventory,
          Cabinets: cabinets,
          Settings: settings,
          BarcodeSignatures: barcodeSignatures,
          TacticalLogs: tacticalLogs
        }
      };

      await FileSystem.writeAsStringAsync(uri, JSON.stringify(backupData, null, 2));

      // 1.5. PURGE TACTICAL LOGS: Now that they are safely archived in the snapshot, clear the live table.
      await db.runAsync('DELETE FROM TacticalLogs');

      // 2. SPREADSHEET GENERATION (CSV)
      let csvContent = "";
      const flatRows = await db.getAllAsync<any>(`
        SELECT c.name as Category, it.name as Item, i.size as Size, i.quantity as Qty, 
               i.supplier as Supplier, i.product_range as Range, i.batch_intel as BatchIntel,
               it.min_stock_level as MinThreshold, it.max_stock_level as MaxThreshold,
               cab.name as Cabinet, cab.cabinet_type as CabType, cab.location as Location,
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
        await FileSystem.writeAsStringAsync(csvUri, csvContent);
      }

      // 3. UPDATE METADATA
      await db.runAsync("INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)", "last_backup_time", ts.toString());

      // 4. ROTATION
      await this.rotateBackups();

      // 5. AUTOMATED CLOUD MIRROR (PGR RULE #7 EXTENSION - FIRE-AND-FORGET)
      const cloudEnabled = await db.getFirstAsync<{value: string}>("SELECT value FROM Settings WHERE key = 'cloud_backup_enabled'");
      if (cloudEnabled?.value === '1') {
        (async () => {
          try {
            const accessToken = await GoogleDriveService.getAccessToken();
            if (accessToken) {
              console.log(`[DRIVE] Auto-syncing mirror (Background): ${backupData.note}`);
              await this.uploadToCloud(accessToken, backupData, db);
            }
          } catch (cloudError) {
            console.error('[DRIVE] Automated cloud sync failed:', cloudError);
          }
        })();
      }

      return { jsonUri: uri, timestamp: ts };
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
    const jsonFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('bunker_'));

    // Get modification times for all files to ensure absolute chronological sorting
    const fileStats = await Promise.all(
      jsonFiles.map(async f => {
        const info = await FileSystem.getInfoAsync(`${backupDir}${f}`);
        return { name: f, mtime: info.exists ? (info.modificationTime || 0) : 0 };
      })
    );

    const backupsSorted = fileStats.sort((a, b) => b.mtime - a.mtime);

    if (backupsSorted.length > MAX_BACKUPS) {
      for (let i = MAX_BACKUPS; i < backupsSorted.length; i++) {
        const base = backupsSorted[i].name.replace('.json', '');
        await FileSystem.deleteAsync(`${backupDir}${backupsSorted[i].name}`, { idempotent: true });
        const csvName = base + '.csv';
        await FileSystem.deleteAsync(`${backupDir}${csvName}`, { idempotent: true });
      }
    }
  },

  loadBackups: async (): Promise<{backups: BackupMetadata[], bunker: BackupMetadata | null}> => {
    try {
      const backupDir = getBackupDir();
      const exists = await FileSystem.getInfoAsync(backupDir);
      if (!exists.exists) return {backups: [], bunker: null};

      const files = await FileSystem.readDirectoryAsync(backupDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      const allBackups: BackupMetadata[] = [];
      let bunker: BackupMetadata | null = null;

      for (const f of jsonFiles) {
        const content = await FileSystem.readAsStringAsync(`${backupDir}${f}`);
        const data = JSON.parse(content);
        const meta: BackupMetadata = {
          name: f,
          uri: `${backupDir}${f}`,
          timestamp: data.timestamp,
          summary: data.summary,
          counts: data.counts,
          lastAction: data.lastAction,
          note: data.note,
          version: data.version,
          logCount: data.logCount !== undefined ? data.logCount : (data.tables && data.tables.TacticalLogs ? data.tables.TacticalLogs.length : undefined)
        };

        // --- METADATA RECOVERY ---
        // If counts are missing (legacy backup), derive them from the tables object.
        if (!meta.counts && data.tables) {
          meta.counts = {
            units: (data.tables.Inventory || []).reduce((sum: number, r: any) => sum + Number(r.quantity || 0), 0),
            batches: (data.tables.Inventory || []).length,
            types: (data.tables.ItemTypes || []).length,
            categories: (data.tables.Categories || []).length,
            cabinets: (data.tables.Cabinets || []).length
          };
          if (!meta.summary) {
            meta.summary = `${meta.counts.units} Units | ${meta.counts.batches} Batches`;
          }
        }

        if (f.startsWith('bunker_')) {
          bunker = meta;
        } else {
          allBackups.push(meta);
        }
      }

      return {
        backups: allBackups.sort((a, b) => b.timestamp - a.timestamp),
        bunker
      };
    } catch (e) {
      console.error('Failed to load backups:', e);
      return {backups: [], bunker: null};
    }
  },

  fortifyToBunker: async (backup: BackupMetadata) => {
    try {
      const backupDir = getBackupDir();
      const files = await FileSystem.readDirectoryAsync(backupDir);
      
      // 1. Demote current bunker if exists
      const currentBunkerJson = files.find(f => f.startsWith('bunker_') && f.endsWith('.json'));
      const currentBunkerCsv = files.find(f => f.startsWith('bunker_') && f.endsWith('.csv'));
      
      if (currentBunkerJson) {
        const newName = currentBunkerJson.replace('bunker_', 'backup_');
        // Delete target if exists to prevent move error
        await FileSystem.deleteAsync(`${backupDir}${newName}`, { idempotent: true });
        await FileSystem.moveAsync({ from: `${backupDir}${currentBunkerJson}`, to: `${backupDir}${newName}` });
      }
      if (currentBunkerCsv) {
        const newName = currentBunkerCsv.replace('bunker_', 'backup_');
        await FileSystem.deleteAsync(`${backupDir}${newName}`, { idempotent: true });
        await FileSystem.moveAsync({ from: `${backupDir}${currentBunkerCsv}`, to: `${backupDir}${newName}` });
      }

      // 2. Fortify new backup
      const newBunkerJson = `bunker_${backup.timestamp}.json`;
      const newBunkerCsv = `bunker_${backup.timestamp}.csv`;
      
      const oldCsv = backup.name.replace('.json', '.csv');

      // Delete target if exists
      await FileSystem.deleteAsync(`${backupDir}${newBunkerJson}`, { idempotent: true });
      await FileSystem.moveAsync({ from: backup.uri, to: `${backupDir}${newBunkerJson}` });
      
      if (files.includes(oldCsv)) {
        await FileSystem.deleteAsync(`${backupDir}${newBunkerCsv}`, { idempotent: true });
        await FileSystem.moveAsync({ from: `${backupDir}${oldCsv}`, to: `${backupDir}${newBunkerCsv}` });
      }

      return true;
    } catch (e) {
      console.error('Failed to fortify bunker:', e);
      return false;
    }
  },

  /**
   * Checks if an automated backup is required.
   */
  async checkAndRunAutoBackup(db: SQLiteDatabase) {
    if (isAutoBackupRunning) return;

    if (Platform.OS === 'web' || !FileSystem.documentDirectory) return;
    const enabled = await db.getFirstAsync<{value: string}>("SELECT value FROM Settings WHERE key = 'auto_backup_enabled'");
    if (enabled?.value === '0') return;

    const lastMod = await db.getFirstAsync<{value: string}>("SELECT value FROM Settings WHERE key = 'last_modified_time'");
    const lastBack = await db.getFirstAsync<{value: string}>("SELECT value FROM Settings WHERE key = 'last_backup_time'");
    
    const modTime = parseInt(lastMod?.value || "0");
    const backTime = parseInt(lastBack?.value || "0");
    const oneHour = 60 * 60 * 1000;

    if (modTime > backTime && Date.now() - backTime > oneHour) {
      isAutoBackupRunning = true;
      try {
        await this.createBackup(db);
      } finally {
        isAutoBackupRunning = false;
      }
    }
  },

  /**
   * PGR RULE #7: Proactive Backup Verification
   * Triggered after every DAL write to secure high-activity bursts.
   */
  async proactiveBackupProtocol(db: SQLiteDatabase, triggerContext: string) {
    if (Platform.OS === 'web' || !FileSystem.documentDirectory) return;

    // 1. Check Rank (Is user a GENERAL?)
    const license = await db.getFirstAsync<{value: string}>("SELECT value FROM Settings WHERE key = 'license_key_general'");
    const isGeneral = !!license?.value;

    if (isGeneral) {
      console.log(`[PGR] Proactive backup triggered: Event Triggered - ${triggerContext}`);
      await this.createBackup(db, `Event Triggered - ${triggerContext}`);
      return;
    }

    // 2. Free User: Handle Upsell Counter
    const silenced = await db.getFirstAsync<{value: string}>("SELECT value FROM Settings WHERE key = 'proactive_upsell_silenced'");
    if (silenced?.value === '1') return;

    const countRes = await db.getFirstAsync<{value: string}>("SELECT value FROM Settings WHERE key = 'proactive_upsell_count'");
    let count = parseInt(countRes?.value || "0") + 1;
    const N = 5; // Upsell every 5 operational saves

    if (count >= N) {
      console.log('[PGR] Upsell threshold reached. Triggering UI prompt.');
      await db.runAsync("INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)", 'show_rank_upsell', '1');
      count = 0;
    }
    
    await db.runAsync("INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)", 'proactive_upsell_count', count.toString());
  },

  /**
   * Lists available local snapshots.
   */
  async getBackupsList(): Promise<BackupMetadata[]> {
    const { backups } = await this.loadBackups();
    return backups;
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
        // 1. CAPTURE CRITICAL LOCAL SETTINGS (To survive the wipe)
        const localSettings = await db.getAllAsync<{key: string, value: string}>(
          "SELECT * FROM Settings WHERE key IN ('cloud_account', 'cloud_backup_enabled', 'persistence_mirror_uri', 'google_access_token', 'google_refresh_token')"
        );

        // 2. WIPE ALL
        await db.runAsync("DELETE FROM Inventory");
        await db.runAsync("DELETE FROM ItemTypes");
        await db.runAsync("DELETE FROM Categories");
        await db.runAsync("DELETE FROM Cabinets");
        await db.runAsync("DELETE FROM Settings");
        await db.runAsync("DELETE FROM BarcodeSignatures");
        await db.runAsync("DELETE FROM TacticalLogs");

        const { tables } = jsonData;
        if (!tables) throw new Error("Invalid tactical data packet: Missing tables.");

        const cats = tables.Categories || [];
        for (const cat of cats) {
          await db.runAsync(
            "INSERT INTO Categories (id, name, icon, is_mess_hall) VALUES (?, ?, ?, ?)", 
            cat.id, cat.name, cat.icon || 'box', 
            cat.is_mess_hall !== undefined ? cat.is_mess_hall : 1
          );
        }

        const itemTypes = tables.ItemTypes || [];
        for (const it of itemTypes) {
          await db.runAsync(
            "INSERT INTO ItemTypes (id, category_id, name, unit_type, default_size, default_cabinet_id, is_favorite, interaction_count, min_stock_level, max_stock_level, freeze_months, default_supplier, default_product_range, vanguard_resolved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", 
            it.id, it.category_id, it.name, it.unit_type || 'weight', it.default_size || null, it.default_cabinet_id || null, it.is_favorite || 0, it.interaction_count || 0,
            it.min_stock_level !== undefined ? it.min_stock_level : null,
            it.max_stock_level !== undefined ? it.max_stock_level : null,
            it.freeze_months !== undefined ? it.freeze_months : null,
            it.default_supplier || null,
            it.default_product_range || null,
            it.vanguard_resolved !== undefined ? it.vanguard_resolved : 0
          );
        }

        const cabs = tables.Cabinets || [];
        for (const cab of cabs) {
          await db.runAsync("INSERT INTO Cabinets (id, name, location, cabinet_type) VALUES (?, ?, ?, ?)", cab.id, cab.name, cab.location || '', cab.cabinet_type || 'standard');
        }

        const invs = tables.Inventory || [];
        for (const inv of invs) {
          await db.runAsync(
            "INSERT INTO Inventory (id, item_type_id, quantity, size, expiry_month, expiry_year, entry_month, entry_year, cabinet_id, batch_intel, supplier, product_range, portions_total, portions_remaining) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", 
            inv.id, inv.item_type_id, inv.quantity, inv.size || '', 
            inv.expiry_month !== undefined ? inv.expiry_month : null, 
            inv.expiry_year !== undefined ? inv.expiry_year : null, 
            inv.entry_month !== undefined ? inv.entry_month : null, 
            inv.entry_year !== undefined ? inv.entry_year : null, 
            inv.cabinet_id !== undefined ? inv.cabinet_id : null,
            inv.batch_intel !== undefined ? inv.batch_intel : null,
            inv.supplier || null,
            inv.product_range || null,
            inv.portions_total !== undefined ? inv.portions_total : null,
            inv.portions_remaining !== undefined ? inv.portions_remaining : null
          );
        }

        const settings = tables.Settings || [];
        for (const s of settings) {
          // Skip sensitive cloud/mirror keys from the incoming backup to avoid overwriting current device's connection
          const protectedKeys = ['cloud_account', 'cloud_backup_enabled', 'persistence_mirror_uri', 'google_access_token', 'google_refresh_token'];
          if (protectedKeys.includes(s.key)) continue;
          await db.runAsync("INSERT INTO Settings (key, value) VALUES (?, ?)", s.key, s.value);
        }

        // 4. RESTORE CRITICAL LOCAL SETTINGS
        for (const ls of localSettings) {
          await db.runAsync("INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)", ls.key, ls.value);
        }

        const barcodeSigs = tables.BarcodeSignatures || [];
        for (const bs of barcodeSigs) {
          await db.runAsync("INSERT INTO BarcodeSignatures (barcode, item_type_id, supplier, size) VALUES (?, ?, ?, ?)", bs.barcode, bs.item_type_id, bs.supplier || null, bs.size || null);
        }

        const tacticalLogs = tables.TacticalLogs || [];
        for (const log of tacticalLogs) {
          await db.runAsync(
            "INSERT INTO TacticalLogs (id, timestamp, action_type, entity_type, entity_id, entity_name, details) VALUES (?, ?, ?, ?, ?, ?, ?)",
            log.id, log.timestamp, log.action_type, log.entity_type, log.entity_id, log.entity_name, log.details || null
          );
        }
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
  },

  /**
   * CLOUD MIRRORING: Uploads the latest JSON backup to Google Drive.
   */
  async uploadToCloud(accessToken: string, jsonData: any, db?: SQLiteDatabase) {
    console.log('[DRIVE] Uploading mirror to cloud...');
    try {
      // PGR RULE #7 EXTENSION: Connectivity Sentinel
      const network = await Network.getNetworkStateAsync();
      if (!network.isInternetReachable) {
        console.log('[DRIVE] System is Radio Silent. Sync deferred.');
        if (db) {
          const ts = new Date().toLocaleString();
          const currentStatus = await db.getFirstAsync<{value: string}>("SELECT value FROM Settings WHERE key = 'cloud_last_status'");
          // Only update if we aren't already in a pending state to preserve the "First Spotted" timestamp
          if (!currentStatus?.value?.includes('Sync Pending')) {
            await db.runAsync("INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)", 'cloud_last_status', `Radio Silent (Sync Pending since ${ts})`);
          }
        }
        return;
      }

      // Use the note from the backup or a generic name
      const isBunker = jsonData.note?.toLowerCase().includes('bunker');
      const prefix = isBunker ? 'bunker' : 'backup';
      const fileName = `war-cabinet-${prefix}-${new Date(jsonData.timestamp).toISOString().replace(/[:.]/g, '-')}.json`;
      
      // 1. Metadata: We store the 'note' (Event Trigger context) in the description
      // and counts in appProperties for fast listing without downloading the whole file.
      const metadata = {
        name: fileName,
        description: jsonData.note || 'System Archive',
        parents: ['appDataFolder'],
        appProperties: {
          summary: jsonData.summary || '',
          version: jsonData.version || '',
          timestamp: jsonData.timestamp.toString()
        }
      };

      // 2. Multipart Upload
      const boundary = '-------314159265358979323846';
      const delimiter = "\r\n--" + boundary + "\r\n";
      const close_delim = "\r\n--" + boundary + "--";

      const body = 
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(jsonData) +
        close_delim;

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': body.length.toString(),
        },
        body: body
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[DRIVE] API Error: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`Cloud upload failed: ${response.status} ${errorText}`);
      }

      console.log('[DRIVE] Mirror upload successful.');

      // Clear pending status upon success
      if (db) {
        const ts = new Date().toLocaleString();
        await db.runAsync("INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)", 'cloud_last_status', `Success (${ts})`);
        await db.runAsync("INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)", 'cloud_last_sync', ts);
      }
      
      // 3. PGR-Compliant Cloud Rotation: Maintain 7+1 Mirroring
      await this.rotateCloudBackups(accessToken);
      
      return await response.json();
    } catch (error) {
      console.error('[DRIVE] Upload error:', error);
      throw error;
    }
  },

  /**
   * CLOUD MIRRORING: Ensures only the last 7 backups + 1 Bunker are kept on Drive.
   * Also deduplicates backups that have been promoted to Bunker status.
   */
  async rotateCloudBackups(accessToken: string) {
    try {
      const files = await this.listCloudBackups(accessToken);
      const bunkers = files.filter(f => f.name.includes('bunker'));
      const backups = files.filter(f => !f.name.includes('bunker'));

      // 1. Deduplicate: If a backup has the same timestamp as a bunker, delete the backup
      for (const bnk of bunkers) {
        const ts = bnk.appProperties?.timestamp;
        if (ts) {
          const dup = backups.find(b => b.appProperties?.timestamp === ts);
          if (dup) {
            console.log(`[DRIVE] Decommissioning duplicate backup ${dup.id} (Promoted to Bunker)`);
            await fetch(`https://www.googleapis.com/drive/v3/files/${dup.id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
          }
        }
      }

      // Re-fetch list if we deleted duplicates to have accurate counts for rotation
      const refreshedBackups = (await this.listCloudBackups(accessToken))
        .filter(f => !f.name.includes('bunker'));

      // Keep only the latest bunker
      if (bunkers.length > 1) {
        for (let i = 1; i < bunkers.length; i++) {
          await fetch(`https://www.googleapis.com/drive/v3/files/${bunkers[i].id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
        }
      }

      // Keep last 7 backups
      if (refreshedBackups.length > MAX_BACKUPS) {
        for (let i = MAX_BACKUPS; i < refreshedBackups.length; i++) {
          await fetch(`https://www.googleapis.com/drive/v3/files/${refreshedBackups[i].id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
        }
      }
    } catch (e) {
      console.error('[DRIVE] Rotation failed:', e);
    }
  },

  /**
   * CLOUD MIRRORING: Lists available mirrors in the appDataFolder with rich metadata.
   */
  async listCloudBackups(accessToken: string): Promise<any[]> {
    console.log('[DRIVE] Fetching cloud mirror list...');
    try {
      const response = await fetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id, name, createdTime, description, appProperties)', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (!response.ok) throw new Error('Failed to list cloud files');
      const data = await response.json();
      
      return (data.files || []).sort((a: any, b: any) => 
        new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime()
      );
    } catch (error) {
      console.error('[DRIVE] List error:', error);
      throw error;
    }
  },

  /**
   * CLOUD MIRRORING: Downloads a specific mirror by ID.
   */
  async downloadFromCloud(accessToken: string, fileId: string) {
    console.log(`[DRIVE] Downloading mirror ${fileId}...`);
    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (!response.ok) throw new Error('Failed to download cloud mirror');
      return await response.json();
    } catch (error) {
      console.error('[DRIVE] Download error:', error);
      throw error;
    }
  }
};
