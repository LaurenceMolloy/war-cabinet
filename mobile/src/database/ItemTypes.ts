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
   * Computes stock readiness colour per item type, using the same algorithm as
   * ReadinessCommandView. Returns a Map of type_id → hex colour string.
   *
   * Unconfigured items (no min AND no max) return '#64748b' (grey).
   * Colour bands mirror getReadinessColor() in ReadinessCommandView:
   *   ≤25%  of min → #991b1b  (deep red)
   *   ≤50%  of min → #ef4444  (red)
   *   ≤75%  of min → #f97316  (orange)
   *   <100% of min → #fbbf24  (yellow)
   *   ≥100% of min → #22c55e  (green)
   *   >max         → #065f46  (dark green / surplus)
   *
   * NOTE: ReadinessCommandView retains its own inline logic until a full
   * DAL migration is authorised by the user. This method is the trial vehicle.
   */
  async getStockReadinessMap(db: any): Promise<Map<number, string>> {
    const typeRows = await db.getAllAsync<any>(`
      SELECT it.id as type_id, it.default_size, it.unit_type,
             it.min_stock_level, it.max_stock_level
      FROM ItemTypes it
    `);
    const inventoryRows = await db.getAllAsync<any>(
      'SELECT item_type_id, quantity, size FROM Inventory WHERE quantity > 0'
    );

    const parseSize = (s: any): number => {
      if (!s) return 0;
      const m = String(s).match(/^(\d+(\.\d+)?)/);
      return m ? parseFloat(m[0]) : 0;
    };

    const invByType: Record<number, any[]> = {};
    inventoryRows.forEach((r: any) => {
      if (!invByType[r.item_type_id]) invByType[r.item_type_id] = [];
      invByType[r.item_type_id].push(r);
    });

    const readinessColor = (ratio: number, maxRatio: number | null): string => {
      const pct = Math.floor(ratio * 100);
      if (pct <= 25) return '#991b1b';
      if (pct <= 50) return '#ef4444';
      if (pct <= 75) return '#f97316';
      if (pct < 100) return '#fbbf24';
      if (maxRatio !== null && ratio > maxRatio) return '#065f46';
      return '#22c55e';
    };

    const map = new Map<number, string>();
    typeRows.forEach((type: any) => {
      const hasMin = type.min_stock_level > 0;
      const hasMax = type.max_stock_level > 0;

      if (!hasMin && !hasMax) {
        map.set(type.type_id, '#64748b'); // Grey — no doctrine configured
        return;
      }

      const defSizeVal = parseSize(type.default_size);
      const isPhysical = defSizeVal > 0 && type.unit_type !== 'count';
      const batches = invByType[type.type_id] || [];

      const physicalStock = isPhysical
        ? batches.reduce((s: number, b: any) => s + (b.quantity * (parseSize(b.size) || defSizeVal)), 0)
        : batches.reduce((s: number, b: any) => s + b.quantity, 0);

      const minTarget = hasMin ? (isPhysical ? type.min_stock_level * defSizeVal : type.min_stock_level) : 0;
      const maxTarget = hasMax ? (isPhysical ? type.max_stock_level * defSizeVal : type.max_stock_level) : null;

      const ratio = minTarget > 0 ? physicalStock / minTarget : 1;
      const maxRatio = maxTarget !== null && minTarget > 0 ? maxTarget / minTarget : null;

      map.set(type.type_id, readinessColor(ratio, maxRatio));
    });

    return map;
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
