import { Stack } from 'expo-router';
import { Suspense } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { initializeDatabase } from '../db/sqlite';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { BillingProvider } from '../context/BillingContext';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { Platform } from 'react-native';

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
              // ... (rest of the logic remains same)
              // 1. Full Tactical Wipe (Child-first to respect constraints)
              await db.execAsync('DELETE FROM TacticalLogs;');
              await db.execAsync('DELETE FROM Inventory;');
              await db.execAsync('DELETE FROM BarcodeSignatures;');
              await db.execAsync('DELETE FROM ItemTypes;');
              await db.execAsync('DELETE FROM Categories;');
              await db.execAsync('DELETE FROM Cabinets;');
              console.log('[E2E] Database Purged.');

              // 2. Deploy Cabinets
              const cab1 = await db.runAsync('INSERT INTO Cabinets (name, location, cabinet_type) VALUES (?, ?, ?)', ['TEST CABINET 1', 'TEST LOCATION 1', 'standard']);
              const cab2 = await db.runAsync('INSERT INTO Cabinets (name, location, cabinet_type) VALUES (?, ?, ?)', ['TEST CABINET 2', 'TEST LOCATION 2', 'standard']);
              const cab3 = await db.runAsync('INSERT INTO Cabinets (name, location, cabinet_type) VALUES (?, ?, ?)', ['TEST FREEZER 1', 'TEST LOCATION 3', 'freezer']);
              const cab4 = await db.runAsync('INSERT INTO Cabinets (name, location, cabinet_type) VALUES (?, ?, ?)', ['TEST FREEZER 2', 'TEST LOCATION 4', 'freezer']);

              const cab1Id = cab1.lastInsertRowId;
              const cab2Id = cab2.lastInsertRowId;
              const cab3Id = cab3.lastInsertRowId;
              const cab4Id = cab4.lastInsertRowId;
              console.log(`[E2E] Cabinets Deployed. IDs: ${cab1Id}, ${cab2Id}, ${cab3Id}, ${cab4Id}`);

              // 3. Deploy Categories & Bound Item Types
              const cat1 = await db.runAsync('INSERT INTO Categories (name, icon, is_mess_hall) VALUES (?, ?, ?)', ['TEST CATEGORY 1', 'wheat', 1]);
              await db.runAsync('INSERT INTO ItemTypes (name, category_id, unit_type, default_size, default_cabinet_id, default_supplier, default_product_range, freeze_months, vanguard_resolved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                ['TEST ITEM 1', cat1.lastInsertRowId, 'weight', '100', cab1Id, 'TEST BRAND 1', 'TEST RANGE 1', 1, 1]);
              console.log(`[E2E] Category 1 + Item 1 Deployed (CatID: ${cat1.lastInsertRowId})`);

              const cat2 = await db.runAsync('INSERT INTO Categories (name, icon, is_mess_hall) VALUES (?, ?, ?)', ['TEST CATEGORY 2', 'water', 1]);
              await db.runAsync('INSERT INTO ItemTypes (name, category_id, unit_type, default_size, default_cabinet_id, default_supplier, default_product_range, freeze_months, vanguard_resolved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                ['TEST ITEM 2', cat2.lastInsertRowId, 'volume', '100', cab2Id, 'TEST BRAND 2', 'TEST RANGE 2', 2, 1]);
              console.log(`[E2E] Category 2 + Item 2 Deployed (CatID: ${cat2.lastInsertRowId})`);

              const cat3 = await db.runAsync('INSERT INTO Categories (name, icon, is_mess_hall) VALUES (?, ?, ?)', ['TEST CATEGORY 3', 'leaf', 1]);
              await db.runAsync('INSERT INTO ItemTypes (name, category_id, unit_type, default_size, default_cabinet_id, default_supplier, default_product_range, freeze_months, vanguard_resolved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                ['TEST ITEM 3', cat3.lastInsertRowId, 'count', '100', cab3Id, 'TEST BRAND 3', 'TEST RANGE 3', 3, 1]);
              console.log(`[E2E] Category 3 + Item 3 Deployed (CatID: ${cat3.lastInsertRowId})`);

              const cat4 = await db.runAsync('INSERT INTO Categories (name, icon, is_mess_hall) VALUES (?, ?, ?)', ['TEST CATEGORY 4', 'food-apple', 1]);
              await db.runAsync('INSERT INTO ItemTypes (name, category_id, unit_type, default_size, default_cabinet_id, default_supplier, default_product_range, freeze_months, vanguard_resolved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                ['TEST ITEM 4', cat4.lastInsertRowId, 'weight', '100', cab4Id, 'TEST BRAND 4', 'TEST RANGE 4', 4, 1]);
              console.log(`[E2E] Category 4 + Item 4 Deployed (CatID: ${cat4.lastInsertRowId})`);

              // Final Verification
              const finalCats = await db.getAllAsync('SELECT id, name FROM Categories');
              const finalTypes = await db.getAllAsync('SELECT id, name, category_id FROM ItemTypes');
              console.log('[E2E] SEED VERIFICATION:', {
                categories: finalCats.length,
                itemTypes: finalTypes.length,
                typesMapping: finalTypes.map((t: any) => `${t.name} -> CatID ${t.category_id}`)
              });

              window.localStorage.setItem('E2E_SEED_STATUS', 'SUCCESS');
              console.log('[E2E] FOUNDATION SEED COMPLETE - RELOADING...');
            } catch (e: any) {
              console.error('[E2E] SEED FAILURE:', e);
              window.localStorage.setItem('E2E_SEED_ERROR', e.message || 'Unknown DB Error');
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
