import { SQLiteDatabase } from 'expo-sqlite';
import { logTacticalAction } from '../db/sqlite';
import { BackupService } from '../services/BackupService';

export interface Cabinet {
  id: number;
  name: string;
  location: string | null;
  cabinet_type: 'standard' | 'freezer';
  rotation_interval_months: number | null;
  default_rotation_cabinet_id: number | null;
  stock_count?: number; // Optional metadata for UI
}

export interface CabinetCreateParams {
  name: string;
  location: string;
  cabinet_type: string;
  rotation_interval_months: number;
  default_rotation_cabinet_id: number | null;
}

export const Cabinets = {
  /**
   * Fetches all cabinets with their associated stock counts.
   */
  async getAll(db: SQLiteDatabase): Promise<Cabinet[]> {
    return await db.getAllAsync<Cabinet>(`
      SELECT c.*, COUNT(i.id) as stock_count 
      FROM Cabinets c 
      LEFT JOIN Inventory i ON i.cabinet_id = c.id
      GROUP BY c.id
      ORDER BY c.name ASC
    `);
  },

  /**
   * Deploys a new cabinet to the logistics network.
   */
  async create(db: SQLiteDatabase, params: CabinetCreateParams): Promise<number> {
    const { name, location, cabinet_type, rotation_interval_months, default_rotation_cabinet_id } = params;
    
    // Check for duplicates
    const existing = await db.getFirstAsync('SELECT id FROM Cabinets WHERE LOWER(name) = LOWER(?)', [name.trim()]);
    if (existing) {
      throw new Error(`"${name}" is already deployed in your logistics network.`);
    }

    const res = await db.runAsync(
      'INSERT INTO Cabinets (name, location, cabinet_type, rotation_interval_months, default_rotation_cabinet_id) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), location.trim(), cabinet_type, rotation_interval_months === 0 ? null : rotation_interval_months, default_rotation_cabinet_id]
    );

    const newId = Number(res.lastInsertRowId);
    await logTacticalAction(db, 'ADD', 'CABINET', newId, name.trim());
    
    // PGR RULE #7: Trigger proactive backup verification
    await BackupService.proactiveBackupProtocol(db, 'Cabinet Add');

    return newId;
  },

  /**
   * Updates an existing cabinet's profile.
   */
  async update(db: SQLiteDatabase, id: number, params: CabinetCreateParams): Promise<void> {
    const { name, location, cabinet_type, rotation_interval_months, default_rotation_cabinet_id } = params;

    // Check for duplicates (other than itself)
    const existing = await db.getFirstAsync('SELECT id FROM Cabinets WHERE LOWER(name) = LOWER(?) AND id != ?', [name.trim(), id]);
    if (existing) {
      throw new Error(`"${name}" is already deployed in your logistics network.`);
    }

    // Capture the "Before" state
    const old = await db.getFirstAsync<Cabinet>('SELECT * FROM Cabinets WHERE id = ?', [id]);

    await db.runAsync(
      'UPDATE Cabinets SET name = ?, location = ?, cabinet_type = ?, rotation_interval_months = ?, default_rotation_cabinet_id = ? WHERE id = ?',
      [name.trim(), location.trim(), cabinet_type, rotation_interval_months === 0 ? null : rotation_interval_months, default_rotation_cabinet_id, id]
    );

    // Record the transition for the "Video Tape"
    await logTacticalAction(
      db, 
      'UPDATE', 
      'CABINET', 
      id, 
      name.trim(), 
      JSON.stringify({ from: old, to: params })
    );

    // PGR RULE #7: Trigger proactive backup verification
    await BackupService.proactiveBackupProtocol(db, 'Cabinet Edit');
  },

  /**
   * Decommissions a cabinet if it is empty.
   */
  async delete(db: SQLiteDatabase, id: number): Promise<void> {
    const old = await db.getFirstAsync<Cabinet>('SELECT * FROM Cabinets WHERE id = ?', [id]);
    
    const stock = await db.getFirstAsync<{c: number}>('SELECT COUNT(*) as c FROM Inventory WHERE cabinet_id = ?', [id]);
    if (stock && stock.c > 0) {
      throw new Error('Cannot delete a cabinet that still contains stock.');
    }

    await db.runAsync('DELETE FROM Cabinets WHERE id = ?', [id]);
    
    // Record the decommission event with the final state snapshot
    await logTacticalAction(db, 'DELETE', 'CABINET', id, old?.name || 'Unknown', JSON.stringify(old));

    // PGR RULE #7: Trigger proactive backup verification
    await BackupService.proactiveBackupProtocol(db, 'Cabinet Delete');
  }
};
