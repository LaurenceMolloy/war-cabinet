import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Modal, Platform, Switch } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { markModified, recordActivity, logTacticalAction } from '../db/sqlite';
import { useBilling } from '../context/BillingContext';
import { Database, ConsolidationCandidate, NewBatchData } from '../database';
import { ConsolidationCarousel } from '../components/ConsolidationCarousel';
import SUPPLIERS_DATA from '../data/suppliers.json';
import BRANDS_DATA from '../data/brands.json';
import { ExpiryScannerModal } from '../components/ExpiryScannerModal';
import { CabinetFormModal } from '../components/CabinetFormModal';
import { getUnitSuffix, formatQuantity } from '../utils/measurements';

function getLevenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

const NearMissIcon = () => (
  <View style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }}>
    <MaterialCommunityIcons name="bullseye-arrow" size={38} color="#475569" />
    <View style={{ position: 'absolute', bottom: 1, right: 1 }}>
      {/* 4-way offset for Black Border on Glyph */}
      <MaterialCommunityIcons name="help" size={26} color="#000000" style={{ position: 'absolute', top: -1, left: -1 }} />
      <MaterialCommunityIcons name="help" size={26} color="#000000" style={{ position: 'absolute', top: -1, left: 1 }} />
      <MaterialCommunityIcons name="help" size={26} color="#000000" style={{ position: 'absolute', top: 1, left: -1 }} />
      <MaterialCommunityIcons name="help" size={26} color="#000000" style={{ position: 'absolute', top: 1, left: 1 }} />
      {/* Main Orange Question Mark Glyph */}
      <MaterialCommunityIcons name="help" size={26} color="#f59e0b" />
    </View>
  </View>
);

export default function AddInventoryScreen() {
  const { typeId, editBatchId, inheritedCabinetId, categoryId, isNewType, barcode, inheritedSupplier, inheritedSize } = useLocalSearchParams();
  const barcodeStr = Array.isArray(barcode) ? barcode[0] : (barcode as string | undefined);
  const router = useRouter();
  const db = useSQLiteContext();
  const { isCadet, isPrivate, hasFullAccess, limits, checkEntitlement } = useBilling();

  const [quantity, setQuantity] = useState('1');
  const [size, setSize] = useState('');
  const [typeName, setTypeName] = useState('');
  
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const currentDay = new Date().getDate();
  
  const [expiryMonth, setExpiryMonth] = useState(currentMonth.toString());
  const [expiryYear, setExpiryYear] = useState(currentYear.toString());
  const [showExpiryScanner, setShowExpiryScanner] = useState(false);
  const [wasScanned, setWasScanned] = useState(false);
  const [customChips, setCustomChips] = useState<string[]>([]);
  const [unitType, setUnitType] = useState('weight');
  const [batchIntel, setBatchIntel] = useState("");
  const [bulkSegments, setBulkSegments] = useState<string>("");
  const [isFractionalEnabled, setIsFractionalEnabled] = useState(false);
  const [portionsRemaining, setPortionsRemaining] = useState<number | null>(null);
  const [supplier, setSupplier] = useState("");
  const [productRange, setProductRange] = useState('');
  const [suggestedTypeAheadSuppliers, setSuggestedTypeAheadSuppliers] = useState<string[]>([]);
  const [suggestedTypeAheadRanges, setSuggestedTypeAheadRanges] = useState<string[]>([]);
  const [supplierVocabulary, setSupplierVocabulary] = useState<string[]>([]);
  const [rangeVocabulary, setRangeVocabulary] = useState<string[]>([]);
  const [supplierCounts, setSupplierCounts] = useState<Record<string, number>>({});
  const [rangeCounts, setRangeCounts] = useState<Record<string, number>>({});
  const [defaultBrandSuggestion, setDefaultBrandSuggestion] = useState<string | null>(null);
  const [defaultRangeSuggestion, setDefaultRangeSuggestion] = useState<string | null>(null);
  const [mostFreqBrandSuggestion, setMostFreqBrandSuggestion] = useState<string | null>(null);
  const [mostFreqRangeSuggestion, setMostFreqRangeSuggestion] = useState<string | null>(null);
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

  const [showCabinetModal, setShowCabinetModal] = useState(false);
  const [cabinetModalContext, setCabinetModalContext] = useState<'main' | 'quick_add'>('main');
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIsMessHall, setNewCatIsMessHall] = useState(true);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeCandidates, setMergeCandidates] = useState<ConsolidationCandidate[]>([]);
  const [deferredSave, setDeferredSave] = useState<NewBatchData | null>(null);

  const isAutoSavePipeline = useRef(false);
  const handleSaveRef = useRef<(() => Promise<void>) | null>(null);
  const expiryTouched = useRef(false);
  const [showExpiryWarningModal, setShowExpiryWarningModal] = useState(false);
  const mainScrollRef = useRef<ScrollView>(null);
  const expirySectionY = useRef(0);
  const quantitySectionY = useRef(0);
  const sizeSectionY = useRef(0);
  const freezeSectionY = useRef(0);

  const resumePipeline = () => {
    if (isAutoSavePipeline.current) {
      setTimeout(() => {
        handleSaveRef.current?.();
      }, 100);
    }
  };

  const updateSupplierSuggestions = (val: string, segment: 'main' | 'quick') => {
    const searchVal = val.trim().toLowerCase();
    if (searchVal.length > 0) {
      const scored = supplierVocabulary.map(s => {
        const lowerS = s.toLowerCase();
        let score = 3; // Default outside threshold

        if (lowerS === searchVal) score = 0;
        else if (lowerS.startsWith(searchVal)) score = 0.5;
        else if (lowerS.includes(searchVal)) score = 0.8;
        else {
          // --- ELASTIC PREFIX CHECK ---
          // Check if input is a near-miss of the word's BEGINNING (n+1)
          const prefixToScan = lowerS.substring(0, searchVal.length + 1);
          const prefixDist = getLevenshteinDistance(searchVal, prefixToScan);
          
          if (prefixDist <= 1) score = 0.9; 
          else {
            // Full-word fallback
            const fullDist = getLevenshteinDistance(searchVal, lowerS);
            if (fullDist <= 2) score = 1.0 + (fullDist * 0.2);
          }
        }

        return { name: s, score, count: supplierCounts[lowerS] || 0 };
      });

      const matches = scored
        .filter(item => item.score <= 2)
        .sort((a, b) => {
          if (a.score !== b.score) return a.score - b.score;
          if (a.count !== b.count) return b.count - a.count;
          return a.name.localeCompare(b.name);
        })
        .slice(0, 3)
        .map(item => item.name);

      setSuggestedTypeAheadSuppliers(matches);
    } else {
      setSuggestedTypeAheadSuppliers([]);
    }
  };

  const handleSupplierFuzzyCheck = (valToCheck?: string): boolean => {
    if (!checkEntitlement('ERROR_DETECTION')) return false;
    const valStr = typeof valToCheck === 'string' ? valToCheck : (showQuickAddType ? quickAddSupplier : supplier);
    const val = valStr.trim().toLowerCase();
    if (!val || (ignoredFuzzyBrands && ignoredFuzzyBrands.has(val))) return false;
    
    // Exact match exists? (Suppresses modal if we just picked a suggestion)
    if (supplierVocabulary.some(s => s.toLowerCase() === val)) return false;

    const threshold = val.length < 4 ? 1 : 2;

    let matches = supplierVocabulary
      .map(s => {
        const lowerS = s.toLowerCase();
        return {
          name: s,
          dist: getLevenshteinDistance(val, lowerS),
          startsWith: lowerS.startsWith(val[0])
        };
      })
      .filter(m => m.dist >= 1 && m.dist <= 2)
      .sort((a, b) => {
        if (a.startsWith && !b.startsWith) return -1;
        if (!a.startsWith && b.startsWith) return 1;
        if (a.dist !== b.dist) return a.dist - b.dist;
        return a.name.localeCompare(b.name);
      });

    const finalMatches = matches
      .slice(0, 3)
      .map(m => m.name);

    if (finalMatches.length > 0) {
      setFuzzyBrandMatches(finalMatches);
      setShowBrandFuzzyModal(true);
      return true;
    }
    return false;
  };

  const handleRangeFuzzyCheck = (valToCheck?: string): boolean => {
    if (!checkEntitlement('ERROR_DETECTION')) return false;
    const valStr = typeof valToCheck === 'string' ? valToCheck : (showQuickAddType ? quickAddRange : productRange);
    const val = valStr.trim().toLowerCase();
    if (!val || (ignoredFuzzyRanges && ignoredFuzzyRanges.has(val))) return false;
    
    // Exact match exists?
    if (rangeVocabulary.some(r => r.toLowerCase() === val)) return false;

    let matches = rangeVocabulary
      .map(r => {
        const lowerR = r.toLowerCase();
        return {
          name: r,
          dist: getLevenshteinDistance(val, lowerR),
          startsWith: lowerR.startsWith(val[0])
        };
      })
      .filter(m => m.dist >= 1 && m.dist <= 2)
      .sort((a, b) => {
        if (a.startsWith && !b.startsWith) return -1;
        if (!a.startsWith && b.startsWith) return 1;
        if (a.dist !== b.dist) return a.dist - b.dist;
        return a.name.localeCompare(b.name);
      });

    const finalMatches = matches
      .slice(0, 3)
      .map(m => m.name);

    if (finalMatches.length > 0) {
      setFuzzyRangeMatches(finalMatches);
      setShowRangeFuzzyModal(true);
      return true;
    }
    return false;
  };


  const updateRangeSuggestions = (val: string) => {
    const searchVal = val.trim().toLowerCase();
    if (searchVal.length > 0) {
      const scored = rangeVocabulary.map(r => {
        const lowerR = r.toLowerCase();
        let score = 3;

        if (lowerR === searchVal) score = 0;
        else if (lowerR.startsWith(searchVal)) score = 0.5;
        else if (lowerR.includes(searchVal)) score = 0.8;
        else {
          const prefixToScan = lowerR.substring(0, searchVal.length + 1);
          const prefixDist = getLevenshteinDistance(searchVal, prefixToScan);
          if (prefixDist <= 1) score = 0.9;
          else {
            const fullDist = getLevenshteinDistance(searchVal, lowerR);
            if (fullDist <= 2) score = 1.0 + (fullDist * 0.2);
          }
        }
        return { name: r, score, count: rangeCounts[lowerR] || 0 };
      });

      const matches = scored
        .filter(item => item.score <= 2)
        .sort((a, b) => {
          if (a.score !== b.score) return a.score - b.score;
          if (a.count !== b.count) return b.count - a.count;
          return a.name.localeCompare(b.name);
        })
        .slice(0, 3)
        .map(item => item.name);

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
        await logTacticalAction(db, 'PURGE_VOCAB', 'SUPPLIER', null, val);
      } else {
        await db.runAsync("UPDATE ItemTypes SET default_product_range = NULL WHERE default_product_range = ?", [val]);
        await db.runAsync("UPDATE Inventory SET product_range = NULL WHERE product_range = ?", [val]);
        await logTacticalAction(db, 'PURGE_VOCAB', 'RANGE', null, val);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to save inventory');
    }
  };


  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showOptionalFields, setShowOptionalFields] = useState(true);
  
  const [errorField, setErrorField] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [cabinets, setCabinets] = useState<any[]>([]);
  const [selectedCabinetId, setSelectedCabinetId] = useState<number | null>(null);
  const [hasManuallyChangedCabinet, setHasManuallyChangedCabinet] = useState(false);
  const [showCabinetPicker, setShowCabinetPicker] = useState(false);
  const [showLocationConflictModal, setShowLocationConflictModal] = useState(false);
  const [showVanguardModal, setShowVanguardModal] = useState(false);
  const [showBrandFuzzyModal, setShowBrandFuzzyModal] = useState(false);
  const [fuzzyBrandMatches, setFuzzyBrandMatches] = useState<string[]>([]);
  const [ignoredFuzzyBrands, setIgnoredFuzzyBrands] = useState<Set<string>>(new Set());
  const [showRangeFuzzyModal, setShowRangeFuzzyModal] = useState(false);
  const [fuzzyRangeMatches, setFuzzyRangeMatches] = useState<string[]>([]);
  const [ignoredFuzzyRanges, setIgnoredFuzzyRanges] = useState<Set<string>>(new Set());
  const [otherLocations, setOtherLocations] = useState<{id: number, name: string}[]>([]);
  const [makeDefaultHome, setMakeDefaultHome] = useState(false);
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

      const cabRows = await Database.Cabinets.getAll(db);
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
        if (!normalizedR.has(key)) {
          normalizedR.set(key, v.trim());
        }
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

      // Fetch Sensible Defaults for item type
      let typeRes: any = null;
      if (typeId) {
        typeRes = await db.getFirstAsync<{name: string, category_name: string, unit_type: string, default_size: string, default_cabinet_id: number | null, freeze_months: number | null, default_supplier: string | null, default_product_range: string | null, category_id: number}>(
          `SELECT i.name, c.name as category_name, i.category_id, i.unit_type, i.default_size, i.default_cabinet_id, i.freeze_months, i.default_supplier, i.default_product_range 
           FROM ItemTypes i 
           JOIN Categories c ON c.id = i.category_id
           WHERE i.id = ?`, 
          [Number(typeId)]
        );
        if (typeRes) {
          setUnitType(typeRes.unit_type || 'weight');
          setTypeName(typeRes.name);
          if (typeRes.category_id) setSelectedQuickAddCat(typeRes.category_id);
          if (typeRes.default_cabinet_id) setSelectedCabinetId(typeRes.default_cabinet_id);
          if (typeRes.freeze_months) setFreezeLimit(typeRes.freeze_months.toString());
        }

        // --- BARCODE DEFAULTS ---
        if (barcodeStr) {
          if (inheritedSupplier) setSupplier(decodeURIComponent(inheritedSupplier as string));
          if (inheritedSize) setSize(decodeURIComponent(inheritedSize as string));
        } else if (typeRes?.default_size) {
          setSize(typeRes.default_size);
        }

        const lastBrandRow = await db.getFirstAsync<{supplier: string}>("SELECT supplier FROM Inventory WHERE item_type_id = ? AND supplier IS NOT NULL AND supplier != '' ORDER BY id DESC LIMIT 1", [Number(typeId)]);
        const lastBrand = typeRes?.default_supplier || lastBrandRow?.supplier || null;
        if (lastBrand) setDefaultBrandSuggestion(lastBrand);

        const lastRangeRow = await db.getFirstAsync<{product_range: string}>("SELECT product_range FROM Inventory WHERE item_type_id = ? AND product_range IS NOT NULL AND product_range != '' ORDER BY id DESC LIMIT 1", [Number(typeId)]);
        const lastRange = typeRes?.default_product_range || lastRangeRow?.product_range || null;
        if (lastRange) setDefaultRangeSuggestion(lastRange);

        const freqBrandRow = await db.getFirstAsync<{supplier: string}>("SELECT supplier, COUNT(*) as count FROM Inventory WHERE item_type_id = ? AND supplier IS NOT NULL AND supplier != '' GROUP BY supplier COLLATE NOCASE ORDER BY count DESC LIMIT 1", [Number(typeId)]);
        if (freqBrandRow) setMostFreqBrandSuggestion(freqBrandRow.supplier);

        const freqRangeRow = await db.getFirstAsync<{product_range: string}>("SELECT product_range, COUNT(*) as count FROM Inventory WHERE item_type_id = ? AND product_range IS NOT NULL AND product_range != '' GROUP BY product_range COLLATE NOCASE ORDER BY count DESC LIMIT 1", [Number(typeId)]);
        if (freqRangeRow) setMostFreqRangeSuggestion(freqRangeRow.product_range);
      }

      // --- GLOBAL FALLBACK INTELLIGENCE (For items with no history) ---
      const globalFreqBrand = await db.getFirstAsync<{supplier: string}>("SELECT supplier, COUNT(*) as count FROM Inventory WHERE supplier IS NOT NULL AND supplier != '' GROUP BY supplier COLLATE NOCASE ORDER BY count DESC LIMIT 1");
      const globalFreqRange = await db.getFirstAsync<{product_range: string}>("SELECT product_range, COUNT(*) as count FROM Inventory WHERE product_range IS NOT NULL AND product_range != '' GROUP BY product_range COLLATE NOCASE ORDER BY count DESC LIMIT 1");
      
      if (globalFreqBrand && !mostFreqBrandSuggestion) setMostFreqBrandSuggestion(globalFreqBrand.supplier);
      if (globalFreqRange && !mostFreqRangeSuggestion) setMostFreqRangeSuggestion(globalFreqRange.product_range);
      
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
          let lastForItem = null;
          if (typeId) {
            lastForItem = await db.getFirstAsync<{cabinet_id: number}>('SELECT cabinet_id FROM Inventory WHERE item_type_id = ? ORDER BY id DESC LIMIT 1', [Number(typeId)]);
          }
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


      if (typeId) {
        const res = await db.getAllAsync<{size: string}>(
          "SELECT size FROM Inventory WHERE item_type_id = ? AND size NOT GLOB '*[^0-9]*' GROUP BY size ORDER BY MAX(id) DESC LIMIT 3",
          [Number(typeId)]
        );
        if (res && res.length > 0) {
          setCustomChips(res.map(r => r.size));
        }

        if (!editBatchId) {
          if (typeRes && typeRes.default_size) {
             setSize(typeRes.default_size.toString().replace(/[^0-9]/g, '') || '');
          } else if (res && res.length > 0) {
            setSize(res[0].size.toString().replace(/[^0-9]/g, '') || '');
          }
          if (typeRes && typeRes.default_supplier) setSupplier(typeRes.default_supplier);
          if (typeRes && typeRes.default_product_range) setProductRange(typeRes.default_product_range);
        }
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
          expiryTouched.current = true; // Edit mode — user set this previously, no warning needed
          if (batch.cabinet_id) setSelectedCabinetId(batch.cabinet_id);
          let fractionalActive = false;
          let loadedPortionsRem = null;
          
          if (batch.portions_total) {
            setBulkSegments(batch.portions_total.toString());
            fractionalActive = true;
            setPortionsRemaining(batch.portions_remaining);
          } else if (batch.batch_intel) {
            setBatchIntel(batch.batch_intel);
            const bulkMatch = batch.batch_intel.match(/\[BULK:(\d+)\]/i);
            if (bulkMatch) {
              setBulkSegments(bulkMatch[1]);
              fractionalActive = true;
            }
          }
          
          // Legacy/Auto-Bulk Fallback: If no explicit tag yet, check if it's a bulk-classified item (matches index.tsx logic)
          if (!fractionalActive && typeRes) {
            const isAutoBulk = 
              typeRes.name.toLowerCase().includes('bulk') || 
              (typeRes.category_name || '').toLowerCase().includes('bulk') ||
              typeRes.category_name === 'Tactical Rations';
              
            if (isAutoBulk) {
              setBulkSegments('5'); // Standard legacy default
              fractionalActive = true;
            }
          }
          setIsFractionalEnabled(fractionalActive);
          if (batch.supplier) setSupplier(batch.supplier);
          if (batch.product_range) setProductRange(batch.product_range);
          // Pre-fill freeze date from entry date for freezer edits
          if (batch.entry_month) setFreezeMonth(batch.entry_month.toString());
          if (batch.entry_year) setFreezeYear(batch.entry_year.toString());
        }
      }

      const catRows = await db.getAllAsync<any>('SELECT * FROM Categories ORDER BY name');
      setCategories(catRows);
      if (!selectedQuickAddCat && catRows.length > 0 && categoryId) {
        setSelectedQuickAddCat(Number(categoryId));
      }
      if (isNewType === '1' && !editBatchId) {
        setShowQuickAddType(true);
      }
    }
    loadData();
  }, [typeId, editBatchId, isNewType]);

  const handleSave = async () => {
    try {
      // PRE-SAVE LOGISTICAL AUDIT (Catch near-misses before validation/commit)
      if (handleSupplierFuzzyCheck(showQuickAddType ? quickAddSupplier : supplier)) return;
      if (handleRangeFuzzyCheck(showQuickAddType ? quickAddRange : productRange)) return;

      setErrorField(null);
      setErrorMsg(null);

      const s = size.trim();
      if (!s) {
        setErrorField('size');
        setErrorMsg('Size is required');
        mainScrollRef.current?.scrollTo({ y: sizeSectionY.current - 20, animated: true });
        return;
      }

      let finalSize = s;
      // Iteration 65: Data Sovereignty - Only store numeric value
      finalSize = s.replace(/[^0-9]/g, '');

      const q = parseInt(quantity);
      if (isNaN(q) || q <= 0) {
        setErrorField('quantity');
        setErrorMsg('Quantity must be a positive number');
        mainScrollRef.current?.scrollTo({ y: quantitySectionY.current - 20, animated: true });
        return;
      }

      // EXPIRY OMISSION GUARD: Warn if the user never touched the expiry date (defaults to current month)
      if (!isFreezerMode && !expiryTouched.current) {
        const exM = parseInt(expiryMonth);
        const exY = parseInt(expiryYear);
        const isDefaultDate = exM === currentMonth && exY === currentYear;
        if (isDefaultDate) {
          setShowExpiryWarningModal(true);
          return;
        }
      }

      if ((unitType === 'weight' || unitType === 'volume')) {
        if (!/^\d+(\.\d+)?$/.test(finalSize)) {
          setErrorField('size');
          setErrorMsg(`Format error: "${unitType}" only accepts numbers`);
          mainScrollRef.current?.scrollTo({ y: sizeSectionY.current - 20, animated: true });
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
        const alreadyInFreezer = typeId ? freezerTypes.some(t => t.id === Number(typeId)) : false;
        if (!alreadyInFreezer && freezerTypes.length >= limits.freezer_items) {
           checkEntitlement('FREEZER_LIMIT');
           return;
        }
      }
      if (isFreezerMode) {
        if ((entryY * 12 + entryM) > (currentYear * 12 + currentMonth)) {
          setErrorField('freezeDate');
          setErrorMsg('Items cannot be frozen in the future');
          mainScrollRef.current?.scrollTo({ y: freezeSectionY.current - 20, animated: true });
          return;
        }
      }

      let fLimit = parseInt(freezeLimit);
      if (isFreezerMode && (isNaN(fLimit) || fLimit <= 0)) {
         setErrorField('freezeLimit');
         setErrorMsg('Freeze limit must be a positive number of months');
         mainScrollRef.current?.scrollTo({ y: freezeSectionY.current - 20, animated: true });
         return;
      }

      let finalPortionsTotal = null;
      let finalPortionsRemaining = null;
      if (checkEntitlement('OPEN_CONSUMPTION') && isFractionalEnabled) {
        const segs = parseInt(bulkSegments || '5');
        if (segs > 0) {
          finalPortionsTotal = segs;
          // If editing and same total count, preserve remaining. Otherwise reset.
          if (editBatchId && portionsRemaining !== null) {
            finalPortionsRemaining = portionsRemaining;
          } else {
            finalPortionsRemaining = finalPortionsTotal;
          }
        }
      }

      let finalTypeId = typeId;
      if (showQuickAddType && !finalTypeId) {
        const tRes = await db.runAsync(
          'INSERT INTO ItemTypes (name, category_id, unit_type, default_cabinet_id, freeze_months) VALUES (?, ?, ?, ?, ?)',
          [quickAddName.trim(), selectedQuickAddCat, quickAddUnit, selectedCabinetId, isFreezerMode ? fLimit : null]
        );
        finalTypeId = tRes.lastInsertRowId.toString();
        await logTacticalAction(db, 'ADD', 'ITEM_TYPE', Number(finalTypeId), quickAddName.trim());
      }

      let cleanNewIntel = batchIntel?.trim() || "";
      // Remove legacy portions related tags from intel field
      cleanNewIntel = cleanNewIntel.replace(/\[BULK:\d+\]/gi, '').replace(/REMAINDER:\d+/gi, '').trim();
      if (!cleanNewIntel) cleanNewIntel = null as any;

      const cleanNewSupplier = supplier?.trim() || null;
      const cleanNewRange = productRange?.trim() || null;

      let expMVal = null;
      let expYVal = null;

      if (isFreezerMode) {
        let m = entryM + fLimit;
        let y = entryY;
        while (m > 12) {
          m -= 12;
          y += 1;
        }
        expMVal = m;
        expYVal = y;
      } else {
        const exM = parseInt(expiryMonth);
        const exY = parseInt(expiryYear);
        const validExpiry = !isNaN(exM) && !isNaN(exY) && exM > 0 && exM <= 12 && exY > 2020;
        expMVal = validExpiry ? exM : null;
        expYVal = validExpiry ? exY : null;
      }

      const existingSearchQuery = `
        SELECT id, batch_intel, expiry_month, expiry_year, supplier, product_range, size FROM Inventory 
        WHERE item_type_id = ? AND size = ? AND cabinet_id = ?
          AND ( (expiry_month IS NULL AND ? IS NULL) OR (expiry_month = ?) )
          AND ( (expiry_year IS NULL AND ? IS NULL) OR (expiry_year = ?) )
          AND id != ?
      `;
      const potentialMatches = finalTypeId ? await db.getAllAsync<any>(
        existingSearchQuery, 
        [
          Number(finalTypeId), finalSize, selectedCabinetId, 
          expMVal, expMVal, expYVal, expYVal, 
          editBatchId ? Number(editBatchId) : -1
        ]
      ) : [];
      console.log(`[MERGE_DIAG] Potential matches for Type ${finalTypeId}, Size ${finalSize}, Cab ${selectedCabinetId}:`, potentialMatches.length);

      // Update freeze limit on type if modified
      if (finalTypeId && isFreezerMode) {
        await db.runAsync('UPDATE ItemTypes SET freeze_months = ? WHERE id = ?', [fLimit, Number(finalTypeId)]);
        // Recalculate expiry for all batches of this type to maintain data integrity
        const batchesToSync = await db.getAllAsync<any>('SELECT id, entry_month, entry_year FROM Inventory WHERE item_type_id = ?', [Number(finalTypeId)]);
        for (const b of batchesToSync) {
           if (b.entry_month && b.entry_year) {
             let m = b.entry_month + fLimit;
             let y = b.entry_year;
             while (m > 12) { m -= 12; y += 1; }
             await db.runAsync('UPDATE Inventory SET expiry_month = ?, expiry_year = ? WHERE id = ?', [m, y, b.id]);
           }
        }
      }

      const savePayload: NewBatchData = {
        typeId: Number(finalTypeId),
        q,
        finalSize,
        expMVal,
        expYVal,
        batchIntel: cleanNewIntel || null,
        supplier: cleanNewSupplier || null,
        productRange: cleanNewRange || null,
        portions_total: finalPortionsTotal,
        portions_remaining: finalPortionsRemaining,
        selectedCabinetId: Number(selectedCabinetId),
        entryM,
        entryY,
        entryD: currentDay
      };

      if (finalTypeId && !editBatchId) {
        const candidates = await Database.Consolidation.findCandidates(db, {
          typeId: Number(finalTypeId),
          size: finalSize,
          cabinetId: Number(selectedCabinetId),
          expiryMonth: expMVal,
          expiryYear: expYVal,
          excludeId: editBatchId ? Number(editBatchId) : undefined,
          newSupplier: cleanNewSupplier || null,
          newRange: cleanNewRange || null
        });

        // Check for exact match (silent merge)
        const exactMatch = candidates.find(m => {
          const intelMatch = (m.batch_intel?.trim() || null)?.toLowerCase() === (cleanNewIntel || null)?.toLowerCase();
          const supplierMatch = (m.supplier || null)?.toLowerCase() === (cleanNewSupplier || null)?.toLowerCase();
          const rangeMatch = (m.product_range || null)?.toLowerCase() === (cleanNewRange || null)?.toLowerCase();
          // We can't strictly check portions here since we don't return it in findCandidates yet.
          // The old logic did, so let's just use the exact match on metadata.
          return intelMatch && supplierMatch && rangeMatch;
        });

        if (exactMatch) {
          console.log(`[MERGE_DIAG] Exact match found:`, exactMatch.id);
          await finalizeCommit(exactMatch.id, savePayload);
        } else if (candidates.length > 0) {
          console.log(`[MERGE_DIAG] ${candidates.length} candidates found for modal.`);
          setMergeCandidates(candidates);
          setDeferredSave(savePayload);
          setShowMergeModal(true);
          return;
        } else {
          // Only challenge if: No default, no manual override, stock exists in OTHER cabinets, and NO stock here.
        if (finalTypeId) {
          const typeRes = await db.getFirstAsync<{default_cabinet_id: number | null}>('SELECT default_cabinet_id FROM ItemTypes WHERE id = ?', [Number(finalTypeId)]);
          if (!hasManuallyChangedCabinet && !typeRes?.default_cabinet_id) {
            // Check if we ALREADY have stock of this item in the currently selected cabinet
            const existingHere = await db.getFirstAsync<any>('SELECT id FROM Inventory WHERE item_type_id = ? AND cabinet_id = ? LIMIT 1', [Number(finalTypeId), selectedCabinetId]);
            
            if (!existingHere) {
               const others = await Database.Cabinets.getStorageSitesForItemType(db, Number(finalTypeId), Number(selectedCabinetId));
              if (others.length > 0) {
                setOtherLocations(others.map(o => ({ id: o.id, name: o.name })));
                setDeferredSave({ typeId: finalTypeId, finalSize, q, currentMonth, currentYear, currentDay, expMVal, expYVal, entryM, entryY, entryD: currentDay, selectedCabinetId, batchIntel: cleanNewIntel, supplier: cleanNewSupplier, productRange: cleanNewRange, portions_total: finalPortionsTotal, portions_remaining: finalPortionsRemaining });
                setShowLocationConflictModal(true);
                return;
              } else {
                // --- SCENARIO 4: VANGUARD HANDSHAKE ---
                // First arrival, no default, no manual intent, AND hasn't been resolved yet.
                const typeStatus = await db.getFirstAsync<{vanguard_resolved: number}>('SELECT vanguard_resolved FROM ItemTypes WHERE id = ?', [Number(finalTypeId)]);
                if (!typeStatus?.vanguard_resolved) {
                  const savePayload = { typeId: finalTypeId, finalSize, q, currentMonth, currentYear, currentDay, expMVal, expYVal, entryM, entryY, entryD: currentDay, selectedCabinetId, batchIntel: cleanNewIntel, supplier: cleanNewSupplier, productRange: cleanNewRange, portions_total: finalPortionsTotal, portions_remaining: finalPortionsRemaining };
                  setDeferredSave(savePayload);
                  setShowVanguardModal(true);
                  return;
                }
              }
            }
          }
        }
          await finalizeCommit(null, savePayload);
        }
      } else {
        await finalizeCommit(null, savePayload);
      }
    } catch (err: any) {
      console.error('Save failed:', err);
      Alert.alert('Save Failed', err.message);
    }
  };

  // Sync ref after every render so resumePipeline always calls the freshest closure
  useLayoutEffect(() => {
    handleSaveRef.current = handleSave;
  });

  const triggerSave = () => {
    isAutoSavePipeline.current = true;
    handleSave();
  };

  const finalizeCommit = async (mergeTargetId: number | null, data: any, mergeStrategy: 'ADOPT' | 'STRIP' | 'NORMAL' = 'NORMAL') => {
    try {
      const type = await db.getFirstAsync<any>('SELECT name FROM ItemTypes WHERE id = ?', [Number(data.typeId)]);
      
      if (mergeTargetId) {
        // Fetch current state to ensure we handle NULLs correctly during transition
        const existing = await db.getFirstAsync<any>('SELECT quantity, portions_total, portions_remaining, supplier, product_range, batch_intel FROM Inventory WHERE id = ?', [mergeTargetId]);
        const currentTotal = existing?.portions_total || data.portions_total || 0;
        const currentRem = existing?.portions_remaining !== null ? existing.portions_remaining : (existing?.quantity || 0) * currentTotal;
        const addedRem = data.q * (data.portions_total || currentTotal);

        let finalS = data.supplier;
        let finalR = data.productRange;
        let finalI = data.batchIntel;

        if (mergeStrategy === 'ADOPT') {
           finalS = data.supplier || existing?.supplier || null;
           finalR = data.productRange || existing?.product_range || null;
           finalI = data.batchIntel || existing?.batch_intel || null;
        } else if (mergeStrategy === 'STRIP') {
           finalS = null;
           finalR = null;
           finalI = null;
        } else {
           // NORMAL/Existing logic: Preserve existing
           finalS = existing?.supplier || null;
           finalR = existing?.product_range || null;
           finalI = existing?.batch_intel || null;
        }

        await db.runAsync(
          'UPDATE Inventory SET quantity = quantity + ?, supplier = ?, product_range = ?, batch_intel = ?, portions_total = ?, entry_month = ?, entry_year = ?, entry_day = ?, portions_remaining = ? WHERE id = ?',
          [data.q, finalS, finalR, finalI, currentTotal, data.entryM, data.entryY, data.entryD || 1, currentRem + addedRem, mergeTargetId]
        );
        await logTacticalAction(db, 'MERGE', 'BATCH', mergeTargetId, type?.name || 'Batch', 
          JSON.stringify({ q: data.q, size: data.finalSize, strategy: mergeStrategy }));
        
        if (editBatchId) {
          await db.runAsync('DELETE FROM Inventory WHERE id = ?', [Number(editBatchId)]);
        }
      } else if (editBatchId) {
        const old = await db.getFirstAsync<any>('SELECT * FROM Inventory WHERE id = ?', [Number(editBatchId)]);
        const diff: any = {};
        let finalRem = data.portions_remaining;
        if (old) {
           const norm = (v: any) => (v === null || v === undefined || v === '') ? null : v;
           if (norm(old.quantity) !== norm(data.q)) diff.quantity = data.q;
           if (norm(old.size) !== norm(data.finalSize)) diff.size = data.finalSize;
           if (norm(old.cabinet_id) !== norm(data.selectedCabinetId)) diff.location = data.selectedCabinetId;
           if (norm(old.expiry_month) !== norm(data.expMVal) || norm(old.expiry_year) !== norm(data.expYVal)) diff.expiry = `${data.expMVal}/${data.expYVal}`;
           if (norm(old.portions_total) !== norm(data.portions_total)) diff.portions = data.portions_total;
           if (norm(old.supplier) !== norm(data.supplier)) diff.supplier = data.supplier;
           if (norm(old.product_range) !== norm(data.productRange)) diff.range = data.productRange;
           if (norm(old.batch_intel) !== norm(data.batchIntel)) diff.intel = data.batchIntel;

           // --- PORTION CORRECTION LOGIC (SIMPLIFIED) ---
           if (data.portions_total && old.portions_total && old.portions_total !== data.portions_total) {
             finalRem = data.q * data.portions_total;
           } else if (!old.portions_total && data.portions_total) {
             finalRem = data.q * data.portions_total;
           }
        }

        await db.runAsync(
          'UPDATE Inventory SET quantity = ?, size = ?, expiry_month = ?, expiry_year = ?, entry_month = ?, entry_year = ?, entry_day = ?, cabinet_id = ?, batch_intel = ?, supplier = ?, product_range = ?, portions_total = ?, portions_remaining = ? WHERE id = ?',
          [data.q, data.finalSize, data.expMVal, data.expYVal, data.entryM, data.entryY, data.entryD || 1, data.selectedCabinetId, data.batchIntel || null, data.supplier || null, data.productRange || null, data.portions_total, finalRem, Number(editBatchId)]
        );
        await logTacticalAction(db, 'UPDATE', 'BATCH', Number(editBatchId), type?.name || 'Item', Object.keys(diff).length > 0 ? JSON.stringify(diff) : null);
      } else {
        const res = await db.runAsync(
          `INSERT INTO Inventory (item_type_id, quantity, size, expiry_month, expiry_year, entry_month, entry_year, entry_day, cabinet_id, batch_intel, supplier, product_range, portions_total, portions_remaining) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [Number(data.typeId), data.q, data.finalSize, data.expMVal, data.expYVal, data.entryM, data.entryY, data.entryD || 1, data.selectedCabinetId, data.batchIntel || null, data.supplier || null, data.productRange || null, data.portions_total, (data.portions_total && data.q > 1) ? (data.portions_remaining + (data.portions_total * (data.q - 1))) : data.portions_remaining]
        );
        await logTacticalAction(db, 'ADD', 'BATCH', Number(res.lastInsertRowId), type?.name || 'Item',
          JSON.stringify({ q: data.q, size: data.finalSize }));
      }

      if (data.selectedCabinetId) {
        await db.runAsync('INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)', ['last_used_cabinet_id', data.selectedCabinetId.toString()]);
      }

      if (editBatchId && typeId && selectedQuickAddCat) {
        await db.runAsync('UPDATE ItemTypes SET category_id = ? WHERE id = ?', [selectedQuickAddCat, Number(typeId)]);
      }

      // --- BARCODE SIGNATURE DOUBLE-COMMIT (Workflow A & Correction Logic) ---
      if (barcodeStr) {
        await db.runAsync(
          'INSERT OR REPLACE INTO BarcodeSignatures (barcode, item_type_id, supplier, size) VALUES (?, ?, ?, ?)',
          [barcodeStr, Number(data.typeId), data.supplier || null, data.finalSize || null]
        );
      }

      await markModified(db);
      setDeferredSave(null);
      router.replace({ pathname: '/', params: { targetCatId: categoryId ? Number(categoryId) : undefined, targetTypeId: typeId ? Number(typeId) : undefined, timestamp: Date.now().toString() } });
    } catch (err: any) {
      console.error('Commit failed:', err);
      Alert.alert('Commit Failed', err.message);
    }
  };



  const handleQuickAddType = async () => {
    if (!quickAddName.trim()) {
      Alert.alert('Validation Error', 'Item Name is required.');
      return;
    }
    if (!selectedQuickAddCat) {
      Alert.alert('Validation Error', 'You must select a Category for this new Item Type.');
      return;
    }
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
      await logTacticalAction(db, 'ADD', 'ITEM_TYPE', Number(newTypeId), quickAddName.trim());
      setShowQuickAddType(false);
      setQuickAddName('');
      // Update the URL params and trigger a reload - EXPLICITLY preserve barcode
      router.setParams({ typeId: newTypeId.toString(), isNewType: undefined, barcode: barcodeStr });
    } catch (e) {
      Alert.alert('Error', 'Could not create new item type.');
    }
  };

  const handleCabinetModalSuccess = async (id?: number) => {
    setShowCabinetModal(false);
    const updatedCabs = await Database.Cabinets.getAll(db);
    setCabinets(updatedCabs);
    
    if (id) {
      if (cabinetModalContext === 'quick_add') {
        setQuickAddDefaultCabinet(id);
      } else {
        setSelectedCabinetId(id);
      }
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
      await logTacticalAction(db, 'ADD', 'CATEGORY', Number(newCatId), newCatName.trim());
      
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

  // Each chip is { label: string (display), value: string (numeric) }
  // History chips lead so the user's most-used sizes are always visible first.
  const allChipsRaw: { label: string; value: string }[] = [
    ...customChips
      .map(r => ({ label: formatQuantity(r, unitType), value: r.replace(/[^0-9.]/g, '') }))
      .filter(c => c.label !== '' && c.value !== ''),
    ...genericChips.map(c => ({ label: c, value: getChipValue(c) })),
  ];
  const seenValues = new Set<string>();
  const allChips = allChipsRaw.filter(c => {
    if (seenValues.has(c.value)) return false;
    seenValues.add(c.value);
    return true;
  });

  // ─── PHASE 1: ITEM TYPE SPECIFICATION ───
  if (isNewType === '1' && !typeId) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
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
              <TextInput 
                style={styles.inputSmall} 
                value={quickAddSupplier} 
                onChangeText={(val) => { setQuickAddSupplier(val); updateSupplierSuggestions(val, 'quick'); }} 
                onBlur={handleSupplierFuzzyCheck}
                placeholder="Heinz, Nestle, Tesco..." 
                placeholderTextColor="#64748b" 
              />
            </View>
            <View style={{ height: 26, justifyContent: 'flex-start', alignItems: 'center', marginBottom: 8, flexDirection: 'row', gap: 6 }}>
              {!quickAddSupplier && mostFreqBrandSuggestion ? (
                <TouchableOpacity
                  style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', paddingLeft: 6, paddingRight: 8, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}
                  onPress={() => { setQuickAddSupplier(mostFreqBrandSuggestion); updateSupplierSuggestions(mostFreqBrandSuggestion, 'quick'); setSuggestedTypeAheadSuppliers([]); }}
                >
                  <MaterialCommunityIcons name="trending-up" size={11} color="#64748b" />
                  <Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>{mostFreqBrandSuggestion.toUpperCase()}</Text>
                </TouchableOpacity>
              ) : suggestedTypeAheadSuppliers.length > 0 && quickAddSupplier.length > 0 && (
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
              <TextInput
                style={styles.inputSmall}
                placeholder="Product Range (e.g. Dark Roast)"
                placeholderTextColor="#64748b"
                value={quickAddRange}
                onChangeText={(val) => { setQuickAddRange(val); updateRangeSuggestions(val); }}
                onBlur={handleRangeFuzzyCheck}
              />
            </View>
            <View style={{ height: 26, justifyContent: 'flex-start', alignItems: 'center', marginBottom: 8, flexDirection: 'row', gap: 6 }}>
              {!quickAddRange && mostFreqRangeSuggestion ? (
                <TouchableOpacity
                  style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', paddingLeft: 6, paddingRight: 8, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}
                  onPress={() => { setQuickAddRange(mostFreqRangeSuggestion); updateRangeSuggestions(mostFreqRangeSuggestion); setSuggestedTypeAheadRanges([]); }}
                >
                  <MaterialCommunityIcons name="trending-up" size={11} color="#64748b" />
                  <Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>{mostFreqRangeSuggestion.toUpperCase()}</Text>
                </TouchableOpacity>
              ) : suggestedTypeAheadRanges.length > 0 && quickAddRange.length > 0 && (
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
                  <TouchableOpacity 
                    key={cab.id} 
                    testID={`cabinet-chip-${cab.id}`}
                    style={[styles.chip, quickAddDefaultCabinet === cab.id && styles.chipActive]} 
                    onPress={() => setQuickAddDefaultCabinet(cab.id)}
                  >
                    <Text style={[styles.chipText, quickAddDefaultCabinet === cab.id && styles.chipTextActive]}>{cab.cabinet_type === 'freezer' ? '❄ ' : ''}{cab.name}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity 
                  style={[styles.chip, { borderColor: '#3b82f6', borderWidth: 1, backgroundColor: 'rgba(59, 130, 246, 0.1)' }]} 
                  onPress={() => { setCabinetModalContext('quick_add'); setShowCabinetModal(true); }}
                >
                  <Text style={[styles.chipText, { color: '#3b82f6' }]}>+ NEW CABINET</Text>
                </TouchableOpacity>
              </View>
              {cabinets.some(c => c.cabinet_type === 'freezer') && (
                <Text style={{ color: '#64748b', fontSize: 11, fontStyle: 'italic', marginTop: -2, marginBottom: 8 }}>❄ Designated Freezer Cabinet</Text>
              )}
            </View>
          </View>

          <TouchableOpacity 
            style={[styles.saveButton, { marginTop: 10, backgroundColor: '#3b82f6' }]} 
            onPress={handleQuickAddType}
            testID="deploy-spec-btn"
          >
            <Text style={styles.saveText}>DEPLOY SPECIFICATION</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* --- PHASE 1 ROOT LEVEL HARMONIZER --- */}
        {showBrandFuzzyModal && (
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { borderColor: '#f59e0b', borderWidth: 2, width: '90%', maxWidth: 400, maxHeight: '85%' }]}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <NearMissIcon />
                  <Text style={[styles.modalTitle, { marginBottom: 0 }]}>NEAR MISS DETECTED</Text>
                </View>
                
                <Text style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 18, marginBottom: 20 }}>
                  <Text style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: 15 }}>{(showQuickAddType ? quickAddSupplier : supplier)}</Text> appears to be a possible near miss. Align this <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>brand/supplier</Text> entry with the established vocabulary for this field?
                </Text>

                <View style={{ marginBottom: 10, gap: 8 }}>
                  {fuzzyBrandMatches.map(match => (
                    <TouchableOpacity 
                      key={match}
                      style={{ backgroundColor: '#1e293b', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#334155', flexDirection: 'row', alignItems: 'center', gap: 10 }}
                      onPress={async () => {
                        if (showQuickAddType) setQuickAddSupplier(match);
                        else setSupplier(match);
                        setShowBrandFuzzyModal(false);
                      }}
                    >
                      <MaterialCommunityIcons name="check-circle" size={18} color="#22c55e" />
                      <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>ALIGN TO: {match.toUpperCase()}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity 
                  style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#475569', flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}
                  onPress={async () => {
                     setIgnoredFuzzyBrands(prev => new Set(prev).add((showQuickAddType ? quickAddSupplier : supplier).trim().toLowerCase()));
                     setShowBrandFuzzyModal(false);
                  }}
                >
                  <MaterialCommunityIcons name="plus-circle-outline" size={18} color="#94a3b8" />
                  <Text style={{ color: '#cbd5e1', fontWeight: 'bold' }}>NO, THIS IS INTENTIONAL</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        )}

        {/* RANGE FUZZY MODAL */}
        {showRangeFuzzyModal && (
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { borderColor: '#f59e0b', borderWidth: 2, width: '90%', maxWidth: 400 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <NearMissIcon />
                <Text style={[styles.modalTitle, { marginBottom: 0 }]}>NEAR MISS DETECTED</Text>
              </View>
              <Text style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 18, marginBottom: 20 }}>
                <Text style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: 15 }}>{(showQuickAddType ? quickAddRange : productRange)}</Text> appears to be a possible near miss. Align this <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>product range</Text> entry with the established vocabulary for this field?
              </Text>
              <View style={{ marginBottom: 10, gap: 8 }}>
                {fuzzyRangeMatches.map(match => (
                  <TouchableOpacity 
                    key={match}
                    style={{ backgroundColor: '#1e293b', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#334155', flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    onPress={async () => {
                      if (showQuickAddType) setQuickAddRange(match);
                      else setProductRange(match);
                      setShowRangeFuzzyModal(false);
                    }}
                  >
                    <MaterialCommunityIcons name="check-circle" size={18} color="#22c55e" />
                    <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>ALIGN TO: {match.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity 
                style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#475569', flexDirection: 'row', alignItems: 'center', gap: 10 }}
                onPress={async () => {
                   setIgnoredFuzzyRanges(prev => new Set(prev).add((showQuickAddType ? quickAddRange : productRange).trim().toLowerCase()));
                   setShowRangeFuzzyModal(false);
                }}
              >
                <MaterialCommunityIcons name="plus-circle-outline" size={18} color="#94a3b8" />
                <Text style={{ color: '#cbd5e1', fontWeight: 'bold' }}>NO, THIS IS INTENTIONAL</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* RE-RENDER MODALS IN THIS BRANCH AS VIEW OVERLAYS */}
        {showAddCategory && (
          <View style={styles.modalOverlay}><View style={styles.modalContent}>
            <Text style={styles.modalTitle}>DEPLOY CATEGORY</Text>
            <View style={{ marginBottom: 16 }}>
               <Text style={styles.miniLabel}>CATEGORY NAME</Text>
               <TextInput style={styles.inputSmall} value={newCatName} onChangeText={setNewCatName} placeholder="e.g. Spices" placeholderTextColor="#64748b" autoFocus />
            </View>
            <TouchableOpacity style={styles.saveButton} onPress={handleCreateCategory}><Text style={styles.saveText}>CREATE CATEGORY</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowAddCategory(false)}><Text style={styles.modalCloseText}>CANCEL</Text></TouchableOpacity>
          </View></View>
        )}
      </View>
    );
  }

  // ─── PHASE 2: BATCH LOGISTICS ───
  return (
    <View style={[styles.container, { padding: 0 }]}>

      <ScrollView 
        ref={mainScrollRef}
        style={styles.container} 
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
             <Text style={styles.title}>{editBatchId ? 'UPDATE BATCH' : 'ADD BATCH'}</Text>
             <Text style={styles.subTitle}>{typeName}</Text>
          </View>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()} testID="cancel-btn">
            <MaterialCommunityIcons name="close" size={24} color="#f8fafc" />
          </TouchableOpacity>
        </View>

      <View 
        style={[styles.formGroup, errorField === 'quantity' && { borderColor: '#ef4444', borderWidth: 1, borderRadius: 8, padding: 4 }]} 
        onLayout={(e) => quantitySectionY.current = e.nativeEvent.layout.y}
        testID="qty-field-container"
      >
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
        {errorField === 'quantity' && <Text style={styles.errorText} testID="qty-error">{errorMsg}</Text>}
      </View>

      <View 
        style={[styles.formGroup, errorField === 'size' && { borderColor: '#ef4444', borderWidth: 1, borderRadius: 8, padding: 4 }]} 
        onLayout={(e) => sizeSectionY.current = e.nativeEvent.layout.y}
        testID="size-field-container"
      >
        <Text style={styles.label}>Size (Choose or Type)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsContainer}>
          {allChips.map(c => (
            <TouchableOpacity 
              key={c.value} 
              testID={size === c.value ? 'active-size-chip' : `size-chip-${c.value}`}
              style={[styles.chip, size === c.value && styles.chipActive]} 
              onPress={() => {
                setSize(c.value);
                setErrorField(null);
              }}
            >
              <Text style={[styles.chipText, size === c.value && styles.chipTextActive]}>
                {c.label}
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
            <Text style={styles.unitLabel} testID="unit-label">{getUnitSuffix(unitType)}</Text>
          )}
        </View>
        {errorField === 'size' && <Text style={styles.errorText} testID="size-error">{errorMsg}</Text>}
      </View>

      {editBatchId ? (
        <View style={styles.formGroup}>
          <Text style={styles.label}>Item Category</Text>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8}}>
            {categories.map(cat => (
              <TouchableOpacity 
                key={cat.id} 
                style={[styles.chip, selectedQuickAddCat === cat.id && styles.chipActive]} 
                onPress={() => setSelectedQuickAddCat(cat.id)}
              >
                <Text style={[styles.chipText, selectedQuickAddCat === cat.id && styles.chipTextActive]}>
                  {cat.name}
                </Text>
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
      ) : null}

      <View style={styles.formGroup}>
        <Text style={styles.label}>Storage Cabinet</Text>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8}}>
          {cabinets.map(cab => (
            <TouchableOpacity 
              key={cab.id} 
              testID={selectedCabinetId === cab.id ? 'active-cabinet-chip' : `cabinet-chip-${cab.id}`}
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
            onPress={() => { setCabinetModalContext('main'); setShowCabinetModal(true); }}
          >
            <Text style={[styles.chipText, { color: '#3b82f6' }]}>+ NEW CABINET</Text>
          </TouchableOpacity>
        </View>
        {cabinets.some(c => c.cabinet_type === 'freezer') && (
            <Text style={{ color: '#64748b', fontSize: 11, fontStyle: 'italic', marginTop: -2, marginBottom: 8 }}>❄ Designated Freezer Cabinet</Text>
        )}
      </View>

      {/* ─── EXPIRY / DATE FROZEN (moved up - quasi-mandatory) ─── */}
      {isFreezerMode ? (
        <View style={styles.formGroup} onLayout={(e) => freezeSectionY.current = e.nativeEvent.layout.y}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <MaterialCommunityIcons name="snowflake" size={16} color="#60a5fa" />
            <Text style={[styles.label, { marginBottom: 0, color: '#60a5fa' }]}>Date Frozen</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={[styles.input, { flex: 1, alignItems: 'center' }]}
              onPress={() => setShowFreezeMonthPicker(!showFreezeMonthPicker)}
              testID="freeze-month-trigger"
            >
              <Text style={{ color: freezeMonth ? '#f8fafc' : '#64748b', fontSize: 16 }}>
                {freezeMonth ? `Month: ${freezeMonth.toString().padStart(2, '0')}` : 'Month'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.input, { flex: 1, alignItems: 'center' }]}
              onPress={() => setShowFreezeYearPicker(!showFreezeYearPicker)}
              testID="freeze-year-trigger"
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
                <TouchableOpacity key={m} style={[styles.dateChip, freezeMonth === m.toString() && styles.chipActive]} onPress={() => { setFreezeMonth(m.toString()); setShowFreezeMonthPicker(false); }} testID={`freeze-month-option-${m}`}>
                  <Text style={[styles.chipText, freezeMonth === m.toString() && styles.chipTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {showFreezeYearPicker && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsContainer}>
              {Array.from({length: 4}, (_, i) => currentYear - i).reverse().map(y => (
                <TouchableOpacity key={y} style={[styles.dateChip, freezeYear === y.toString() && styles.chipActive]} onPress={() => { setFreezeYear(y.toString()); setShowFreezeYearPicker(false); }} testID={`freeze-year-option-${y}`}>
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
        <View 
          style={[styles.formGroup, errorField === 'expiry' && { borderColor: '#ef4444', borderWidth: 1, borderRadius: 8, padding: 4 }]} 
          onLayout={(e) => { expirySectionY.current = e.nativeEvent.layout.y; }}
          testID="expiry-field-container"
        >

          {/* PINNED DATE BADGE — always visible above keyboard */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialCommunityIcons name="calendar-clock" size={18} color="#3b82f6" />
              <Text style={styles.label}>Expiry Date</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(59, 130, 246, 0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#3b82f633' }}
                onPress={() => setShowExpiryScanner(true)}
              >
                <MaterialCommunityIcons name="camera" size={16} color="#3b82f6" />
                <Text style={{ color: '#3b82f6', fontSize: 11, fontWeight: 'bold' }}>SCAN</Text>
              </TouchableOpacity>
              {(expiryMonth !== '' || expiryYear !== '') && (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  onPress={() => { setExpiryMonth(''); setExpiryYear(''); setWasScanned(false); }}
                >
                  <MaterialCommunityIcons name="calendar-remove" size={14} color="#ef4444" />
                  <Text style={styles.clearDateText}>NO DATE MARK</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* PROMINENT SELECTED DATE DISPLAY */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0f172a',
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: wasScanned ? '#3b82f6' : (expiryMonth && expiryYear) ? '#334155' : '#1e293b',
            shadowColor: '#3b82f6',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: wasScanned ? 0.5 : 0,
            shadowRadius: 10,
            elevation: wasScanned ? 5 : 0,
            padding: 14,
            marginBottom: 12,
            gap: 6,
            position: 'relative'
          }}>
            {wasScanned && (
              <View style={{ position: 'absolute', top: -8, right: 12, backgroundColor: '#3b82f6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <MaterialCommunityIcons name="eye-check" size={10} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 8, fontWeight: 'bold', letterSpacing: 0.5 }}>SCANNED</Text>
              </View>
            )}
            <Text style={{
              color: expiryMonth ? '#f8fafc' : '#475569',
              fontSize: 26,
              fontWeight: '900',
              letterSpacing: 2,
              fontVariant: ['tabular-nums']
            }}>
              {expiryMonth ? expiryMonth.toString().padStart(2, '0') : 'MM'}
            </Text>
            <Text style={{ color: '#475569', fontSize: 22, fontWeight: '300' }}>/</Text>
            <Text style={{
              color: expiryYear ? '#f8fafc' : '#475569',
              fontSize: 26,
              fontWeight: '900',
              letterSpacing: 2,
              fontVariant: ['tabular-nums']
            }}>
              {expiryYear || 'YYYY'}
            </Text>
          </View>

          {/* PICKER TRIGGERS */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
            <TouchableOpacity
              style={[styles.input, { flex: 1, alignItems: 'center', borderColor: showMonthPicker ? '#3b82f6' : '#334155' }]}
              onPress={() => { setShowMonthPicker(!showMonthPicker); setShowYearPicker(false); setWasScanned(false); }}
              testID="expiry-month-trigger"
            >
              <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' }}>MONTH</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.input, { flex: 1, alignItems: 'center', borderColor: showYearPicker ? '#3b82f6' : '#334155' }]}
              onPress={() => { setShowYearPicker(!showYearPicker); setShowMonthPicker(false); setWasScanned(false); }}
              testID="expiry-year-trigger"
            >
              <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' }}>YEAR</Text>
            </TouchableOpacity>
          </View>

          {showMonthPicker && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsContainer}>
              {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                <TouchableOpacity key={m} style={[styles.dateChip, expiryMonth === m.toString() && styles.chipActive]} onPress={() => { setExpiryMonth(m.toString()); setShowMonthPicker(false); expiryTouched.current = true; }} testID={`expiry-month-option-${m}`}>
                  <Text style={[styles.chipText, expiryMonth === m.toString() && styles.chipTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {showYearPicker && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsContainer}>
              {Array.from({length: 15}, (_, i) => currentYear + i).map(y => (
                <TouchableOpacity key={y} style={[styles.dateChip, expiryYear === y.toString() && styles.chipActive]} onPress={() => { setExpiryYear(y.toString()); setShowYearPicker(false); expiryTouched.current = true; }} testID={`expiry-year-option-${y}`}>
                  <Text style={[styles.chipText, expiryYear === y.toString() && styles.chipTextActive]}>{y}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* ─── OPTIONAL DETAILS CARD ─── */}
      <View
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1e293b', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderWidth: 1, borderColor: '#334155', marginBottom: 0 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MaterialCommunityIcons name="tune-variant" size={16} color="#64748b" />
          <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold', letterSpacing: 0.5 }}>OPTIONAL DETAILS</Text>
          {(supplier || productRange || batchIntel) ? (
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {supplier ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#3b82f6' }} /> : null}
              {productRange ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#3b82f6' }} /> : null}
              {batchIntel ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#3b82f6' }} /> : null}
            </View>
          ) : null}
        </View>
      </View>

      <View style={{ backgroundColor: '#1e293b', borderWidth: 1, borderTopWidth: 0, borderColor: '#334155', borderBottomLeftRadius: 8, borderBottomRightRadius: 8, marginBottom: 16, padding: 16, gap: 16 }}>

          {/* Brand / Supplier */}
          <View>
            <Text style={styles.label}>Brand / Supplier</Text>
        <TextInput 
          style={[styles.input, { backgroundColor: '#0f172a' }]} 
          value={supplier} 
          onChangeText={(val) => {
            setSupplier(val);
            updateSupplierSuggestions(val, 'main');
          }} 
          onSubmitEditing={(e) => { isAutoSavePipeline.current = false; handleSupplierFuzzyCheck(e.nativeEvent.text); }}
          placeholder="e.g. Heinz, Nestle, Tesco, Walmart..."
          placeholderTextColor="#64748b"
          testID="supplier-input"
        />
        <View style={{ height: 26, justifyContent: 'flex-start', alignItems: 'center', marginTop: 4, flexDirection: 'row', gap: 6 }}>
          {!supplier && (defaultBrandSuggestion || mostFreqBrandSuggestion) ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {defaultBrandSuggestion === mostFreqBrandSuggestion ? (
                <TouchableOpacity
                  style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', paddingLeft: 6, paddingRight: 8, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}
                  onPress={() => { setSupplier(defaultBrandSuggestion!); updateSupplierSuggestions(defaultBrandSuggestion!, 'main'); setSuggestedTypeAheadSuppliers([]); }}
                >
                  <MaterialCommunityIcons name="history" size={11} color="#64748b" />
                  <Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>{defaultBrandSuggestion!.toUpperCase()}</Text>
                  <Text style={{color: '#64748b', fontSize: 9, fontStyle: 'italic'}}>Last Logged & Most Frequent</Text>
                </TouchableOpacity>
              ) : (
                <>
                  {defaultBrandSuggestion && (
                    <TouchableOpacity
                      style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', paddingLeft: 6, paddingRight: 8, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}
                      onPress={() => { setSupplier(defaultBrandSuggestion); updateSupplierSuggestions(defaultBrandSuggestion, 'main'); setSuggestedTypeAheadSuppliers([]); }}
                    >
                      <MaterialCommunityIcons name="history" size={11} color="#64748b" />
                      <Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>{defaultBrandSuggestion.toUpperCase()}</Text>
                      <Text style={{color: '#64748b', fontSize: 9, fontStyle: 'italic'}}>Last Logged</Text>
                    </TouchableOpacity>
                  )}
                  {mostFreqBrandSuggestion && (
                    <TouchableOpacity
                      style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', paddingLeft: 6, paddingRight: 8, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}
                      onPress={() => { setSupplier(mostFreqBrandSuggestion); updateSupplierSuggestions(mostFreqBrandSuggestion, 'main'); setSuggestedTypeAheadSuppliers([]); }}
                    >
                      <MaterialCommunityIcons name="trending-up" size={11} color="#64748b" />
                      <Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>{mostFreqBrandSuggestion.toUpperCase()}</Text>
                      <Text style={{color: '#64748b', fontSize: 9, fontStyle: 'italic'}}>Most Frequent</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          ) : suggestedTypeAheadSuppliers.length > 0 && supplier.length > 0 && (
            <View style={{flexDirection: 'row', gap: 4}}>
              {suggestedTypeAheadSuppliers.map(s => {
                const isCore = Object.keys(SUPPLIERS_DATA).some(k => k.toLowerCase() === s.toLowerCase()) || 
                               Object.keys(BRANDS_DATA).some(k => k.toLowerCase() === s.toLowerCase());
                return (
                  <View key={s} style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingLeft: 6, paddingRight: isCore ? 6 : 4, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}>
                    <TouchableOpacity 
                      onPress={() => { setSupplier(s); setSuggestedTypeAheadSuppliers([]); }}
                      testID={`supplier-suggestion-${s.toLowerCase().replace(/\s+/g, '-')}`}
                    >
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

          {/* Range */}
          <View>
            <Text style={styles.label}>Range (Optional)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: '#0f172a' }]}
          placeholder="e.g. Finest, Essential, Gastropub..."
          placeholderTextColor="#64748b"
          value={productRange}
          onChangeText={(val) => { setProductRange(val); updateRangeSuggestions(val); }}
          onSubmitEditing={(e) => { isAutoSavePipeline.current = false; handleRangeFuzzyCheck(e.nativeEvent.text); }}
          testID="product-range-input"
        />
        <View style={{ height: 26, justifyContent: 'flex-start', alignItems: 'center', marginTop: 4, flexDirection: 'row', gap: 6 }}>
          {!productRange && (defaultRangeSuggestion || mostFreqRangeSuggestion) ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {defaultRangeSuggestion === mostFreqRangeSuggestion ? (
                <TouchableOpacity
                  style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', paddingLeft: 6, paddingRight: 8, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}
                  onPress={() => { setProductRange(defaultRangeSuggestion!); updateRangeSuggestions(defaultRangeSuggestion!); setSuggestedTypeAheadRanges([]); }}
                >
                  <MaterialCommunityIcons name="history" size={11} color="#64748b" />
                  <Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>{defaultRangeSuggestion!.toUpperCase()}</Text>
                  <Text style={{color: '#64748b', fontSize: 9, fontStyle: 'italic'}}>Last Logged & Most Frequent</Text>
                </TouchableOpacity>
              ) : (
                <>
                  {defaultRangeSuggestion && (
                    <TouchableOpacity
                      style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', paddingLeft: 6, paddingRight: 8, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}
                      onPress={() => { setProductRange(defaultRangeSuggestion); updateRangeSuggestions(defaultRangeSuggestion); setSuggestedTypeAheadRanges([]); }}
                    >
                      <MaterialCommunityIcons name="history" size={11} color="#64748b" />
                      <Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>{defaultRangeSuggestion.toUpperCase()}</Text>
                      <Text style={{color: '#64748b', fontSize: 9, fontStyle: 'italic'}}>Last Logged</Text>
                    </TouchableOpacity>
                  )}
                  {mostFreqRangeSuggestion && (
                    <TouchableOpacity
                      style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', paddingLeft: 6, paddingRight: 8, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}
                      onPress={() => { setProductRange(mostFreqRangeSuggestion); updateRangeSuggestions(mostFreqRangeSuggestion); setSuggestedTypeAheadRanges([]); }}
                    >
                      <MaterialCommunityIcons name="trending-up" size={11} color="#64748b" />
                      <Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>{mostFreqRangeSuggestion.toUpperCase()}</Text>
                      <Text style={{color: '#64748b', fontSize: 9, fontStyle: 'italic'}}>Most Frequent</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          ) : suggestedTypeAheadRanges.length > 0 && productRange.length > 0 && (
            <View style={{flexDirection: 'row', gap: 4}}>
              {suggestedTypeAheadRanges.map(r => (
                <View key={r} style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingLeft: 6, paddingRight: 4, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}>
                  <TouchableOpacity 
                    onPress={() => { setProductRange(r); setSuggestedTypeAheadRanges([]); }}
                    testID={`range-suggestion-${r.toLowerCase().replace(/\s+/g, '-')}`}
                  >
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


          {/* Batch Intel */}
          <View>
            <Text style={styles.label}>Batch Intel</Text>
            <TextInput 
              style={[styles.input, { backgroundColor: '#0f172a' }]} 
              value={batchIntel} 
              onChangeText={setBatchIntel} 
              placeholder="Flavour, condition, reserve status, or tactical details..."
              placeholderTextColor="#64748b"
              testID="batch-intel-input"
            />
          </View>

          {/* FRACTIONAL CONSUMPTION (Sergeant+) */}
          {checkEntitlement('OPEN_CONSUMPTION') && (
            <View style={{ marginTop: 24 }}>
              <Text style={styles.label}>Portion Tracking</Text>
              
              <View style={{ backgroundColor: '#111827', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: isFractionalEnabled ? '#1e3a5f' : '#1e293b', opacity: isFractionalEnabled ? 1 : 0.7 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={{ color: isFractionalEnabled ? '#60a5fa' : '#94a3b8', fontSize: 13, fontWeight: 'bold' }}>
                    STATUS: {isFractionalEnabled ? 'ACTIVE' : 'INACTIVE'}
                  </Text>
                  <Switch 
                    value={isFractionalEnabled} 
                    onValueChange={setIsFractionalEnabled}
                    trackColor={{ false: "#334155", true: "#3b82f6" }}
                    thumbColor={isFractionalEnabled ? "#ffffff" : "#94a3b8"}
                  />
                </View>

                <Text style={{ color: '#64748b', fontSize: 11, fontStyle: 'italic', lineHeight: 15, marginBottom: 16 }}>
                  If this item will be consumed in multiple usage portions rather than all at once (e.g. decanting 500ml of oil at a time from a 5L bottle into a kitchen container), how many portions is it likely to be divided into?
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: '#1e293b', paddingTop: 16 }}>
                  <View style={styles.stepperMini}>
                    <TouchableOpacity 
                      style={styles.stepButtonMini} 
                      disabled={!isFractionalEnabled}
                      onPress={() => setBulkSegments(prev => Math.max(1, parseInt(prev || '5') - 1).toString())}
                    >
                      <MaterialCommunityIcons name="minus" size={18} color={isFractionalEnabled ? "white" : "#475569"} />
                    </TouchableOpacity>
                    <TextInput 
                      style={styles.stepInputMini} 
                      value={bulkSegments || (isFractionalEnabled ? '5' : '')} 
                      onChangeText={setBulkSegments}
                      disabled={!isFractionalEnabled}
                      placeholder="Off"
                      placeholderTextColor="#475569"
                      keyboardType="numeric"
                    />
                    <TouchableOpacity 
                      style={styles.stepButtonMini} 
                      disabled={!isFractionalEnabled}
                      onPress={() => setBulkSegments(prev => (parseInt(prev || '5') + 1).toString())}
                    >
                      <MaterialCommunityIcons name="plus" size={18} color={isFractionalEnabled ? "white" : "#475569"} />
                    </TouchableOpacity>
                  </View>
                  
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: isFractionalEnabled ? '#60a5fa' : '#475569', fontSize: 11, fontWeight: 'bold' }}>
                      {isFractionalEnabled ? `${bulkSegments || '5'} PORTIONS DEFINED` : 'TRACKING INACTIVE'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}
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
                  setHasManuallyChangedCabinet(true);
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
              onPress={() => { 
                setShowCabinetPicker(false); 
                setCabinetModalContext('main');
                setShowCabinetModal(true); 
              }}
            >
              <Text style={{ color: '#3b82f6', fontWeight: 'bold' }}>+ DEPLOY NEW CABINET</Text>
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
        <TouchableOpacity style={styles.saveButton} onPress={triggerSave} testID="save-stock-btn">
          <Text style={styles.saveText}>{editBatchId ? 'UPDATE BATCH' : 'SAVE TO BATCHES'}</Text>
        </TouchableOpacity>
      )}

    </ScrollView>

      {/* --- CABINET PICKER --- */}
      <Modal visible={showCabinetPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>CHOOSE STORAGE SITE</Text>
            <ScrollView>
              {cabinets.map(cab => (
                <TouchableOpacity 
                  key={cab.id} 
                  style={[styles.modalItem, selectedCabinetId === cab.id && styles.modalItemActive]} 
                  onPress={() => { setSelectedCabinetId(Number(cab.id)); setHasManuallyChangedCabinet(true); setShowCabinetPicker(false); }}
                >
                  <Text style={[styles.modalItemText, selectedCabinetId === cab.id && styles.modalItemTextActive]}>
                    {cab.cabinet_type === 'freezer' ? '❄ ' : ''}{cab.name.toUpperCase()}
                  </Text>
                  {selectedCabinetId === cab.id && <MaterialCommunityIcons name="check-circle" size={20} color="#3b82f6" />}
                </TouchableOpacity>
              ))}
              <TouchableOpacity 
                style={[styles.modalItem, { borderBottomWidth: 0, marginTop: 10 }]} 
                onPress={() => { 
                  setShowCabinetPicker(false); 
                  setCabinetModalContext('main');
                  setShowCabinetModal(true); 
                }}
              >
                <Text style={[styles.modalItemText, { color: '#3b82f6', fontWeight: 'bold' }]}>+ DEPLOY NEW CABINET</Text>
              </TouchableOpacity>
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowCabinetPicker(false)}>
              <Text style={styles.modalCloseText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- EXPIRY OMISSION WARNING MODAL --- */}
      <Modal visible={showExpiryWarningModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { borderColor: '#f59e0b', borderWidth: 2, width: '88%', maxWidth: 420 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <MaterialCommunityIcons name="clock-alert-outline" size={26} color="#f59e0b" />
              <Text style={[styles.modalTitle, { marginBottom: 0, color: '#f59e0b' }]}>EXPIRY NOT SET</Text>
            </View>
            <Text style={{ color: '#94a3b8', fontSize: 14, lineHeight: 20, marginBottom: 20 }}>
              {`You haven't selected an expiry date. The batch will be recorded as expiring `}
              <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>this month</Text>
              {`, which is likely incorrect.\n\nDid you mean to set a different date?`}
            </Text>
            <View style={{ gap: 10 }}>
              <TouchableOpacity
                testID="expiry-warning-set-date-btn"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  backgroundColor: '#f59e0b',
                  borderRadius: 12,
                  paddingVertical: 14,
                  paddingHorizontal: 20,
                }}
                onPress={() => {
                  setShowExpiryWarningModal(false);
                  setTimeout(() => {
                    setShowMonthPicker(true);
                    setShowYearPicker(false);
                    // Scroll to the expiry section so it's not hidden by keyboard
                    mainScrollRef.current?.scrollTo({ y: expirySectionY.current - 10, animated: true });
                  }, 200);
                }}
              >
                <MaterialCommunityIcons name="calendar-edit" size={20} color="#000" />
                <Text style={{ color: '#000', fontSize: 14, fontWeight: '900', letterSpacing: 1 }}>SET EXPIRY DATE</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="expiry-warning-save-anyway-btn"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  backgroundColor: '#1e293b',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#334155',
                  paddingVertical: 12,
                  paddingHorizontal: 20,
                }}
                onPress={() => {
                  setShowExpiryWarningModal(false);
                  expiryTouched.current = true;
                  handleSave();
                }}
              >
                <MaterialCommunityIcons name="check" size={18} color="#64748b" />
                <Text style={{ color: '#64748b', fontSize: 13, fontWeight: 'bold', letterSpacing: 0.5 }}>SAVE ANYWAY (EXPIRES THIS MONTH)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {deferredSave && (
        <ConsolidationCarousel 
          visible={showMergeModal}
          db={db}
          candidates={mergeCandidates}
          newData={deferredSave}
          unitType={unitType}
          onClose={() => setShowMergeModal(false)}
          onSuccess={(id) => {
            setShowMergeModal(false);
            setDeferredSave(null);
            router.replace({ pathname: '/', params: { targetCatId: categoryId ? Number(categoryId) : undefined, targetTypeId: typeId ? Number(typeId) : undefined, timestamp: Date.now().toString() } });
          }}
        />
      )}
      {/* --- LOCATION CONFLICT MODAL --- */}
      {showLocationConflictModal && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { borderColor: '#fb923c', borderWidth: 2, width: '90%', maxWidth: 450, maxHeight: '85%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <MaterialCommunityIcons name="alert-decagram" size={24} color="#fb923c" />
                <Text style={[styles.modalTitle, { marginBottom: 0 }]}>LOCATION CONFLICT</Text>
              </View>
              
              <Text style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 18, marginBottom: 20 }}>
                This item is already assigned to established sites. Deploying to [<Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>{selectedCabinet?.name}</Text>] creates fragmentation. Standardize or override?
              </Text>

              <View style={{ marginBottom: 20, gap: 8 }}>
                {otherLocations.map(loc => (
                  <TouchableOpacity 
                    key={loc.id}
                    style={{ backgroundColor: '#1e293b', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#334155', flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    onPress={async () => {
                      setShowLocationConflictModal(false);
                      const finalData = { ...deferredSave, selectedCabinetId: loc.id };
                      if (makeDefaultHome) {
                        await db.runAsync('UPDATE ItemTypes SET default_cabinet_id = ? WHERE id = ?', [loc.id, Number(typeId)]);
                      }
                      await finalizeCommit(null, finalData);
                    }}
                  >
                    <MaterialCommunityIcons name="undo-variant" size={18} color="#22c55e" />
                    <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>CORRECT TO: {loc.name.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity 
                style={{ backgroundColor: 'rgba(251, 146, 60, 0.1)', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fb923c', flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}
                onPress={async () => {
                  setShowLocationConflictModal(false);
                  if (deferredSave) {
                    if (makeDefaultHome) {
                      await db.runAsync('UPDATE ItemTypes SET default_cabinet_id = ? WHERE id = ?', [deferredSave.selectedCabinetId, Number(typeId)]);
                    }
                    await finalizeCommit(null, deferredSave);
                  }
                }}
              >
                <MaterialCommunityIcons name="arrow-right-bold" size={18} color="#fb923c" />
                <Text style={{ color: '#fb923c', fontWeight: 'bold' }}>PROCEED TO: {selectedCabinet?.name.toUpperCase()}</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, marginBottom: 10 }}
                onPress={() => setMakeDefaultHome(!makeDefaultHome)}
              >
                <MaterialCommunityIcons 
                  name={makeDefaultHome ? "checkbox-marked" : "checkbox-blank-outline"} 
                  size={22} 
                  color={makeDefaultHome ? "#3b82f6" : "#64748b"} 
                />
                <Text style={{ color: makeDefaultHome ? '#f8fafc' : '#94a3b8', fontSize: 13, fontWeight: makeDefaultHome ? 'bold' : 'normal' }}>
                  Set selection as primary default home
                </Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#0f172a', paddingTop: 16 }}>
                <TouchableOpacity style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }} onPress={() => setShowLocationConflictModal(false)}>
                  <Text style={{ color: '#94a3b8', fontWeight: 'bold' }}>ABORT & CANCEL</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {/* --- VANGUARD HANDSHAKE (FIRST ARRIVAL) --- */}
      {showVanguardModal && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { borderColor: '#3b82f6', borderWidth: 2 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <MaterialCommunityIcons name="star-circle" size={24} color="#3b82f6" />
              <Text style={[styles.modalTitle, { marginBottom: 0 }]}>VANGUARD ESTABLISHMENT</Text>
            </View>
            
            <Text style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 18, marginBottom: 20 }}>
              This is the first deployment of this item. Confirming <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>{selectedCabinet?.name?.toUpperCase()}</Text> as the primary home?
            </Text>

            <TouchableOpacity 
              style={[styles.saveButton, { backgroundColor: '#3b82f6', marginBottom: 12, marginTop: 0, width: '100%', margin: 0 }]} 
              onPress={async () => {
                setShowVanguardModal(false);
                if (deferredSave) {
                  await db.runAsync('UPDATE ItemTypes SET default_cabinet_id = ?, vanguard_resolved = 1 WHERE id = ?', [deferredSave.selectedCabinetId, Number(typeId)]);
                  await finalizeCommit(null, deferredSave);
                }
              }}
            >
              <Text style={styles.saveText}>PROMOTE TO DEFAULT</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={{ backgroundColor: '#1e293b', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#334155', marginBottom: 12, alignItems: 'center' }}
              onPress={async () => {
                setShowVanguardModal(false);
                if (deferredSave) {
                  await db.runAsync('UPDATE ItemTypes SET vanguard_resolved = 1 WHERE id = ?', [Number(typeId)]);
                  await finalizeCommit(null, deferredSave);
                }
              }}
            >
              <Text style={{ color: '#cbd5e1', fontWeight: 'bold' }}>DEPLOY ONCE</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={{ padding: 12, alignItems: 'center' }} 
              onPress={() => {
                setShowVanguardModal(false);
                setShowCabinetPicker(true);
              }}
            >
              <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>CHANGE SITE</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* --- RANGE FUZZY HARMONIZER --- */}
      {showRangeFuzzyModal && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { borderColor: '#f59e0b', borderWidth: 2, width: '90%', maxWidth: 400, maxHeight: '85%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <NearMissIcon />
                <Text style={[styles.modalTitle, { marginBottom: 0 }]}>NEAR MISS DETECTED</Text>
              </View>
              
                <Text style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 18, marginBottom: 20 }}>
                  <Text style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: 15 }}>{(showQuickAddType ? quickAddRange : productRange)}</Text> appears to be a possible near miss. Align this <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>product range</Text> entry with the established vocabulary for this field?
                </Text>

              <View style={{ marginBottom: 10, gap: 8 }}>
                {fuzzyRangeMatches.map(match => (
                  <TouchableOpacity 
                    key={match}
                    style={{ backgroundColor: '#1e293b', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#334155', flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    onPress={async () => {
                      if (showQuickAddType) setQuickAddRange(match);
                      else setProductRange(match);
                      setShowRangeFuzzyModal(false);
                      resumePipeline();
                    }}
                  >
                    <MaterialCommunityIcons name="check-circle" size={18} color="#22c55e" />
                    <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>ALIGN TO: {match.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity 
                style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#475569', flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}
                onPress={async () => {
                   setIgnoredFuzzyRanges(prev => {
                     const next = new Set(prev);
                     next.add((showQuickAddType ? quickAddRange : productRange).trim().toLowerCase());
                     return next;
                   });
                   setShowRangeFuzzyModal(false);
                   resumePipeline();
                }}
              >
                <MaterialCommunityIcons name="plus-circle-outline" size={18} color="#94a3b8" />
                <Text style={{ color: '#cbd5e1', fontWeight: 'bold' }}>NO, THIS IS INTENTIONAL</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      )}

      {/* --- BRAND FUZZY HARMONIZER --- */}
      {showBrandFuzzyModal && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { borderColor: '#f59e0b', borderWidth: 2, width: '90%', maxWidth: 400, maxHeight: '85%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <NearMissIcon />
                <Text style={[styles.modalTitle, { marginBottom: 0 }]}>NEAR MISS DETECTED</Text>
              </View>
              
                <Text style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 18, marginBottom: 20 }}>
                  <Text style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: 15 }}>{(showQuickAddType ? quickAddSupplier : supplier)}</Text> appears to be a possible near miss. Align this <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>brand/supplier</Text> entry with the established vocabulary for this field?
                </Text>

              <View style={{ marginBottom: 10, gap: 8 }}>
                {fuzzyBrandMatches.map(match => (
                  <TouchableOpacity 
                    key={match}
                    style={{ backgroundColor: '#1e293b', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#334155', flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    onPress={async () => {
                      if (showQuickAddType) setQuickAddSupplier(match);
                      else setSupplier(match);
                      setShowBrandFuzzyModal(false);
                      resumePipeline();
                    }}
                  >
                    <MaterialCommunityIcons name="check-circle" size={18} color="#22c55e" />
                    <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>ALIGN TO: {match.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity 
                style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#475569', flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}
                onPress={async () => {
                   setIgnoredFuzzyBrands(prev => {
                     const next = new Set(prev);
                     next.add((showQuickAddType ? quickAddSupplier : supplier).trim().toLowerCase());
                     return next;
                   });
                   setShowBrandFuzzyModal(false);
                   resumePipeline();
                }}
              >
                <MaterialCommunityIcons name="plus-circle-outline" size={18} color="#94a3b8" />
                <Text style={{ color: '#cbd5e1', fontWeight: 'bold' }}>NO, THIS IS INTENTIONAL</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      )}

      {showAddCategory && (
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>DEPLOY CATEGORY</Text>
          <View style={{ marginBottom: 16 }}>
             <Text style={styles.miniLabel}>CATEGORY NAME</Text>
             <TextInput style={styles.inputSmall} value={newCatName} onChangeText={setNewCatName} placeholder="e.g. Spices" placeholderTextColor="#64748b" autoFocus />
          </View>
          <TouchableOpacity style={styles.saveButton} onPress={handleCreateCategory}><Text style={styles.saveText}>CREATE CATEGORY</Text></TouchableOpacity>
          <TouchableOpacity style={styles.modalClose} onPress={() => setShowAddCategory(false)}><Text style={styles.modalCloseText}>CANCEL</Text></TouchableOpacity>
        </View></View>
      )}

      {/* SCANNER MODAL */}
      <ExpiryScannerModal 
        isVisible={showExpiryScanner} 
        onClose={() => setShowExpiryScanner(false)}
        onResult={(m, y) => {
          setExpiryMonth(m);
          setExpiryYear(y);
          setWasScanned(true);
          expiryTouched.current = true;
          // Visual feedback
          // Alert.alert("Date Captured", `Expiry set to ${m.padStart(2, '0')}/${y} based on optical intel.`);
        }}
      />
      <CabinetFormModal 
        visible={showCabinetModal}
        allCabinets={cabinets}
        onSuccess={handleCabinetModalSuccess}
        onCancel={() => setShowCabinetModal(false)}
      />
    </View>
  );
}

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
  stepperMini: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
    height: 36,
    alignSelf: 'flex-start',
  },
  stepButtonMini: {
    paddingHorizontal: 12,
    height: '100%',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
  },
  stepInputMini: {
    width: 50,
    color: '#f8fafc',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 'bold',
    padding: 0,
  },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepButton: { backgroundColor: '#334155', padding: 12, borderRadius: 8 },
  stepInput: { flex: 1, backgroundColor: '#1e293b', color: '#f8fafc', fontSize: 20, textAlign: 'center', paddingVertical: 12, marginHorizontal: 12, borderRadius: 8 },
  saveButton: {
    backgroundColor: '#22c55e',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
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
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: { backgroundColor: '#1e293b', borderRadius: 16, padding: 24, maxHeight: '80%' },
  modalTitle: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#334155', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalItemActive: { backgroundColor: '#334155', borderRadius: 8, paddingHorizontal: 10 },
  modalItemText: { color: '#f8fafc', fontSize: 16 },
  modalItemTextActive: { color: '#3b82f6', fontWeight: 'bold' },
  modalClose: { marginTop: 20, padding: 15, alignItems: 'center' },
  modalCloseText: { color: '#ef4444', fontWeight: 'bold', letterSpacing: 1 },
  unitChipRowMini: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  unitChip: { backgroundColor: '#334155', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, minWidth: 80, alignItems: 'center', borderWidth: 1, borderColor: '#475569' },
  unitChipActive: { backgroundColor: '#1e3a8a', borderColor: '#3b82f6' },
  unitChipText: { color: '#94a3b8', fontWeight: 'bold', fontSize: 12 },
  unitChipTextActive: { color: 'white' },
  miniLabel: { color: '#cbd5e1', fontSize: 12, fontWeight: 'bold', marginBottom: 4, paddingLeft: 4, textTransform: 'uppercase' },
  inputSmall: { backgroundColor: '#0f172a', color: '#f8fafc', borderRadius: 8, padding: 12, fontSize: 14, borderWidth: 1, borderColor: '#334155', width: '100%' },
  formSection: { marginBottom: 16 }
});

