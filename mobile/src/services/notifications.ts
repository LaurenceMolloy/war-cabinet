import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes, AndroidImportance } from 'expo-notifications';
import { Platform, Alert } from 'react-native';
import { SQLiteDatabase } from 'expo-sqlite';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestPermissions() {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('strategic_alerts', {
      name: 'Strategic Alerts',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3b82f6',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  return finalStatus === 'granted';
}

export async function scheduleMonthlyBriefing(db: SQLiteDatabase) {
  if (Platform.OS === 'web') return;
  const settings = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', 'month_brief_enabled');
  const enabled = !settings || settings.value === '1';

  // Always cancel existing to avoid duplicates
  await Notifications.cancelAllScheduledNotificationsAsync();

  if (!enabled) return;

  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 9, 0, 0);

  const m = nextMonth.getMonth() + 1;
  const y = nextMonth.getFullYear();
  const nextStamp = y * 12 + m;

  const rows = await db.getAllAsync<{name: string, stamp: number, quantity: number}>(`
    SELECT i.name, (inv.expiry_year * 12 + inv.expiry_month) as stamp, inv.quantity
    FROM ItemTypes i
    JOIN Inventory inv ON i.id = inv.item_type_id
    WHERE inv.expiry_year IS NOT NULL
  `);

  const expired = rows.filter(r => r.stamp < nextStamp);
  const thisMonth = rows.filter(r => r.stamp === nextStamp);
  const soon = rows.filter(r => r.stamp > nextStamp && r.stamp <= nextStamp + 3);

  if (expired.length === 0 && thisMonth.length === 0 && soon.length === 0) return;

  const formatTier = (items: any[]) => {
    const counts = items.reduce((acc: any, it: any) => {
      acc[it.name] = (acc[it.name] || 0) + (it.quantity || 1);
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([name, count]) => `${name}${Number(count) > 1 ? ` (${count})` : ""}`)
      .join(', ');
  };

  const sumTier = (items: any[]) => items.reduce((sum, it) => sum + (it.quantity || 1), 0);

  let body = "";
  if (expired.length > 0) body += `• ${sumTier(expired)} EXPIRED: ${formatTier(expired)}\n`;
  if (thisMonth.length > 0) body += `• ${sumTier(thisMonth)} EXPIRING THIS MONTH: ${formatTier(thisMonth)}\n`;
  if (soon.length > 0) body += `• ${sumTier(soon)} DUE TO EXPIRE SOON (3M): ${formatTier(soon)}`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "War Cabinet: Monthly Report",
      body: body.trim(),
      data: { type: 'monthly_brief' },
      android: { 
        channelId: 'strategic_alerts',
        priority: AndroidImportance.MAX
      }
    } as any,
    trigger: {
      type: SchedulableTriggerInputTypes.DATE,
      date: nextMonth
    } as any,
  });
}

export async function testStockAlert(db: SQLiteDatabase) {
  if (Platform.OS === 'web') {
    Alert.alert('Simulated Alert', 'Notifications are native-only. On your mobile build, this will trigger the Strategic Briefing.');
    return;
  }
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const currentStamp = currentYear * 12 + currentMonth;

  const rows = await db.getAllAsync<{name: string, stamp: number, quantity: number}>(`
    SELECT i.name, (inv.expiry_year * 12 + inv.expiry_month) as stamp, inv.quantity
    FROM ItemTypes i
    JOIN Inventory inv ON i.id = inv.item_type_id
    WHERE inv.expiry_year IS NOT NULL
  `);

  const expired = rows.filter(r => r.stamp < currentStamp);
  const thisMonth = rows.filter(r => r.stamp === currentStamp);
  const soon = rows.filter(r => r.stamp > currentStamp && r.stamp <= currentStamp + 3);

  const formatTier = (items: any[]) => {
    const counts = items.reduce((acc: any, it: any) => {
      acc[it.name] = (acc[it.name] || 0) + (it.quantity || 1);
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([name, count]) => `${name}${Number(count) > 1 ? ` (${count})` : ""}`)
      .join(', ');
  };

  const sumTier = (items: any[]) => items.reduce((sum, it) => sum + (it.quantity || 1), 0);

  let body = "";
  if (expired.length === 0 && thisMonth.length === 0 && soon.length === 0) {
    body = "Strategic Audit Complete: Your current stockpile is 100% stable. No immediate rotations required.";
  } else {
    if (expired.length > 0) body += `• ${sumTier(expired)} EXPIRED: ${formatTier(expired)}\n`;
    if (thisMonth.length > 0) body += `• ${sumTier(thisMonth)} EXPIRING THIS MONTH: ${formatTier(thisMonth)}\n`;
    if (soon.length > 0) body += `• ${sumTier(soon)} DUE TO EXPIRE SOON (3M): ${formatTier(soon)}`;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "War Cabinet: TEST BRIEFING",
      body: body.trim(),
      data: { type: 'test' },
      android: { 
        channelId: 'strategic_alerts',
        priority: AndroidImportance.MAX
      }
    } as any,
    trigger: null, // Instant
  });
}
