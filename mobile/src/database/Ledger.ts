import { SQLiteDatabase } from 'expo-sqlite';

export interface TacticalEvent {
  id: number;
  timestamp: string;
  action_type: 'ADD' | 'UPDATE' | 'DELETE' | 'MOVE' | 'CONSUME';
  entity_type: 'CABINET' | 'CATEGORY' | 'ITEM_TYPE' | 'BATCH' | 'SETTING';
  entity_id: number;
  entity_name: string;
  details: string | null; // JSON payload of the change
}

export const Ledger = {
  /**
   * Retrieves the raw chronological stream of logistical events.
   */
  async getStream(db: SQLiteDatabase, limit: number = 100): Promise<TacticalEvent[]> {
    return await db.getAllAsync<TacticalEvent>(
      `SELECT * FROM TacticalLogs ORDER BY timestamp DESC LIMIT ?`,
      [limit]
    );
  },

  /**
   * Clears the ledger (for developer use or system reset).
   */
  async purge(db: SQLiteDatabase): Promise<void> {
    await db.runAsync('DELETE FROM TacticalLogs');
  },

  /**
   * Returns a summary of events for a specific entity.
   */
  async getEntityHistory(db: SQLiteDatabase, type: string, id: number): Promise<TacticalEvent[]> {
    return await db.getAllAsync<TacticalEvent>(
      `SELECT * FROM TacticalLogs WHERE entity_type = ? AND entity_id = ? ORDER BY timestamp DESC`,
      [type, id]
    );
  }
};
