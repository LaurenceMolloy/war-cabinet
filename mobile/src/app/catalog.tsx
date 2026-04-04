import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Switch, Platform } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { BackupService, BackupMetadata } from '../services/BackupService';
import { markModified } from '../db/sqlite';

export default function CatalogScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
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

  const [newItemMinStock, setNewItemMinStock] = useState('');
  const [newItemMaxStock, setNewItemMaxStock] = useState('');

  const [cabinets, setCabinets] = useState<any[]>([]);
  const [newCabName, setNewCabName] = useState('');
  const [newCabLocation, setNewCabLocation] = useState('');
  const [editingCabId, setEditingCabId] = useState<number | null>(null);
  const [editingCabName, setEditingCabName] = useState('');
  const [editingCabLocation, setEditingCabLocation] = useState('');
  
  const [activeTab, setActiveTab] = useState<'categories' | 'cabinets' | 'system' | 'backups'>('categories');
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [logisticsEmail, setLogisticsEmail] = useState('');
  const [mirrorUri, setMirrorUri] = useState<string | null>(null);
  const [backups, setBackups] = useState<BackupMetadata[]>([]);

  const load = async () => {
    const rows = await db.getAllAsync(`
      SELECT c.id as cat_id, c.name as cat_name, i.id as type_id, i.name as type_name, i.unit_type as type_unit, i.is_favorite, i.interaction_count, i.default_size as type_default_size,
             i.min_stock_level, i.max_stock_level,
             (SELECT COUNT(*) FROM Inventory v WHERE v.item_type_id = i.id) as type_stock_count
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
            max_stock: row.max_stock_level
        });
      }
      return acc;
    }, []);

    setCategories(grouped as any[]);

    const cabRows = await db.getAllAsync(`
      SELECT c.*, (SELECT COUNT(*) FROM Inventory v WHERE v.cabinet_id = c.id) as stock_count
      FROM Cabinets c
      ORDER BY c.name
    `);
    setCabinets(cabRows);

    const setRes = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', 'month_brief_enabled');
    setAlertsEnabled(setRes?.value === '1');

    const backupRes = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', 'auto_backup_enabled');
    setAutoBackupEnabled(backupRes?.value === '1');

    const mirrorRes = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', 'persistence_mirror_uri');
    setMirrorUri(mirrorRes?.value || null);

    const emailRes = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', 'logistics_email');
    setLogisticsEmail(emailRes?.value || '');

    const backupList = await BackupService.getBackupsList();
    setBackups(backupList);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    await db.runAsync('INSERT INTO Categories (name, icon) VALUES (?, ?)', newCatName, 'box');
    setNewCatName('');
    load();
  };

  const handleAddItemType = async (catId: number) => {
    if (!newItemName.trim() || selectedCat !== catId) return;

    let finalDefaultSize = null;
    const rawNumber = newItemDefaultSize.replace(/[^0-9]/g, '');
    if (rawNumber) {
      if (newItemUnit === 'volume') finalDefaultSize = `${rawNumber}ml`;
      else if (newItemUnit === 'weight') finalDefaultSize = `${rawNumber}g`;
      else finalDefaultSize = `${rawNumber} Unit`;
    }

    if (newItemMinStock && newItemMaxStock && parseInt(newItemMaxStock) < parseInt(newItemMinStock)) {
      Alert.alert('Logistics Error', 'Max target must be greater than or equal to Min threshold.');
      return;
    }

    await db.runAsync('INSERT INTO ItemTypes (category_id, name, unit_type, default_size, min_stock_level, max_stock_level) VALUES (?, ?, ?, ?, ?, ?)', 
        catId, newItemName, newItemUnit, finalDefaultSize, 
        newItemMinStock ? parseInt(newItemMinStock) : null,
        newItemMaxStock ? parseInt(newItemMaxStock) : null
    );
    setNewItemName('');
    setNewItemDefaultSize('');
    setSelectedCat(null);
    setNewItemUnit('weight');
    setNewItemMinStock('');
    setNewItemMaxStock('');
    load();
  };

  const handleDeleteItemType = async (typeId: number) => {
    const count = await db.getFirstAsync<{c: number}>('SELECT COUNT(*) as c FROM Inventory WHERE item_type_id = ?', typeId);
    if (count && count.c > 0) {
      Alert.alert('Cannot Delete', 'This item type has stock. Please delete the stock first.');
      return;
    }
    await db.runAsync('DELETE FROM ItemTypes WHERE id = ?', typeId);
    load();
  };

  const handleUpdateCategory = async (catId: number) => {
    if (!editingCatName.trim()) {
      setEditingCatId(null);
      return;
    }
    await db.runAsync('UPDATE Categories SET name = ? WHERE id = ?', editingCatName, catId);
    setEditingCatId(null);
    load();
  };

  const handleAddCabinet = async () => {
    if (!newCabName.trim()) return;
    await db.runAsync('INSERT INTO Cabinets (name, location) VALUES (?, ?)', newCabName, newCabLocation);
    setNewCabName('');
    setNewCabLocation('');
    load();
  };

  const handleUpdateCabinet = async (cabId: number) => {
    if (!editingCabName.trim()) return;
    await db.runAsync('UPDATE Cabinets SET name = ?, location = ? WHERE id = ?', editingCabName, editingCabLocation, cabId);
    setEditingCabId(null);
    load();
  };

  const handleDeleteCabinet = async (cabId: number, hasStock: boolean) => {
    if (hasStock) return;
    await db.runAsync('DELETE FROM Cabinets WHERE id = ?', cabId);
    load();
  };

  const toggleAlerts = async (val: boolean) => {
    setAlertsEnabled(val);
    await db.runAsync('UPDATE Settings SET value = ? WHERE key = ?', val ? '1' : '0', 'month_brief_enabled');
    load();
  };

  const toggleAutoBackup = async (val: boolean) => {
    setAutoBackupEnabled(val);
    await db.runAsync('UPDATE Settings SET value = ? WHERE key = ?', val ? '1' : '0', 'auto_backup_enabled');
    load();
  };

  const handleManualBackup = async () => {
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
    const rawNumber = editingTypeDefaultSize.replace(/[^0-9]/g, '');
    if (rawNumber) {
      if (editingTypeUnit === 'volume') finalDefaultSize = `${rawNumber}ml`;
      else if (editingTypeUnit === 'weight') finalDefaultSize = `${rawNumber}g`;
      else finalDefaultSize = `${rawNumber} Unit`;
    }

    if (editingTypeMinStock && editingTypeMaxStock && parseInt(editingTypeMaxStock) < parseInt(editingTypeMinStock)) {
      Alert.alert('Logistics Error', 'Max target must be greater than or equal to Min threshold.');
      return;
    }

    await db.runAsync('UPDATE ItemTypes SET name = ?, unit_type = ?, default_size = ?, default_cabinet_id = ?, min_stock_level = ?, max_stock_level = ? WHERE id = ?', 
        editingTypeName, editingTypeUnit, finalDefaultSize, editingTypeDefaultCabinet, 
        editingTypeMinStock ? parseInt(editingTypeMinStock) : null,
        editingTypeMaxStock ? parseInt(editingTypeMaxStock) : null,
        typeId);
    setEditingTypeId(null);
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

  const renderCategory = ({ item: cat }: any) => (
    <View style={styles.catCard}>
      <View style={styles.catHeader}>
        {editingCatId === cat.id ? (
          <View style={{flexDirection: 'row', flex: 1}}>
            <TextInput 
              style={[styles.inputSmall, {flex: 1}]} 
              value={editingCatName} 
              onChangeText={setEditingCatName} 
              autoFocus
            />
            <TouchableOpacity onPress={() => handleUpdateCategory(cat.id)} style={styles.saveActionBtn}>
              <MaterialCommunityIcons name="check" size={20} color="white" />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.catTitle}>{cat.name}</Text>
            <View style={styles.catActions}>
              <TouchableOpacity onPress={() => { setEditingCatId(cat.id); setEditingCatName(cat.name); }} style={{marginRight: 10}}>
                <MaterialCommunityIcons name="pencil" size={20} color="#3b82f6" />
              </TouchableOpacity>
              <TouchableOpacity 
                disabled={cat.types.length > 0} 
                onPress={() => handleDeleteCategory(cat.id, cat.types.length > 0)}
              >
                <MaterialCommunityIcons 
                    name="delete" 
                    size={20} 
                    color={cat.types.length > 0 ? "#334155" : "#ef4444"} 
                />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
      {cat.types.map((type: any) => (
        <View key={type.id} style={styles.typeRow}>
          {editingTypeId === type.id ? (
            <View style={{flexDirection: 'column', flex: 1, backgroundColor: '#0f172a', padding: 8, borderRadius: 6, gap: 10}}>
              <View style={{flexDirection: 'row', flex: 1}}>
                <TextInput 
                  style={[styles.inputSmall, {flex: 1}]} 
                  value={editingTypeName} 
                  onChangeText={setEditingTypeName} 
                  autoFocus
                />
                <TouchableOpacity onPress={() => handleUpdateItemType(type.id)} style={styles.saveActionBtn}>
                  <MaterialCommunityIcons name="check" size={20} color="white" />
                </TouchableOpacity>
              </View>
              <View style={{flexDirection: 'row', gap: 10}}>
                <View style={{flex: 1}}>
                  <Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold', marginBottom: 4}}>MIN UNITS</Text>
                  <TextInput 
                    style={styles.inputSmall} 
                    value={editingTypeMinStock} 
                    onChangeText={setEditingTypeMinStock} 
                    keyboardType="numeric"
                    placeholder="Min count"
                    placeholderTextColor="#64748b" 
                  />
                </View>
                <View style={{flex: 1}}>
                  <Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold', marginBottom: 4}}>MAX UNITS</Text>
                  <TextInput 
                    style={styles.inputSmall} 
                    value={editingTypeMaxStock} 
                    onChangeText={setEditingTypeMaxStock} 
                    keyboardType="numeric"
                    placeholder="Max target"
                    placeholderTextColor="#64748b" 
                  />
                </View>
              </View>
              <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 10}}>
                <TextInput 
                  style={[styles.inputSmall, {flex: 1}]} 
                  value={editingTypeDefaultSize} 
                  onChangeText={setEditingTypeDefaultSize} 
                  keyboardType="numeric"
                  placeholder="Default Size (e.g. 500)"
                  placeholderTextColor="#64748b" 
                />
                <Text style={{color: '#64748b', marginLeft: 10, fontSize: 13, fontWeight: 'bold'}}>
                  {editingTypeUnit === 'volume' ? 'ml' : editingTypeUnit === 'weight' ? 'g' : 'Unit'}
                </Text>
              </View>
              <View style={styles.unitChipRowMini}>
                <TouchableOpacity style={[styles.unitChip, editingTypeUnit === 'weight' && styles.unitChipActive]} onPress={() => setEditingTypeUnit('weight')}>
                  <Text style={[styles.unitChipText, editingTypeUnit === 'weight' && styles.unitChipTextActive]}>Weight (g)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.unitChip, editingTypeUnit === 'volume' && styles.unitChipActive]} onPress={() => setEditingTypeUnit('volume')}>
                  <Text style={[styles.unitChipText, editingTypeUnit === 'volume' && styles.unitChipTextActive]}>Volume (ml)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.unitChip, editingTypeUnit === 'count' && styles.unitChipActive]} onPress={() => setEditingTypeUnit('count')}>
                  <Text style={[styles.unitChipText, editingTypeUnit === 'count' && styles.unitChipTextActive]}>Count (Unit)</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <View style={{flex: 1, flexDirection: 'row', alignItems: 'center'}}>
                <TouchableOpacity onPress={() => toggleFavorite(type.id, type.is_favorite)} style={{marginRight: 12}}>
                  <MaterialCommunityIcons 
                    name={type.is_favorite ? "star" : "star-outline"} 
                    size={24} 
                    color={type.is_favorite ? "#eab308" : "#334155"} 
                  />
                </TouchableOpacity>
                <View style={{flex: 1}}>
                  <Text style={styles.typeText}>{type.name}</Text>
                  <Text style={{fontSize: 11, color: '#64748b', textTransform: 'capitalize'}}>
                    {type.unit_type} unit {type.default_size ? `• Default: ${type.default_size}` : ''}
                    {type.min_stock !== null || type.max_stock !== null ? ` • Targets: ${type.min_stock || 0}/${type.max_stock || 0}` : ''}
                  </Text>
                </View>
              </View>
              <View style={styles.catActions}>
                <TouchableOpacity onPress={() => { 
                    setEditingTypeId(type.id); 
                    setEditingTypeName(type.name); 
                    setEditingTypeUnit(type.unit_type || 'weight'); 
                    setEditingTypeDefaultSize(type.default_size || '');
                    setEditingTypeMinStock(type.min_stock !== null ? type.min_stock.toString() : '');
                    setEditingTypeMaxStock(type.max_stock !== null ? type.max_stock.toString() : '');
                    setEditingTypeDefaultCabinet(null);
                }} style={{marginRight: 10, marginTop: 4}}>
                  <MaterialCommunityIcons name="pencil" size={20} color="#3b82f6" />
                </TouchableOpacity>
                <TouchableOpacity 
                    disabled={type.stock_count > 0}
                    onPress={() => handleDeleteItemType(type.id)} 
                    style={{marginTop: 4}}
                >
                  <MaterialCommunityIcons 
                    name="delete" 
                    size={20} 
                    color={type.stock_count > 0 ? "#334155" : "#ef4444"} 
                  />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      ))}

      {selectedCat === cat.id ? (
        <View style={styles.newTypeContainer}>
          <TextInput 
            style={styles.inputSmall} 
            value={newItemName} 
            onChangeText={setNewItemName} 
            placeholder="New Item Name"
            placeholderTextColor="#64748b" 
            testID="new-item-name-input"
          />
          <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 10}}>
            <TextInput 
              style={[styles.inputSmall, {flex: 1}]} 
              value={newItemDefaultSize} 
              onChangeText={setNewItemDefaultSize} 
              keyboardType="numeric"
              placeholder="Default Size (e.g. 500) - Optional"
              placeholderTextColor="#64748b" 
            />
            <Text style={{color: '#64748b', marginLeft: 10, fontSize: 13, fontWeight: 'bold'}}>
              {newItemUnit === 'volume' ? 'ml' : newItemUnit === 'weight' ? 'g' : 'Unit'}
            </Text>
          </View>
          <View style={{flexDirection: 'row', gap: 10, marginTop: 10}}>
             <View style={{flex: 1}}>
                <Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold', marginBottom: 4}}>MIN UNITS</Text>
                <TextInput 
                  style={styles.inputSmall} 
                  value={newItemMinStock} 
                  onChangeText={setNewItemMinStock} 
                  keyboardType="numeric"
                  placeholder="Min count"
                  placeholderTextColor="#64748b" 
                />
             </View>
             <View style={{flex: 1}}>
                <Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold', marginBottom: 4}}>MAX UNITS</Text>
                <TextInput 
                  style={styles.inputSmall} 
                  value={newItemMaxStock} 
                  onChangeText={setNewItemMaxStock} 
                  keyboardType="numeric"
                  placeholder="Max target"
                  placeholderTextColor="#64748b" 
                />
             </View>
          </View>
          <View style={styles.unitChipRow}>
            <TouchableOpacity style={[styles.unitChip, newItemUnit === 'weight' && styles.unitChipActive]} onPress={() => setNewItemUnit('weight')}>
              <Text style={[styles.unitChipText, newItemUnit === 'weight' && styles.unitChipTextActive]}>Weight (g)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.unitChip, newItemUnit === 'volume' && styles.unitChipActive]} onPress={() => setNewItemUnit('volume')}>
              <Text style={[styles.unitChipText, newItemUnit === 'volume' && styles.unitChipTextActive]}>Volume (ml)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.unitChip, newItemUnit === 'count' && styles.unitChipActive]} onPress={() => setNewItemUnit('count')}>
              <Text style={[styles.unitChipText, newItemUnit === 'count' && styles.unitChipTextActive]}>Count (Unit)</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => handleAddItemType(cat.id)} style={styles.addSaveBtnFull} testID="submit-item-type-btn">
            <Text style={styles.addSaveText}>ADD ITEM TYPE</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.addNewBtn} onPress={() => setSelectedCat(cat.id)} testID={`expand-add-item-${cat.name.toLowerCase().replace(/\s+/g, '-')}`}>
          <Text style={styles.addNewText}>+ Add Item Type</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderCabinet = ({ item: cab }: any) => (
    <View style={styles.catCard}>
      <View style={styles.catHeader}>
        {editingCabId === cab.id ? (
          <View style={{flexDirection: 'column', flex: 1, gap: 8}}>
            <TextInput style={styles.inputSmall} value={editingCabName} onChangeText={setEditingCabName} placeholder="Cabinet Name" />
            <TextInput style={styles.inputSmall} value={editingCabLocation} onChangeText={setEditingCabLocation} placeholder="Location" />
            <TouchableOpacity onPress={() => handleUpdateCabinet(cab.id)} style={styles.addSaveBtnFull}>
              <Text style={styles.addSaveText}>SAVE CHANGES</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{flexDirection: 'row', flex: 1, justifyContent: 'space-between'}}>
            <View>
              <Text style={styles.catTitle}>{cab.name}</Text>
              <Text style={{color: '#64748b', fontSize: 13}}>{cab.location || 'No Location'}</Text>
            </View>
            <View style={styles.catActions}>
              <TouchableOpacity onPress={() => { setEditingCabId(cab.id); setEditingCabName(cab.name); setEditingCabLocation(cab.location || ''); }} style={{marginRight: 10}}>
                <MaterialCommunityIcons name="pencil" size={20} color="#3b82f6" />
              </TouchableOpacity>
              <TouchableOpacity disabled={cab.stock_count > 0} onPress={() => handleDeleteCabinet(cab.id, cab.stock_count > 0)}>
                <MaterialCommunityIcons name="delete" size={20} color={cab.stock_count > 0 ? "#334155" : "#ef4444"} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Strategic Settings</Text>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="close" size={24} color="#f8fafc" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tab, activeTab === 'categories' && styles.tabActive]} onPress={() => setActiveTab('categories')}>
          <Text style={[styles.tabText, activeTab === 'categories' && styles.tabTextActive]}>CATEGORIES</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'cabinets' && styles.tabActive]} onPress={() => setActiveTab('cabinets')}>
          <Text style={[styles.tabText, activeTab === 'cabinets' && styles.tabTextActive]}>CABINETS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'system' && styles.tabActive]} onPress={() => setActiveTab('system')}>
          <Text style={[styles.tabText, activeTab === 'system' && styles.tabTextActive]}>SYSTEM</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'backups' && styles.tabActive]} onPress={() => setActiveTab('backups')}>
          <Text style={[styles.tabText, activeTab === 'backups' && styles.tabTextActive]}>BACKUPS</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'categories' && (
        <FlatList
          data={categories}
          keyExtractor={i => i.id.toString()}
          renderItem={renderCategory}
          ListHeaderComponent={(
            <View style={styles.newCatBlock}>
              <Text style={styles.label}>New Category</Text>
              <View style={styles.newRow}>
                <TextInput 
                  style={styles.inputMedium} 
                  value={newCatName} 
                  onChangeText={setNewCatName} 
                  placeholder="Category Name"
                  placeholderTextColor="#64748b"
                  testID="new-cat-input"
                />
                <TouchableOpacity onPress={handleAddCategory} style={styles.addSaveBtnLarge} testID="create-cat-btn">
                  <Text style={styles.addSaveTextLarge}>CREATE</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {activeTab === 'cabinets' && (
        <FlatList
          data={cabinets}
          keyExtractor={i => i.id.toString()}
          renderItem={renderCabinet}
          ListHeaderComponent={(
            <View style={styles.newCatBlock}>
              <Text style={styles.label}>New Cabinet / Location</Text>
              <TextInput style={styles.inputMedium} value={newCabName} onChangeText={setNewCabName} placeholder="Cabinet Name (e.g. Deep Storage 1)" placeholderTextColor="#64748b" testID="new-cab-name-input" />
              <View style={{height: 10}} />
              <TextInput style={styles.inputMedium} value={newCabLocation} onChangeText={setNewCabLocation} placeholder="Physical Location (e.g. Cellar)" placeholderTextColor="#64748b" testID="new-cab-loc-input" />
              <TouchableOpacity onPress={handleAddCabinet} style={styles.addSaveBtnFull} testID="create-cab-btn">
                <Text style={styles.addSaveText}>CREATE CABINET</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {activeTab === 'system' && (
        <View style={{padding: 10}}>
          <View style={styles.prefRow}>
            <View style={{flex: 1}}>
              <Text style={styles.prefTitle}>Monthly Tactical Briefing</Text>
              <Text style={styles.prefSub}>Receive a notification on the 1st of every month with expiry counts.</Text>
            </View>
            <Switch 
                value={alertsEnabled} 
                onValueChange={toggleAlerts}
                trackColor={{ false: "#334155", true: "#22c55e" }}
                thumbColor={alertsEnabled ? "#f8fafc" : "#94a3b8"}
            />
          </View>

          <View style={{marginTop: 20}}>
            <Text style={styles.label}>Logistics Recipient</Text>
            <View style={styles.newRow}>
                <TextInput 
                    style={styles.inputMedium} 
                    value={logisticsEmail} 
                    onChangeText={async (val) => {
                        setLogisticsEmail(val);
                        await db.runAsync('INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)', 'logistics_email', val);
                        await markModified(db);
                    }} 
                    placeholder="email@example.com"
                    placeholderTextColor="#64748b"
                    keyboardType="email-address"
                    autoCapitalize="none"
                />
            </View>
            <Text style={[styles.prefSub, {marginTop: 8}]}>Pre-fills the recipient field when sharing Strategic Resupply briefings.</Text>
          </View>

          <View style={{marginTop: 40}}>
            <TouchableOpacity 
                style={styles.testBtn} 
                onPress={async () => {
                    const { testStockAlert } = await import('../services/notifications');
                    await testStockAlert(db);
                    Alert.alert('System Armed', 'A test alert has been dispatched. If you do not see it, please check notification permissions.');
                }}
            >
              <MaterialCommunityIcons name="bell-ring" size={24} color="white" />
              <Text style={styles.testBtnText}>TEST STOCK ALERT</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {activeTab === 'backups' && (
        <View style={{padding: 10, flex: 1}}>
          <View style={styles.prefRow}>
            <View style={{flex: 1}}>
              <Text style={styles.prefTitle}>Rolling Hourly Archive</Text>
              <Text style={styles.prefSub}>Automatically capture a snapshot every hour if changes occur (Keeps last 5).</Text>
            </View>
            <Switch 
                value={autoBackupEnabled} 
                onValueChange={toggleAutoBackup}
                trackColor={{ false: "#334155", true: "#22c55e" }}
                thumbColor={autoBackupEnabled ? "#f8fafc" : "#94a3b8"}
            />
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#3b82f6'}]} onPress={handleManualBackup}>
              <MaterialCommunityIcons name="backup-restore" size={20} color="white" />
              <Text style={styles.actionBtnText}>SNAPSHOT NOW</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#ef4444'}]} onPress={handleRestore}>
              <MaterialCommunityIcons name="file-import" size={20} color="white" />
              <Text style={styles.actionBtnText}>IMPORT BACKUP</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Local Snapshot Archive (Rolling 5)</Text>
          <FlatList
            data={backups}
            keyExtractor={item => item.name}
            renderItem={({ item }) => (
              <View style={styles.backupItem}>
                <View style={{flex: 1}}>
                  <Text style={styles.backupName}>
                    {new Date(item.timestamp).toLocaleDateString()}
                  </Text>
                  <Text style={styles.backupMeta}>
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </Text>
                </View>
                <View style={{flexDirection: 'row', gap: 8}}>
                    <TouchableOpacity onPress={() => handleLocalRestore(item)} style={[styles.shareBtn, {backgroundColor: '#ef4444'}]}>
                        <MaterialCommunityIcons name="backup-restore" size={20} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => BackupService.shareBackup(item.uri)} style={styles.shareBtn}>
                        <MaterialCommunityIcons name="share-variant" size={20} color="#3b82f6" />
                    </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={<Text style={{color: '#64748b', textAlign: 'center', marginTop: 20}}>No backups recorded yet.</Text>}
            ListFooterComponent={Platform.OS === 'android' ? (
                <View style={{marginTop: 24, paddingBottom: 40}}>
                    <Text style={styles.prefTitle}>Strategic Shadow Mirroring</Text>
                    <Text style={styles.prefSub}>
                        On Android, auto-backups are wiped if the app is uninstalled. 
                        Enable mirroring to a public folder (e.g. Downloads) for disaster recovery.
                    </Text>
                    <TouchableOpacity 
                        style={[styles.testBtn, {marginTop: 12, backgroundColor: mirrorUri ? '#22c55e' : '#334155'}]} 
                        onPress={handlePersistentMirrorSetup}
                    >
                        <MaterialCommunityIcons name="folder-sync" size={24} color="white" />
                        <Text style={styles.testBtnText}>{mirrorUri ? 'MIRROR ACTIVE' : 'SETUP MIRROR FOLDER'}</Text>
                    </TouchableOpacity>
                    {mirrorUri && <Text style={[styles.backupMeta, {marginTop: 8, fontSize: 10}]}>Active: {mirrorUri}</Text>}
                </View>
            ) : null}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 40 },
  title: { fontSize: 26, color: '#f8fafc', fontWeight: 'bold' },
  tabRow: { flexDirection: 'row', marginBottom: 20, backgroundColor: '#1e293b', borderRadius: 8, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  tabActive: { backgroundColor: '#3b82f6' },
  tabText: { color: '#64748b', fontWeight: 'bold', fontSize: 13 },
  tabTextActive: { color: 'white' },
  cancelBtn: { padding: 8, backgroundColor: '#334155', borderRadius: 20 },
  prefRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', padding: 20, borderRadius: 12, marginBottom: 12 },
  prefTitle: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold' },
  prefSub: { color: '#94a3b8', fontSize: 13, marginTop: 4 },
  testBtn: { backgroundColor: '#3b82f6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 12, gap: 10 },
  testBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  label: { color: '#94a3b8', fontSize: 16, marginBottom: 8, marginTop: 10 },
  newCatBlock: { marginBottom: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  newRow: { flexDirection: 'row', alignItems: 'center' },
  inputMedium: { flex: 1, backgroundColor: '#1e293b', color: '#f8fafc', borderRadius: 8, padding: 12, fontSize: 16, borderWidth: 1, borderColor: '#334155', marginRight: 10 },
  addSaveBtnLarge: { backgroundColor: '#3b82f6', padding: 14, borderRadius: 8 },
  addSaveTextLarge: { color: 'white', fontWeight: 'bold' },
  inputSmall: { flex: 1, backgroundColor: '#0f172a', color: '#f8fafc', borderRadius: 6, padding: 8, fontSize: 14, borderWidth: 1, borderColor: '#334155', marginRight: 10 },
  addSaveBtn: { backgroundColor: '#22c55e', padding: 10, borderRadius: 6 },
  addSaveText: { color: 'white', fontWeight: '600', fontSize: 12 },
  catCard: { backgroundColor: '#1e293b', padding: 16, borderRadius: 8, marginBottom: 12 },
  catTitle: { color: '#e2e8f0', fontSize: 18, fontWeight: 'bold', flex: 1 },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  catActions: { flexDirection: 'row' },
  saveActionBtn: { backgroundColor: '#22c55e', padding: 8, borderRadius: 6, marginLeft: 8 },
  typeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#334155' },
  typeText: { color: '#cbd5e1', fontSize: 15, flex: 1 },
  addNewBtn: { marginTop: 12 },
  addNewText: { color: '#3b82f6', fontWeight: '600' },
  newTypeContainer: { marginTop: 12, backgroundColor: '#0f172a', padding: 10, borderRadius: 8 },
  addSaveBtnFull: { backgroundColor: '#22c55e', padding: 12, borderRadius: 6, alignItems: 'center', marginTop: 10 },
  unitChipRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  unitChipRowMini: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  unitChip: { flex: 1, paddingVertical: 6, marginHorizontal: 2, alignItems: 'center', borderRadius: 6, backgroundColor: '#1e293b' },
  unitChipActive: { backgroundColor: '#3b82f6' },
  unitChipText: { color: '#64748b', fontSize: 12, fontWeight: 'bold' },
  unitChipTextActive: { color: 'white' },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 24, marginTop: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 10, gap: 8 },
  actionBtnText: { color: 'white', fontWeight: 'bold', fontSize: 13 },
  backupItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', padding: 16, borderRadius: 10, marginBottom: 8 },
  backupName: { color: '#f8fafc', fontSize: 14, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontWeight: 'bold' },
  backupMeta: { color: '#64748b', fontSize: 11, marginTop: 2 },
  shareBtn: { backgroundColor: '#334155', padding: 10, borderRadius: 8 }
});
