/**
 * Inventory DAL
 *
 * Entity-level data access for Inventory batches.
 * All screens that need to reason about physical stock should query here.
 */
export const Inventory = {
  /**
   * All live inventory batches with their quantity and per-batch size.
   * Size is returned as a raw string so callers can apply their own parseSize().
   */
  async getAll(db: any) {
    return db.getAllAsync<any>(`
      SELECT item_type_id, quantity, size FROM Inventory
    `);
  },

  /**
   * Most-common batch size per item type, ordered by frequency DESC.
   * Used as a fallback pack-size suggestion when no default_size is configured.
   * Only rows with a non-empty, leading-numeric size value are included.
   */
  async getCommonBatchSizes(db: any) {
    return db.getAllAsync<any>(`
      SELECT item_type_id, size, SUM(quantity) AS freq
      FROM Inventory
      WHERE size IS NOT NULL AND size != '' AND size GLOB '[0-9]*'
      GROUP BY item_type_id, size
      ORDER BY item_type_id, freq DESC
    `);
  },
};
