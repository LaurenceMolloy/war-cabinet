import { Stack } from 'expo-router';
import { Suspense } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SQLiteProvider } from 'expo-sqlite';
import { initializeDatabase } from '../db/sqlite';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function RootLayout() {
  const router = useRouter();

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
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    }>
      <SQLiteProvider databaseName="warcabinet.db" onInit={initializeDatabase} useSuspense>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="add" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="catalog" options={{ headerShown: false }} />
          <Stack.Screen name="logistics" options={{ headerShown: false }} />
        </Stack>
      </SQLiteProvider>
    </Suspense>
  );
}
