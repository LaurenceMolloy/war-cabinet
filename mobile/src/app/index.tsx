import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert, Image, Modal, Platform, TextInput, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { Link, useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { requestPermissions, scheduleMonthlyBriefing } from '../services/notifications';
import { initializeDatabase, markModified } from '../db/sqlite';
import { BackupService } from '../services/BackupService';

export default function HomeScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const flatRef = React.useRef<FlatList>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [expandedCatIds, setExpandedCatIds] = useState<Set<number>>(new Set());
  const [expandedTypeIds, setExpandedTypeIds] = useState<Set<number>>(new Set());
  
  const [filterCabinetId, setFilterCabinetId] = useState<number | null>(null);
  const [filterExpiryMode, setFilterExpiryMode] = useState<'ALL' | 'EXPIRED' | 'THIS_MONTH' | '<3M'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [cabinets, setCabinets] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showExpiryModal, setShowExpiryModal] = useState(false);
  
  const [feedback, setFeedback] = useState<string | null>(null);
  const feedbackAnim = React.useRef(new Animated.Value(0)).current;

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<any>(null);
  const [confirmBatch, setConfirmBatch] = useState<any>(null);
  
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteBatch, setDeleteBatch] = useState<any>(null);
  const params = useLocalSearchParams();

  useEffect(() => {
    if (params.forceFilter === '<3M') {
       setFilterCabinetId(null);
       setFilterExpiryMode('<3M');
       router.setParams({ forceFilter: undefined });
    }
    if (params.setCabinetId !== undefined) {
      const cabID = Number(params.setCabinetId);
      setFilterCabinetId(cabID);
      const cabName = params.setCabinetName || cabinets.find(c => c.id === cabID)?.name || 'DESTINATION';
      triggerFeedback(`SWITCHED TO ${cabName.toString().toUpperCase()}`);
      router.setParams({ setCabinetId: undefined, setCabinetName: undefined, timestamp: undefined });
    }

    if (params.targetCatId !== undefined) {
       const catId = Number(params.targetCatId);
       setExpandedCatIds(new Set([catId]));
       router.setParams({ targetCatId: undefined });
       
       setTimeout(() => {
          const idx = categories.findIndex(c => c.id === catId);
          if (idx !== -1) {
             flatRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.1 });
          }
       }, 500);
    }

    if (params.targetTypeId !== undefined) {
       const typeId = Number(params.targetTypeId);
       setExpandedTypeIds(new Set([typeId]));
       router.setParams({ targetTypeId: undefined });
    }
  }, [params.forceFilter, params.setCabinetId, params.setCabinetName, params.targetCatId, params.targetTypeId, params.timestamp, cabinets, categories]);

  const triggerFeedback = (msg: string) => {
    setFeedback(msg);
    Animated.sequence([
      Animated.timing(feedbackAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(3000),
      Animated.timing(feedbackAnim, { toValue: 0, duration: 800, useNativeDriver: true })
    ]).start(() => setFeedback(null));
  };

  const load = async () => {
    const hasPerms = await requestPermissions();
    if (hasPerms) {
       await scheduleMonthlyBriefing(db);
    }

    const cabRows = await db.getAllAsync<any>('SELECT * FROM Cabinets ORDER BY name');
    setCabinets(cabRows);

    const allRows = await db.getAllAsync<any>(`
      SELECT c.id as cat_id, c.name as cat_name, c.icon as cat_icon, 
             i.id as type_id, i.name as type_name, i.unit_type as type_unit, i.is_favorite, i.interaction_count,
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
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const isInName = row.type_name?.toLowerCase().includes(query);
        const isInCat = row.cat_name?.toLowerCase().includes(query);
        const isInSite = row.cab_name?.toLowerCase().includes(query);
        if (!isInName && !isInCat && !isInSite) return;
      }

      if (!acc[row.cat_id]) {
        acc[row.cat_id] = { id: row.cat_id, name: row.cat_name, icon: row.cat_icon, types: {}, soonest_month: null, soonest_year: null };
      }
      if (row.type_id) {
        if (!acc[row.cat_id].types[row.type_id]) {
          acc[row.cat_id].types[row.type_id] = { id: row.type_id, name: row.type_name, unit_type: row.type_unit, is_favorite: row.is_favorite, interaction_count: row.interaction_count, items: [] };
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
              id: row.inv_id, quantity: row.quantity, size: row.size,
              expiry_month: row.expiry_month, expiry_year: row.expiry_year,
              entry_month: row.entry_month, entry_year: row.entry_year,
              cab_name: row.cab_name, cab_location: row.cab_location
            });
          }
        }
      }
    });

    const finalCategories = Object.values(acc).map((c: any) => {
      let itemsStocked = 0;
      let totalQty = 0;
      let totalBatches = 0;
      const uniqueSitesSet = new Set();
      c.types = Object.values(c.types).map((t: any) => {
        let typeQty = 0;
        let soonestTypeStamp = Number.MAX_SAFE_INTEGER;
        totalBatches += t.items.length;
        t.items.forEach((it: any) => {
          uniqueSitesSet.add(it.cab_name || 'Global');
          typeQty += it.quantity;
          if (it.expiry_year && it.expiry_month) {
            const stamp = it.expiry_year * 12 + it.expiry_month;
            if (stamp < soonestTypeStamp) {
              soonestTypeStamp = stamp;
              t.soonest_month = it.expiry_month;
              t.soonest_year = it.expiry_year;
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
      c.types.sort((a: any, b: any) => {
        if (a.items.length > 0 && b.items.length === 0) return -1;
        if (a.items.length === 0 && b.items.length > 0) return 1;
        if (a.soonest_stamp !== b.soonest_stamp) return a.soonest_stamp - b.soonest_stamp;
        return a.name.localeCompare(b.name);
      });
      c.items_stocked = itemsStocked;
      c.total_qty = totalQty;
      c.batch_count = totalBatches;
      c.site_count = uniqueSitesSet.size;
      const ttStamps = c.types.map((tt: any) => tt.soonest_stamp);
      c.cat_soonest_stamp = (ttStamps.length > 0) ? Math.min(...ttStamps) : Number.MAX_SAFE_INTEGER;
      return c;
    });

    finalCategories.sort((a: any, b: any) => {
      const aHasStock = a.items_stocked > 0;
      const bHasStock = b.items_stocked > 0;
      if (aHasStock !== bHasStock) return aHasStock ? -1 : 1;
      if (a.cat_soonest_stamp !== b.cat_soonest_stamp) return a.cat_soonest_stamp - b.cat_soonest_stamp;
      return a.name.localeCompare(b.name);
    });

    setCategories(finalCategories);
    const favs: any[] = [];
    finalCategories.forEach(c => {
      c.types.forEach((t: any) => {
        if (t.is_favorite && t.items.length > 0) favs.push(t);
      });
    });
    favs.sort((a, b) => b.interaction_count - a.interaction_count || a.name.localeCompare(b.name));
    setFavorites(favs);

    // Run auto-backup check
    await BackupService.checkAndRunAutoBackup(db);
  };

  useFocusEffect(useCallback(() => { load(); }, [filterCabinetId, filterExpiryMode, searchQuery]));

  const toggleCategory = (id: number) => {
    const next = new Set(expandedCatIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedCatIds(next);
  };

  const toggleType = (id: number) => {
    const next = new Set(expandedTypeIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedTypeIds(next);
  };

  const bulkToggleTypes = (cat: any, expand: boolean) => {
    const next = new Set(expandedTypeIds);
    cat.types.forEach((t: any) => {
      if (t.items.length > 1) {
        if (expand) next.add(t.id); else next.delete(t.id);
      }
    });
    setExpandedTypeIds(next);
  };

  const handleDeductRequest = (inv: any, type: any) => {
    if (inv.quantity <= 1) {
      setDeleteTarget(type); setDeleteBatch(inv); setShowDeleteModal(true);
    } else {
      deductQuantity(inv.id, inv.quantity, type.id);
    }
  };

  const deductQuantity = async (invId: number, currentQty: number, typeId?: number, forceDelete = false) => {
    if (currentQty <= 1 || forceDelete) await db.runAsync('DELETE FROM Inventory WHERE id = ?', invId);
    else await db.runAsync('UPDATE Inventory SET quantity = quantity - 1 WHERE id = ?', invId);
    if (typeId) await db.runAsync('UPDATE ItemTypes SET interaction_count = interaction_count + 1 WHERE id = ?', typeId);
    await markModified(db);
    load();
  };

  const addQuantity = async (invId: number, typeId?: number) => {
    await db.runAsync('UPDATE Inventory SET quantity = quantity + 1 WHERE id = ?', invId);
    if (typeId) await db.runAsync('UPDATE ItemTypes SET interaction_count = interaction_count + 1 WHERE id = ?', typeId);
    await markModified(db);
    load();
  };

  const handleFavoriteAction = (type: any) => {
    const soonest = [...type.items].sort((a, b) => {
      const aStamp = (a.expiry_year && a.expiry_month) ? (a.expiry_year * 12 + a.expiry_month) : 999999;
      const bStamp = (b.expiry_year && b.expiry_month) ? (b.expiry_year * 12 + b.expiry_month) : 999999;
      return aStamp - bStamp;
    })[0];
    setConfirmTarget(type); setConfirmBatch(soonest); setShowConfirmModal(true);
  };

  const getStatusColor = (m: number | null, y: number | null) => {
    if (!m || !y) return '#94a3b8';
    const now = new Date();
    const remaining = (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1));
    if (remaining <= 0) return '#b91c1c';
    if (remaining < 4) return '#f97316';
    if (remaining < 7) return '#fde047';
    return '#22c55e';
  };

  const formatMonth = (m: any) => m ? m.toString().padStart(2, '0') : '--';

  const getUrgencyPhrasing = (m: number | null, y: number | null, isHeader = false) => {
    if (!m || !y) return null;
    const now = new Date();
    const remaining = (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1));
    const rawColor = getStatusColor(m, y);
    const isCritical = remaining < 4;
    const color = isCritical ? rawColor : '#94a3b8';
    const weight = isCritical ? 'bold' : 'normal';

    if (remaining < 0) {
      const abs = Math.abs(remaining);
      const label = isHeader ? "ITEMS EXPIRED " : "BATCHES EXPIRED ";
      return (
        <Text style={{color: '#94a3b8', fontSize: 12, fontWeight: 'bold'}}>
          {label}
          <Text style={{ color: '#ef4444' }}>{abs} {abs === 1 ? 'MONTH' : 'MONTHS'} AGO</Text>
        </Text>
      );
    }
    
    const label = isHeader ? "NEXT EXPIRY: " : "expires ";
    const timeText = remaining === 0 ? "THIS MONTH" : `${remaining} ${remaining === 1 ? 'MONTH' : 'MONTHS'}`;
    
    return (
      <Text style={{color: '#94a3b8', fontSize: 12, fontWeight: 'bold'}}>
        {label}
        <Text style={{ color, fontWeight: weight }}>{timeText}</Text>
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
    const isExpanded = expandedCatIds.has(cat.id);
    return (
      <View style={styles.categoryCard}>
        <TouchableOpacity style={[styles.categoryHeader, (isEmpty && !isExpanded) && { opacity: 0.5 }]} onPress={() => toggleCategory(cat.id)}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', flex: 1 }}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(cat.soonest_month, cat.soonest_year), marginRight: 12, marginTop: 8 }, isEmpty && { backgroundColor: '#334155' }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.categoryTitle}>{cat.name}</Text>
              {!isExpanded && (
                <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap'}}>
                  <Text style={{color: '#94a3b8', fontSize: 12, fontWeight: 'bold'}}>{cat.total_qty} {cat.total_qty === 1 ? 'ITEM' : 'ITEMS'}</Text>
                  <Text style={{color: '#334155', marginHorizontal: 4}}>•</Text>
                  <Text style={{color: '#94a3b8', fontSize: 12, fontWeight: 'bold'}}>{cat.batch_count} {cat.batch_count === 1 ? 'BATCH' : 'BATCHES'}</Text>
                  <Text style={{color: '#334155', marginHorizontal: 4}}>•</Text>
                  <Text style={{color: '#94a3b8', fontSize: 12, fontWeight: 'bold'}}>{cat.site_count} {cat.site_count === 1 ? 'SITE' : 'SITES'}</Text>
                  {cat.soonest_month && cat.soonest_year && (
                    <>
                      <Text style={{color: '#334155', marginHorizontal: 4}}>•</Text>
                      {getUrgencyPhrasing(cat.soonest_month, cat.soonest_year, true)}
                    </>
                  )}
                </View>
              )}
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {isExpanded && cat.types.some((t: any) => t.items.length > 1) && (
              <TouchableOpacity 
                onPress={() => {
                  const itemsToToggle = cat.types.filter((t: any) => t.items.length > 1);
                  const allExpanded = itemsToToggle.every((t: any) => expandedTypeIds.has(t.id));
                  bulkToggleTypes(cat, !allExpanded);
                }} 
                style={{padding: 8}}
              >
                <MaterialCommunityIcons 
                  name={cat.types.filter((t: any) => t.items.length > 1).every((t: any) => expandedTypeIds.has(t.id)) ? "unfold-less-horizontal" : "unfold-more-horizontal"} 
                  size={20} 
                  color="#3b82f6" 
                />
              </TouchableOpacity>
            )}
            <MaterialCommunityIcons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={24} color="#64748b" />
          </View>
        </TouchableOpacity>

        {isExpanded && cat.types.map((type: any) => {
          const hasItems = type.items.length > 0;
          const isMultiBatch = type.items.length > 1;
          const isTypeExpanded = !isMultiBatch || expandedTypeIds.has(type.id);
          const uniqueSites = Array.from(new Set(type.items.map((it: any) => it.cab_name || 'Global'))).length;
          const totalItems = type.items.reduce((acc: number, it: any) => acc + (it.quantity || 0), 0);
          
          return (
            <View key={type.id} style={styles.typeBlock}>
              <TouchableOpacity style={styles.typeHeader} activeOpacity={isMultiBatch ? 0.7 : 1} onPress={() => isMultiBatch && toggleType(type.id)}>
                <View style={[{flexDirection: 'row', alignItems: 'center', flex: 1}, !hasItems && {opacity: 0.5}]}>
                  {isMultiBatch && <MaterialCommunityIcons name={isTypeExpanded ? "chevron-down" : "menu-right"} size={22} color="#3b82f6" style={{marginRight: 4}} />}
                  <View style={{flex: 1}}>
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                      <View style={[styles.statusDot, { width: 8, height: 8, borderRadius: 4, marginRight: 8 }, {backgroundColor: getStatusColor(type.soonest_month, type.soonest_year)}]} />
                      <Text style={styles.typeTitle}>{type.name}</Text>
                    </View>
                    {!isTypeExpanded && (
                      <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 2, flexWrap: 'wrap'}}>
                        <Text style={{color: '#94a3b8', fontSize: 12, fontWeight: 'bold'}}>{totalItems} {totalItems === 1 ? 'ITEM' : 'ITEMS'}</Text>
                        <Text style={{color: '#334155', marginHorizontal: 4}}>•</Text>
                        <Text style={{color: '#94a3b8', fontSize: 12, fontWeight: 'bold'}}>{type.items.length} {type.items.length === 1 ? 'BATCH' : 'BATCHES'}</Text>
                        <Text style={{color: '#334155', marginHorizontal: 4}}>•</Text>
                        <Text style={{color: '#94a3b8', fontSize: 12, fontWeight: 'bold'}}>{uniqueSites} {uniqueSites === 1 ? 'SITE' : 'SITES'}</Text>
                        {type.soonest_month && type.soonest_year && (
                        <>
                          <Text style={{color: '#334155', marginHorizontal: 4}}>•</Text>
                          {getUrgencyPhrasing(type.soonest_month, type.soonest_year, false)}
                        </>
                      )}
                      </View>
                    )}
                  </View>
                </View>
                {!isTypeExpanded && type.tactical_total ? <Text style={[styles.totalLabel, {marginRight: 10}]}>{type.tactical_total}</Text> : null}
                <Link href={{ pathname: "/add", params: { typeId: type.id, categoryId: cat.id, inheritedCabinetId: filterCabinetId ?? undefined } }} asChild>
                  <TouchableOpacity style={styles.addButton}><Text style={styles.addText}>+ ADD</Text></TouchableOpacity>
                </Link>
              </TouchableOpacity>
              {isTypeExpanded && (
                <>
                  {!hasItems && <Text style={styles.emptyText}>No matching inventory.</Text>}
                  {hasItems && type.items.map((inv: any) => (
                    <View key={inv.id} style={styles.inventoryRow}>
                      <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4}}>
                         <Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>{inv.cab_name || 'Global'} • {inv.cab_location || 'Storage'}</Text>
                      </View>
                      <View style={styles.rowMain}>
                        <View style={styles.qtyBadge}><Text style={styles.qtyText}>{inv.quantity}</Text></View>
                        <Text style={styles.sizeText} numberOfLines={1}>{formatSizeDisplay(inv.size)}</Text>
                        <View style={styles.actionsGroup}>
                          <TouchableOpacity 
                            onPress={() => router.push({ 
                              pathname: '/add', 
                              params: { 
                                typeId: type.id.toString(), 
                                editBatchId: inv.id.toString(), 
                                categoryId: cat.id.toString(),
                                inheritedCabinetId: filterCabinetId ?? undefined
                              } 
                            })} 
                            style={[styles.actionBtn, {backgroundColor: '#3b82f6'}]}
                          >
                            <MaterialCommunityIcons name="pencil" size={16} color="white" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeductRequest(inv, type)} style={[styles.actionBtn, {backgroundColor: '#ef4444'}]}><MaterialCommunityIcons name="minus" size={16} color="white" /></TouchableOpacity>
                          <TouchableOpacity onPress={() => addQuantity(inv.id, type.id)} style={[styles.actionBtn, {backgroundColor: '#22c55e'}]}><MaterialCommunityIcons name="plus" size={16} color="white" /></TouchableOpacity>
                        </View>
                      </View>
                      <View style={[styles.rowSub, { justifyContent: 'space-between' }]}>
                        <Text style={styles.subText}>ENTRY: {formatMonth(inv.entry_month)}/{inv.entry_year}</Text>
                        {inv.expiry_month ? getUrgencyPhrasing(inv.expiry_month, inv.expiry_year, false) : <Text style={styles.subText}>EXPIRY: N/A</Text>}
                      </View>
                    </View>
                  ))}
                </>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.appHeader}>
        <Text style={styles.headerTitle}>War Cabinet</Text>
        <Link href="/briefing" asChild>
          <TouchableOpacity style={styles.briefingBtn}><MaterialCommunityIcons name="information-outline" size={26} color="#3b82f6" /></TouchableOpacity>
        </Link>
        <Link href="/catalog" asChild>
          <TouchableOpacity style={styles.settingsBtn}><MaterialCommunityIcons name="cog" size={26} color="#cbd5e1" /></TouchableOpacity>
        </Link>
      </View>

      {favorites.length > 0 && (
        <View style={styles.frontLineCard}>
          <View style={styles.frontLineHeader}>
             <MaterialCommunityIcons name="flash" size={14} color="#eab308" />
             <Text style={styles.frontLineTitle}>THE FRONT LINE</Text>
             <Text style={styles.frontLineSub}>• click for instant use</Text>
          </View>
          <FlatList
            horizontal showsHorizontalScrollIndicator={false} data={favorites} keyExtractor={(item) => item.id.toString()}
            renderItem={({item}) => (
              <TouchableOpacity style={styles.favChip} onPress={() => handleFavoriteAction(item)}>
                <MaterialCommunityIcons name="star" size={13} color="#eab308" style={{marginRight: 6}} />
                <Text style={styles.favText}>{item.name}</Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 14, gap: 10 }}
          />
        </View>
      )}

      <View style={styles.commandStrip}>
        <View style={styles.searchSide}>
           <MaterialCommunityIcons name="magnify" size={20} color="#64748b" />
           <TextInput style={styles.stripInput} placeholder="FIND STOCK..." placeholderTextColor="#475569" value={searchQuery} onChangeText={setSearchQuery} autoCapitalize="none" autoCorrect={false} />
           {searchQuery.length > 0 && <TouchableOpacity onPress={() => setSearchQuery('')}><MaterialCommunityIcons name="close-circle" size={18} color="#64748b" /></TouchableOpacity>}
        </View>
        <View style={styles.dividerPipe} />
        <View style={styles.filterSide}>
           <TouchableOpacity style={styles.iconFilterBtn} onPress={() => setShowFilterModal(true)}><MaterialCommunityIcons name="warehouse" size={20} color={filterCabinetId ? "#3b82f6" : "#475569"} /></TouchableOpacity>
           <TouchableOpacity style={styles.iconFilterBtn} onPress={() => setShowExpiryModal(true)}><MaterialCommunityIcons name={filterExpiryMode === 'ALL' ? "calendar-search" : "calendar-alert"} size={20} color={filterExpiryMode === 'ALL' ? "#475569" : "#eab308"} /></TouchableOpacity>
           {(filterCabinetId || filterExpiryMode !== 'ALL') && (
             <TouchableOpacity style={styles.iconFilterBtn} onPress={() => { setFilterCabinetId(null); setFilterExpiryMode('ALL'); }}><MaterialCommunityIcons name="filter-remove" size={20} color="#ef4444" /></TouchableOpacity>
           )}
        </View>
      </View>

      <FlatList ref={flatRef} data={categories} keyExtractor={(item) => item.id.toString()} renderItem={renderCategory} contentContainerStyle={{ padding: 16, paddingBottom: 100 }} />

      <Modal visible={showFilterModal} transparent animationType="fade">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Filter by Cabinet</Text>
          <TouchableOpacity style={[styles.modalItem, filterCabinetId === null && styles.modalItemActive]} onPress={() => { setFilterCabinetId(null); setShowFilterModal(false); }}>
            <MaterialCommunityIcons name="home-outline" size={20} color={filterCabinetId === null ? "white" : "#64748b"} style={{marginRight: 12}} />
            <Text style={[styles.modalItemText, filterCabinetId === null && styles.modalItemTextActive]}>ALL SITES</Text>
          </TouchableOpacity>
          {cabinets.map(cab => (
            <TouchableOpacity key={cab.id} style={[styles.modalItem, filterCabinetId === cab.id && styles.modalItemActive]} onPress={() => { setFilterCabinetId(cab.id); setShowFilterModal(false); }}>
              <Text style={[styles.modalItemText, filterCabinetId === cab.id && styles.modalItemTextActive]}>{cab.name}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.modalClose} onPress={() => setShowFilterModal(false)}><Text style={styles.modalCloseText}>CLOSE</Text></TouchableOpacity>
        </View></View>
      </Modal>

      <Modal visible={showExpiryModal} transparent animationType="fade">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Filter by Urgency</Text>
          <TouchableOpacity style={[styles.modalItem, filterExpiryMode === 'ALL' && styles.modalItemActive]} onPress={() => { setFilterExpiryMode('ALL'); setShowExpiryModal(false); }}>
            <Text style={[styles.modalItemText, filterExpiryMode === 'ALL' && styles.modalItemTextActive]}>ALL STOCK</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modalItem, filterExpiryMode === 'EXPIRED' && styles.modalItemActive]} onPress={() => { setFilterExpiryMode('EXPIRED'); setShowExpiryModal(false); }}>
            <Text style={[styles.modalItemText, filterExpiryMode === 'EXPIRED' && styles.modalItemTextActive]}>EXPIRED ONLY</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modalItem, filterExpiryMode === '<3M' && styles.modalItemActive]} onPress={() => { setFilterExpiryMode('<3M'); setShowExpiryModal(false); }}>
            <Text style={[styles.modalItemText, filterExpiryMode === '<3M' && styles.modalItemTextActive]}>DUE SOON</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modalClose} onPress={() => setShowExpiryModal(false)}><Text style={styles.modalCloseText}>CLOSE</Text></TouchableOpacity>
        </View></View>
      </Modal>

      <Modal visible={showDeleteModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>CONFIRM DELETION</Text>
          <Text style={{color: '#94a3b8', textAlign: 'center', marginBottom: 20}}>Delete {deleteTarget?.name} batch?</Text>
          <TouchableOpacity style={[styles.confirmBtn, {backgroundColor: '#ef4444'}]} onPress={() => { deductQuantity(deleteBatch.id, deleteBatch.quantity, deleteTarget.id, true); setShowDeleteModal(false); }}>
            <Text style={{color: 'white', fontWeight: 'bold'}}>CONFIRM DELETE</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelLink} onPress={() => setShowDeleteModal(false)}><Text style={{color: '#64748b'}}>CANCEL</Text></TouchableOpacity>
        </View></View>
      </Modal>

      <Modal visible={showConfirmModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>CONFIRM USE</Text>
          <Text style={{color: '#94a3b8', textAlign: 'center', marginBottom: 20}}>Use 1 unit of {confirmTarget?.name}?</Text>
          <TouchableOpacity style={styles.confirmBtn} onPress={() => { deductQuantity(confirmBatch.id, confirmBatch.quantity, confirmTarget.id); setShowConfirmModal(false); }}>
            <Text style={styles.confirmBtnText}>CONFIRM USE</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelLink} onPress={() => setShowConfirmModal(false)}><Text style={{color: '#64748b'}}>CANCEL</Text></TouchableOpacity>
        </View></View>
      </Modal>

      {feedback && (
        <Animated.View style={[styles.feedbackBanner, { opacity: feedbackAnim }]}>
          <Text style={styles.feedbackText}>{feedback}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  appHeader: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e293b', paddingTop: 50, paddingBottom: 15, paddingHorizontal: 10, position: 'relative' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc', textAlign: 'center' },
  settingsBtn: { position: 'absolute', right: 16, bottom: 12 },
  briefingBtn: { position: 'absolute', right: 56, bottom: 12 },
  categoryCard: { backgroundColor: '#1e293b', borderRadius: 8, marginBottom: 12, overflow: 'hidden' },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  categoryTitle: { fontSize: 20, color: '#f8fafc', fontWeight: 'bold' },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  typeBlock: { padding: 12, backgroundColor: '#0f172a', borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  typeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typeTitle: { color: '#e2e8f0', fontSize: 18, fontWeight: '600', marginLeft: 4 },
  addButton: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#3b82f6', borderRadius: 4 },
  addText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  emptyText: { color: '#64748b', fontStyle: 'italic', fontSize: 14, marginLeft: 16 },
  inventoryRow: { padding: 12, backgroundColor: '#334155', borderRadius: 6, marginBottom: 8 },
  totalLabel: { fontSize: 13, color: '#3b82f6', fontWeight: 'bold' },
  rowMain: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  qtyBadge: { backgroundColor: '#1e293b', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  qtyText: { color: 'white', fontSize: 13, fontWeight: 'bold' },
  sizeText: { flex: 1, color: '#f8fafc', fontSize: 15, fontWeight: '500' },
  actionsGroup: { flexDirection: 'row', gap: 6 },
  rowSub: { flexDirection: 'row', alignItems: 'center' },
  subText: { color: '#94a3b8', fontSize: 12, letterSpacing: 0.5 },
  divider: { color: '#334155', marginHorizontal: 8, fontSize: 12 },
  actionBtn: { padding: 6, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  commandStrip: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10, backgroundColor: '#0f172a', borderRadius: 8, borderWidth: 1, borderColor: '#334155', paddingLeft: 12, height: 48 },
  searchSide: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  stripInput: { flex: 1, color: 'white', fontSize: 13, fontWeight: '500', marginLeft: 8 },
  dividerPipe: { width: 1, height: 24, backgroundColor: '#334155', marginHorizontal: 8 },
  filterSide: { flexDirection: 'row', alignItems: 'center', paddingRight: 4 },
  iconFilterBtn: { padding: 10 },
  frontLineCard: { marginHorizontal: 16, marginTop: 20, marginBottom: 6, borderWidth: 1, borderColor: '#334155', borderRadius: 8, backgroundColor: '#1e293b', overflow: 'hidden' },
  frontLineHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#334155' },
  frontLineTitle: { color: '#64748b', fontSize: 11, fontWeight: 'bold', marginLeft: 6 },
  frontLineSub: { color: '#475569', fontSize: 11, marginLeft: 6 },
  favChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#334155' },
  favText: { color: 'white', fontSize: 13, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1e293b', borderRadius: 16, padding: 24, maxHeight: '80%' },
  modalTitle: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#334155', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalItemActive: { backgroundColor: '#3b82f6', borderRadius: 8, paddingHorizontal: 10 },
  modalItemText: { color: '#f8fafc', fontSize: 16 },
  modalItemTextActive: { color: 'white', fontWeight: 'bold' },
  modalClose: { marginTop: 20, padding: 15, alignItems: 'center' },
  modalCloseText: { color: '#ef4444', fontWeight: 'bold', fontSize: 16 },
  feedbackBanner: { position: 'absolute', bottom: 40, left: 20, right: 20, backgroundColor: '#1e293b', borderRadius: 8, padding: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#3b82f6' },
  feedbackText: { color: '#3b82f6', fontWeight: 'bold', fontSize: 13, letterSpacing: 1 },
  confirmBtn: { backgroundColor: '#eab308', padding: 16, borderRadius: 8, alignItems: 'center' },
  confirmBtnText: { color: 'black', fontWeight: 'bold', fontSize: 16 },
  cancelLink: { marginTop: 20, alignItems: 'center' }
});
