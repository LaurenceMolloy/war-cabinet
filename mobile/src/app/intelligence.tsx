import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Modal, Platform } from 'react-native';
import Svg, { G, Path, Text as SvgText, Circle, Defs, TextPath, TSpan, Line } from 'react-native-svg';
import { useSQLiteContext } from 'expo-sqlite';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

// Tactical Starburst (Sunburst) Visualization V1
// Concept: Inner ring = Categories, Outer ring = Products
// Click a sector to drill into inventory details.
// This is a standalone "sandbox" file for V1 PoC.

const screenWidth = Dimensions.get('window').width;
const size = screenWidth - 40;
const baseColors = ['#00f5ff', '#ff00ff', '#00ff7f', '#ff8c00']; // Cyan, Magenta, Spring, Autumn
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export default function IntelligenceScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [selectedSector, setSelectedSector] = useState<any>(null);

  const loadData = useCallback(async () => {
    try {
      const now = new Date();
      const currentStamp = now.getFullYear() * 12 + (now.getMonth() + 1);

      // Fetch hierarchical data: Category -> ItemType -> Inventory Batches
        const rows = await db.getAllAsync<any>(`
          SELECT c.id as cat_id, c.name as cat_name,
                 it.id as type_id, it.name as type_name, it.default_size as type_default_size, it.unit_type as type_unit,
                 inv.id as inv_id, inv.quantity, inv.expiry_month, inv.expiry_year,
                 COALESCE(inv.size, it.default_size) as resolved_raw_size,
                 inv.size as bespoke_size, inv.supplier, inv.product_range, inv.batch_intel,
                 cab.cabinet_type as cab_type
          FROM Categories c
          JOIN ItemTypes it ON c.id = it.category_id
          JOIN Inventory inv ON it.id = inv.item_type_id
          LEFT JOIN Cabinets cab ON inv.cabinet_id = cab.id
          ORDER BY c.name, it.name, inv.expiry_year, inv.expiry_month
        `);

      const categories: any = {};
      rows.forEach(row => {
        if (!categories[row.cat_id]) {
          categories[row.cat_id] = { id: row.cat_id, name: row.cat_name, types: {}, total: 0 };
        }
        if (!categories[row.cat_id].types[row.type_id]) {
          categories[row.cat_id].types[row.type_id] = { id: row.type_id, name: row.type_name, batches: [], total: 0 };
        }
        
        // Calculate Batch Color based on expiry
        let batchColor = '#22c55e'; // Green (Safe)
        if (row.expiry_year && row.expiry_month) {
          const expStamp = row.expiry_year * 12 + row.expiry_month;
          const remaining = expStamp - currentStamp;
          if (remaining <= 0) batchColor = '#f43f5e'; // Red (Expired)
          else if (remaining < 4) batchColor = '#f97316'; // Orange (Urgent)
          else if (remaining < 7) batchColor = '#fde047'; // Yellow (Soon)
        }

        const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const formattedExp = row.expiry_month && row.expiry_year 
          ? `${monthNames[row.expiry_month - 1]} ${row.expiry_year}` 
          : null;

        // Resolve Smart Size: Use SQL-resolved raw size with tactical unit appending
        let resolvedSize = String(row.resolved_raw_size || "").trim();
        
        // Auto-Append unit label if size is purely numeric and we have a unit type
        if (resolvedSize !== "" && /^\d+$/.test(resolvedSize)) {
          if (row.type_unit === 'weight') resolvedSize += 'G';
          else if (row.type_unit === 'volume') resolvedSize += 'ML';
        }

        categories[row.cat_id].types[row.type_id].batches.push({
          id: row.inv_id,
          qty: row.quantity,
          color: batchColor,
          size: resolvedSize,
          bespoke_size: row.bespoke_size,
          default_size: row.type_default_size,
          brand: row.supplier,
          range: row.product_range,
          intel: row.batch_intel,
          exp: formattedExp
        });
        categories[row.cat_id].types[row.type_id].total += row.quantity;
        categories[row.cat_id].total += row.quantity;
      });

      // Convert to array and sort
      const finalData = Object.values(categories).map((cat: any) => {
        cat.types = Object.values(cat.types).map((type: any) => {
          // Single-Batch Propagation: If only one batch, promote its meta to the type level
          if (type.batches.length === 1) {
            const b = type.batches[0];
            type.brand = b.brand;
            type.range = b.range;
            type.intel = b.intel;
            type.size = b.size;
            type.exp = b.exp;
            type.default_size = b.default_size;
          } else if (type.batches.length > 1) {
            // Even with multiple batches, store the default size for the type
            type.default_size = type.batches[0].default_size;
          }
          return type;
        });
        return cat;
      });

      setData(finalData);
    } catch (err) {
      console.error('Failed to load starburst data:', err);
    }
  }, [db]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const runSeed = async () => {
    try {
      // 1. Schema Integrity Check (Ensure newer columns exist for the Hub)
      // We wrap these in individual try blocks because ALTER TABLE fails if column already exists
      try { await db.execAsync("ALTER TABLE Inventory ADD COLUMN bespoke_size TEXT;"); } catch(e){}
      try { await db.execAsync("ALTER TABLE Inventory ADD COLUMN supplier TEXT;"); } catch(e){}
      try { await db.execAsync("ALTER TABLE Inventory ADD COLUMN product_range TEXT;"); } catch(e){}
      try { await db.execAsync("ALTER TABLE Inventory ADD COLUMN batch_intel TEXT;"); } catch(e){}

      // 2. Seed Categories
      await db.execAsync(`
        INSERT OR IGNORE INTO Categories (name, icon) VALUES 
        ('PROTEINS', 'food-steak'), 
        ('STARCHES', 'pasta'), 
        ('VEGETABLES', 'leaf'), 
        ('TACTICAL RATIONS', 'pills'), 
        ('MEDICAL', 'medical-bag');
      `);
      
      // 3. Seed Products (linking to named categories)
      await db.execAsync(`
        INSERT OR IGNORE INTO ItemTypes (name, category_id) VALUES 
        ('CHICKEN BREAST', (SELECT id FROM Categories WHERE name='PROTEINS' LIMIT 1)),
        ('RIBEYE STEAK', (SELECT id FROM Categories WHERE name='PROTEINS' LIMIT 1)),
        ('BASMATI RICE', (SELECT id FROM Categories WHERE name='STARCHES' LIMIT 1)),
        ('WHOLEWHEAT PASTA', (SELECT id FROM Categories WHERE name='STARCHES' LIMIT 1)),
        ('SWEETCORN', (SELECT id FROM Categories WHERE name='VEGETABLES' LIMIT 1)),
        ('MRE: CHILI MAC', (SELECT id FROM Categories WHERE name='TACTICAL RATIONS' LIMIT 1));
      `);

      // 4. Seed Inventory Batches
      await db.execAsync(`
        INSERT INTO Inventory (item_type_id, quantity, bespoke_size, supplier, product_range, batch_intel, expiry_month, expiry_year) VALUES
        ((SELECT id FROM ItemTypes WHERE name='CHICKEN BREAST' LIMIT 1), 12, '500G', 'TYSON', 'PREMIUM', 'FROZEN SOURCE', 12, 2026),
        ((SELECT id FROM ItemTypes WHERE name='RIBEYE STEAK' LIMIT 1), 5, '800G', 'ORGANIC CO', 'ELITE', 'AIR CHILLED', 5, 2026),
        ((SELECT id FROM ItemTypes WHERE name='SWEETCORN' LIMIT 1), 12, '3X198G', 'GREEN GIANT', 'ORIGINAL', 'BUNKER STOCK - HIGH ROTATION', 5, 2026),
        ((SELECT id FROM ItemTypes WHERE name='MRE: CHILI MAC' LIMIT 1), 10, '450G', 'MRE STAR', 'WARRIOR', 'HIGH CALORIE', 1, 2024);
      `);

      alert('TACTICAL SEED COMPLETE & SCHEMA HARDENED');
      loadData();
    } catch (err) {
      console.error('Seed failed:', err);
      alert('SEED ERROR: See browser console for details');
    }
  };

  const radius = size / 2;
  const centerX = radius;
  const centerY = radius;

  // Helper to calculate SVG arc path
  const getArcPath = (startAngle: number, endAngle: number, innerR: number, outerR: number) => {
    const x1 = centerX + innerR * Math.cos(startAngle);
    const y1 = centerY + innerR * Math.sin(startAngle);
    const x2 = centerX + outerR * Math.cos(startAngle);
    const y2 = centerY + outerR * Math.sin(startAngle);
    const x3 = centerX + outerR * Math.cos(endAngle);
    const y3 = centerY + outerR * Math.sin(endAngle);
    const x4 = centerX + innerR * Math.cos(endAngle);
    const y4 = centerY + innerR * Math.sin(endAngle);

    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

    return `M ${x1} ${y1} L ${x2} ${y2} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x3} ${y3} L ${x4} ${y4} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1} ${y1} Z`;
  };

  const renderChart = () => {
    const totalQty = data.reduce((sum, cat) => sum + cat.total, 0);
    if (totalQty === 0) return null;

    let currentAngle = -Math.PI / 2; // Start at top
    
    // Radius config: Balanced rings, standardized thickness
    const innerRingR = radius * 0.60;
    const midRingR = radius * 0.70;
    const outerRingR = radius * 0.90;
    const batchRingR = radius;

    const sectors: any[] = [];

    data.forEach((cat, catIdx) => {
      const catLetter = alphabet[catIdx % 26];
      const catAngleSize = (cat.total / totalQty) * 2 * Math.PI;
      const catEndAngle = currentAngle + catAngleSize;
      
      const baseColor = baseColors[catIdx % 4];
      const isCatSelected = selectedSector?.type === 'category' && selectedSector.id === cat.id;

      // 1. INNER RING: Categories (Thin)
      sectors.push(
        <G key={`cat-g-${cat.id}`}>
          <Path
            d={getArcPath(currentAngle, catEndAngle, innerRingR, midRingR)}
            fill={baseColor}
            stroke="#0a0a0a"
            strokeWidth={1}
            opacity={selectedSector && !isCatSelected && selectedSector.cat_id !== cat.id ? 0.3 : 1}
            onPress={() => {
              setSelectedSector({ type: 'category', color: baseColor, ...cat });
            }}
          />
          <SvgText
            x={centerX + (radius * 0.66) * Math.cos(currentAngle + catAngleSize/2)}
            y={centerY + (radius * 0.66) * Math.sin(currentAngle + catAngleSize/2)}
            fill="#000"
            fontSize="8"
            fontWeight="900"
            textAnchor="middle"
            dy={5}
            pointerEvents="none"
          >
            {catLetter}
          </SvgText>
        </G>
      );

      // 2. MIDDLE RING: Products (Thick)
      let typeAngle = currentAngle;
      cat.types.forEach((type: any, typeIdx: number) => {
        const typeLetter = `${catLetter}${typeIdx + 1}`;
        const typeAngleSize = (type.total / cat.total) * catAngleSize;
        const typeEndAngle = typeAngle + typeAngleSize;
        const isTypeSelected = selectedSector?.type === 'item_type' && selectedSector.id === type.id;

        sectors.push(
          <G key={`type-g-${type.id}`}>
            <Path
              d={getArcPath(typeAngle, typeEndAngle, midRingR, outerRingR)}
              fill={baseColor}
              opacity={selectedSector ? (isTypeSelected ? 1 : 0.2) : (0.6 + (typeIdx % 2) * 0.3)}
              stroke="#0a0a0a"
              strokeWidth={1}
              onPress={() => {
                setSelectedSector({ type: 'item_type', cat_id: cat.id, id_code: typeLetter, color: baseColor, ...type });
              }}
            />
            <SvgText
              x={centerX + (radius * 0.81) * Math.cos(typeAngle + typeAngleSize/2)}
              y={centerY + (radius * 0.81) * Math.sin(typeAngle + typeAngleSize/2)}
              fill="#fff"
              fontSize="6"
              fontWeight="bold"
              textAnchor="middle"
              dy={4}
              pointerEvents="none"
              opacity={selectedSector && !isTypeSelected ? 0.3 : 1}
            >
              {typeLetter}
            </SvgText>
          </G>
        );

        // 3. OUTER RING: Batches (Volume-Weighted Pips)
        const pixelGap = 5;
        const gapAngle = pixelGap / radius; 
        
        // Helper to extract clean numeric mass
        const getMass = (s: any) => {
          const n = parseFloat(String(s).replace(/[^0-9.]/g, ''));
          return isNaN(n) ? null : n;
        };

        // Calculate Total Volume for mass-aware scaling (Bespoke > Default > 1)
        const totalVolume = type.batches.reduce((sum: number, b: any) => {
          const bSize = getMass(b.bespoke_size) ?? getMass(type.default_size) ?? 1;
          return sum + (b.qty * bSize);
        }, 0);

        const clusterGap = gapAngle;
        let batchAngle = typeAngle + (clusterGap / 2);
        const availableBatchSpace = typeAngleSize - (type.batches.length * gapAngle);

        type.batches.forEach((batch: any, bIdx: number) => {
          const bSize = getMass(batch.bespoke_size) ?? getMass(type.default_size) ?? 1;
          const batchVolume = batch.qty * bSize;
          const batchAngleSize = (batchVolume / totalVolume) * availableBatchSpace;
          
          const batchEndAngle = batchAngle + batchAngleSize;
          const isBatchSelected = selectedSector?.type === 'batch' && selectedSector.id === batch.id;

          const pips: any[] = [];
          // Cap pips at 12 to maintain legibility. Above that, use a solid bar.
          const showPips = batch.qty > 0 && batch.qty <= 12;

          // Resolve a precision white separator for intra-batch pips
          const pipStroke = '#ffffff';
          
          if (showPips) {
            const gapAngle = 0.008; // High-viz gap within batch
            const pipAngleSize = (batchAngleSize - (gapAngle * (batch.qty - 1))) / batch.qty;
            
            for (let i = 0; i < batch.qty; i++) {
              const pStart = batchAngle + i * (pipAngleSize + gapAngle);
              const pEnd = pStart + pipAngleSize;
              const safeEnd = Math.min(pEnd, batchEndAngle);
              
              pips.push(
                <Path
                  key={`batch-${batch.id}-pip-${i}`}
                  d={getArcPath(pStart, safeEnd, outerRingR, batchRingR)}
                  fill={batch.color}
                  stroke="#ffffff"
                  strokeWidth={1}
                  strokeLinejoin="round"
                  opacity={selectedSector ? (isBatchSelected ? 1 : 0.1) : 1}
                />
              );
            }
          } else {
            pips.push(
              <Path
                key={`batch-${batch.id}-solid`}
                d={getArcPath(batchAngle, batchEndAngle, outerRingR, batchRingR)}
                fill={batch.color}
                stroke="#ffffff"
                strokeWidth={1}
                strokeLinejoin="round"
                opacity={selectedSector ? (isBatchSelected ? 1 : 0.1) : 1}
              />
            );
          }

          sectors.push(
            <G 
              key={`batch-group-${batch.id}`}
              onPress={() => {
                setSelectedSector({ type: 'batch', cat_id: cat.id, parent_name: type.name, color: batch.color, catColor: baseColor, ...batch });
              }}
            >
              {pips}
              <Path
                d={getArcPath(batchAngle, batchEndAngle, outerRingR, batchRingR)}
                fill="transparent"
              />
            </G>
          );
          batchAngle = batchEndAngle + gapAngle;
        });

        typeAngle = typeEndAngle;
      });

      currentAngle = catEndAngle;
    });

    return sectors;
  };

  return (
    <View style={styles.container}>
      {/* Tactical Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/catalog');
        }}>
          <MaterialCommunityIcons name="chevron-left" size={32} color="#94a3b8" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>LOGISTICAL INTELLIGENCE</Text>
          <Text style={styles.headerSub}>STARBURST READINESS V1</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 15 }}>
          <TouchableOpacity onPress={runSeed}>
            <MaterialCommunityIcons name="database-import" size={24} color="#f43f5e" />
          </TouchableOpacity>
          <TouchableOpacity onPress={loadData}>
            <MaterialCommunityIcons name="refresh" size={24} color="#3b82f6" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* The Visualization */}
        <View style={styles.chartArea}>
          <View style={styles.vizWrapper}>
            <Svg width={size} height={size}>
              <Defs>
                <Path id="hubArchTop" d={`M ${centerX - radius * 0.45} ${centerY} A ${radius * 0.45} ${radius * 0.45} 0 0 1 ${centerX + radius * 0.45} ${centerY}`} fill="none" />
                <Path id="hubArchBottom" d={`M ${centerX - radius * 0.49} ${centerY} A ${radius * 0.49} ${radius * 0.49} 0 0 0 ${centerX + radius * 0.49} ${centerY}`} fill="none" />
              </Defs>

              {renderChart()}
              
              {/* CENTRAL SCANNER HUB */}
              <Circle 
                cx={centerX} 
                cy={centerY} 
                r={radius * 0.60 - 10} 
                fill="#020617" 
                stroke={selectedSector ? baseColors[data.findIndex(c => c.id === (selectedSector.cat_id || selectedSector.id)) % 4] || '#fbbf24' : '#1e293b'}
                strokeWidth={1}
                onPress={() => setSelectedSector(null)}
              />

              <G pointerEvents="none">
                {selectedSector ? (
                  <>
                    {/* TOP ORBIT: CONTEXT (Dominant Identity) */}
                    <SvgText fill="#f8fafc" fontSize={12} style={{ fontSize: 12 }} fontWeight="500" letterSpacing={2.5}>
                      <TextPath href="#hubArchTop" startOffset="50%" textAnchor="middle">
                        {selectedSector.type === 'category' ? 'CATEGORY INTEL' : 
                         selectedSector.type === 'item_type' ? 'PRODUCT INTEL' : 'BATCH INTEL'}
                      </TextPath>
                    </SvgText>

                    {/* BOTTOM ORBIT: IDENTITY (Categorical Anchor) */}
                    <SvgText fill={selectedSector.catColor || selectedSector.color || "#fbbf24"} fontSize={12} style={{ fontSize: 12 }} fontWeight="900" letterSpacing={2}>
                      <TextPath href="#hubArchBottom" startOffset="50%" textAnchor="middle">
                        {(selectedSector.parent_name || selectedSector.name).toUpperCase()}
                      </TextPath>
                    </SvgText>

                    {/* THE COMMAND CAP (Compact Gold Standard) */}
                    {(() => {
                      const statusColor = selectedSector.color || baseColors[0];
                      const capR = radius * 0.40;
                      const chordY = -25;
                      const chordX = Math.sqrt(Math.pow(capR, 2) - Math.pow(chordY, 2));
                      const capPath = `M ${centerX - chordX} ${centerY + chordY} A ${capR} ${capR} 0 0 1 ${centerX + chordX} ${centerY + chordY} Z`;

                      // Determine manifest line 1 and optional line 2
                      let manifestLine1 = "";
                      let manifestLine2 = "";

                      if (selectedSector.type === 'batch' || (selectedSector.type === 'item_type' && selectedSector.batches?.length === 1)) {
                        // Single batch: show precise unit manifest
                        const q = selectedSector.qty || selectedSector.total || 0;
                        const s = (selectedSector.size || "").toUpperCase();
                        manifestLine1 = s ? `${q} X ${s}` : `${q} ITEMS`;
                      } else if (selectedSector.type === 'item_type' && selectedSector.batches?.length > 1) {
                        // Multi-batch product: show item count + batch count
                        manifestLine1 = `${selectedSector.total || 0} ITEMS`;
                        manifestLine2 = `across ${selectedSector.batches.length} batches`;
                      } else {
                        // Category level: B batches across P products
                        const productCount = selectedSector.types?.length || 0;
                        const batchCount = selectedSector.types?.reduce((sum: number, t: any) => sum + (t.batches?.length || 0), 0) || 0;
                        manifestLine1 = `${batchCount} BATCHES`;
                        manifestLine2 = `across ${productCount} products`;
                      }
                      
                      return (
                        <>
                          <Path 
                            d={capPath} 
                            fill={statusColor} 
                            opacity={1.0} 
                          />
                          <SvgText
                            x={centerX}
                            y={manifestLine2 ? centerY - 42 : centerY - 38}
                            fill="#000"
                            fontSize={11}
                            style={{ fontSize: 11 }}
                            fontWeight="900"
                            textAnchor="middle"
                          >
                            {manifestLine1}
                          </SvgText>

                          {manifestLine2 ? (
                            <SvgText
                              x={centerX}
                              y={centerY - 29}
                              fill="#000"
                              fontSize={10}
                              style={{ fontSize: 10 }}
                              fontWeight="700"
                              textAnchor="middle"
                              letterSpacing={0.5}
                            >
                              {manifestLine2}
                            </SvgText>
                          ) : null}
                          
                          {selectedSector.exp && (
                            <SvgText 
                              x={centerX} 
                              y={centerY - 10} 
                              fill={statusColor} 
                              fontSize={10.5} 
                              style={{ fontSize: 10.5 }} 
                              fontWeight="900" 
                              textAnchor="middle" 
                              letterSpacing={1}
                            >
                              EXPIRY: {selectedSector.exp}
                            </SvgText>
                          )}
                        </>
                      );
                    })()}

                    {/* TACTICAL HORIZON (Refined Symmetry) */}
                    <Line x1={centerX-20} y1={centerY+10} x2={centerX+20} y2={centerY+10} stroke="#475569" strokeWidth={1} />

                    {/* LOGISTICAL DECK (Refined Symmetry) */}
                    {selectedSector.brand && (
                      <SvgText x={centerX} y={centerY + 25} fill="#f8fafc" fontSize={11} style={{ fontSize: 11 }} fontWeight="900" textAnchor="middle" letterSpacing={1.5}>
                        {selectedSector.brand.toUpperCase()}
                      </SvgText>
                    )}
                    
                    {selectedSector.range && (
                      <SvgText x={centerX} y={centerY + 35} fill="#94a3b8" fontSize={7.5} style={{ fontSize: 7.5 }} fontWeight="bold" textAnchor="middle" letterSpacing={1.5}>
                        {selectedSector.range.toUpperCase()}
                      </SvgText>
                    )}

                    {selectedSector.intel && (
                      <SvgText 
                        x={centerX} 
                        y={centerY + 50} 
                        fill="#64748b" 
                        fontSize={7} 
                        style={{ fontSize: 7 }} 
                        fontWeight="bold"
                        fontStyle="italic" 
                        textAnchor="middle"
                        letterSpacing={1}
                      >
                        "{selectedSector.intel.toUpperCase()}"
                      </SvgText>
                    )}
                  </>
                ) : (
                  <>
                    <SvgText fill="#f8fafc" fontSize="6" fontWeight="bold" letterSpacing={2}>
                      <TextPath href="#hubArchTop" startOffset="50%" textAnchor="middle">
                        GLOBAL LOGISTICS OVERVIEW
                      </TextPath>
                    </SvgText>
                    <G y={centerY}>
                      <SvgText x={centerX} y={5} fill="#fbbf24" fontSize="18" fontWeight="900" textAnchor="middle">
                        {data.reduce((acc, cat) => acc + cat.total, 0)}
                      </SvgText>
                      <SvgText x={centerX} y={24} fill="#f8fafc" fontSize={10} style={{ fontSize: 10 }} fontWeight="bold" textAnchor="middle" letterSpacing={2}>
                        TOTAL ITEMS
                      </SvgText>
                    </G>
                  </>
                )}
              </G>
            </Svg>
          </View>
        </View>

        <View style={styles.disclaimerBox}>
          <MaterialCommunityIcons name="alert-decagram-outline" size={20} color="#64748b" />
          <Text style={styles.disclaimerText}>
            This view is a decoupled V1 prototype. It utilizes native SVG paths to render real-time stockpile intelligence.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 16, 
    paddingTop: 60, 
    paddingBottom: 20, 
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b'
  },
  headerTitle: { color: '#f8fafc', fontSize: 14, fontWeight: 'bold', letterSpacing: 1 },
  headerSub: { color: '#fbbf24', fontSize: 10, fontWeight: 'bold', marginTop: 2 },
  scroll: { flex: 1 },
  chartArea: { alignItems: 'center', paddingVertical: 40 },
  vizWrapper: { 
    backgroundColor: '#020617', 
    borderRadius: size, 
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15
  },
  hintText: { color: '#475569', fontSize: 10, fontWeight: 'bold', letterSpacing: 2, marginTop: 30 },
  disclaimerBox: { 
    margin: 20, 
    padding: 20, 
    backgroundColor: '#0f172a', 
    borderRadius: 12, 
    flexDirection: 'row', 
    gap: 12,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#334155'
  },
  disclaimerText: { color: '#64748b', fontSize: 11, lineHeight: 16, flex: 1 }
});
