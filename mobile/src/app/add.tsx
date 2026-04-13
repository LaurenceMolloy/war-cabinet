import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Modal, Platform, Switch } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { markModified } from '../db/sqlite';
import { useBilling } from '../context/BillingContext';
import SUPPLIERS_DATA from '../data/suppliers.json';
import BRANDS_DATA from '../data/brands.json';

export default function AddInventoryScreen() {
  const { typeId, editBatchId, inheritedCabinetId, categoryId, isNewType } = useLocalSearchParams();
  const router = useRouter();
  const db = useSQLiteContext();
  const { isCadet, isPrivate, hasFullAccess, limits, checkEntitlement } = useBilling();

  const [quantity, setQuantity] = useState('1');
  const [size, setSize] = useState('');
  const [typeName, setTypeName] = useState('');
  
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  
  const [expiryMonth, setExpiryMonth] = useState(currentMonth.toString());
  const [expiryYear, setExpiryYear] = useState(currentYear.toString());
  const [customChips, setCustomChips] = useState<string[]>([]);
  const [unitType, setUnitType] = useState('weight');
  const [batchIntel, setBatchIntel] = useState('');
  const [supplier, setSupplier] = useState('');
  const [productRange, setProductRange] = useState('');
  const [suggestedTypeAheadSuppliers, setSuggestedTypeAheadSuppliers] = useState<string[]>([]);
  const [suggestedTypeAheadRanges, setSuggestedTypeAheadRanges] = useState<string[]>([]);
  const [supplierVocabulary, setSupplierVocabulary] = useState<string[]>([]);
  const [rangeVocabulary, setRangeVocabulary] = useState<string[]>([]);
  const [supplierCounts, setSupplierCounts] = useState<Record<string, number>>({});
  const [rangeCounts, setRangeCounts] = useState<Record<string, number>>({});
  const [showQuickAddType, setShowQuickAddType] = useState(false);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddUnit, setQuickAddUnit] = useState('weight');
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedQuickAddCat, setSelectedQuickAddCat] = useState<number | null>(null);
  const [quickAddFreezeMonths, setQuickAddFreezeMonths] = useState('');
  const [quickAddMinStock, setQuickAddMinStock] = useState('');
  const [quickAddMaxStock, setQuickAddMaxStock] = useState('');
  const [quickAddDefaultSize, setQuickAddDefaultSize] = useState('');
  const [quickAddSupplier, setQuickAddSupplier] = useState('');
  const [quickAddRange, setQuickAddRange] = useState('');
  const [quickAddDefaultCabinet, setQuickAddDefaultCabinet] = useState<number | null>(null);
  const [showAddCabinet, setShowAddCabinet] = useState(false);
  const [newCabName, setNewCabName] = useState('');
  const [newCabLoc, setNewCabLoc] = useState('');
  const [newCabType, setNewCabType] = useState<'standard' | 'freezer'>('standard');
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIsMessHall, setNewCatIsMessHall] = useState(true);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeCandidate, setMergeCandidate] = useState<any>(null);
  const [deferredSave, setDeferredSave] = useState<any>(null);
  const getUnitSuffix = (type: string) => {
    if (type === 'weight') return 'g';
    if (type === 'volume') return 'ml';
    if (type === 'count') return 'Units';
    return '';
  };

  const updateSupplierSuggestions = (val: string, segment: 'main' | 'quick') => {
    if (val.trim().length > 0) {
      const matches = supplierVocabulary
        .filter(s => s.toLowerCase().includes(val.toLowerCase()))
        .sort((a, b) => {
          const aLower = a.toLowerCase();
          const bLower = b.toLowerCase();
          const aStart = aLower.startsWith(val.toLowerCase());
          const bStart = bLower.startsWith(val.toLowerCase());
          if (aStart && !bStart) return -1;
          if (!aStart && bStart) return 1;
          
          const aCount = supplierCounts[aLower] || 0;
          const bCount = supplierCounts[bLower] || 0;
          if (aCount !== bCount) return bCount - aCount;

          return a.localeCompare(b);
        })
        .slice(0, 3);
      setSuggestedTypeAheadSuppliers(matches);
    } else {
      setSuggestedTypeAheadSuppliers([]);
    }
  };

  const updateRangeSuggestions = (val: string) => {
    if (val.trim().length > 0) {
      const matches = rangeVocabulary
        .filter(r => r.toLowerCase().includes(val.toLowerCase()))
        .sort((a, b) => {
          const aLower = a.toLowerCase();
          const bLower = b.toLowerCase();
          const aStart = aLower.startsWith(val.toLowerCase());
          const bStart = bLower.startsWith(val.toLowerCase());
          if (aStart && !bStart) return -1;
          if (!aStart && bStart) return 1;

          const aCount = rangeCounts[aLower] || 0;
          const bCount = rangeCounts[bLower] || 0;
          if (aCount !== bCount) return bCount - aCount;

          return a.localeCompare(b);
        })
        .slice(0, 3);
      setSuggestedTypeAheadRanges(matches);
    } else {
      setSuggestedTypeAheadRanges([]);
    }
  };

  const handlePurgeVocabulary = async (val: string, type: 'supplier' | 'range') => {
    // Instant UI feedback using functional state updates
    if (type === 'supplier') {
      setSuggestedTypeAheadSuppliers(prev => prev.filter(item => item !== val));
      setSupplierVocabulary(prev => prev.filter(s => s !== val));
    } else {
      setSuggestedTypeAheadRanges(prev => prev.filter(item => item !== val));
      setRangeVocabulary(prev => prev.filter(r => r !== val));
    }

    // Background Database Cleanup
    try {
      if (type === 'supplier') {
        await db.runAsync("UPDATE ItemTypes SET default_supplier = NULL WHERE default_supplier = ?", [val]);
        await db.runAsync("UPDATE Inventory SET supplier = NULL WHERE supplier = ?", [val]);
      } else {
        await db.runAsync("UPDATE ItemTypes SET default_product_range = NULL WHERE default_product_range = ?", [val]);
        await db.runAsync("UPDATE Inventory SET product_range = NULL WHERE product_range = ?", [val]);
      }
    } catch (e) {
      console.error("Purge failed in background", e);
    }
  };


  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  
  const [errorField, setErrorField] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [cabinets, setCabinets] = useState<any[]>([]);
  const [selectedCabinetId, setSelectedCabinetId] = useState<number | null>(null);
  const [showCabinetPicker, setShowCabinetPicker] = useState(false);
  const [showFreezeMonthPicker, setShowFreezeMonthPicker] = useState(false);
  const [showFreezeYearPicker, setShowFreezeYearPicker] = useState(false);
  const [freezeMonth, setFreezeMonth] = useState(currentMonth.toString());
  const [freezeYear, setFreezeYear] = useState(currentYear.toString());
  const [freezeLimit, setFreezeLimit] = useState('6');

  // Derived: is the currently selected cabinet a freezer?
  const selectedCabinet = cabinets.find(c => c.id === Number(selectedCabinetId));
  const isFreezerMode = selectedCabinet?.cabinet_type === 'freezer';

  useEffect(() => {
    async function loadData() {
      const typeRes = await db.getFirstAsync<{name: string, unit_type: string, default_size: string, default_cabinet_id: number | null, freeze_months: number | null, default_supplier: string | null, default_product_range: string | null}>('SELECT name, unit_type, default_size, default_cabinet_id, freeze_months, default_supplier, default_product_range FROM ItemTypes WHERE id = ?', [Number(typeId)]);
      if (typeRes) {
        setUnitType(typeRes.unit_type || 'weight');
        setTypeName(typeRes.name);
        if (typeRes.default_cabinet_id) setSelectedCabinetId(typeRes.default_cabinet_id);
        if (typeRes.freeze_months) setFreezeLimit(typeRes.freeze_months.toString());
      }

      const cabRows = await db.getAllAsync<any>('SELECT * FROM Cabinets');
      setCabinets(cabRows);

      // Load Vocab
      const dbSuppliers = await db.getAllAsync<{default_supplier: string}>("SELECT DISTINCT default_supplier FROM ItemTypes WHERE default_supplier IS NOT NULL AND default_supplier != ''");
      const invSuppliers = await db.getAllAsync<{supplier: string}>("SELECT DISTINCT supplier FROM Inventory WHERE supplier IS NOT NULL AND supplier != ''");
      const rawVocabulary = [
        ...Object.keys(SUPPLIERS_DATA),
        ...Object.keys(BRANDS_DATA),
        ...dbSuppliers.map(s => s.default_supplier),
        ...invSuppliers.map(s => s.supplier)
      ];
      
      const normalized = new Map<string, string>();
      rawVocabulary.forEach(v => {
        if (!v) return;
        const key = v.trim().toLowerCase();
        if (!normalized.has(key)) {
          normalized.set(key, v.trim());
        }
      });

      setSupplierVocabulary(Array.from(normalized.values()).sort());

      // Fetch Supplier Usage Counts
      const sStats = await db.getAllAsync<{val: string, total: number}>(`
        SELECT val, SUM(count) as total FROM (
          SELECT supplier as val, COUNT(*) as count FROM Inventory WHERE supplier IS NOT NULL AND supplier != '' GROUP BY supplier
          UNION ALL
          SELECT default_supplier as val, COUNT(*) as count FROM ItemTypes WHERE default_supplier IS NOT NULL AND default_supplier != '' GROUP BY default_supplier
        ) GROUP BY val
      `);
      const sMap: Record<string, number> = {};
      sStats.forEach(s => { sMap[s.val.toLowerCase()] = s.total; });
      setSupplierCounts(sMap);

      const dbRanges = await db.getAllAsync<{default_product_range: string}>("SELECT DISTINCT default_product_range FROM ItemTypes WHERE default_product_range IS NOT NULL AND default_product_range != ''");
      const invRanges = await db.getAllAsync<{product_range: string}>("SELECT DISTINCT product_range FROM Inventory WHERE product_range IS NOT NULL AND product_range != ''");
      
      const rawR = [
        ...dbRanges.map(r => r.default_product_range),
        ...invRanges.map(r => r.product_range)
      ];
      const normalizedR = new Map<string, string>();
      rawR.forEach(v => {
        if (!v) return;
        const key = v.trim().toLowerCase();
        if (!normalizedR.has(key)) normalizedR.set(key, v.trim());
      });
      setRangeVocabulary(Array.from(normalizedR.values()).sort());

      // Fetch Range Usage Counts
      const rStats = await db.getAllAsync<{val: string, total: number}>(`
        SELECT val, SUM(count) as total FROM (
          SELECT product_range as val, COUNT(*) as count FROM Inventory WHERE product_range IS NOT NULL AND product_range != '' GROUP BY product_range
          UNION ALL
          SELECT default_product_range as val, COUNT(*) as count FROM ItemTypes WHERE default_product_range IS NOT NULL AND default_product_range != '' GROUP BY default_product_range
        ) GROUP BY val
      `);
      const rMap: Record<string, number> = {};
      rStats.forEach(r => { rMap[r.val.toLowerCase()] = r.total; });
      setRangeCounts(rMap);
      
      // --- INTELLIGENCE HIERARCHY FOR CABINET SELECTION ---
      if (editBatchId) {
        // Edit mode cabinet is handled later by batch load
      } else if (inheritedCabinetId) {
        // Explicit intent from navigation (e.g. adding from within a cabinet view)
        setSelectedCabinetId(Number(inheritedCabinetId));
      } else {
        // TIER 1: Explicit Config
        if (typeRes?.default_cabinet_id) {
          setSelectedCabinetId(typeRes.default_cabinet_id);
        } else {
          // TIER 2: Item History
          const lastForItem = await db.getFirstAsync<{cabinet_id: number}>('SELECT cabinet_id FROM Inventory WHERE item_type_id = ? ORDER BY id DESC LIMIT 1', [Number(typeId)]);
          if (lastForItem) {
            setSelectedCabinetId(lastForItem.cabinet_id);
          } else {
            // TIER 3: Global Recency (Persistent)
            const globalRecency = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', ['last_used_cabinet_id']);
            if (globalRecency && globalRecency.value) {
              setSelectedCabinetId(Number(globalRecency.value));
            } else if (cabRows.length > 0) {
              // TIER 4: Global Fallback (Alpha)
              setSelectedCabinetId(cabRows[0].id);
            }
          }
        }
      }


      const res = await db.getAllAsync<{size: string}>(
        "SELECT size FROM Inventory WHERE item_type_id = ? AND size NOT GLOB '*[^0-9]*' GROUP BY size ORDER BY MAX(id) DESC LIMIT 3",
        [Number(typeId)]
      );
      if (res && res.length > 0) {
        setCustomChips(res.map(r => r.size));
      }

      if (editBatchId) {
        const batch = await db.getFirstAsync<any>(
          'SELECT * FROM Inventory WHERE id = ?',
          [Number(editBatchId)]
        );
        if (batch) {
          setQuantity(batch.quantity.toString());
          setSize(batch.size?.toString().replace(/[^0-9]/g, '') || '');
          setExpiryMonth(batch.expiry_month?.toString() || '');
          setExpiryYear(batch.expiry_year?.toString() || '');
          if (batch.cabinet_id) setSelectedCabinetId(batch.cabinet_id);
          if (batch.batch_intel) setBatchIntel(batch.batch_intel);
          if (batch.supplier) setSupplier(batch.supplier);
          if (batch.product_range) setProductRange(batch.product_range);
          // Pre-fill freeze date from entry date for freezer edits
          if (batch.entry_month) setFreezeMonth(batch.entry_month.toString());
          if (batch.entry_year) setFreezeYear(batch.entry_year.toString());
        }
      } else {
        if (typeRes && typeRes.default_size) {
           setSize(typeRes.default_size.toString().replace(/[^0-9]/g, '') || '');
        } else if (res && res.length > 0) {
          setSize(res[0].size.toString().replace(/[^0-9]/g, '') || '');
        }
        if (typeRes && typeRes.default_supplier) setSupplier(typeRes.default_supplier);
        if (typeRes && typeRes.default_product_range) setProductRange(typeRes.default_product_range);
      }

      const catRows = await db.getAllAsync<any>('SELECT * FROM Categories ORDER BY name');
      setCategories(catRows);
      if (!selectedQuickAddCat && catRows.length > 0 && categoryId) {
        setSelectedQuickAddCat(Number(categoryId));
      } else if (!selectedQuickAddCat && catRows.length > 0) {
        setSelectedQuickAddCat(catRows[0].id);
      }
      if (isNewType === '1' && !editBatchId) {
        setShowQuickAddType(true);
      }
    }
    loadData();
  }, [typeId, editBatchId, isNewType]);

  const handleSave = async () => {
    try {
      setErrorField(null);
      setErrorMsg(null);

      const s = size.trim();
      if (!s) {
        setErrorField('size');
        setErrorMsg('Size is required');
        return;
      }

      let finalSize = s;
      // Iteration 65: Data Sovereignty - Only store numeric value
      finalSize = s.replace(/[^0-9]/g, '');

      const q = parseInt(quantity);
      if (isNaN(q) || q <= 0) {
        setErrorField('quantity');
        setErrorMsg('Quantity must be a positive number');
        return;
      }

      if ((unitType === 'weight' || unitType === 'volume')) {
        if (!/^\d+(\.\d+)?$/.test(finalSize)) {
          setErrorField('size');
          setErrorMsg(`Format error: "${unitType}" only accepts numbers`);
          return;
        }
      }

      const freezeM = parseInt(freezeMonth);
      const freezeY = parseInt(freezeYear);
      const entryM = (isFreezerMode && !isNaN(freezeM)) ? freezeM : currentMonth;
      const entryY = (isFreezerMode && !isNaN(freezeY)) ? freezeY : currentYear;
      
      // Freezer Item Limit Check for Cadets/Privates
      if (isFreezerMode && (isCadet || isPrivate) && !hasFullAccess) {
        // Find existing freezer items
        const freezerTypes = await db.getAllAsync<any>(`
          SELECT DISTINCT i.id 
          FROM ItemTypes i 
          LEFT JOIN Inventory v ON i.id = v.item_type_id 
          LEFT JOIN Cabinets c ON v.cabinet_id = c.id 
          WHERE i.freeze_months IS NOT NULL OR c.cabinet_type = 'freezer'
        `);
        const alreadyInFreezer = freezerTypes.some(t => t.id === Number(typeId));
        if (!alreadyInFreezer && freezerTypes.length >= limits.freezer_items) {
           checkEntitlement('FREEZER_LIMIT');
           return;
        }
      }
      if (isFreezerMode) {
        if ((entryY * 12 + entryM) > (currentYear * 12 + currentMonth)) {
          setErrorField('freezeDate');
          setErrorMsg('Items cannot be frozen in the future');
          return;
        }
      }

      let fLimit = parseInt(freezeLimit);
      if (isFreezerMode && (isNaN(fLimit) || fLimit <= 0)) {
         setErrorField('freezeLimit');
         setErrorMsg('Freeze limit must be a positive number of months');
         return;
      }

      // For freezer batches: skip merge
      if (isFreezerMode) {
        if (editBatchId) {
          await db.runAsync(
            'UPDATE Inventory SET quantity = ?, size = ?, expiry_month = NULL, expiry_year = NULL, entry_month = ?, entry_year = ?, cabinet_id = ?, batch_intel = ?, supplier = ?, product_range = ? WHERE id = ?',
            [q, finalSize, entryM, entryY, selectedCabinetId, batchIntel || null, supplier || null, productRange || null, Number(editBatchId)]
          );
        } else {
          await db.runAsync(
            `INSERT INTO Inventory (item_type_id, quantity, size, expiry_month, expiry_year, entry_month, entry_year, cabinet_id, batch_intel, supplier, product_range) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)`,
            [Number(typeId), q, finalSize, entryM, entryY, selectedCabinetId, batchIntel || null, supplier || null, productRange || null]
          );
        }
        
        await db.runAsync('UPDATE ItemTypes SET freeze_months = ? WHERE id = ?', [fLimit, Number(typeId)]);
        await markModified(db);
        router.replace({ pathname: '/', params: { targetCatId: categoryId ? Number(categoryId) : undefined, targetTypeId: typeId ? Number(typeId) : undefined, timestamp: Date.now().toString() } });
        return;
      }

      const exM = parseInt(expiryMonth);
      const exY = parseInt(expiryYear);
      const validExpiry = !isNaN(exM) && !isNaN(exY) && exM > 0 && exM <= 12 && exY > 2020;
      const expMVal = validExpiry ? exM : null;
      const expYVal = validExpiry ? exY : null;

      const existingSearchQuery = `
        SELECT id, batch_intel, expiry_month, expiry_year, supplier, product_range FROM Inventory 
        WHERE item_type_id = ? AND size = ? AND cabinet_id = ?
          AND ( (expiry_month IS NULL AND ? IS NULL) OR (expiry_month = ?) )
          AND ( (expiry_year IS NULL AND ? IS NULL) OR (expiry_year = ?) )
          AND id != ?
      `;
      const potentialMatches = await db.getAllAsync<any>(
        existingSearchQuery, 
        [
          Number(typeId), finalSize, selectedCabinetId, 
          expMVal, expMVal, expYVal, expYVal, 
          editBatchId ? Number(editBatchId) : -1
        ]
      );

      const cleanNewIntel = batchIntel?.trim() || null;
      const cleanNewSupplier = supplier?.trim() || null;
      const cleanNewRange = productRange?.trim() || null;

      if (potentialMatches.length > 0) {
        // 1. SILENT MERGE: All metadata (Supplier, Range, Intel) must match exactly
        const exactMatch = potentialMatches.find(m => 
          (m.batch_intel?.trim() || null) === cleanNewIntel &&
          (m.supplier || null) === cleanNewSupplier &&
          (m.product_range || null) === cleanNewRange
        );

        if (exactMatch) {
          await finalizeCommit(exactMatch.id, { typeId, finalSize, q, currentMonth, currentYear, expMVal, expYVal, entryM, entryY, selectedCabinetId, batchIntel });
        } else {
          // 2. MODAL MERGE: If not exact, offer a merge if Supplier/Range are NULL-compatible 
          // (i.e. we allow NULL to match a value, but don't merge mismatched non-NULL values)
          const mergeCandidate = potentialMatches.find(m => {
            const sMatch = !cleanNewSupplier || !m.supplier || cleanNewSupplier === m.supplier;
            const rMatch = !cleanNewRange || !m.product_range || cleanNewRange === m.product_range;
            return sMatch && rMatch;
          });

          if (mergeCandidate) {
            setMergeCandidate(mergeCandidate);
            setDeferredSave({ typeId, finalSize, q, currentMonth, currentYear, expMVal, expYVal, entryM, entryY, selectedCabinetId, batchIntel });
            setShowMergeModal(true);
          } else {
            // 3. NO MATCH: Structural metadata differs (e.g. different brands), so create new
            await finalizeCommit(null, { typeId, finalSize, q, currentMonth, currentYear, expMVal, expYVal, entryM, entryY, selectedCabinetId, batchIntel, supplier, productRange });
          }
        }
      } else {
        await finalizeCommit(null, { typeId, finalSize, q, currentMonth, currentYear, expMVal, expYVal, entryM, entryY, selectedCabinetId, batchIntel, supplier, productRange });
      }
    } catch (err: any) {
      console.error('Save failed:', err);
      Alert.alert('Save Failed', err.message);
    }
  };

  const finalizeCommit = async (mergeTargetId: number | null, data: any) => {
    try {
      if (mergeTargetId) {
        await db.runAsync(
          'UPDATE Inventory SET quantity = quantity + ?, entry_month = ?, entry_year = ? WHERE id = ?',
          [data.q, data.currentMonth, data.currentYear, mergeTargetId]
        );
        if (editBatchId) {
          await db.runAsync('DELETE FROM Inventory WHERE id = ?', [Number(editBatchId)]);
        }
      } else if (editBatchId) {
        await db.runAsync(
          'UPDATE Inventory SET quantity = ?, size = ?, expiry_month = ?, expiry_year = ?, entry_month = ?, entry_year = ?, cabinet_id = ?, batch_intel = ?, supplier = ?, product_range = ? WHERE id = ?',
          [data.q, data.finalSize, data.expMVal, data.expYVal, data.entryM, data.entryY, data.selectedCabinetId, data.batchIntel || null, data.supplier || null, data.productRange || null, Number(editBatchId)]
        );
      } else {
        await db.runAsync(
          `INSERT INTO Inventory (item_type_id, quantity, size, expiry_month, expiry_year, entry_month, entry_year, cabinet_id, batch_intel, supplier, product_range) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [Number(data.typeId), data.q, data.finalSize, data.expMVal, data.expYVal, data.entryM, data.entryY, data.selectedCabinetId, data.batchIntel || null, data.supplier || null, data.productRange || null]
        );
      }

      if (data.selectedCabinetId) {
        await db.runAsync('INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)', ['last_used_cabinet_id', data.selectedCabinetId.toString()]);
      }

      await markModified(db);
      setDeferredSave(null);
      router.replace({ pathname: '/', params: { targetCatId: categoryId ? Number(categoryId) : undefined, targetTypeId: typeId ? Number(typeId) : undefined, timestamp: Date.now().toString() } });
    } catch (err: any) {
      console.error('Commit failed:', err);
      Alert.alert('Commit Failed', err.message);
    }
  };

  const handleMergeChoice = async (choice: 'MERGE' | 'NEW') => {
    setShowMergeModal(false);
    if (!deferredSave) return;
    
    const targetId = choice === 'MERGE' ? mergeCandidate.id : null;
    await finalizeCommit(targetId, deferredSave);
  };

  const handleQuickAddType = async () => {
    if (!quickAddName.trim() || !selectedQuickAddCat) return;
    try {
      const res = await db.runAsync(
        'INSERT INTO ItemTypes (name, category_id, unit_type, min_stock_level, max_stock_level, default_size, freeze_months, default_supplier, default_product_range, default_cabinet_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          quickAddName.trim(), 
          selectedQuickAddCat, 
          quickAddUnit, 
          quickAddMinStock ? parseInt(quickAddMinStock) : null,
          quickAddMaxStock ? parseInt(quickAddMaxStock) : null,
          quickAddDefaultSize || null,
          quickAddFreezeMonths ? parseInt(quickAddFreezeMonths) : null,
          quickAddSupplier || null,
          quickAddRange || null,
          quickAddDefaultCabinet
        ]
      );
      const newTypeId = res.lastInsertRowId;
      setShowQuickAddType(false);
      setQuickAddName('');
      // Update the URL params and trigger a reload
      router.setParams({ typeId: newTypeId.toString(), isNewType: undefined });
    } catch (e) {
      Alert.alert('Error', 'Could not create new item type.');
    }
  };

  const handleCreateCabinet = async () => {
    if (!newCabName.trim()) return;
    try {
      const res = await db.runAsync(
        'INSERT INTO Cabinets (name, location, cabinet_type) VALUES (?, ?, ?)',
        [newCabName.trim(), newCabLoc.trim(), newCabType]
      );
      const newCabId = res.lastInsertRowId;
      
      const updatedCabs = await db.getAllAsync<any>('SELECT * FROM Cabinets');
      setCabinets(updatedCabs);
      
      if (showQuickAddType) {
        setQuickAddDefaultCabinet(Number(newCabId));
      } else {
        setSelectedCabinetId(Number(newCabId));
      }
      
      setShowAddCabinet(false);
      setNewCabName('');
      setNewCabLoc('');
      setNewCabType('standard');
    } catch (e) {
      Alert.alert('Error', 'Could not create cabinet.');
    }
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const res = await db.runAsync(
        'INSERT INTO Categories (name, icon, is_mess_hall) VALUES (?, ?, ?)',
        [newCatName.trim(), 'box', newCatIsMessHall ? 1 : 0]
      );
      const newCatId = res.lastInsertRowId;
      
      const updatedCats = await db.getAllAsync<any>('SELECT * FROM Categories ORDER BY name');
      setCategories(updatedCats);
      setSelectedQuickAddCat(Number(newCatId));
      
      setShowAddCategory(false);
      setNewCatName('');
      setNewCatIsMessHall(true);
    } catch (e) {
      Alert.alert('Error', 'Could not create category.');
    }
  };

  const increment = () => setQuantity(prev => (parseInt(prev || '0') + 1).toString());
  const decrement = () => setQuantity(prev => Math.max(1, parseInt(prev || '1') - 1).toString());

  const getChipValue = (label: string) => {
    if (label === '1kg' || label === '1l' || label === '1L') return '1000';
    if (label === '2kg' || label === '2l' || label === '2L') return '2000';
    return label.replace(/[^0-9]/g, '');
  };

  let genericChips: string[] = [];
  if (unitType === 'volume') genericChips = ['50ml', '100ml', '250ml', '500ml', '1l'];
  else if (unitType === 'count') genericChips = ['1', '6', '12', '24'];
  else genericChips = ['50g', '100g', '250g', '500g', '1kg'];

  const allChipsRaw = Array.from(new Set([...genericChips, ...customChips]));
  const seenValues = new Set();
  const allChips = allChipsRaw.filter(c => {
    const val = getChipValue(c);
    if (seenValues.has(val)) return false;
    seenValues.add(val);
    return true;
  });

  // ─── PHASE 1: ITEM TYPE SPECIFICATION ───
  if (isNewType === '1' && !typeId) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <Text style={styles.title}>DEPLOY ITEM TYPE</Text>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()} testID="cancel-btn">
              <MaterialCommunityIcons name="close" size={24} color="#f8fafc" />
            </TouchableOpacity>
          </View>

          <View style={styles.formSection}>
            <Text style={styles.miniLabel}>NAME <Text style={{ color: '#f43f5e' }}>*</Text></Text>
            <TextInput style={styles.inputSmall} value={quickAddName} onChangeText={setQuickAddName} placeholder="Item Name" placeholderTextColor="#64748b" autoFocus />
          </View>

          <View style={styles.formSection}>
            <Text style={styles.miniLabel}>UNIT <Text style={{ color: '#f43f5e' }}>*</Text></Text>
            <View style={styles.unitChipRowMini}>
              <TouchableOpacity style={[styles.unitChip, quickAddUnit === 'weight' && styles.unitChipActive]} onPress={() => setQuickAddUnit('weight')}><Text style={[styles.unitChipText, quickAddUnit === 'weight' && styles.unitChipTextActive]}>Weight</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.unitChip, quickAddUnit === 'volume' && styles.unitChipActive]} onPress={() => setQuickAddUnit('volume')}><Text style={[styles.unitChipText, quickAddUnit === 'volume' && styles.unitChipTextActive]}>Volume</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.unitChip, quickAddUnit === 'count' && styles.unitChipActive]} onPress={() => setQuickAddUnit('count')}><Text style={[styles.unitChipText, quickAddUnit === 'count' && styles.unitChipTextActive]}>Count</Text></TouchableOpacity>
            </View>
          </View>

          <View style={styles.formSection}>
            <Text style={styles.miniLabel}>CATEGORY <Text style={{ color: '#f43f5e' }}>*</Text></Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {categories.map(cat => (
                <TouchableOpacity 
                  key={cat.id} 
                  style={[styles.chip, selectedQuickAddCat === cat.id && styles.chipActive]} 
                  onPress={() => setSelectedQuickAddCat(cat.id)}
                >
                  <Text style={[styles.chipText, selectedQuickAddCat === cat.id && styles.chipTextActive]}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity 
                style={[styles.chip, { borderColor: '#3b82f6', borderWidth: 1, backgroundColor: 'rgba(59, 130, 246, 0.1)' }]} 
                onPress={() => setShowAddCategory(true)}
              >
                <Text style={[styles.chipText, { color: '#3b82f6' }]}>+ NEW CATEGORY</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ backgroundColor: '#1e293b', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#334155', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#0f172a' }}>
              <MaterialCommunityIcons name="target" size={16} color="#fb923c" />
              <Text style={{ flex: 1, color: '#94a3b8', fontSize: 11, fontStyle: 'italic', lineHeight: 16 }}>
                <Text style={{ fontWeight: 'bold', color: '#cbd5e1', fontStyle: 'normal' }}>QUARTERMASTER: </Text>
                Set optional thresholds for stock alerts and restocking reports. Leave blank if you don't track stock levels for this item.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.miniLabel}>MIN STOCK</Text>
                <TextInput style={styles.inputSmall} value={quickAddMinStock} onChangeText={setQuickAddMinStock} placeholder="Min" placeholderTextColor="#64748b" keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.miniLabel}>MAX STOCK</Text>
                <TextInput style={styles.inputSmall} value={quickAddMaxStock} onChangeText={setQuickAddMaxStock} placeholder="Max" placeholderTextColor="#64748b" keyboardType="numeric" />
              </View>
            </View>
          </View>

          <View style={{ backgroundColor: '#1e293b', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#334155', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#0f172a' }}>
              <MaterialCommunityIcons name="information-outline" size={16} color="#60a5fa" />
              <Text style={{ flex: 1, color: '#94a3b8', fontSize: 11, fontStyle: 'italic', lineHeight: 16 }}>
                <Text style={{ fontWeight: 'bold', color: '#cbd5e1', fontStyle: 'normal' }}>PRO TIP: </Text>
                Setting defaults below is optional, but pre-fills your forms to ensure frictionless batch entry.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.miniLabel}>DEFAULT SIZE ({quickAddUnit === 'volume' ? 'ml' : quickAddUnit === 'weight' ? 'g' : 'Units'})</Text>
                <TextInput style={styles.inputSmall} value={quickAddDefaultSize} onChangeText={setQuickAddDefaultSize} placeholder="Size" placeholderTextColor="#64748b" keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.miniLabel, { color: '#60a5fa' }]}>❄ FREEZE (M)</Text>
                <TextInput style={[styles.inputSmall, { borderColor: '#1e3a5f' }]} value={quickAddFreezeMonths} onChangeText={setQuickAddFreezeMonths} placeholder="e.g. 6" placeholderTextColor="#475569" keyboardType="numeric" />
              </View>
            </View>
            <View style={{ width: '100%', marginBottom: 4 }}>
              <Text style={styles.miniLabel}>DEFAULT BRAND / SUPPLIER</Text>
              <TextInput style={styles.inputSmall} value={quickAddSupplier} onChangeText={(val) => { setQuickAddSupplier(val); updateSupplierSuggestions(val, 'quick'); }} placeholder="Heinz, Nestle, Tesco..." placeholderTextColor="#64748b" />
            </View>
            <View style={{ height: 26, justifyContent: 'flex-start', alignItems: 'center', marginBottom: 8, flexDirection: 'row' }}>
              {suggestedTypeAheadSuppliers.length > 0 && quickAddSupplier.length > 0 && (
                <View style={{flexDirection: 'row', gap: 4}}>
                  {suggestedTypeAheadSuppliers.map(s => {
                    const isCore = Object.keys(SUPPLIERS_DATA).some(k => k.toLowerCase() === s.toLowerCase()) || 
                                   Object.keys(BRANDS_DATA).some(k => k.toLowerCase() === s.toLowerCase());
                    return (
                      <View key={s} style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingLeft: 6, paddingRight: isCore ? 6 : 4, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}>
                        <TouchableOpacity onPress={() => { setQuickAddSupplier(s); setSuggestedTypeAheadSuppliers([]); }}>
                          <Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>{s.toUpperCase()}</Text>
                        </TouchableOpacity>
                        {!isCore && (
                          <TouchableOpacity onPress={() => handlePurgeVocabulary(s, 'supplier')} hitSlop={{top: 20, bottom: 20, left: 20, right: 20}} style={{padding: 2}}>
                            <MaterialCommunityIcons name="trash-can-outline" size={14} color="#f43f5e" />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={{ width: '100%', marginBottom: 4 }}>
              <Text style={styles.miniLabel}>DEFAULT PRODUCT RANGE</Text>
              <TextInput style={styles.inputSmall} value={quickAddRange} onChangeText={(val) => { setQuickAddRange(val); updateRangeSuggestions(val); }} placeholder="Gastropub, Finest..." placeholderTextColor="#64748b" />
            </View>
            <View style={{ height: 26, justifyContent: 'flex-start', alignItems: 'center', marginBottom: 8, flexDirection: 'row' }}>
              {suggestedTypeAheadRanges.length > 0 && quickAddRange.length > 0 && (
                <View style={{flexDirection: 'row', gap: 4}}>
                  {suggestedTypeAheadRanges.map(r => (
                    <View key={r} style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingLeft: 6, paddingRight: 4, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}>
                      <TouchableOpacity onPress={() => { setQuickAddRange(r); setSuggestedTypeAheadRanges([]); }}>
                        <Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>{r.toUpperCase()}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handlePurgeVocabulary(r, 'range')} hitSlop={{top: 20, bottom: 20, left: 20, right: 20}} style={{padding: 2}}>
                        <MaterialCommunityIcons name="trash-can-outline" size={14} color="#f43f5e" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
            <View style={styles.formSection}>
              <Text style={styles.miniLabel}>DEFAULT CABINET</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <TouchableOpacity style={[styles.chip, !quickAddDefaultCabinet && styles.chipActive]} onPress={() => setQuickAddDefaultCabinet(null)}>
                  <Text style={[styles.chipText, !quickAddDefaultCabinet && styles.chipTextActive]}>No Default</Text>
                </TouchableOpacity>
                {cabinets.map(cab => (
                  <TouchableOpacity key={cab.id} style={[styles.chip, quickAddDefaultCabinet === cab.id && styles.chipActive]} onPress={() => setQuickAddDefaultCabinet(cab.id)}>
                    <Text style={[styles.chipText, quickAddDefaultCabinet === cab.id && styles.chipTextActive]}>{cab.cabinet_type === 'freezer' ? '❄ ' : ''}{cab.name}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity 
                  style={[styles.chip, { borderColor: '#3b82f6', borderWidth: 1, backgroundColor: 'rgba(59, 130, 246, 0.1)' }]} 
                  onPress={() => setShowAddCabinet(true)}
                >
                  <Text style={[styles.chipText, { color: '#3b82f6' }]}>+ NEW CABINET</Text>
                </TouchableOpacity>
              </View>
              {cabinets.some(c => c.cabinet_type === 'freezer') && (
                <Text style={{ color: '#64748b', fontSize: 11, fontStyle: 'italic', marginTop: -2, marginBottom: 8 }}>❄ Designated Freezer Cabinet</Text>
              )}
            </View>
          </View>

          <TouchableOpacity style={[styles.saveButton, { marginTop: 10, backgroundColor: '#3b82f6' }]} onPress={handleQuickAddType}>
            <Text style={styles.saveText}>DEPLOY SPECIFICATION</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* RE-RENDER MODALS IN THIS BRANCH TO ENSURE THEY WORK HERE TOO */}
        <Modal visible={showAddCabinet} transparent animationType="slide">
          <View style={styles.modalOverlay}><View style={styles.modalContent}>
            <Text style={styles.modalTitle}>DEPLOY CABINET</Text>
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.miniLabel}>CABINET NAME</Text>
              <TextInput style={styles.inputSmall} value={newCabName} onChangeText={setNewCabName} placeholder="e.g. Garage Freezer" placeholderTextColor="#64748b" autoFocus />
            </View>
            <TouchableOpacity style={styles.saveButton} onPress={handleCreateCabinet}><Text style={styles.saveText}>CREATE CABINET</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowAddCabinet(false)}><Text style={styles.modalCloseText}>CANCEL</Text></TouchableOpacity>
          </View></View>
        </Modal>
        <Modal visible={showAddCategory} transparent animationType="slide">
          <View style={styles.modalOverlay}><View style={styles.modalContent}>
            <Text style={styles.modalTitle}>DEPLOY CATEGORY</Text>
            <View style={{ marginBottom: 16 }}>
               <Text style={styles.miniLabel}>CATEGORY NAME</Text>
               <TextInput style={styles.inputSmall} value={newCatName} onChangeText={setNewCatName} placeholder="e.g. Spices" placeholderTextColor="#64748b" autoFocus />
            </View>
            <TouchableOpacity style={styles.saveButton} onPress={handleCreateCategory}><Text style={styles.saveText}>CREATE CATEGORY</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowAddCategory(false)}><Text style={styles.modalCloseText}>CANCEL</Text></TouchableOpacity>
          </View></View>
        </Modal>
      </View>
    );
  }

  // ─── PHASE 2: BATCH LOGISTICS ───
  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
             <Text style={styles.title}>{editBatchId ? 'UPDATE BATCH' : 'DEPLOY BATCH'}</Text>
             <Text style={styles.subTitle}>{typeName}</Text>
          </View>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()} testID="cancel-btn">
            <MaterialCommunityIcons name="close" size={24} color="#f8fafc" />
          </TouchableOpacity>
        </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Quantity</Text>
        <View style={[styles.stepper, errorField === 'quantity' && { borderColor: '#ef4444', borderWidth: 1, borderRadius: 8 }]}>
          <TouchableOpacity style={styles.stepButton} onPress={decrement}>
            <MaterialCommunityIcons name="minus" size={24} color="white" />
          </TouchableOpacity>
          <TextInput 
            style={styles.stepInput} 
            value={quantity} 
            onChangeText={(val) => { setQuantity(val); setErrorField(null); }}
            keyboardType="numeric"
            testID="qty-input"
          />
          <TouchableOpacity style={styles.stepButton} onPress={increment}>
            <MaterialCommunityIcons name="plus" size={24} color="white" />
          </TouchableOpacity>
        </View>
        {errorField === 'quantity' && <Text style={styles.errorText}>{errorMsg}</Text>}
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Size (Choose or Type)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsContainer}>
          {allChips.map(c => (
            <TouchableOpacity 
              key={c} 
              style={[styles.chip, size === getChipValue(c) && styles.chipActive]} 
              onPress={() => {
                setSize(getChipValue(c));
                setErrorField(null);
              }}
            >
              <Text style={[styles.chipText, size === getChipValue(c) && styles.chipTextActive]}>
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.inputContainer}>
          <TextInput 
            style={[styles.input, { flex: 1 }, errorField === 'size' && { borderColor: '#ef4444' }]} 
            value={size} 
            onChangeText={(val) => { setSize(val); setErrorField(null); }} 
            placeholder={unitType === 'count' ? "Units (e.g. 6)" : `Enter amount in ${getUnitSuffix(unitType)}`}
            placeholderTextColor="#64748b"
            keyboardType={(unitType === 'weight' || unitType === 'volume' || unitType === 'count') ? "numeric" : "default"}
            testID="size-input"
          />
          {(unitType === 'weight' || unitType === 'volume') && (
            <Text style={styles.unitLabel}>{getUnitSuffix(unitType)}</Text>
          )}
        </View>
        {errorField === 'size' && <Text style={styles.errorText}>{errorMsg}</Text>}
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Storage Cabinet</Text>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8}}>
          {cabinets.map(cab => (
            <TouchableOpacity 
              key={cab.id} 
              style={[styles.chip, selectedCabinetId === cab.id && styles.chipActive]} 
              onPress={() => setSelectedCabinetId(cab.id)}
            >
              <Text style={[styles.chipText, selectedCabinetId === cab.id && styles.chipTextActive]}>
                {cab.cabinet_type === 'freezer' ? '❄ ' : ''}{cab.name}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity 
            style={[styles.chip, { borderColor: '#3b82f6', borderWidth: 1, backgroundColor: 'rgba(59, 130, 246, 0.1)' }]} 
            onPress={() => setShowAddCabinet(true)}
          >
            <Text style={[styles.chipText, { color: '#3b82f6' }]}>+ NEW CABINET</Text>
          </TouchableOpacity>
        </View>
        {cabinets.some(c => c.cabinet_type === 'freezer') && (
            <Text style={{ color: '#64748b', fontSize: 11, fontStyle: 'italic', marginTop: -2, marginBottom: 8 }}>❄ Designated Freezer Cabinet</Text>
        )}
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Brand / Supplier (Optional)</Text>
        <TextInput 
          style={styles.input} 
          value={supplier} 
          onChangeText={(val) => {
            setSupplier(val);
            updateSupplierSuggestions(val, 'main');
          }} 
          placeholder="Heinz, Nestle, Tesco, Walmart..."
          placeholderTextColor="#64748b"
          testID="supplier-input"
        />
        <View style={{ height: 26, justifyContent: 'flex-start', alignItems: 'center', marginTop: 4, flexDirection: 'row' }}>
          {suggestedTypeAheadSuppliers.length > 0 && supplier.length > 0 && (
            <View style={{flexDirection: 'row', gap: 4}}>
              {suggestedTypeAheadSuppliers.map(s => {
                const isCore = Object.keys(SUPPLIERS_DATA).some(k => k.toLowerCase() === s.toLowerCase()) || 
                               Object.keys(BRANDS_DATA).some(k => k.toLowerCase() === s.toLowerCase());
                return (
                  <View key={s} style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingLeft: 6, paddingRight: isCore ? 6 : 4, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}>
                    <TouchableOpacity onPress={() => { setSupplier(s); setSuggestedTypeAheadSuppliers([]); }}>
                      <Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>{s.toUpperCase()}</Text>
                    </TouchableOpacity>
                    {!isCore && (
                      <TouchableOpacity 
                        onPress={() => handlePurgeVocabulary(s, 'supplier')}
                        hitSlop={{top: 20, bottom: 20, left: 20, right: 20}}
                        style={{padding: 2}}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={14} color="#f43f5e" />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Product Range (Optional)</Text>
        <TextInput 
          style={styles.input} 
          value={productRange} 
          onChangeText={(val) => {
            setProductRange(val);
            updateRangeSuggestions(val);
          }} 
          placeholder="e.g. Gastropub, Essential, Finest..."
          placeholderTextColor="#64748b"
          testID="product-range-input"
        />
        <View style={{ height: 26, justifyContent: 'flex-start', alignItems: 'center', marginTop: 4, flexDirection: 'row' }}>
          {suggestedTypeAheadRanges.length > 0 && productRange.length > 0 && (
            <View style={{flexDirection: 'row', gap: 4}}>
              {suggestedTypeAheadRanges.map(r => (
                <View key={r} style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingLeft: 6, paddingRight: 4, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}>
                  <TouchableOpacity onPress={() => { setProductRange(r); setSuggestedTypeAheadRanges([]); }}>
                    <Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>{r.toUpperCase()}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => handlePurgeVocabulary(r, 'range')}
                    hitSlop={{top: 20, bottom: 20, left: 20, right: 20}}
                    style={{padding: 2}}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={14} color="#f43f5e" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* Expiry Date (standard) / Date Frozen (freezer) */}
      {isFreezerMode ? (
        <View style={styles.formGroup}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <MaterialCommunityIcons name="snowflake" size={16} color="#60a5fa" />
            <Text style={[styles.label, { marginBottom: 0, color: '#60a5fa' }]}>Date Frozen</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={[styles.input, { flex: 1, alignItems: 'center' }]}
              onPress={() => setShowFreezeMonthPicker(!showFreezeMonthPicker)}
            >
              <Text style={{ color: freezeMonth ? '#f8fafc' : '#64748b', fontSize: 16 }}>
                {freezeMonth ? `Month: ${freezeMonth.toString().padStart(2, '0')}` : 'Month'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.input, { flex: 1, alignItems: 'center' }]}
              onPress={() => setShowFreezeYearPicker(!showFreezeYearPicker)}
            >
              <Text style={{ color: freezeYear ? '#f8fafc' : '#64748b', fontSize: 16 }}>
                {freezeYear ? `Year: ${freezeYear}` : 'Year'}
              </Text>
            </TouchableOpacity>
          </View>
          {errorField === 'freezeDate' && <Text style={[styles.errorText, {marginTop: 4}]}>{errorMsg}</Text>}
          {showFreezeMonthPicker && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsContainer}>
              {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                <TouchableOpacity key={m} style={[styles.dateChip, freezeMonth === m.toString() && styles.chipActive]} onPress={() => { setFreezeMonth(m.toString()); setShowFreezeMonthPicker(false); }}>
                  <Text style={[styles.chipText, freezeMonth === m.toString() && styles.chipTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {showFreezeYearPicker && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsContainer}>
              {Array.from({length: 4}, (_, i) => currentYear - i).reverse().map(y => (
                <TouchableOpacity key={y} style={[styles.dateChip, freezeYear === y.toString() && styles.chipActive]} onPress={() => { setFreezeYear(y.toString()); setShowFreezeYearPicker(false); }}>
                  <Text style={[styles.chipText, freezeYear === y.toString() && styles.chipTextActive]}>{y}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Freeze Limit Editor */}
          <View style={{ marginTop: 16 }}>
             <Text style={styles.label}>Safe Freeze Lifespan (Months)</Text>
             <TextInput 
               style={[styles.input, { flex: 1 }, errorField === 'freezeLimit' && { borderColor: '#ef4444' }]} 
               value={freezeLimit} 
               onChangeText={(val) => { setFreezeLimit(val.replace(/[^0-9]/g, '')); setErrorField(null); }} 
               placeholder="e.g. 6"
               placeholderTextColor="#64748b"
               keyboardType="numeric"
               testID="freeze-limit-input"
             />
             {errorField === 'freezeLimit' && <Text style={styles.errorText}>{errorMsg}</Text>}
             <Text style={{color: '#64748b', fontSize: 12, marginTop: 6}}>This updates the lifespan for all batches of this item type.</Text>
          </View>
        </View>
      ) : (
        <View style={styles.formGroup}>
          <Text style={styles.label}>Expiry Date</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity 
              style={[styles.input, { flex: 1, alignItems: 'center' }]} 
              onPress={() => setShowMonthPicker(!showMonthPicker)}
            >
              <Text style={{ color: expiryMonth ? '#f8fafc' : '#64748b', fontSize: 16 }}>
                {expiryMonth ? `Month: ${expiryMonth.toString().padStart(2, '0')}` : '(None)'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.input, { flex: 1, alignItems: 'center' }]} 
              onPress={() => setShowYearPicker(!showYearPicker)}
            >
              <Text style={{ color: expiryYear ? '#f8fafc' : '#64748b', fontSize: 16 }}>
                {expiryYear ? `Year: ${expiryYear}` : '(None)'}
              </Text>
            </TouchableOpacity>
          </View>

          {(expiryMonth !== '' || expiryYear !== '') && (
            <TouchableOpacity 
              style={styles.clearDateBtn} 
              onPress={() => { setExpiryMonth(''); setExpiryYear(''); }}
            >
              <MaterialCommunityIcons name="calendar-remove" size={16} color="#ef4444" />
              <Text style={styles.clearDateText}>CLEAR EXPIRY (UNMARKED)</Text>
            </TouchableOpacity>
          )}

          {showMonthPicker && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsContainer}>
              {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                <TouchableOpacity key={m} style={[styles.dateChip, expiryMonth === m.toString() && styles.chipActive]} onPress={() => { setExpiryMonth(m.toString()); setShowMonthPicker(false); }}>
                  <Text style={[styles.chipText, expiryMonth === m.toString() && styles.chipTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {showYearPicker && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsContainer}>
              {Array.from({length: 15}, (_, i) => currentYear + i).map(y => (
                <TouchableOpacity key={y} style={[styles.dateChip, expiryYear === y.toString() && styles.chipActive]} onPress={() => { setExpiryYear(y.toString()); setShowYearPicker(false); }}>
                  <Text style={[styles.chipText, expiryYear === y.toString() && styles.chipTextActive]}>{y}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      <View style={styles.formGroup}>
        <Text style={styles.label}>Batch Intel (Optional)</Text>
        <TextInput 
          style={styles.input} 
          value={batchIntel} 
          onChangeText={setBatchIntel} 
          placeholder="Flavor, condition, reserve status, or tactical details..."
          placeholderTextColor="#64748b"
          testID="batch-intel-input"
        />
      </View>

      <Modal visible={showCabinetPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Storage Site</Text>
            {cabinets.map(cab => (
              <TouchableOpacity 
                key={cab.id} 
                style={[styles.modalItem, selectedCabinetId === cab.id && styles.modalItemActive]}
                onPress={() => {
                  setSelectedCabinetId(cab.id);
                  setShowCabinetPicker(false);
                }}
              >
                <View>
                  <Text style={[styles.modalItemText, selectedCabinetId === cab.id && styles.modalItemTextActive]}>{cab.name}</Text>
                  <Text style={{color: '#64748b', fontSize: 12}}>{cab.location}</Text>
                </View>
                {selectedCabinetId === cab.id && <MaterialCommunityIcons name="check" size={20} color="#3b82f6" />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowCabinetPicker(false)}>
              <Text style={styles.modalCloseText}>CANCEL</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={{ marginTop: -10, padding: 15, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#334155' }} 
              onPress={() => { setShowCabinetPicker(false); setShowAddCabinet(true); }}
            >
              <Text style={{ color: '#3b82f6', fontWeight: 'bold' }}>+ DEPLOY NEW CABINET</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showMergeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>CONSOLIDATE BATCH?</Text>
            <Text style={{color: '#64748b', textAlign: 'center', fontSize: 13, marginBottom: 16}}>
              A batch with matching specifications already exists.
            </Text>

            {mergeCandidate && (
              <View style={{ backgroundColor: '#0f172a', borderRadius: 8, padding: 12, marginBottom: 16, width: '100%' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <MaterialCommunityIcons name="warehouse" size={14} color="#3b82f6" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>
                    {cabinets.find(c => c.id === selectedCabinetId)?.name.toUpperCase()}
                  </Text>
                </View>
                {(mergeCandidate.batch_intel || mergeCandidate.supplier || mergeCandidate.product_range) && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8, flexWrap: 'wrap' }}>
                    <MaterialCommunityIcons name="information" size={14} color="#3b82f6" />
                    {mergeCandidate.supplier && <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: 'bold' }}>{mergeCandidate.supplier.toUpperCase()}</Text>}
                    {mergeCandidate.product_range && <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: 'bold' }}>[{mergeCandidate.product_range.toUpperCase()}]</Text>}
                    {mergeCandidate.batch_intel && <Text style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic' }}>{mergeCandidate.batch_intel}</Text>}
                  </View>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <MaterialCommunityIcons name="weight" size={14} color="#64748b" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>
                    {deferredSave?.finalSize}{getUnitSuffix(unitType)}
                  </Text>
                </View>
                {mergeCandidate.expiry_month && mergeCandidate.expiry_year && (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="calendar-clock" size={14} color="#64748b" style={{ marginRight: 8 }} />
                    <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>
                      EXPIRES {String(mergeCandidate.expiry_month).padStart(2, '0')}/{mergeCandidate.expiry_year}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity 
              style={[styles.confirmBtn, { backgroundColor: '#22c55e', marginBottom: 12 }]} 
              onPress={() => handleMergeChoice('MERGE')}
            >
              <Text style={styles.confirmBtnText}>MERGE INTO EXISTING</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.confirmBtn, { backgroundColor: '#334155', marginBottom: 12 }]} 
              onPress={() => handleMergeChoice('NEW')}
            >
              <Text style={styles.confirmBtnText}>KEEP AS NEW BATCH</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelLink} onPress={() => { setShowMergeModal(false); setDeferredSave(null); }}>
              <Text style={{color: '#64748b', fontWeight: 'bold'}}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODALS REMOVED FROM HERE AS THEY ARE BRANCHED ABOVE */}

      {/* ADD CABINET MODAL */}
      <Modal visible={showAddCabinet} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>NEW STORAGE CABINET</Text>
            
            <View style={{ marginBottom: 16, width: '100%' }}>
              <Text style={styles.miniLabel}>CABINET NAME</Text>
              <TextInput style={styles.inputSmall} value={newCabName} onChangeText={setNewCabName} placeholder="e.g. Garage Freezer" placeholderTextColor="#64748b" autoFocus />
            </View>

            <View style={{ marginBottom: 16, width: '100%' }}>
              <Text style={styles.miniLabel}>LOCATION</Text>
              <TextInput style={styles.inputSmall} value={newCabLoc} onChangeText={setNewCabLoc} placeholder="e.g. Garage" placeholderTextColor="#64748b" />
            </View>

            <View style={{ marginBottom: 24, width: '100%' }}>
              <Text style={styles.miniLabel}>CABINET TYPE</Text>
              <View style={styles.unitChipRowMini}>
                <TouchableOpacity style={[styles.unitChip, newCabType === 'standard' && styles.unitChipActive]} onPress={() => setNewCabType('standard')}><Text style={[styles.unitChipText, newCabType === 'standard' && styles.unitChipTextActive]}>Standard</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.unitChip, newCabType === 'freezer' && styles.unitChipActive]} onPress={() => setNewCabType('freezer')}><Text style={[styles.unitChipText, newCabType === 'freezer' && styles.unitChipTextActive]}>Freezer</Text></TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleCreateCabinet}>
              <Text style={styles.saveText}>CREATE CABINET</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalClose} onPress={() => setShowAddCabinet(false)}>
              <Text style={styles.modalCloseText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ADD CATEGORY MODAL */}
      <Modal visible={showAddCategory} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>NEW CATEGORY</Text>
            
            <View style={{ marginBottom: 16, width: '100%' }}>
              <Text style={styles.miniLabel}>CATEGORY NAME</Text>
              <TextInput style={styles.inputSmall} value={newCatName} onChangeText={setNewCatName} placeholder="e.g. Spices, Tinned Goods" placeholderTextColor="#64748b" autoFocus />
            </View>

            <View style={{ marginBottom: 24, width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#334155' }}>
              <View style={{flex: 1}}>
                <Text style={[styles.miniLabel, {marginBottom: 2}]}>MESS HALL COMPATIBLE</Text>
                <Text style={{color: '#64748b', fontSize: 10}}>Exclude this from recipe generation if it's for prepared meals.</Text>
              </View>
              <View style={{ transform: [{ scale: 0.8 }] }}>
                <Switch 
                  value={newCatIsMessHall} 
                  onValueChange={setNewCatIsMessHall}
                  trackColor={{ false: "#334155", true: "#3b82f6" }}
                  thumbColor={newCatIsMessHall ? "#ffffff" : "#94a3b8"}
                />
              </View>
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleCreateCategory}>
              <Text style={styles.saveText}>CREATE CATEGORY</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalClose} onPress={() => setShowAddCategory(false)}>
              <Text style={styles.modalCloseText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>


      {(isNewType !== '1' || !showQuickAddType) && (
        <TouchableOpacity style={styles.saveButton} onPress={handleSave} testID="save-stock-btn">
          <Text style={styles.saveText}>{editBatchId ? 'UPDATE BATCH' : 'SAVE TO BATCHES'}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
    </View>
  );
}

const customModalStyles = {
  confirmBtn: { padding: 16, borderRadius: 8, width: '100%', alignItems: 'center' },
  confirmBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  cancelLink: { padding: 12, width: '100%', alignItems: 'center' }
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, marginTop: 10 },
  title: { fontSize: 28, color: '#f8fafc', fontWeight: 'bold' },
  subTitle: { fontSize: 18, color: '#3b82f6', fontWeight: '600', marginTop: 2 },
  cancelBtn: { padding: 8, backgroundColor: '#334155', borderRadius: 20 },
  errorText: { color: '#ef4444', fontSize: 12, marginTop: 6, fontWeight: 'bold' },
  formGroup: { marginBottom: 20 },
  label: { color: '#94a3b8', fontSize: 16, marginBottom: 8 },
  input: { backgroundColor: '#1e293b', color: '#f8fafc', borderRadius: 8, padding: 16, fontSize: 16, borderWidth: 1, borderColor: '#334155' },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepButton: { backgroundColor: '#334155', padding: 12, borderRadius: 8 },
  stepInput: { flex: 1, backgroundColor: '#1e293b', color: '#f8fafc', fontSize: 20, textAlign: 'center', paddingVertical: 12, marginHorizontal: 12, borderRadius: 8 },
  saveButton: { backgroundColor: '#22c55e', padding: 18, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  saveText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  chipsContainer: { flexDirection: 'row', marginBottom: 12, marginTop: 10 },
  chip: { backgroundColor: '#334155', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, marginRight: 8 },
  dateChip: { backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, marginRight: 8, minWidth: 44, alignItems: 'center' },
  chipActive: { backgroundColor: '#3b82f6' },
  chipText: { color: '#cbd5e1', fontWeight: 'bold' },
  chipTextActive: { color: 'white' },
  inputContainer: { flexDirection: 'row', alignItems: 'center' },
  unitLabel: { position: 'absolute', right: 16, color: '#3b82f6', fontWeight: 'bold', fontSize: 16 },
  clearDateBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 10, padding: 4 },
  clearDateText: { color: '#ef4444', fontSize: 11, fontWeight: 'bold', marginLeft: 6, letterSpacing: 0.5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1e293b', borderRadius: 16, padding: 24, maxHeight: '80%' },
  modalTitle: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#334155', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalItemActive: { backgroundColor: '#334155', borderRadius: 8, paddingHorizontal: 10 },
  modalItemText: { color: '#f8fafc', fontSize: 16 },
  modalItemTextActive: { color: '#3b82f6', fontWeight: 'bold' },
  modalClose: { marginTop: 20, padding: 15, alignItems: 'center' },
  modalCloseText: { color: '#ef4444', fontWeight: 'bold', letterSpacing: 1 },
  confirmBtn: { padding: 16, borderRadius: 8, width: '100%', alignItems: 'center' },
  confirmBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  cancelLink: { padding: 12, width: '100%', alignItems: 'center' },
  unitChipRowMini: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  unitChip: { backgroundColor: '#334155', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, minWidth: 80, alignItems: 'center', borderWidth: 1, borderColor: '#475569' },
  unitChipActive: { backgroundColor: '#1e3a8a', borderColor: '#3b82f6' },
  unitChipText: { color: '#94a3b8', fontWeight: 'bold', fontSize: 12 },
  unitChipTextActive: { color: 'white' },
  miniLabel: { color: '#cbd5e1', fontSize: 12, fontWeight: 'bold', marginBottom: 4, paddingLeft: 4, textTransform: 'uppercase' },
  inputSmall: { backgroundColor: '#0f172a', color: '#f8fafc', borderRadius: 8, padding: 12, fontSize: 14, borderWidth: 1, borderColor: '#334155', width: '100%' },
  formSection: { marginBottom: 16 }
});
