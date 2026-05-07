/**
 * GLOBAL ONTOLOGY MANIFEST
 * 
 * Single source of truth for all user-facing terminology.
 * Use these constants instead of hardcoded strings to ensure consistency.
 */
export const LABELS = {
  // Core Entities
  PRODUCT: 'Product',
  PRODUCTS: 'Products',
  ITEM: 'Item',
  ITEMS: 'Items',
  CATEGORY: 'Category',
  CATEGORIES: 'Categories',
  CABINET: 'Cabinet',
  CABINETS: 'Cabinets',

  // Actions & Commands
  ADD_PRODUCT: 'Add Product',
  EDIT_PRODUCT: 'Edit Product',
  NEW_PRODUCT: 'New Product',
  SELECT_PRODUCT: 'Select Product',
  NO_PRODUCTS_FOUND: 'No products found',

  // Metrics & Displays
  TOTAL_ITEMS: 'Total Items',
  ITEMS_IN_STOCK: 'items in stock',
  UNITS_IN_STOCK: 'units in stock', // Legacy support if needed
  TRACKED_PRODUCTS: 'products tracked',

  // Intel Hub
  PRODUCT_INTEL: 'PRODUCT INTEL',
  CATEGORY_INTEL: 'CATEGORY INTEL',
  BATCH_INTEL: 'BATCH INTEL',
};
