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
  
  // Tactical Bridge (E2E Only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__E2E_DB__ = db;
    }
  }, [db]);
  const router = useRouter();
  const flatRef = React.useRef<FlatList>(null);
  const batchRefs = React.useRef<Record<number, View | null>>({});
  const currentScrollY = React.useRef(0);
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
  const flashAnim = React.useRef(new Animated.Value(0)).current;
  const [flashBatchId, setFlashBatchId] = useState<number | null>(null);
  const hasScrolledForFlashRef = React.useRef<number | null>(null); // prevents double-scroll from load() re-triggering useEffect

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

  // Scroll to bring the flashing batch row into view near the top of the screen.
  // We use a Two-Pass approach for pixel-perfect precision:
  // 1. Guess the Y offset using estimation to get the target visible & 'mounted'.
  // 2. Use measureInWindow to get the EXACT screen position and refine the scroll.
  useEffect(() => {
    if (!flashBatchId) { hasScrolledForFlashRef.current = null; return; }
    if (categories.length === 0) return;
    if (hasScrolledForFlashRef.current === flashBatchId) return;
    hasScrolledForFlashRef.current = flashBatchId;

    const catIdx = categories.findIndex((cat: any) =>
      cat.types?.some((t: any) => t.items?.some((inv: any) => inv.id === flashBatchId))
    );
    if (catIdx === -1) { 
      flatRef.current?.scrollToOffset({ offset: 0, animated: false }); 
      currentScrollY.current = 0;
      return; 
    }

    const cat = categories[catIdx];
    const typeIdx = cat?.types?.findIndex((t: any) =>
      t.items?.some((inv: any) => inv.id === flashBatchId)
    ) ?? 0;

    // PASS 1: Jump instantly using baseline estimate (ensures target is mounted)
    const LIST_TOP_PADDING   = 16;
    const CLOSED_CAT_HEIGHT  = 82;
    const CAT_HEADER_HEIGHT  = 72;
    const CLOSED_TYPE_HEIGHT = 62;
    const TYPE_HEADER_HEIGHT = 60;
    const guessY = LIST_TOP_PADDING + (catIdx * CLOSED_CAT_HEIGHT) + CAT_HEADER_HEIGHT + (typeIdx * CLOSED_TYPE_HEIGHT) + TYPE_HEADER_HEIGHT;
    const jumpOffset = Math.max(0, guessY - 200);

    // Manual update of tracking ref because native onScroll event might be delayed
    currentScrollY.current = jumpOffset; 
    flatRef.current?.scrollToOffset({ offset: jumpOffset, animated: false });

    // PASS 2: Once jump is finished and view is laid out, refine using exact screen coordinates
    setTimeout(() => {
      const rowRef = batchRefs.current[flashBatchId];
      if (rowRef) {
        rowRef.measureInWindow((x, y, width, height) => {
          // 'y' is the raw screen position. We want it at ~300px from the screen top.
          // 300px accounts for the app header + search strip + frontline panel.
          const adjustment = y - 300;
          const refinedOffset = Math.max(0, currentScrollY.current + adjustment);
          flatRef.current?.scrollToOffset({ offset: refinedOffset, animated: true });
        });
      } else {
        // Fallback: jump a tiny bit more if ref missing
        flatRef.current?.scrollToOffset({ offset: jumpOffset + 50, animated: true });
      }
    }, 100); // 100ms is enough for layout to settle after instant jump
  }, [flashBatchId, categories]);

  const triggerFeedback = (msg: string) => {
    setFeedback(msg);
    Animated.sequence([
      Animated.timing(feedbackAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(3000),
      Animated.timing(feedbackAnim, { toValue: 0, duration: 800, useNativeDriver: true })
    ]).start(() => setFeedback(null));
  };

  const load = async (overrideCabinetId?: number | null) => {
    const effectiveCabinetId = overrideCabinetId !== undefined ? overrideCabinetId : filterCabinetId;
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
      LEFT JOIN Inventory inv ON i.id = inv.item_type_id ${effectiveCabinetId ? ` AND inv.cabinet_id = ${effectiveCabinetId}` : ''}
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
          const num = parseFloat(sz.replace(/[^0-9]/g, ''));
          if (!isNaN(num)) {
            totalValue += (num * qty);
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

    // FRONT LINE: Always load favorites from an UNFILTERED query so the belt
    // is never affected by cabinet or expiry filters — it's a global quick-access rail.
    const favRows = await db.getAllAsync<any>(`
      SELECT it.id, it.name, it.interaction_count,
             SUM(inv.quantity) as total_qty
        FROM ItemTypes it
        JOIN Inventory inv ON inv.item_type_id = it.id
       WHERE it.is_favorite = 1
       GROUP BY it.id
      HAVING total_qty > 0
       ORDER BY it.interaction_count DESC, it.name ASC
    `);
    setFavorites(favRows);

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
      if (t.items.length > 0) {
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

  const handleFavoriteAction = async (type: any) => {
    // Live DB lookup — fetch full context needed for navigation and flash
    const soonest = await db.getFirstAsync<any>(`
      SELECT inv.id, inv.quantity, inv.size, inv.expiry_month, inv.expiry_year,
             inv.entry_month, inv.entry_year, inv.cabinet_id,
             cab.name as cab_name, cab.location as cab_location,
             it.category_id
        FROM Inventory inv
        LEFT JOIN Cabinets cab ON inv.cabinet_id = cab.id
        LEFT JOIN ItemTypes it ON inv.item_type_id = it.id
       WHERE inv.item_type_id = ?
       ORDER BY 
         CASE WHEN inv.expiry_year IS NULL THEN 1 ELSE 0 END,
         inv.expiry_year ASC, inv.expiry_month ASC
       LIMIT 1
    `, type.id);
    setConfirmTarget(type); setConfirmBatch(soonest); setShowConfirmModal(true);
  };

  const handleConfirmFavoriteUse = async () => {
    if (!confirmBatch || !confirmTarget) return;
    setShowConfirmModal(false);

    // Snapshot values to avoid stale closure issues inside callbacks
    const batchId = confirmBatch.id;
    const typeId: number = confirmTarget.id;
    const cabId: number | null = confirmBatch.cabinet_id ?? null;
    const catId: number | null = confirmBatch.category_id ?? null;

    // Perform deduction — now handles the last unit directly without an intermediate modal hop
    if (confirmBatch.quantity <= 1) {
      await deductQuantity(batchId, 1, typeId, true);
      // No animation for deletion, just navigate and load
      if (filterCabinetId !== null && cabId !== null) setFilterCabinetId(cabId);

      if (catId !== null) setExpandedCatIds(new Set([catId] as number[]));
      setExpandedTypeIds(new Set([typeId]));
      await load(filterCabinetId === null ? null : (cabId ?? null));
      return;
    }

    // PHASE 1: Navigate + expand — load with ORIGINAL quantity so user sees old number first
    // Only switch cabinet if currently filtered to a specific cabinet; 
    // if 'ALL SITES', keep it global so we don't surprise the user.
    const effectiveCab = filterCabinetId === null ? null : (cabId ?? null);
    if (filterCabinetId !== null && cabId !== null) setFilterCabinetId(cabId);

    if (catId !== null) setExpandedCatIds(new Set([catId as number]));
    setExpandedTypeIds(new Set([typeId]));
    await load(effectiveCab);

    // Mark badge for glow and trigger the scroll via useEffect
    setFlashBatchId(batchId);
    flashAnim.setValue(0);

    // Wait for scroll to fully settle BEFORE starting the animation.
    // This ensures the user sees the ORIGINAL quantity highlighted, then the drop.
    setTimeout(() => {
      Animated.timing(flashAnim, { toValue: 1, duration: 350, useNativeDriver: false }).start(async () => {
        // Deduct at peak of glow — number drops while badge is still green
        await db.runAsync('UPDATE Inventory SET quantity = quantity - 1 WHERE id = ?', batchId);
        await db.runAsync('UPDATE ItemTypes SET interaction_count = interaction_count + 1 WHERE id = ?', typeId);
        await markModified(db);
        await load(cabId);

        // Hold glow briefly then fade
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(flashAnim, { toValue: 0, duration: 700, useNativeDriver: false }),
        ]).start(() => setFlashBatchId(null));
      });
    }, 700); // 700ms ≈ scroll settle time (100ms reset + ~500ms animated scroll + buffer)
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

    const isExpired = remaining < 0;
    const label = isHeader ? (isExpired ? "" : "NEXT EXPIRY: ") : (isExpired ? "" : "expires ");
    const abs = Math.abs(remaining);
    const timeText = isExpired 
      ? `expired ${abs} ${abs === 1 ? 'month' : 'months'} ago` 
      : (remaining === 0 ? "THIS MONTH" : `${remaining} ${remaining === 1 ? 'month' : 'months'}`);
    
    return (
      <Text style={{color: '#94a3b8', fontSize: 12, fontWeight: 'bold'}}>
        {label}
        <Text style={{ color, fontWeight: weight }}>{isHeader ? timeText.toUpperCase() : timeText}</Text>
      </Text>
    );
  };

  const formatSizeDisplay = (rawSize: string, unitType: string = 'weight') => {
    if (!rawSize) return 'N/A';
    const num = parseFloat(rawSize);
    if (isNaN(num)) return rawSize;

    if (num >= 1000) {
      if (unitType === 'weight') return (num / 1000) + 'kg';
      if (unitType === 'volume') return (num / 1000) + 'l';
    }

    const suffix = unitType === 'weight' ? 'g' : unitType === 'volume' ? 'ml' : '';
    return num + suffix;
  };

  const renderCategory = ({ item: cat }: any) => {
    const isEmpty = cat.total_qty === 0;
    const isExpanded = expandedCatIds.has(cat.id);
    return (
      <View style={styles.categoryCard}>
        <TouchableOpacity 
          style={[styles.categoryHeader, (isEmpty && !isExpanded) && { opacity: 0.5 }]} 
          onPress={() => toggleCategory(cat.id)}
          testID={`category-header-${cat.name.toLowerCase().replace(/\s+/g, '-')}`}
        >
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
            {isExpanded && cat.types.some((t: any) => t.items.length > 0) && (
              <TouchableOpacity 
                onPress={() => {
                  const itemsToToggle = cat.types.filter((t: any) => t.items.length > 0);
                  const allExpanded = itemsToToggle.every((t: any) => expandedTypeIds.has(t.id));
                  bulkToggleTypes(cat, !allExpanded);
                }} 
                style={{padding: 8}}
              >
                <MaterialCommunityIcons 
                  name={cat.types.filter((t: any) => t.items.length > 0).every((t: any) => expandedTypeIds.has(t.id)) ? "unfold-less-horizontal" : "unfold-more-horizontal"} 
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
          const isTypeExpanded = expandedTypeIds.has(type.id);
          const uniqueSites = Array.from(new Set(type.items.map((it: any) => it.cab_name || 'Global'))).length;
          const totalItems = type.items.reduce((acc: number, it: any) => acc + (it.quantity || 0), 0);
          
          return (
            <View key={type.id} style={styles.typeBlock}>
              <TouchableOpacity 
                style={styles.typeHeader} 
                activeOpacity={hasItems ? 0.7 : 1} 
                onPress={() => hasItems && toggleType(type.id)}
                testID={`type-header-${type.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <View style={[{flexDirection: 'row', alignItems: 'center', flex: 1}, !hasItems && {opacity: 0.5}]}>
                   <MaterialCommunityIcons name={isTypeExpanded ? "chevron-down" : "menu-right"} size={22} color="#3b82f6" style={{marginRight: 4, opacity: hasItems ? 1 : 0}} />
                  <View style={{flex: 1}}>
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                      <View style={[styles.statusDot, { width: 8, height: 8, borderRadius: 4, marginRight: 8 }, {backgroundColor: getStatusColor(type.soonest_month, type.soonest_year)}]} />
                      <Text style={styles.typeTitle}>{type.name}</Text>
                    </View>
                    {!isTypeExpanded && (
                      <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 2, flexWrap: 'wrap'}}>
                        {hasItems ? (
                          <>
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
                          </>
                        ) : (
                          <Text style={{color: '#64748b', fontSize: 12, fontWeight: 'bold'}}>No stock</Text>
                        )}
                      </View>
                    )}
                  </View>
                </View>
                {!isTypeExpanded && type.tactical_total ? <Text style={[styles.totalLabel, {marginRight: 10}]}>{type.tactical_total}</Text> : null}
                <Link href={{ pathname: "/add", params: { typeId: type.id, categoryId: cat.id, inheritedCabinetId: filterCabinetId ?? undefined } }} asChild>
                  <TouchableOpacity style={styles.addButton} testID={`add-btn-${type.name.toLowerCase().replace(/\s+/g, '-')}`}><Text style={styles.addText}>+ ADD</Text></TouchableOpacity>
                </Link>
              </TouchableOpacity>
              {isTypeExpanded && hasItems && (
                <>
                  {type.items.map((inv: any) => (
                    <View 
                      key={inv.id} 
                      ref={(r) => { batchRefs.current[inv.id] = r; }} 
                      style={styles.inventoryRow}
                      testID={`batch-${type.name.toLowerCase().replace(/\s+/g, '-')}-${inv.id}`}
                    >
                      <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4}}>
                         <Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>{inv.cab_name || 'Global'} • {inv.cab_location || 'Storage'}</Text>
                      </View>
                      <View style={styles.rowMain}>
                        {inv.id === flashBatchId ? (
                          <Animated.View style={[styles.qtyBadge, { backgroundColor: flashAnim.interpolate({ inputRange: [0, 1], outputRange: ['#1e293b', '#166534'] }), borderWidth: 1.5, borderColor: flashAnim.interpolate({ inputRange: [0, 1], outputRange: ['transparent', '#22c55e'] }) }]}>
                            <Text style={styles.qtyText} testID="qty-text">{inv.quantity}</Text>
                          </Animated.View>
                        ) : (
                          <View style={styles.qtyBadge}>
                            <Text style={styles.qtyText} testID="qty-text">{inv.quantity}</Text>
                          </View>
                        )}
                        <Text style={styles.sizeText} numberOfLines={1} testID="size-text">{formatSizeDisplay(inv.size, type.unit_type)}</Text>
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
                            testID={`edit-batch-${inv.id}`}
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
        <Link href="/logistics" asChild>
          <TouchableOpacity style={styles.logisticsBtn} testID="logistics-btn">
            <MaterialCommunityIcons name="truck-delivery" size={26} color="#22c55e" />
          </TouchableOpacity>
        </Link>
        <Link href="/recipes" asChild>
          <TouchableOpacity style={StyleSheet.flatten([styles.logisticsBtn, { left: 56 }])} testID="recipes-btn">
            <MaterialCommunityIcons name="chef-hat" size={26} color="#fbbf24" />
          </TouchableOpacity>
        </Link>
        <Text style={styles.headerTitle} testID="app-header-title">War Cabinet</Text>
        <Link href="/briefing" asChild>
          <TouchableOpacity style={styles.briefingBtn} testID="briefing-btn">
            <MaterialCommunityIcons name="information-outline" size={26} color="#3b82f6" />
          </TouchableOpacity>
        </Link>
        <Link href="/catalog" asChild>
          <TouchableOpacity style={styles.settingsBtn} testID="settings-btn">
            <MaterialCommunityIcons name="cog" size={26} color="#cbd5e1" />
          </TouchableOpacity>
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

      {/* ─── ACTIVE FILTER PILL ROW ─── */}
      {(filterCabinetId !== null || filterExpiryMode !== 'ALL') && (
        <View style={styles.filterPillRow}>
          {filterCabinetId !== null && (
            <View style={[styles.filterPill, { backgroundColor: '#1e3a5f', borderColor: '#3b82f6' }]}>
              <MaterialCommunityIcons name="warehouse" size={13} color="#3b82f6" style={{ marginRight: 5 }} />
              <Text style={[styles.filterPillText, { color: '#3b82f6' }]}>
                {cabinets.find(c => c.id === filterCabinetId)?.name?.toUpperCase() ?? 'CABINET'}
              </Text>
              <TouchableOpacity onPress={() => setFilterCabinetId(null)} style={{ marginLeft: 6 }}>
                <MaterialCommunityIcons name="close-circle" size={14} color="#3b82f6" />
              </TouchableOpacity>
            </View>
          )}
          {filterExpiryMode !== 'ALL' && (() => {
            const modeMap: Record<string, { label: string; color: string; bg: string; icon: string }> = {
              'EXPIRED':    { label: 'EXPIRED',    color: '#ef4444', bg: '#3f0f0f', icon: 'alert-circle' },
              'THIS_MONTH': { label: 'THIS MONTH', color: '#f97316', bg: '#3f1f0f', icon: 'calendar-alert' },
              '<3M':        { label: 'DUE < 3M',   color: '#eab308', bg: '#3f350f', icon: 'calendar-clock' },
            };
            const def = modeMap[filterExpiryMode] ?? { label: filterExpiryMode, color: '#94a3b8', bg: '#1e293b', icon: 'calendar-search' };
            return (
              <View style={[styles.filterPill, { backgroundColor: def.bg, borderColor: def.color }]}>
                <MaterialCommunityIcons name={def.icon as any} size={13} color={def.color} style={{ marginRight: 5 }} />
                <Text style={[styles.filterPillText, { color: def.color }]}>{def.label}</Text>
                <TouchableOpacity onPress={() => setFilterExpiryMode('ALL')} style={{ marginLeft: 6 }}>
                  <MaterialCommunityIcons name="close-circle" size={14} color={def.color} />
                </TouchableOpacity>
              </View>
            );
          })()}
        </View>
      )}

      <FlatList
        ref={flatRef}
        data={categories}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderCategory}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        onScroll={(e) => { currentScrollY.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        onScrollToIndexFailed={() => {
          // Fallback when item heights aren't known yet — go to top of list
          flatRef.current?.scrollToOffset({ offset: 0, animated: true });
        }}
      />


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
          <Text style={{color: '#f8fafc', textAlign: 'center', fontSize: 16, fontWeight: 'bold', marginBottom: 12}}>{deleteTarget?.name}</Text>
          {deleteBatch && (
            <View style={{ backgroundColor: '#0f172a', borderRadius: 8, padding: 12, marginBottom: 16, width: '100%' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <MaterialCommunityIcons name="warehouse" size={14} color="#3b82f6" style={{ marginRight: 8 }} />
                <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>
                  {deleteBatch.cab_name?.toUpperCase() || 'GLOBAL'}
                  {deleteBatch.cab_location ? ` • ${deleteBatch.cab_location.toUpperCase()}` : ''}
                </Text>
              </View>
              {deleteBatch.size && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <MaterialCommunityIcons name="weight" size={14} color="#64748b" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>{deleteBatch.size}</Text>
                </View>
              )}
              {deleteBatch.expiry_month && deleteBatch.expiry_year && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="calendar-clock" size={14} color="#64748b" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>
                    EXPIRES {String(deleteBatch.expiry_month).padStart(2,'0')}/{deleteBatch.expiry_year}
                  </Text>
                </View>
              )}
            </View>
          )}
          <Text style={{color: '#64748b', textAlign: 'center', fontSize: 12, marginBottom: 16}}>Are you sure you want to remove this batch from stock?</Text>
          <TouchableOpacity style={[styles.confirmBtn, {backgroundColor: '#ef4444'}]} onPress={() => { deductQuantity(deleteBatch.id, deleteBatch.quantity, deleteTarget.id, true); setShowDeleteModal(false); }}>
            <Text style={{color: 'white', fontWeight: 'bold'}}>CONFIRM DELETE</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelLink} onPress={() => setShowDeleteModal(false)}><Text style={{color: '#64748b'}}>CANCEL</Text></TouchableOpacity>
        </View></View>
      </Modal>

      <Modal visible={showConfirmModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>CONFIRM USE</Text>
          <Text style={{color: '#f8fafc', textAlign: 'center', fontSize: 16, fontWeight: 'bold', marginBottom: 12}}>{confirmTarget?.name}</Text>
          {confirmBatch && (
            <View style={{ backgroundColor: '#0f172a', borderRadius: 8, padding: 12, marginBottom: 16, width: '100%' }}>
              {confirmBatch.cab_name && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <MaterialCommunityIcons name="warehouse" size={14} color="#3b82f6" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>
                    {confirmBatch.cab_name.toUpperCase()}
                    {confirmBatch.cab_location ? ` • ${confirmBatch.cab_location.toUpperCase()}` : ''}
                  </Text>
                </View>
              )}
              {confirmBatch.size && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <MaterialCommunityIcons name="weight" size={14} color="#64748b" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>{confirmBatch.size}</Text>
                </View>
              )}
              {confirmBatch.expiry_month && confirmBatch.expiry_year && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="calendar-clock" size={14} color="#64748b" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>
                    EXPIRES {String(confirmBatch.expiry_month).padStart(2,'0')}/{confirmBatch.expiry_year}
                  </Text>
                </View>
              )}
            </View>
          )}
          <Text style={{color: confirmBatch?.quantity <= 1 ? '#ef4444' : '#64748b', textAlign: 'center', fontSize: 12, marginBottom: 16}}>
            {confirmBatch?.quantity <= 1 
              ? "THIS IS THE FINAL UNIT. Confirmed use will remove this batch from stock."
              : "Deduct 1 unit from the soonest-expiring batch?"}
          </Text>
          <TouchableOpacity 
            style={[styles.confirmBtn, confirmBatch?.quantity <= 1 && { backgroundColor: '#ef4444' }]} 
            onPress={handleConfirmFavoriteUse}
          >
            <Text style={styles.confirmBtnText}>{confirmBatch?.quantity <= 1 ? 'USE & DELETE BATCH' : 'CONFIRM USE'}</Text>
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
  filterPillRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingVertical: 6, gap: 8 },
  filterPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  filterPillText: { fontSize: 11, fontWeight: 'bold', letterSpacing: 0.5 },

  appHeader: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e293b', paddingTop: 50, paddingBottom: 15, paddingHorizontal: 10, position: 'relative' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc', textAlign: 'center' },
  settingsBtn: { position: 'absolute', right: 16, bottom: 12 },
  briefingBtn: { position: 'absolute', right: 56, bottom: 12 },
  logisticsBtn: { position: 'absolute', left: 16, bottom: 12 },
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
  frontLineTitle: { color: '#cbd5e1', fontSize: 11, fontWeight: 'bold', marginLeft: 6 },
  frontLineSub: { color: '#94a3b8', fontSize: 11, marginLeft: 6 },
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
