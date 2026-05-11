import { Stack, useRouter } from 'expo-router';
import { Suspense, useEffect } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { initializeDatabase } from '../db/sqlite';
import * as Notifications from 'expo-notifications';
import { BillingProvider } from '../context/BillingContext';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';

function DeepLinkHandler() {
  const router = useRouter();
  const url = Linking.useURL();

  useEffect(() => {
    if (url) {
      const { hostname, path, queryParams } = Linking.parse(url);
      // Support both mobile://add and mobile://add/ (hostname vs path depending on OS interpretation)
      if (path === 'add' || hostname === 'add') {
        console.log('[TACTICAL] Intercepted Deep Link:', url);
        router.push({ pathname: '/add', params: queryParams || {} });
      }
    }
  }, [url]);

  return null;
}

function E2ESeeder() {
  const db = useSQLiteContext();

  useEffect(() => {
    if (__DEV__ && Platform.OS === 'web') {
      const params = new URLSearchParams(window.location.search);
      const requestedRank = params.get('rank')?.toUpperCase();
      const requestedSetup = params.get('setup')?.toLowerCase();
      
      const SCENARIOS: Record<string, { rank: string, apply: (db: any) => Promise<void> }> = {
        'foundation_basic_cabinets_and_categories': { rank: 'SERGEANT', apply: async (db) => await SCENARIOS['foundation_basic_grid_with_types'].apply(db) },
        'foundation_basic_grid_with_types': {
          rank: 'SERGEANT',
          apply: async (db) => {
            console.log('[E2E] STARTING FOUNDATION SEED...');
            try {
              // 1. Full Tactical Wipe (Child-first to respect constraints)
              await db.execAsync('DELETE FROM TacticalLogs');
              await db.execAsync('DELETE FROM Inventory');
              await db.execAsync('DELETE FROM ItemTypes');
              await db.execAsync('DELETE FROM Categories');
              await db.execAsync('DELETE FROM Cabinets');
              await db.execAsync('DELETE FROM Missions');
              await db.execAsync("DELETE FROM Settings WHERE key = 'last_used_cabinet_id'");
              await db.execAsync("DELETE FROM sqlite_sequence WHERE name IN ('Inventory', 'ItemTypes', 'Categories', 'Cabinets', 'TacticalLogs', 'Missions')");
              console.log('[E2E] DB CLEARED & SEQUENCES RESET');

              // 2. Deploy Cabinets
              const cab1 = await db.runAsync('INSERT INTO Cabinets (name, location, cabinet_type) VALUES (?, ?, ?)', ['TEST CABINET 1', 'TEST LOCATION 1', 'standard']);
              const cab2 = await db.runAsync('INSERT INTO Cabinets (name, location, cabinet_type) VALUES (?, ?, ?)', ['TEST CABINET 2', 'TEST LOCATION 2', 'standard']);
              const cab3 = await db.runAsync('INSERT INTO Cabinets (name, location, cabinet_type) VALUES (?, ?, ?)', ['TEST FREEZER 1', 'TEST LOCATION 3', 'freezer']);
              const cab4 = await db.runAsync('INSERT INTO Cabinets (name, location, cabinet_type) VALUES (?, ?, ?)', ['TEST FREEZER 2', 'TEST LOCATION 4', 'freezer']);

              const cab1Id = cab1.lastInsertRowId;
              const cab2Id = cab2.lastInsertRowId;
              const cab3Id = cab3.lastInsertRowId;
              const cab4Id = cab4.lastInsertRowId;

              // 3. Deploy Categories & Bound Item Types
              const cat1 = await db.runAsync('INSERT INTO Categories (name, icon, is_mess_hall) VALUES (?, ?, ?)', ['TEST CATEGORY 1', 'wheat', 1]);
              await db.runAsync('INSERT INTO ItemTypes (name, category_id, unit_type, default_size, default_cabinet_id, default_supplier, default_product_range, freeze_months, vanguard_resolved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                ['TEST ITEM 1', cat1.lastInsertRowId, 'weight', '100', cab1Id, null, null, 1, 1]);

              const cat2 = await db.runAsync('INSERT INTO Categories (name, icon, is_mess_hall) VALUES (?, ?, ?)', ['TEST CATEGORY 2', 'water', 1]);
              await db.runAsync('INSERT INTO ItemTypes (name, category_id, unit_type, default_size, default_cabinet_id, default_supplier, default_product_range, freeze_months, vanguard_resolved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                ['TEST ITEM 2', cat2.lastInsertRowId, 'volume', '100', cab2Id, 'TEST BRAND 2', 'TEST RANGE 2', 2, 1]);

              const cat3 = await db.runAsync('INSERT INTO Categories (name, icon, is_mess_hall) VALUES (?, ?, ?)', ['TEST CATEGORY 3', 'leaf', 1]);
              await db.runAsync('INSERT INTO ItemTypes (name, category_id, unit_type, default_size, default_cabinet_id, default_supplier, default_product_range, freeze_months, vanguard_resolved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                ['TEST ITEM 3', cat3.lastInsertRowId, 'count', '100', cab3Id, 'TEST BRAND 3', 'TEST RANGE 3', 3, 1]);

              const cat4 = await db.runAsync('INSERT INTO Categories (name, icon, is_mess_hall) VALUES (?, ?, ?)', ['TEST CATEGORY 4', 'food-apple', 1]);
              await db.runAsync('INSERT INTO ItemTypes (name, category_id, unit_type, default_size, default_cabinet_id, default_supplier, default_product_range, freeze_months, vanguard_resolved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                ['TEST ITEM 4', cat4.lastInsertRowId, 'weight', '100', cab4Id, 'TEST BRAND 4', 'TEST RANGE 4', 4, 1]);

              window.localStorage.setItem('E2E_SEED_STATUS', 'SUCCESS');
              console.log('[E2E] FOUNDATION SEED COMPLETE - RELOADING...');
            } catch (e: any) {
              console.error('[E2E] SEED FAILURE:', e);
              window.localStorage.setItem('E2E_SEED_ERROR', e.message || 'Unknown DB Error');
              throw e;
            }
          }
        },
        'foundation_oversight': {
          rank: 'SERGEANT',
          apply: async (db) => {
            console.log('[E2E] STARTING OVERSIGHT SEED...');
            try {
              // 1. Full Tactical Wipe
              await db.execAsync('DELETE FROM TacticalLogs');
              await db.execAsync('DELETE FROM Inventory');
              await db.execAsync('DELETE FROM ItemTypes');
              await db.execAsync('DELETE FROM Categories');
              await db.execAsync('DELETE FROM Cabinets');
              await db.execAsync('DELETE FROM Missions');
              await db.execAsync("DELETE FROM Settings WHERE key = 'last_used_cabinet_id'");
              await db.execAsync("DELETE FROM sqlite_sequence WHERE name IN ('Inventory', 'ItemTypes', 'Categories', 'Cabinets', 'TacticalLogs', 'Missions')");

              // 2. Deploy 4 Standard Cabinets (Homogeneous for clean oversight testing)
              await db.runAsync('INSERT INTO Cabinets (name, location, cabinet_type) VALUES (?, ?, ?)', ['TEST CABINET 1', 'SITE 1', 'standard']);
              await db.runAsync('INSERT INTO Cabinets (name, location, cabinet_type) VALUES (?, ?, ?)', ['TEST CABINET 2', 'SITE 2', 'standard']);
              await db.runAsync('INSERT INTO Cabinets (name, location, cabinet_type) VALUES (?, ?, ?)', ['TEST CABINET 3', 'SITE 3', 'standard']);
              await db.runAsync('INSERT INTO Cabinets (name, location, cabinet_type) VALUES (?, ?, ?)', ['TEST CABINET 4', 'SITE 4', 'standard']);

              // 3. Deploy 1 Category (Minimalist for focus)
              const cat1 = await db.runAsync('INSERT INTO Categories (name, icon, is_mess_hall) VALUES (?, ?, ?)', ['LOGISTICS TEST', 'truck-delivery', 1]);
              
              // 4. Deploy 1 Pre-existing Item Type with Stock in Cab 1
              const type1 = await db.runAsync('INSERT INTO ItemTypes (name, category_id, unit_type, default_size, default_cabinet_id, vanguard_resolved) VALUES (?, ?, ?, ?, ?, ?)', 
                ['TEST ITEM 1', cat1.lastInsertRowId, 'weight', '100', 1, 1]);
              
              const now = new Date();
              await db.runAsync('INSERT INTO Inventory (item_type_id, quantity, size, entry_month, entry_year, cabinet_id, batch_intel) VALUES (?, ?, ?, ?, ?, ?, ?)', 
                [type1.lastInsertRowId, 10, '100', now.getMonth() + 1, now.getFullYear(), 1, 'BASELINE STOCK']);

              window.localStorage.setItem('E2E_SEED_STATUS', 'SUCCESS');
              console.log('[E2E] OVERSIGHT SEED COMPLETE.');
            } catch (e: any) {
              console.error('[E2E] SEED FAILURE:', e);
              window.localStorage.setItem('E2E_SEED_ERROR', e.message || 'Unknown DB Error');
              throw e;
            }
          }
        },
        'foundation_with_inventory': {
          rank: 'SERGEANT',
          apply: async (db) => {
            console.log('[E2E] STARTING INVENTORY SEED...');
            try {
              // 1. Full Tactical Wipe
              await db.execAsync('DELETE FROM TacticalLogs');
              await db.execAsync('DELETE FROM Inventory');
              await db.execAsync('DELETE FROM ItemTypes');
              await db.execAsync('DELETE FROM Categories');
              await db.execAsync('DELETE FROM Cabinets');
              await db.execAsync('DELETE FROM Missions');
              await db.execAsync("DELETE FROM Settings WHERE key = 'last_used_cabinet_id'");
              await db.execAsync("DELETE FROM sqlite_sequence WHERE name IN ('Inventory', 'ItemTypes', 'Categories', 'Cabinets', 'TacticalLogs', 'Missions')");

              // 2. Deploy Cabinets
              const cab1 = await db.runAsync('INSERT INTO Cabinets (name, location, cabinet_type) VALUES (?, ?, ?)', ['TEST CABINET 1', 'TEST LOCATION 1', 'standard']);
              const cab2 = await db.runAsync('INSERT INTO Cabinets (name, location, cabinet_type) VALUES (?, ?, ?)', ['TEST CABINET 2', 'TEST LOCATION 2', 'standard']);
              const cab3 = await db.runAsync('INSERT INTO Cabinets (name, location, cabinet_type) VALUES (?, ?, ?)', ['TEST FREEZER 1', 'TEST LOCATION 3', 'freezer']);
              const cab4 = await db.runAsync('INSERT INTO Cabinets (name, location, cabinet_type) VALUES (?, ?, ?)', ['TEST FREEZER 2', 'TEST LOCATION 4', 'freezer']);
              const cab1Id = cab1.lastInsertRowId;
              const cab2Id = cab2.lastInsertRowId;
              const cab3Id = cab3.lastInsertRowId;
              const cab4Id = cab4.lastInsertRowId;

              // 3. Deploy Categories & Bound Item Types
              const cat1 = await db.runAsync('INSERT INTO Categories (name, icon, is_mess_hall) VALUES (?, ?, ?)', ['TEST CATEGORY 1', 'wheat', 1]);
              const type1 = await db.runAsync('INSERT INTO ItemTypes (name, category_id, unit_type, default_size, default_cabinet_id, default_supplier, default_product_range, freeze_months, vanguard_resolved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                ['TEST ITEM 1', cat1.lastInsertRowId, 'weight', '100', cab1Id, null, null, 1, 1]);

              const cat2 = await db.runAsync('INSERT INTO Categories (name, icon, is_mess_hall) VALUES (?, ?, ?)', ['TEST CATEGORY 2', 'water', 1]);
              const type2 = await db.runAsync('INSERT INTO ItemTypes (name, category_id, unit_type, default_size, default_cabinet_id, default_supplier, default_product_range, freeze_months, vanguard_resolved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                ['TEST ITEM 2', cat2.lastInsertRowId, 'volume', '100', cab2Id, 'TEST BRAND 2', 'TEST RANGE 2', 2, 1]);

              const cat3 = await db.runAsync('INSERT INTO Categories (name, icon, is_mess_hall) VALUES (?, ?, ?)', ['TEST CATEGORY 3', 'leaf', 1]);
              const type3 = await db.runAsync('INSERT INTO ItemTypes (name, category_id, unit_type, default_size, default_cabinet_id, default_supplier, default_product_range, freeze_months, vanguard_resolved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                ['TEST ITEM 3', cat3.lastInsertRowId, 'count', '100', cab3Id, 'TEST BRAND 3', 'TEST RANGE 3', 3, 1]);

              const cat4 = await db.runAsync('INSERT INTO Categories (name, icon, is_mess_hall) VALUES (?, ?, ?)', ['TEST CATEGORY 4', 'food-apple', 1]);
              const type4 = await db.runAsync('INSERT INTO ItemTypes (name, category_id, unit_type, default_size, default_cabinet_id, default_supplier, default_product_range, freeze_months, vanguard_resolved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                ['TEST ITEM 4', cat4.lastInsertRowId, 'weight', '100', cab4Id, 'TEST BRAND 4', 'TEST RANGE 4', 4, 1]);

              // 4. Deploy Baseline Inventory
              const now = new Date();
              const m = now.getMonth() + 1;
              const y = now.getFullYear();
              await db.runAsync('INSERT INTO Inventory (item_type_id, quantity, size, entry_month, entry_year, cabinet_id, batch_intel) VALUES (?, ?, ?, ?, ?, ?, ?)', [type1.lastInsertRowId, 10, '100', m, y, cab1Id, 'INITIAL STOCK']);
              await db.runAsync('INSERT INTO Inventory (item_type_id, quantity, size, entry_month, entry_year, cabinet_id, batch_intel) VALUES (?, ?, ?, ?, ?, ?, ?)', [type2.lastInsertRowId, 5, '100', m, y, cab2Id, 'INITIAL STOCK']);
              await db.runAsync('INSERT INTO Inventory (item_type_id, quantity, size, entry_month, entry_year, cabinet_id, batch_intel) VALUES (?, ?, ?, ?, ?, ?, ?)', [type3.lastInsertRowId, 2, '100', m, y, cab3Id, 'INITIAL STOCK']);
              await db.runAsync('INSERT INTO Inventory (item_type_id, quantity, size, entry_month, entry_year, cabinet_id, batch_intel) VALUES (?, ?, ?, ?, ?, ?, ?)', [type4.lastInsertRowId, 8, '100', m, y, cab4Id, 'INITIAL STOCK']);

              window.localStorage.setItem('E2E_SEED_STATUS', 'SUCCESS');
              console.log('[E2E] INVENTORY SEED COMPLETE - RELOADING...');
            } catch (e: any) {
              console.error('[E2E] SEED FAILURE:', e);
              window.localStorage.setItem('E2E_SEED_ERROR', e.message || 'Unknown DB Error');
              throw e;
            }
          }
        },
        'foundation_heavy_inventory': {
          rank: 'VETERAN',
          apply: async (db) => {
            console.log('[E2E] STARTING DYNAMIC HEAVY SEED...');
            try {
              // 1. Wipe
              await db.execAsync('DELETE FROM TacticalLogs; DELETE FROM Inventory; DELETE FROM ItemTypes; DELETE FROM Categories; DELETE FROM Cabinets; DELETE FROM Missions;');
              await db.execAsync("DELETE FROM Settings WHERE key = 'last_used_cabinet_id'");
              await db.execAsync("DELETE FROM sqlite_sequence WHERE name IN ('Inventory', 'ItemTypes', 'Categories', 'Cabinets', 'TacticalLogs', 'Missions')");

              // 2. Cabinets (6)
              const cabNames = ['MAIN PANTRY', 'GARAGE FREEZER', 'BASEMENT SHELVES', 'KITCHEN CUPBOARD', 'EMERGENCY BUNKER', 'COLD STORE'];
              const cabIds: number[] = [];
              for (const name of cabNames) {
                const res = await db.runAsync('INSERT INTO Cabinets (name, location, cabinet_type, rotation_interval_months) VALUES (?, ?, ?, ?)', 
                  [name, 'MAIN SITE', name.includes('FREEZER') ? 'freezer' : 'standard', name.includes('FREEZER') ? 6 : 12]);
                cabIds.push(res.lastInsertRowId);
              }

              // 3. Web-Safe Imagery (Unsplash)
              const sampleImages = [
                'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400&q=80',
                'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=400&q=80',
                'https://images.unsplash.com/photo-1590779033100-9f60a05a013d?auto=format&fit=crop&w=400&q=80',
                'https://images.unsplash.com/photo-1510137600163-2729bc6959a6?auto=format&fit=crop&w=400&q=80',
                'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=400&q=80',
                'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=400&q=80',
                'https://images.unsplash.com/photo-1550583724-125581f77833?auto=format&fit=crop&w=400&q=80'
              ];

              const ecosystem = [
                { name: 'PROTEINS', icon: 'food-steak', products: ['Tuna Chunks', 'Corned Beef', 'Chickpeas', 'Black Beans', 'Lentils'] },
                { name: 'STARCHES', icon: 'bread-slice', products: ['Basmati Rice', 'Pasta Penne', 'Couscous'] },
                { name: 'VEGETABLES', icon: 'corn', products: ['Canned Tomatoes', 'Sweetcorn', 'Frozen Peas', 'Green Beans', 'Carrots'] },
                { name: 'FRUITS', icon: 'food-apple', products: ['Canned Peaches', 'Pineapple Rings', 'Strawberry Jam'] },
                { name: 'DAIRY', icon: 'cheese', products: ['UHT Whole Milk', 'Powdered Milk', 'Condensed Milk', 'Parmesan', 'Ghee'] },
                { name: 'BAKING', icon: 'cupcake', products: ['Strong Bread Flour', 'Caster Sugar'] },
                { name: 'BEVERAGES', icon: 'cup', products: ['English Breakfast Tea', 'Instant Coffee', 'Hot Chocolate', 'Apple Juice'] },
                { name: 'SNACKS', icon: 'candy', products: ['Dark Chocolate', 'Salted Crackers', 'Trail Mix', 'Digestive Biscuits', 'Popcorn'] },
                { name: 'CONDIMENTS', icon: 'shaker', products: ['Extra Virgin Olive Oil', 'Sea Salt', 'Black Pepper', 'Soy Sauce'] },
                { name: 'BREAKFAST', icon: 'bowl-mix', products: ['Rolled Oats', 'Cornflakes', 'Honey'] },
                { name: 'SOUPS', icon: 'bowl-respect', products: ['Tomato Soup', 'Chicken Broth', 'Lentil Soup', 'Miso Paste', 'Oxtail Soup'] },
                { name: 'EMERGENCY', icon: 'lightning-bolt', products: ['Beef Jerky', 'Energy Bars'] }
              ];

              const now = new Date();
              let batchGlobalCounter = 0;
              let productGlobalCounter = 0;

              for (let cIdx = 0; cIdx < ecosystem.length; cIdx++) {
                const group = ecosystem[cIdx];
                const catRes = await db.runAsync('INSERT INTO Categories (name, icon, is_mess_hall) VALUES (?, ?, ?)', [group.name, group.icon, 1]);
                const catId = catRes.lastInsertRowId;

                for (let pIdx = 0; pIdx < group.products.length; pIdx++) {
                  const pName = group.products[pIdx];
                  const unit = (pName.includes('Milk') || pName.includes('Oil') || pName.includes('Juice') || pName.includes('Broth')) ? 'volume' : 'weight';
                  
                  // ── TACTICAL SIZE DOCTRINE ──
                  const weightUnits = ['100g', '250g', '500g', '1kg'];
                  const volumeUnits = ['250ml', '500ml', '1l'];
                  const countUnits  = ['1', 'UNIT'];
                  
                  const defaultSize = unit === 'weight' ? weightUnits[productGlobalCounter % weightUnits.length] :
                                     unit === 'volume' ? volumeUnits[productGlobalCounter % volumeUnits.length] :
                                     countUnits[productGlobalCounter % countUnits.length];

                  // Tactical Brand/Range Variety
                  const brands = ['TESCO', 'HEINZ', 'KELLOGGS', 'KNORR', 'NESTLE', 'AMOY', 'NAPOLINA', 'UNCLE BENS', 'ORGANIC CO', 'KIRKLAND'];
                  const ranges = ['ESSENTIALS', 'FINEST', 'ORGANIC', 'REDUCED SALT', 'VALUE', 'PREMIUM', 'LUXURY', 'WHOLEGRAIN', 'GLUTEN FREE'];
                  
                  const brand = brands[productGlobalCounter % brands.length];
                  const range = ranges[productGlobalCounter % ranges.length];

                  const imgUri = (productGlobalCounter % 3 !== 1) ? sampleImages[productGlobalCounter % sampleImages.length] : null;

                  // Determine Stock Status (Highly Varied: 15/20/20/20/15/10)
                  const stockRoll = Math.random() * 100;
                  let min = 4, max = 10, targetTotal = 6;
                  
                  if (stockRoll < 15) { // Dark Green (Overstock)
                    min = 2; max = 5; targetTotal = 8;
                  } else if (stockRoll < 35) { // Green (Healthy)
                    min = 5; max = 20; targetTotal = 10;
                  } else if (stockRoll < 55) { // Yellow (Warning: 90%)
                    min = 10; max = 20; targetTotal = 9;
                  } else if (stockRoll < 75) { // Orange (Urgent: 60%)
                    min = 10; max = 20; targetTotal = 6;
                  } else if (stockRoll < 90) { // Red (Critical: 40%)
                    min = 10; max = 20; targetTotal = 4;
                  } else { // Deep Red (Empty: 10%)
                    min = 10; max = 20; targetTotal = 1;
                  }

                  const typeRes = await db.runAsync('INSERT INTO ItemTypes (name, category_id, unit_type, default_size, default_cabinet_id, vanguard_resolved, min_stock_level, max_stock_level, image_uri, default_supplier, default_product_range) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                    [pName.toUpperCase(), catId, unit, defaultSize, cabIds[productGlobalCounter % cabIds.length], 1, min, max, imgUri, brand, range]);
                  
                  const typeId = typeRes.lastInsertRowId;
                  productGlobalCounter++;

                  if (targetTotal === 0) continue;

                  // Distribute targetTotal across 1-3 batches
                  const numBatches = targetTotal > 3 ? 3 : (targetTotal > 0 ? 1 : 0);
                  const qtyPerBatch = Math.floor(targetTotal / numBatches);
                  const remainder = targetTotal % numBatches;

                  for (let b = 0; b < numBatches; b++) {
                    // SECOND LAYER ATTRITION: 1/3 chance to skip individual batch
                    if (Math.random() < 0.33) {
                      batchGlobalCounter++;
                      continue;
                    }

                    const finalQty = qtyPerBatch + (b === 0 ? remainder : 0);
                    const cabId = cabIds[(batchGlobalCounter + b) % cabIds.length];
                    
                    // High-Variance Batch Pack Sizes relative to Default (0.2x to 4.0x)
                    const multipliers = [0.2, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 3.5, 4];
                    const multiplier = multipliers[Math.floor(Math.random() * multipliers.length)];
                    let batchSize = defaultSize;

                    if (multiplier !== 1) {
                      const numeric = parseFloat(defaultSize);
                      const unitStr = defaultSize.replace(/[0-9.]/g, '');
                      if (!isNaN(numeric)) {
                        const newSize = numeric * multiplier;
                        // Format: strip trailing zeros for clean strings (e.g. 1.0 -> 1)
                        batchSize = `${Number(newSize.toFixed(2))}${unitStr}`;
                      }
                    }

                    // Determine Expiry Status (65/15/10/5/5)
                    const expRoll = Math.random() * 100;
                    let expM: number | null = now.getMonth() + 1;
                    let expY: number | null = now.getFullYear();
                    
                    if (expRoll < 65) { // Green (>12M)
                      expM += (Math.floor(Math.random() * 12) + 13);
                    } else if (expRoll < 80) { // Yellow (7-12M)
                      expM += (Math.floor(Math.random() * 6) + 7);
                    } else if (expRoll < 90) { // Orange (1-6M)
                      expM += (Math.floor(Math.random() * 6) + 1);
                    } else if (expRoll < 95) { // Red (Expired)
                      expM -= (Math.floor(Math.random() * 6) + 1);
                    } else { // No Expiry
                      expM = null; expY = null;
                    }

                    if (expM !== null && expY !== null) {
                      while (expM <= 0) { expM += 12; expY -= 1; }
                      while (expM > 12) { expM -= 12; expY += 1; }
                    }

                    await db.runAsync('INSERT INTO Inventory (item_type_id, quantity, size, expiry_month, expiry_year, entry_month, entry_year, cabinet_id, batch_intel, supplier, product_range) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                      [typeId, finalQty, batchSize, expM, expY, now.getMonth() + 1, now.getFullYear(), cabId, `BATCH-${group.name.substring(0,3)}-${batchGlobalCounter}`, brand, range]);
                    
                    batchGlobalCounter++;
                  }
                }
              }
              window.localStorage.setItem('E2E_SEED_STATUS', 'SUCCESS');
              console.log('[E2E] DYNAMIC HEAVY SEED COMPLETE.');
            } catch (e: any) {
              console.error('[E2E] HEAVY SEED FAILURE:', e);
              throw e;
            }
          }
        }
      };

      const runSeeder = async () => {
        const e2eRank = params.get('rank')?.toUpperCase() || window.localStorage.getItem('E2E_RANK');
        
        if (e2eRank || requestedSetup) {
          const scenario = requestedSetup ? SCENARIOS[requestedSetup] : null;
          const targetRank = e2eRank || scenario?.rank || (requestedSetup ? 'SERGEANT' : null);
          
          if (targetRank) {
            console.log(`[E2E] COMMANDER RANK: ${targetRank}`);
            window.localStorage.setItem('E2E_RANK', targetRank); // Persist for reloads
            (window as any).__E2E_LICENCE__ = targetRank === 'VETERAN' ? 'GENERAL' : targetRank;
            window.localStorage.setItem('war_cabinet_welcome_seen', '1');
            await db.runAsync("INSERT OR REPLACE INTO Settings (key, value) VALUES ('force_rank', ?)", [targetRank]);
          }

          if (scenario) {
            console.log(`[E2E] APPLYING SCENARIO: ${requestedSetup}`);
            await scenario.apply(db);
            
            // Stabilization delay: give the worker time to breathe before the reload
            await new Promise(r => setTimeout(r, 500));
            
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete('setup');
            newUrl.searchParams.delete('rank');
            window.location.href = newUrl.toString();
            return;
          }
          
          console.log(`[E2E] Environment Ready.`);
        }
      };

      runSeeder();
    }
  }, [db]);

  return null;
}

export default function RootLayout() {
  const router = useRouter();
  const dbName = Platform.OS === 'web' ? 'war_cabinet_web.db' : 'war_cabinet.db';

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const type = response.notification.request.content.data?.type;
      if (type === 'monthly_brief' || type === 'test') {
        router.replace({ pathname: '/', params: { forceFilter: '<3M' } });
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <Suspense fallback={
      <View style={{ flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    }>
      <SQLiteProvider databaseName={dbName} onInit={initializeDatabase}>
        <E2ESeeder />
        <DeepLinkHandler />
        <BillingProvider>
          <SafeAreaProvider>
            <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }}>
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: 'slide_from_right'
                }}
              />
            </SafeAreaView>
          </SafeAreaProvider>
        </BillingProvider>
      </SQLiteProvider>
    </Suspense>
  );
}
