import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { QuickThresholdModal } from './QuickThresholdModal';
import { FuelGauge } from './FuelGauge';

interface SectorReadiness {
  id: number;
  name: string;
  icon: string;
  readiness: number; // 0 to 1
  actual: number;
  required: number;
  itemsAtRisk: number;
  isActive: boolean;
}

interface Shortfall {
  name: string;
  actual: number;
  required: number;
  maxRequired: number | null;
  gap: number;
}

export function ReadinessCommandView() {
  const db = useSQLiteContext();
  const [sectors, setSectors] = useState<SectorReadiness[]>([]);
  const [shortfalls, setShortfalls] = useState<Shortfall[]>([]);
  const [overallReadiness, setOverallReadiness] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedSector, setSelectedSector] = useState<number | null>(null);
  const [sectorItems, setSectorItems] = useState<Record<number, any[]>>({});
  const [untargetedItems, setUntargetedItems] = useState<Record<number, any[]>>({});
  const [quickModalVisible, setQuickModalVisible] = useState(false);
  const [selectedItemForThreshold, setSelectedItemForThreshold] = useState<any>(null);

  useEffect(() => {
    loadReadinessData();
  }, []);

  const loadReadinessData = async () => {
    try {
      const cats = await db.getAllAsync<any>(`
        SELECT 
          c.id, 
          c.name, 
          c.icon,
          it.id as type_id,
          it.name as type_name,
          it.min_stock_level,
          it.max_stock_level,
          it.unit_type,
          it.default_size,
          (SELECT SUM(quantity) FROM Inventory WHERE item_type_id = it.id) as actual_stock
        FROM Categories c
        LEFT JOIN ItemTypes it ON it.category_id = c.id
      `);

      const sectorMap: Record<number, SectorReadiness> = {};
      const shortfallList: Shortfall[] = [];

      cats.forEach((row: any) => {
        if (!sectorMap[row.id]) {
          sectorMap[row.id] = {
            id: row.id,
            name: row.name,
            icon: row.icon || 'box',
            readiness: 0,
            actual: 0,
            required: 0,
            itemsAtRisk: 0
          };
        }

        if (row.min_stock_level > 0) {
          const req = row.min_stock_level || 0;
          const act = row.actual_stock || 0;
          
          sectorMap[row.id].required += req;
          sectorMap[row.id].actual += act;
          
          if (act < req) {
            sectorMap[row.id].itemsAtRisk += 1;
            shortfallList.push({
              name: row.type_name,
              actual: act,
              required: req,
              maxRequired: row.max_stock_level,
              gap: req - act
            });
          }
        }
      });

      const sectorList = Object.values(sectorMap).map(s => {
        const sectorItemsLocal = cats.filter((c: any) => c.id === s.id && c.min_stock_level > 0);
        const honestSum = sectorItemsLocal.reduce((acc: number, row: any) => {
          const min = row.min_stock_level || 0;
          const actual = row.actual_stock || 0;
          const ratio = min > 0 ? actual / min : 1;
          return acc + Math.min(ratio, 1);
        }, 0);

        return {
          ...s,
          readiness: sectorItemsLocal.length > 0 ? honestSum / sectorItemsLocal.length : 0,
          isActive: sectorItemsLocal.length > 0
        };
      }).sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        const diff = a.readiness - b.readiness;
        if (Math.abs(diff) < 0.0001) return a.name.localeCompare(b.name);
        return diff;
      });

      const itemsBySector: Record<number, any[]> = {};
      const untargetedBySector: Record<number, any[]> = {};

      cats.forEach((row: any) => {
        if (row.type_id === null) return;
        if (row.min_stock_level > 0) {
          if (!itemsBySector[row.id]) itemsBySector[row.id] = [];
          itemsBySector[row.id].push({
            id: row.type_id,
            name: row.type_name,
            actual: row.actual_stock || 0,
            required: row.min_stock_level,
            maxRequired: row.max_stock_level,
            unitType: row.unit_type,
            defaultSize: row.default_size,
            readiness: row.min_stock_level > 0 ? (row.actual_stock || 0) / row.min_stock_level : 1
          });
        } else {
          if (!untargetedBySector[row.id]) untargetedBySector[row.id] = [];
          untargetedBySector[row.id].push({
            id: row.type_id,
            name: row.type_name,
            actual: row.actual_stock || 0,
            required: null,
            maxRequired: null,
            unitType: row.unit_type,
            defaultSize: row.default_size,
            readiness: 0
          });
        }
      });

      Object.keys(itemsBySector).forEach(key => {
        itemsBySector[Number(key)].sort((a, b) => {
          const diff = a.readiness - b.readiness;
          if (Math.abs(diff) < 0.0001) return a.name.localeCompare(b.name);
          return diff;
        });
      });
      
      Object.keys(untargetedBySector).forEach(key => {
        untargetedBySector[Number(key)].sort((a, b) => a.name.localeCompare(b.name));
      });

      const allTacticalItems = cats.filter((c: any) => c.min_stock_level > 0);
      const globalHonestSum = allTacticalItems.reduce((acc: number, row: any) => {
        const min = row.min_stock_level || 0;
        const actual = row.actual_stock || 0;
        const ratio = min > 0 ? actual / min : 1;
        return acc + Math.min(ratio, 1);
      }, 0);
      
      setOverallReadiness(allTacticalItems.length > 0 ? (globalHonestSum / allTacticalItems.length) * 100 : 100);
      setSectors(sectorList);
      setSectorItems(itemsBySector);
      setUntargetedItems(untargetedBySector);
      setShortfalls(shortfallList.sort((a, b) => (b.required - b.actual) - (a.required - a.actual)).slice(0, 5));
      setLoading(false);
    } catch (e) {
      console.error('[READINESS] Calculation failed:', e);
      setLoading(false);
    }
  };

  const getUnitSuffix = (unitType?: string) => {
    switch (unitType) {
      case 'volume': return 'ml';
      case 'weight': return 'g';
      case 'length': return 'cm';
      case 'count': return '';
      default: return '';
    }
  };

  const getReadinessColor = (val: number, maxVal?: number) => {
    const percentage = Math.floor(val * 100);
    if (percentage <= 25) return '#991b1b'; // Deep Red (Critical)
    if (percentage <= 50) return '#ef4444'; // Red
    if (percentage <= 75) return '#f97316'; // Amber
    if (percentage < 100) return '#fbbf24'; // Yellow
    if (maxVal && val > maxVal) return '#065f46'; // Surplus (Dark Green)
    if (!maxVal && percentage > 200) return '#065f46'; // Fallback Surplus
    return '#22c55e'; // Ready (Green)
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>CALCULATING SECTOR STRENGTH...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* GLOBAL READINESS PULSE */}
      <View style={styles.pulseCard}>
        <View style={styles.pulseHeader}>
          <MaterialCommunityIcons name="radar" size={24} color="#fbbf24" />
          <Text style={styles.pulseTitle}>GLOBAL PREPAREDNESS PULSE</Text>
        </View>
        
        <View style={{ alignItems: 'center', marginTop: 10, paddingBottom: 10 }}>
          <FuelGauge 
            percentage={Math.floor(overallReadiness)} 
            color={getReadinessColor(overallReadiness / 100)} 
            radius={80} 
            strokeWidth={14} 
          />
        </View>
      </View>

      {/* SECTOR HEAT MAP */}
      <Text style={styles.sectionLabel}>LOGISTICAL SECTOR HEAT MAP (TAP TO DRILL DOWN)</Text>
      <View style={styles.grid}>
        {sectors.map(sector => {
          const color = sector.isActive ? getReadinessColor(sector.readiness, 2.0) : '#334155';
          const isSurplus = sector.isActive && sector.readiness > 2.0;
          return (
            <TouchableOpacity 
              key={sector.id} 
              style={[
                styles.sectorTile, 
                { borderLeftColor: color, borderLeftWidth: 4 },
                isSurplus && { borderColor: '#065f46', borderWidth: 1 },
                !sector.isActive && { opacity: 0.6, backgroundColor: '#0f172a' }
              ]}
              onPress={() => sector.isActive && setSelectedSector(sector.id)}
              disabled={!sector.isActive}
            >
              <View style={styles.tileHeader}>
                <MaterialCommunityIcons name={sector.icon as any} size={20} color={color} />
                <Text style={styles.tileTitle} numberOfLines={1}>{sector.name.toUpperCase()}</Text>
              </View>
              
              <View style={styles.tileBody}>
                {sector.isActive ? (
                  <>
                    <View style={{ alignItems: 'center', marginVertical: 12 }}>
                      <FuelGauge 
                        percentage={Math.floor(sector.readiness * 100)} 
                        color={color} 
                        radius={45} 
                        strokeWidth={8}
                        isSurplus={isSurplus}
                      />
                    </View>

                    {sectorItems[sector.id] && sectorItems[sector.id].length > 0 && (
                      <View style={styles.pipBox}>
                        <View style={styles.pipBoxTitleContainer}>
                          <Text style={styles.pipBoxTitle}>ASSET HEALTH</Text>
                        </View>
                        <View style={styles.pipRow}>
                          {[...sectorItems[sector.id]]
                            .sort((a, b) => a.readiness - b.readiness)
                            .map((it, idx) => (
                              <View 
                                key={idx} 
                                style={[
                                  styles.pip, 
                                  { backgroundColor: getReadinessColor(it.readiness, it.maxRequired ? 2.0 : undefined) }
                                ]} 
                              />
                            ))}
                        </View>
                      </View>
                    )}
                  </>
                ) : (
                  <Text style={{ color: '#64748b', fontSize: 9, fontWeight: 'bold', letterSpacing: 0.5, textAlign: 'center', marginVertical: 20 }}>NO TARGETS SET</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* CRITICAL SHORTFALLS */}
      {shortfalls.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>CRITICAL SUPPLY SHORTFALLS</Text>
          <View style={styles.shortfallCard}>
            {shortfalls.map((item, idx) => (
              <View key={idx} style={[styles.shortfallRow, idx === shortfalls.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shortfallName}>{item.name}</Text>
                  <Text style={styles.shortfallMeta}>ACTUAL: {item.actual} / REQUIRED: {item.required}</Text>
                </View>
                <View style={styles.shortfallGap}>
                  <Text style={styles.gapLabel}>GAP</Text>
                  <Text style={styles.gapValue}>-{item.gap}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {sectors.every(s => s.required === 0) && (
        <View style={styles.emptyAdvice}>
          <MaterialCommunityIcons name="information-outline" size={24} color="#64748b" />
          <Text style={styles.emptyText}>
            No stock minimums have been configured. Go to the <Text style={{fontWeight: 'bold', color: '#3b82f6'}}>CATALOG</Text> tab to set tactical requirements for your supplies.
          </Text>
        </View>
      )}
      </ScrollView>

      {/* DRILL DOWN OVERLAY - MOVED OUTSIDE SCROLLVIEW */}
      {selectedSector !== null && (
        <View style={styles.drillDownOverlay}>
          <View style={styles.drillDownHeader}>
            <TouchableOpacity onPress={() => setSelectedSector(null)} style={styles.backButton}>
              <MaterialCommunityIcons name="arrow-left" size={20} color="#fbbf24" />
              <Text style={styles.backButtonText}>BACK TO MAP</Text>
            </TouchableOpacity>
            <Text style={styles.drillDownTitle}>{sectors.find(s => s.id === selectedSector)?.name.toUpperCase()}</Text>
          </View>
          
          <ScrollView style={{ flex: 1 }}>
            {sectorItems[selectedSector]?.map((item, idx) => {
              const maxRatio = item.maxRequired ? (item.maxRequired / item.required) : 2.0;
              const color = getReadinessColor(item.readiness, maxRatio);
              const isSurplus = item.readiness > maxRatio;
              
              // Scale bar: 1.0 (min) is at 50% width. Max (or 2.0) is at 100% width.
              const barWidthPercent = Math.min((item.readiness / maxRatio) * 100, 100);
              
              return (
                <View key={idx} style={styles.detailCard}>
                  {/* FULL WIDTH BAR ABOVE */}
                  <View style={styles.detailBarTrack}>
                    <View style={[styles.centerTargetLine, { left: `${(1.0 / maxRatio) * 100}%` }]} />
                    <View style={[
                      styles.detailBarFill, 
                      { 
                        width: `${barWidthPercent}%`, 
                        backgroundColor: color,
                        borderRightWidth: isSurplus ? 2 : 0,
                        borderRightColor: '#065f46'
                      }
                    ]} />
                  </View>
                  
                  <View style={styles.detailContentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailName}>
                        {item.name}
                        {item.defaultSize ? <Text style={styles.sizeText}> ({item.defaultSize}{getUnitSuffix(item.unitType)})</Text> : null}
                      </Text>
                      <Text style={styles.detailStats}>
                        {item.actual} / {item.required} <Text style={{ color: '#475569' }}>STOCKED</Text>
                        {item.maxRequired && <Text style={{ color: '#475569' }}> (MAX: {item.maxRequired})</Text>}
                      </Text>
                    </View>
                    <Text style={[styles.detailPercent, { color }]}>
                      {Math.floor(item.readiness * 100)}%
                    </Text>
                  </View>
                </View>
              );
            }) || (
              <Text style={{ color: '#64748b', textAlign: 'center', marginTop: 40, marginBottom: 20 }}>No specific requirements set for this sector.</Text>
            )}

            {/* UNTARGETED ASSETS SECTION */}
            {untargetedItems[selectedSector]?.length > 0 && (
              <View style={{ marginTop: 24, paddingTop: 24, borderTopWidth: 1, borderTopColor: '#1e293b' }}>
                <Text style={styles.sectionLabel}>UNTARGETED ASSETS</Text>
                {untargetedItems[selectedSector].map((item, idx) => (
                  <View key={idx} style={styles.untargetedRow}>
                    <Text style={styles.untargetedName}>
                      {item.name}
                      {item.defaultSize ? <Text style={{ color: '#475569', fontSize: 11 }}> ({item.defaultSize}{getUnitSuffix(item.unitType)})</Text> : null}
                    </Text>
                    <TouchableOpacity 
                      onPress={() => {
                        setSelectedItemForThreshold(item);
                        setQuickModalVisible(true);
                      }}
                      style={styles.pencilBtn}
                    >
                      <MaterialCommunityIcons name="pencil" size={16} color="#64748b" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* QUICK THRESHOLD MODAL */}
      {selectedItemForThreshold && (
        <QuickThresholdModal
          visible={quickModalVisible}
          onClose={() => setQuickModalVisible(false)}
          onSave={() => loadReadinessData()}
          itemTypeId={selectedItemForThreshold.id}
          itemName={selectedItemForThreshold.name}
          initialMin={selectedItemForThreshold.required}
          initialMax={selectedItemForThreshold.maxRequired}
          initialDefaultSize={selectedItemForThreshold.defaultSize}
          unitType={selectedItemForThreshold.unitType}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', padding: 16 },
  loadingContainer: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#fbbf24', fontSize: 12, fontWeight: 'bold', letterSpacing: 2 },
  
  pulseCard: { backgroundColor: '#0f172a', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#334155', marginBottom: 24 },
  pulseHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  pulseTitle: { color: '#94a3b8', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
  meterContainer: { height: 8, backgroundColor: '#1e293b', borderRadius: 4, overflow: 'hidden', marginBottom: 12 },
  meterFill: { height: '100%', borderRadius: 4 },
  pulseValue: { fontSize: 32, fontWeight: 'bold', textAlign: 'right' },
  pulseUnit: { fontSize: 12, color: '#64748b', fontWeight: 'bold' },

  sectionLabel: { color: '#64748b', fontSize: 10, fontWeight: 'bold', letterSpacing: 1, marginBottom: 12, paddingLeft: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 32, justifyContent: 'space-between' },
  sectorTile: { width: '48%', backgroundColor: '#0f172a', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#334155' },
  tileHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  tileTitle: { color: '#f8fafc', fontSize: 10, fontWeight: 'bold', flex: 1 },
  tileBody: { gap: 4 },
  pipBox: { marginTop: 12, paddingHorizontal: 6, paddingBottom: 6, paddingTop: 14, backgroundColor: '#020617', borderRadius: 6, borderWidth: 1, borderColor: '#475569' },
  pipBoxTitleContainer: { position: 'absolute', top: -9, alignSelf: 'center', backgroundColor: '#0f172a', paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#475569', borderRadius: 4 },
  pipBoxTitle: { color: '#cbd5e1', fontSize: 8, fontWeight: 'bold', letterSpacing: 0.5 },
  pipRow: { flexDirection: 'row', gap: 1 },
  pip: { flex: 1, height: 4, borderRadius: 1 },

  shortfallCard: { backgroundColor: '#0f172a', borderRadius: 16, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 16 },
  shortfallRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  shortfallName: { color: '#f8fafc', fontSize: 14, fontWeight: 'bold', marginBottom: 2 },
  shortfallMeta: { color: '#64748b', fontSize: 11 },
  shortfallGap: { alignItems: 'flex-end' },
  gapLabel: { color: '#64748b', fontSize: 9, fontWeight: 'bold' },
  gapValue: { color: '#ef4444', fontSize: 16, fontWeight: 'bold' },

  emptyAdvice: { padding: 40, alignItems: 'center', backgroundColor: '#0f172a', borderRadius: 16, borderWidth: 1, borderColor: '#334155', borderStyle: 'dashed' },
  emptyText: { color: '#64748b', fontSize: 13, textAlign: 'center', marginTop: 12, lineHeight: 20 },

  drillDownOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', zIndex: 100, padding: 20 },
  drillDownHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, borderBottomWidth: 1, borderBottomColor: '#1e293b', paddingBottom: 16 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backButtonText: { color: '#fbbf24', fontSize: 12, fontWeight: 'bold' },
  drillDownTitle: { color: '#f8fafc', fontSize: 16, fontWeight: 'bold' },
  
  detailCard: { backgroundColor: '#0f172a', borderRadius: 12, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#1e293b' },
  detailBarTrack: { height: 6, backgroundColor: '#1e293b', width: '100%', position: 'relative' },
  centerTargetLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#ffffff', zIndex: 5 },
  detailBarFill: { height: '100%', borderTopRightRadius: 2, borderBottomRightRadius: 2 },
  detailContentRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  
  detailName: { color: '#f8fafc', fontSize: 14, fontWeight: 'bold' },
  sizeText: { color: '#64748b', fontSize: 11, fontWeight: 'normal' },
  detailStats: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  detailPercent: { fontSize: 16, fontWeight: 'bold' },
  
  untargetedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  untargetedName: { color: '#94a3b8', fontSize: 13 },
  pencilBtn: { padding: 8, backgroundColor: '#0f172a', borderRadius: 8, borderWidth: 1, borderColor: '#334155' }
});
