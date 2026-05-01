import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { QuickThresholdModal } from './QuickThresholdModal';
import { FuelGauge } from './FuelGauge';
import { formatQuantity } from '../utils/measurements';
import { Database } from '../database';

interface SectorReadiness {
  id: number;
  name: string;
  icon: string;
  readiness: number; // 0–1
  actual: number;
  required: number;
  itemsAtRisk: number;
  isActive: boolean;
}

interface Shortfall {
  name: string;
  actual: number;       // physical stock (g / ml / count)
  required: number;     // physical min target
  maxRequired: number | null;
  gap: number;          // physical shortfall
  unitType: string;
  packsNeeded: number | null;
  packSizeLabel: string | null;
  isDefaultSizePack: boolean;
  batches: number[];
  catName: string;
}

interface ReadinessProps {
  mode?: 'readiness' | 'resupply';
}

export function ReadinessCommandView({ mode = 'readiness' }: ReadinessProps) {
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
      // ── DAL queries (entity-level) ───────────────────────────────────────
      const rows        = await Database.ItemTypes.getWithCategories(db);
      const inventory   = await Database.Inventory.getAll(db);
      const commonSizes = await Database.Inventory.getCommonBatchSizes(db);


      // ── Helpers ──────────────────────────────────────────────────────────
      const parseSize = (s: any): number => {
        if (!s) return 0;
        const m = String(s).match(/^(\d+(\.\d+)?)/);
        return m ? parseFloat(m[0]) : 0;
      };

      // type_id -> most common numeric batch size (fallback pack suggestion)
      const commonSizeMap: Record<number, number> = {};
      commonSizes.forEach((r: any) => {
        if (!(r.item_type_id in commonSizeMap)) {
          const v = parseSize(r.size);
          if (v > 0) commonSizeMap[r.item_type_id] = v;
        }
      });

      // type_id -> batch rows
      const invByType: Record<number, any[]> = {};
      inventory.forEach((r: any) => {
        if (!invByType[r.item_type_id]) invByType[r.item_type_id] = [];
        invByType[r.item_type_id].push(r);
      });

      // ── Per-item computation ─────────────────────────────────────────────
      const computeItem = (row: any) => {
        const batches    = invByType[row.type_id] || [];
        const defSizeVal = parseSize(row.default_size);
        const isPhysical = defSizeVal > 0 && row.unit_type !== 'count';

        const physicalStock = isPhysical
          ? batches.reduce((s: number, b: any) => s + (b.quantity * (parseSize(b.size) || defSizeVal)), 0)
          : batches.reduce((s: number, b: any) => s + b.quantity, 0);

        const minTarget = row.min_stock_level > 0
          ? (isPhysical ? row.min_stock_level * defSizeVal : row.min_stock_level)
          : 0;
        const maxTarget = row.max_stock_level > 0
          ? (isPhysical ? row.max_stock_level * defSizeVal : row.max_stock_level)
          : null;

        const ratio = minTarget > 0 ? physicalStock / minTarget : 1;

        // Pack suggestion: prefer default_size, fall back to most common batch
        const fallbackSize     = commonSizeMap[row.type_id];
        const packSize         = isPhysical ? defSizeVal : (fallbackSize ?? null);
        const isDefaultSizePack = isPhysical;

        return { physicalStock, minTarget, maxTarget, ratio, packSize, isDefaultSizePack };
      };

      // ── Build maps ───────────────────────────────────────────────────────
      const sectorMap: Record<number, SectorReadiness> = {};
      const shortfallList: Shortfall[] = [];
      const itemsBySector: Record<number, any[]> = {};
      const untargetedBySector: Record<number, any[]> = {};

      // Seed sector map from all category rows
      rows.forEach((row: any) => {
        if (!sectorMap[row.cat_id]) {
          sectorMap[row.cat_id] = {
            id: row.cat_id, name: row.cat_name, icon: row.icon || 'box',
            readiness: 0, actual: 0, required: 0, itemsAtRisk: 0, isActive: false
          };
        }
      });

      rows.forEach((row: any) => {
        if (!row.type_id) return;
        const { physicalStock, minTarget, maxTarget, ratio, packSize, isDefaultSizePack } = computeItem(row);

        if (row.min_stock_level > 0) {
          sectorMap[row.cat_id].required += minTarget;
          sectorMap[row.cat_id].actual   += physicalStock;

          if (!itemsBySector[row.cat_id]) itemsBySector[row.cat_id] = [];
          itemsBySector[row.cat_id].push({
            id: row.type_id, name: row.type_name,
            actual: physicalStock, required: minTarget, maxRequired: maxTarget,
            unitType: isDefaultSizePack ? row.unit_type : 'count', defaultSize: row.default_size, readiness: ratio
          });

          if (physicalStock < minTarget) {
            sectorMap[row.cat_id].itemsAtRisk += 1;
            const gap           = minTarget - physicalStock;
            // If it's not a default size pack (meaning it's purely count-based math), gap IS the packs needed.
            const packsNeeded   = isDefaultSizePack 
                                   ? (packSize && packSize > 0 ? Math.ceil(gap / packSize) : null)
                                   : gap;
            // If we're tracking counts, we can still suggest the fallback size text
            const packSizeLabel = packSize ? formatQuantity(packSize, row.unit_type) : null;
            // Build pip data: one entry per physical unit
            const defSizeVal = parseSize(row.default_size);
            const isPhysical = defSizeVal > 0 && row.unit_type !== 'count';
            const batchPips = (invByType[row.type_id] || []).flatMap((b: any) => {
              const unitSize = isPhysical ? (parseSize(b.size) || defSizeVal) : 1;
              return Array(b.quantity).fill(unitSize);
            }).filter((v: number) => v > 0);
            shortfallList.push({
              name: row.type_name, actual: physicalStock,
              required: minTarget, maxRequired: maxTarget, gap,
              unitType: isDefaultSizePack ? row.unit_type : 'count', 
              packsNeeded, packSizeLabel, isDefaultSizePack,
              batches: batchPips,
              catName: row.cat_name
            });
          }
        } else {
          if (!untargetedBySector[row.cat_id]) untargetedBySector[row.cat_id] = [];
          untargetedBySector[row.cat_id].push({
            id: row.type_id, name: row.type_name,
            actual: physicalStock, required: null, maxRequired: null,
            unitType: isDefaultSizePack ? row.unit_type : 'count', defaultSize: row.default_size, readiness: 0
          });
        }
      });

      // ── Sector readiness (honest pessimistic average) ────────────────────
      const sectorList = Object.values(sectorMap).map(s => {
        const items = itemsBySector[s.id] || [];
        const honestSum = items.reduce((acc: number, it: any) => acc + Math.min(it.readiness, 1), 0);
        return { ...s, readiness: items.length > 0 ? honestSum / items.length : 0, isActive: items.length > 0 };
      }).sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        const diff = a.readiness - b.readiness;
        return Math.abs(diff) < 0.0001 ? a.name.localeCompare(b.name) : diff;
      });

      Object.keys(itemsBySector).forEach(k =>
        itemsBySector[Number(k)].sort((a, b) => {
          const diff = a.readiness - b.readiness;
          return Math.abs(diff) < 0.0001 ? a.name.localeCompare(b.name) : diff;
        })
      );
      Object.keys(untargetedBySector).forEach(k =>
        untargetedBySector[Number(k)].sort((a, b) => a.name.localeCompare(b.name))
      );

      const allTactical    = Object.values(itemsBySector).flat();
      const globalHonestSum = allTactical.reduce((acc: number, it: any) => acc + Math.min(it.readiness, 1), 0);

      setOverallReadiness(allTactical.length > 0 ? (globalHonestSum / allTactical.length) * 100 : 100);
      setSectors(sectorList);
      setSectorItems(itemsBySector);
      setUntargetedItems(untargetedBySector);
      setShortfalls(shortfallList.sort((a, b) => b.gap - a.gap).slice(0, 5));
      setLoading(false);
    } catch (e) {
      console.error('[READINESS] Calculation failed:', e);
      setLoading(false);
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
  if (mode === 'resupply') {
    const groupedShortfalls = shortfalls.reduce((acc, sf) => {
      if (!acc[sf.catName]) acc[sf.catName] = [];
      acc[sf.catName].push(sf);
      return acc;
    }, {} as Record<string, Shortfall[]>);

    const catNames = Object.keys(groupedShortfalls).sort();

    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {shortfalls.length === 0 ? (
            <View style={styles.emptyAdvice}>
              <MaterialCommunityIcons name="check-decagram" size={32} color="#22c55e" />
              <Text style={styles.emptyText}>All tactical supply lines are meeting their minimum requirements.</Text>
            </View>
          ) : (
            catNames.map(catName => (
              <View key={catName} style={{ marginBottom: 24 }}>
                <View style={styles.catHeader}>
                  <MaterialCommunityIcons name="folder-outline" size={16} color="#3b82f6" style={{ marginRight: 8 }} />
                  <Text style={styles.catTitle}>{catName.toUpperCase()}</Text>
                </View>

                {groupedShortfalls[catName].map((item, idx) => {
                  const readiness = item.actual / item.required;
                  const color = getReadinessColor(readiness);
                  return (
                    <View key={idx} style={[styles.triageCard, { borderLeftColor: color }]}>
                      {/* Header row: name + readiness % */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <Text style={styles.triageName} numberOfLines={1}>{item.name}</Text>
                        <Text style={[styles.triagePercent, { color }]}>{Math.round(readiness * 100)}%</Text>
                      </View>

                      {/* PIP BAR — proportional-width pips per batch */}
                      <View style={styles.pipBarTrack}>
                        {item.batches.map((batchPhysical, i) => {
                          const pipPct = Math.min((batchPhysical / item.required) * 100, 100);
                          return (
                            <View
                              key={i}
                              style={[
                                styles.pipBarSegment,
                                { width: `${pipPct}%` as any, backgroundColor: color }
                              ]}
                            />
                          );
                        })}
                      </View>

                      {/* Footer row: metric grid */}
                      <View style={{ flexDirection: 'row', marginTop: 16, gap: 4 }}>
                        <View style={styles.metricBox}>
                          <Text style={[styles.metricValue, { color: '#f8fafc' }]} numberOfLines={1}>{formatQuantity(item.actual, item.unitType)}</Text>
                          <Text style={styles.metricLabel}>Stocked</Text>
                        </View>
                        <View style={styles.metricBox}>
                          <Text style={[styles.metricValue, { color: '#94a3b8' }]} numberOfLines={1}>{formatQuantity(item.required, item.unitType)}</Text>
                          <Text style={styles.metricLabel}>Required</Text>
                        </View>
                        <View style={[styles.metricBox, { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.2)' }]}>
                          <Text style={[styles.metricValue, { color: '#ef4444' }]} numberOfLines={1}>{formatQuantity(item.gap, item.unitType)}</Text>
                          <Text style={styles.metricLabel}>Shortfall</Text>
                        </View>
                        <View style={[styles.metricBox, { flex: 1.2, backgroundColor: 'rgba(34, 197, 94, 0.05)', borderColor: 'rgba(34, 197, 94, 0.2)' }]}>
                          {item.packsNeeded !== null && item.packSizeLabel ? (
                            <>
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 2 }}>
                                <Text style={[styles.metricValue, { color: '#22c55e', marginBottom: 0 }]} numberOfLines={1}>
                                  {item.packsNeeded} × {item.packSizeLabel}{!item.isDefaultSizePack ? '*' : ''}
                                </Text>
                              </View>
                              <Text style={styles.metricLabel}>To Buy</Text>
                            </>
                          ) : (
                            <Text style={styles.metricLabel}>-</Text>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
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
                        {item.defaultSize ? <Text style={styles.sizeText}> ({formatQuantity(item.defaultSize, item.unitType)})</Text> : null}
                      </Text>
                      <Text style={styles.detailStats}>
                        {formatQuantity(item.actual, item.unitType)} / {formatQuantity(item.required, item.unitType)}{' '}
                        <Text style={{ color: '#475569' }}>STOCKED</Text>
                        {item.maxRequired != null && <Text style={{ color: '#475569' }}> (MAX: {formatQuantity(item.maxRequired, item.unitType)})</Text>}
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
                      {item.defaultSize ? <Text style={{ color: '#475569', fontSize: 11 }}> ({formatQuantity(item.defaultSize, item.unitType)})</Text> : null}
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
  shortfallSuggestion: { color: '#22c55e', fontSize: 11, fontWeight: 'bold', marginTop: 3 },
  shortfallGap: { alignItems: 'flex-end' },
  gapLabel: { color: '#64748b', fontSize: 9, fontWeight: 'bold' },
  gapValue: { color: '#ef4444', fontSize: 16, fontWeight: 'bold' },

  // Triage cards
  triageCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 10,
  },
  triageName: { color: '#f8fafc', fontSize: 14, fontWeight: 'bold', flex: 1, marginRight: 8 },
  triagePercent: { fontSize: 13, fontWeight: 'bold' },
  triageMeta: { color: '#64748b', fontSize: 11, marginBottom: 4 },
  triageGap: { alignItems: 'flex-end', minWidth: 70 },
  triageGapLabel: { color: '#64748b', fontSize: 9, fontWeight: 'bold', letterSpacing: 0.5 },
  triageGapValue: { color: '#ef4444', fontSize: 18, fontWeight: 'bold' },

  metricBox: { flex: 1, backgroundColor: '#020617', borderRadius: 8, borderWidth: 1, borderColor: '#1e293b', paddingVertical: 8, paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center' },
  metricValue: { fontSize: 13, fontWeight: 'bold', marginBottom: 2, textAlign: 'center' },
  metricLabel: { fontSize: 9, color: '#64748b', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Proportional pip bar
  pipBarTrack: {
    flexDirection: 'row',
    height: 10,
    backgroundColor: '#1e293b',
    borderRadius: 3,
    overflow: 'hidden',
    gap: 2,
  },
  pipBarSegment: { height: '100%', borderRadius: 2, minWidth: 3 },

  // Buy suggestion badge
  buyBadge: {
    backgroundColor: '#052e16',
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  buyBadgeText: { color: '#22c55e', fontSize: 10, fontWeight: 'bold' },

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
  pencilBtn: { padding: 8, backgroundColor: '#0f172a', borderRadius: 8, borderWidth: 1, borderColor: '#334155' },

  catHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#334155', paddingBottom: 6 },
  catTitle: { color: '#3b82f6', fontSize: 12, fontWeight: 'bold' }
});
