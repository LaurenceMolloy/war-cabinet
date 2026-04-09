import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { markModified } from '../db/sqlite';

export default function AddInventoryScreen() {
  const { typeId, editBatchId, inheritedCabinetId, categoryId } = useLocalSearchParams();
  const router = useRouter();
  const db = useSQLiteContext();

  const [quantity, setQuantity] = useState('1');
  const [size, setSize] = useState('');
  const [typeName, setTypeName] = useState('');
  
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  
  const [expiryMonth, setExpiryMonth] = useState(currentMonth.toString());
  const [expiryYear, setExpiryYear] = useState(currentYear.toString());
  const [customChips, setCustomChips] = useState<string[]>([]);
  const [unitType, setUnitType] = useState('weight');
  
  const getUnitSuffix = (type: string) => {
    if (type === 'weight') return 'g';
    if (type === 'volume') return 'ml';
    if (type === 'count') return 'Units';
    return '';
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
  const selectedCabinet = cabinets.find(c => c.id === selectedCabinetId);
  const isFreezerMode = selectedCabinet?.cabinet_type === 'freezer';

  useEffect(() => {
    async function loadData() {
      const typeRes = await db.getFirstAsync<{name: string, unit_type: string, default_size: string, default_cabinet_id: number | null, freeze_months: number | null}>('SELECT name, unit_type, default_size, default_cabinet_id, freeze_months FROM ItemTypes WHERE id = ?', Number(typeId));
      if (typeRes) {
        setUnitType(typeRes.unit_type || 'weight');
        setTypeName(typeRes.name);
        if (typeRes.default_cabinet_id) setSelectedCabinetId(typeRes.default_cabinet_id);
        if (typeRes.freeze_months) setFreezeLimit(typeRes.freeze_months.toString());
      }

      const cabRows = await db.getAllAsync<any>('SELECT * FROM Cabinets');
      setCabinets(cabRows);
      
      // Determine Default Cabinet Selection
      if (editBatchId) {
        // Edit mode cabinet is handled later by batch load
      } else if (inheritedCabinetId) {
        setSelectedCabinetId(Number(inheritedCabinetId));
      } else if (typeRes?.default_cabinet_id) {
        setSelectedCabinetId(typeRes.default_cabinet_id);
      } else if (cabRows.length > 0) {
        setSelectedCabinetId(cabRows[0].id);
      }

      const res = await db.getAllAsync<{size: string}>(
        'SELECT size FROM Inventory WHERE item_type_id = ? GROUP BY size ORDER BY MAX(id) DESC LIMIT 3',
        Number(typeId)
      );
      if (res && res.length > 0) {
        setCustomChips(res.map(r => r.size));
      }

      if (editBatchId) {
        const batch = await db.getFirstAsync<any>(
          'SELECT * FROM Inventory WHERE id = ?',
          Number(editBatchId)
        );
        if (batch) {
          setQuantity(batch.quantity.toString());
          setSize(batch.size?.toString().replace(/[^0-9]/g, '') || '');
          setExpiryMonth(batch.expiry_month?.toString() || '');
          setExpiryYear(batch.expiry_year?.toString() || '');
          if (batch.cabinet_id) setSelectedCabinetId(batch.cabinet_id);
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
      }
    }
    loadData();
  }, [typeId, editBatchId]);

  const handleSave = async () => {
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

    if ((unitType === 'weight' || unitType === 'volume')) {
      if (!/^\d+(\.\d+)?$/.test(s)) {
        setErrorField('size');
        setErrorMsg(`Format error: "${unitType}" only accepts numbers`);
        return;
      }
    }

    const q = parseInt(quantity);
    if (isNaN(q) || q <= 0) {
      setErrorField('quantity');
      setErrorMsg('Quantity must be a positive number');
      return;
    }

    const freezeM = parseInt(freezeMonth);
    const freezeY = parseInt(freezeYear);
    const entryM = (isFreezerMode && !isNaN(freezeM)) ? freezeM : currentMonth;
    const entryY = (isFreezerMode && !isNaN(freezeY)) ? freezeY : currentYear;

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

    // For freezer batches: skip merge — each freeze date is a distinct batch
    if (isFreezerMode) {
      if (editBatchId) {
        await db.runAsync(
          'UPDATE Inventory SET quantity = ?, size = ?, expiry_month = NULL, expiry_year = NULL, entry_month = ?, entry_year = ?, cabinet_id = ? WHERE id = ?',
          q, finalSize, entryM, entryY, selectedCabinetId, Number(editBatchId)
        );
      } else {
        await db.runAsync(
          `INSERT INTO Inventory (item_type_id, quantity, size, expiry_month, expiry_year, entry_month, entry_year, cabinet_id) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?)`,
          Number(typeId), q, finalSize, entryM, entryY, selectedCabinetId
        );
      }
      
      // Persist the freeze limit up to the ItemType
      await db.runAsync('UPDATE ItemTypes SET freeze_months = ? WHERE id = ?', fLimit, Number(typeId));
      
      await markModified(db);
      const currentFilter = inheritedCabinetId ? Number(inheritedCabinetId) : null;
      router.replace({ pathname: '/', params: { targetCatId: categoryId ? Number(categoryId) : undefined, targetTypeId: typeId ? Number(typeId) : undefined, timestamp: Date.now().toString() } });
      return;
    }

    // Standard cabinet: existing merge logic
    const exM = parseInt(expiryMonth);
    const exY = parseInt(expiryYear);
    const validExpiry = !isNaN(exM) && !isNaN(exY) && exM > 0 && exM <= 12 && exY > 2020;
    const expMVal = validExpiry ? exM : null;
    const expYVal = validExpiry ? exY : null;

    // Check for existing identical batch at destination
    const existingSearchQuery = `
      SELECT id FROM Inventory 
      WHERE item_type_id = ? AND size = ? AND cabinet_id = ?
        AND (expiry_month IS NULL OR expiry_month = ?)
        AND (expiry_year IS NULL OR expiry_year = ?)
        AND id != ?
    `;
    const existing = await db.getFirstAsync<{id: number}>(
      existingSearchQuery, 
      Number(typeId), finalSize, selectedCabinetId, expMVal, expYVal, editBatchId ? Number(editBatchId) : -1
    );

    if (existing) {
      // Merge into existing batch
      await db.runAsync(
        'UPDATE Inventory SET quantity = quantity + ?, entry_month = ?, entry_year = ? WHERE id = ?',
        q, currentMonth, currentYear, existing.id
      );
      if (editBatchId) {
        // Cleaning up the old entry after move/merge
        await db.runAsync('DELETE FROM Inventory WHERE id = ?', Number(editBatchId));
      }
    } else if (editBatchId) {
      // No match at destination, so just move/update this batch
      await db.runAsync(
        'UPDATE Inventory SET quantity = ?, size = ?, expiry_month = ?, expiry_year = ?, entry_month = ?, entry_year = ?, cabinet_id = ? WHERE id = ?',
        q, finalSize, expMVal, expYVal, entryM, entryY, selectedCabinetId, Number(editBatchId)
      );
    } else {
      // Brand new batch, no existing match to merge into
      await db.runAsync(
        `INSERT INTO Inventory (item_type_id, quantity, size, expiry_month, expiry_year, entry_month, entry_year, cabinet_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        Number(typeId), q, finalSize, expMVal, expYVal, entryM, entryY, selectedCabinetId
      );
    }

    await markModified(db);

    // Strategic Navigation: Follow the action, isolate the category, and scroll into view
    const currentFilter = inheritedCabinetId ? Number(inheritedCabinetId) : null;
    const targetCatId = categoryId ? Number(categoryId) : null;
    const targetTypeIdNum = typeId ? Number(typeId) : null;
    
    const navParams = { 
      setCabinetId: (currentFilter !== null && selectedCabinetId !== currentFilter) ? (selectedCabinetId ?? undefined) : undefined,
      setCabinetName: (currentFilter !== null && selectedCabinetId !== currentFilter) ? cabinets.find(c => c.id === selectedCabinetId)?.name : undefined,
      targetCatId: targetCatId ?? undefined,
      targetTypeId: targetTypeIdNum ?? undefined,
      timestamp: Date.now().toString()
    };

    if (!editBatchId) {
        router.replace({ pathname: '/', params: navParams });
    } else {
        // Even for edits/moves, we use replace to ensure the params are processed by the Dashboard if the cabinet changed
        if (currentFilter !== null && selectedCabinetId !== currentFilter) {
          router.replace({ pathname: '/', params: navParams });
        } else {
          router.back();
        }
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

  const allChips = Array.from(new Set([...customChips, ...genericChips]));

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>{editBatchId ? 'Refresh Stock' : 'Add Stock'}</Text>
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
        <TouchableOpacity 
          style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} 
          onPress={() => setShowCabinetPicker(true)}
          testID="cabinet-selector"
        >
          <View>
            <Text style={{ color: '#f8fafc', fontSize: 16 }}>
              {cabinets.find(c => c.id === selectedCabinetId)?.name || 'Select Cabinet'}
            </Text>
            <Text style={{ color: '#64748b', fontSize: 12 }}>
              {cabinets.find(c => c.id === selectedCabinetId)?.location || 'No Location'}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-down" size={24} color="#64748b" />
        </TouchableOpacity>
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
          </View>
        </View>
      </Modal>

      <TouchableOpacity style={styles.saveButton} onPress={handleSave} testID="save-stock-btn">
        <Text style={styles.saveText}>{editBatchId ? 'UPDATE STOCK' : 'SAVE TO STOCK'}</Text>
      </TouchableOpacity>
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
  modalCloseText: { color: '#ef4444', fontWeight: 'bold', fontSize: 16 }
});
