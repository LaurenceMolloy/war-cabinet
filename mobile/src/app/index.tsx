import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { Link, useFocusEffect, useRouter } from 'expo-router';

export default function HomeScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [categories, setCategories] = useState<any[]>([]);
  const [expandedCatIds, setExpandedCatIds] = useState<Set<number>>(new Set());

  const load = async () => {
    const allRows = await db.getAllAsync<any>(`
      SELECT c.id as cat_id, c.name as cat_name, c.icon as cat_icon, 
             i.id as type_id, i.name as type_name, 
             inv.id as inv_id, inv.quantity, inv.size, inv.expiry_month, inv.expiry_year, inv.entry_month, inv.entry_year
      FROM Categories c
      LEFT JOIN ItemTypes i ON c.id = i.category_id
      LEFT JOIN Inventory inv ON i.id = inv.item_type_id
      ORDER BY c.name, i.name, 
               CASE WHEN inv.expiry_year IS NULL THEN 1 ELSE 0 END,
               inv.expiry_year ASC, 
               inv.expiry_month ASC, 
               CAST(inv.size AS INTEGER) ASC
    `);

    const grouped = allRows.reduce((acc: any, row: any) => {
      if (!acc[row.cat_id]) {
        acc[row.cat_id] = { id: row.cat_id, name: row.cat_name, icon: row.cat_icon, types: {} };
      }
      if (row.type_id) {
        if (!acc[row.cat_id].types[row.type_id]) {
          acc[row.cat_id].types[row.type_id] = { id: row.type_id, name: row.type_name, items: [] };
        }
        if (row.inv_id) {
          acc[row.cat_id].types[row.type_id].items.push({
            id: row.inv_id,
            quantity: row.quantity,
            size: row.size,
            expiry_month: row.expiry_month,
            expiry_year: row.expiry_year,
            entry_month: row.entry_month,
            entry_year: row.entry_year
          });
        }
      }
      return acc;
    }, {});

    const finalCategories = Object.values(grouped).map((c: any) => {
      // Convert types object to array and calculate soonest for each type
      c.types = Object.values(c.types).map((t: any) => {
        let typeSoonestStamp = Number.MAX_SAFE_INTEGER;
        t.items.forEach((item: any) => {
          if (item.expiry_month && item.expiry_year) {
            const stamp = parseInt(item.expiry_year) * 12 + parseInt(item.expiry_month);
            if (stamp < typeSoonestStamp) typeSoonestStamp = stamp;
          }
        });
        t.soonest_stamp = typeSoonestStamp;
        return t;
      });

      // Sort types by the soonest expiring item within them
      c.types.sort((a: any, b: any) => a.soonest_stamp - b.soonest_stamp);

      // Now calculate the category-wide soonest from the types
      let catSoonestMonth = null;
      let catSoonestYear = null;
      if (c.types.length > 0 && c.types[0].soonest_stamp !== Number.MAX_SAFE_INTEGER) {
        catSoonestMonth = c.types[0].soonest_stamp % 12 || 12;
        catSoonestYear = Math.floor((c.types[0].soonest_stamp - (c.types[0].soonest_stamp % 12 || 12)) / 12);
        // Special case: if %12 is 0 it returns 12, need to adjust year
        if (c.types[0].soonest_stamp % 12 === 0) {
            catSoonestYear = (c.types[0].soonest_stamp / 12) - 1;
            catSoonestMonth = 12;
        } else {
            catSoonestYear = Math.floor(c.types[0].soonest_stamp / 12);
            catSoonestMonth = c.types[0].soonest_stamp % 12;
        }
      }
      
      c.soonest_month = catSoonestMonth;
      c.soonest_year = catSoonestYear;

      // Calculate Summary Stats
      let itemsStocked = 0;
      let totalQty = 0;
      c.types.forEach((t: any) => {
        let typeQty = 0;
        t.items.forEach((it: any) => typeQty += it.quantity);
        if (typeQty > 0) itemsStocked++;
        totalQty += typeQty;
      });
      c.items_stocked = itemsStocked;
      c.total_qty = totalQty;
      
      // Also store a top-level category stamp for sorting
      // Use the stamp of the first (soonest) type, or infinity
      c.cat_soonest_stamp = (c.types.length > 0) ? c.types[0].soonest_stamp : Number.MAX_SAFE_INTEGER;

      return c;
    });

    // Final Sort Tiered Hierarchy:
    // 1. Stock Presence (Stocked above Empty)
    // 2. Expiry Urgency (Soonest First)
    // 3. Alphabetical
    finalCategories.sort((a, b) => {
      const aHasStock = a.items_stocked > 0;
      const bHasStock = b.items_stocked > 0;
      
      if (aHasStock !== bHasStock) {
        return aHasStock ? -1 : 1;
      }

      if (a.cat_soonest_stamp !== b.cat_soonest_stamp) {
        return a.cat_soonest_stamp - b.cat_soonest_stamp;
      }
      return a.name.localeCompare(b.name);
    });

    setCategories(finalCategories);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const toggleCategory = (id: number) => {
    const next = new Set(expandedCatIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedCatIds(next);
  };

  const deductQuantity = async (invId: number, currentQty: number) => {
    if (currentQty <= 1) {
      await db.runAsync('DELETE FROM Inventory WHERE id = ?', invId);
    } else {
      await db.runAsync('UPDATE Inventory SET quantity = quantity - 1 WHERE id = ?', invId);
    }
    load();
  };

  const addQuantity = async (invId: number) => {
    await db.runAsync('UPDATE Inventory SET quantity = quantity + 1 WHERE id = ?', invId);
    load();
  };

  const getStatusColor = (m: number | null, y: number | null) => {
    if (!m || !y) return '#94a3b8'; // Grey (No Expiry)
    const now = new Date();
    const remaining = (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1));
    
    if (remaining <= 0) return '#b91c1c';  // Intense Red: Expired/Imminent
    if (remaining < 4) return '#f97316';   // Orange: 1-3 months
    if (remaining < 7) return '#fde047';   // Vibrant Yellow: 4-6 months
    return '#22c55e';                     // Green: > 6 months
  };

  const formatMonth = (m: any) => m ? m.toString().padStart(2, '0') : '--';

  const getUrgencyPhrasing = (m: number | null, y: number | null) => {
    if (!m || !y) return null;
    const now = new Date();
    const remaining = (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1));
    const color = getStatusColor(m, y);
    
    if (remaining < 0) {
      const abs = Math.abs(remaining);
      return (
        <Text style={styles.subText}>
          expired <Text style={{ color, fontWeight: 'bold' }}>{abs} {abs === 1 ? 'MONTH' : 'MONTHS'}</Text> ago
        </Text>
      );
    }
    if (remaining === 0) {
      return (
        <Text style={styles.subText}>
          expires <Text style={{ color, fontWeight: 'bold' }}>THIS MONTH</Text>
        </Text>
      );
    }
    return (
      <Text style={styles.subText}>
        expires in <Text style={{ color, fontWeight: 'bold' }}>{remaining} {remaining === 1 ? 'MONTH' : 'MONTHS'}</Text>
      </Text>
    );
  };

  const formatSizeDisplay = (rawSize: string) => {
    if (!rawSize) return 'N/A';
    
    // Extract numeric part and unit
    const numMatch = rawSize.match(/^(\d+(\.\d+)?)/);
    if (!numMatch) return rawSize;
    
    const num = parseFloat(numMatch[0]);
    const unit = rawSize.replace(numMatch[0], '').trim().toLowerCase();

    if (num >= 1000) {
      if (unit === 'g') return (num / 1000).toLocaleString() + 'kg';
      if (unit === 'ml') return (num / 1000).toLocaleString() + 'l';
    }
    
    return rawSize;
  };

  const renderCategory = ({ item: cat }: any) => {
    const isEmpty = cat.total_qty === 0;
    return (
      <View style={[styles.categoryCard, isEmpty && { opacity: 0.4 }]}>
        <TouchableOpacity style={styles.categoryHeader} onPress={() => toggleCategory(cat.id)}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', flex: 1 }}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(cat.soonest_month, cat.soonest_year), marginRight: 12, marginTop: 8 }, isEmpty && { backgroundColor: '#334155' }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.categoryTitle}>{cat.name}</Text>
              {!expandedCatIds.has(cat.id) && (
                <View style={[styles.rowSub, { marginTop: 4 }]}>
                  <Text style={styles.subText}>TOTAL: {cat.total_qty}</Text>
                  {cat.soonest_month && cat.soonest_year && (
                    <>
                      <Text style={styles.divider}>|</Text>
                      <Text style={[styles.subText, { color: getStatusColor(cat.soonest_month, cat.soonest_year), fontWeight: 'bold' }]}>
                        SOONEST: {formatMonth(cat.soonest_month)}/{cat.soonest_year}
                      </Text>
                    </>
                  )}
                </View>
              )}
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <MaterialCommunityIcons name={expandedCatIds.has(cat.id) ? 'chevron-up' : 'chevron-down'} size={24} color="#64748b" />
          </View>
        </TouchableOpacity>

      {expandedCatIds.has(cat.id) && cat.types.map((type: any) => {
        const hasItems = type.items.length > 0;
        return (
          <View key={type.id} style={styles.typeBlock}>
            <View style={styles.typeHeader}>
              <Text style={styles.typeTitle}>{type.name}</Text>
              <Link href={`/add?typeId=${type.id}`} asChild>
                <TouchableOpacity style={styles.addButton}>
                  <Text style={styles.addText}>+ ADD</Text>
                </TouchableOpacity>
              </Link>
            </View>
            
            {!hasItems && <Text style={styles.emptyText}>No stock available.</Text>}
            {hasItems && type.items.map((inv: any) => (
              <View key={inv.id} style={styles.inventoryRow}>
                <View style={styles.rowMain}>
                  <View style={styles.qtyBadge}>
                    <Text style={styles.qtyText}>{inv.quantity}</Text>
                  </View>
                  <Text style={styles.sizeText} numberOfLines={1}>{formatSizeDisplay(inv.size)}</Text>
                  <View style={styles.actionsGroup}>
                    <TouchableOpacity 
                      onPress={() => router.push({ pathname: '/add', params: { typeId: type.id.toString(), editBatchId: inv.id.toString() } })} 
                      style={[styles.actionBtn, {backgroundColor: '#3b82f6'}]}
                    >
                      <MaterialCommunityIcons name="pencil" size={16} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => deductQuantity(inv.id, inv.quantity)} 
                      style={[styles.actionBtn, {backgroundColor: '#ef4444'}]}
                    >
                      <MaterialCommunityIcons name="minus" size={16} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => addQuantity(inv.id)} 
                      style={[styles.actionBtn, {backgroundColor: '#22c55e'}]}
                    >
                      <MaterialCommunityIcons name="plus" size={16} color="white" />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={[styles.rowSub, { justifyContent: 'space-between' }]}>
                  <Text style={styles.subText}>ENTRY: {formatMonth(inv.entry_month)}/{inv.entry_year}</Text>
                  {inv.expiry_month ? (
                    getUrgencyPhrasing(inv.expiry_month, inv.expiry_year)
                  ) : (
                    <Text style={styles.subText}>EXPIRY: N/A</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </View>
      );
    };

    return (
      <View style={styles.container}>
      <View style={styles.appHeader}>
        <View style={styles.leaderGroup}>
          {/* <Image source={require('../../assets/trump.png')} style={styles.caricature} /> */}
          {/* <Image source={require('../../assets/putin.png')} style={styles.caricature} /> */}
        </View>
        <Text style={styles.headerTitle}>War Cabinet</Text>
        <View style={styles.leaderGroup}>
          {/* <Image source={require('../../assets/xi.png')} style={styles.caricature} /> */}
          {/* <Image source={require('../../assets/kim.png')} style={styles.caricature} /> */}
        </View>
        <Link href="/catalog" asChild>
          <TouchableOpacity style={styles.settingsBtn}>
            <MaterialCommunityIcons name="cog" size={26} color="#cbd5e1" />
          </TouchableOpacity>
        </Link>
      </View>
      <FlatList
        data={categories}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderCategory}
        contentContainerStyle={{ padding: 16 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  appHeader: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e293b', paddingTop: 50, paddingBottom: 20, paddingHorizontal: 10, position: 'relative' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc', textAlign: 'center', marginHorizontal: 10 },
  leaderGroup: { flexDirection: 'row', gap: 5 },
  caricature: { width: 35, height: 35, borderRadius: 17.5, backgroundColor: '#1e293b' },
  settingsBtn: { position: 'absolute', right: 20, bottom: 20 },
  categoryCard: { backgroundColor: '#1e293b', borderRadius: 8, marginBottom: 12, overflow: 'hidden' },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  categoryTitle: { fontSize: 18, color: '#f8fafc', fontWeight: 'bold' },
  categorySummary: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  typeBlock: { padding: 12, backgroundColor: '#0f172a', borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  typeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typeTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: '600' },
  addButton: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#3b82f6', borderRadius: 4 },
  addText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  emptyText: { color: '#64748b', fontStyle: 'italic', fontSize: 14, marginLeft: 16 },
  inventoryRow: { padding: 12, backgroundColor: '#334155', borderRadius: 6, marginBottom: 8, borderBottomWidth: 0 },
  rowMain: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  qtyBadge: { backgroundColor: '#334155', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  qtyText: { color: 'white', fontSize: 13, fontWeight: 'bold' },
  sizeText: { flex: 1, color: '#f8fafc', fontSize: 15, fontWeight: '500' },
  actionsGroup: { flexDirection: 'row', gap: 6 },
  rowSub: { flexDirection: 'row', alignItems: 'center' },
  subText: { color: '#94a3b8', fontSize: 11, letterSpacing: 0.5 },
  divider: { color: '#334155', marginHorizontal: 8, fontSize: 12 },
  actionBtn: { padding: 6, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }
});
