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
        'foundation_basic_grid_with_types': {
          rank: 'SERGEANT',
          apply: async (db) => {
            try {
              await db.execAsync(`
                DELETE FROM Categories;
                DELETE FROM Cabinets;
                DELETE FROM ItemTypes;
                DELETE FROM Inventory;
                INSERT INTO Categories (id, name, icon, is_mess_hall) VALUES (1, 'TEST CATEGORY 1', 'wheat', 1);
                INSERT INTO Categories (id, name, icon, is_mess_hall) VALUES (2, 'TEST CATEGORY 2', 'water', 1);
                INSERT INTO Categories (id, name, icon, is_mess_hall) VALUES (3, 'TEST CATEGORY 3', 'leaf', 1);
                INSERT INTO Categories (id, name, icon, is_mess_hall) VALUES (4, 'TEST CATEGORY 4', 'food-apple', 1);
                INSERT INTO Cabinets (id, name, location, cabinet_type) VALUES (1, 'TEST CABINET 1', 'TEST LOCATION 1', 'standard');
                INSERT INTO Cabinets (id, name, location, cabinet_type) VALUES (2, 'TEST CABINET 2', 'TEST LOCATION 2', 'standard');
                INSERT INTO Cabinets (id, name, location, cabinet_type) VALUES (3, 'TEST FREEZER 1', 'TEST LOCATION 3', 'freezer');
                INSERT INTO Cabinets (id, name, location, cabinet_type) VALUES (4, 'TEST FREEZER 2', 'TEST LOCATION 4', 'freezer');
                INSERT INTO ItemTypes (id, name, category_id, unit_type, default_size, default_cabinet_id, default_supplier, default_product_range, freeze_months, vanguard_resolved) VALUES (1, 'TEST ITEM 1', 1, 'weight', '100', 1, 'TEST BRAND 1', 'TEST RANGE 1', 1, 1);
                INSERT INTO ItemTypes (id, name, category_id, unit_type, default_size, default_cabinet_id, default_supplier, default_product_range, freeze_months, vanguard_resolved) VALUES (2, 'TEST ITEM 2', 2, 'volume', '100', 2, 'TEST BRAND 2', 'TEST RANGE 2', 2, 1);
                INSERT INTO ItemTypes (id, name, category_id, unit_type, default_size, default_cabinet_id, default_supplier, default_product_range, freeze_months, vanguard_resolved) VALUES (3, 'TEST ITEM 3', 3, 'count', '100', 3, 'TEST BRAND 3', 'TEST RANGE 3', 3, 1);
                INSERT INTO ItemTypes (id, name, category_id, unit_type, default_size, default_cabinet_id, default_supplier, default_product_range, freeze_months, vanguard_resolved) VALUES (4, 'TEST ITEM 4', 4, 'weight', '100', 4, 'TEST BRAND 4', 'TEST RANGE 4', 4, 1);
              `);
              window.localStorage.setItem('E2E_SEED_STATUS', 'SUCCESS');
            } catch (e: any) {
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
