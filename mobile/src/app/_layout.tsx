import { Stack } from 'expo-router';
import { Suspense } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SQLiteProvider } from 'expo-sqlite';
import { initializeDatabase } from '../db/sqlite';

export default function RootLayout() {
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
        </Stack>
      </SQLiteProvider>
    </Suspense>
  );
}
