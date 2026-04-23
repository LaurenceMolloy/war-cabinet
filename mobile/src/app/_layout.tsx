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
