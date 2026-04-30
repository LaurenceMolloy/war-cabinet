import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSQLiteContext } from 'expo-sqlite';
import { Database } from '../database';

interface QuickThresholdModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
  itemTypeId: number;
  itemName: string;
  initialMin: number | null;
  initialMax: number | null;
  initialDefaultSize?: string | null;
  unitType?: string;
}

export const QuickThresholdModal = ({
  visible,
  onClose,
  onSave,
  itemTypeId,
  itemName,
  initialMin,
  initialMax,
  initialDefaultSize,
  unitType
}: QuickThresholdModalProps) => {
  const db = useSQLiteContext();
  const [min, setMin] = useState(initialMin?.toString() || '');
  const [max, setMax] = useState(initialMax?.toString() || '');
  const [defaultSize, setDefaultSize] = useState(initialDefaultSize || '');

  const getUnitLabel = () => {
    switch (unitType) {
      case 'volume': return '(ml)';
      case 'weight': return '(grams)';
      case 'length': return '(cm)';
      case 'count': return '(count)';
      default: return '(count)';
    }
  };

  useEffect(() => {
    if (visible) {
      setMin(initialMin?.toString() || '');
      setMax(initialMax?.toString() || '');
      setDefaultSize(initialDefaultSize || '');
    }
  }, [visible, initialMin, initialMax, initialDefaultSize]);

  const handleSave = async () => {
    const minVal = min ? parseInt(min, 10) : null;
    const maxVal = max ? parseInt(max, 10) : null;
    const sizeVal = defaultSize.trim() === '' ? null : defaultSize.trim();
    
    await Database.ItemTypes.updateThresholds(db, itemTypeId, minVal, maxVal, sizeVal);
    onSave();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>TARGETS: {itemName}</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>Define the tactical requirements for this asset. Targets are counted in units based on the default package size.</Text>

          <View style={{ marginBottom: 20 }}>
            <Text style={styles.label}>DEFAULT PACKAGE SIZE <Text style={styles.unitText}>(e.g. 500, 1)</Text></Text>
            <TextInput
              style={styles.input}
              value={defaultSize}
              onChangeText={setDefaultSize}
              placeholder="e.g. 500"
              placeholderTextColor="#475569"
            />
          </View>

          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>MINIMUM <Text style={styles.unitText}>(count)</Text></Text>
              <TextInput
                style={styles.input}
                value={min}
                onChangeText={setMin}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#475569"
                selectTextOnFocus
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>MAXIMUM <Text style={styles.unitText}>(count)</Text></Text>
              <TextInput
                style={styles.input}
                value={max}
                onChangeText={setMax}
                keyboardType="numeric"
                placeholder="Optional"
                placeholderTextColor="#475569"
                selectTextOnFocus
              />
            </View>
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>SAVE TARGETS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '90%', backgroundColor: '#0f172a', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#1e293b' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold' },
  subtitle: { color: '#94a3b8', fontSize: 13, marginBottom: 20 },
  inputRow: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  inputGroup: { flex: 1 },
  label: { color: '#cbd5e1', fontSize: 11, fontWeight: 'bold', marginBottom: 8, letterSpacing: 1 },
  unitText: { color: '#64748b', fontWeight: 'normal', fontSize: 9 },
  input: { backgroundColor: '#1e293b', color: '#f8fafc', padding: 16, borderRadius: 12, fontSize: 18, textAlign: 'center', borderWidth: 1, borderColor: '#334155' },
  btnRow: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center', backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  cancelBtnText: { color: '#cbd5e1', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },
  saveBtn: { flex: 2, backgroundColor: '#3b82f6', padding: 16, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 }
});
