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

import { SEEDER_SCENARIOS } from '../services/SeederService';

function E2ESeeder() {
  const db = useSQLiteContext();

  useEffect(() => {
    if (__DEV__ && Platform.OS === 'web') {
      const params = new URLSearchParams(window.location.search);
      const requestedRank = params.get('rank')?.toUpperCase();
      const requestedSetup = params.get('setup')?.toLowerCase();
      
      const runSeeder = async () => {
        const e2eRank = params.get('rank')?.toUpperCase() || window.localStorage.getItem('E2E_RANK');
        
        if (e2eRank || requestedSetup) {
          const scenario = requestedSetup ? SEEDER_SCENARIOS[requestedSetup] : null;
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
