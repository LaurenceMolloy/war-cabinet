import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert, Image, Modal, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { Link, useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { requestPermissions, scheduleMonthlyBriefing } from '../services/notifications';

export default function HomeScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [categories, setCategories] = useState<any[]>([]);
  const [expandedCatIds, setExpandedCatIds] = useState<Set<number>>(new Set());
  
  const [filterCabinetId, setFilterCabinetId] = useState<number | null>(null);
  const [filterExpiryMode, setFilterExpiryMode] = useState<'ALL' | 'EXPIRED' | 'THIS_MONTH' | '<3M'>('ALL');
  const [cabinets, setCabinets] = useState<any[]>([]);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const params = useLocalSearchParams();

  useEffect(() => {
    if (params.forceFilter === '<3M') {
       setFilterCabinetId(null);
       setFilterExpiryMode('<3M');
       // Consume the param
       router.setParams({ forceFilter: undefined });
    }
  }, [params.forceFilter]);

  const load = async () => {
    // Proactive Logistics
    const hasPerms = await requestPermissions();
    if (hasPerms) {
       await scheduleMonthlyBriefing(db);
    }

    const cabRows = await db.getAllAsync<any>('SELECT * FROM Cabinets ORDER BY name');
    setCabinets(cabRows);

    const allRows = await db.getAllAsync<any>(`
      SELECT c.id as cat_id, c.name as cat_name, c.icon as cat_icon, 
             i.id as type_id, i.name as type_name, i.unit_type as type_unit, 
             inv.id as inv_id, inv.quantity, inv.size, inv.expiry_month, inv.expiry_year, inv.entry_month, inv.entry_year,
             cab.name as cab_name, cab.location as cab_location
      FROM Categories c
      LEFT JOIN ItemTypes i ON c.id = i.category_id
      LEFT JOIN Inventory inv ON i.id = inv.item_type_id ${filterCabinetId ? ` AND inv.cabinet_id = ${filterCabinetId}` : ''}
      LEFT JOIN Cabinets cab ON inv.cabinet_id = cab.id
      ORDER BY c.name, i.name, inv.expiry_year, inv.expiry_month, inv.size
    `);

    const acc: any = {};
    allRows.forEach(row => {
      if (!acc[row.cat_id]) {
        acc[row.cat_id] = { 
          id: row.cat_id, 
          name: row.cat_name, 
          icon: row.cat_icon, 
          types: {},
          soonest_month: null,
          soonest_year: null
        };
      }
      if (row.type_id) {
        if (!acc[row.cat_id].types[row.type_id]) {
          acc[row.cat_id].types[row.type_id] = { id: row.type_id, name: row.type_name, unit_type: row.type_unit, items: [] };
        }
        if (row.inv_id) {
          const now = new Date();
          const currentStamp = now.getFullYear() * 12 + (now.getMonth() + 1);
          const expStamp = (row.expiry_year && row.expiry_month) ? (row.expiry_year * 12 + row.expiry_month) : null;
          
          let matchesFilter = true;
          if (filterExpiryMode === 'EXPIRED') matchesFilter = !!expStamp && expStamp < currentStamp;
          else if (filterExpiryMode === 'THIS_MONTH') matchesFilter = !!expStamp && expStamp === currentStamp;
          else if (filterExpiryMode === '<3M') matchesFilter = !!expStamp && (expStamp <= currentStamp + 3);

          if (matchesFilter) {
            acc[row.cat_id].types[row.type_id].items.push({
              id: row.inv_id,
              quantity: row.quantity,
              size: row.size,
              expiry_month: row.expiry_month,
              expiry_year: row.expiry_year,
              entry_month: row.entry_month,
              entry_year: row.entry_year,
              cab_name: row.cab_name,
              cab_location: row.cab_location
            });
          }
        }
      }
    });

    const finalCategories = Object.values(acc).map((c: any) => {
      let itemsStocked = 0;
      let totalQty = 0;

      c.types = Object.values(c.types).map((t: any) => {
        let typeQty = 0;
        let soonestTypeStamp = Number.MAX_SAFE_INTEGER;

        t.items.forEach((it: any) => {
          typeQty += it.quantity;
          if (it.expiry_year && it.expiry_month) {
            const stamp = it.expiry_year * 12 + it.expiry_month;
            if (stamp < soonestTypeStamp) {
              soonestTypeStamp = stamp;
              if (!c.soonest_year || stamp < (c.soonest_year * 12 + c.soonest_month)) {
                c.soonest_month = it.expiry_month;
                c.soonest_year = it.expiry_year;
              }
            }
          }
        });
        t.soonest_stamp = soonestTypeStamp;
        if (typeQty > 0) itemsStocked++;
        totalQty += typeQty;

        // Calculate Tactical Total (Weight/Volume/Count)
        let totalValue = 0;
        t.items.forEach((it: any) => {
          const qty = it.quantity || 0;
          const sz = it.size || "";
          const num = parseFloat(sz);
          if (!isNaN(num)) {
            let val = num;
            if (sz.toLowerCase().endsWith('kg') || (sz.toLowerCase().endsWith('l') && !sz.toLowerCase().endsWith('ml')) || sz.toLowerCase().endsWith('ltr')) {
              val = num * 1000;
            }
            totalValue += (val * qty);
          }
        });

        let totalDisplay = "";
        if (totalValue > 0) {
          if (t.unit_type === 'weight') {
            if (totalValue >= 1000) totalDisplay = `${(totalValue / 1000).toFixed(totalValue % 1000 === 0 ? 0 : 1)} kg`;
            else totalDisplay = `${totalValue} g`;
          } else if (t.unit_type === 'volume') {
            if (totalValue >= 1000) totalDisplay = `${(totalValue / 1000).toFixed(totalValue % 1000 === 0 ? 0 : 1)} l`;
            else totalDisplay = `${totalValue} ml`;
          } else {
            totalDisplay = `${totalValue} Units`;
          }
        }
        t.tactical_total = totalDisplay;

        return t;
      });
      c.items_stocked = itemsStocked;
      c.total_qty = totalQty;
      
      // Also store a top-level category stamp for sorting
      c.cat_soonest_stamp = (c.types.length > 0) ? Math.min(...c.types.map((tt: any) => tt.soonest_stamp)) : Number.MAX_SAFE_INTEGER;

      return c;
    });

    // Final Sort Tiered Hierarchy
    finalCategories.sort((a: any, b: any) => {
      const aHasStock = a.items_stocked > 0;
      const bHasStock = b.items_stocked > 0;
      if (aHasStock !== bHasStock) return aHasStock ? -1 : 1;
      if (a.cat_soonest_stamp !== b.cat_soonest_stamp) return a.cat_soonest_stamp - b.cat_soonest_stamp;
      return a.name.localeCompare(b.name);
    });

    setCategories(finalCategories);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [filterCabinetId, filterExpiryMode])
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
    if (!m || !y) return '#94a3b8'; // Grey
    const now = new Date();
    const remaining = (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1));
    if (remaining <= 0) return '#b91c1c';
    if (remaining < 4) return '#f97316';
    if (remaining < 7) return '#fde047';
    return '#22c55e';
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
              <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
                <MaterialCommunityIcons 
                  name={expandedCatIds.has(cat.id) ? "chevron-down" : "chevron-right"} 
                  size={20} 
                  color="#64748b" 
                />
                <Text style={styles.typeTitle}>{type.name}</Text>
              </View>
              {type.tactical_total ? <Text style={styles.totalLabel}>{type.tactical_total}</Text> : null}
              <Link href={{ pathname: "/add", params: { typeId: type.id } }} asChild>
                <TouchableOpacity style={styles.addButton}>
                  <Text style={styles.addText}>+ ADD</Text>
                </TouchableOpacity>
              </Link>
            </View>
            
            {!hasItems && <Text style={styles.emptyText}>No matching inventory.</Text>}
            {hasItems && type.items.map((inv: any) => (
              <View key={inv.id} style={styles.inventoryRow}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4}}>
                   <Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>{inv.cab_name || 'Global'} • {inv.cab_location || 'Storage'}</Text>
                </View>
                <View style={styles.rowMain}>
                  <View style={styles.qtyBadge}>
                    <Text style={styles.qtyText}>{inv.quantity}</Text>
                  </View>
                  <Text style={styles.sizeText} numberOfLines={1}>{formatSizeDisplay(inv.size)}</Text>
                  <View style={styles.actionsGroup}>
                    <TouchableOpacity onPress={() => router.push({ pathname: '/add', params: { typeId: type.id.toString(), editBatchId: inv.id.toString() } })} style={[styles.actionBtn, {backgroundColor: '#3b82f6'}]}>
                      <MaterialCommunityIcons name="pencil" size={16} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deductQuantity(inv.id, inv.quantity)} style={[styles.actionBtn, {backgroundColor: '#ef4444'}]}>
                      <MaterialCommunityIcons name="minus" size={16} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => addQuantity(inv.id)} style={[styles.actionBtn, {backgroundColor: '#22c55e'}]}>
                      <MaterialCommunityIcons name="plus" size={16} color="white" />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={[styles.rowSub, { justifyContent: 'space-between' }]}>
                  <Text style={styles.subText}>ENTRY: {formatMonth(inv.entry_month)}/{inv.entry_year}</Text>
                  {inv.expiry_month ? getUrgencyPhrasing(inv.expiry_month, inv.expiry_year) : <Text style={styles.subText}>EXPIRY: N/A</Text>}
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
          {/* Caricatures commented out for safe mode */}
        </View>
        <Text style={styles.headerTitle}>War Cabinet</Text>
        <View style={styles.leaderGroup}>
          {/* Caricatures commented out for safe mode */}
        </View>
        <Link href="/catalog" asChild>
          <TouchableOpacity style={styles.settingsBtn}>
            <MaterialCommunityIcons name="cog" size={26} color="#cbd5e1" />
          </TouchableOpacity>
        </Link>
      </View>

      <View style={styles.filterBar}>
        <TouchableOpacity style={[styles.filterBtn, filterCabinetId ? styles.filterBtnActive : null, { flex: 1.5 }]} onPress={() => setShowFilterModal(true)}>
            <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                <MaterialCommunityIcons name="home-modern" size={16} color={filterCabinetId ? "white" : "#64748b"} style={{marginRight: 6}} />
                <Text style={[styles.filterBtnText, filterCabinetId ? styles.filterBtnTextActive : null]}>
                    {filterCabinetId ? cabinets.find(c => c.id === filterCabinetId)?.name?.toUpperCase() : 'ALL CABINETS'}
                </Text>
            </View>
        </TouchableOpacity>

        <TouchableOpacity 
            style={[styles.filterBtn, filterExpiryMode !== 'ALL' ? styles.filterBtnActive : null, { flex: 1 }]} 
            onPress={() => {
              const sequence: any[] = ['ALL', 'EXPIRED', 'THIS_MONTH', '<3M'];
              const idx = sequence.indexOf(filterExpiryMode);
              setFilterExpiryMode(sequence[(idx + 1) % sequence.length]);
            }}
        >
            <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                <MaterialCommunityIcons name={filterExpiryMode === 'ALL' ? "calendar-search" : "calendar-alert"} size={16} color={filterExpiryMode !== 'ALL' ? "white" : "#64748b"} style={{marginRight: 6}} />
                <Text style={[styles.filterBtnText, filterExpiryMode !== 'ALL' ? styles.filterBtnTextActive : null]}>
                   {filterExpiryMode === 'ALL' ? 'ALL STOCK' : filterExpiryMode.replace('_', ' ').replace('<3M', 'DUE SOON')}
                </Text>
            </View>
        </TouchableOpacity>

        {(filterCabinetId || filterExpiryMode !== 'ALL') && (
           <TouchableOpacity style={{ paddingHorizontal: 10, justifyContent: 'center' }} onPress={() => { setFilterCabinetId(null); setFilterExpiryMode('ALL'); }}>
             <MaterialCommunityIcons name="filter-remove" size={20} color="#ef4444" />
           </TouchableOpacity>
        )}
      </View>

      <Modal visible={showFilterModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Filter by Cabinet</Text>
            {cabinets.map(cab => (
              <TouchableOpacity 
                key={cab.id} 
                style={[styles.modalItem, filterCabinetId === cab.id && styles.modalItemActive]}
                onPress={() => {
                  setFilterCabinetId(cab.id);
                  setShowFilterModal(false);
                }}
              >
                <View>
                  <Text style={[styles.modalItemText, filterCabinetId === cab.id && styles.modalItemTextActive]}>{cab.name}</Text>
                  <Text style={{color: '#64748b', fontSize: 12}}>{cab.location}</Text>
                </View>
                {filterCabinetId === cab.id && <MaterialCommunityIcons name="check" size={20} color="#3b82f6" />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowFilterModal(false)}>
              <Text style={styles.modalCloseText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  appHeader: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e293b', paddingTop: 50, paddingBottom: 15, paddingHorizontal: 10, position: 'relative' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc', textAlign: 'center', marginHorizontal: 10 },
  filterBar: { flexDirection: 'row', backgroundColor: '#1e293b', paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  filterBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155' },
  filterBtnActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  filterBtnText: { color: '#64748b', fontSize: 11, fontWeight: 'bold' },
  filterBtnTextActive: { color: 'white' },
  leaderGroup: { flexDirection: 'row', gap: 5 },
  caricature: { width: 35, height: 35, borderRadius: 17.5, backgroundColor: '#1e293b' },
  settingsBtn: { position: 'absolute', right: 20, bottom: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1e293b', borderRadius: 16, padding: 24, maxHeight: '80%' },
  modalTitle: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#334155', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalItemActive: { backgroundColor: '#334155', borderRadius: 8, paddingHorizontal: 10 },
  modalItemText: { color: '#f8fafc', fontSize: 16 },
  modalItemTextActive: { color: '#3b82f6', fontWeight: 'bold' },
  modalClose: { marginTop: 20, padding: 15, alignItems: 'center' },
  modalCloseText: { color: '#ef4444', fontWeight: 'bold', fontSize: 16 },
  categoryCard: { backgroundColor: '#1e293b', borderRadius: 8, marginBottom: 12, overflow: 'hidden' },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  categoryTitle: { fontSize: 18, color: '#f8fafc', fontWeight: 'bold' },
  categorySummary: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  typeBlock: { padding: 12, backgroundColor: '#0f172a', borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  typeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typeTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: '600', marginLeft: 4 },
  addButton: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#3b82f6', borderRadius: 4 },
  addText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  emptyText: { color: '#64748b', fontStyle: 'italic', fontSize: 14, marginLeft: 16 },
  inventoryRow: { padding: 12, backgroundColor: '#334155', borderRadius: 6, marginBottom: 8, borderBottomWidth: 0 },
  totalLabel: { fontSize: 13, color: '#3b82f6', fontWeight: 'bold', marginRight: 12 },
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
