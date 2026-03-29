import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';

export default function AddInventoryScreen() {
  const { typeId, editBatchId } = useLocalSearchParams();
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

  useEffect(() => {
    async function loadData() {
      // 1. Load Type Info
      const typeRes = await db.getFirstAsync<{name: string, unit_type: string, default_size: string}>('SELECT name, unit_type, default_size FROM ItemTypes WHERE id = ?', Number(typeId));
      if (typeRes) {
        setUnitType(typeRes.unit_type || 'weight');
        setTypeName(typeRes.name);
      }

      // 2. Load Chips
      const res = await db.getAllAsync<{size: string}>(
        'SELECT size FROM Inventory WHERE item_type_id = ? GROUP BY size ORDER BY MAX(id) DESC LIMIT 3',
        Number(typeId)
      );
      if (res && res.length > 0) {
        setCustomChips(res.map(r => r.size));
      }

      // 3. Handle Edit Mode vs Add Mode
      if (editBatchId) {
        const batch = await db.getFirstAsync<any>(
          'SELECT * FROM Inventory WHERE id = ?',
          Number(editBatchId)
        );
        if (batch) {
          setQuantity(batch.quantity.toString());
          // Strip unit suffix for editing
          const rawSize = batch.size || '';
          const suffix = getUnitSuffix(typeRes?.unit_type || 'weight');
          if (suffix && rawSize.endsWith(suffix)) {
            setSize(rawSize.slice(0, -suffix.length).trim());
          } else {
            setSize(rawSize);
          }
          setExpiryMonth(batch.expiry_month?.toString() || '');
          setExpiryYear(batch.expiry_year?.toString() || '');
        }
      } else {
        // Default values for new items
        if (typeRes && typeRes.default_size) {
          const suffix = getUnitSuffix(typeRes.unit_type || 'weight');
          if (suffix && typeRes.default_size.endsWith(suffix)) {
            setSize(typeRes.default_size.slice(0, -suffix.length).trim());
          } else {
            setSize(typeRes.default_size);
          }
        } else if (res && res.length > 0) {
          setSize(res[0].size);
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

    // Append unit before saving
    let finalSize = s;
    const suffix = getUnitSuffix(unitType);
    if (suffix && !s.toLowerCase().endsWith(suffix.toLowerCase())) {
        finalSize = s + suffix;
    }

    // Intelligent check: weight/volume must be numeric-only now
    if ((unitType === 'weight' || unitType === 'volume')) {
      if (!/^\d+(\.\d+)?$/.test(s)) {
        setErrorField('size');
        setErrorMsg(`Format error: "${unitType}" only accepts numbers (the ${suffix} is added automatically)`);
        return;
      }
    }

    const q = parseInt(quantity);
    if (isNaN(q) || q <= 0) {
      setErrorField('quantity');
      setErrorMsg('Quantity must be a positive number');
      return;
    }

    const exM = parseInt(expiryMonth);
    const exY = parseInt(expiryYear);
    
    const validExpiry = !isNaN(exM) && !isNaN(exY) && exM > 0 && exM <= 12 && exY > 2020;

    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const expMVal = validExpiry ? exM : null;
    const expYVal = validExpiry ? exY : null;

    if (editBatchId) {
      // Logic for Refresh / Edit
      // Check if we are merging into another existing batch
      let existing;
      if (validExpiry) {
        existing = await db.getFirstAsync<{id: number}>(
          'SELECT id FROM Inventory WHERE item_type_id = ? AND size = ? AND expiry_month = ? AND expiry_year = ? AND id != ?',
          Number(typeId), size, expMVal, expYVal, Number(editBatchId)
        );
      } else {
        existing = await db.getFirstAsync<{id: number}>(
          'SELECT id FROM Inventory WHERE item_type_id = ? AND size = ? AND expiry_month IS NULL AND expiry_year IS NULL AND id != ?',
          Number(typeId), size, Number(editBatchId)
        );
      }

      if (existing) {
        // Merge: Update the other batch and delete current one
        await db.runAsync(
          'UPDATE Inventory SET quantity = quantity + ?, entry_month = ?, entry_year = ? WHERE id = ?',
          q, currentMonth, currentYear, existing.id
        );
        await db.runAsync('DELETE FROM Inventory WHERE id = ?', Number(editBatchId));
      } else {
        // Just update current batch
        await db.runAsync(
          'UPDATE Inventory SET quantity = ?, size = ?, expiry_month = ?, expiry_year = ?, entry_month = ?, entry_year = ? WHERE id = ?',
          q, finalSize, expMVal, expYVal, currentMonth, currentYear, Number(editBatchId)
        );
      }
    } else {
      // Logic for Add New
      let existing;
      if (validExpiry) {
        existing = await db.getFirstAsync<{id: number}>(
          'SELECT id FROM Inventory WHERE item_type_id = ? AND size = ? AND expiry_month = ? AND expiry_year = ?',
          Number(typeId), finalSize, expMVal, expYVal
        );
      } else {
        existing = await db.getFirstAsync<{id: number}>(
          'SELECT id FROM Inventory WHERE item_type_id = ? AND size = ? AND expiry_month IS NULL AND expiry_year IS NULL',
          Number(typeId), finalSize
        );
      }

      if (existing) {
        await db.runAsync(
          'UPDATE Inventory SET quantity = quantity + ?, entry_month = ?, entry_year = ? WHERE id = ?',
          q, currentMonth, currentYear, existing.id
        );
      } else {
        await db.runAsync(
          `INSERT INTO Inventory (item_type_id, quantity, size, expiry_month, expiry_year, entry_month, entry_year) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          Number(typeId), q, finalSize, 
          expMVal, expYVal, 
          currentMonth, currentYear
        );
      }
    }

    router.back();
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

  const allChips = Array.from(new Set([
    ...customChips,
    ...genericChips
  ]));

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>{editBatchId ? 'Refresh Stock' : 'Add Stock'}</Text>
          <Text style={styles.subTitle}>{typeName}</Text>
        </View>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
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
          />
          {(unitType === 'weight' || unitType === 'volume') && (
            <Text style={styles.unitLabel}>{getUnitSuffix(unitType)}</Text>
          )}
        </View>
        {errorField === 'size' && <Text style={styles.errorText}>{errorMsg}</Text>}
      </View>

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

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
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
  clearDateText: { color: '#ef4444', fontSize: 11, fontWeight: 'bold', marginLeft: 6, letterSpacing: 0.5 }
});
