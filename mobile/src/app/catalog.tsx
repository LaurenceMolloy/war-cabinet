import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';

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

  const load = async () => {
    const rows = await db.getAllAsync(`
      SELECT c.id as cat_id, c.name as cat_name, i.id as type_id, i.name as type_name, i.unit_type as type_unit, i.default_size as type_default_size,
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
            default_size: row.type_default_size || '',
            stock_count: row.type_stock_count || 0
        });
      }
      return acc;
    }, []);

    setCategories(grouped);
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

    await db.runAsync('INSERT INTO ItemTypes (category_id, name, unit_type, default_size) VALUES (?, ?, ?, ?)', catId, newItemName, newItemUnit, finalDefaultSize);
    setNewItemName('');
    setNewItemDefaultSize('');
    setSelectedCat(null);
    setNewItemUnit('weight');
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

    await db.runAsync('UPDATE ItemTypes SET name = ?, unit_type = ?, default_size = ? WHERE id = ?', editingTypeName, editingTypeUnit, finalDefaultSize, typeId);
    setEditingTypeId(null);
    load();
  };

  const handleDeleteCategory = async (catId: number, hasTypes: boolean) => {
    if (hasTypes) {
      Alert.alert('Cannot Delete', 'This category has item types. Please delete them first.');
      return;
    }
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
              <View style={{flex: 1}}>
                <Text style={styles.typeText}>{type.name}</Text>
                <Text style={{fontSize: 11, color: '#64748b', textTransform: 'capitalize'}}>{type.unit_type} unit {type.default_size ? `• Default: ${type.default_size}` : ''}</Text>
              </View>
              <View style={styles.catActions}>
                <TouchableOpacity onPress={() => { setEditingTypeId(type.id); setEditingTypeName(type.name); setEditingTypeUnit(type.unit_type || 'weight'); setEditingTypeDefaultSize(type.default_size || ''); }} style={{marginRight: 10, marginTop: 4}}>
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
          <TouchableOpacity onPress={() => handleAddItemType(cat.id)} style={styles.addSaveBtnFull}>
            <Text style={styles.addSaveText}>ADD ITEM TYPE</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.addNewBtn} onPress={() => setSelectedCat(cat.id)}>
          <Text style={styles.addNewText}>+ Add Item Type</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Catalog settings</Text>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="close" size={24} color="#f8fafc" />
        </TouchableOpacity>
      </View>

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
              />
              <TouchableOpacity onPress={handleAddCategory} style={styles.addSaveBtnLarge}>
                <Text style={styles.addSaveTextLarge}>CREATE</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 40 },
  title: { fontSize: 26, color: '#f8fafc', fontWeight: 'bold' },
  cancelBtn: { padding: 8, backgroundColor: '#334155', borderRadius: 20 },
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
  unitChipTextActive: { color: 'white' }
});
