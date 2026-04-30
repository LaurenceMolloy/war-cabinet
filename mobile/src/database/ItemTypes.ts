import { logTacticalAction, markModified } from '../db/sqlite';

export const ItemTypes = {
  /**
   * Update the tactical threshold targets (Min/Max) for a specific item type.
   */
  async updateThresholds(db: any, id: number, min: number | null, max: number | null, defaultSize: string | null = null) {
    try {
      await db.runAsync(
        'UPDATE ItemTypes SET min_stock_level = ?, max_stock_level = ?, default_size = ? WHERE id = ?',
        [min, max, defaultSize, id]
      );
      
      const itemRes = await db.getFirstAsync('SELECT name FROM ItemTypes WHERE id = ?', [id]);
      const itemName = (itemRes as any)?.name || 'Unknown Item';
      
      await logTacticalAction(db, 'UPDATE', 'ItemType', id, itemName, `Updated targets to Min: ${min}, Max: ${max}, Size: ${defaultSize}`);
      await markModified(db);
      return true;
    } catch (e) {
      console.error('[DAL] Error updating ItemType thresholds:', e);
      return false;
    }
  }
};
