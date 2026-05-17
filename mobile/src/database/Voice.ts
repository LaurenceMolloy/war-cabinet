/**
 * Voice DAL — src/database/Voice.ts
 *
 * Holding area for SQL queries that are specific to the Voice Intel PoC.
 * These are isolated here rather than spread inline across the screen component.
 *
 * TODO: When voice search is promoted to a first-class feature, these queries
 * should be reviewed for integration with the main DAL modules (Inventory.ts,
 * ItemTypes.ts) or Voice.ts can be promoted as its own DAL module.
 */

export interface VoiceInventoryRow {
  id: number;
  item_type_id: number;
  name: string;
  brand: string | null;
  product_range: string | null;
  size: string | null;
  quantity: number;
  cabinet_id: number | null;
  default_cabinet_id: number | null;
  expiry_month: number | null;
  expiry_year: number | null;
  unit_type: string | null;
  batch_image: string | null;
  product_image: string | null;
}

export interface VoiceCabinetRow {
  id: string;
  name: string;
  audit_interval_months: number;
  audit_day_of_month: number;
  daysToAudit: number;
}

export const VoiceDAL = {

  /**
   * Returns all product names and default suppliers as a flat vocabulary list.
   * Used by the voice engine to snap spoken tokens to known terms.
   */
  async getVoiceVocabulary(db: any): Promise<string[]> {
    const rows = await db.getAllAsync<{ val: string }>(`
      SELECT DISTINCT name as val FROM ItemTypes
      UNION
      SELECT DISTINCT default_supplier as val FROM ItemTypes WHERE default_supplier IS NOT NULL
    `);
    const rawVocab = rows.map((r: { val: string }) => r.val.toLowerCase().replace(/['']/g, ''));
    const tokenizedVocab = rawVocab.flatMap((v: string) => v.split(/\s+/).filter((t: string) => t.length > 2));
    return Array.from(new Set([...rawVocab, ...tokenizedVocab]));
  },

  /**
   * Returns all cabinets with their audit schedule, sorted by days until next audit.
   */
  async getVoiceCabinets(db: any): Promise<VoiceCabinetRow[]> {
    const rows = await db.getAllAsync<any>(`
      SELECT id, name, audit_interval_months, audit_day_of_month 
      FROM Cabinets 
      ORDER BY name ASC
    `);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    return rows.map((cab: any) => {
      const interval = cab.audit_interval_months || 3;
      const day = cab.audit_day_of_month || 1;

      let targetMonth = currentMonth;
      while ((targetMonth - 1) % interval !== 0 || (targetMonth === currentMonth && day < currentDay)) {
        targetMonth++;
      }

      let targetYear = currentYear;
      while (targetMonth > 12) { targetMonth -= 12; targetYear += 1; }

      const nextAudit = new Date(targetYear, targetMonth - 1, day);
      const daysToAudit = Math.ceil((nextAudit.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      return { ...cab, daysToAudit };
    }).sort((a: VoiceCabinetRow, b: VoiceCabinetRow) => {
      if (a.daysToAudit !== b.daysToAudit) return a.daysToAudit - b.daysToAudit;
      return a.name.localeCompare(b.name);
    });
  },

  /**
   * Searches live inventory batches matching all provided tokens.
   * Returns up to 500 candidates for client-side scoring.
   *
   * @param tokens - Normalised search tokens (already snapped to vocabulary)
   * @param cabinetId - Optional cabinet filter applied in scoring, not SQL
   */
  async searchInventory(db: any, tokens: string[]): Promise<VoiceInventoryRow[]> {
    const placeholders = tokens
      .map(() => '(it.name LIKE ? OR COALESCE(inv.supplier, it.default_supplier) LIKE ?)')
      .join(' AND ');
    
    const params: any[] = tokens.flatMap(t => [`%${t}%`, `%${t}%`]);
    const sessionStartMs = Date.now() - 72 * 60 * 60 * 1000;
    params.push(sessionStartMs);

    const query = `
      SELECT 
        inv.id, inv.item_type_id, inv.quantity, inv.size, inv.cabinet_id, inv.expiry_month, inv.expiry_year,
        inv.image_uri as batch_image,
        it.name, it.default_cabinet_id, it.unit_type,
        it.image_uri as product_image,
        COALESCE(inv.supplier, it.default_supplier) as brand,
        COALESCE(inv.product_range, it.default_product_range) as product_range
      FROM Inventory inv
      JOIN ItemTypes it ON inv.item_type_id = it.id
      WHERE inv.quantity > 0 
      AND (${placeholders})
      AND (inv.last_audited_at IS NULL OR inv.last_audited_at < ?)
      ORDER BY inv.id DESC
      LIMIT 500
    `;

    return db.getAllAsync<VoiceInventoryRow>(query, params);
  },

  /**
   * Returns all live batches in a cabinet that have not been audited since
   * the given session window timestamp. Used by MISSION COMPLETE to auto-MIA
   * any items not physically verified during the session.
   *
   * @param cabinetId    - The cabinet being swept
   * @param sessionStartMs - Unix ms timestamp marking start of the audit window
   */
  async getUnauditedBatches(db: any, cabinetId: string | number, sessionStartMs: number): Promise<Array<{ id: number; item_type_id: number; quantity: number; name: string }>> {
    return db.getAllAsync<any>(`
      SELECT inv.id, inv.item_type_id, inv.quantity, it.name 
      FROM Inventory inv
      JOIN ItemTypes it ON inv.item_type_id = it.id
      WHERE inv.cabinet_id = ? AND inv.quantity > 0 
      AND (inv.last_audited_at IS NULL OR inv.last_audited_at < ?)
    `, [cabinetId, sessionStartMs]);
  },
};
