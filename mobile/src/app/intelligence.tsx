import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Modal, Platform, LayoutAnimation } from 'react-native';
import Svg, { G, Path, Text as SvgText, Circle, Defs, TextPath, TSpan, Line, Rect } from 'react-native-svg';
import { useSQLiteContext } from 'expo-sqlite';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

// Tactical Starburst (Sunburst) Visualization V1
// Concept: Inner ring = Categories, Outer ring = Products
// Click a sector to drill into inventory details.
// This is a standalone "sandbox" file for V1 PoC.

const screenWidth = Dimensions.get('window').width;
const size = screenWidth - 40;
const radius = size / 2;
const centerX = radius;
const centerY = radius;
const hubRingR = radius * 0.48;
const catInnerR = radius * 0.60;
const catOuterR = radius * 0.72;
const prodOuterR = radius * 0.88;
const batchOuterR = radius;

const baseColors = ['#00f5ff', '#ff00ff', '#00ff7f', '#ff8c00']; // Cyan, Magenta, Spring, Autumn
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export default function IntelligenceScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { cabinetId } = useLocalSearchParams<{ cabinetId?: string }>();
  const [data, setData] = useState<any[]>([]);
  const [selectedSector, setSelectedSector] = useState<any>(null);
  const [contextName, setContextName] = useState('THE BUNKER');
  const [stats, setStats] = useState({ 
    categories: 0, products: 0, batches: 0, items: 0,
    urgent: 0, soon: 0, upcoming: 0, safe: 0
  });

  // Level tracking: 0: Hub, 1: Category, 2: Product, 3: Batch
  const [activeLevel, setActiveLevel] = useState(0);
  const [activeIndices, setActiveIndices] = useState({ cat: 0, type: 0, batch: 0 });
  const [isMagnified, setIsMagnified] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const now = new Date();
      const currentStamp = now.getFullYear() * 12 + (now.getMonth() + 1);

      // Fetch hierarchical data: Category -> ItemType -> Inventory Batches
      let query = `
        SELECT c.id as cat_id, c.name as cat_name,
               it.id as type_id, it.name as type_name, it.default_size as type_default_size, it.unit_type as type_unit,
               inv.id as inv_id, inv.quantity, inv.expiry_month, inv.expiry_year,
               COALESCE(inv.size, it.default_size) as resolved_raw_size,
               inv.size as bespoke_size, inv.supplier, inv.product_range, inv.batch_intel,
               cab.cabinet_type as cab_type, cab.name as cab_name
        FROM Categories c
        JOIN ItemTypes it ON c.id = it.category_id
        JOIN Inventory inv ON it.id = inv.item_type_id
        LEFT JOIN Cabinets cab ON inv.cabinet_id = cab.id
      `;
      
      const params: any[] = [];
      if (cabinetId) {
        query += ` WHERE inv.cabinet_id = ? `;
        params.push(cabinetId);
      }
      
      query += ` ORDER BY c.name, it.name, inv.expiry_year, inv.expiry_month `;
      
      const rows = await db.getAllAsync<any>(query, params);

      // Resolve context name
      if (cabinetId) {
        const cab = await db.getFirstAsync<any>('SELECT name FROM Cabinets WHERE id = ?', [cabinetId]);
        setContextName(cab?.name?.toUpperCase() || 'CABINET');
      } else {
        setContextName('THE BUNKER');
      }

      const categories: any = {};
      rows.forEach(row => {
        if (!categories[row.cat_id]) {
          categories[row.cat_id] = { id: row.cat_id, name: row.cat_name, types: {}, total: 0 };
        }
        if (!categories[row.cat_id].types[row.type_id]) {
          categories[row.cat_id].types[row.type_id] = { id: row.type_id, name: row.type_name, batches: [], total: 0 };
        }
        
        // Calculate Batch Color based on NEW triage definitions
        let batchColor = '#22c55e'; // Green (Safe)
        if (row.expiry_year && row.expiry_month) {
          const expStamp = row.expiry_year * 12 + row.expiry_month;
          const remaining = expStamp - currentStamp;
          if (remaining <= 0) batchColor = '#f43f5e'; // Red (Urgent: This month & Prior)
          else if (remaining <= 3) batchColor = '#f97316'; // Orange (Soon: 1-3M)
          else if (remaining <= 6) batchColor = '#fde047'; // Yellow (Upcoming: 4-6M)
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
          exp: formattedExp,
          exp_month: row.expiry_month,
          exp_year: row.expiry_year
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

      const totalCategories = finalData.length;
      const totalProducts = finalData.reduce((acc, cat) => acc + (cat.types?.length || 0), 0);
      const totalBatches = finalData.reduce((acc, cat) => 
        acc + cat.types.reduce((tAcc: number, t: any) => tAcc + (t.batches?.length || 0), 0), 0
      );
      const totalItems = finalData.reduce((acc, cat) => acc + (cat.total || 0), 0);

      // Calculate Triage Tiers (Full Spectrum)
      let urgentCount = 0;   // Red: This month & prior
      let soonCount = 0;     // Orange: 1-3 months
      let upcomingCount = 0; // Yellow: 4-6 months
      let safeCount = 0;     // Green: 7+ months
      
      finalData.forEach(cat => {
        cat.types.forEach((type: any) => {
          type.batches.forEach((batch: any) => {
            if (batch.exp_year && batch.exp_month) {
              const stamp = batch.exp_year * 12 + batch.exp_month;
              const remaining = stamp - currentStamp;
              if (remaining <= 0) urgentCount++;
              else if (remaining >= 1 && remaining <= 3) soonCount++;
              else if (remaining >= 4 && remaining <= 6) upcomingCount++;
              else if (remaining >= 7) safeCount++;
            }
          });
        });
      });

      setData(finalData);
      setStats({
        categories: totalCategories,
        products: totalProducts,
        batches: totalBatches,
        items: totalItems,
        urgent: urgentCount,
        soon: soonCount,
        upcoming: upcomingCount,
        safe: safeCount
      });
    } catch (err) {
      console.error('Failed to load starburst data:', err);
    }
  }, [db, cabinetId]);

  const handleNav = (dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'RESET') => {
    if (!data.length) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);

    if (dir === 'RESET') {
      setActiveLevel(0);
      setSelectedSector(null);
      return;
    }

    if (dir === 'UP') {
      if (activeLevel < 3) setActiveLevel(prev => prev + 1);
    } else if (dir === 'DOWN') {
      if (activeLevel > 0) setActiveLevel(prev => prev - 1);
    } else if (dir === 'LEFT' || dir === 'RIGHT') {
      const move = dir === 'RIGHT' ? 1 : -1;
      if (activeLevel === 1) {
        let next = activeIndices.cat + move;
        if (next < 0) next = data.length - 1;
        if (next >= data.length) next = 0;
        setActiveIndices({ ...activeIndices, cat: next, type: 0, batch: 0 });
      } else if (activeLevel === 2) {
        let nextCat = activeIndices.cat;
        let nextType = activeIndices.type + move;
        const types = data[nextCat]?.types || [];

        if (nextType < 0) {
          nextCat = nextCat - 1 < 0 ? data.length - 1 : nextCat - 1;
          nextType = Math.max(0, (data[nextCat]?.types?.length || 1) - 1);
        } else if (nextType >= types.length) {
          nextCat = nextCat + 1 >= data.length ? 0 : nextCat + 1;
          nextType = 0;
        }
        setActiveIndices({ cat: nextCat, type: nextType, batch: 0 });
      } else if (activeLevel === 3) {
        let nextCat = activeIndices.cat;
        let nextType = activeIndices.type;
        let nextBatch = activeIndices.batch + move;
        const batches = data[nextCat]?.types[nextType]?.batches || [];

        if (nextBatch < 0) {
          nextType = nextType - 1;
          if (nextType < 0) {
            nextCat = nextCat - 1 < 0 ? data.length - 1 : nextCat - 1;
            nextType = Math.max(0, (data[nextCat]?.types?.length || 1) - 1);
          }
          nextBatch = Math.max(0, (data[nextCat]?.types[nextType]?.batches?.length || 1) - 1);
        } else if (nextBatch >= batches.length) {
          nextType = nextType + 1;
          const currentTypes = data[nextCat]?.types || [];
          if (nextType >= currentTypes.length) {
            nextCat = nextCat + 1 >= data.length ? 0 : nextCat + 1;
            nextType = 0;
          }
          nextBatch = 0;
        }
        setActiveIndices({ cat: nextCat, type: nextType, batch: nextBatch });
      }
    }
  };

  // Sync selectedSector for the Hub display
  useEffect(() => {
    if (activeLevel === 0) {
      setSelectedSector(null);
    } else if (activeLevel === 1) {
      const cat = data[activeIndices.cat];
      if (cat) setSelectedSector({ type: 'category', color: baseColors[activeIndices.cat % 4], ...cat });
    } else if (activeLevel === 2) {
      const cat = data[activeIndices.cat];
      const type = cat?.types[activeIndices.type];
      if (type) setSelectedSector({ type: 'item_type', cat_id: cat.id, color: baseColors[activeIndices.cat % 4], ...type });
    } else if (activeLevel === 3) {
      const cat = data[activeIndices.cat];
      const type = cat?.types[activeIndices.type];
      const batch = type?.batches[activeIndices.batch];
      if (batch) setSelectedSector({ type: 'batch', cat_id: cat.id, item_type_id: type.id, parent_name: type.name, color: batch.color, catColor: baseColors[activeIndices.cat % 4], ...batch });
    }
  }, [activeLevel, activeIndices, data]);

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

  const isZoomed = activeLevel > 0;

  const renderChart = () => {
    const totalQty = data.reduce((sum, cat) => sum + cat.total, 0);
    if (totalQty === 0) return null;

    let currentAngle = -Math.PI / 2; // Start at top
    

    const sectors: any[] = [];

    data.forEach((cat, catIdx) => {
      const catLetter = alphabet[catIdx % 26];
      const catAngleSize = (cat.total / totalQty) * 2 * Math.PI;
      const catEndAngle = currentAngle + catAngleSize;
      
      const baseColor = baseColors[catIdx % 4];
      const isCatSelected = selectedSector?.type === 'category' && selectedSector.id === cat.id;

      const isCatActive = (activeLevel >= 1 && activeIndices.cat === catIdx);
      const catOpacity = (!activeLevel || isCatActive) ? 1 : 0.15;

      // 1. INNER RING: Categories
      sectors.push(
        <G key={`cat-g-${cat.id}`}>
          <Path
            d={getArcPath(currentAngle, catEndAngle, catInnerR, catOuterR)}
            fill={baseColor}
            stroke={(isCatActive && activeLevel === 1) ? "#ffffff" : "#0a0a0a"}
            strokeWidth={(isCatActive && activeLevel === 1) ? 2 : 1}
            opacity={catOpacity}
            onPress={() => {
              setActiveLevel(1);
              setActiveIndices({ cat: catIdx, type: 0, batch: 0 });
            }}
          />
        </G>
      );

      // 2. MIDDLE RING: Products (Thick)
      let typeAngle = currentAngle;
      cat.types.forEach((type: any, typeIdx: number) => {
        const typeLetter = `${catLetter}${typeIdx + 1}`;
        const typeAngleSize = (type.total / cat.total) * catAngleSize;
        const typeEndAngle = typeAngle + typeAngleSize;
        const isTypeSelected = selectedSector?.type === 'item_type' && selectedSector.id === type.id;

        const isTypeActive = (activeLevel >= 2 && activeIndices.cat === catIdx && activeIndices.type === typeIdx);
        // Bright if: Level 0, or (Level 1 and in this cat), or this is the active type
        const typeOpacity = (!activeLevel || (activeLevel === 1 && isCatActive) || isTypeActive) ? 1 : 0.15;

        sectors.push(
          <G key={`type-g-${type.id}`}>
            <Path
              d={getArcPath(typeAngle, typeEndAngle, catOuterR + 2, prodOuterR)}
              fill={baseColor}
              opacity={typeOpacity}
              stroke={(isTypeActive && activeLevel === 2) ? "#ffffff" : "#0a0a0a"}
              strokeWidth={(isTypeActive && activeLevel === 2) ? 2 : 1}
              onPress={() => {
                setActiveLevel(2);
                setActiveIndices({ cat: catIdx, type: typeIdx, batch: 0 });
              }}
            />
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
          const isBatchActive = (activeLevel === 3 && activeIndices.cat === catIdx && activeIndices.type === typeIdx && activeIndices.batch === bIdx);
          // Bright if: Level 0, or (Level 1 and in this cat), or (Level 2 and in this type), or this is the active batch
          const batchOpacity = (!activeLevel || (activeLevel === 1 && isCatActive) || (activeLevel === 2 && isTypeActive) || isBatchActive) ? 1 : 0.15;
          
          const hasExpiry = batch.exp && batch.exp.trim() !== '' && batch.exp.toUpperCase() !== 'NO EXPIRY';
          const batchDisplayColor = hasExpiry ? batch.color : '#64748b';
          
          const pips: any[] = [];
          // Cap pips at 12 to maintain legibility. Above that, use a solid bar.
          const showPips = batch.qty > 0 && batch.qty <= 12;

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
                  d={getArcPath(pStart, safeEnd, prodOuterR + 2, batchOuterR)}
                  fill={batchDisplayColor}
                  stroke="#0a0a0a"
                  strokeWidth={0.5}
                  opacity={batchOpacity}
                />
              );
            }
          } else {
            pips.push(
              <Path
                key={`batch-${batch.id}-solid`}
                d={getArcPath(batchAngle, batchEndAngle, prodOuterR + 2, batchOuterR)}
                fill={batchDisplayColor}
                stroke="#0a0a0a"
                strokeWidth={0.5}
                opacity={batchOpacity}
              />
            );
          }

          sectors.push(
            <G 
              key={`batch-group-${batch.id}`}
              onPress={() => {
                setActiveLevel(3);
                setActiveIndices({ cat: catIdx, type: typeIdx, batch: bIdx });
                setSelectedSector({ type: 'batch', cat_id: cat.id, parent_name: type.name, color: batch.color, catColor: baseColor, ...batch });
              }}
            >
              {pips}
              <Path
                d={getArcPath(batchAngle, batchEndAngle, prodOuterR + 2, batchOuterR)}
                fill="transparent"
                stroke={isBatchActive ? "#ffffff" : "transparent"}
                strokeWidth={isBatchActive ? 2 : 0}
                pointerEvents="box-none"
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={32} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>STOCK INTELLIGENCE</Text>
          <Text style={styles.headerSub}>EAGLE-EYES VIEW</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* The Visualization */}
        <View style={styles.chartArea}>
          <View style={styles.vizWrapper}>
            <Svg 
              width={size} 
              height={size} 
              viewBox={`0 0 ${size} ${size}`}
              style={{ transform: [{ scale: isMagnified ? 1.6 : 1 }] }}
            >
              <Defs>
                {/* Top Arch: 0.50 radius, Clockwise L-to-R (Right-side up) */}
                <Path id="hubArchTop" d={`M ${centerX - radius * 0.50} ${centerY} A ${radius * 0.50} ${radius * 0.50} 0 0 1 ${centerX + radius * 0.50} ${centerY}`} fill="none" />
                {/* Bottom Arch: 0.52 radius, Counter-Clockwise L-to-R (Right-side up) */}
                <Path id="hubArchBottom" d={`M ${centerX - radius * 0.52} ${centerY} A ${radius * 0.52} ${radius * 0.52} 0 0 0 ${centerX + radius * 0.52} ${centerY}`} fill="none" />
              </Defs>

              {renderChart()}
              
              {/* CENTRAL SCANNER HUB */}
              <Circle 
                cx={centerX} 
                cy={centerY} 
                r={hubRingR} 
                fill="#020617" 
                stroke={selectedSector ? baseColors[activeIndices.cat % 4] : '#1e293b'}
                strokeWidth={2}
                onPress={() => setIsMagnified(prev => !prev)}
              />

                {selectedSector ? (() => {
                    const statusColor = selectedSector.color || baseColors[0];
                    const capR = radius * 0.40;
                    const chordY = -25;
                    const chordX = Math.sqrt(Math.pow(capR, 2) - Math.pow(chordY, 2));
                    const capPath = `M ${centerX - chordX} ${centerY + chordY} A ${capR} ${capR} 0 0 1 ${centerX + chordX} ${centerY + chordY} Z`;

                    return (
                      <>
                          <Path d={capPath} fill={statusColor} />

                        <G pointerEvents="none">
                          {/* TOP ORBIT: CONTEXT (Dominant Identity) */}
                          <SvgText fill="#f8fafc" fontSize={11} style={{ fontSize: 11 }} fontWeight="500" letterSpacing={2.5}>
                            <TextPath href="#hubArchTop" startOffset="50%" textAnchor="middle">
                              <TSpan dy={-4} textAnchor="middle">
                                {selectedSector.type === 'category' ? 'CATEGORY INTEL' : 
                                 selectedSector.type === 'item_type' ? 'PRODUCT INTEL' : 'BATCH INTEL'}
                              </TSpan>
                            </TextPath>
                          </SvgText>

                          {/* BOTTOM ORBIT: IDENTITY (Categorical Anchor) */}
                          <SvgText fill={selectedSector.catColor || selectedSector.color || "#fbbf24"} fontSize={12} style={{ fontSize: 12 }} fontWeight="900" letterSpacing={2}>
                            <TextPath href="#hubArchBottom" startOffset="50%" textAnchor="middle">
                              <TSpan dy={8} textAnchor="middle">
                                {(selectedSector.parent_name || selectedSector.name).toUpperCase()}
                              </TSpan>
                            </TextPath>
                          </SvgText>

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

                          {/* MANIFEST TELEMETRY (Restored to SVG) */}
                          {(() => {
                              let m1 = "";
                              let m2 = "";
                              
                              if (selectedSector.type === 'batch') {
                                const q = selectedSector.qty || 0;
                                const s = (selectedSector.size || "").toUpperCase();
                                m1 = s ? `${q} X ${s}` : (q === 1 ? '1 ITEM' : `${q} ITEMS`);
                              } else if (selectedSector.type === 'item_type') {
                                const q = selectedSector.total || 0;
                                const b = selectedSector.batches?.length || 0;
                                m1 = q === 1 ? '1 ITEM' : `${q} ITEMS`;
                                m2 = `ACROSS ${b} ${b === 1 ? 'BATCH' : 'BATCHES'}`;
                              } else if (selectedSector.type === 'category') {
                                const pCount = selectedSector.types?.length || 0;
                                const bCount = selectedSector.types?.reduce((sum: number, t: any) => sum + (t.batches?.length || 0), 0) || 0;
                                m1 = bCount === 1 ? '1 BATCH' : `${bCount} BATCHES`;
                                m2 = `ACROSS ${pCount} ${pCount === 1 ? 'PRODUCT' : 'PRODUCTS'}`;
                              }

                              if (!m1) return null;

                              const textY = selectedSector.type === 'batch' ? centerY - 38 : centerY - 43;

                              return (
                                <G>
                                  <SvgText x={centerX} y={textY} fill="#000" fontSize={13} fontWeight="900" textAnchor="middle">
                                    {m1.trim().toUpperCase()}
                                  </SvgText>
                                  {m2 ? (
                                    <SvgText x={centerX} y={textY + 14} fill="#000" fontSize={10} fontWeight="900" textAnchor="middle">
                                      {m2.trim().toUpperCase()}
                                    </SvgText>
                                  ) : null}
                                  {selectedSector.type === 'batch' && selectedSector.exp && (
                                    <SvgText 
                                      x={centerX}
                                      y={centerY - 6} 
                                      fill={selectedSector.color || '#fbbf24'} 
                                      fontSize={12} 
                                      fontWeight="900" 
                                      textAnchor="middle"
                                    >
                                      {'EXPIRY: ' + selectedSector.exp.trim().toUpperCase()}
                                    </SvgText>
                                  )}
                                </G>
                              );
                          })()}
                        </G>
                      </>
                    );
                })() : (
                  <>
                    <SvgText fill="#f8fafc" fontSize={11} style={{ fontSize: 11 }} fontWeight="500" letterSpacing={2.5} textAnchor="middle">
                      <TextPath href="#hubArchTop" startOffset="50%" textAnchor="middle" dominantBaseline="middle">
                        <TSpan dy={-4} textAnchor="middle">CABINET INTEL</TSpan>
                      </TextPath>
                    </SvgText>

                    <SvgText fill="#fbbf24" fontSize={11} style={{ fontSize: 11 }} fontWeight="900" letterSpacing={2} textAnchor="middle">
                      <TextPath href="#hubArchBottom" startOffset="50%" textAnchor="middle">
                        <TSpan dy={8} textAnchor="middle">{contextName}</TSpan>
                      </TextPath>
                    </SvgText>

                    <G y={centerY}>
                      {/* T1: READINESS TRIPTYCH BAR (Header) */}
                      <G y={-38}>
                        <SvgText x={centerX} y={-12} fill="#94a3b8" fontSize={8} fontWeight="bold" textAnchor="middle" letterSpacing={1.5}>EXPIRY STATS</SvgText>
                        
                        {/* Full Spectrum Readiness Bar (4 Segments) */}
                        <Rect x={centerX - 55} y={-8} width={26} height={13} fill="#f43f5e" rx={2} />
                        <Rect x={centerX - 27} y={-8} width={26} height={13} fill="#f97316" rx={2} />
                        <Rect x={centerX + 1} y={-8} width={26} height={13} fill="#fde047" rx={2} />
                        <Rect x={centerX + 29} y={-8} width={26} height={13} fill="#22c55e" rx={2} />
                        
                        {/* Numbers (Inside Bar) */}
                        <SvgText x={centerX - 42} y={2} fill="#ffffff" fontSize={10} fontWeight="900" textAnchor="middle">{stats.urgent}</SvgText>
                        <SvgText x={centerX - 14} y={2} fill="#ffffff" fontSize={10} fontWeight="900" textAnchor="middle">{stats.soon}</SvgText>
                        <SvgText x={centerX + 14} y={2} fill="#0f172a" fontSize={10} fontWeight="900" textAnchor="middle">{stats.upcoming}</SvgText>
                        <SvgText x={centerX + 42} y={2} fill="#ffffff" fontSize={10} fontWeight="900" textAnchor="middle">{stats.safe}</SvgText>

                        {/* Labels (Under Segments) */}
                        <SvgText x={centerX - 42} y={14} fill="#94a3b8" fontSize={7} fontWeight="bold" textAnchor="middle" letterSpacing={0.5}>NOW</SvgText>
                        <SvgText x={centerX - 14} y={14} fill="#94a3b8" fontSize={7} fontWeight="bold" textAnchor="middle" letterSpacing={0.5}>1-3M</SvgText>
                        <SvgText x={centerX + 14} y={14} fill="#94a3b8" fontSize={7} fontWeight="bold" textAnchor="middle" letterSpacing={0.5}>4-6M</SvgText>
                        <SvgText x={centerX + 42} y={14} fill="#94a3b8" fontSize={7} fontWeight="bold" textAnchor="middle" letterSpacing={0.5}>7M+</SvgText>
                      </G>

                      {/* T2: STRATEGIC LOGISTICS (Center Grid) */}
                      <G y={0}>
                        <G x={centerX - 34}>
                          <SvgText x={0} y={0} fill="#fbbf24" fontSize={24} fontWeight="900" textAnchor="middle">{stats.categories}</SvgText>
                          <SvgText x={0} y={10} fill="#94a3b8" fontSize={7} fontWeight="bold" textAnchor="middle" letterSpacing={1.5}>CATEGORIES</SvgText>
                        </G>
                        <G x={centerX + 35}>
                          <SvgText x={0} y={0} fill="#fbbf24" fontSize={24} fontWeight="900" textAnchor="middle">{stats.products}</SvgText>
                          <SvgText x={0} y={10} fill="#94a3b8" fontSize={7} fontWeight="bold" textAnchor="middle" letterSpacing={1.5}>PRODUCTS</SvgText>
                        </G>
                      </G>

                      {/* T3: PHYSICAL INVENTORY (Center Grid) */}
                      <G y={38}>
                        <G x={centerX - 34}>
                          <SvgText x={0} y={0} fill="#fbbf24" fontSize={24} fontWeight="900" textAnchor="middle">{stats.batches}</SvgText>
                          <SvgText x={0} y={10} fill="#94a3b8" fontSize={7} fontWeight="bold" textAnchor="middle" letterSpacing={1.5}>BATCHES</SvgText>
                        </G>
                        <G x={centerX + 35}>
                          <SvgText x={0} y={0} fill="#fbbf24" fontSize={24} fontWeight="900" textAnchor="middle">{stats.items}</SvgText>
                          <SvgText x={0} y={10} fill="#94a3b8" fontSize={7} fontWeight="bold" textAnchor="middle" letterSpacing={1.5}>ITEMS</SvgText>
                        </G>
                      </G>
                    </G>
                  </>
                )}
            </Svg>
          </View>
        </View>

        {/* Tactile Command Pad (220px) */}
        <View style={styles.joystickWrapper}>
          <View style={styles.joystickBase}>
            {/* Outer ring for the base */}
            <View style={styles.joystickOuterRing} />
            
            <TouchableOpacity style={[styles.joyBtn, styles.joyUp]} onPress={() => handleNav('UP')}>
              <MaterialCommunityIcons name="chevron-up" size={44} color="#fbbf24" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.joyBtn, styles.joyDown]} onPress={() => handleNav('DOWN')}>
              <MaterialCommunityIcons name="chevron-down" size={44} color="#fbbf24" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.joyBtn, styles.joyLeft]} onPress={() => handleNav('LEFT')}>
              <MaterialCommunityIcons name="chevron-left" size={44} color="#fbbf24" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.joyBtn, styles.joyRight]} onPress={() => handleNav('RIGHT')}>
              <MaterialCommunityIcons name="chevron-right" size={44} color="#fbbf24" />
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.joyCenter} onPress={() => handleNav('RESET')}>
              <MaterialCommunityIcons name="target-variant" size={32} color="#fbbf24" />
              <Text style={styles.resetText}>RESET</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.joystickLabel}>TACTICAL NAVIGATION</Text>
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
    width: size,
    height: size,
    backgroundColor: '#020617', 
    borderRadius: size / 2, 
    overflow: 'hidden',
    alignSelf: 'center',
    position: 'relative'
  },
  joystickWrapper: { alignItems: 'center', marginTop: -20, marginBottom: 40 },
  joystickBase: { width: 220, height: 220, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  joystickOuterRing: { position: 'absolute', width: 220, height: 220, borderRadius: 110, borderWidth: 1, borderColor: 'rgba(148, 163, 184, 0.15)' },
  joyBtn: { position: 'absolute', width: 64, height: 64, borderRadius: 32, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1e293b' },
  joyUp: { top: 0 },
  joyDown: { bottom: 0 },
  joyLeft: { left: 0 },
  joyRight: { right: 0 },
  joyCenter: { width: 84, height: 84, backgroundColor: '#020617', borderRadius: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fbbf2444' },
  resetText: { color: '#fbbf24', fontSize: 9, fontWeight: '900', marginTop: 2 },
  joystickLabel: { color: '#475569', fontSize: 9, fontWeight: 'bold', letterSpacing: 2, marginTop: 12 },
});
