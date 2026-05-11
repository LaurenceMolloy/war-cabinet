import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, LayoutAnimation, Modal } from 'react-native';
import Svg, { G, Path, Text as SvgText, Circle, Defs, TextPath, TSpan, Line, Rect, Image as SvgImage, ClipPath, LinearGradient, Stop } from 'react-native-svg';
import { Database } from '../database';
import { useSQLiteContext } from 'expo-sqlite';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

// Tactical Starburst (Sunburst) Visualization V1
// Concept: Inner ring = Categories, Outer ring = Products
// Click a sector to drill into inventory details.
// This is a standalone "sandbox" file for V1 PoC.

const screenWidth = Dimensions.get('window').width;
const IS_WEB = typeof window !== 'undefined' && (window as any).navigator?.userAgent?.includes('Html'); // Simple check for web platform
const size = Math.min(screenWidth - 40, 500); 
const radius = size / 2;
const centerX = radius;
const centerY = radius;
const hubRingR = radius * 0.52;
const catInnerR = radius * 0.66;
const catOuterR = radius * 0.72;
const prodOuterR = radius * 0.88;
const batchOuterR = radius;

// Font scaling helper to keep text proportional to the radar size
const fs = (base: number) => (base / 350) * size; 


// Rainbow colormap helpers — category ring only (intelligence.tsx)
const hslToHex = (h: number, s: number, l: number): string => {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
};
const getRainbowColor = (index: number, total: number): string => {
  const h = (index / Math.max(total, 1)) * 300; // red (0°) → violet (300°)
  return hslToHex(h, 80, 65);
};

export default function IntelligenceScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { cabinetId: initialCabinetId } = useLocalSearchParams<{ cabinetId?: string }>();
  const [activeCabinetId, setActiveCabinetId] = useState<string | undefined>(initialCabinetId);
  const [cabinets, setCabinets] = useState<any[]>([]);
  const [showCabinetSelector, setShowCabinetSelector] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [selectedSector, setSelectedSector] = useState<any>(null);
  const [contextName, setContextName] = useState('THE BUNKER');
  const [stats, setStats] = useState({ 
    categories: 0, products: 0, batches: 0, items: 0,
    expired: 0, urgent: 0, soon: 0, upcoming: 0
  });

  // Level tracking: 0: Hub, 1: Category, 2: Product, 3: Batch
  const [activeLevel, setActiveLevel] = useState(0);
  const [activeIndices, setActiveIndices] = useState({ cat: 0, type: 0, batch: 0 });
  const [isMagnified, setIsMagnified] = useState(false);
  const [readinessMap, setReadinessMap] = useState<Map<number, string>>(new Map());
  const trackingBatchIdRef = useRef<number | null>(null);

  useEffect(() => {
    const loadCabinets = async () => {
      try {
        const rows = await Database.Cabinets.getBasicList(db);
        setCabinets(rows);
      } catch (err) {
        console.error('Failed to load cabinets:', err);
      }
    };
    loadCabinets();
  }, [db]);

  const loadData = useCallback(async () => {
    try {
      const now = new Date();
      const currentStamp = now.getFullYear() * 12 + (now.getMonth() + 1);

      const finalData = await Database.Views.getStarburstHierarchy(db, activeCabinetId);

      // Resolve context name
      if (activeCabinetId) {
        const cabName = await Database.Cabinets.getName(db, activeCabinetId);
        setContextName(cabName?.toUpperCase() || 'CABINET');
      } else {
        setContextName('THE BUNKER');
      }

      const totalCategories = finalData.length;
      const totalProducts = finalData.reduce((acc, cat) => acc + (cat.types?.length || 0), 0);
      const totalBatches = finalData.reduce((acc, cat) => 
        acc + cat.types.reduce((tAcc: number, t: any) => tAcc + (t.batches?.length || 0), 0), 0
      );
      const totalItems = finalData.reduce((acc, cat) => acc + (cat.total || 0), 0);

      // Calculate Triage Tiers (Full Spectrum)
      let expiredCount = 0;  // Deep Red: Expired
      let urgentCount = 0;   // Red: This month
      let soonCount = 0;     // Orange: 1-3 months
      let upcomingCount = 0; // Yellow: 4-6 months
      
      finalData.forEach(cat => {
        cat.types.forEach((type: any) => {
          type.batches.forEach((batch: any) => {
            if (batch.exp_year && batch.exp_month) {
              const stamp = batch.exp_year * 12 + batch.exp_month;
              const remaining = stamp - currentStamp;
              if (remaining < 0) expiredCount++;
              else if (remaining === 0) urgentCount++;
              else if (remaining >= 1 && remaining <= 3) soonCount++;
              else if (remaining >= 4 && remaining <= 6) upcomingCount++;
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
        expired: expiredCount,
        urgent: urgentCount,
        soon: soonCount,
        upcoming: upcomingCount
      });

      // Fetch readiness colour map from DAL (trial vehicle — ReadinessCommandView unchanged)
      const rmap = await Database.ItemTypes.getStockReadinessMap(db);
      setReadinessMap(rmap);

      // Restore batch selection if we pivoted via cabinet shortcut
      if (trackingBatchIdRef.current !== null) {
        const targetId = trackingBatchIdRef.current;
        let found = false;
        for (let c = 0; c < finalData.length; c++) {
          for (let t = 0; t < finalData[c].types.length; t++) {
            for (let b = 0; b < finalData[c].types[t].batches.length; b++) {
              if (finalData[c].types[t].batches[b].id === targetId) {
                setActiveIndices({ cat: c, type: t, batch: b });
                found = true;
                break;
              }
            }
            if (found) break;
          }
          if (found) break;
        }
        trackingBatchIdRef.current = null;
      }
    } catch (err) {
      console.error('Failed to load starburst data:', err);
    }
  }, [db, activeCabinetId]);

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
      if (cat) setSelectedSector({ type: 'category', color: getRainbowColor(activeIndices.cat, data.length), ...cat });
    } else if (activeLevel === 2) {
      const cat = data[activeIndices.cat];
      const type = cat?.types[activeIndices.type];
      if (type) setSelectedSector({ type: 'item_type', cat_id: cat.id, color: getRainbowColor(activeIndices.cat, data.length), ...type });
    } else if (activeLevel === 3) {
      const cat = data[activeIndices.cat];
      const type = cat?.types[activeIndices.type];
      const batch = type?.batches[activeIndices.batch];
      if (batch) setSelectedSector({ type: 'batch', cat_id: cat.id, item_type_id: type.id, parent_name: type.name, color: batch.color, catColor: getRainbowColor(activeIndices.cat, data.length), ...batch });
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
    // SVG arcs cannot draw a full 360 degree circle (start and end points are identical).
    // If it's a full circle, reduce the end angle by a tiny fraction to force rendering.
    if (endAngle - startAngle >= 2 * Math.PI - 0.0001) {
      endAngle = startAngle + 2 * Math.PI - 0.0001;
    }

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
    const totalWeight = data.reduce((sum, cat) => sum + (cat.weight || 0), 0);
    if (totalWeight === 0) return null;

    let currentAngle = -Math.PI / 2; // Start at top
    

    const sectors: any[] = [];
    const activeHighlights: any[] = [];

    data.forEach((cat, catIdx) => {
      const catAngleSize = (cat.weight / totalWeight) * 2 * Math.PI;
      const catEndAngle = currentAngle + catAngleSize;
      
      const baseColor = getRainbowColor(catIdx, data.length);
      const isCatActive = (activeLevel >= 1 && activeIndices.cat === catIdx);
      const catOpacity = (!activeLevel || isCatActive) ? 1 : 0.15;

      // 1. INNER RING: Categories
      sectors.push(
        <G key={`cat-g-${cat.id}`}>
          <Path
            d={getArcPath(currentAngle, catEndAngle, catInnerR, catOuterR)}
            fill={baseColor}
            stroke="#0a0a0a"
            strokeWidth={1.5}
            opacity={catOpacity}
            onPress={() => {
              setActiveLevel(1);
              setActiveIndices({ cat: catIdx, type: 0, batch: 0 });
            }}
          />
        </G>
      );

      if (isCatActive && activeLevel === 1) {
        activeHighlights.push(
          <Path
            key={`cat-active-${cat.id}`}
            d={getArcPath(currentAngle, catEndAngle, catInnerR, catOuterR)}
            fill="transparent"
            stroke="#ffffff"
            strokeWidth={2}
            pointerEvents="none"
          />
        );
      }

      // 2. MIDDLE RING: Products (Thick)
      let typeAngle = currentAngle;
      cat.types.forEach((type: any, typeIdx: number) => {
        const typeAngleSize = (type.weight / cat.weight) * catAngleSize;
        const typeEndAngle = typeAngle + typeAngleSize;
        const isTypeActive = (activeLevel >= 2 && activeIndices.cat === catIdx && activeIndices.type === typeIdx);
        // Bright if: Level 0, or (Level 1 and in this cat), or this is the active type
        const typeOpacity = (!activeLevel || (activeLevel === 1 && isCatActive) || isTypeActive) ? 1 : 0.15;


        const typeReadinessColor = readinessMap.get(type.id) ?? '#64748b';

        sectors.push(
          <G key={`type-g-${type.id}`}>
            <Path
              d={getArcPath(typeAngle, typeEndAngle, catOuterR + 2, prodOuterR)}
              fill={typeReadinessColor}
              opacity={typeOpacity}
              stroke="none"
            />
            <Path
              d={getArcPath(typeAngle, typeEndAngle, catOuterR + 2, prodOuterR)}
              fill="transparent"
              stroke="#0a0a0a"
              strokeWidth={1.5}
              onPress={() => {
                setActiveLevel(2);
                setActiveIndices({ cat: catIdx, type: typeIdx, batch: 0 });
              }}
            />
          </G>
        );

        if (isTypeActive && activeLevel === 2) {
          activeHighlights.push(
            <Path
              key={`type-active-${type.id}`}
              d={getArcPath(typeAngle, typeEndAngle, catOuterR + 2, prodOuterR)}
              fill="transparent"
              stroke="#ffffff"
              strokeWidth={2}
              pointerEvents="none"
            />
          );
        }

        // 3. OUTER RING: Batches (Volume-Weighted Pips)
        const pixelGap = 5;
        const gapAngle = pixelGap / radius; 
        
        const clusterGap = gapAngle;
        let batchAngle = typeAngle + (clusterGap / 2);
        const availableBatchSpace = typeAngleSize - (type.batches.length * gapAngle);

        type.batches.forEach((batch: any, bIdx: number) => {
          const batchAngleSize = (batch.weight / type.weight) * availableBatchSpace;
          
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
            
            if (pipAngleSize <= 0) {
              // Fallback: not enough space for gaps, render as a single solid block
              const minAngle = 1.5 / batchOuterR; // minimum 1.5px physical width
              const renderAngle = Math.max(batchAngleSize, minAngle);
              const pw = renderAngle * batchOuterR;

              pips.push(
                <Path
                  key={`batch-${batch.id}-solid-fallback`}
                  d={getArcPath(batchAngle, batchAngle + renderAngle, prodOuterR + 2, batchOuterR)}
                  fill={batchDisplayColor}
                  stroke="#0a0a0a"
                  strokeWidth={pw < 2.0 ? 0 : 0.5}
                  opacity={batchOpacity}
                />
              );
            } else {
              for (let i = 0; i < batch.qty; i++) {
                const pStart = batchAngle + i * (pipAngleSize + gapAngle);
                let pEnd = pStart + pipAngleSize;
                let safeEnd = Math.min(pEnd, batchEndAngle);
                
                // Enforce a minimum physical width for visibility
                let pipW = (safeEnd - pStart) * batchOuterR;
                if (pipW < 1.0) {
                  safeEnd = pStart + (1.0 / batchOuterR);
                  pipW = 1.0;
                }

                pips.push(
                  <Path
                    key={`batch-${batch.id}-pip-${i}`}
                    d={getArcPath(pStart, safeEnd, prodOuterR + 2, batchOuterR)}
                    fill={batchDisplayColor}
                    stroke="#0a0a0a"
                    strokeWidth={pipW < 2.0 ? 0 : 0.5}
                    opacity={batchOpacity}
                  />
                );
              }
            }
          } else {
            const minAngle = 1.5 / batchOuterR; // minimum 1.5px physical width
            const renderAngle = Math.max(batchAngleSize, minAngle);
            const pw = renderAngle * batchOuterR;

            pips.push(
              <Path
                key={`batch-${batch.id}-solid`}
                d={getArcPath(batchAngle, batchAngle + renderAngle, prodOuterR + 2, batchOuterR)}
                fill={batchDisplayColor}
                stroke="#0a0a0a"
                strokeWidth={pw < 2.0 ? 0 : 0.5}
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

    return [...sectors, ...activeHighlights];
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={32} color="#fff" />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.headerSub, { marginBottom: 6 }]}>ACTIVE SCAN TARGET</Text>
          <TouchableOpacity style={styles.targetPill} onPress={() => setShowCabinetSelector(true)}>
            <MaterialCommunityIcons name="radar" size={14} color="#fbbf24" />
            <Text style={styles.targetPillText}>{contextName}</Text>
            <MaterialCommunityIcons name="chevron-down" size={16} color="#94a3b8" />
          </TouchableOpacity>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* The Visualization */}
        <View style={styles.chartArea}>
          <View style={styles.vizWrapper}>

            {/* ── METRIC CIRCLES (Level 1: Category, Level 2: Product, Level 3: Batch) ── */}
            {(activeLevel === 1 || activeLevel === 2 || activeLevel === 3) && selectedSector && (() => {
              const catColor = getRainbowColor(activeIndices.cat, data.length);
              const cat = data[activeIndices.cat];

              let leftLabel = '';
              let leftValue: string | number = 0;
              let rightLabel = '';
              let rightValue: string | number = 0;

              if (activeLevel === 1 && cat) {
                leftLabel = 'BATCHES';
                leftValue = cat.types?.reduce((sum: number, t: any) => sum + (t.batches?.length || 0), 0) || 0;
                rightLabel = 'PRODUCTS';
                rightValue = cat.types?.length || 0;
              } else if (activeLevel === 2 && cat) {
                const type = cat.types?.[activeIndices.type];
                leftLabel = 'ITEMS';
                leftValue = type?.total || 0;
                rightLabel = 'BATCHES';
                rightValue = type?.batches?.length || 0;
              } else if (activeLevel === 3 && cat) {
                const type = cat.types?.[activeIndices.type];
                const batch = type?.batches?.[activeIndices.batch];
                leftLabel = 'ITEMS';
                leftValue = batch?.qty || 0;
                rightLabel = 'PACK SIZE';
                rightValue = batch?.size || 'N/A';
              }

              // ── Mathematically Precise Geometry ──
              // To sit perfectly on a concentric circle outside the radar:
              // Radar centre is (radius, radius).
              // We want the distance between centres to be precisely:
              //   Distance = radius (main) + gap + cr (small)
              const cr = size * 0.065; // ~50% smaller
              const gap = 12; // visual padding gap
              const dist = radius + gap + cr;

              // X-distance between centres.
              // Left circle has cx = cr (so its left edge is at x=0).
              const dx = radius - cr; 
              
              // Y-distance calculated via Pythagorean theorem (dy² + dx² = dist²)
              const dy = Math.sqrt(Math.pow(dist, 2) - Math.pow(dx, 2));

              // The y-coordinate relative to the vizWrapper top (y=0)
              const cy_relative = radius - dy;

              // Create an overlay that safely covers the area above the radar
              const topPad = 100;
              const overlayH = size + topPad;

              // Final coordinates in the overlay SVG
              const cx_L = cr;
              const cx_R = size - cr;
              const cy = cy_relative + topPad;

              return (
                <Svg
                  width={size}
                  height={overlayH}
                  viewBox={`0 0 ${size} ${overlayH}`}
                  style={{
                    position: 'absolute',
                    top: -topPad,
                    left: 0,
                    zIndex: 10,
                  }}
                  pointerEvents="none"
                >
                  {/* LEFT circle */}
                  <Circle cx={cx_L} cy={cy} r={cr} fill={catColor} />
                  <SvgText
                    x={0}
                    y={cy - cr - 8}
                    fill={catColor}
                    fontSize={10}
                    fontWeight="900"
                    letterSpacing={1.5}
                    textAnchor="start"
                  >{leftLabel}</SvgText>
                  <SvgText
                    x={cx_L}
                    y={cy + cr * 0.35} // Manual vertical centering offset for RN SVG Android
                    fill="#000000"
                    fontSize={String(leftValue).length > 3 ? cr * 0.75 : cr * 1.1}
                    fontWeight="900"
                    textAnchor="middle"
                  >{String(leftValue)}</SvgText>

                  {/* RIGHT circle */}
                  <Circle cx={cx_R} cy={cy} r={cr} fill={catColor} />
                  <SvgText
                    x={size}
                    y={cy - cr - 8}
                    fill={catColor}
                    fontSize={10}
                    fontWeight="900"
                    letterSpacing={1.5}
                    textAnchor="end"
                  >{rightLabel}</SvgText>
                  {(() => {
                    let rNum = String(rightValue);
                    let rUnit = "";
                    const match = String(rightValue).match(/^([\d.]+)\s*([A-Za-z]+)$/);
                    if (match) {
                      rNum = match[1];
                      rUnit = match[2];
                    }
                    if (rUnit) {
                      return (
                        <G>
                          <SvgText
                            x={cx_R}
                            y={cy + cr * 0.15}
                            fill="#000000"
                            fontSize={rNum.length > 3 ? cr * 0.8 : cr * 1.0}
                            fontWeight="900"
                            textAnchor="middle"
                          >{rNum}</SvgText>
                          <SvgText
                            x={cx_R}
                            y={cy + cr * 0.7}
                            fill="#000000"
                            fontSize={cr * 0.45}
                            fontWeight="900"
                            textAnchor="middle"
                          >{rUnit}</SvgText>
                        </G>
                      );
                    } else {
                      return (
                        <SvgText
                          x={cx_R}
                          y={cy + cr * 0.35} // Manual vertical centering offset for RN SVG Android
                          fill="#000000"
                          fontSize={String(rightValue).length > 3 ? cr * 0.75 : cr * 1.1}
                          fontWeight="900"
                          textAnchor="middle"
                        >{String(rightValue)}</SvgText>
                      );
                    }
                  })()}
                </Svg>
              );
            })()}

            <Svg 
              width={size} 
              height={size} 
              viewBox={`0 0 ${size} ${size}`}
              style={{ transform: [{ scale: isMagnified ? 1.6 : 1 }] }}
            >
              <Defs>
                {/* Top Arch: 0.53 radius, Clockwise L-to-R (Right-side up) */}
                <Path id="hubArchTop" d={`M ${centerX - radius * 0.53} ${centerY} A ${radius * 0.53} ${radius * 0.53} 0 0 1 ${centerX + radius * 0.53} ${centerY}`} fill="none" />
                {/* Bottom Arch: 0.55 radius, Counter-Clockwise L-to-R (Right-side up) */}
                <Path id="hubArchBottom" d={`M ${centerX - radius * 0.55} ${centerY} A ${radius * 0.55} ${radius * 0.55} 0 0 0 ${centerX + radius * 0.55} ${centerY}`} fill="none" />
              </Defs>

              {renderChart()}
              
              {/* CENTRAL SCANNER HUB */}
              <Circle 
                cx={centerX} 
                cy={centerY} 
                r={hubRingR} 
                fill="#020617" 
                stroke={selectedSector ? getRainbowColor(activeIndices.cat, data.length) : '#1e293b'}
                strokeWidth={2}
                onPress={() => setIsMagnified(prev => !prev)}
              />

                {selectedSector ? (() => {
                    const statusColor = selectedSector.color || baseColors[0];
                    const capR = radius * 0.46;
                    const chordY = -25;
                    const chordX = Math.sqrt(Math.pow(capR, 2) - Math.pow(chordY, 2));
                    const capPath = `M ${centerX - chordX} ${centerY + chordY} A ${capR} ${capR} 0 0 1 ${centerX + chordX} ${centerY + chordY} Z`;

                    return (
                      <G pointerEvents="box-none">
                          {/* CIRCULAR IMAGE BACKGROUND (Products Only) */}
                          {selectedSector.type === 'item_type' && selectedSector.image_uri && (
                            <G onPress={() => setIsMagnified(prev => !prev)}>
                              <ClipPath id={`clip-img-${selectedSector.id || 'hub'}`}>
                                <Circle cx={centerX} cy={centerY} r={capR} />
                              </ClipPath>
                              <SvgImage
                                x={centerX - capR}
                                y={centerY - capR}
                                width={capR * 2}
                                height={capR * 2}
                                href={selectedSector.image_uri}
                                clipPath={`url(#clip-img-${selectedSector.id || 'hub'})`}
                                preserveAspectRatio="xMidYMid slice"
                              />
                            </G>
                          )}

                          {selectedSector.type === 'batch' && (
                            <G>
                              <Defs>
                                <LinearGradient id="capGrad" x1="0" y1="0" x2="0" y2="1">
                                  <Stop offset="0" stopColor={statusColor} stopOpacity="1" />
                                  <Stop offset="1" stopColor={statusColor} stopOpacity="0.4" />
                                </LinearGradient>
                              </Defs>
                              <Path 
                                d={capPath} 
                                fill="url(#capGrad)" 
                                stroke={statusColor} 
                                strokeWidth={1.5} 
                                onPress={() => {
                                  trackingBatchIdRef.current = selectedSector.id;
                                  if (activeCabinetId) {
                                    setActiveCabinetId(undefined);
                                  } else if (selectedSector.cab_id && String(selectedSector.cab_id) !== String(activeCabinetId)) {
                                    setActiveCabinetId(String(selectedSector.cab_id));
                                  }
                                }}
                              />
                            </G>
                          )}

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
                          {(() => {
                            let labelText = (selectedSector.parent_name || selectedSector.name || "").toUpperCase();
                            if (labelText.length > 35) labelText = labelText.substring(0, 34) + '…';
                            
                            let fSize = 12;
                            let lSpacing = 2;
                            if (labelText.length > 25) { fSize = 11; lSpacing = 1.8; }
                            if (labelText.length > 30) { fSize = 10; lSpacing = 1.5; }

                            return (
                              <SvgText fill={getRainbowColor(activeIndices.cat, data.length)} fontSize={fSize} style={{ fontSize: fSize }} fontWeight="900" letterSpacing={lSpacing}>
                                <TextPath href="#hubArchBottom" startOffset="50%" textAnchor="middle">
                                  <TSpan dy={8} textAnchor="middle">
                                    {labelText}
                                  </TSpan>
                                </TextPath>
                              </SvgText>
                            );
                          })()}

                          {/* TEXT & DIVIDER (Hidden when showing a Product Image to keep it clean) */}
                          {!(selectedSector.type === 'item_type' && selectedSector.image_uri) && (
                            <G>
                              <Line x1={centerX-fs(20)} y1={centerY+fs(10)} x2={centerX+fs(20)} y2={centerY+fs(10)} stroke="#475569" strokeWidth={1} />

                              {selectedSector.brand && (
                                <SvgText x={centerX} y={centerY + fs(25)} fill="#f8fafc" fontSize={fs(11)} style={{ fontSize: fs(11) }} fontWeight="900" textAnchor="middle" letterSpacing={1.5}>
                                  {selectedSector.brand.toUpperCase()}
                                </SvgText>
                              )}
                              
                              {selectedSector.range && (
                                <SvgText x={centerX} y={centerY + fs(35)} fill="#94a3b8" fontSize={fs(7.5)} style={{ fontSize: fs(7.5) }} fontWeight="bold" textAnchor="middle" letterSpacing={1.5}>
                                  {selectedSector.range.toUpperCase()}
                                </SvgText>
                              )}

                              {selectedSector.intel && (
                                <SvgText 
                                  x={centerX} 
                                  y={centerY + fs(50)} 
                                  fill="#64748b" 
                                  fontSize={fs(7)} 
                                  style={{ fontSize: fs(7) }} 
                                  fontWeight="bold"
                                  fontStyle="italic" 
                                  textAnchor="middle"
                                  letterSpacing={1}
                                >
                                  "{selectedSector.intel.toUpperCase()}"
                                </SvgText>
                              )}
                            </G>
                          )}

                          {/* MANIFEST TELEMETRY (Restored to SVG) */}
                          {(() => {
                              let m1 = "";
                              let m2 = "";
                              
                              if (selectedSector.type === 'batch') {
                                if (activeCabinetId) {
                                  m1 = "ZOOM OUT";
                                  m2 = "TO BUNKER VIEW";
                                } else {
                                  let cName = (selectedSector.cab_name || "UNKNOWN CABINET").toUpperCase();
                                  
                                  if (cName.length > 18) cName = cName.substring(0, 17) + '…';

                                  m1 = "ZOOM IN TO";
                                  m2 = cName;
                                }
                              }

                              if (!m1) return null;

                              const textY = centerY - fs(47);

                              return (
                                <G>
                                  <SvgText x={centerX} y={textY} fill="#000" fontSize={fs(11)} fontWeight="900" textAnchor="middle">
                                    {m1.trim().toUpperCase()}
                                  </SvgText>
                                  {m2 ? (
                                    <SvgText x={centerX} y={textY + fs(11)} fill="#000" fontSize={fs(10)} fontWeight="900" textAnchor="middle">
                                      {m2.trim()}
                                    </SvgText>
                                  ) : null}
                                  {selectedSector.type === 'batch' && selectedSector.exp && (
                                    <SvgText 
                                      x={centerX}
                                      y={centerY - fs(6)} 
                                      fill={selectedSector.color || '#fbbf24'} 
                                      fontSize={fs(12)} 
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
                      </G>
                    );
                })() : (
                  <G pointerEvents="none">
                    <SvgText fill="#f8fafc" fontSize={fs(11)} style={{ fontSize: fs(11) }} fontWeight="500" letterSpacing={2.5} textAnchor="middle">
                      <TextPath href="#hubArchTop" startOffset="50%" textAnchor="middle" dominantBaseline="middle">
                        <TSpan dy={fs(-4)} textAnchor="middle">CABINET INTEL</TSpan>
                      </TextPath>
                    </SvgText>

                    <SvgText fill="#fbbf24" fontSize={fs(11)} style={{ fontSize: fs(11) }} fontWeight="900" letterSpacing={2} textAnchor="middle">
                      <TextPath href="#hubArchBottom" startOffset="50%" textAnchor="middle">
                        <TSpan dy={fs(8)} textAnchor="middle">{contextName}</TSpan>
                      </TextPath>
                    </SvgText>

                    <G y={centerY}>
                      {/* T1: READINESS TRIPTYCH BAR (Header) */}
                      <G y={fs(-43)}>
                        <SvgText x={centerX} y={fs(-12)} fill="#94a3b8" fontSize={fs(8)} fontWeight="bold" textAnchor="middle" letterSpacing={1.5}>BATCH EXPIRY</SvgText>
                        
                        {/* Full Spectrum Readiness Bar (4 Segments) */}
                        <Rect x={centerX - fs(55)} y={fs(-8)} width={fs(26)} height={fs(13)} fill="#991b1b" rx={2} />
                        <Rect x={centerX - fs(27)} y={fs(-8)} width={fs(26)} height={fs(13)} fill="#f43f5e" rx={2} />
                        <Rect x={centerX + fs(1)} y={fs(-8)} width={fs(26)} height={fs(13)} fill="#f97316" rx={2} />
                        <Rect x={centerX + fs(29)} y={fs(-8)} width={fs(26)} height={fs(13)} fill="#fde047" rx={2} />
                        
                        {/* Numbers (Inside Bar) */}
                        <SvgText x={centerX - fs(42)} y={fs(2)} fill="#ffffff" fontSize={fs(11)} fontWeight="900" textAnchor="middle">{stats.expired}</SvgText>
                        <SvgText x={centerX - fs(14)} y={fs(2)} fill="#ffffff" fontSize={fs(11)} fontWeight="900" textAnchor="middle">{stats.urgent}</SvgText>
                        <SvgText x={centerX + fs(14)} y={fs(2)} fill="#ffffff" fontSize={fs(11)} fontWeight="900" textAnchor="middle">{stats.soon}</SvgText>
                        <SvgText x={centerX + fs(42)} y={fs(2)} fill="#0f172a" fontSize={fs(11)} fontWeight="900" textAnchor="middle">{stats.upcoming}</SvgText>

                        {/* Labels (Under Segments) */}
                        <SvgText x={centerX - fs(42)} y={fs(14)} fill="#94a3b8" fontSize={fs(7)} fontWeight="bold" textAnchor="middle" letterSpacing={0.5}>EXP</SvgText>
                        <SvgText x={centerX - fs(14)} y={fs(14)} fill="#94a3b8" fontSize={fs(7)} fontWeight="bold" textAnchor="middle" letterSpacing={0.5}>NOW</SvgText>
                        <SvgText x={centerX + fs(14)} y={fs(14)} fill="#94a3b8" fontSize={fs(7)} fontWeight="bold" textAnchor="middle" letterSpacing={0.5}>1-3M</SvgText>
                        <SvgText x={centerX + fs(42)} y={fs(14)} fill="#94a3b8" fontSize={fs(7)} fontWeight="bold" textAnchor="middle" letterSpacing={0.5}>4-6M</SvgText>
                      </G>

                      {/* T2: STRATEGIC LOGISTICS (Center Grid) */}
                      <G y={fs(5)}>
                        <G x={centerX - fs(34)}>
                          <SvgText x={0} y={0} fill="#fbbf24" fontSize={fs(24)} fontWeight="900" textAnchor="middle">{stats.categories}</SvgText>
                          <SvgText x={0} y={fs(10)} fill="#94a3b8" fontSize={fs(7)} fontWeight="bold" textAnchor="middle" letterSpacing={1.5}>CATEGORIES</SvgText>
                        </G>
                        <G x={centerX + fs(35)}>
                          <SvgText x={0} y={0} fill="#fbbf24" fontSize={fs(24)} fontWeight="900" textAnchor="middle">{stats.products}</SvgText>
                          <SvgText x={0} y={fs(10)} fill="#94a3b8" fontSize={fs(7)} fontWeight="bold" textAnchor="middle" letterSpacing={1.5}>PRODUCTS</SvgText>
                        </G>
                      </G>

                      {/* T3: PHYSICAL INVENTORY (Center Grid) */}
                      <G y={fs(43)}>
                        <G x={centerX - fs(34)}>
                          <SvgText x={0} y={0} fill="#fbbf24" fontSize={fs(24)} fontWeight="900" textAnchor="middle">{stats.batches}</SvgText>
                          <SvgText x={0} y={fs(10)} fill="#94a3b8" fontSize={fs(7)} fontWeight="bold" textAnchor="middle" letterSpacing={1.5}>BATCHES</SvgText>
                        </G>
                        <G x={centerX + fs(35)}>
                          <SvgText x={0} y={0} fill="#fbbf24" fontSize={fs(24)} fontWeight="900" textAnchor="middle">{stats.items}</SvgText>
                          <SvgText x={0} y={fs(10)} fill="#94a3b8" fontSize={fs(7)} fontWeight="bold" textAnchor="middle" letterSpacing={1.5}>ITEMS</SvgText>
                        </G>
                      </G>
                    </G>
                  </G>
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

      <Modal visible={showCabinetSelector} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCabinetSelector(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>TARGET SECTOR</Text>
            <TouchableOpacity style={styles.modalOption} onPress={() => { setActiveCabinetId(undefined); setShowCabinetSelector(false); }}>
              <MaterialCommunityIcons name="shield-cross" size={20} color={!activeCabinetId ? "#fbbf24" : "#94a3b8"} />
              <Text style={[styles.modalOptionText, !activeCabinetId && styles.modalOptionTextActive]}>THE BUNKER (GLOBAL)</Text>
            </TouchableOpacity>
            <View style={styles.modalDivider} />
            {cabinets.map(cab => (
              <TouchableOpacity key={cab.id} style={styles.modalOption} onPress={() => { setActiveCabinetId(cab.id.toString()); setShowCabinetSelector(false); }}>
                <MaterialCommunityIcons name="locker" size={20} color={activeCabinetId === cab.id.toString() ? "#fbbf24" : "#94a3b8"} />
                <Text style={[styles.modalOptionText, activeCabinetId === cab.id.toString() && styles.modalOptionTextActive]}>{cab.name.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
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
    overflow: 'visible',
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.8)', justifyContent: 'flex-start', paddingTop: 100, alignItems: 'center' },
  modalContent: { width: '80%', backgroundColor: '#0f172a', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1e293b' },
  modalTitle: { color: '#94a3b8', fontSize: 10, fontWeight: 'bold', letterSpacing: 1.5, marginBottom: 12, textAlign: 'center' },
  modalOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, gap: 12 },
  modalOptionText: { color: '#f8fafc', fontSize: 14, fontWeight: 'bold', letterSpacing: 1 },
  modalOptionTextActive: { color: '#fbbf24' },
  modalDivider: { height: 1, backgroundColor: '#1e293b', marginVertical: 8 },
  targetPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: '#334155', gap: 6 },
  targetPillText: { color: '#f8fafc', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 }
});
