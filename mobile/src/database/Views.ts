import { SQLiteDatabase } from 'expo-sqlite';

export const Views = {
  /**
   * Generates the hierarchical data structure required for the Tactical Radar (Starburst) visualization.
   * This spans Categories, ItemTypes, Inventory, and Cabinets to produce a 3-tier deep object array.
   */
  async getStarburstHierarchy(db: SQLiteDatabase, activeCabinetId?: string | number): Promise<any[]> {
    const now = new Date();
    const currentStamp = now.getFullYear() * 12 + (now.getMonth() + 1);

    let query = `
      SELECT c.id as cat_id, c.name as cat_name,
             it.id as type_id, it.name as type_name, it.default_size as type_default_size, it.unit_type as type_unit, it.image_uri as type_image_uri,
             inv.id as inv_id, inv.quantity, inv.expiry_month, inv.expiry_year,
             COALESCE(inv.size, it.default_size) as resolved_raw_size,
             inv.size as bespoke_size, inv.supplier, inv.product_range, inv.batch_intel, inv.image_uri as inv_image_uri,
             cab.id as cab_id, cab.cabinet_type as cab_type, cab.name as cab_name, cab.location as cab_location
      FROM Categories c
      JOIN ItemTypes it ON c.id = it.category_id
      JOIN Inventory inv ON it.id = inv.item_type_id
      LEFT JOIN Cabinets cab ON inv.cabinet_id = cab.id
    `;
    
    const params: any[] = [];
    if (activeCabinetId) {
      query += ` WHERE inv.cabinet_id = ? `;
      params.push(activeCabinetId);
    }
    
    query += ` ORDER BY c.name, it.name, inv.expiry_year, inv.expiry_month `;
    
    const rows = await db.getAllAsync<any>(query, params);

    const categories: any = {};
    rows.forEach(row => {
      if (!categories[row.cat_id]) {
        categories[row.cat_id] = { id: row.cat_id, name: row.cat_name, types: {}, total: 0 };
      }
      if (!categories[row.cat_id].types[row.type_id]) {
        categories[row.cat_id].types[row.type_id] = { id: row.type_id, name: row.type_name, image_uri: row.type_image_uri, batches: [], total: 0 };
      }
      
      // Calculate Batch Color based on triage definitions
      let batchColor = '#22c55e'; // Green (Safe)
      if (row.expiry_year && row.expiry_month) {
        const expStamp = row.expiry_year * 12 + row.expiry_month;
        const remaining = expStamp - currentStamp;
        if (remaining < 0) batchColor = '#991b1b'; // Deep Red (Expired)
        else if (remaining === 0) batchColor = '#f43f5e'; // Red (Urgent)
        else if (remaining <= 3) batchColor = '#f97316'; // Orange (Soon)
        else if (remaining <= 6) batchColor = '#fde047'; // Yellow (Upcoming)
      }

      const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const formattedExp = row.expiry_month && row.expiry_year 
        ? `${monthNames[row.expiry_month - 1]} ${row.expiry_year}` 
        : null;

      let resolvedSize = String(row.resolved_raw_size || "").trim();
      if (resolvedSize !== "" && /^\d+$/.test(resolvedSize)) {
        if (row.type_unit === 'weight') resolvedSize += 'G';
        else if (row.type_unit === 'volume') resolvedSize += 'ML';
      }

      const getMass = (s: any) => {
        const n = parseFloat(String(s).replace(/[^0-9.]/g, ''));
        return isNaN(n) ? null : n;
      };
      const bSize = getMass(row.bespoke_size);
      const defSize = getMass(row.type_default_size);

      let unitWeight = 1;
      if (bSize !== null && defSize !== null && defSize > 0) {
          unitWeight = bSize / defSize;
      }

      const batchWeight = row.quantity * unitWeight;

      categories[row.cat_id].types[row.type_id].batches.push({
        id: row.inv_id,
        qty: row.quantity,
        weight: batchWeight,
        unitWeight: unitWeight,
        color: batchColor,
        size: resolvedSize,
        bespoke_size: row.bespoke_size,
        default_size: row.type_default_size,
        brand: row.supplier,
        range: row.product_range,
        intel: row.batch_intel,
        image_uri: row.inv_image_uri,
        exp: formattedExp,
        exp_month: row.expiry_month,
        exp_year: row.expiry_year,
        cab_id: row.cab_id,
        cab_name: row.cab_name,
        cab_location: row.cab_location
      });
      categories[row.cat_id].types[row.type_id].total += row.quantity;
      categories[row.cat_id].total += row.quantity;
      categories[row.cat_id].types[row.type_id].weight = (categories[row.cat_id].types[row.type_id].weight || 0) + batchWeight;
      categories[row.cat_id].weight = (categories[row.cat_id].weight || 0) + batchWeight;
    });

    const finalData = Object.values(categories).map((cat: any) => {
      cat.types = Object.values(cat.types).map((type: any) => {
        if (type.batches.length === 1) {
          const b = type.batches[0];
          type.brand = b.brand;
          type.range = b.range;
          type.intel = b.intel;
          type.size = b.size;
          type.exp = b.exp;
          type.default_size = b.default_size;
        } else if (type.batches.length > 1) {
          type.default_size = type.batches[0].default_size;
        }
        return type;
      });
      return cat;
    });

    return finalData;
  }
};
