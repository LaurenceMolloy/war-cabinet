import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert, ScrollView, Animated, PanResponder, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { Database } from '../database';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;

const SwipeableCard = React.forwardRef(({ item, categoryName, onSwipeLeft, onSwipeRight }: any, ref) => {
  const position = useRef(new Animated.ValueXY()).current;
  
  React.useImperativeHandle(ref, () => ({
    swipeLeft: () => forceSwipe('left'),
    swipeRight: () => forceSwipe('right')
  }));

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: (evt, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          forceSwipe('right');
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          forceSwipe('left');
        } else {
          resetPosition();
        }
      }
    })
  ).current;

  const forceSwipe = (direction: 'right' | 'left') => {
    const x = direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
    Animated.timing(position, {
      toValue: { x, y: 0 },
      duration: 450,
      useNativeDriver: false
    }).start(() => direction === 'right' ? onSwipeRight() : onSwipeLeft());
  };

  const resetPosition = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false
    }).start();
  };

  const getCardStyle = () => {
    const rotate = position.x.interpolate({
      inputRange: [-SCREEN_WIDTH * 1.5, 0, SCREEN_WIDTH * 1.5],
      outputRange: ['-30deg', '0deg', '30deg']
    });

    return {
      ...position.getLayout(),
      transform: [{ rotate }]
    };
  };

  const likeOpacity = position.x.interpolate({
    inputRange: [0, SCREEN_WIDTH / 4],
    outputRange: [0, 1],
    extrapolate: 'clamp'
  });

  const nopeOpacity = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 4, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp'
  });

  return (
    <Animated.View style={[getCardStyle(), styles.card]} {...panResponder.panHandlers}>
      {/* Visual Feedback Overlays */}
      <Animated.View style={[styles.cardOverlay, styles.overlayFound, { opacity: likeOpacity }]}>
        <Text style={styles.overlayText}>FOUND</Text>
      </Animated.View>
      <Animated.View style={[styles.cardOverlay, styles.overlayMia, { opacity: nopeOpacity }]}>
        <Text style={styles.overlayText}>MIA</Text>
      </Animated.View>

      {item.image_uri ? (
        <Image source={{ uri: item.image_uri }} style={styles.cardImage} />
      ) : (
        <View style={styles.cardImagePlaceholder}>
          <MaterialCommunityIcons name="package-variant-closed" size={80} color="#1e293b" />
        </View>
      )}
      
      <View style={styles.cardContent}>
        <Text style={styles.cardCategory}>{categoryName}</Text>
        <Text style={styles.cardTitle}>{item.type_name}</Text>
        <Text style={styles.cardSize}>{item.quantity} × {item.size || 'Standard'}</Text>
        
        <View style={styles.intelRow}>
          <MaterialCommunityIcons name="calendar-clock" size={16} color="#fbbf24" />
          <Text style={styles.intelText}>EXP: {item.expiry_month ? `${item.expiry_month}/${item.expiry_year}` : 'NO EXPIRY'}</Text>
        </View>

        {item.batch_intel && (
          <View style={styles.intelRow}>
            <MaterialCommunityIcons name="information-outline" size={16} color="#94a3b8" />
            <Text style={styles.intelText}>{item.batch_intel}</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
});

export default function ReconScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const cardRef = useRef<any>(null);

  const [phase, setPhase] = useState<'setup' | 'active' | 'summary'>('setup');
  const [cabinets, setCabinets] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  
  const [selectedCabinetId, setSelectedCabinetId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  
  const [batches, setBatches] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [missingList, setMissingList] = useState<any[]>([]);
  const [foundCount, setFoundCount] = useState(0);

  useEffect(() => {
    loadCabinets();
  }, []);

  useEffect(() => {
    loadCategories();
  }, [selectedCabinetId]);

  const loadCabinets = async () => {
    const cabs = await Database.Cabinets.getAll(db);
    setCabinets(cabs);
  };

  const loadCategories = async () => {
    if (!selectedCabinetId) {
      const cats = await db.getAllAsync<any>('SELECT * FROM Categories ORDER BY name');
      setCategories(cats);
      return;
    }

    // Show categories that have active stock in this cabinet 
    // OR have items configured to live in this cabinet by default.
    const cats = await db.getAllAsync<any>(`
      SELECT 
        c.*, 
        MIN(inv.last_audited_at) as last_audit
      FROM Categories c
      JOIN ItemTypes it ON c.id = it.category_id
      LEFT JOIN Inventory inv ON it.id = inv.item_type_id AND inv.cabinet_id = ? AND inv.quantity > 0
      WHERE inv.id IS NOT NULL OR it.default_cabinet_id = ?
      GROUP BY c.id
      ORDER BY c.name
    `, [selectedCabinetId, selectedCabinetId]);
    
    const safeCats = cats.map(c => ({
      ...c,
      last_audit: (c.last_audit && !isNaN(Number(c.last_audit))) ? Number(c.last_audit) : null
    }));
    
    setCategories(safeCats);
    
    // If current selected category is no longer in the list, clear it
    if (selectedCategoryId && !cats.some(c => c.id === selectedCategoryId)) {
      setSelectedCategoryId(null);
    }
  };

  const startMission = async () => {
    if (!selectedCabinetId || !selectedCategoryId) {
      Alert.alert('Orders Required', 'Select a Cabinet and Category to begin reconnaissance.');
      return;
    }

    // Fetch batches for this mission
    const rows = await db.getAllAsync<any>(`
      SELECT 
        inv.id, inv.quantity, inv.size, inv.expiry_month, inv.expiry_year, inv.batch_intel,
        it.name as type_name, it.default_supplier, it.default_product_range, it.image_uri,
        it.unit_type
      FROM Inventory inv
      JOIN ItemTypes it ON inv.item_type_id = it.id
      WHERE inv.cabinet_id = ? AND it.category_id = ? AND inv.quantity > 0
      ORDER BY it.name, inv.expiry_year, inv.expiry_month
    `, [selectedCabinetId, selectedCategoryId]);

    if (rows.length === 0) {
      Alert.alert('Sector Clear', 'No inventory found in this sector matching your criteria.');
      return;
    }

    setBatches(rows);
    setCurrentIndex(0);
    setFoundCount(0);
    setMissingList([]);
    setPhase('active');
  };

  const handleAudit = async (isMissing: boolean) => {
    const currentBatch = batches[currentIndex];
    
    if (isMissing) {
      setMissingList(prev => [...prev, currentBatch]);
    } else {
      setFoundCount(prev => prev + 1);
      // Immediate DB update for "Found" items to reset staleness
      await Database.Inventory.markAudited(db, currentBatch.id, 'VERIFIED');
    }

    if (currentIndex < batches.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setPhase('summary');
    }
  };

  const finalizeAudit = async () => {
    // Delete missing items from the ledger
    for (const item of missingList) {
      await db.runAsync('DELETE FROM Inventory WHERE id = ?', [item.id]);
      // Log the MIA event
      await Database.Inventory.markAudited(db, item.id, 'MIA'); 
      // Record in Metrics (Future implementation will use AuditMetrics table properly)
    }

    // Record session metrics
    await db.runAsync(
      'INSERT INTO AuditMetrics (timestamp, cabinet_id, item_type_id, found_qty, missing_qty, audit_session_id) VALUES (?, ?, ?, ?, ?, ?)',
      [Date.now(), selectedCabinetId, null, foundCount, missingList.length, `audit_${Date.now()}`]
    );

    Alert.alert('Mission Complete', `Intelligence updated. ${foundCount} verified, ${missingList.length} purged.`);
    router.replace('/logistics');
  };

  const getAuditStatus = (lastAudit: any) => {
    const auditTs = Number(lastAudit);
    if (!lastAudit || isNaN(auditTs) || auditTs <= 0) return { label: 'NEVER AUDITED', color: '#f43f5e', icon: 'alert-circle-outline' };
    
    const diff = Date.now() - auditTs;
    const days = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
    
    if (days === 0) return { label: 'AUDITED TODAY', color: '#22c55e', icon: 'check-decagram' };
    if (days < 7) return { label: `${days}d AGO`, color: '#22c55e', icon: 'check-circle-outline' };
    if (days < 30) return { label: `${Math.floor(days/7)}w AGO`, color: '#fbbf24', icon: 'clock-outline' };
    
    return { label: `${Math.floor(days/30)}mo AGO`, color: '#94a3b8', icon: 'clock-alert-outline' };
  };

  if (phase === 'setup') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#f8fafc" />
          </TouchableOpacity>
          <Text style={styles.title}>Recon Intel</Text>
        </View>

        <ScrollView style={styles.setupScroll}>
          <Text style={styles.label}>SELECT TARGET CABINET</Text>
          <View style={styles.pickerGrid}>
            {cabinets.map(cab => (
              <TouchableOpacity 
                key={cab.id} 
                style={[styles.pickerItem, selectedCabinetId === cab.id && styles.pickerItemActive]}
                onPress={() => setSelectedCabinetId(cab.id)}
              >
                <MaterialCommunityIcons name="office-building" size={24} color={selectedCabinetId === cab.id ? "#0f172a" : "#94a3b8"} />
                <Text style={[styles.pickerText, selectedCabinetId === cab.id && styles.pickerTextActive]}>{cab.name.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>SELECT TARGET CATEGORY</Text>
          
          <View style={styles.pickerGrid}>
            {/* UNVERIFIED TARGETS */}
            {categories.filter(c => {
              const auditTs = Number(c.last_audit);
              const days = (!isNaN(auditTs) && auditTs > 0) ? Math.floor((Date.now() - auditTs) / (1000 * 60 * 60 * 24)) : 999;
              return days > 0;
            }).map(cat => {
              const status = getAuditStatus(cat.last_audit);
              const isActive = selectedCategoryId === cat.id;

              return (
                <TouchableOpacity 
                  key={cat.id} 
                  style={[styles.pickerItem, isActive && styles.pickerItemActive]}
                  onPress={() => setSelectedCategoryId(cat.id)}
                >
                  <MaterialCommunityIcons name={cat.icon || "tag"} size={24} color={isActive ? "#0f172a" : "#94a3b8"} />
                  <Text style={[styles.pickerText, isActive && styles.pickerTextActive]}>{cat.name.toUpperCase()}</Text>
                  
                  <View style={styles.statusBadge}>
                    <MaterialCommunityIcons name={status.icon as any} size={10} color={isActive ? "#0f172a" : status.color} />
                    <Text style={[styles.statusText, { color: isActive ? "#0f172a" : status.color }]}>{status.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* SECURED SECTORS */}
            {categories.filter(c => {
              const days = c.last_audit ? Math.floor((Date.now() - c.last_audit) / (1000 * 60 * 60 * 24)) : 999;
              return days === 0;
            }).map(cat => {
              const isActive = selectedCategoryId === cat.id;

              return (
                <TouchableOpacity 
                  key={cat.id} 
                  style={[styles.pickerItem, styles.pickerItemSecured, isActive && styles.pickerItemActive]}
                  onPress={() => setSelectedCategoryId(cat.id)}
                >
                  <MaterialCommunityIcons name="check-decagram" size={24} color={isActive ? "#0f172a" : "#22c55e"} />
                  <Text style={[styles.pickerText, { color: isActive ? "#0f172a" : "#22c55e" }]}>{cat.name.toUpperCase()}</Text>
                  <Text style={[styles.statusText, { color: isActive ? "#0f172a" : "#22c55e", marginTop: 4 }]}>SECURED TODAY</Text>
                </TouchableOpacity>
              );
            })}

            {categories.length === 0 && selectedCabinetId && (
              <View style={styles.emptyPicker}>
                <MaterialCommunityIcons name="folder-outline" size={32} color="#475569" />
                <Text style={styles.emptyPickerText}>NO CATEGORIES FOUND IN THIS CABINET</Text>
              </View>
            )}
          </View>
        </ScrollView>

        <TouchableOpacity style={styles.startBtn} onPress={startMission}>
          <Text style={styles.startBtnText}>ENGAGE RECON</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (phase === 'active') {
    const current = batches[currentIndex];
    const rawProgress = batches.length > 0 ? ((currentIndex + 1) / batches.length) * 100 : 0;
    const progress = isFinite(rawProgress) ? rawProgress : 0;

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: `${progress}%` }]} />
          <Text style={styles.progressText}>BATCH {currentIndex + 1} OF {batches.length}</Text>
        </View>

        <View style={styles.cardContainer}>
          <SwipeableCard 
            ref={cardRef}
            key={current.id}
            item={current} 
            categoryName={categories.find(c => c.id === selectedCategoryId)?.name.toUpperCase()}
            onSwipeLeft={() => handleAudit(true)}
            onSwipeRight={() => handleAudit(false)}
          />
        </View>

        <View style={styles.guidanceRow}>
          <View style={styles.guidanceItem}>
            <MaterialCommunityIcons name="arrow-left-bold" size={16} color="#ef4444" />
            <Text style={[styles.guidanceText, { color: '#ef4444' }]}>SWIPE LEFT (MIA)</Text>
          </View>
          <View style={styles.guidanceItem}>
            <Text style={[styles.guidanceText, { color: '#22c55e' }]}>SWIPE RIGHT (FOUND)</Text>
            <MaterialCommunityIcons name="arrow-right-bold" size={16} color="#22c55e" />
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, styles.btnMia]} onPress={() => cardRef.current?.swipeLeft()}>
            <MaterialCommunityIcons name="close" size={24} color="#f8fafc" />
            <Text style={styles.actionBtnSmallText}>MIA</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, styles.btnFound]} onPress={() => cardRef.current?.swipeRight()}>
            <MaterialCommunityIcons name="check" size={24} color="#f8fafc" />
            <Text style={styles.actionBtnSmallText}>FOUND</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const restoreItem = async (item: any) => {
    // Remove from missing list
    setMissingList(prev => prev.filter(i => i.id !== item.id));
    // Add to found count
    setFoundCount(prev => prev + 1);
    // Mark as audited in DB (since it was actually found)
    await Database.Inventory.markAudited(db, item.id, 'VERIFIED');
  };

  if (phase === 'summary') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>MISSION DEBRIEF</Text>
        </View>

        <ScrollView style={styles.summaryScroll}>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statVal}>{foundCount}</Text>
              <Text style={styles.statLabel}>VERIFIED</Text>
            </View>
            <View style={[styles.statBox, { borderLeftWidth: 1, borderColor: '#1e293b' }]}>
              <Text style={[styles.statVal, { color: '#ef4444' }]}>{missingList.length}</Text>
              <Text style={styles.statLabel}>MISSING</Text>
            </View>
          </View>

          {missingList.length > 0 && (
            <View style={styles.miaList}>
              <Text style={styles.miaHeader}>CASUALTY REPORT (TO BE DELETED)</Text>
              <Text style={styles.miaSubHeader}>TAP "RESTORE" IF AN ITEM WAS SWIPED IN ERROR</Text>
              {missingList.map((item, idx) => (
                <View key={idx} style={styles.miaItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.miaItemText}>{item.type_name}</Text>
                    <Text style={styles.miaItemSub}>{item.quantity} × {item.size}</Text>
                  </View>
                  <TouchableOpacity style={styles.restoreBtn} onPress={() => restoreItem(item)}>
                    <MaterialCommunityIcons name="undo" size={16} color="#fbbf24" />
                    <Text style={styles.restoreBtnText}>RESTORE</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {missingList.length === 0 && (
            <View style={styles.perfectScore}>
              <MaterialCommunityIcons name="shield-check" size={60} color="#22c55e" />
              <Text style={styles.perfectText}>NO CASUALTIES REPORTED</Text>
              <Text style={styles.perfectSubText}>ALL ASSETS ACCOUNTED FOR IN THIS SECTOR.</Text>
            </View>
          )}
        </ScrollView>

        <TouchableOpacity style={styles.finalizeBtn} onPress={finalizeAudit}>
          <Text style={styles.finalizeBtnText}>CONFIRM & UPDATE LEDGER</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  header: { padding: 20, flexDirection: 'row', alignItems: 'center', gap: 15 },
  backBtn: { padding: 5 },
  title: { color: '#f8fafc', fontSize: 24, fontWeight: '900', letterSpacing: 1 },
  
  setupScroll: { flex: 1, paddingHorizontal: 20 },
  label: { color: '#64748b', fontSize: 12, fontWeight: '900', marginBottom: 15, marginTop: 20, letterSpacing: 1 },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pickerItem: { 
    width: '48%', 
    backgroundColor: '#0f172a', 
    padding: 15, 
    borderRadius: 12, 
    borderWidth: 1, 
    borderColor: '#1e293b',
    alignItems: 'center',
    gap: 8
  },
  pickerItemActive: { backgroundColor: '#fbbf24', borderColor: '#fbbf24' },
  pickerItemSecured: { borderColor: '#22c55e33', backgroundColor: '#064e3b33' },
  pickerText: { color: '#94a3b8', fontSize: 10, fontWeight: 'bold', textAlign: 'center' },
  pickerTextActive: { color: '#0f172a' },
  
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  statusText: { fontSize: 8, fontWeight: '900' },
  
  startBtn: { backgroundColor: '#fbbf24', margin: 20, padding: 20, borderRadius: 15, alignItems: 'center' },
  startBtnText: { color: '#0f172a', fontSize: 18, fontWeight: '900', letterSpacing: 1 },

  emptyPicker: { flex: 1, alignItems: 'center', padding: 40, gap: 10 },
  emptyPickerText: { color: '#475569', fontSize: 10, fontWeight: 'bold', textAlign: 'center' },

  progressContainer: { height: 40, backgroundColor: '#0f172a', justifyContent: 'center' },
  progressBar: { position: 'absolute', height: '100%', backgroundColor: '#1e293b' },
  progressText: { color: '#94a3b8', fontSize: 10, fontWeight: '900', textAlign: 'center', letterSpacing: 2 },

  cardContainer: { flex: 1, padding: 20, justifyContent: 'center' },
  card: { backgroundColor: '#0f172a', borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: '#1e293b' },
  cardImage: { width: '100%', height: 250 },
  cardImagePlaceholder: { width: '100%', height: 250, backgroundColor: '#020617', justifyContent: 'center', alignItems: 'center' },
  cardContent: { padding: 20 },
  cardCategory: { color: '#3b82f6', fontSize: 12, fontWeight: '900', marginBottom: 5 },
  cardTitle: { color: '#f8fafc', fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  cardSize: { color: '#94a3b8', fontSize: 16, marginBottom: 15 },
  intelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  intelText: { color: '#cbd5e1', fontSize: 14 },

  actionRow: { flexDirection: 'row', padding: 20, gap: 20 },
  actionBtn: { flex: 1, height: 80, borderRadius: 20, justifyContent: 'center', alignItems: 'center', gap: 5 },
  btnMia: { backgroundColor: '#ef4444' },
  btnFound: { backgroundColor: '#22c55e' },
  actionBtnSmallText: { color: '#f8fafc', fontSize: 10, fontWeight: '900' },

  cardOverlay: { position: 'absolute', top: 50, zIndex: 10, borderWidth: 4, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  overlayFound: { left: 40, borderColor: '#22c55e', transform: [{ rotate: '-20deg' }] },
  overlayMia: { right: 40, borderColor: '#ef4444', transform: [{ rotate: '20deg' }] },
  overlayText: { fontSize: 32, fontWeight: '900', color: '#f8fafc' },

  guidanceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 40, marginBottom: 10 },
  guidanceItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  guidanceText: { fontSize: 8, fontWeight: 'bold', letterSpacing: 1 },

  summaryScroll: { flex: 1, padding: 20 },
  statsRow: { flexDirection: 'row', backgroundColor: '#0f172a', borderRadius: 20, padding: 20, marginBottom: 30 },
  statBox: { flex: 1, alignItems: 'center' },
  statVal: { color: '#22c55e', fontSize: 40, fontWeight: '900' },
  statLabel: { color: '#64748b', fontSize: 12, fontWeight: 'bold' },
  
  miaList: { gap: 10 },
  miaHeader: { color: '#ef4444', fontSize: 12, fontWeight: '900', marginBottom: 5 },
  miaSubHeader: { color: '#64748b', fontSize: 8, fontWeight: 'bold', marginBottom: 10, letterSpacing: 1 },
  miaItem: { backgroundColor: '#1e1b1b', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#450a0a', flexDirection: 'row', alignItems: 'center' },
  miaItemText: { color: '#f8fafc', fontSize: 16, fontWeight: 'bold' },
  miaItemSub: { color: '#94a3b8', fontSize: 12 },

  restoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#0f172a', borderRadius: 8, borderWidth: 1, borderColor: '#1e293b' },
  restoreBtnText: { color: '#fbbf24', fontSize: 10, fontWeight: 'bold' },

  perfectScore: { alignItems: 'center', padding: 40, gap: 15 },
  perfectText: { color: '#22c55e', fontSize: 18, fontWeight: '900' },
  perfectSubText: { color: '#64748b', fontSize: 12, fontWeight: 'bold', textAlign: 'center' },

  finalizeBtn: { backgroundColor: '#ef4444', margin: 20, padding: 20, borderRadius: 15, alignItems: 'center' },
  finalizeBtnText: { color: '#f8fafc', fontSize: 16, fontWeight: '900', letterSpacing: 1 }
});
