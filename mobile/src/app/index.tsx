import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert, Image, Modal, Platform, TextInput, Animated, ScrollView, Switch } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { Link, useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { requestPermissions, scheduleMonthlyBriefing } from '../services/notifications';
import { initializeDatabase, markModified } from '../db/sqlite';
import { BackupService } from '../services/BackupService';
import { useBilling } from '../context/BillingContext';

export default function HomeScreen() {
  const db = useSQLiteContext();
  const { checkEntitlement, hasFullAccess, limits, isTrialActive, trialLabel, isSergeanOrAbove, requestPurchase, isPremium, isGeneralOrAbove: isGeneral, isCadet, isPrivate } = useBilling();
  
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

  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveBatch, setMoveBatch] = useState<any>(null);
  const [moveType, setMoveType] = useState<any>(null);
  const [moveQty, setMoveQty] = useState(1);
  const [moveDestCabId, setMoveDestCabId] = useState<number | null>(null);
  const [moveDestCabinets, setMoveDestCabinets] = useState<any[]>([]);
  const [showMoveCabinetPicker, setShowMoveCabinetPicker] = useState(false);

  const [showInlineAddCabinet, setShowInlineAddCabinet] = useState(false);
  const [showDeploymentHub, setShowDeploymentHub] = useState(false);
  const [showInlineAddCategory, setShowInlineAddCategory] = useState(false);
  const [inlineCabName, setInlineCabName] = useState('');
  const [inlineCabLoc, setInlineCabLoc] = useState('');
  const [inlineCabType, setInlineCabType] = useState<'standard' | 'freezer'>('standard');
  const [inlineCatName, setInlineCatName] = useState('');
  const [inlineCatIsMessHall, setInlineCatIsMessHall] = useState(true);


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

  useEffect(() => {
    load();
  }, [searchQuery, filterCabinetId, filterExpiryMode]);

  const load = useCallback(async (overrideCabinetId?: number | null) => {
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
             i.freeze_months as type_freeze_months,
             inv.id as inv_id, inv.quantity, inv.size, inv.expiry_month, inv.expiry_year, inv.entry_month, inv.entry_year, inv.batch_intel,
             inv.supplier as inv_supplier, inv.product_range as inv_product_range,
             inv.cabinet_id as inv_cabinet_id, inv.item_type_id as inv_item_type_id,
             cab.name as cab_name, cab.location as cab_location, cab.cabinet_type as cab_type
      FROM Categories c
      LEFT JOIN ItemTypes i ON c.id = i.category_id
      LEFT JOIN Inventory inv ON i.id = inv.item_type_id ${effectiveCabinetId ? ` AND inv.cabinet_id = ${effectiveCabinetId}` : ''}
      LEFT JOIN Cabinets cab ON inv.cabinet_id = cab.id
      ORDER BY c.name, i.name, inv.expiry_year, inv.expiry_month, inv.size
    `);


    const acc: any = {};
    allRows.forEach(row => {
      // 1. Search Query Filter (Strict Removal)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const isInName = row.type_name?.toLowerCase().includes(query);
        const isInCat = row.cat_name?.toLowerCase().includes(query);
        const isInSite = row.cab_name?.toLowerCase().includes(query);
        const isInIntel = row.batch_intel?.toLowerCase().includes(query);
        const isInSupplier = row.inv_supplier?.toLowerCase().includes(query);
        const isInRange = row.inv_product_range?.toLowerCase().includes(query);
        if (!isInName && !isInCat && !isInSite && !isInIntel && !isInSupplier && !isInRange) return;
      }

      // 2. Expiry Mode Filter (Strict Removal)
      if (row.inv_id) {
        const now = new Date();
        const currentStamp = now.getFullYear() * 12 + (now.getMonth() + 1);
        
        // Calculate effective expiry for frozen items
        let effMonth = row.expiry_month;
        let effYear = row.expiry_year;

        if (row.cab_type === 'freezer' && row.entry_month && row.entry_year) {
          const limit = row.type_freeze_months ?? 6;
          let m = row.entry_month + limit;
          let y = row.entry_year;
          while (m > 12) {
            m -= 12;
            y += 1;
          }
          effMonth = m;
          effYear = y;
        }

        const expStamp = (effYear && effMonth) ? (effYear * 12 + effMonth) : null;
        
        let matchesExpiry = true;
        if (filterExpiryMode === 'EXPIRED') matchesExpiry = !!expStamp && expStamp < currentStamp;
        else if (filterExpiryMode === 'THIS_MONTH') matchesExpiry = !!expStamp && expStamp === currentStamp;
        else if (filterExpiryMode === '<3M') matchesExpiry = !!expStamp && (expStamp >= currentStamp + 1 && expStamp <= currentStamp + 3);

        if (!matchesExpiry) return; // Skip the batch completely if it doesn't match the urgency filter
      } else {
        // If there's no inventory row but a filter is active, we should skip this row unless it matches the search (handled above)
        // If an Expiry Filter is active, an item with no batches CANNOT match.
        if (filterExpiryMode !== 'ALL') return;
        
        // If a Cabinet Filter is active, and the SQL join failed (effectiveCabinetId was passed), inv_id will be null.
        // So this row shouldn't be here in the results because of the outer join if we want strict removal.
        if (effectiveCabinetId) return;
      }

      // 3. Populate accumulator
      if (!acc[row.cat_id]) {
        acc[row.cat_id] = { id: row.cat_id, name: row.cat_name, icon: row.cat_icon, types: {}, soonest_month: null, soonest_year: null };
      }
      if (row.type_id) {
        if (!acc[row.cat_id].types[row.type_id]) {
          acc[row.cat_id].types[row.type_id] = { id: row.type_id, name: row.type_name, unit_type: row.type_unit, is_favorite: row.is_favorite, interaction_count: row.interaction_count, freeze_months: row.type_freeze_months ?? null, items: [] };
        }
        if (row.inv_id) {
          acc[row.cat_id].types[row.type_id].items.push({
            id: row.inv_id, quantity: row.quantity, size: row.size,
            expiry_month: row.expiry_month, expiry_year: row.expiry_year,
            entry_month: row.entry_month, entry_year: row.entry_year,
            cabinet_id: row.inv_cabinet_id, item_type_id: row.inv_item_type_id,
            cab_name: row.cab_name, cab_location: row.cab_location,
            cab_type: row.cab_type, batch_intel: row.batch_intel,
            supplier: row.inv_supplier, product_range: row.inv_product_range,
          });
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

          let effMonth = it.expiry_month;
          let effYear = it.expiry_year;

          if (it.cab_type === 'freezer' && it.entry_month && it.entry_year) {
            const limit = t.freeze_months ?? 6;
            let m = it.entry_month + limit;
            let y = it.entry_year;
            while (m > 12) {
              m -= 12;
              y += 1;
            }
            effMonth = m;
            effYear = y;
          }

          if (effYear && effMonth) {
            const stamp = effYear * 12 + effMonth;
            if (stamp < soonestTypeStamp) {
              soonestTypeStamp = stamp;
              t.soonest_month = effMonth;
              t.soonest_year = effYear;
              t.soonest_is_freezer = it.cab_type === 'freezer';
              if (!c.soonest_year || stamp < (c.soonest_year * 12 + c.soonest_month)) {
                c.soonest_month = effMonth;
                c.soonest_year = effYear;
                c.soonest_is_freezer = it.cab_type === 'freezer';
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

      // STRICT NOISE REDUCTION: If filtering/searching, purge empty item types
      if (effectiveCabinetId || filterExpiryMode !== 'ALL' || searchQuery) {
        c.types = c.types.filter((t: any) => t.items.length > 0);
      }

      const ttStamps = c.types.map((tt: any) => tt.soonest_stamp);
      c.cat_soonest_stamp = (ttStamps.length > 0) ? Math.min(...ttStamps) : Number.MAX_SAFE_INTEGER;
      return c;
    });

    // FINAL FILTER: Purge categories that are now empty (if filtering/searching)
    let finalFiltered = finalCategories;
    if (effectiveCabinetId || filterExpiryMode !== 'ALL' || searchQuery) {
      finalFiltered = finalCategories.filter((c: any) => c.types.length > 0);
    }
    
    finalFiltered.sort((a: any, b: any) => {
      const aHasStock = a.items_stocked > 0;
      const bHasStock = b.items_stocked > 0;
      if (aHasStock !== bHasStock) return aHasStock ? -1 : 1;
      if (a.cat_soonest_stamp !== b.cat_soonest_stamp) return a.cat_soonest_stamp - b.cat_soonest_stamp;
      return a.name.localeCompare(b.name);
    });

    setCategories(finalFiltered);

    // FRONT LINE: Always load favorites from an UNFILTERED query so the belt
    // is never affected by cabinet or expiry filters — it's a global quick-access rail.
    const favRows = await db.getAllAsync<any>(`
      SELECT it.id, it.name, it.interaction_count, it.unit_type,
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
  }, [db, filterCabinetId, filterExpiryMode, searchQuery]);

  useFocusEffect(useCallback(() => { load(); }, [filterCabinetId, filterExpiryMode, searchQuery]));

  const toggleCategory = (id: number) => {
    setExpandedCatIds(prev => prev.has(id) ? new Set() : new Set([id]));
  };

  const toggleType = (id: number) => {
    setExpandedTypeIds(prev => prev.has(id) ? new Set() : new Set([id]));
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

  const handleMoveRequest = (inv: any, type: any) => {
    // Filter to same cabinet type, excluding the current cabinet
    const validDests = cabinets.filter(
      (c: any) => c.cabinet_type === (inv.cab_type || 'standard') && c.id !== inv.cabinet_id
    );
    if (validDests.length === 0) return; // No valid destinations — button should not have been shown
    setMoveBatch(inv);
    setMoveType(type);
    setMoveQty(inv.quantity); // Default to full batch
    setMoveDestCabId(validDests[0].id);
    setMoveDestCabinets(validDests);
    setShowMoveCabinetPicker(false);
    setShowMoveModal(true);
  };

  const handleCreateCabinet = async () => {
    if (!inlineCabName.trim()) return;

    if (cabinets.length >= limits.cabinets && !hasFullAccess) {
      checkEntitlement('CABINET_LIMIT');
      return;
    }

    const freezerCabCount = cabinets.filter((c: any) => c.cabinet_type === 'freezer').length;
    if (inlineCabType === 'freezer' && freezerCabCount >= limits.freezer_cabs && !hasFullAccess) {
      checkEntitlement('FREEZER_CABINET_LIMIT');
      return;
    }

    await db.runAsync('INSERT INTO Cabinets (name, location, cabinet_type) VALUES (?, ?, ?)', [inlineCabName.trim(), inlineCabLoc.trim(), inlineCabType]);
    
    setShowInlineAddCabinet(false);
    setInlineCabName('');
    setInlineCabLoc('');
    setInlineCabType('standard');
    
    load();
  };

  const handleCreateCategory = async () => {
    if (!inlineCatName.trim()) return;
    if (categories.length >= limits.categories && !hasFullAccess) {
      checkEntitlement('CATEGORY_LIMIT');
      return;
    }
    await db.runAsync('INSERT INTO Categories (name, icon, is_mess_hall) VALUES (?, ?, ?)', [inlineCatName.trim(), 'box', inlineCatIsMessHall ? 1 : 0]);
    setShowInlineAddCategory(false);
    setInlineCatName('');
    setInlineCatIsMessHall(true);
    load();
  };

  const handleConfirmMove = async () => {
    if (!moveBatch || !moveDestCabId) return;
    setShowMoveModal(false);

    const now = new Date();
    const entryMonth = now.getMonth() + 1;
    const entryYear = now.getFullYear();
    const isFullMove = moveQty >= moveBatch.quantity;

    if (isFullMove) {
      // Case A: In-record update — update cabinet ID ONLY.
      // We preserve the original entry_month/year to maintain FIFO and Freezer age integrity.
      await db.runAsync(
        'UPDATE Inventory SET cabinet_id = ? WHERE id = ?',
        [moveDestCabId, moveBatch.id]
      );
    } else {
      // Case B: Split — reduce source quantity, create new record at destination inheriting original dates.
      await db.execAsync(
        `BEGIN TRANSACTION;
         UPDATE Inventory SET quantity = quantity - ${moveQty} WHERE id = ${moveBatch.id};
         INSERT INTO Inventory (item_type_id, quantity, size, expiry_month, expiry_year, entry_month, entry_year, cabinet_id, batch_intel)
           VALUES (
             ${moveBatch.item_type_id ?? moveType.id},
             ${moveQty},
             '${moveBatch.size ?? ''}',
             ${moveBatch.expiry_month ?? 'NULL'},
             ${moveBatch.expiry_year ?? 'NULL'},
             ${moveBatch.entry_month},
             ${moveBatch.entry_year},
             ${moveDestCabId},
             ${moveBatch.batch_intel ? `'${moveBatch.batch_intel.replace(/'/g, "''")}'` : 'NULL'}
           );
         COMMIT;`
      );
    }

    await markModified(db);
    const destName = moveDestCabinets.find(c => c.id === moveDestCabId)?.name ?? 'DESTINATION';
    triggerFeedback(`${moveQty} × ${moveType.name} → ${destName.toUpperCase()}`);
    load();
  };

  const handleFavoriteAction = async (type: any) => {
    // Live DB lookup — fetch full context needed for navigation and flash
    const soonest = await db.getFirstAsync<any>(`
      SELECT inv.id, inv.quantity, inv.size, inv.expiry_month, inv.expiry_year,
             inv.entry_month, inv.entry_year, inv.cabinet_id, inv.batch_intel,
             cab.name as cab_name, cab.location as cab_location, cab.cabinet_type as cab_type,
             it.category_id, it.unit_type
        FROM Inventory inv
        LEFT JOIN Cabinets cab ON inv.cabinet_id = cab.id
        LEFT JOIN ItemTypes it ON inv.item_type_id = it.id
       WHERE inv.item_type_id = ?
       ORDER BY 
         CASE WHEN inv.expiry_year IS NULL THEN 1 ELSE 0 END,
         inv.expiry_year ASC, inv.expiry_month ASC
       LIMIT 1
    `, [type.id]);

    if (soonest.quantity === 1) {
      setDeleteTarget(type); setDeleteBatch(soonest); setShowDeleteModal(true);
    } else {
      setConfirmTarget(type); setConfirmBatch(soonest); setShowConfirmModal(true);
    }
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
    if (remaining <= 0) return '#f43f5e';
    if (remaining < 4) return '#f97316';
    if (remaining < 7) return '#fde047';
    return '#22c55e';
  };

  const formatMonth = (m: any) => m ? m.toString().padStart(2, '0') : '--';

  const getUrgencyPhrasing = (m: number | null, y: number | null, isHeader = false, customSize = 12) => {
    if (!m || !y) return null;
    const now = new Date();
    const remaining = (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1));
    const rawColor = getStatusColor(m, y);
    const color = rawColor;
    
    const isExpired = remaining < 0;
    const label = isExpired ? "expired " : "expires ";
    const abs = Math.abs(remaining);
    
    let timeText = "";
    if (isExpired) {
      timeText = `${abs} ${abs === 1 ? 'month' : 'months'} ago`;
    } else if (remaining === 0) {
      timeText = 'THIS MONTH';
    } else {
      timeText = `${remaining} ${remaining === 1 ? 'month' : 'months'}`;
    }
    
    return (
      <Text style={{color: '#e2e8f0', fontSize: customSize, fontWeight: 'bold'}}>
        {label}
        <Text style={{ color }}>{timeText}</Text>
      </Text>
    );
  };

  const getFreezerUrgency = (inv: any, type: any) => {
    const now = new Date();
    const ageMonths = (now.getFullYear() - inv.entry_year) * 12 + ((now.getMonth() + 1) - inv.entry_month);
    const limit = type.freeze_months ?? 6;
    const remaining = limit - ageMonths;
    
    const rawColor = remaining <= 0 ? '#f43f5e' : remaining < 4 ? '#f97316' : remaining < 7 ? '#fde047' : '#22c55e';
    const color = rawColor;

    const abs = Math.abs(remaining);
    const label = remaining <= 0 ? (remaining === 0 ? "expires " : "expired ") : "expires ";
    
    let timeText = "";
    if (remaining < 0) {
      timeText = `${abs} ${abs === 1 ? 'month' : 'months'} ago`;
    } else if (remaining === 0) {
      timeText = 'THIS MONTH';
    } else {
      timeText = `${remaining} ${remaining === 1 ? 'month' : 'months'}`;
    }

    return (
      <Text style={{color: '#94a3b8', fontSize: 10, fontWeight: 'bold', marginLeft: 8}}>
        {label}
        <Text style={{color}}>{timeText}</Text>
      </Text>
    );
  };

  const getBatchStatusColor = (inv: any, type: any) => {
    if (inv.cab_type === 'freezer') {
      const now = new Date();
      const ageMonths = (now.getFullYear() - inv.entry_year) * 12 + ((now.getMonth() + 1) - inv.entry_month);
      const limit = type.freeze_months ?? 6;
      const remaining = limit - ageMonths;
      return remaining <= 0 ? '#f43f5e' : remaining < 4 ? '#f97316' : remaining < 7 ? '#fde047' : '#22c55e';
    }
    return getStatusColor(inv.expiry_month, inv.expiry_year);
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
    const isExpanded = expandedCatIds.has(cat.id);
    const isEmpty = !cat.types || cat.types.length === 0;
    
    // Pre-calculate Command Strip states to prevent render flicker
    const itemsWithStock = cat.types?.filter((t: any) => t.items.length > 0) || [];
    const canToggleItems = isExpanded && itemsWithStock.length > 0;
    const isAllExpanded = canToggleItems && itemsWithStock.every((t: any) => expandedTypeIds.has(t.id));

    return (
      <View style={{ marginBottom: 16 }}>
        <TouchableOpacity 
          activeOpacity={1} 
          style={[
            styles.categoryCard, 
            isExpanded && styles.categoryCardExpanded,
            cat.is_mess_hall && styles.messHallCard,
            { 
              marginBottom: 0,
              paddingBottom: isExpanded ? 20 : 16, // Extra stability for expanded state
              borderLeftWidth: 8,
              borderLeftColor: (isExpanded || isEmpty) ? 'transparent' : getStatusColor(cat.soonest_month, cat.soonest_year)
            }
          ]}
          onPress={() => toggleCategory(cat.id)}
          testID={`category-card-${cat.name.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {/* TIER 1: IDENTITY & CONTROLS */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <MaterialCommunityIcons 
              name={isExpanded ? "chevron-down" : "menu-right"} 
              size={24} 
              color="#3b82f6" 
              style={{ marginLeft: -10, marginRight: 2, opacity: isEmpty ? 0.3 : 1 }} 
            />
            <Text style={[styles.categoryTitle, { flex: 1 }]} numberOfLines={1}>{cat.name}</Text>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {canToggleItems && (
                <TouchableOpacity 
                   onPress={() => bulkToggleTypes(cat, !isAllExpanded)} 
                   style={{paddingHorizontal: 4, paddingVertical: 0}}
                   testID={`toggle-all-items-in-${cat.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                   <MaterialCommunityIcons 
                     name={isAllExpanded ? "unfold-less-horizontal" : "unfold-more-horizontal"} 
                     size={20} 
                     color="#3b82f6" 
                   />
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#3b82f6', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(59, 130, 246, 0.1)', marginRight: -4 }} 
                onPress={() => router.push({ pathname: '/add', params: { categoryId: cat.id, isNewType: '1' } })}
                testID={`add-new-item-to-${cat.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <MaterialCommunityIcons name="plus" size={16} color="#3b82f6" />
              </TouchableOpacity>
            </View>
          </View>

          {/* TIER 2: LOGISTICAL OVERVIEW (Shown only when collapsed) */}
          {!isExpanded && (
            <View style={styles.categorySummaryRow}>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                {cat.total_qty > 0 ? (
                  <>
                    <Text style={{color: '#94a3b8', fontSize: 10, fontWeight: 'bold'}}>{cat.total_qty} {cat.total_qty === 1 ? 'ITEM' : 'ITEMS'}</Text>
                    <Text style={{color: '#334155', marginHorizontal: 4}}>•</Text>
                    <Text style={{color: '#94a3b8', fontSize: 10, fontWeight: 'bold'}}>{cat.batch_count} {cat.batch_count === 1 ? 'BATCH' : 'BATCHES'}</Text>
                    <Text style={{color: '#334155', marginHorizontal: 4}}>•</Text>
                    <Text style={{color: '#94a3b8', fontSize: 10, fontWeight: 'bold'}}>{cat.site_count} {cat.site_count === 1 ? 'SITE' : 'SITES'}</Text>
                  </>
                ) : (
                  <Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold'}}>NO STOCK STORED</Text>
                )}
              </View>
              {cat.total_qty > 0 && cat.soonest_month && cat.soonest_year && (
                <View>{getUrgencyPhrasing(cat.soonest_month, cat.soonest_year, true, 11)}</View>
              )}
            </View>
          )}
        </TouchableOpacity>


        {isExpanded && cat.types.map((type: any) => {
          const hasItems = type.items.length > 0;
          const isTypeExpanded = expandedTypeIds.has(type.id);
          const uniqueSites = Array.from(new Set(type.items.map((it: any) => it.cab_name || 'Global'))).length;
          const totalItems = type.items.reduce((acc: number, it: any) => acc + (it.quantity || 0), 0);
          
          return (
            <View key={type.id} style={styles.typeBlock}>
              <TouchableOpacity 
                style={[
                  styles.typeHeader, 
                  { 
                    borderLeftWidth: 6, 
                    borderLeftColor: (isTypeExpanded || !hasItems) ? 'transparent' : getStatusColor(type.soonest_month, type.soonest_year),
                    marginLeft: -6,
                    paddingLeft: 6
                  }
                ]} 
                activeOpacity={1} 
                onPress={() => hasItems && toggleType(type.id)}
                testID={`type-header-${type.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40 }}>
                   <View style={[{flexDirection: 'row', alignItems: 'center', flex: 1}, !hasItems && {opacity: 0.5}]}>
                      <MaterialCommunityIcons name={isTypeExpanded ? "chevron-down" : "menu-right"} size={22} color="#3b82f6" style={{marginLeft: -4, marginRight: 2, opacity: hasItems ? 1 : 0}} />
                      <Text style={[styles.typeTitle, { flex: 1, marginLeft: 0 }]} numberOfLines={1}>{type.name}</Text>
                   </View>
                   
                   {!isTypeExpanded && type.tactical_total ? (
                      <Text style={[styles.totalLabel, { marginRight: 12, fontSize: 13, color: '#3b82f6', fontWeight: 'bold' }]}>{type.tactical_total}</Text>
                   ) : null}
                    
                   <Link href={{ pathname: "/add", params: { typeId: type.id, categoryId: cat.id, inheritedCabinetId: filterCabinetId ?? undefined } }} asChild>
                      <TouchableOpacity 
                        style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#3b82f6', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(59, 130, 246, 0.1)', marginRight: 0 }} 
                        testID={`add-btn-${type.name.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <MaterialCommunityIcons name="plus" size={16} color="#3b82f6" />
                      </TouchableOpacity>
                   </Link>
                </View>

                {/* TIER 2: LOGISTICAL BRIEFING (Shown only when collapsed) */}
                {!isTypeExpanded && hasItems && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 22, marginTop: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{color: '#94a3b8', fontSize: 10, fontWeight: 'bold'}}>{totalItems} {totalItems === 1 ? 'ITEM' : 'ITEMS'}</Text>
                      <Text style={{color: '#334155', marginHorizontal: 4}}>•</Text>
                      <Text style={{color: '#94a3b8', fontSize: 10, fontWeight: 'bold'}}>{type.items.length} {type.items.length === 1 ? 'BATCH' : 'BATCHES'}</Text>
                      <Text style={{color: '#334155', marginHorizontal: 4}}>•</Text>
                      <Text style={{color: '#94a3b8', fontSize: 10, fontWeight: 'bold'}}>{uniqueSites} {uniqueSites === 1 ? 'SITE' : 'SITES'}</Text>
                    </View>
                    {type.soonest_month && type.soonest_year && (
                      <View>{getUrgencyPhrasing(type.soonest_month, type.soonest_year, false, 11)}</View>
                    )}
                  </View>
                )}
              </TouchableOpacity>

              {isTypeExpanded && hasItems && (
                <>
                  {type.items.map((inv: any) => (
                    <View 
                      key={inv.id} 
                      ref={(r) => { batchRefs.current[inv.id] = r; }} 
                      style={[
                        styles.inventoryRow,
                        inv.cab_type === 'freezer' && { backgroundColor: '#1d4f87', borderBottomColor: '#2b63a3' },
                        { borderLeftWidth: 6, borderLeftColor: getBatchStatusColor(inv, type) }
                      ]}
                      testID={`batch-${type.name.toLowerCase().replace(/\s+/g, '-')}-${inv.id}`}
                    >
                      <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4}}>
                         <Text style={{color: '#60a5fa', fontSize: 12, fontWeight: 'bold'}}>{inv.cab_name || 'Global'} • {inv.cab_location || 'Storage'}</Text>
                      </View>
                      {(inv.batch_intel || inv.supplier || inv.product_range) ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8, flexWrap: 'wrap' }}>
                          <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: 'bold' }}>•</Text>
                          {inv.supplier && (
                            <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: 'bold' }}>
                              {inv.supplier.toUpperCase()}
                            </Text>
                          )}
                          {inv.product_range && (
                            <Text style={{ color: '#60a5fa', fontSize: 10, fontWeight: 'bold' }}>
                              [{inv.product_range.toUpperCase()}]
                            </Text>
                          )}
                          {inv.batch_intel && (
                            <Text style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic' }}>
                              {inv.batch_intel}
                            </Text>
                          )}
                        </View>
                      ) : null}
                      <View style={styles.rowMain}>
                        {inv.id === flashBatchId ? (
                          <Animated.View style={[styles.qtyBadge, { backgroundColor: flashAnim.interpolate({ inputRange: [0, 1], outputRange: ['#1e293b', '#166534'] }), borderWidth: 1.5, borderColor: flashAnim.interpolate({ inputRange: [0, 1], outputRange: ['transparent', '#22c55e'] }) }]}>
                            <Text style={styles.qtyText} testID="qty-text">{inv.quantity}</Text>
                          </Animated.View>
                        ) : (
                          inv.cab_type === 'freezer' ? (
                            <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                              <MaterialCommunityIcons name="snowflake-variant" size={36} color="#3b82f6" style={{ position: 'absolute', opacity: 0.3 }} />
                              <View style={{ backgroundColor: '#1e293b', width: 25, height: 25, borderRadius: 12.5, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                                <Text style={styles.qtyText} testID="qty-text">{inv.quantity}</Text>
                              </View>
                            </View>
                          ) : (
                            <View style={styles.qtyBadge}>
                              <Text style={styles.qtyText} testID="qty-text">{inv.quantity}</Text>
                            </View>
                          )
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
                          {cabinets.filter((c: any) => c.cabinet_type === (inv.cab_type || 'standard') && c.id !== inv.cabinet_id).length > 0 && (
                            <TouchableOpacity
                              onPress={() => handleMoveRequest(inv, type)}
                              style={[styles.actionBtn, {backgroundColor: '#d97706'}]}
                              testID={`move-batch-${inv.id}`}
                            >
                              <MaterialCommunityIcons name="transfer" size={16} color="white" />
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity onPress={() => handleDeductRequest(inv, type)} style={[styles.actionBtn, {backgroundColor: '#ef4444'}]}><MaterialCommunityIcons name="minus" size={16} color="white" /></TouchableOpacity>
                          <TouchableOpacity onPress={() => addQuantity(inv.id, type.id)} style={[styles.actionBtn, {backgroundColor: '#22c55e'}]}><MaterialCommunityIcons name="plus" size={16} color="white" /></TouchableOpacity>
                        </View>
                      </View>
                      <View style={[styles.rowSub, { justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 4 }]}>
                        {inv.cab_type === 'freezer' ? (
                          <>
                            <View style={{flexDirection:'row',alignItems:'center',gap:4}}>
                              <Text style={styles.subText}>FRZ <Text style={{color: '#f8fafc'}}>{formatMonth(inv.entry_month)}/{String(inv.entry_year).slice(-2)}</Text></Text>
                              <Text style={styles.divider}>|</Text>
                              <Text style={styles.subText}>LIM <Text style={{color: '#f8fafc'}}>{type.freeze_months ?? 6}m</Text></Text>
                            </View>
                            {getFreezerUrgency(inv, type)}
                          </>
                        ) : (
                          <>
                            <Text style={styles.subText}>STORED {formatMonth(inv.entry_month)}/{inv.entry_year}</Text>
                            {inv.expiry_month ? getUrgencyPhrasing(inv.expiry_month, inv.expiry_year, false) : <Text style={styles.subText}>EXPIRY: N/A</Text>}
                          </>
                        )}
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
        <TouchableOpacity style={styles.logisticsBtn} testID="logistics-btn" onPress={() => { if (checkEntitlement('LOGISTICS')) router.push('/logistics'); }}>
          <MaterialCommunityIcons name="truck-delivery" size={26} color="#22c55e" />
        </TouchableOpacity>
        <TouchableOpacity style={StyleSheet.flatten([styles.logisticsBtn, { left: 56 }])} testID="recipes-btn" onPress={() => { if (checkEntitlement('RECIPES')) router.push('/recipes'); }}>
          <MaterialCommunityIcons name="chef-hat" size={26} color="#fbbf24" />
        </TouchableOpacity>
        <View style={{alignItems: 'center'}}>
          <Text style={styles.headerTitle} testID="app-header-title">War Cabinet</Text>
          <TouchableOpacity testID="rank-badge-pill" onPress={() => router.push('/catalog?tab=rank')} style={styles.rankPill}>
            <MaterialCommunityIcons name="shield-star" size={10} color={isPremium ? "#fbbf24" : "#94a3b8"} style={{marginRight: 4}} />
            <Text style={[styles.rankPillText, isPremium && {color: '#fbbf24'}]}>
              {isPremium ? (isGeneral ? 'RANK: GENERAL' : 'RANK: SERGEANT') : (isCadet ? 'RANK: CADET' : 'RANK: PRIVATE')}
            </Text>
          </TouchableOpacity>
        </View>
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

      {isTrialActive && !isPremium && (
        <TouchableOpacity onPress={() => router.push('/catalog?tab=rank')} style={styles.trialBanner} activeOpacity={0.85}>
          <MaterialCommunityIcons name="clock-alert-outline" size={14} color="#fbbf24" style={{ marginRight: 6 }} />
          <Text style={styles.trialBannerText}>CADET EVALUATION — {trialLabel} remaining</Text>
          <Text style={styles.trialBannerCta}>PROMOTION HUB ›</Text>
        </TouchableOpacity>
      )}

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
           <TouchableOpacity style={styles.iconFilterBtn} onPress={() => setShowFilterModal(true)}><MaterialCommunityIcons name="warehouse" size={22} color={filterCabinetId ? "#3b82f6" : "#475569"} /></TouchableOpacity>
           <TouchableOpacity style={styles.iconFilterBtn} onPress={() => setShowExpiryModal(true)}><MaterialCommunityIcons name={filterExpiryMode === 'ALL' ? "calendar-search" : "calendar-alert"} size={22} color={filterExpiryMode === 'ALL' ? "#475569" : "#eab308"} /></TouchableOpacity>
           <View style={{ width: 1, backgroundColor: '#334155', height: 24, marginHorizontal: 4 }} />
           <TouchableOpacity 
             style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#3b82f6', alignItems: 'center', justifyContent: 'center', marginLeft: 8, marginRight: 8, backgroundColor: 'rgba(59, 130, 246, 0.1)' }} 
             onPress={() => setShowDeploymentHub(true)}
             testID="global-deploy-btn"
           >
             <MaterialCommunityIcons name="plus" size={14} color="#3b82f6" />
           </TouchableOpacity>
        </View>
      </View>

      {/* ─── RESERVED FILTER SLOT (Fixed Height to prevent jump) ─── */}
      <View style={{ 
        height: 38, 
        flexDirection: 'row', 
        alignItems: 'center', 
        marginHorizontal: 16, 
        marginBottom: 4 
      }}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={{ alignItems: 'center', gap: 6, height: 38 }}
        >
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
              '<3M':        { label: '1-3 MONTHS', color: '#eab308', bg: '#3f350f', icon: 'calendar-clock' },
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
        </ScrollView>
      </View>

      <FlatList
        ref={flatRef}
        data={categories}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderCategory}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 0, paddingBottom: 100 }}
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
            <Text style={[styles.modalItemText, filterExpiryMode === 'EXPIRED' && styles.modalItemTextActive]}>EXPIRED</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modalItem, filterExpiryMode === 'THIS_MONTH' && styles.modalItemActive]} onPress={() => { setFilterExpiryMode('THIS_MONTH'); setShowExpiryModal(false); }}>
            <Text style={[styles.modalItemText, filterExpiryMode === 'THIS_MONTH' && styles.modalItemTextActive]}>EXPIRING THIS MONTH</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modalItem, filterExpiryMode === '<3M' && styles.modalItemActive]} onPress={() => { setFilterExpiryMode('<3M'); setShowExpiryModal(false); }}>
            <Text style={[styles.modalItemText, filterExpiryMode === '<3M' && styles.modalItemTextActive]}>EXPIRING SOON (1-3 MONTHS)</Text>
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
               {deleteBatch.batch_intel && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <MaterialCommunityIcons name="information" size={14} color="#3b82f6" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>{deleteBatch.batch_intel.toUpperCase()}</Text>
                </View>
              )}
               {deleteBatch.size && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <MaterialCommunityIcons name="weight" size={14} color="#64748b" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>
                    {deleteBatch.size}{deleteTarget.unit_type === 'weight' ? 'g' : deleteTarget.unit_type === 'volume' ? 'ml' : ' Units'}
                  </Text>
                </View>
              )}
              {deleteBatch.cab_type === 'freezer' && deleteBatch.entry_month && deleteBatch.entry_year && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="snowflake" size={14} color="#3b82f6" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>
                    FROZEN {String(deleteBatch.entry_month).padStart(2,'0')}/{deleteBatch.entry_year}
                  </Text>
                </View>
              )}
              {deleteBatch.cab_type !== 'freezer' && deleteBatch.expiry_month && deleteBatch.expiry_year && (
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

      {/* ─── MOVE BATCH MODAL ─── */}
      <Modal visible={showMoveModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>TRANSFER STOCK</Text>
          <Text style={{color: '#f8fafc', textAlign: 'center', fontSize: 16, fontWeight: 'bold', marginBottom: 4}}>{moveType?.name}</Text>
          <Text style={{color: '#64748b', textAlign: 'center', fontSize: 11, marginBottom: 12}}>
            {moveBatch?.cab_name?.toUpperCase()} → {(moveDestCabinets.find(c => c.id === moveDestCabId)?.name ?? 'DESTINATION').toUpperCase()}
          </Text>


          {/* Batch Detail Card */}
          {moveBatch && (
            <View style={{ backgroundColor: '#0f172a', borderRadius: 8, padding: 12, marginBottom: 16, width: '100%' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <MaterialCommunityIcons name="warehouse" size={14} color="#3b82f6" style={{ marginRight: 8 }} />
                <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>
                  {moveBatch.cab_name?.toUpperCase() || 'UNKNOWN'}
                  {moveBatch.cab_location ? ` • ${moveBatch.cab_location.toUpperCase()}` : ''}
                </Text>
              </View>
              {moveBatch.batch_intel ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <MaterialCommunityIcons name="information" size={14} color="#3b82f6" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>{moveBatch.batch_intel.toUpperCase()}</Text>
                </View>
              ) : null}
              {moveBatch.size ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <MaterialCommunityIcons name="weight" size={14} color="#64748b" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>
                    {moveBatch.size}{moveType?.unit_type === 'weight' ? 'g' : moveType?.unit_type === 'volume' ? 'ml' : ' Units'}
                  </Text>
                </View>
              ) : null}
              {moveBatch.cab_type === 'freezer' && moveBatch.entry_month && moveBatch.entry_year ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="snowflake" size={14} color="#60a5fa" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>
                    FROZEN {String(moveBatch.entry_month).padStart(2, '0')}/{moveBatch.entry_year}
                  </Text>
                </View>
              ) : moveBatch.expiry_month && moveBatch.expiry_year ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="calendar-clock" size={14} color="#64748b" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>
                    EXPIRES {String(moveBatch.expiry_month).padStart(2, '0')}/{moveBatch.expiry_year}
                  </Text>
                </View>
              ) : null}
            </View>
          )}

          {/* Quantity Selector */}
          {moveBatch && moveBatch.quantity > 1 && (
            <View style={{width: '100%', marginBottom: 20}}>
              <Text style={{color: '#94a3b8', fontSize: 10, fontWeight: 'bold', marginBottom: 10, textAlign: 'center'}}>QUANTITY TO MOVE</Text>
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20}}>
                <TouchableOpacity
                  onPress={() => setMoveQty(q => Math.max(1, q - 1))}
                  style={{width: 40, height: 40, backgroundColor: '#334155', borderRadius: 8, alignItems: 'center', justifyContent: 'center'}}
                >
                  <MaterialCommunityIcons name="minus" size={20} color="white" />
                </TouchableOpacity>
                <View style={{alignItems: 'center'}}>
                  <Text style={{color: '#f8fafc', fontSize: 28, fontWeight: 'bold', minWidth: 50, textAlign: 'center'}}>{moveQty}</Text>
                  <Text style={{color: '#64748b', fontSize: 10}}>of {moveBatch?.quantity}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setMoveQty(q => Math.min(moveBatch.quantity, q + 1))}
                  style={{width: 40, height: 40, backgroundColor: '#334155', borderRadius: 8, alignItems: 'center', justifyContent: 'center'}}
                >
                  <MaterialCommunityIcons name="plus" size={20} color="white" />
                </TouchableOpacity>
              </View>
              {moveQty < moveBatch?.quantity ? (
                <Text style={{color: '#64748b', textAlign: 'center', fontSize: 10, marginTop: 8}}>
                  {moveBatch.quantity - moveQty} {moveBatch.quantity - moveQty === 1 ? 'item' : 'items'} will remain in {moveBatch.cab_name} after the move
                </Text>
              ) : (
                <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8, gap: 6}}>
                  <MaterialCommunityIcons name="alert" size={13} color="#f59e0b" />
                  <Text style={{color: '#f59e0b', textAlign: 'center', fontSize: 10, fontWeight: 'bold'}}>
                    No stock will remain in {moveBatch.cab_name} after this transfer.
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Static Quantity Display for single-unit batches */}
          {moveBatch && moveBatch.quantity === 1 && (
            <View style={{width: '100%', marginBottom: 24, alignItems: 'center'}}>
              <Text style={{color: '#94a3b8', fontSize: 10, fontWeight: 'bold', marginBottom: 12, textAlign: 'center'}}>QUANTITY TO MOVE</Text>
              <View style={{backgroundColor: '#1e293b', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#334155', marginBottom: 12}}>
                <Text style={{color: '#f8fafc', fontSize: 24, fontWeight: 'bold'}}>1 UNIT</Text>
              </View>
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(245, 158, 11, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6}}>
                <MaterialCommunityIcons name="alert" size={14} color="#f59e0b" />
                <Text style={{color: '#f59e0b', textAlign: 'center', fontSize: 11, fontWeight: 'bold'}}>
                  FULL TRANSFER: No stock will remain in {moveBatch.cab_name}.
                </Text>
              </View>
            </View>
          )}


          {/* Cabinet Selector (Add-Batch Style) */}
          <View style={{width: '100%', marginBottom: 20}}>
            <Text style={{color: '#94a3b8', fontSize: 10, fontWeight: 'bold', marginBottom: 8, textAlign: 'center'}}>DESTINATION CABINET</Text>
            <TouchableOpacity
              onPress={() => setShowMoveCabinetPicker(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: '#1e293b', borderRadius: 8, borderWidth: 1, borderColor: '#334155',
                paddingHorizontal: 14, paddingVertical: 12,
              }}
            >
              <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
                {moveDestCabinets.find((c: any) => c.id === moveDestCabId)?.cabinet_type === 'freezer' && (
                  <MaterialCommunityIcons name="snowflake" size={14} color="#60a5fa" style={{marginRight: 8}} />
                )}
                <View>
                  <Text style={{color: '#f8fafc', fontSize: 14, fontWeight: 'bold'}}>
                    {moveDestCabinets.find((c: any) => c.id === moveDestCabId)?.name ?? 'Select...'}
                  </Text>
                  {moveDestCabinets.find((c: any) => c.id === moveDestCabId)?.location ? (
                    <Text style={{color: '#64748b', fontSize: 10}}>
                      {moveDestCabinets.find((c: any) => c.id === moveDestCabId)?.location}
                    </Text>
                  ) : null}
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.confirmBtn, {backgroundColor: '#d97706'}]}
            onPress={handleConfirmMove}
            testID="confirm-move-btn"
          >
            <MaterialCommunityIcons name="transfer" size={18} color="white" style={{marginRight: 8}} />
            <Text style={{color: 'white', fontWeight: 'bold'}}>CONFIRM TRANSFER</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelLink} onPress={() => setShowMoveModal(false)}>
            <Text style={{color: '#64748b'}}>CANCEL</Text>
          </TouchableOpacity>
        </View></View>
      </Modal>

      {/* ─── SECONDARY CABINET PICKER MODAL (Add-Batch Style) ─── */}
      <Modal visible={showMoveCabinetPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Destination Site</Text>
            {moveDestCabinets.map(cab => (
              <TouchableOpacity 
                key={cab.id} 
                style={[styles.modalItem, moveDestCabId === cab.id && styles.modalItemActive]}
                onPress={() => {
                  setMoveDestCabId(cab.id);
                  setShowMoveCabinetPicker(false);
                }}
              >
                <View style={{flex: 1}}>
                  <Text style={[styles.modalItemText, moveDestCabId === cab.id && styles.modalItemTextActive]}>{cab.name}</Text>
                  <Text style={{color: '#64748b', fontSize: 12}}>{cab.location}</Text>
                </View>
                {moveDestCabId === cab.id && <MaterialCommunityIcons name="check" size={20} color="#3b82f6" />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowMoveCabinetPicker(false)}>
              <Text style={styles.modalCloseText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>


      <Modal visible={showConfirmModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>CONFIRM USE</Text>
          <Text style={{color: '#f8fafc', textAlign: 'center', fontSize: 16, fontWeight: 'bold', marginBottom: 12}}>{confirmTarget?.name}</Text>
          {confirmBatch && (
            <View style={{ backgroundColor: '#0f172a', borderRadius: 8, padding: 12, marginBottom: 16, width: '100%' }}>
               {confirmBatch.batch_intel && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <MaterialCommunityIcons name="information" size={14} color="#3b82f6" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>{confirmBatch.batch_intel.toUpperCase()}</Text>
                </View>
              )}
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
                  <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>
                    {confirmBatch.size}{confirmTarget.unit_type === 'weight' ? 'g' : confirmTarget.unit_type === 'volume' ? 'ml' : ' Units'}
                  </Text>
                </View>
              )}
              {confirmBatch.cab_type === 'freezer' && confirmBatch.entry_month && confirmBatch.entry_year && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="snowflake" size={14} color="#3b82f6" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>
                    FROZEN {String(confirmBatch.entry_month).padStart(2,'0')}/{confirmBatch.entry_year}
                  </Text>
                </View>
              )}
              {confirmBatch.cab_type !== 'freezer' && confirmBatch.expiry_month && confirmBatch.expiry_year && (
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

      {/* INLINE ADD CABINET MODAL */}
      <Modal visible={showInlineAddCabinet} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>NEW STORAGE CABINET</Text>
            
            <View style={{ marginBottom: 16, width: '100%' }}>
              <Text style={styles.miniLabel}>CABINET NAME</Text>
              <TextInput style={styles.inputSmall} value={inlineCabName} onChangeText={setInlineCabName} placeholder="e.g. Garage Freezer" placeholderTextColor="#64748b" autoFocus />
            </View>

            <View style={{ marginBottom: 16, width: '100%' }}>
              <Text style={styles.miniLabel}>LOCATION</Text>
              <TextInput style={styles.inputSmall} value={inlineCabLoc} onChangeText={setInlineCabLoc} placeholder="e.g. Garage" placeholderTextColor="#64748b" />
            </View>

            <View style={{ marginBottom: 24, width: '100%' }}>
              <Text style={styles.miniLabel}>CABINET TYPE</Text>
              <View style={styles.unitChipRowMini}>
                <TouchableOpacity style={[styles.unitChip, inlineCabType === 'standard' && styles.unitChipActive]} onPress={() => setInlineCabType('standard')}><Text style={[styles.unitChipText, inlineCabType === 'standard' && styles.unitChipTextActive]}>Standard</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.unitChip, inlineCabType === 'freezer' && styles.unitChipActive]} onPress={() => { if (inlineCabType === 'freezer') setInlineCabType('standard'); else if (checkEntitlement('FREEZER')) setInlineCabType('freezer'); }}><Text style={[styles.unitChipText, inlineCabType === 'freezer' && styles.unitChipTextActive]}>Freezer</Text></TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleCreateCabinet}>
              <Text style={styles.saveText}>CREATE CABINET</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalClose} onPress={() => setShowInlineAddCabinet(false)}>
              <Text style={styles.modalCloseText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* DEPLOYMENT HUB MODAL */}
      <Modal visible={showDeploymentHub} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowDeploymentHub(false)}
        >
          <View style={[styles.modalContent, { paddingBottom: 32 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
              <MaterialCommunityIcons name="plus-box" size={20} color="#3b82f6" />
              <Text style={[styles.modalTitle, { marginBottom: 0 }]}>STRATEGIC DEPLOYMENT</Text>
            </View>

            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#1e3a8a' }}
              onPress={() => { setShowDeploymentHub(false); setShowInlineAddCategory(true); }}
            >
              <View style={{ backgroundColor: '#1e3a8a', padding: 10, borderRadius: 8, marginRight: 16 }}>
                <MaterialCommunityIcons name="folder-plus" size={24} color="#60a5fa" />
              </View>
              <View>
                <Text style={{ color: '#f8fafc', fontSize: 16, fontWeight: 'bold' }}>DEPLOY CATEGORY</Text>
                <Text style={{ color: '#64748b', fontSize: 12 }}>Establish a new tactical sector.</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#1e293b' }}
              onPress={() => { setShowDeploymentHub(false); setShowInlineAddCabinet(true); }}
            >
              <View style={{ backgroundColor: '#334155', padding: 10, borderRadius: 8, marginRight: 16 }}>
                <MaterialCommunityIcons name="warehouse" size={24} color="#94a3b8" />
              </View>
              <View>
                <Text style={{ color: '#f8fafc', fontSize: 16, fontWeight: 'bold' }}>DEPLOY CABINET</Text>
                <Text style={{ color: '#64748b', fontSize: 12 }}>Build a new storage or freezer site.</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.modalClose, { marginTop: 16 }]} onPress={() => setShowDeploymentHub(false)}>
              <Text style={styles.modalCloseText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* INLINE ADD CATEGORY MODAL */}
      <Modal visible={showInlineAddCategory} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>NEW CATEGORY</Text>
            
            <View style={{ marginBottom: 24, width: '100%' }}>
              <Text style={styles.miniLabel}>CATEGORY NAME</Text>
              <TextInput style={styles.inputSmall} value={inlineCatName} onChangeText={setInlineCatName} placeholder="e.g. Spices, Tinned Goods" placeholderTextColor="#64748b" autoFocus />
            </View>

            <View style={{ marginBottom: 24, width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#334155' }}>
              <View style={{flex: 1}}>
                <Text style={[styles.miniLabel, {marginBottom: 2}]}>MESS HALL COMPATIBLE</Text>
                <Text style={{color: '#64748b', fontSize: 10}}>Exclude this from recipe generation if it's for prepared meals.</Text>
              </View>
              <Switch 
                value={inlineCatIsMessHall} 
                onValueChange={setInlineCatIsMessHall}
                trackColor={{ false: "#334155", true: "#3b82f6" }}
                thumbColor={inlineCatIsMessHall ? "#ffffff" : "#94a3b8"}
              />
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleCreateCategory}>
              <Text style={styles.saveText}>CREATE CATEGORY</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalClose} onPress={() => setShowInlineAddCategory(false)}>
              <Text style={styles.modalCloseText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  filterPillRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingVertical: 6, gap: 8 },
  filterPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  filterPillText: { fontSize: 11, fontWeight: 'bold', letterSpacing: 0.5 },

  appHeader: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: '#1e293b', 
    paddingTop: Platform.OS === 'ios' ? 40 : 10, 
    paddingBottom: 15, 
    paddingHorizontal: 16, 
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: '#334155'
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc', textAlign: 'center' },
  headerSubtitle: { color: '#94a3b8', fontSize: 13, marginTop: 2, textAlign: 'center' },
  rankPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, marginTop: 6, borderWidth: 1, borderColor: '#334155' },
  rankPillText: { color: '#94a3b8', fontSize: 10, fontWeight: 'bold', letterSpacing: 0.5 },
  settingsBtn: { position: 'absolute', right: 16, bottom: 20 },
  briefingBtn: { position: 'absolute', right: 56, bottom: 20 },
  logisticsBtn: { position: 'absolute', left: 16, bottom: 20 },
  categoryCard: { backgroundColor: '#1e293b', borderRadius: 12, marginBottom: 16, overflow: 'hidden', padding: 16 },
  categoryCardExpanded: { paddingBottom: 20 },
  messHallCard: { backgroundColor: '#1e3a8a', borderColor: '#3b82f6', borderWidth: 1 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#334155' },
  categorySummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  categoryTitle: { fontSize: 20, color: '#f8fafc', fontWeight: 'bold' },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  typeBlock: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, backgroundColor: '#0f172a', borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  typeHeader: { flexDirection: 'column', alignItems: 'stretch', marginBottom: 8 },
  typeTitle: { color: '#e2e8f0', fontSize: 18, fontWeight: '600', marginLeft: 4 },
  addButton: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#3b82f6', borderRadius: 4 },
  addText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  actionPillBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#334155', justifyContent: 'center' },
  actionPillText: { color: '#3b82f6', fontSize: 11, fontWeight: 'bold', letterSpacing: 0.5 },
  addTypeBtnDirect: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  itemCountBadge: { backgroundColor: '#1e293b', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  emptyText: { color: '#64748b', fontStyle: 'italic', fontSize: 14, marginLeft: 16 },
  inventoryRow: { paddingTop: 8, paddingBottom: 12, paddingHorizontal: 12, backgroundColor: '#475569', borderRadius: 6, marginBottom: 8 },
  totalLabel: { fontSize: 13, color: '#3b82f6', fontWeight: 'bold' },
  rowMain: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  qtyBadge: { backgroundColor: '#1e293b', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  qtyText: { color: 'white', fontSize: 13, fontWeight: 'bold' },
  sizeText: { flex: 1, color: '#ffffff', fontSize: 15, fontWeight: 'bold' },
  actionsGroup: { flexDirection: 'row', gap: 6 },
  rowSub: { flexDirection: 'row', alignItems: 'center' },
  subText: { color: '#e2e8f0', fontSize: 10, fontWeight: 'bold', letterSpacing: 0.5 },
  divider: { color: '#94a3b8', marginHorizontal: 8, fontSize: 10, fontWeight: 'bold' },
  actionBtn: { padding: 6, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  commandStrip: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginHorizontal: 16, 
    marginTop: 8,
    marginBottom: 4, 
    backgroundColor: '#0f172a', 
    borderRadius: 8, 
    borderWidth: 1, 
    borderColor: '#334155', 
    paddingLeft: 12, 
    height: 48 
  },
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
  cancelLink: { marginTop: 20, alignItems: 'center' },
  trialBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1c1200', borderBottomWidth: 1, borderBottomColor: '#92400e', paddingHorizontal: 16, paddingVertical: 8 },
  trialBannerText: { flex: 1, color: '#fbbf24', fontSize: 11, fontWeight: 'bold', letterSpacing: 0.5 },
  trialBannerCta: { color: '#fbbf24', fontSize: 11, fontWeight: 'bold', opacity: 0.75 },
  miniLabel: { color: '#cbd5e1', fontSize: 12, fontWeight: 'bold', marginBottom: 4, paddingLeft: 4, textTransform: 'uppercase' },
  inputSmall: { flex: 1, backgroundColor: '#0f172a', color: '#f8fafc', borderRadius: 6, padding: 8, fontSize: 14, borderWidth: 1, borderColor: '#334155' },
  unitChipRowMini: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  unitChip: { flex: 1, paddingVertical: 6, marginHorizontal: 2, alignItems: 'center', borderRadius: 6, backgroundColor: '#1e293b' },
  unitChipActive: { backgroundColor: '#3b82f6' },
  unitChipText: { color: '#64748b', fontSize: 12, fontWeight: 'bold' },
  unitChipTextActive: { color: 'white' },
  saveButton: { backgroundColor: '#22c55e', padding: 18, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  saveText: { color: 'white', fontWeight: 'bold', fontSize: 18 }
});
