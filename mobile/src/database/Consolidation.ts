import { SQLiteDatabase } from 'expo-sqlite';

export type ConsolidationStrategy = 'ADOPT' | 'STRIP' | 'NORMAL';

export interface ConsolidationCandidate {
  id: number;
  batch_intel: string | null;
  expiry_month: number | null;
  expiry_year: number | null;
  supplier: string | null;
  product_range: string | null;
  size: string;
}

export interface NewBatchData {
  typeId: number;
  q: number;
  finalSize: string;
  expMVal: number | null;
  expYVal: number | null;
  batchIntel: string | null;
  supplier: string | null;
  productRange: string | null;
  portions_total: number | null;
  portions_remaining: number;
  selectedCabinetId: number;
  entryM: number;
  entryY: number;
  entryD: number;
}

export const Consolidation = {
  /**
   * Finds all inventory batches that are structural matches (Type, Size, Cabinet, Expiry)
   * but have differing secondary metadata (Brand, Range, Intel).
   * 
   * Filters out "Hard Conflicts" (where both have different non-null values for Brand/Range/Portions).
   */
  async findCandidates(db: SQLiteDatabase, params: {
    typeId: number;
    size: string;
    cabinetId: number;
    expiryMonth: number | null;
    expiryYear: number | null;
    excludeId?: number;
    // Current entry data for conflict check
    newSupplier: string | null;
    newRange: string | null;
  }): Promise<ConsolidationCandidate[]> {
    const { typeId, size, cabinetId, expiryMonth, expiryYear, excludeId, newSupplier, newRange } = params;

    const query = `
      SELECT id, batch_intel, expiry_month, expiry_year, supplier, product_range, size 
      FROM Inventory 
      WHERE item_type_id = ? AND size = ? AND cabinet_id = ?
        AND ( (expiry_month IS NULL AND ? IS NULL) OR (expiry_month = ?) )
        AND ( (expiry_year IS NULL AND ? IS NULL) OR (expiry_year = ?) )
        AND id != ?
    `;

    const allMatches = await db.getAllAsync<ConsolidationCandidate>(query, [
      typeId, size, cabinetId, 
      expiryMonth, expiryMonth, 
      expiryYear, expiryYear, 
      excludeId || -1
    ]);

    // Filter for "Mergeable" candidates (no hard conflicts)
    return allMatches.filter(candidate => {
      const dbS = candidate.supplier;
      const dbR = candidate.product_range;
      const newS = newSupplier;
      const newR = newRange;

      const isBrandConflict = dbS && newS && dbS.toLowerCase() !== newS.toLowerCase();
      const isRangeConflict = dbR && newR && dbR.toLowerCase() !== newR.toLowerCase();

      return !isBrandConflict && !isRangeConflict;
    });
  },

  /**
   * Commits the batch to the database.
   * If targetId is provided, it merges into that batch using the specified strategy.
   * Otherwise, it creates a new batch.
   */
  async commit(db: SQLiteDatabase, { 
    targetId, 
    data, 
    strategy = 'NORMAL' 
  }: { 
    targetId: number | null, 
    data: NewBatchData, 
    strategy?: ConsolidationStrategy 
  }) {
    if (targetId) {
      const existing = await db.getFirstAsync<any>(
        'SELECT quantity, portions_total, portions_remaining, supplier, product_range, batch_intel FROM Inventory WHERE id = ?', 
        [targetId]
      );

      const currentTotal = existing?.portions_total || data.portions_total || 0;
      const currentRem = existing?.portions_remaining !== null ? existing.portions_remaining : (existing?.quantity || 0) * currentTotal;
      const addedRem = data.q * (data.portions_total || currentTotal);

      let finalS = data.supplier;
      let finalR = data.productRange;
      let finalI = data.batchIntel;

      if (strategy === 'ADOPT') {
        finalS = data.supplier || existing?.supplier || null;
        finalR = data.productRange || existing?.product_range || null;
        finalI = data.batchIntel || existing?.batch_intel || null;
      } else if (strategy === 'STRIP') {
        finalS = null;
        finalR = null;
        finalI = null;
      } else {
        // NORMAL: Preserve existing
        finalS = existing?.supplier || null;
        finalR = existing?.product_range || null;
        finalI = existing?.batch_intel || null;
      }

      await db.runAsync(
        `UPDATE Inventory SET 
          quantity = quantity + ?, 
          portions_remaining = ?, 
          portions_total = ?,
          supplier = ?,
          product_range = ?,
          batch_intel = ?
         WHERE id = ?`,
        [data.q, currentRem + addedRem, currentTotal, finalS, finalR, finalI, targetId]
      );
      return targetId;
    } else {
      const res = await db.runAsync(
        `INSERT INTO Inventory (item_type_id, quantity, size, expiry_month, expiry_year, entry_month, entry_year, entry_day, cabinet_id, batch_intel, supplier, product_range, portions_total, portions_remaining) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.typeId, data.q, data.finalSize, 
          data.expMVal, data.expYVal, 
          data.entryM, data.entryY, data.entryD || 1, 
          data.selectedCabinetId, data.batchIntel || null, 
          data.supplier || null, data.productRange || null, 
          data.portions_total, 
          (data.portions_total && data.q > 1) ? (data.portions_remaining + (data.portions_total * (data.q - 1))) : data.portions_remaining
        ]
      );
      return res.lastInsertRowId;
    }
  }
};
