/**
 * measurements.ts
 * ─────────────────────────────────────────────────────────────────
 * Single source of truth for all quantity formatting and sanitization.
 *
 * RULES:
 *   - The DATABASE stores RAW NUMBERS ONLY (no units, no letters).
 *   - This module is the ONLY place that appends unit labels for display.
 *   - This module is the ONLY place that strips non-numeric characters
 *     before writing to the database.
 * ─────────────────────────────────────────────────────────────────
 */

/** Maps unit_type from the database to its display abbreviation. */
const UNIT_SUFFIX: Record<string, string> = {
  weight: 'g',
  volume: 'ml',
  count:  '',
};

/**
 * Returns the unit suffix string for a given unit_type.
 * Falls back to '' if the unit type is unknown or not provided.
 */
export function getUnitSuffix(unitType?: string | null): string {
  if (!unitType) return '';
  return UNIT_SUFFIX[unitType] ?? '';
}

/**
 * Formats a raw numeric quantity for display.
 *
 * Examples:
 *   formatQuantity(500,  'weight') → '500g'
 *   formatQuantity(330,  'volume') → '330ml'
 *   formatQuantity(3,    'count')  → '3'
 *   formatQuantity(1500, 'weight') → '1.5kg'
 *   formatQuantity(1100, 'volume') → '1.1L'
 *   formatQuantity(null, 'weight') → ''
 */
export function formatQuantity(
  value: number | string | null | undefined,
  unitType?: string | null,
  opts?: { abbreviate?: boolean }
): string {
  if (value === null || value === undefined || value === '') return '';

  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '';

  const abbreviate = opts?.abbreviate ?? true;
  const suffix = getUnitSuffix(unitType);

  // Auto-abbreviate large values when requested
  if (abbreviate) {
    if (unitType === 'weight' && num >= 1000) {
      const kg = num / 1000;
      return `${kg % 1 === 0 ? kg.toFixed(0) : kg.toFixed(1)}kg`;
    }
    if (unitType === 'volume' && num >= 1000) {
      const l = num / 1000;
      return `${l % 1 === 0 ? l.toFixed(0) : l.toFixed(1)}L`;
    }
  }

  return `${num}${suffix}`;
}

/**
 * Strips all non-numeric characters from a string, leaving only digits and
 * an optional leading decimal point.
 * This is the DAL "Bouncer" — call before any INSERT/UPDATE of a size value.
 *
 * Examples:
 *   normalizeNumericInput('500g')   → '500'
 *   normalizeNumericInput('1.5kg')  → '1.5'
 *   normalizeNumericInput('400 ml') → '400'
 *   normalizeNumericInput('500')    → '500'
 *   normalizeNumericInput(null)     → null
 */
export function normalizeNumericInput(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const str = String(value);
  // Keep digits and at most one decimal point
  const cleaned = str.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
  if (cleaned === '' || cleaned === '.') return null;
  return cleaned;
}

/**
 * Formats a stock quantity for display in resupply and logistics lists.
 * Shows "3 packs" for count types, "500g" for weight, "330ml" for volume.
 */
export function formatStockLabel(
  count: number,
  unitType?: string | null,
  defaultSize?: string | null
): string {
  if (!defaultSize || !unitType || unitType === 'count') {
    return count === 1 ? '1 pack' : `${count} packs`;
  }
  const sizeNum = parseFloat(defaultSize);
  if (isNaN(sizeNum)) return count === 1 ? '1 pack' : `${count} packs`;
  const totalRaw = count * sizeNum;
  return formatQuantity(totalRaw, unitType);
}
