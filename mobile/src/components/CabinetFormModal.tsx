import React, { useState, useEffect, useRef } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform, FlatList } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useBilling } from '../context/BillingContext';
import { useSQLiteContext } from 'expo-sqlite';
import { Database } from '../database';

interface CabinetFormModalProps {
  visible: boolean;
  initialData?: any; // null for 'New', cabinet object for 'Edit'
  allCabinets: any[];
  onSuccess: (id?: number) => void;
  onCancel: () => void;
}

export const CabinetFormModal: React.FC<CabinetFormModalProps> = ({
  visible,
  initialData,
  allCabinets,
  onSuccess,
  onCancel,
}) => {
  const { checkEntitlement } = useBilling();
  const db = useSQLiteContext();

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState<'standard' | 'freezer'>('standard');
  const [rotationInterval, setRotationInterval] = useState(0);
  const [rotationDestId, setRotationDestId] = useState<number | null>(null);
  const [auditInterval, setAuditInterval] = useState(3);
  const [auditDay, setAuditDay] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const dialRef = useRef<FlatList>(null);
  const [dialWidth, setDialWidth] = useState(0);

  // Sync state when initialData changes or modal opens
  useEffect(() => {
    if (visible) {
      setName(initialData?.name || '');
      setLocation(initialData?.location || '');
      setType(initialData?.cabinet_type || 'standard');
      setRotationInterval(initialData?.rotation_interval_months || 0);
      setRotationDestId(initialData?.default_rotation_cabinet_id || null);
      setAuditInterval(initialData?.audit_interval_months !== undefined ? initialData.audit_interval_months : 3);
      setAuditDay(initialData?.audit_day_of_month || 1);
      setError(null);

      // Trigger dial sync
      setTimeout(() => {
        if (dialRef.current) {
          const day = initialData?.audit_day_of_month || 1;
          dialRef.current.scrollToIndex({ index: 28 + (day - 1), animated: false });
        }
      }, 100);
    }
  }, [visible, initialData]);

  // Auto-clear rotation destination if type changes to an incompatible one
  useEffect(() => {
    if (rotationDestId) {
      const dest = allCabinets.find(c => c.id === rotationDestId);
      if (dest && dest.cabinet_type !== type) {
        setRotationDestId(null);
      }
    }
  }, [type, rotationDestId, allCabinets]);

  const handleCommit = async () => {
    if (!name.trim()) {
      setError('Cabinet name is required');
      return;
    }
    
    setIsSaving(true);
    try {
      const params = {
        name: name.trim(),
        location: location.trim(),
        cabinet_type: type,
        rotation_interval_months: rotationInterval,
        audit_interval_months: auditInterval,
        audit_day_of_month: auditDay,
        default_rotation_cabinet_id: rotationDestId,
      };

      if (initialData) {
        await Database.Cabinets.update(db, initialData.id, params);
        onSuccess(initialData.id);
      } else {
        const newId = await Database.Cabinets.create(db, params);
        onSuccess(newId);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to save cabinet');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <MaterialCommunityIcons name="warehouse" size={24} color="#3b82f6" />
            <Text style={styles.title}>{initialData ? 'EDIT CABINET' : 'DEPLOY NEW CABINET'}</Text>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* CABINET NAME */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>CABINET NAME</Text>
              <TextInput
                style={[styles.input, error && !name && styles.inputError]}
                value={name}
                onChangeText={(v) => { setName(v); setError(null); }}
                placeholder="e.g. Main Pantry, Garage Freezer"
                placeholderTextColor="#64748b"
                autoFocus={!initialData}
              />
              {error && !name && <Text style={styles.errorText}>{error}</Text>}
            </View>

            {/* PHYSICAL LOCATION */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>PHYSICAL LOCATION</Text>
              <TextInput
                style={styles.input}
                value={location}
                onChangeText={setLocation}
                placeholder="e.g. Kitchen, Utility Room"
                placeholderTextColor="#64748b"
              />
            </View>

            {/* CABINET TYPE */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>CABINET TYPE</Text>
              <View style={styles.typeRow}>
                <TouchableOpacity 
                  style={[styles.typeBtn, type === 'standard' && styles.typeBtnActive]} 
                  onPress={() => setType('standard')}
                >
                  <Text style={[styles.typeBtnText, type === 'standard' && styles.typeBtnTextActive]}>Standard</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.typeBtn, type === 'freezer' && styles.typeBtnActiveFreezer]} 
                  onPress={() => { 
                    if (checkEntitlement('FREEZER')) setType('freezer'); 
                  }}
                >
                  <MaterialCommunityIcons name="snowflake" size={14} color={type === 'freezer' ? '#60a5fa' : '#64748b'} />
                  <Text style={[styles.typeBtnText, type === 'freezer' && styles.typeBtnTextActiveFreezer]}>Freezer</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* AUDIT FREQUENCY */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>AUDIT FREQUENCY (MONTHS)</Text>
              <View style={styles.cycleRow}>
                {[0, 1, 3, 6, 12].map(m => (
                  <TouchableOpacity 
                    key={m} 
                    style={[styles.cycleChip, auditInterval === m && styles.cycleChipActive, { width: '19%' }]} 
                    onPress={() => setAuditInterval(m)}
                  >
                    <Text style={[styles.cycleChipText, auditInterval === m && styles.cycleChipTextActive]}>
                      {m === 0 ? 'NONE' : m === 1 ? '1' : m === 3 ? '3' : m === 6 ? '6' : '12'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* AUDIT DAY OF MONTH */}
            {auditInterval > 0 && (
              <View style={styles.formGroup}>
                <Text style={styles.label}>MANEUVER DAY (STAGGERED ROTATION)</Text>
                <View 
                  style={styles.dialWrapper}
                  onLayout={(e) => setDialWidth(e.nativeEvent.layout.width)}
                >
                  <View style={styles.dialLens} />
                  <FlatList
                    ref={dialRef}
                    horizontal
                    data={[...Array.from({length:28},(_,i)=>i+1), ...Array.from({length:28},(_,i)=>i+1), ...Array.from({length:28},(_,i)=>i+1)]}
                    keyExtractor={(_, i) => i.toString()}
                    showsHorizontalScrollIndicator={false}
                    snapToInterval={50}
                    decelerationRate="fast"
                    contentContainerStyle={{ paddingHorizontal: (dialWidth / 2) - 25 }}
                    getItemLayout={(_, index) => ({ length: 50, offset: 50 * index, index })}
                    initialScrollIndex={28 + (auditDay - 1)} // Start in the middle loop
                    onScroll={(e) => {
                      const x = e.nativeEvent.contentOffset.x;
                      const setWidth = 28 * 50;
                      
                      // TRUE LOOP LOGIC: 
                      // Jump to middle set if we hit the outer boundaries
                      if (x < 100) { // Near the start of Set 0/Padding
                        dialRef.current?.scrollToOffset({ offset: x + setWidth, animated: false });
                      } else if (x > (setWidth * 2)) { // Deep into Set 2
                        dialRef.current?.scrollToOffset({ offset: x - setWidth, animated: false });
                      }

                      const index = Math.round(x / 50);
                      const actualDay = (index % 28) + 1;
                      if (actualDay !== auditDay) setAuditDay(actualDay);
                    }}
                    onScrollToIndexFailed={(info) => {
                      setTimeout(() => {
                        dialRef.current?.scrollToIndex({ index: info.index, animated: false });
                      }, 100);
                    }}
                    renderItem={({ item, index }) => {
                      const isSelected = auditDay === item;
                      return (
                        <View style={[styles.dialItem, { width: 50 }, isSelected && styles.dialItemActive]}>
                          <Text style={[styles.dialItemText, isSelected && styles.dialItemTextActive]}>
                            {item}
                          </Text>
                        </View>
                      );
                    }}
                  />
                </View>
                <Text style={{ fontSize: 9, color: '#64748b', marginTop: 8, fontStyle: 'italic', textAlign: 'center' }}>
                  Rotate to Day {auditDay}. Staggering prevents logistical bottlenecks.
                </Text>
              </View>
            )}

            {/* ROTATION CYCLE */}
            <View style={styles.formGroup}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, { marginBottom: 0 }]}>ROTATION CYCLE (MONTHS)</Text>
                {rotationInterval > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>AUTO-ROTATE ACTIVE</Text>
                  </View>
                )}
              </View>
              <View style={styles.cycleRow}>
                {[0, 1, 3, 6, 12].map(m => (
                  <TouchableOpacity 
                    key={m} 
                    style={[styles.cycleChip, rotationInterval === m && styles.cycleChipActive]} 
                    onPress={() => setRotationInterval(m)}
                  >
                    <Text 
                      style={[styles.cycleChipText, rotationInterval === m && styles.cycleChipTextActive]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {m === 0 ? 'NONE' : m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ROTATION DESTINATION */}
            {rotationInterval > 0 && (
              <View style={styles.formGroup}>
                <Text style={styles.label}>ROTATION DESTINATION</Text>
                <View style={styles.destList}>
                  <TouchableOpacity 
                    style={[styles.destChip, !rotationDestId && styles.destChipActive]} 
                    onPress={() => setRotationDestId(null)}
                  >
                    <Text style={[styles.destChipText, !rotationDestId && styles.destChipTextActive]}>None (Stay)</Text>
                  </TouchableOpacity>
                  {allCabinets.filter(c => c.id !== initialData?.id && c.cabinet_type === type).map(c => (
                    <TouchableOpacity 
                      key={c.id} 
                      style={[styles.destChip, rotationDestId === c.id && styles.destChipActive]} 
                      onPress={() => setRotationDestId(c.id)}
                    >
                      <Text style={[styles.destChipText, rotationDestId === c.id && styles.destChipTextActive]}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {error && name && <Text style={[styles.errorText, { textAlign: 'center', marginTop: 10 }]}>{error}</Text>}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity 
              testID="deploy-cabinet-btn"
              style={styles.saveBtn} 
              onPress={handleCommit}
              disabled={isSaving}
            >
              <Text style={styles.saveBtnText}>{isSaving ? 'COMMITTING...' : (initialData ? 'SAVE CHANGES' : 'DEPLOY CABINET')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: 20,
  },
  content: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    maxHeight: '80%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 12,
  },
  title: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  scroll: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    paddingLeft: 4,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 12,
    color: '#f8fafc',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#334155',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 6,
    paddingLeft: 4,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  typeBtnActive: {
    backgroundColor: '#1e3a8a',
    borderColor: '#3b82f6',
  },
  typeBtnActiveFreezer: {
    backgroundColor: '#0f2744',
    borderColor: '#60a5fa',
  },
  typeBtnText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  typeBtnTextActive: {
    color: '#f8fafc',
  },
  typeBtnTextActiveFreezer: {
    color: '#60a5fa',
  },
  cycleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  cycleChip: {
    width: '19%',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cycleChipActive: {
    backgroundColor: '#1e3a8a',
    borderColor: '#3b82f6',
  },
  cycleChipText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: 'bold',
  },
  cycleChipTextActive: {
    color: '#f8fafc',
  },
  badge: {
    backgroundColor: '#fbbf2433',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#fbbf2466',
  },
  badgeText: {
    color: '#fbbf24',
    fontSize: 8,
    fontWeight: 'bold',
  },
  destList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  destChip: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  destChipActive: {
    backgroundColor: '#1e293b',
    borderColor: '#3b82f6',
  },
  destChipText: {
    color: '#64748b',
    fontSize: 12,
  },
  destChipTextActive: {
    color: '#3b82f6',
    fontWeight: 'bold',
  },
  dialWrapper: {
    height: 60,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  dialLens: {
    position: 'absolute',
    left: '50%',
    top: 5,
    bottom: 5,
    width: 54,
    marginLeft: -27,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 27,
    borderWidth: 2,
    borderColor: '#3b82f6',
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  dialItem: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialItemActive: {
    // Bubble effect could go here if needed, but the text scaling is the primary lens
  },
  dialItemText: {
    color: '#475569',
    fontSize: 16,
    fontWeight: 'bold',
  },
  dialItemTextActive: {
    color: '#3b82f6',
    fontSize: 32,
    fontWeight: '900',
    textShadowColor: 'rgba(59, 130, 246, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    gap: 12,
  },
  saveBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelBtnText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: 'bold',
  },
});
