import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Switch, Platform, ScrollView, Linking, Modal } from 'react-native';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { BackupService, BackupMetadata } from '../services/BackupService';
import { markModified } from '../db/sqlite';
import { useBilling } from '../context/BillingContext';
import SUPPLIERS_DATA from '../data/suppliers.json';

export default function CatalogScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { isPremium, hasFullAccess, checkEntitlement, isTrialActive, trialLabel, requestPurchase, isSergeanOrAbove, isGeneralOrAbove, isCadet, isPrivate, graduateEarly, limits, isSergeant, isGeneral } = useBilling();
  const [categories, setCategories] = useState<any[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemDefaultSize, setNewItemDefaultSize] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('weight');
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [editingTypeId, setEditingTypeId] = useState<number | null>(null);
  const [editingTypeName, setEditingTypeName] = useState('');
  const [editingTypeDefaultSize, setEditingTypeDefaultSize] = useState('');
  const [editingTypeUnit, setEditingTypeUnit] = useState('weight');
  const [editingTypeDefaultCabinet, setEditingTypeDefaultCabinet] = useState<number | null>(null);
  const [editingTypeMinStock, setEditingTypeMinStock] = useState('');
  const [editingTypeMaxStock, setEditingTypeMaxStock] = useState('');
  const [editingTypeSupplier, setEditingTypeSupplier] = useState('');
  const [editingTypeRange, setEditingTypeRange] = useState('');
  const [newItemSupplier, setNewItemSupplier] = useState('');
  const [newItemRange, setNewItemRange] = useState('');

  const [newItemMinStock, setNewItemMinStock] = useState('');
  const [newItemMaxStock, setNewItemMaxStock] = useState('');
  const [newItemDefaultCabinet, setNewItemDefaultCabinet] = useState<number | null>(null);
  
  const [supplierVocabulary, setSupplierVocabulary] = useState<string[]>([]);
  const [rangeVocabulary, setRangeVocabulary] = useState<string[]>([]);
  const [suggestedTypeAheadSuppliers, setSuggestedTypeAheadSuppliers] = useState<string[]>([]);
  const [suggestedTypeAheadRanges, setSuggestedTypeAheadRanges] = useState<string[]>([]);

  const [cabinets, setCabinets] = useState<any[]>([]);
  const [newCabName, setNewCabName] = useState('');
  const [newCabLocation, setNewCabLocation] = useState('');
  const [newCabError, setNewCabError] = useState<string | null>(null);
  const [editingCabId, setEditingCabId] = useState<number | null>(null);
  const [editingCabName, setEditingCabName] = useState('');
  const [editingCabLocation, setEditingCabLocation] = useState('');
  const [editingCabError, setEditingCabError] = useState<string | null>(null);
  
  const params = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState<'catalog' | 'cabinets' | 'system' | 'backups' | 'rank'>('catalog');

  useEffect(() => {
    if (params.tab === 'rank') {
      setActiveTab('rank');
    }
  }, [params.tab]);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [logisticsEmail, setLogisticsEmail] = useState('');
  const [mirrorUri, setMirrorUri] = useState<string | null>(null);
  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [totalItemCount, setTotalItemCount] = useState(0);
  const [minReqCount, setMinReqCount] = useState(0);
  const [maxReqCount, setMaxReqCount] = useState(0);
  const [freezerItemCount, setFreezerItemCount] = useState(0);
  const [freezerCabCount, setFreezerCabCount] = useState(0);
  const [expandedCatId, setExpandedCatId] = useState<number | null>(null);
  const [newCabType, setNewCabType] = useState<'standard' | 'freezer'>('standard');
  const [editingCabType, setEditingCabType] = useState<'standard' | 'freezer'>('standard');
  const [newItemFreezeMonths, setNewItemFreezeMonths] = useState('');
  const [editingTypeFreezeMonths, setEditingTypeFreezeMonths] = useState('');
  const [showInlineAddCabinet, setShowInlineAddCabinet] = useState(false);
  const [inlineCabContext, setInlineCabContext] = useState<'new_item' | 'edit_item'>('new_item');
  const [inlineCabName, setInlineCabName] = useState('');
  const [inlineCabLoc, setInlineCabLoc] = useState('');
  const [inlineCabType, setInlineCabType] = useState<'standard' | 'freezer'>('standard');

  const load = async () => {
    const rows = await db.getAllAsync(`
      SELECT c.id as cat_id, c.name as cat_name, i.id as type_id, i.name as type_name, i.unit_type as type_unit, i.is_favorite, i.interaction_count, i.default_size as type_default_size,
             i.min_stock_level, i.max_stock_level, i.freeze_months, i.default_cabinet_id, i.default_supplier, i.default_product_range,
             (SELECT COUNT(*) FROM Inventory v WHERE v.item_type_id = i.id) as type_stock_count,
             EXISTS(SELECT 1 FROM Inventory v JOIN Cabinets cab ON v.cabinet_id = cab.id WHERE v.item_type_id = i.id AND cab.cabinet_type = 'freezer') as in_freezer
      FROM Categories c
      LEFT JOIN ItemTypes i ON c.id = i.category_id
      ORDER BY c.name, i.name
    `);

    const grouped = rows.reduce((acc: any, row: any) => {
      let cat = acc.find((c: any) => c.id === row.cat_id);
      if (!cat) {
        cat = { id: row.cat_id, name: row.cat_name, types: [] };
        acc.push(cat);
      }
      if (row.type_id) {
        cat.types.push({ 
            id: row.type_id, 
            name: row.type_name, 
            unit_type: row.type_unit || 'weight', 
            is_favorite: row.is_favorite || 0,
            interaction_count: row.interaction_count || 0,
            default_size: row.type_default_size || '',
            stock_count: row.type_stock_count || 0,
            min_stock: row.min_stock_level,
            max_stock: row.max_stock_level,
            freeze_months: row.freeze_months ?? null,
            in_freezer: row.in_freezer === 1,
            default_cabinet_id: row.default_cabinet_id,
            default_supplier: row.default_supplier || '',
            default_product_range: row.default_product_range || '',
        });
      }
      return acc;
    }, []);

    setCategories(grouped as any[]);

    const uniqueItemCount = rows.filter((r: any) => r.type_id !== null).length;
    setTotalItemCount(uniqueItemCount);

    setMinReqCount(rows.filter((r: any) => r.type_id !== null && r.min_stock_level !== null).length);
    setMaxReqCount(rows.filter((r: any) => r.type_id !== null && r.max_stock_level !== null).length);
    const cabRows = await db.getAllAsync<any>(`
      SELECT c.*, (SELECT COUNT(*) FROM Inventory v WHERE v.cabinet_id = c.id) as stock_count
      FROM Cabinets c
      ORDER BY c.name
    `);

    setFreezerItemCount(rows.filter((r: any) => {
        if (r.type_id === null) return false;
        if (r.freeze_months !== null || r.in_freezer === 1) return true;
        const defaultCab = cabRows.find((c: any) => c.id === r.default_cabinet_id);
        return defaultCab?.cabinet_type === 'freezer';
    }).length);
    setCabinets(cabRows);
    setFreezerCabCount(cabRows.filter((c: any) => c.cabinet_type === 'freezer').length);

    const setRes = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', ['month_brief_enabled']);
    setAlertsEnabled(setRes?.value === '1');

    const backupRes = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', ['auto_backup_enabled']);
    setAutoBackupEnabled(backupRes?.value === '1');

    const mirrorRes = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', ['persistence_mirror_uri']);
    setMirrorUri(mirrorRes?.value || null);

    const emailRes = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', ['logistics_email']);
    setLogisticsEmail(emailRes?.value || '');

    const backupList = await BackupService.getBackupsList();
    setBackups(backupList);

    // Load Vocabulary
    try {
      const dbSuppliers = await db.getAllAsync<{default_supplier: string}>("SELECT DISTINCT default_supplier FROM ItemTypes WHERE default_supplier IS NOT NULL AND default_supplier != ''");
      const invSuppliers = await db.getAllAsync<{supplier: string}>("SELECT DISTINCT supplier FROM Inventory WHERE supplier IS NOT NULL AND supplier != ''");
      
      const combinedS = new Set([
        ...Object.keys(SUPPLIERS_DATA),
        ...dbSuppliers.map(s => s.default_supplier),
        ...invSuppliers.map(s => s.supplier)
      ]);
      setSupplierVocabulary(Array.from(combinedS).sort());

      const dbRanges = await db.getAllAsync<{default_product_range: string}>("SELECT DISTINCT default_product_range FROM ItemTypes WHERE default_product_range IS NOT NULL AND default_product_range != ''");
      const invRanges = await db.getAllAsync<{product_range: string}>("SELECT DISTINCT product_range FROM Inventory WHERE product_range IS NOT NULL AND product_range != ''");
      const combinedR = new Set([
        ...dbRanges.map(r => r.default_product_range),
        ...invRanges.map(r => r.product_range)
      ]);
      setRangeVocabulary(Array.from(combinedR).sort());
    } catch (e) {
      console.error("Failed to load vocabulary", e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );


  const updateSupplierSuggestions = (val: string) => {
    if (val.trim().length > 0) {
      const matches = supplierVocabulary
        .filter(s => s.toLowerCase().includes(val.toLowerCase()))
        .sort((a, b) => {
          const aStart = a.toLowerCase().startsWith(val.toLowerCase());
          const bStart = b.toLowerCase().startsWith(val.toLowerCase());
          if (aStart && !bStart) return -1;
          if (!aStart && bStart) return 1;
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
          const aStart = a.toLowerCase().startsWith(val.toLowerCase());
          const bStart = b.toLowerCase().startsWith(val.toLowerCase());
          if (aStart && !bStart) return -1;
          if (!aStart && bStart) return 1;
          return a.localeCompare(b);
        })
        .slice(0, 3);
      setSuggestedTypeAheadRanges(matches);
    } else {
      setSuggestedTypeAheadRanges([]);
    }
  };

  const handlePurgeVocabulary = async (val: string, type: 'supplier' | 'range') => {
    // Instant UI feedback: surgically remove from all active states
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
      load(); // Sync full state in background
    } catch (e) {
      console.error("Purge failed in background", e);
    }
  };


  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;

    if (categories.length >= limits.categories && !hasFullAccess) {
      checkEntitlement('CATEGORY_LIMIT');
      return;
    }

    await db.runAsync('INSERT INTO Categories (name, icon) VALUES (?, ?)', [newCatName, 'box']);
    setNewCatName('');
    load();
  };

  const handleAddItemType = async (catId: number) => {
    if (!newItemName.trim() || selectedCat !== catId) return;

    if (totalItemCount >= limits.items && !hasFullAccess) {
      checkEntitlement('ITEM_LIMIT');
      return;
    }

    let finalDefaultSize = null;
    const rawNumber = newItemDefaultSize.replace(/[^0-9.]/g, '');
    if (rawNumber) finalDefaultSize = rawNumber;

    if (newItemMinStock && newItemMaxStock && parseInt(newItemMaxStock) < parseInt(newItemMinStock)) {
      Alert.alert('Logistics Error', 'Max target must be greater than or equal to Min threshold.');
      return;
    }

    if (newItemFreezeMonths && !hasFullAccess) {
      if (freezerItemCount >= limits.freezer_items) {
        checkEntitlement('FREEZER_LIMIT');
        return;
      }
    }

    await db.runAsync('INSERT INTO ItemTypes (category_id, name, unit_type, default_size, min_stock_level, max_stock_level, freeze_months, default_cabinet_id, default_supplier, default_product_range) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        catId, newItemName, newItemUnit, finalDefaultSize, 
        newItemMinStock ? parseInt(newItemMinStock) : null,
        newItemMaxStock ? parseInt(newItemMaxStock) : null,
        newItemFreezeMonths ? parseInt(newItemFreezeMonths) : null,
        newItemDefaultCabinet,
        newItemSupplier || null,
        newItemRange || null
    ]);
    setNewItemName('');
    setNewItemDefaultSize('');
    setSelectedCat(null);
    setNewItemUnit('weight');
    setNewItemMinStock('');
    setNewItemMaxStock('');
    setNewItemFreezeMonths('');
    setNewItemSupplier('');
    setNewItemRange('');
    setNewItemDefaultCabinet(null);
    load();
  };

  const handleDeleteItemType = async (typeId: number) => {
    const count = await db.getFirstAsync<{c: number}>('SELECT COUNT(*) as c FROM Inventory WHERE item_type_id = ?', [typeId]);
    if (count && count.c > 0) {
      Alert.alert('Cannot Delete', 'This item type has stock. Please delete the stock first.');
      return;
    }
    await db.runAsync('DELETE FROM ItemTypes WHERE id = ?', [typeId]);
    load();
  };

  const handleUpdateCategory = async (catId: number) => {
    if (!editingCatName.trim()) {
      setEditingCatId(null);
      return;
    }
    await db.runAsync('UPDATE Categories SET name = ? WHERE id = ?', [editingCatName, catId]);
    setEditingCatId(null);
    load();
  };

  const handleAddCabinet = async () => {
    if (!newCabName.trim()) return;

    if (cabinets.some(c => c.name.toLowerCase() === newCabName.trim().toLowerCase())) {
      setNewCabError(`"${newCabName.trim()}" is already deployed in your logistics network.`);
      return;
    }
    setNewCabError(null);

    if (cabinets.length >= limits.cabinets && !hasFullAccess) {
      checkEntitlement('CABINET_LIMIT');
      return;
    }

    if (newCabType === 'freezer' && freezerCabCount >= limits.freezer_cabs && !hasFullAccess) {
      checkEntitlement('FREEZER_CABINET_LIMIT');
      return;
    }

    await db.runAsync('INSERT INTO Cabinets (name, location, cabinet_type) VALUES (?, ?, ?)', [newCabName, newCabLocation, newCabType]);
    setNewCabName('');
    setNewCabLocation('');
    setNewCabType('standard');
    load();
  };

  const handleUpdateCabinet = async (cabId: number) => {
    if (!editingCabName.trim()) return;

    if (cabinets.some(c => c.id !== cabId && c.name.toLowerCase() === editingCabName.trim().toLowerCase())) {
      setEditingCabError(`"${editingCabName.trim()}" is already deployed in your logistics network.`);
      return;
    }
    setEditingCabError(null);

    if (editingCabType === 'freezer' && !hasFullAccess) {
      const currentCab = cabinets.find(c => c.id === cabId);
      if (currentCab?.cabinet_type !== 'freezer' && freezerCabCount >= limits.freezer_cabs) {
        checkEntitlement('FREEZER_CABINET_LIMIT');
        return;
      }
    }

    await db.runAsync('UPDATE Cabinets SET name = ?, location = ?, cabinet_type = ? WHERE id = ?', [editingCabName, editingCabLocation, editingCabType, cabId]);
    setEditingCabId(null);
    load();
  };

  const handleDeleteCabinet = async (cabId: number, hasStock: boolean) => {
    if (hasStock) return;
    await db.runAsync('DELETE FROM Cabinets WHERE id = ?', [cabId]);
    load();
  };

  const handleCreateInlineCabinet = async () => {
    if (!inlineCabName.trim()) return;

    if (cabinets.length >= limits.cabinets && !hasFullAccess) {
      checkEntitlement('CABINET_LIMIT');
      return;
    }
    if (inlineCabType === 'freezer' && freezerCabCount >= limits.freezer_cabs && !hasFullAccess) {
      checkEntitlement('FREEZER_CABINET_LIMIT');
      return;
    }
    const res = await db.runAsync('INSERT INTO Cabinets (name, location, cabinet_type) VALUES (?, ?, ?)', [inlineCabName.trim(), inlineCabLoc.trim(), inlineCabType]);
    const newCabId = res.lastInsertRowId;
    
    setShowInlineAddCabinet(false);
    setInlineCabName('');
    setInlineCabLoc('');
    setInlineCabType('standard');
    
    if (inlineCabContext === 'new_item') {
       setNewItemDefaultCabinet(Number(newCabId));
    } else {
       setEditingTypeDefaultCabinet(Number(newCabId));
    }
    load();
  };

  const toggleAlerts = async (val: boolean) => {
    setAlertsEnabled(val);
    await db.runAsync('UPDATE Settings SET value = ? WHERE key = ?', [val ? '1' : '0', 'month_brief_enabled']);
    load();
  };

  const toggleAutoBackup = async (val: boolean) => {
    setAutoBackupEnabled(val);
    await db.runAsync('UPDATE Settings SET value = ? WHERE key = ?', [val ? '1' : '0', 'auto_backup_enabled']);
    load();
  };

  const handleManualBackup = async () => {
    if (!checkEntitlement('BACKUPS')) return;
    try {
      await BackupService.createBackup(db, true);
      Alert.alert('Backup Successful', 'A new tactical snapshot has been added to the rolling archive.');
      load();
    } catch (e) {
      Alert.alert('Backup Failed', 'Could not generate backup file.');
    }
  };

  const handleLocalRestore = async (item: BackupMetadata) => {
    Alert.alert(
      'Tactical Recovery',
      `Recover system from snapshot: ${item.name.replace('war-cabinet-backup-', '')}?\n\nThis will OVERWRITE all current data.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'RESTORE', 
          style: 'destructive',
          onPress: async () => {
            try {
              const content = await BackupService.readLocalBackup(item.uri);
              const data = JSON.parse(content);
              const success = await BackupService.restore(db, data);
              if (success) {
                Alert.alert('Success', 'System state recovered.');
                load();
              }
            } catch (e: any) {
              Alert.alert('Restore Failed', e.message || 'Corrupt snapshot.');
            }
          }
        }
      ]
    );
  };

  const handlePersistentMirrorSetup = async () => {
    const uri = await BackupService.pickPersistentFolder(db);
    if (uri) {
        Alert.alert('Mirroring Active', 'Automated shadow copies will now be mirrored to your chosen folder.');
        load();
    }
  };

  const handleRestore = async () => {
    if (!checkEntitlement('BACKUPS')) return;
    Alert.alert(
      'System Recovery',
      'This will WIPE all current stock and restore from the selected file. This action cannot be undone. Proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'SELECT FILE', 
          onPress: async () => {
            try {
              const success = await BackupService.pickAndRestore(db);
              if (success) {
                Alert.alert('Restore Complete', 'System state has been successfully recovered.');
                load();
              }
            } catch (e: any) {
              Alert.alert('Restore Failed', e.message || 'Invalid or corrupt backup file.');
            }
          } 
        }
      ]
    );
  };

  const handleUpdateItemType = async (typeId: number) => {
    if (!editingTypeName.trim()) {
      setEditingTypeId(null);
      return;
    }

    let finalDefaultSize = null;
    const rawNumber = editingTypeDefaultSize.replace(/[^0-9.]/g, '');
    if (rawNumber) finalDefaultSize = rawNumber;

    if (editingTypeMinStock && editingTypeMaxStock && parseInt(editingTypeMaxStock) < parseInt(editingTypeMinStock)) {
      Alert.alert('Logistics Error', 'Max target must be greater than or equal to Min threshold.');
      return;
    }

    const isNowFreezer = !!editingTypeFreezeMonths || cabinets.find(c => c.id === Number(editingTypeDefaultCabinet))?.cabinet_type === 'freezer';

    if (isNowFreezer && !hasFullAccess) {
      // Find the existing item to see if it was ALREADY a freezer item
      let wasFreezer = false;
      categories.forEach(c => {
        const found = c.types.find((t: any) => t.id === typeId);
        if (found) {
            const defaultCab = cabinets.find(cab => cab.id === found.default_cabinet_id);
            if (found.freeze_months !== null || found.in_freezer || defaultCab?.cabinet_type === 'freezer') {
                wasFreezer = true;
            }
        }
      });

      if (!wasFreezer) {
        if (freezerItemCount >= limits.freezer_items) {
          checkEntitlement('FREEZER_LIMIT');
          return;
        }
      }
    }

    await db.runAsync('UPDATE ItemTypes SET name = ?, unit_type = ?, default_size = ?, default_cabinet_id = ?, min_stock_level = ?, max_stock_level = ?, freeze_months = ?, default_supplier = ?, default_product_range = ? WHERE id = ?', [
        editingTypeName, editingTypeUnit, finalDefaultSize, editingTypeDefaultCabinet, 
        editingTypeMinStock ? parseInt(editingTypeMinStock) : null,
        editingTypeMaxStock ? parseInt(editingTypeMaxStock) : null,
        editingTypeFreezeMonths ? parseInt(editingTypeFreezeMonths) : null,
        editingTypeSupplier || null,
        editingTypeRange || null,
        typeId
    ]);
    setEditingTypeId(null);
    setEditingTypeFreezeMonths('');
    setEditingTypeSupplier('');
    setEditingTypeRange('');
    load();
  };

  const toggleFavorite = async (typeId: number, current: number) => {
    await db.runAsync('UPDATE ItemTypes SET is_favorite = ? WHERE id = ?', current === 1 ? 0 : 1, typeId);
    load();
  };

  const handleDeleteCategory = async (catId: number, hasTypes: boolean) => {
    if (hasTypes) return;
    await db.runAsync('DELETE FROM Categories WHERE id = ?', catId);
    load();
  };

  const toggleCategory = (id: number) => {
    setExpandedCatId(prev => (prev === id ? null : id));
  };

  const renderCategory = ({ item: cat }: any) => {
    const isExpanded = expandedCatId === cat.id;
    const favoriteCount = cat.types.filter((t: any) => t.is_favorite).length;

    const targetsSet = cat.types.filter((t: any) => t.min_stock !== null || t.max_stock !== null).length;

    return (
      <View style={styles.catCard}>
        <TouchableOpacity 
          onPress={() => toggleCategory(cat.id)}
          style={[styles.catHeader, {flexDirection: 'column', alignItems: 'stretch'}]}
          activeOpacity={0.7}
          testID={`category-header-${cat.name.toLowerCase().replace(/\s+/g, '-')}`}
        >
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
            <View style={{flex: 1, marginRight: 10}}>
              {editingCatId === cat.id ? (
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <TextInput 
                    style={[styles.inputSmall, {flex: 1, height: 36}]} 
                    value={editingCatName} 
                    onChangeText={setEditingCatName} 
                    autoFocus
                  />
                  <TouchableOpacity onPress={() => handleUpdateCategory(cat.id)} style={[styles.saveActionBtn, {marginLeft: 8}]}>
                    <MaterialCommunityIcons name="check" size={20} color="white" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingCatId(null)} style={{marginLeft: 8}}>
                    <MaterialCommunityIcons name="close" size={20} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.catTitle}>{cat.name}</Text>
              )}
            </View>
            <View style={styles.catActions}>
              <TouchableOpacity onPress={() => { setEditingCatId(cat.id); setEditingCatName(cat.name); }} style={{marginRight: 12}}>
                <MaterialCommunityIcons name="pencil" size={20} color="#3b82f6" />
              </TouchableOpacity>
              <TouchableOpacity disabled={cat.types.length > 0} onPress={() => handleDeleteCategory(cat.id, cat.types.length > 0)} style={{marginRight: 12}}>
                <MaterialCommunityIcons name="delete" size={20} color={cat.types.length > 0 ? "#334155" : "#ef4444"} />
              </TouchableOpacity>
              <MaterialCommunityIcons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={24} color="#64748b" />
            </View>
          </View>

          {!isExpanded && (
            <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap'}}>
              <Text style={{color: '#94a3b8', fontSize: 10, fontWeight: 'bold'}}>{cat.types.length} {cat.types.length === 1 ? 'ITEM' : 'ITEMS'}</Text>
              {favoriteCount > 0 && (
                <>
                  <Text style={{color: '#334155', marginHorizontal: 4}}>•</Text>
                  <MaterialCommunityIcons name="star" size={10} color="#eab308" />
                  <Text style={{color: '#94a3b8', fontSize: 10, fontWeight: 'bold', marginLeft: 2}}>
                    {favoriteCount} {favoriteCount === 1 ? 'FAVOURITE' : 'FAVOURITES'}
                  </Text>
                </>
              )}
              {targetsSet > 0 && (
                <>
                  <Text style={{color: '#334155', marginHorizontal: 4}}>•</Text>
                  <Text style={{color: '#94a3b8', fontSize: 10, fontWeight: 'bold'}}>{targetsSet} MIN/MAX SET</Text>
                </>
              )}
            </View>
          )}
        </TouchableOpacity>

        {isExpanded && (
          <View style={{marginTop: 10}}>
            {cat.types.map((type: any) => (
              <View key={type.id} style={styles.typeRow} testID={`type-row-${type.name.toLowerCase().replace(/\s+/g, '-')}`}>
                {editingTypeId === type.id ? (
                  <View style={{flexDirection: 'column', padding: 12, backgroundColor: '#0f172a', borderRadius: 10, marginTop: 8}}>
                    <View style={styles.formSection}>
                      <Text style={styles.miniLabel}>NAME <Text style={{color: '#f43f5e'}}>*</Text></Text>
                      <TextInput style={styles.inputSmall} value={editingTypeName} onChangeText={setEditingTypeName} placeholder="Item Name" placeholderTextColor="#64748b" />
                    </View>

                    <View style={styles.formSection}>
                      <Text style={styles.miniLabel}>UNIT <Text style={{color: '#f43f5e'}}>*</Text></Text>
                      <View style={styles.unitChipRowMini}>
                        <TouchableOpacity style={[styles.unitChip, editingTypeUnit === 'weight' && styles.unitChipActive]} onPress={() => setEditingTypeUnit('weight')}><Text style={[styles.unitChipText, editingTypeUnit === 'weight' && styles.unitChipTextActive]}>Weight</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.unitChip, editingTypeUnit === 'volume' && styles.unitChipActive]} onPress={() => setEditingTypeUnit('volume')}><Text style={[styles.unitChipText, editingTypeUnit === 'volume' && styles.unitChipTextActive]}>Volume</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.unitChip, editingTypeUnit === 'count' && styles.unitChipActive]} onPress={() => setEditingTypeUnit('count')}><Text style={[styles.unitChipText, editingTypeUnit === 'count' && styles.unitChipTextActive]}>Count</Text></TouchableOpacity>
                      </View>
                    </View>

                    <View style={{ backgroundColor: '#1e293b', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#334155', marginBottom: 16 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#0f172a' }}>
                        <MaterialCommunityIcons name="target" size={16} color="#fb923c" />
                        <Text style={{ flex: 1, color: '#94a3b8', fontSize: 11, fontStyle: 'italic', lineHeight: 16 }}>
                          <Text style={{fontWeight: 'bold', color: '#cbd5e1', fontStyle: 'normal'}}>QUARTERMASTER: </Text>
                          Set optional thresholds for stock alerts and restocking reports. Leave blank if you don't track stock levels for this item.
                        </Text>
                      </View>

                      <View style={{flexDirection: 'row', gap: 10}}>
                          <View style={{flex: 1}}>
                            <Text style={styles.miniLabel}>MIN STOCK</Text>
                            <TextInput style={styles.inputSmall} value={editingTypeMinStock} onChangeText={setEditingTypeMinStock} keyboardType="numeric" placeholder="Min" placeholderTextColor="#64748b" />
                          </View>
                          <View style={{flex: 1}}>
                            <Text style={styles.miniLabel}>MAX STOCK</Text>
                            <TextInput style={styles.inputSmall} value={editingTypeMaxStock} onChangeText={setEditingTypeMaxStock} keyboardType="numeric" placeholder="Max" placeholderTextColor="#64748b" />
                          </View>
                      </View>
                    </View>

                    <View style={{ backgroundColor: '#1e293b', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#334155', marginBottom: 16 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#0f172a' }}>
                        <MaterialCommunityIcons name="information-outline" size={16} color="#60a5fa" />
                        <Text style={{ flex: 1, color: '#94a3b8', fontSize: 11, fontStyle: 'italic', lineHeight: 16 }}>
                          <Text style={{fontWeight: 'bold', color: '#cbd5e1', fontStyle: 'normal'}}>PRO TIP: </Text>
                          Setting defaults below is optional, but pre-fills your forms to ensure frictionless batch entry in the heat of the moment.
                        </Text>
                      </View>

                    <View style={{flexDirection: 'row', gap: 10, marginBottom: 12}}>
                        <View style={{flex: 1}}>
                          <Text style={styles.miniLabel}>DEFAULT SIZE ({editingTypeUnit === 'volume' ? 'ml' : editingTypeUnit === 'weight' ? 'g' : 'Units'})</Text>
                          <TextInput style={styles.inputSmall} value={editingTypeDefaultSize} onChangeText={setEditingTypeDefaultSize} keyboardType="numeric" placeholder="Size / Qty" placeholderTextColor="#64748b" />
                        </View>
                        <View style={{flex: 1}}>
                          <Text style={[styles.miniLabel, {color: '#60a5fa'}]}>❄ FREEZE (M)</Text>
                          <TextInput style={[styles.inputSmall, {borderColor: '#1e3a5f'}]} value={editingTypeFreezeMonths} onChangeText={setEditingTypeFreezeMonths} keyboardType="numeric" placeholder="e.g. 6" placeholderTextColor="#475569" testID="edit-item-freeze-months-input" />
                        </View>
                    </View>

                    <View style={{ marginBottom: 8 }}>
                      <Text style={styles.miniLabel}>DEFAULT SUPPLIER</Text>
                      <TextInput 
                        style={styles.inputSmall} 
                        value={editingTypeSupplier} 
                        onChangeText={(val) => {
                          setEditingTypeSupplier(val);
                          updateSupplierSuggestions(val);
                        }} 
                        placeholder="e.g. M&S" 
                        placeholderTextColor="#64748b" 
                      />
                      <View style={{ height: 26, justifyContent: 'flex-start', alignItems: 'center', marginTop: 4, flexDirection: 'row' }}>
                        {suggestedTypeAheadSuppliers.length > 0 && editingTypeSupplier.length > 0 && (
                          <View style={{ flexDirection: 'row', gap: 4 }}>
                            {suggestedTypeAheadSuppliers.slice(0, 3).map(s => {
                              const isCore = Object.keys(SUPPLIERS_DATA).some(k => k.toLowerCase() === s.toLowerCase());
                              return (
                                <View key={s} style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingLeft: 6, paddingRight: isCore ? 6 : 4, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}>
                                  <TouchableOpacity onPress={() => { setEditingTypeSupplier(s); setSuggestedTypeAheadSuppliers([]); }}>
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

                    <View style={{ marginBottom: 8 }}>
                      <Text style={styles.miniLabel}>DEFAULT RANGE</Text>
                      <TextInput 
                        style={styles.inputSmall} 
                        value={editingTypeRange} 
                        onChangeText={(val) => {
                          setEditingTypeRange(val);
                          updateRangeSuggestions(val);
                        }} 
                        placeholder="e.g. Finest" 
                        placeholderTextColor="#64748b" 
                      />
                      <View style={{ height: 26, justifyContent: 'flex-start', alignItems: 'center', marginTop: 4, flexDirection: 'row' }}>
                        {suggestedTypeAheadRanges.length > 0 && editingTypeRange.length > 0 && (
                          <View style={{ flexDirection: 'row', gap: 4 }}>
                            {suggestedTypeAheadRanges.slice(0, 3).map(r => (
                              <View key={r} style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingLeft: 6, paddingRight: 4, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}>
                                <TouchableOpacity onPress={() => { setEditingTypeRange(r); setSuggestedTypeAheadRanges([]); }}>
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

                    <View style={styles.formSection}>
                        <Text style={styles.miniLabel}>DEFAULT CABINET</Text>
                        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8}}>
                            <TouchableOpacity 
                              key="none" 
                              style={[styles.chip, !editingTypeDefaultCabinet && styles.chipActive]} 
                              onPress={() => setEditingTypeDefaultCabinet(null)}
                            >
                              <Text style={[styles.chipText, !editingTypeDefaultCabinet && styles.chipTextActive]}>No Default</Text>
                            </TouchableOpacity>
                            {cabinets.map(cab => (
                                <TouchableOpacity 
                                  key={cab.id} 
                                  style={[styles.chip, editingTypeDefaultCabinet === cab.id && styles.chipActive]} 
                                  onPress={() => setEditingTypeDefaultCabinet(cab.id)}
                                >
                                    <Text style={[styles.chipText, editingTypeDefaultCabinet === cab.id && styles.chipTextActive]}>{cab.cabinet_type === 'freezer' ? '❄ ' : ''}{cab.name}</Text>
                                </TouchableOpacity>
                            ))}
                            <TouchableOpacity 
                              style={[styles.chip, { borderColor: '#3b82f6', borderWidth: 1, backgroundColor: '#0f172a' }]} 
                              onPress={() => { setInlineCabContext('edit_item'); setShowInlineAddCabinet(true); }}
                            >
                                <Text style={[styles.chipText, { color: '#3b82f6' }]}>+ NEW CABINET</Text>
                            </TouchableOpacity>
                        </View>
                        {cabinets.some(c => c.cabinet_type === 'freezer') && (
                            <Text style={{ color: '#64748b', fontSize: 11, fontStyle: 'italic', marginTop: -2, marginBottom: 4 }}>❄ Designated Freezer Cabinet</Text>
                        )}
                    </View>
                    </View>


                    <TouchableOpacity onPress={() => handleUpdateItemType(type.id)} style={[styles.addSaveBtnFull, { marginTop: 16 }]}><Text style={styles.addSaveText}>SAVE CHANGES</Text></TouchableOpacity>
                    <TouchableOpacity style={{marginTop: 12, alignItems: 'center'}} onPress={() => setEditingTypeId(null)}><Text style={{color: '#64748b', fontSize: 12, fontWeight: 'bold'}}>CANCEL</Text></TouchableOpacity>
                  </View>
                ) : (
                  <View style={{flexDirection: 'column', width: '100%'}}>
                    <View style={{flexDirection: 'row', alignItems: 'center', width: '100%'}}>
                      <TouchableOpacity onPress={() => toggleFavorite(type.id, type.is_favorite)} style={{marginRight: 12}}>
                        <MaterialCommunityIcons name={type.is_favorite ? "star" : "star-outline"} size={24} color={type.is_favorite ? "#eab308" : "#334155"} />
                      </TouchableOpacity>
                      <Text style={styles.typeText}>{type.name}</Text>
                      <View style={styles.catActions}>
                        <TouchableOpacity onPress={async () => { setEditingTypeId(type.id); setEditingTypeName(type.name); setEditingTypeUnit(type.unit_type || 'weight'); setEditingTypeDefaultSize(type.default_size || ''); setEditingTypeMinStock(type.min_stock !== null ? type.min_stock.toString() : ''); setEditingTypeMaxStock(type.max_stock !== null ? type.max_stock.toString() : ''); setEditingTypeFreezeMonths(type.freeze_months !== null && type.freeze_months !== undefined ? type.freeze_months.toString() : ''); setEditingTypeDefaultCabinet(type.default_cabinet_id || null); setEditingTypeSupplier(type.default_supplier || ''); setEditingTypeRange(type.default_product_range || ''); }} style={{marginRight: 10, marginTop: 4}} testID={`edit-type-btn-${type.name.toLowerCase().replace(/\s+/g, '-')}`}><MaterialCommunityIcons name="pencil" size={20} color="#3b82f6" /></TouchableOpacity>
                        <TouchableOpacity disabled={type.stock_count > 0} onPress={() => handleDeleteItemType(type.id)} style={{marginTop: 4}}><MaterialCommunityIcons name="delete" size={20} color={type.stock_count > 0 ? "#334155" : "#ef4444"} /></TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.statBadgeRow}>
                      <View style={styles.statBadge}><MaterialCommunityIcons name={type.unit_type === 'volume' ? 'water' : type.unit_type === 'weight' ? 'scale-balance' : 'numeric-1-box-outline'} size={12} color="#94a3b8" /><Text style={styles.statBadgeText}>{type.unit_type || 'count'}</Text></View>
                      {type.default_size ? (
                        <View style={styles.statBadge}>
                          <MaterialCommunityIcons name="package-variant-closed" size={12} color="#94a3b8" />
                          <Text style={styles.statBadgeText}>
                            {type.default_size}{type.unit_type === 'weight' ? 'g' : type.unit_type === 'volume' ? 'ml' : ''}
                          </Text>
                        </View>
                      ) : null}
                      {(type.min_stock !== null || type.max_stock !== null) ? (
                        <View style={styles.statBadge}>
                          <MaterialCommunityIcons name="target" size={12} color="#94a3b8" />
                          <Text style={styles.statBadgeText}>
                            {type.min_stock !== null ? type.min_stock : '—'} / {type.max_stock !== null ? type.max_stock : '—'}
                          </Text>
                        </View>
                      ) : null}
                      {type.freeze_months ? (
                        <View style={[styles.statBadge, {backgroundColor: '#1d4ed8', borderColor: '#3b82f6'}]}>
                          <MaterialCommunityIcons name="snowflake" size={12} color="white" />
                          <Text style={[styles.statBadgeText, {color: 'white'}]}>{type.freeze_months}M</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                )}
              </View>
            ))}
            {selectedCat === cat.id ? (
              <View style={[styles.newTypeContainer, { padding: 12 }]}>
                <View style={styles.formSection}>
                  <Text style={styles.miniLabel}>NAME <Text style={{color: '#f43f5e'}}>*</Text></Text>
                  <TextInput style={styles.inputSmall} value={newItemName} onChangeText={setNewItemName} placeholder="Item Name" placeholderTextColor="#64748b" testID="new-item-name-input" />
                </View>

                <View style={styles.formSection}>
                   <Text style={styles.miniLabel}>UNIT <Text style={{color: '#f43f5e'}}>*</Text></Text>
                   <View style={styles.unitChipRowMini}>
                     <TouchableOpacity style={[styles.unitChip, newItemUnit === 'weight' && styles.unitChipActive]} onPress={() => setNewItemUnit('weight')} testID="unit-selector-weight"><Text style={[styles.unitChipText, newItemUnit === 'weight' && styles.unitChipTextActive]}>Weight</Text></TouchableOpacity>
                     <TouchableOpacity style={[styles.unitChip, newItemUnit === 'volume' && styles.unitChipActive]} onPress={() => setNewItemUnit('volume')} testID="unit-selector-volume"><Text style={[styles.unitChipText, newItemUnit === 'volume' && styles.unitChipTextActive]}>Volume</Text></TouchableOpacity>
                     <TouchableOpacity style={[styles.unitChip, newItemUnit === 'count' && styles.unitChipActive]} onPress={() => setNewItemUnit('count')} testID="unit-selector-count"><Text style={[styles.unitChipText, newItemUnit === 'count' && styles.unitChipTextActive]}>Count</Text></TouchableOpacity>
                   </View>
                </View>

                <View style={{ backgroundColor: '#1e293b', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#334155', marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#0f172a' }}>
                    <MaterialCommunityIcons name="target" size={16} color="#fb923c" />
                    <Text style={{ flex: 1, color: '#94a3b8', fontSize: 11, fontStyle: 'italic', lineHeight: 16 }}>
                      <Text style={{fontWeight: 'bold', color: '#cbd5e1', fontStyle: 'normal'}}>QUARTERMASTER: </Text>
                      Set optional thresholds for stock alerts and restocking reports. Leave blank if you don't track stock levels for this item.
                    </Text>
                  </View>

                  <View style={{flexDirection: 'row', gap: 10}}>
                      <View style={{flex: 1}}>
                        <Text style={styles.miniLabel}>MIN STOCK</Text>
                        <TextInput style={styles.inputSmall} value={newItemMinStock} onChangeText={setNewItemMinStock} keyboardType="numeric" placeholder="Min" placeholderTextColor="#64748b" />
                      </View>
                      <View style={{flex: 1}}>
                        <Text style={styles.miniLabel}>MAX STOCK</Text>
                        <TextInput style={styles.inputSmall} value={newItemMaxStock} onChangeText={setNewItemMaxStock} keyboardType="numeric" placeholder="Max" placeholderTextColor="#64748b" />
                      </View>
                  </View>
                </View>

                <View style={{ backgroundColor: '#1e293b', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#334155', marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#0f172a' }}>
                    <MaterialCommunityIcons name="information-outline" size={16} color="#60a5fa" />
                    <Text style={{ flex: 1, color: '#94a3b8', fontSize: 11, fontStyle: 'italic', lineHeight: 16 }}>
                      <Text style={{fontWeight: 'bold', color: '#cbd5e1', fontStyle: 'normal'}}>PRO TIP: </Text>
                      Setting defaults below is optional, but pre-fills your forms to ensure frictionless batch entry in the heat of the moment.
                    </Text>
                  </View>

                <View style={{flexDirection: 'row', gap: 10, marginBottom: 12}}>
                    <View style={{flex: 1}}>
                      <Text style={styles.miniLabel}>DEFAULT SIZE ({newItemUnit === 'volume' ? 'ml' : newItemUnit === 'weight' ? 'g' : 'Units'})</Text>
                      <TextInput style={styles.inputSmall} value={newItemDefaultSize} onChangeText={setNewItemDefaultSize} keyboardType="numeric" placeholder="Size / Qty" placeholderTextColor="#64748b" testID="new-item-default-size-input" />
                    </View>
                    <View style={{flex: 1}}>
                      <Text style={[styles.miniLabel, {color: '#60a5fa'}]}>❄ FREEZE (M)</Text>
                      <TextInput style={[styles.inputSmall, {borderColor: '#1e3a5f'}]} value={newItemFreezeMonths} onChangeText={setNewItemFreezeMonths} keyboardType="numeric" placeholder="e.g. 6" placeholderTextColor="#475569" testID="new-item-freeze-months-input" />
                    </View>
                </View>

                <View style={{ marginBottom: 8 }}>
                  <Text style={styles.miniLabel}>DEFAULT SUPPLIER</Text>
                  <TextInput 
                    style={styles.inputSmall} 
                    value={newItemSupplier} 
                    onChangeText={(val) => {
                      setNewItemSupplier(val);
                      updateSupplierSuggestions(val);
                    }} 
                    placeholder="e.g. M&S" 
                    placeholderTextColor="#64748b" 
                  />
                  <View style={{ height: 26, justifyContent: 'flex-start', alignItems: 'center', marginTop: 4, flexDirection: 'row' }}>
                    {suggestedTypeAheadSuppliers.length > 0 && newItemSupplier.length > 0 && (
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        {suggestedTypeAheadSuppliers.slice(0, 3).map(s => {
                          const isCore = Object.keys(SUPPLIERS_DATA).some(k => k.toLowerCase() === s.toLowerCase());
                          return (
                            <View key={s} style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingLeft: 6, paddingRight: isCore ? 6 : 4, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}>
                              <TouchableOpacity onPress={() => { setNewItemSupplier(s); setSuggestedTypeAheadSuppliers([]); }}>
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

                <View style={{ marginBottom: 8 }}>
                  <Text style={styles.miniLabel}>DEFAULT RANGE</Text>
                  <TextInput 
                    style={styles.inputSmall} 
                    value={newItemRange} 
                    onChangeText={(val) => {
                      setNewItemRange(val);
                      updateRangeSuggestions(val);
                    }} 
                    placeholder="e.g. Finest" 
                    placeholderTextColor="#64748b" 
                  />
                  <View style={{ height: 26, justifyContent: 'flex-start', alignItems: 'center', marginTop: 4, flexDirection: 'row' }}>
                    {suggestedTypeAheadRanges.length > 0 && newItemRange.length > 0 && (
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        {suggestedTypeAheadRanges.slice(0, 3).map(r => (
                          <View key={r} style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingLeft: 6, paddingRight: 4, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}>
                            <TouchableOpacity onPress={() => { setNewItemRange(r); setSuggestedTypeAheadRanges([]); }}>
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

                <View style={styles.formSection}>
                    <Text style={styles.miniLabel}>DEFAULT CABINET</Text>
                    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8}}>
                        <TouchableOpacity 
                          key="none" 
                          style={[styles.chip, !newItemDefaultCabinet && styles.chipActive]} 
                          onPress={() => setNewItemDefaultCabinet(null)}
                        >
                          <Text style={[styles.chipText, !newItemDefaultCabinet && styles.chipTextActive]}>No Default</Text>
                        </TouchableOpacity>
                        {cabinets.map(cab => (
                            <TouchableOpacity 
                              key={cab.id} 
                              style={[styles.chip, newItemDefaultCabinet === cab.id && styles.chipActive]} 
                              onPress={() => setNewItemDefaultCabinet(cab.id)}
                            >
                                <Text style={[styles.chipText, newItemDefaultCabinet === cab.id && styles.chipTextActive]}>{cab.cabinet_type === 'freezer' ? '❄ ' : ''}{cab.name}</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity 
                          style={[styles.chip, { borderColor: '#3b82f6', borderWidth: 1, backgroundColor: '#0f172a' }]} 
                          onPress={() => { setInlineCabContext('new_item'); setShowInlineAddCabinet(true); }}
                        >
                            <Text style={[styles.chipText, { color: '#3b82f6' }]}>+ NEW CABINET</Text>
                        </TouchableOpacity>
                    </View>
                    {cabinets.some(c => c.cabinet_type === 'freezer') && (
                        <Text style={{ color: '#64748b', fontSize: 11, fontStyle: 'italic', marginTop: -2, marginBottom: 4 }}>❄ Designated Freezer Cabinet</Text>
                    )}
                </View>
                </View>



                <TouchableOpacity onPress={() => handleAddItemType(cat.id)} style={[styles.addSaveBtnFull, { marginTop: 16 }]} testID="submit-item-type-btn"><Text style={styles.addSaveText}>DEPLOY ITEM</Text></TouchableOpacity>
                <TouchableOpacity style={{marginTop: 12, alignItems: 'center'}} onPress={() => setSelectedCat(null)}><Text style={{color: '#64748b', fontSize: 12, fontWeight: 'bold'}}>CANCEL</Text></TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.addNewBtn} onPress={() => setSelectedCat(cat.id)} testID={`expand-add-item-${cat.name.toLowerCase().replace(/\s+/g, '-')}`}>
                <Text style={styles.addNewText}>+ Add Item Type</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderCabinet = ({ item: cab }: any) => (
    <View style={styles.catCard}>
      <View style={styles.catHeader}>
        {editingCabId === cab.id ? (
          <View style={{flexDirection: 'column', flex: 1, backgroundColor: '#0f172a', padding: 10, borderRadius: 8, gap: 8}}>
            <Text style={[styles.formLabel, { marginTop: 10, marginBottom: 10, marginHorizontal: 0 }]}>Edit Cabinet</Text>
            <View>
              <Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold', marginBottom: 4, paddingLeft: 4}}>CABINET NAME</Text>
              <TextInput
                style={[styles.inputSmall, editingCabError ? { borderColor: '#ef4444', borderWidth: 1 } : {}]}
                value={editingCabName}
                onChangeText={(v) => { setEditingCabName(v); setEditingCabError(null); }}
                placeholder="e.g. Spare Supplies, Spice Cupboard"
                placeholderTextColor="#64748b"
              />
              {editingCabError && <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: 'bold', marginTop: 4, paddingLeft: 4 }}>{editingCabError}</Text>}
            </View>
            <View style={{marginTop: 8}}>
              <Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold', marginBottom: 4, paddingLeft: 4}}>PHYSICAL LOCATION</Text>
              <TextInput style={styles.inputSmall} value={editingCabLocation} onChangeText={setEditingCabLocation} placeholder="e.g. Kitchen, Garage" placeholderTextColor="#64748b" />
            </View>
            <View style={{marginTop: 8}}>
              <Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold', marginBottom: 4, paddingLeft: 4}}>CABINET TYPE</Text>
              <View style={styles.unitChipRowMini}>
                <TouchableOpacity style={[styles.unitChip, editingCabType === 'standard' && styles.unitChipActive]} onPress={() => setEditingCabType('standard')}>
                  <Text style={[styles.unitChipText, editingCabType === 'standard' && styles.unitChipTextActive]}>Standard</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.unitChip, {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6}, editingCabType === 'freezer' && {backgroundColor: '#0f2744', borderWidth: 1, borderColor: '#60a5fa'}]}
                  onPress={() => { if (editingCabType === 'freezer') { setEditingCabType('standard'); } else { if (checkEntitlement('FREEZER')) setEditingCabType('freezer'); } }}
                  testID="edit-cab-type-freezer"
                >
                  <MaterialCommunityIcons name="snowflake" size={12} color={editingCabType === 'freezer' ? '#60a5fa' : '#64748b'} />
                  <Text style={[styles.unitChipText, editingCabType === 'freezer' && {color: '#60a5fa'}]}>Freezer</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity onPress={() => handleUpdateCabinet(cab.id)} style={[styles.addSaveBtnFull, { marginTop: 12 }]} testID="save-cabinet-btn"><Text style={styles.addSaveText}>SAVE CHANGES</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setEditingCabId(null)} style={{ marginTop: 10, alignItems: 'center' }} testID="close-edit-cab-btn"><Text style={{ color: '#64748b', fontSize: 12, fontWeight: 'bold' }}>CANCEL</Text></TouchableOpacity>
          </View>
        ) : (
          <View style={{flexDirection: 'row', flex: 1, justifyContent: 'space-between'}}>
            <View><Text style={styles.catTitle}>{cab.name}</Text><Text style={{color: '#64748b', fontSize: 13}}>{cab.location || 'No Location'}</Text>{cab.cabinet_type === 'freezer' && (<View style={{flexDirection:'row',alignItems:'center',gap:4,marginTop:3}}><MaterialCommunityIcons name="snowflake" size={11} color="#60a5fa" /><Text style={{color:'#60a5fa',fontSize:11,fontWeight:'bold'}}>FREEZER</Text></View>)}</View>
            <View style={styles.catActions}>
              <TouchableOpacity onPress={() => { setEditingCabId(cab.id); setEditingCabName(cab.name); setEditingCabLocation(cab.location || ''); setEditingCabType(cab.cabinet_type || 'standard'); }} style={{marginRight: 10}} testID={`edit-cab-btn-${cab.name.toLowerCase().replace(/\s+/g, '-')}`}><MaterialCommunityIcons name="pencil" size={20} color="#3b82f6" /></TouchableOpacity>
                <TouchableOpacity disabled={cab.stock_count > 0} onPress={() => handleDeleteCabinet(cab.id, cab.stock_count > 0)}><MaterialCommunityIcons name="delete" size={20} color={cab.stock_count > 0 ? "#334155" : "#ef4444"} /></TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.back()} style={styles.backBtn} testID="back-btn">
          <MaterialCommunityIcons name="arrow-left" size={24} color="#f8fafc" />
        </TouchableOpacity>
        <View style={{flex: 1, marginLeft: 16}}>
          <Text style={styles.title}>Recon & Logistics</Text>
          <Text style={styles.headerSubtitle}>Catalog & Site Configuration</Text>
        </View>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity accessibilityRole="tab" style={[styles.tab, activeTab === 'catalog' && styles.tabActive]} onPress={() => setActiveTab('catalog')} testID="tab-catalog"><Text style={[styles.tabText, activeTab === 'catalog' && styles.tabTextActive]}>CATALOG</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="tab" style={[styles.tab, activeTab === 'cabinets' && styles.tabActive]} onPress={() => setActiveTab('cabinets')} testID="tab-cabinets"><Text style={[styles.tabText, activeTab === 'cabinets' && styles.tabTextActive]}>CABINETS</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="tab" style={[styles.tab, activeTab === 'rank' && styles.tabActive]} onPress={() => setActiveTab('rank')} testID="tab-rank"><Text style={[styles.tabText, activeTab === 'rank' && styles.tabTextActive]}>RANK</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="tab" style={[styles.tab, activeTab === 'system' && styles.tabActive]} onPress={() => setActiveTab('system')} testID="tab-system"><Text style={[styles.tabText, activeTab === 'system' && styles.tabTextActive]}>STOCK ALERTS</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="tab" style={[styles.tab, activeTab === 'backups' && styles.tabActive]} onPress={() => { if (checkEntitlement('BACKUPS')) setActiveTab('backups'); }} testID="tab-backups"><Text style={[styles.tabText, activeTab === 'backups' && styles.tabTextActive]}>BACKUPS</Text></TouchableOpacity>
      </View>

      {activeTab === 'catalog' ? (
        <FlatList data={categories} keyExtractor={i => i.id.toString()} renderItem={renderCategory} ListHeaderComponent={(
            <View>
              {/* Metrics Panel */}
              <View style={styles.metricsPanel}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricVal}>{categories.length}</Text>
                  <Text style={styles.metricLabel}>CATEGORIES</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricVal}>{totalItemCount}</Text>
                  <Text style={styles.metricLabel}>ITEMS</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={[styles.metricVal, minReqCount === 0 && {color: '#ef4444'}]}>{minReqCount}</Text>
                  <Text style={styles.metricLabel}>MIN TARGETS</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={[styles.metricVal, maxReqCount === 0 && {color: '#5b21b6'}]}>{maxReqCount}</Text>
                  <Text style={styles.metricLabel}>MAX TARGETS</Text>
                </View>
              </View>

              {minReqCount === 0 && (
                <View style={styles.advisoryWarning}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#fbbf24" style={{marginRight: 8}} />
                  <Text style={styles.advisoryText}>No minimum desired stock levels have been set. Configure some minimum thresholds below to enable Quartermaster low stock reports and alerts.</Text>
                </View>
              )}

              <View style={styles.newCatBlock}>
                <Text style={styles.label}>New Category</Text>
                <View style={styles.newRow}>
                  <TextInput style={styles.inputMedium} value={newCatName} onChangeText={setNewCatName} placeholder="Category Name" placeholderTextColor="#64748b" testID="new-cat-input" />
                  <TouchableOpacity onPress={handleAddCategory} style={styles.addSaveBtnLarge} testID="create-cat-btn"><Text style={styles.addSaveTextLarge}>CREATE</Text></TouchableOpacity>
                </View>
              </View>
            </View>
          )} />
      ) : activeTab === 'cabinets' ? (
        <FlatList data={cabinets} keyExtractor={i => i.id.toString()} renderItem={renderCabinet} ListHeaderComponent={(
            <View style={[styles.newCatBlock, { backgroundColor: '#0f172a', borderRadius: 8, padding: 10, paddingTop: 0 }]}>
              <Text style={styles.formLabel}>New Cabinet / Location</Text>
              <View style={{ marginBottom: 10 }}>
                    <Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold', marginBottom: 4, paddingLeft: 4}}>CABINET NAME</Text>
                    <TextInput
                      style={[styles.inputSmall, newCabError ? { borderColor: '#ef4444', borderWidth: 1 } : {}]}
                      value={newCabName}
                      onChangeText={(v) => { setNewCabName(v); setNewCabError(null); }}
                      placeholder="e.g. Spare Supplies, Spice Cupboard"
                      placeholderTextColor="#64748b"
                      testID="new-cab-name-input"
                    />
                    {newCabError && <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: 'bold', marginTop: 4, paddingLeft: 4 }}>{newCabError}</Text>}
                  </View>
                  <View style={{ marginBottom: 10 }}>
                    <Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold', marginBottom: 4, paddingLeft: 4}}>PHYSICAL LOCATION</Text>
                    <TextInput style={styles.inputSmall} value={newCabLocation} onChangeText={setNewCabLocation} placeholder="e.g. Kitchen, Garage" placeholderTextColor="#64748b" testID="new-cab-loc-input" />
                  </View>
                  <View style={{ marginBottom: 10 }}>
                    <Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold', marginBottom: 4, paddingLeft: 4}}>CABINET TYPE</Text>
                    <View style={styles.unitChipRowMini}>
                      <TouchableOpacity style={[styles.unitChip, newCabType === 'standard' && styles.unitChipActive]} onPress={() => setNewCabType('standard')}>
                        <Text style={[styles.unitChipText, newCabType === 'standard' && styles.unitChipTextActive]}>Standard</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.unitChip, {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6}, newCabType === 'freezer' && {backgroundColor: '#0f2744', borderWidth: 1, borderColor: '#60a5fa'}]}
                        onPress={() => { if (newCabType === 'freezer') { setNewCabType('standard'); } else { if (checkEntitlement('FREEZER')) setNewCabType('freezer'); } }}
                        testID="new-cab-type-freezer"
                      >
                        <MaterialCommunityIcons name="snowflake" size={12} color={newCabType === 'freezer' ? '#60a5fa' : '#64748b'} />
                        <Text style={[styles.unitChipText, newCabType === 'freezer' && {color: '#60a5fa'}]}>Freezer</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <TouchableOpacity onPress={handleAddCabinet} style={styles.addSaveBtnFull} testID="create-cab-btn"><Text style={styles.addSaveText}>DEPLOY CABINET</Text></TouchableOpacity>
              </View>
            )} />
      ) : activeTab === 'system' ? (
        <View style={{padding: 10}}>
          <View style={styles.prefRow}>
            <View style={{flex: 1}}><Text style={styles.prefTitle}>Monthly Stock Alerts</Text><Text style={styles.prefSub}>Receive a notification on the 1st of every month with expiry counts.</Text></View>
            <Switch
              value={autoBackupEnabled}
              onValueChange={(val) => { if (!checkEntitlement('ALERTS')) return; toggleAutoBackup(val); }}
              trackColor={{ false: "#334155", true: "#22c55e" }}
              thumbColor={autoBackupEnabled ? "#f8fafc" : "#94a3b8"}
            />
          </View>
          <View style={{marginTop: 40}}><TouchableOpacity style={styles.testBtn} onPress={async () => {
            if (!checkEntitlement('ALERTS')) return;
            const { testStockAlert } = await import('../services/notifications');
            await testStockAlert(db);
            Alert.alert('System Armed', 'A test alert has been dispatched.');
          }}><MaterialCommunityIcons name="bell-ring" size={24} color="white" /><Text style={styles.testBtnText}>TEST STOCK ALERT</Text></TouchableOpacity></View>
          <TouchableOpacity testID="debug-purge-db" style={{ backgroundColor: '#ef4444', padding: 16, borderRadius: 12, marginTop: 40, alignItems: 'center' }} onPress={async () => {try {await db.runAsync('DELETE FROM Inventory');await db.runAsync('DELETE FROM ItemTypes');await db.runAsync('DELETE FROM Categories');await db.runAsync('DELETE FROM Settings WHERE key = ?', 'persistence_mirror_uri');await db.runAsync('DELETE FROM Settings WHERE key = ?', 'license_key');await db.runAsync('DELETE FROM Settings WHERE key = ?', 'license_key_sergeant');await db.runAsync('DELETE FROM Settings WHERE key = ?', 'license_key_general');if (typeof window !== 'undefined') window.location.reload();} catch (e) {console.error("Purge Error:", e);}}}><Text style={{fontSize: 14, color: 'white', fontWeight: 'bold'}}>DEVELOPER: WIPE SYSTEM & LICENSE</Text></TouchableOpacity>
        </View>
      ) : activeTab === 'backups' ? (
        <View style={{padding: 10, flex: 1}}>
          <View style={styles.prefRow}>
            <View style={{flex: 1}}><Text style={styles.prefTitle}>Rolling Hourly Archive</Text><Text style={styles.prefSub}>Automatically capture a snapshot every hour if changes occur (Keeps last 5).</Text></View>
            <Switch value={autoBackupEnabled} onValueChange={toggleAutoBackup} trackColor={{ false: "#334155", true: "#22c55e" }} thumbColor={autoBackupEnabled ? "#f8fafc" : "#94a3b8"} />
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#3b82f6'}]} onPress={handleManualBackup}><MaterialCommunityIcons name="backup-restore" size={20} color="white" /><Text style={styles.actionBtnText}>SNAPSHOT NOW</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#ef4444'}]} onPress={handleRestore}><MaterialCommunityIcons name="file-import" size={20} color="white" /><Text style={styles.actionBtnText}>IMPORT BACKUP</Text></TouchableOpacity>
          </View>
          <Text style={styles.label}>Local Snapshot Archive (Rolling 5)</Text>
          <FlatList data={backups} keyExtractor={item => item.name} renderItem={({ item }) => (<View style={styles.backupItem}><View style={{flex: 1}}><Text style={styles.backupName}>{new Date(item.timestamp).toLocaleDateString()}</Text><Text style={styles.backupMeta}>{new Date(item.timestamp).toLocaleTimeString()}</Text></View><View style={{flexDirection: 'row', gap: 8}}><TouchableOpacity onPress={() => handleLocalRestore(item)} style={[styles.shareBtn, {backgroundColor: '#ef4444'}]}><MaterialCommunityIcons name="backup-restore" size={20} color="white" /></TouchableOpacity><TouchableOpacity onPress={() => BackupService.shareBackup(item.uri)} style={styles.shareBtn}><MaterialCommunityIcons name="share-variant" size={20} color="#3b82f6" /></TouchableOpacity></View></View>)} ListEmptyComponent={<Text style={{color: '#64748b', textAlign: 'center', marginTop: 20}}>No backups recorded yet.</Text>} ListFooterComponent={Platform.OS === 'android' ? (<View style={{marginTop: 24, paddingBottom: 40}}><Text style={styles.prefTitle}>Strategic Shadow Mirroring</Text><Text style={styles.prefSub}>On Android, auto-backups are wiped if the app is uninstalled. Enable mirroring for disaster recovery.</Text><TouchableOpacity style={[styles.testBtn, {marginTop: 12, backgroundColor: mirrorUri ? '#22c55e' : '#334155'}]} onPress={handlePersistentMirrorSetup}><MaterialCommunityIcons name="folder-sync" size={24} color="white" /><Text style={styles.testBtnText}>{mirrorUri ? 'MIRROR ACTIVE' : 'SETUP MIRROR FOLDER'}</Text></TouchableOpacity></View>) : null} />
        </View>
      ) : activeTab === 'rank' ? (
        <ScrollView style={{padding: 16}} contentContainerStyle={{paddingBottom: 40}}>
          <View style={[styles.promoHeader, { marginBottom: 24 }]}>
              <MaterialCommunityIcons name="medal-outline" size={32} color="#fbbf24" style={{ marginBottom: 8 }} />
              <Text style={styles.promoTitle}>SERVICE PROMOTION CENTRE</Text>
              <Text style={styles.promoSub}>Advance your rank to unlock advanced strategic command & logistics.</Text>
          </View>

          {/* ACTIVE STATUS HEADER (CADET ONLY) */}
          {isCadet && (
            <View style={[styles.tierCard, styles.tierCardActive, { backgroundColor: '#0f172a', marginBottom: 24, borderLeftWidth: 4, borderLeftColor: '#fbbf24' }]}>
              <View style={styles.tierStatusRow}>
                <Text style={[styles.tierCardRank, { color: '#fbbf24' }]}>RANK: CADET (IN TRAINING)</Text>
                <View style={[styles.activeRankBadge, { backgroundColor: '#fbbf24' }]}><Text style={[styles.activeRankText, { color: '#000' }]}>CURRENT</Text></View>
              </View>
              <Text style={[styles.tierPrice, { color: '#fbbf24', marginTop: 8 }]}>HIGH-COMMAND INTEL ACTIVE</Text>
              <Text style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>
                Your 7-day tactical evaluation is underway. Full AI &amp; Alerts enabled.
                Scale limited: 2 Cabinets · 4 Categories · 12 Items. Freezer trial: 1 Cabinet · 3 Item types.
              </Text>
              <View style={styles.trialBadge}>
                <Text style={styles.trialBadgeText}>{trialLabel.toUpperCase()} REMAINING</Text>
              </View>
            </View>
          )}

          {/* PRIVATE TIER (The First Promotion) */}
          <View style={[styles.tierCard, isPrivate && styles.tierCardActive]}>
            <View style={styles.tierStatusRow}>
              <Text style={styles.tierCardRank}>RANK: PRIVATE</Text>
              {isPrivate && <View style={styles.activeRankBadge}><Text style={styles.activeRankText}>CURRENT</Text></View>}
            </View>
            <Text style={styles.tierPrice}>FREE — ENLISTED STATUS</Text>
            <View style={styles.featureItem}><MaterialCommunityIcons name="check" size={16} color="#22c55e" /><Text style={styles.featureText}>4 Cabinets · 8 Categories · 24 Items</Text></View>
            <View style={styles.featureItem}><MaterialCommunityIcons name="close-circle" size={16} color="#475569" /><Text style={styles.featureText}>No AI recipes, no alerts, no freezer logistics</Text></View>
            
            {isCadet && (
              <TouchableOpacity 
                style={[styles.upgradeBtn, { backgroundColor: '#334155', marginTop: 16 }]} 
                onPress={graduateEarly}
              >
                <Text style={styles.upgradeBtnText}>GRADUATE EARLY TO PRIVATE</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* SERGEANT TIER */}
          <View style={[styles.tierCard, isSergeant && styles.tierCardActive, { borderColor: '#3b82f6' }]}>
            <View style={styles.tierStatusRow}>
              <Text style={[styles.tierCardRank, { color: '#60a5fa' }]}>RANK: SERGEANT</Text>
              {isSergeant && <View style={[styles.activeRankBadge, { backgroundColor: '#3b82f6' }]}><Text style={styles.activeRankText}>CURRENT</Text></View>}
            </View>
            <Text style={[styles.tierPrice, { color: '#60a5fa' }]}>£2.99 — ONE-TIME LICENCE</Text>
            <View style={styles.featureItem}><MaterialCommunityIcons name="infinity" size={16} color="#60a5fa" /><Text style={styles.featureText}>Unlimited cabinets, categories &amp; items</Text></View>
            <View style={styles.featureItem}><MaterialCommunityIcons name="snowflake" size={16} color="#60a5fa" /><Text style={styles.featureText}>Full freezer logistics — age-based tracking</Text></View>
            <View style={styles.featureItem}><MaterialCommunityIcons name="truck-delivery" size={16} color="#60a5fa" /><Text style={styles.featureText}>The Quartermaster — low-stock reports &amp; sharing</Text></View>
            {!isSergeanOrAbove && (
              <TouchableOpacity style={[styles.upgradeBtn, { backgroundColor: '#3b82f6' }]} onPress={() => requestPurchase('SERGEANT')}>
                <Text style={styles.upgradeBtnText}>COMMISSION SERGEANT RANK</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* GENERAL TIER */}
          <View style={[styles.tierCard, isGeneral && styles.tierCardActive, { borderColor: '#fbbf24' }]}>
            <View style={styles.tierStatusRow}>
              <Text style={[styles.tierCardRank, { color: '#fbbf24' }]}>RANK: GENERAL</Text>
              {isGeneral && <View style={[styles.activeRankBadge, { backgroundColor: '#fbbf24' }]}><Text style={[styles.activeRankText, { color: '#000' }]}>CURRENT</Text></View>}
            </View>
            <Text style={[styles.tierPrice, { color: '#fbbf24' }]}>£1.49/MONTH · £9.99/YEAR — HIGH COMMAND</Text>
            <Text style={{ color: '#64748b', fontSize: 11, fontStyle: 'italic', marginBottom: 8 }}>Everything in Sergeant, plus:</Text>
            <View style={styles.featureItem}><MaterialCommunityIcons name="bell-ring" size={16} color="#fbbf24" /><Text style={styles.featureText}>Automated low-stock &amp; expiry alerts</Text></View>
            <View style={styles.featureItem}><MaterialCommunityIcons name="chef-hat" size={16} color="#fbbf24" /><Text style={styles.featureText}>The Mess Hall — waste-conscious AI recipes</Text></View>
            <View style={styles.featureItem}><MaterialCommunityIcons name="file-sync" size={16} color="#fbbf24" /><Text style={styles.featureText}>Automated backups &amp; disaster recovery</Text></View>
            {!isGeneralOrAbove && (
              <TouchableOpacity style={[styles.upgradeBtn, { backgroundColor: '#fbbf24' }]} onPress={() => requestPurchase('GENERAL')}>
                <Text style={[styles.upgradeBtnText, { color: '#000' }]}>ASSUME HIGH COMMAND — £1.49/MO</Text>
              </TouchableOpacity>
            )}
          </View>

          {__DEV__ && (
            <TouchableOpacity 
              style={{ backgroundColor: '#ef4444', padding: 16, borderRadius: 8, marginTop: 24, alignItems: 'center' }} 
              onPress={async () => {
                await db.runAsync('DELETE FROM Settings WHERE key = ?', 'license_key');
                await db.runAsync('DELETE FROM Settings WHERE key = ?', 'license_key_general');
                await db.runAsync('DELETE FROM Settings WHERE key = ?', 'license_key_sergeant');
                Alert.alert('Demoted', 'Licenses revoked. Completely reload the app to reflect as Cadet.');
              }}
            >
              <Text style={{ color: 'white', fontWeight: 'bold' }}>DEVELOPER DEMOTE (CLEAR LICENSES)</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.promoFooter}>Sergeant is a one-time licence. General is a monthly or annual subscription — cancel any time. All upgrades are permanent to this device.</Text>

          {/* ALLIED OPERATIONS (REESTIT) */}
          <View style={{ borderTopWidth: 1, borderTopColor: '#1e293b', marginTop: 32, paddingTop: 32 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 }}>
              <MaterialCommunityIcons name="shield-account" size={20} color="#6366f1" />
              <Text style={{ color: '#818cf8', fontWeight: 'bold', letterSpacing: 1, fontSize: 13 }}>PERSONNEL DISPATCH (SISTER SERVICE)</Text>
            </View>
            
            <View style={[styles.tierCard, { borderColor: '#4f46e5', borderLeftWidth: 4, borderLeftColor: '#6366f1', padding: 20 }]}>
              <View style={styles.tierStatusRow}>
                <Text style={{ color: '#f8fafc', fontSize: 18, fontWeight: 'bold' }}>REESTIT: R&R INTEL</Text>
                <View style={{ backgroundColor: '#4f46e5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ color: 'white', fontSize: 8, fontWeight: 'bold' }}>FROM THE DEVELOPER</Text>
                </View>
              </View>
              <Text style={{ color: '#94a3b8', fontSize: 13, marginTop: 8, lineHeight: 20 }}>
                From the same tactical lab that built the War Cabinet. Reestit provides pithy, AI-driven summaries of holiday rental reviews. Know the strengths and pitfalls of your retreat before you deploy.
              </Text>
              <TouchableOpacity 
                style={[styles.upgradeBtn, { backgroundColor: '#6366f1', marginTop: 20 }]} 
                onPress={() => Linking.openURL('https://reestit.com')}
              >
                <MaterialCommunityIcons name="launch" size={18} color="white" style={{ position: 'absolute', left: 16 }} />
                <Text style={styles.upgradeBtnText}>EXPLORE REESTIT INTEL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

      ) : null}

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

            <TouchableOpacity style={styles.saveButton} onPress={handleCreateInlineCabinet}>
              <Text style={styles.saveText}>CREATE CABINET</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalClose} onPress={() => setShowInlineAddCabinet(false)}>
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
  headerRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#1e293b', 
    paddingTop: Platform.OS === 'ios' ? 40 : 10, 
    paddingBottom: 15, 
    paddingHorizontal: 16, 
    borderBottomWidth: 1, 
    borderBottomColor: '#334155', 
    marginBottom: 0 
  },
  title: { fontSize: 24, color: '#f8fafc', fontWeight: 'bold' },
  headerSubtitle: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
  backBtn: { padding: 10, backgroundColor: '#334155', borderRadius: 24 },
  tabRow: { flexDirection: 'row', marginTop: 16, marginBottom: 20, marginHorizontal: 16, backgroundColor: '#1e293b', borderRadius: 8, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  tabActive: { backgroundColor: '#3b82f6' },
  feedbackText: { color: '#3b82f6', fontWeight: 'bold', fontSize: 13, letterSpacing: 1 },
  tabText: { color: '#64748b', fontWeight: 'bold', fontSize: 11, letterSpacing: 0.2 },
  tabTextActive: { color: 'white' },
  label: { color: '#94a3b8', fontSize: 16, marginBottom: 8, marginTop: 10, marginHorizontal: 16 },
  formLabel: { color: '#94a3b8', fontSize: 16, marginBottom: 12, marginTop: 12, marginHorizontal: 16 },
  prefRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', padding: 20, borderRadius: 12, marginBottom: 12, marginHorizontal: 16, borderWidth: 1, borderColor: '#334155' },
  prefTitle: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold' },
  prefSub: { color: '#94a3b8', fontSize: 13, marginTop: 4 },
  testBtn: { backgroundColor: '#3b82f6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 12, gap: 10, marginHorizontal: 16, marginTop: 10 },
  testBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  newCatBlock: { marginHorizontal: 16, marginBottom: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  newRow: { flexDirection: 'row', alignItems: 'center' },
  inputMedium: { flex: 1, backgroundColor: '#0f172a', color: '#f8fafc', borderRadius: 8, padding: 12, fontSize: 16, borderWidth: 1, borderColor: '#334155', marginRight: 10 },
  addSaveBtnLarge: { backgroundColor: '#3b82f6', padding: 14, borderRadius: 8 },
  addSaveTextLarge: { color: 'white', fontWeight: 'bold' },
  inputSmall: { flex: 1, backgroundColor: '#0f172a', color: '#f8fafc', borderRadius: 6, padding: 8, fontSize: 14, borderWidth: 1, borderColor: '#334155' },
  addSaveBtn: { backgroundColor: '#22c55e', padding: 10, borderRadius: 6 },
  addSaveText: { color: 'white', fontWeight: '600', fontSize: 12 },
  catCard: { marginHorizontal: 16, backgroundColor: '#1e293b', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, marginBottom: 12 },
  catTitle: { color: '#e2e8f0', fontSize: 18, fontWeight: 'bold', flex: 1 },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catActions: { flexDirection: 'row' },
  saveActionBtn: { backgroundColor: '#22c55e', padding: 8, borderRadius: 6, marginLeft: 8 },
  typeRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#334155' },
  typeText: { color: '#cbd5e1', fontSize: 15, flex: 1 },
  addNewBtn: { marginTop: 12 },
  addNewText: { color: '#3b82f6', fontWeight: '600' },
  newTypeContainer: { marginTop: 12, backgroundColor: '#0f172a', padding: 10, paddingTop: 0, borderRadius: 8 },
  addSaveBtnFull: { backgroundColor: '#22c55e', padding: 12, borderRadius: 6, alignItems: 'center', marginTop: 10 },
  unitChipRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  unitChipRowMini: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  unitChip: { flex: 1, paddingVertical: 6, marginHorizontal: 2, alignItems: 'center', borderRadius: 6, backgroundColor: '#1e293b' },
  unitChipActive: { backgroundColor: '#3b82f6' },
  unitChipText: { color: '#64748b', fontSize: 12, fontWeight: 'bold' },
  unitChipTextActive: { color: 'white' },
  chip: { backgroundColor: '#334155', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, marginRight: 8 },
  chipActive: { backgroundColor: '#3b82f6' },
  chipText: { color: '#cbd5e1', fontWeight: 'bold' },
  chipTextActive: { color: 'white' },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 24, marginTop: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 10, gap: 8 },
  actionBtnText: { color: 'white', fontWeight: 'bold', fontSize: 13 },
  backupItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', padding: 16, borderRadius: 10, marginBottom: 8 },
  backupName: { color: '#f8fafc', fontSize: 14, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontWeight: 'bold' },
  backupMeta: { color: '#64748b', fontSize: 11, marginTop: 2 },
  shareBtn: { backgroundColor: '#334155', padding: 10, borderRadius: 8 },
  statBadgeRow: { flexDirection: 'row', marginLeft: 36, marginTop: 4, flexWrap: 'wrap', gap: 5 },
  statBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#0f172a', 
    paddingHorizontal: 7, 
    paddingVertical: 2, 
    borderRadius: 4, 
    borderWidth: 1, 
    borderColor: '#334155' 
  },
  statBadgeText: { color: '#94a3b8', fontSize: 10, fontWeight: 'bold', marginLeft: 4, textTransform: 'uppercase' },
  metricsPanel: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 16 },
  metricCard: { flex: 1, backgroundColor: '#1e293b', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center' },
  metricVal: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold' },
  metricLabel: { color: '#64748b', fontSize: 8.5, fontWeight: 'bold', marginTop: 4, letterSpacing: 0.5, textAlign: 'center' },
  advisoryWarning: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1c1200', borderLeftWidth: 4, borderLeftColor: '#fbbf24', padding: 12, marginHorizontal: 16, marginBottom: 20 },
  advisoryText: { flex: 1, color: '#fbbf24', fontSize: 12, fontWeight: 'bold', fontStyle: 'italic' },
  lockOverlay: { 
    backgroundColor: '#0f172a', 
    borderWidth: 1, 
    borderColor: '#334155', 
    borderStyle: 'dashed', 
    padding: 20, 
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center',
    gap: 8,
    marginTop: 8
  },
  lockText: { color: '#fbbf24', fontSize: 10, fontWeight: 'bold', textAlign: 'center' },
  promoHeader: { alignItems: 'center', backgroundColor: '#1e293b', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#334155' },
  promoTitle: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold', letterSpacing: 1 },
  promoSub: { color: '#94a3b8', fontSize: 12, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  tierCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
  tierCardActive: { backgroundColor: '#1e293b', borderColor: '#22c55e', borderLeftWidth: 4 },
  tierStatusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  tierCardRank: { color: '#94a3b8', fontSize: 13, fontWeight: 'bold', letterSpacing: 1 },
  activeRankBadge: { backgroundColor: '#22c55e', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  activeRankText: { color: 'white', fontSize: 9, fontWeight: 'bold' },
  tierPrice: { fontSize: 13, fontWeight: 'bold', marginBottom: 16, marginTop: 4 },
  featureItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  featureText: { color: '#cbd5e1', fontSize: 12, fontWeight: '500' },
  upgradeBtn: { padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  upgradeBtnText: { color: 'white', fontWeight: 'bold', fontSize: 13, letterSpacing: 0.5 },
  lockedNote: { marginTop: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#334155' },
  lockedNoteText: { color: '#64748b', fontSize: 11, fontStyle: 'italic' },
  promoFooter: { color: '#94a3b8', fontSize: 11, textAlign: 'center', marginTop: 10, lineHeight: 16 },
  miniLabel: { color: '#cbd5e1', fontSize: 12, fontWeight: 'bold', marginBottom: 4, paddingLeft: 4, textTransform: 'uppercase' },
  formSection: { marginBottom: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1e293b', borderRadius: 16, padding: 24, maxHeight: '80%' },
  modalTitle: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  modalClose: { marginTop: 20, padding: 15, alignItems: 'center' },
  modalCloseText: { color: '#ef4444', fontWeight: 'bold', letterSpacing: 1 },
  saveButton: { backgroundColor: '#22c55e', padding: 18, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  saveText: { color: 'white', fontWeight: 'bold', fontSize: 18 }
});
