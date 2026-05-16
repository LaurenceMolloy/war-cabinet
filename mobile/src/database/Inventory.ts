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
   * Outcome can be 'VERIFIED', 'ADJUSTED', 'MIA', or 'NEW'.
   */
  async markAudited(db: any, id: number, outcome: 'VERIFIED' | 'ADJUSTED' | 'MIA' | 'NEW') {
    const now = Date.now();
    await db.runAsync('UPDATE Inventory SET last_audited_at = ?, last_audit_outcome = ? WHERE id = ?', [now, outcome, id]);
  },

  /**
   * Generates a tactical briefing for a specific cabinet's audit mission.
   * Calculates percentages based on the cabinet's unique Maneuver Schedule.
   */
  async getAuditBriefing(db: any, cabinetId: string | number | null) {
    // 1. Get Cabinet Schedule Defaults
    let interval = 3;
    let day = 1;
    if (cabinetId) {
      const cab = await db.getFirstAsync<{audit_interval_months: number, audit_day_of_month: number}>(
        'SELECT audit_interval_months, audit_day_of_month FROM Cabinets WHERE id = ?', [cabinetId]
      );
      if (cab) {
        interval = cab.audit_interval_months;
        day = cab.audit_day_of_month || 1;
      }
    }

    // 2. Handle Disabled Audits
    // 2. Handle Disabled Audits
    if (interval === 0) {
      const basic = await db.getFirstAsync<any>(`
        SELECT COUNT(id) as total_batches, COUNT(DISTINCT item_type_id) as total_products, SUM(quantity) as total_items
        FROM Inventory WHERE quantity > 0 ${cabinetId ? 'AND cabinet_id = ?' : ''}
      `, cabinetId ? [cabinetId] : []);
      
      return {
        isExempt: true,
        windowStart: 'MISSION EXEMPT',
        counts: {
          total: basic?.total_batches || 0,
          verified: 0,
          new: 0,
          mia: 0,
          adjusted: 0
        },
        percents: {
          complete: 100,
          verified: 0,
          new: 0,
          mia: 0,
          adjusted: 0
        }
      };
    }

    // 3. Calculate Window Start (Most recent 'Maneuver Day' in the current interval cycle)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    let targetMonth = currentMonth;
    while ((targetMonth - 1) % interval !== 0) targetMonth--;
    
    let windowStart = new Date(currentYear, targetMonth - 1, day);
    if (now < windowStart) {
        // We haven't hit the maneuver day this cycle yet, look back to the previous interval
        let prevMonth = targetMonth - interval;
        let prevYear = currentYear;
        if (prevMonth < 1) { prevMonth += 12; prevYear -= 1; }
        windowStart = new Date(prevYear, prevMonth - 1, day);
    }
    const windowStartMs = windowStart.getTime();

    // 3. Query Live Metrics
    let query = `
      SELECT 
        COUNT(id) as total_batches,
        COUNT(DISTINCT item_type_id) as total_products,
        SUM(quantity) as total_items,
        SUM(CASE WHEN last_audited_at >= ? THEN 1 ELSE 0 END) as audited_batches,
        SUM(CASE WHEN last_audited_at >= ? AND last_audit_outcome = 'VERIFIED' THEN 1 ELSE 0 END) as verified_batches,
        SUM(CASE WHEN last_audited_at >= ? AND last_audit_outcome = 'ADJUSTED' THEN 1 ELSE 0 END) as adjusted_batches,
        SUM(CASE WHEN last_audited_at >= ? AND last_audit_outcome = 'NEW' THEN 1 ELSE 0 END) as new_batches,
        SUM(CASE WHEN last_audited_at >= (strftime('%s','now','-24 hours') * 1000) THEN 1 ELSE 0 END) as session_batches
      FROM Inventory
      WHERE quantity > 0
    `;
    const params: any[] = [windowStartMs, windowStartMs, windowStartMs, windowStartMs];
    if (cabinetId) {
      query += " AND cabinet_id = ?";
      params.push(cabinetId);
    }

    const row = await db.getFirstAsync<any>(query, params);

    // 4. Handle MIA (Items that were expected but vanished during this window)
    let miaQuery = `
      SELECT COUNT(*) as count 
      FROM Inventory 
      WHERE quantity = 0 AND dead_at >= ? AND last_audit_outcome = 'MIA'
    `;
    const miaParams: any[] = [windowStartMs];
    if (cabinetId) {
      miaQuery += " AND cabinet_id = ?";
      miaParams.push(cabinetId);
    }
    const miaRow = await db.getFirstAsync<{count: number}>(miaQuery, miaParams);
    const miaCount = miaRow?.count || 0;

    const totalExpected = (row.total_batches || 0) + miaCount - (row.new_batches || 0);

    return {
      isExempt: false,
      windowStart: windowStart.toLocaleDateString(),
      counts: {
        total: totalExpected,
        verified: row.verified_batches || 0,
        new: row.new_batches || 0,
        mia: miaCount,
        adjusted: row.adjusted_batches || 0
      },
      percents: {
        complete: totalExpected > 0 ? Math.round(((row.audited_batches + miaCount - row.new_batches) / totalExpected) * 100) : 0,
        verified: totalExpected > 0 ? Math.round((row.verified_batches / totalExpected) * 100) : 0,
        new: totalExpected > 0 ? Math.round((row.new_batches / totalExpected) * 100) : 0,
        mia: totalExpected > 0 ? Math.round((miaCount / totalExpected) * 100) : 0,
        adjusted: totalExpected > 0 ? Math.round((row.adjusted_batches / totalExpected) * 100) : 0
      }
    };
  },

  // ============================================================================
  // AUDIT GATEWAY (V116) - PENDING CHANGES
  // ============================================================================

  async proposeAdjustment(db: any, batchId: number, itemTypeId: number, proposedQty: number) {
    const ts = Date.now();
    await db.runAsync('DELETE FROM AuditPendingChanges WHERE batch_id = ?', [batchId]);
    await db.runAsync(
      'INSERT INTO AuditPendingChanges (batch_id, item_type_id, change_type, proposed_intel, created_at) VALUES (?, ?, ?, ?, ?)',
      [batchId, itemTypeId, 'ADJUST', JSON.stringify({ quantity: proposedQty }), ts]
    );
    await db.runAsync('UPDATE Inventory SET last_audited_at = ?, last_audit_outcome = ? WHERE id = ?', [ts, 'PENDING', batchId]);
  },

  async proposeMIA(db: any, batchId: number, itemTypeId: number) {
    const ts = Date.now();
    await db.runAsync('DELETE FROM AuditPendingChanges WHERE batch_id = ?', [batchId]);
    await db.runAsync(
      'INSERT INTO AuditPendingChanges (batch_id, item_type_id, change_type, proposed_intel, created_at) VALUES (?, ?, ?, ?, ?)',
      [batchId, itemTypeId, 'MIA', JSON.stringify({ quantity: 0 }), ts]
    );
    await db.runAsync('UPDATE Inventory SET last_audited_at = ?, last_audit_outcome = ? WHERE id = ?', [ts, 'PENDING', batchId]);
  },

  async proposeNewDiscovery(db: any, itemTypeId: number, cabinetId: number | string, intel: { quantity: number, brand?: string, range?: string, size?: string, month?: number, year?: number }) {
    const ts = Date.now();
    await db.runAsync(
      'INSERT INTO AuditPendingChanges (batch_id, item_type_id, cabinet_id, change_type, proposed_intel, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [null, itemTypeId, cabinetId, 'NEW', JSON.stringify(intel), ts]
    );
  },

  async getPendingChanges(db: any) {
    const query = `
      SELECT 
        AuditPendingChanges.*, 
        ItemTypes.name, 
        ItemTypes.unit_type, 
        ItemTypes.default_cabinet_id as it_cab,
        Inventory.quantity as current_qty,
        Inventory.cabinet_id as inv_cab,
        Inventory.supplier as raw_inv_brand,
        ItemTypes.default_supplier as raw_it_brand,
        Inventory.product_range as raw_inv_range,
        ItemTypes.default_product_range as raw_it_range,
        COALESCE(NULLIF(Inventory.supplier, ''), NULLIF(ItemTypes.default_supplier, '')) as brand,
        COALESCE(NULLIF(Inventory.product_range, ''), NULLIF(ItemTypes.default_product_range, '')) as product_range,
        Inventory.size,
        Inventory.expiry_month,
        Inventory.expiry_year,
        Cabinets.name as cabinet_name
      FROM AuditPendingChanges
      JOIN ItemTypes ON AuditPendingChanges.item_type_id = ItemTypes.id
      LEFT JOIN Inventory ON AuditPendingChanges.batch_id = Inventory.id
      LEFT JOIN Cabinets ON Cabinets.id = COALESCE(AuditPendingChanges.cabinet_id, Inventory.cabinet_id, ItemTypes.default_cabinet_id)
      ORDER BY AuditPendingChanges.created_at DESC
    `;
    return await db.getAllAsync<any>(query);
  },

  async commitPendingChange(db: any, changeId: number) {
    const change = await db.getFirstAsync<any>('SELECT * FROM AuditPendingChanges WHERE id = ?', [changeId]);
    if (!change) return;

    const intel = change.proposed_intel ? JSON.parse(change.proposed_intel) : {};

    if (change.change_type === 'ADJUST') {
      const diff = change.original_qty - intel.quantity; // Note: we'll need to fetch original_qty or rely on JSON
      // Better: fetch current quantity from Inventory
      const batch = await db.getFirstAsync<any>('SELECT quantity FROM Inventory WHERE id = ?', [change.batch_id]);
      if (batch) {
        const adjustment = batch.quantity - intel.quantity;
        await this.consumeQuantity(db, change.batch_id, change.item_type_id, adjustment, 'AUDIT');
        await this.markAudited(db, change.batch_id, 'ADJUSTED');
      }
    } else if (change.change_type === 'MIA') {
      await this.softDeleteBatch(db, change.batch_id, change.item_type_id, 'AUDIT');
      await this.markAudited(db, change.batch_id, 'MIA');
    } else if (change.change_type === 'NEW') {
      await db.runAsync(
        'INSERT INTO Inventory (item_type_id, cabinet_id, quantity, size, supplier, product_range, expiry_month, expiry_year, last_audited_at, last_audit_outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [change.item_type_id, change.cabinet_id, intel.quantity, intel.size, intel.brand, intel.range, intel.month, intel.year, Date.now(), 'NEW']
      );
    }

    await db.runAsync('DELETE FROM AuditPendingChanges WHERE id = ?', [changeId]);
  },

  async discardPendingChange(db: any, changeId: number) {
    const change = await db.getFirstAsync<any>('SELECT batch_id FROM AuditPendingChanges WHERE id = ?', [changeId]);
    if (change && change.batch_id) {
      // Reset audit outcome if we're discarding an adjustment
      await db.runAsync('UPDATE Inventory SET last_audit_outcome = NULL WHERE id = ?', [change.batch_id]);
    }
    await db.runAsync('DELETE FROM AuditPendingChanges WHERE id = ?', [changeId]);
  },

  async clearPendingChanges(db: any, batchId: number) {
    await db.runAsync('DELETE FROM AuditPendingChanges WHERE batch_id = ?', [batchId]);
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
        await db.runAsync('UPDATE Inventory SET quantity = 0, dead_at = ?, portions_remaining = 0, last_audited_at = ?, last_audit_outcome = ? WHERE id = ?', [ts, ts, 'ADJUSTED', batchId]);
      } else {
        await db.runAsync(`
          UPDATE Inventory 
          SET quantity = ?,
              last_audited_at = ?,
              last_audit_outcome = ?,
              portions_remaining = CASE 
                WHEN portions_total > 0 THEN MIN(IFNULL(portions_remaining, quantity * portions_total), ? * portions_total)
                ELSE portions_remaining 
              END 
          WHERE id = ?`, [newQty, ts, 'ADJUSTED', newQty, batchId]);
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
          last_audited_at = ?,
          last_audit_outcome = ?,
          portions_remaining = CASE
            WHEN portions_total > 0 THEN IFNULL(portions_remaining, quantity * portions_total) + (? * portions_total)
            ELSE portions_remaining
          END
      WHERE id = ?`, [amount, ts, 'VERIFIED', amount, batchId]);
    
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
   * Wipes the audit status for all batches in a specific cabinet.
   * Useful for testing or mission recalibration.
   */
  async resetCabinetAudit(db: any, cabinetId: string | number) {
    await db.runAsync(`
      UPDATE Inventory 
      SET last_audited_at = NULL, 
          last_audit_outcome = NULL 
      WHERE cabinet_id = ?
    `, [cabinetId]);
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
  },


};
