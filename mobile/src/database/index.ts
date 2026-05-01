import { Cabinets } from './Cabinets';
import { Ledger } from './Ledger';
import { ItemTypes } from './ItemTypes';
import { Inventory } from './Inventory';

/**
 * The Database Layer (DAL) for the War Cabinet.
 * Centralizes all data access, validation, and tactical logging.
 * Modules are organised by entity, not by screen or feature.
 */
export const Database = {
  Cabinets,
  Ledger,
  ItemTypes,
  Inventory,
};
