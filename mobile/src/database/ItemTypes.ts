import { logTacticalAction, markModified } from '../db/sqlite';
import { normalizeNumericInput } from '../utils/measurements';

export const ItemTypes = {
  /**
   * Update the tactical threshold targets (Min/Max) and default size for a
   * specific item type. All numeric inputs are sanitized by the DAL "Bouncer"
   * before touching the database — no unit strings will ever be persisted.
   */
  async updateThresholds(
    db: any,
    id: number,
    min: number | null,
    max: number | null,
    defaultSize: string | number | null = null
  ) {
    try {
      // ── BOUNCER: strip any unit letters before writing ──────────────
      const cleanMin  = min  !== null ? parseFloat(String(min))  : null;
      const cleanMax  = max  !== null ? parseFloat(String(max))  : null;
      const cleanSize = normalizeNumericInput(defaultSize);
      // ───────────────────────────────────────────────────────────────

      await db.runAsync(
        'UPDATE ItemTypes SET min_stock_level = ?, max_stock_level = ?, default_size = ? WHERE id = ?',
        [isNaN(cleanMin as number) ? null : cleanMin,
         isNaN(cleanMax as number) ? null : cleanMax,
         cleanSize,
         id]
      );

      const itemRes = await db.getFirstAsync('SELECT name FROM ItemTypes WHERE id = ?', [id]);
      const itemName = (itemRes as any)?.name || 'Unknown Item';

      await logTacticalAction(
        db, 'UPDATE', 'ItemType', id, itemName,
        `Updated targets — Min: ${cleanMin}, Max: ${cleanMax}, Size: ${cleanSize}`
      );
      await markModified(db);
      return true;
    } catch (e) {
      console.error('[DAL] Error updating ItemType thresholds:', e);
      return false;
    }
  },

  /**
   * Update the default size alone (without touching thresholds).
   */
  async updateDefaultSize(db: any, id: number, defaultSize: string | number | null) {
    try {
      const cleanSize = normalizeNumericInput(defaultSize);
      await db.runAsync(
        'UPDATE ItemTypes SET default_size = ? WHERE id = ?',
        [cleanSize, id]
      );
      await markModified(db);
      return true;
    } catch (e) {
      console.error('[DAL] Error updating ItemType default_size:', e);
      return false;
    }
  },

  /**
   * All item types joined to their parent category, with threshold and unit
   * metadata. Returns one row per item type; categories without item types
   * are excluded. Used by any screen that needs to reason about stock targets.
   */
  async getWithCategories(db: any) {
    return db.getAllAsync<any>(`
      SELECT
        c.id   AS cat_id,
        c.name AS cat_name,
        c.icon,
        it.id           AS type_id,
        it.name         AS type_name,
        it.min_stock_level,
        it.max_stock_level,
        it.unit_type,
        it.default_size
      FROM Categories c
      LEFT JOIN ItemTypes it ON it.category_id = c.id
    `);
  },
};
