import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Share, ActivityIndicator, SafeAreaView, Platform, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';

import * as MailComposer from 'expo-mail-composer';

export default function LogisticsScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    
    // 1. Fetch item types that have thresholds
    const typeRows = await db.getAllAsync<any>(`
      SELECT 
        c.name as cat_name, 
        i.id as type_id, 
        i.name as type_name, 
        i.unit_type,
        i.default_size,
        i.min_stock_level as min_units, 
        i.max_stock_level as max_units
      FROM ItemTypes i
      JOIN Categories c ON i.category_id = c.id
      WHERE i.min_stock_level IS NOT NULL OR i.max_stock_level IS NOT NULL
      ORDER BY c.name, i.name
    `);

    // 2. Fetch all inventory for calculation
    const inventoryRows = await db.getAllAsync<any>(`
      SELECT item_type_id, quantity, size FROM Inventory
    `);

    // 3. Helper to parse size string (e.g. "500g" -> 500)
    const parseVal = (s: string) => {
      if (!s) return 1;
      const m = s.match(/^(\d+(\.\d+)?)/);
      return m ? parseFloat(m[0]) : 1;
    };

    // 4. Processing logic
    const results: any[] = [];

    typeRows.forEach(type => {
      const relevantInv = inventoryRows.filter(r => r.item_type_id === type.type_id);
      const defSizeVal = type.default_size ? parseVal(type.default_size) : 1;
      
      // Calculate total stored weight/volume or items
      let totalStored = 0;
      if (type.default_size) {
        // We have a standard size, assess total physical volume/weight
        totalStored = relevantInv.reduce((sum, r) => sum + (r.quantity * parseVal(r.size)), 0);
      } else {
        // No standard size, assess raw unit count
        totalStored = relevantInv.reduce((sum, r) => sum + r.quantity, 0);
      }

      const targetMinTotal = type.min_units ? type.min_units * defSizeVal : null;
      const targetMaxTotal = type.max_units ? type.max_units * defSizeVal : null;

      // Check if below threshold
      const isBelowMin = targetMinTotal !== null && totalStored < targetMinTotal;
      const isBelowMax = targetMaxTotal !== null && totalStored < targetMaxTotal;

      // STRATEGIC SILENCE: Only trigger if MIN breached. 
      // Once triggered, we show both deficits if they exist.
      if (isBelowMin) {
        results.push({
          ...type,
          total_stored: totalStored,
          target_min_total: targetMinTotal,
          target_max_total: targetMaxTotal,
          def_size_val: defSizeVal,
          is_critical: true // Since we only show if below MIN now
        });
      }
    });
    
    // 5. Group by category
    const grouped = results.reduce((acc: any[], row: any) => {
      let cat = acc.find((c: any) => c.title === row.cat_name);
      if (!cat) {
        cat = { title: row.cat_name, data: [] };
        acc.push(cat);
      }
      cat.data.push(row);
      return acc;
    }, [] as any[]);

    setData(grouped);
    setLoading(false);
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const formatQtyStr = (qty: number, unit: string) => {
    if (unit === 'weight') {
      if (qty >= 1000) return `${(qty/1000).toFixed(qty%1000===0?0:1)}kg`;
      return `${Math.round(qty)}g`;
    }
    if (unit === 'volume') {
      if (qty >= 1000) return `${(qty/1000).toFixed(qty%1000===0?0:1)}l`;
      return `${Math.round(qty)}ml`;
    }
    const val = Math.floor(qty);
    return `${val} ${val === 1 ? 'unit' : 'units'}`;
  };

  const calculateDeficitInfo = (target: number | null, current: number, unit: string, defSize: number) => {
    if (target === null) return null;
    const diff = target - current;
    if (diff <= 0) return null;
    const items = Math.ceil(diff / defSize);
    return {
      physical: formatQtyStr(diff, unit),
      items,
      suggestion: `${items} x ${formatQtyStr(defSize, unit)}`
    };
  };

  const handleShare = async () => {
    if (data.length === 0) return;

    const dateStr = new Date().toLocaleDateString();

    // Fetch default recipient
    const emailRes = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', 'logistics_email');
    const recipient = emailRes?.value || '';

    let textBody = "War Cabinet Restocking Report\n";
    textBody += "Date: " + dateStr + "\n\n";

    data.forEach(cat => {
      textBody += `=== ${cat.title.toUpperCase()} ===\n\n`;
      cat.data.forEach((item: any) => {
        const minI = calculateDeficitInfo(item.target_min_total, item.total_stored, item.unit_type, item.def_size_val);
        const maxI = calculateDeficitInfo(item.target_max_total, item.total_stored, item.unit_type, item.def_size_val);
        const currentLabel = item.default_size ? formatQtyStr(item.total_stored, item.unit_type) : `${item.total_stored} ${item.total_stored === 1 ? 'unit' : 'units'}`;
        
        textBody += `• ${item.type_name}\n`;
        textBody += `  Current Stock: ${currentLabel}\n`;
        textBody += "  Required Purchase:\n";
        
        if (minI) {
          textBody += `    MIN: ${minI.physical}${item.default_size ? ` (${minI.suggestion})` : ''}\n`;
        }
        if (maxI) {
          textBody += `    MAX: ${maxI.physical}${item.default_size ? ` (${maxI.suggestion})` : ''}\n`;
        }
        textBody += "\n";
      });
    });

    textBody += "System-generated logistical intel for inventory replenishment.";

    try {
      const isMailAvailable = await MailComposer.isAvailableAsync();
      if (isMailAvailable) {
        await MailComposer.composeAsync({
          subject: 'war cabinet shopping list',
          body: textBody,
          recipients: recipient ? [recipient] : undefined,
          isHtml: false, // Reverting to plain text as per user request for simplicity/cleanup
        });
      } else {
        await Share.share({
          message: textBody,
          title: 'war cabinet shopping list'
        });
      }
    } catch (error) {
      console.log('Sharing failed:', error);
      await Share.share({ message: textBody });
    }
  };

  const renderItem = ({ item: cat }: any) => (
    <View style={styles.catGroup}>
      <View style={styles.catHeader}>
        <MaterialCommunityIcons name="label-outline" size={16} color="#3b82f6" style={{marginRight: 8}} />
        <Text style={styles.catTitle}>{cat.title.toUpperCase()}</Text>
      </View>
      {cat.data.map((item: any) => {
        const minI = calculateDeficitInfo(item.target_min_total, item.total_stored, item.unit_type, item.def_size_val);
        const maxI = calculateDeficitInfo(item.target_max_total, item.total_stored, item.unit_type, item.def_size_val);

        return (
          <View key={item.type_id} style={styles.resupplyRow} testID={`resupply-row-${item.type_id}`}>
            <View style={{flex: 1}}>
              <Text style={[styles.itemName, item.is_critical && {color: '#ef4444'}]}>{item.type_name}</Text>
              <Text style={styles.itemMeta} testID={`stored-text-${item.type_id}`}>Current Stock: {item.default_size ? formatQtyStr(item.total_stored, item.unit_type) : `${item.total_stored} ${item.total_stored === 1 ? 'unit' : 'units'}`}</Text>
              {item.default_size && (
                <Text style={{color: '#94a3b8', fontSize: 10, marginTop: 2, fontStyle: 'italic'}}>
                   Suggested Unit Size: {item.default_size}
                </Text>
              )}
            </View>
            <View style={styles.deficitCol}>
              {minI && (
                <View style={[styles.badge, {borderColor: '#ef4444'}]} testID={`min-deficit-${item.type_id}`}>
                  <Text style={[styles.badgeText, {color: '#ef4444'}]}>MIN {minI.physical}</Text>
                  {item.default_size && <Text style={{fontSize: 9, color: '#ef4444'}}>({minI.suggestion})</Text>}
                </View>
              )}
              {maxI && (
                <View style={[styles.badge, {borderColor: '#3b82f6', marginTop: 4}]} testID={`max-deficit-${item.type_id}`}>
                  <Text style={[styles.badgeText, {color: '#3b82f6'}]}>MAX {maxI.physical}</Text>
                  {item.default_size && <Text style={{fontSize: 9, color: '#3b82f6'}}>({maxI.suggestion})</Text>}
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#f8fafc" />
        </TouchableOpacity>
        <View style={{flex: 1, marginLeft: 16}}>
          <Text style={styles.title}>Restocking List</Text>
        </View>
        {data.length > 0 && (
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <MaterialCommunityIcons name="export-variant" size={20} color="white" />
            <Text style={styles.shareBtnText}>SHARE</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={item => item.title}
          renderItem={renderItem}
          contentContainerStyle={{padding: 16}}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="check-decagram" size={64} color="#1e293b" />
              <Text style={styles.emptyTitle}>War-Footing Maintained</Text>
              <Text style={styles.emptyText}>All tracked stockpiles are at or above their designated thresholds.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'android' ? 40 : 10, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center' },
  title: { color: '#f8fafc', fontSize: 22, fontWeight: 'bold' },
  subtitle: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3b82f6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, gap: 6 },
  shareBtnText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  catGroup: { marginBottom: 24 },
  catHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#334155', paddingBottom: 6 },
  catTitle: { color: '#3b82f6', fontSize: 12, fontWeight: 'bold' },
  resupplyRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 8 },
  itemName: { color: '#f8fafc', fontSize: 16, fontWeight: 'bold' },
  itemMeta: { color: '#cbd5e1', fontSize: 13, marginTop: 2 },
  deficitCol: { alignItems: 'flex-end' },
  badge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyTitle: { color: '#f8fafc', fontSize: 20, fontWeight: 'bold', marginTop: 16 },
  emptyText: { color: '#94a3b8', fontSize: 14, textAlign: 'center', marginTop: 8, paddingHorizontal: 40 }
});
