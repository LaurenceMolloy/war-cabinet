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
      SELECT item_type_id, quantity, size FROM Inventory WHERE quantity > 0
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
      WHERE quantity > 0 AND size IS NOT NULL AND size != '' AND size GLOB '[0-9]*'
      GROUP BY item_type_id, size
      ORDER BY item_type_id, freq DESC
    `);
  },

  /**
   * Marks a batch as audited, updating its timestamp and logging the outcome.
   */
  async markAudited(db: any, id: number, isMissing: boolean) {
    const now = Date.now();
    await db.runAsync('UPDATE Inventory SET last_audited_at = ? WHERE id = ?', [now, id]);
    // The missing/found logic will be handled by the explicit consume/add DAL functions below.
  },

  // ============================================================================
  // TACTICAL ANALYTICS & LIFECYCLE MANAGEMENT (V113)
  // ============================================================================

  /**
   * Decrements the quantity of a batch. If it hits 0, it soft-deletes the batch.
   */
  async consumeQuantity(db: any, batchId: number, productId: number, amount: number, source: 'USER' | 'AUDIT' = 'USER') {
    const ts = Date.now();
    const row = await db.getFirstAsync<{quantity: number}>('SELECT quantity FROM Inventory WHERE id = ?', [batchId]);
    if (!row) return;

    const newQty = Math.max(0, row.quantity - amount);
    const actualChange = row.quantity - newQty;

    if (actualChange > 0) {
      if (newQty === 0) {
        await db.runAsync('UPDATE Inventory SET quantity = 0, dead_at = ?, portions_remaining = 0 WHERE id = ?', [ts, batchId]);
      } else {
        await db.runAsync(`
          UPDATE Inventory 
          SET quantity = ?,
              portions_remaining = CASE 
                WHEN portions_total > 0 THEN MIN(IFNULL(portions_remaining, quantity * portions_total), ? * portions_total)
                ELSE portions_remaining 
              END 
          WHERE id = ?`, [newQty, newQty, batchId]);
      }

      await db.runAsync(
        'INSERT INTO ProductEventLedger (timestamp, product_id, batch_id, source, change_amount) VALUES (?, ?, ?, ?, ?)',
        [ts, productId, batchId, source, -actualChange]
      );
    }
  },

  /**
   * Increments the quantity of an existing batch (consolidation).
   */
  async addQuantity(db: any, batchId: number, productId: number, amount: number, source: 'USER' | 'AUDIT' = 'USER') {
    const ts = Date.now();
    await db.runAsync(`
      UPDATE Inventory 
      SET quantity = quantity + ?, 
          dead_at = NULL,
          portions_remaining = CASE
            WHEN portions_total > 0 THEN IFNULL(portions_remaining, quantity * portions_total) + (? * portions_total)
            ELSE portions_remaining
          END
      WHERE id = ?`, [amount, amount, batchId]);
    
    await db.runAsync(
      'INSERT INTO ProductEventLedger (timestamp, product_id, batch_id, source, change_amount) VALUES (?, ?, ?, ?, ?)',
      [ts, productId, batchId, source, amount]
    );
  },

  /**
   * Completely removes a batch from the physical UI without dropping ledger history.
   */
  async softDeleteBatch(db: any, batchId: number, productId: number, source: 'USER' | 'AUDIT' = 'USER') {
    const row = await db.getFirstAsync<{quantity: number}>('SELECT quantity FROM Inventory WHERE id = ?', [batchId]);
    if (row && row.quantity > 0) {
      await this.consumeQuantity(db, batchId, productId, row.quantity, source);
    } else {
      // If already dead, no change needed, but just to be safe:
      const ts = Date.now();
      await db.runAsync('UPDATE Inventory SET quantity = 0, dead_at = ? WHERE id = ? AND dead_at IS NULL', [ts, batchId]);
    }
  },

  /**
   * Logs the creation of a new batch to the ledger and enforces the database size limit.
   */
  async registerNewBatch(db: any, batchId: number, productId: number, quantity: number, source: 'USER' | 'AUDIT' = 'USER') {
    const ts = Date.now();
    await db.runAsync(
      'INSERT INTO ProductEventLedger (timestamp, product_id, batch_id, source, change_amount) VALUES (?, ?, ?, ?, ?)',
      [ts, productId, batchId, source, quantity]
    );
    await this.enforceHighWaterMark(db);
  },

  /**
   * Prunes the oldest dead batches to enforce a 5000-row high-water mark.
   * Because of ON DELETE CASCADE, this automatically clears the oldest ledger rows.
   */
  async enforceHighWaterMark(db: any) {
    const countRes = await db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM Inventory');
    const total = countRes?.count || 0;
    
    if (total > 5000) {
      const excess = total - 5000;
      await db.runAsync(`
        DELETE FROM Inventory 
        WHERE id IN (
          SELECT id FROM Inventory 
          WHERE quantity = 0 AND dead_at IS NOT NULL 
          ORDER BY dead_at ASC 
          LIMIT ?
        )
      `, [excess]);
    }
  }
};
