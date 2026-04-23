import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Share, ActivityIndicator, Platform, Alert, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useBilling } from '../context/BillingContext';

import * as MailComposer from 'expo-mail-composer';

export default function LogisticsScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { checkEntitlement } = useBilling();
  const [data, setData] = useState<any[]>([]);
  const [rotationData, setRotationData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [logisticsEmail, setLogisticsEmail] = useState('');
  const [collapsedCabinets, setCollapsedCabinets] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'resupply' | 'rotation'>('resupply');
  const [rotationFilter, setRotationFilter] = useState<'3m' | '1m'>('3m');
  const [selectedBatches, setSelectedBatches] = useState<Map<number, number | null>>(new Map());
  const [showTargetModal, setShowTargetModal] = useState<number | null>(null);
  const [showDailyLog, setShowDailyLog] = useState(false);
  const [dailyLog, setDailyLog] = useState<any[]>([]);
  const [targetCabinetId, setTargetCabinetId] = useState<number | null>(null);
  const [cabinets, setCabinets] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    
    // 1. Fetch item types that have thresholds
    const typeRows = await db.getAllAsync<any>(`
      SELECT 
        c.name as cat_name, 
        i.id as type_id, 
        i.name as type_name, 
        i.unit_type,
        i.default_size,
        i.min_stock_level as min_units, 
        i.max_stock_level as max_units
      FROM ItemTypes i
      JOIN Categories c ON i.category_id = c.id
      WHERE i.min_stock_level IS NOT NULL OR i.max_stock_level IS NOT NULL
      ORDER BY c.name, i.name
    `);

    // 2. Fetch all inventory for calculation
    const inventoryRows = await db.getAllAsync<any>(`
      SELECT item_type_id, quantity, size FROM Inventory
    `);

    // 3. Helper to parse size string (e.g. "500g" -> 500)
    const parseVal = (s: string) => {
      if (!s) return 1;
      const m = s.match(/^(\d+(\.\d+)?)/);
      return m ? parseFloat(m[0]) : 1;
    };

    // 4. Processing logic
    const results: any[] = [];

    typeRows.forEach(type => {
      const relevantInv = inventoryRows.filter(r => r.item_type_id === type.type_id);
      const defSizeVal = type.default_size ? parseVal(type.default_size) : 1;
      
      // Calculate total stored weight/volume or items
      let totalStored = 0;
      if (type.default_size) {
        // We have a standard size, assess total physical volume/weight
        totalStored = relevantInv.reduce((sum, r) => sum + (r.quantity * parseVal(r.size)), 0);
      } else {
        // No standard size, assess raw unit count
        totalStored = relevantInv.reduce((sum, r) => sum + r.quantity, 0);
      }

      const targetMinTotal = type.min_units ? type.min_units * defSizeVal : null;
      const targetMaxTotal = type.max_units ? type.max_units * defSizeVal : null;

      // Check if below threshold
      const isBelowMin = targetMinTotal !== null && totalStored < targetMinTotal;
      const isBelowMax = targetMaxTotal !== null && totalStored < targetMaxTotal;

      // STRATEGIC SILENCE: Only trigger if MIN breached. 
      // Once triggered, we show both deficits if they exist.
      if (isBelowMin) {
        results.push({
          ...type,
          total_stored: totalStored,
          target_min_total: targetMinTotal,
          target_max_total: targetMaxTotal,
          def_size_val: defSizeVal,
          is_critical: true // Since we only show if below MIN now
        });
      }
    });
    
    // 5. Group pantry alerts by category
    const grouped = results.reduce((acc: any[], row: any) => {
      let cat = acc.find((c: any) => c.title === row.cat_name);
      if (!cat) {
        cat = { title: row.cat_name, data: [] };
        acc.push(cat);
      }
      cat.data.push(row);
      return acc;
    }, [] as any[]);



    setData(grouped);
    
    // 6. Fetch Rotation Data
    const rotationRows = await db.getAllAsync<any>(`
      SELECT 
        i.id,
        t.name as type_name,
        c.name as cab_name,
        c.rotation_interval_months,
        i.last_rotated_at,
        i.quantity,
        i.size,
        i.entry_year,
        i.entry_month,
        i.entry_day,
        i.expiry_year,
        i.expiry_month,
        t.unit_type,
        c.default_rotation_cabinet_id,
        c.id as cabinet_id
      FROM Inventory i
      JOIN ItemTypes t ON i.item_type_id = t.id
      JOIN Cabinets c ON i.cabinet_id = c.id
      WHERE c.cabinet_type = 'standard' AND c.rotation_interval_months IS NOT NULL AND c.rotation_interval_months > 0
    `);

    const now = new Date();
    const currentTS = now.getFullYear() * 100 + (now.getMonth() + 1);
    
    const rotResults: any[] = [];
    rotationRows.forEach(row => {
      const lastRot = row.last_rotated_at;
      let lastDate;
      if (lastRot && lastRot > 1000000) { // 8-digit YYYYMMDD
        const y = Math.floor(lastRot / 10000);
        const m = Math.floor((lastRot % 10000) / 100);
        const d = lastRot % 100;
        lastDate = new Date(y, m - 1, d);
      } else if (lastRot) { // Legacy 6-digit YYYYMM
        const y = Math.floor(lastRot / 100);
        const m = lastRot % 100;
        lastDate = new Date(y, m - 1, 1);
      } else {
        lastDate = new Date(row.entry_year, row.entry_month - 1, row.entry_day || 1);
      }
      
      const interval = row.rotation_interval_months || 3;
      const monthsDiff = (now.getFullYear() - lastDate.getFullYear()) * 12 + (now.getMonth() - lastDate.getMonth());
      
      // Precision Adjustment: If today's day is less than the rotation day, the full month hasn't passed yet
      let adjustedMonthsSince = monthsDiff;
      if (now.getDate() < lastDate.getDate()) {
        adjustedMonthsSince--;
      }
      
      const targetDate = new Date(lastDate);
      targetDate.setMonth(targetDate.getMonth() + interval);
      const diffTime = targetDate.getTime() - now.getTime();
      const remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      const remaining = interval - adjustedMonthsSince;
      // Calculate sortable expiry value (nulls last)
      const expVal = row.expiry_year ? row.expiry_year * 100 + row.expiry_month : 999999;
      
      const item = { ...row, monthsSince: adjustedMonthsSince, remaining, remainingDays, expVal };
      if (item.remaining <= (rotationFilter === '3m' ? 3 : 1)) {
        rotResults.push(item);
      }
    });

    // Strategy: Only show the SOONEST EXPIRING batch for each item type in each cabinet
    const consolidatedRot: any[] = [];
    rotResults.forEach(row => {
      const existing = consolidatedRot.find(r => r.type_name === row.type_name && r.cab_name === row.cab_name);
      if (!existing) {
        consolidatedRot.push(row);
      } else if (row.expVal < existing.expVal) {
        // Swap for earlier expiry
        const idx = consolidatedRot.indexOf(existing);
        consolidatedRot[idx] = row;
      }
    });

    const rotGrouped = consolidatedRot.reduce((acc: any[], row: any) => {
      let cab = acc.find((c: any) => c.title === row.cab_name);
      if (!cab) {
        const targetCab = cabinets.find(c => c.id === row.default_rotation_cabinet_id);
        cab = { 
          title: row.cab_name, 
          data: [], 
          metrics: { 
            count: 0, 
            minDays: 999999, 
            interval: row.rotation_interval_months,
            targetName: targetCab?.name || null
          } 
        };
        acc.push(cab);
      }
      cab.data.push(row);
      cab.metrics.count++;
      if (row.remainingDays < cab.metrics.minDays) cab.metrics.minDays = row.remainingDays;
      return acc;
    }, [] as any[]);

    // Sort batches within each cabinet by remainingDays (soonest first)
    rotGrouped.forEach(cab => {
      cab.data.sort((a: any, b: any) => a.remainingDays - b.remainingDays);
    });

    // Sort cabinets by their soonest deadline (minDays)
    rotGrouped.sort((a: any, b: any) => a.metrics.minDays - b.metrics.minDays);

    setRotationData(rotGrouped);
    setLoading(false);

    const emailRes = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', 'logistics_email');
    setLogisticsEmail(emailRes?.value || '');

    const cabList = await db.getAllAsync<any>('SELECT * FROM Cabinets ORDER BY name');
    setCabinets(cabList);
  };

  const handleMarkRotated = async () => {
    const ids = Array.from(selectedBatches.keys());
    if (ids.length === 0) return;
    
    // Oversight Check: Ensure ALL selected items have a valid destination other than current cabinet
    const deficientItems = [];
    const now = new Date();
    const ts = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    
    try {
      const batchInfos = await db.getAllAsync<any>(`SELECT id, item_type_id, cabinet_id FROM Inventory WHERE id IN (${ids.join(',')})`);
      
      const commitActions = [];
      for (const info of batchInfos) {
        let finalTarget = selectedBatches.get(info.id);
        
        // If not explicitly set via override, use cabinet default
        if (finalTarget === null || finalTarget === undefined) {
          const sourceCab = cabinets.find(c => c.id === info.cabinet_id);
          finalTarget = sourceCab?.default_rotation_cabinet_id || info.cabinet_id;
        }

        // Final verification: Is it actually moving?
        if (Number(finalTarget) === Number(info.cabinet_id)) {
          const type = rotationData.flatMap(g => g.data).find(i => i.id === info.id);
          deficientItems.push(type?.type_name || 'Unknown Item');
          continue; 
        }
        commitActions.push({ ts, finalTarget, sourceCabId: info.cabinet_id, typeId: info.item_type_id });
      }

      if (deficientItems.length > 0) {
        Alert.alert(
          'Strategic Oversight', 
          `${deficientItems.length} items require a new destination. Rotation is only permitted when stock is moved to a new storage zone.\n\nDeficient: ${deficientItems.slice(0, 3).join(', ')}${deficientItems.length > 3 ? '...' : ''}`
        );
        return;
      }

      for (const action of commitActions) {
        // Capture batch states before movement for the log
        const movingBatches = await db.getAllAsync<any>(
          'SELECT quantity, size, expiry_month, expiry_year FROM Inventory WHERE cabinet_id = ? AND item_type_id = ?', 
          [action.sourceCabId, action.typeId]
        );

        for (const b of movingBatches) {
          await db.runAsync(
            'INSERT INTO RotationLogs (item_type_id, source_cabinet_id, target_cabinet_id, quantity, size, expiry_month, expiry_year, rotated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [action.typeId, action.sourceCabId, action.finalTarget, b.quantity, b.size, b.expiry_month, b.expiry_year, action.ts]
          );
        }

        await db.runAsync(
          'UPDATE Inventory SET last_rotated_at = ?, cabinet_id = ? WHERE cabinet_id = ? AND item_type_id = ?', 
          [action.ts, action.finalTarget, action.sourceCabId, action.typeId]
        );
      }
      
      setSelectedBatches(new Map());
      setTargetCabinetId(null);
      load();
      Alert.alert('Rotation Complete', `All batches for ${batchInfos.length} items have been rotated and relocated.`);
    } catch (e) {
      console.error('Failed to rotate batches:', e);
    }
  };

  const fetchDailyLog = async () => {
    const now = new Date();
    const todayTS = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    
    try {
      const logs = await db.getAllAsync<any>(`
        SELECT 
          l.item_type_id,
          l.source_cabinet_id,
          l.target_cabinet_id,
          l.quantity,
          l.size,
          l.expiry_month,
          l.expiry_year,
          t.name as type_name,
          t.unit_type,
          c1.name as source_name,
          c2.name as target_name
        FROM RotationLogs l
        JOIN ItemTypes t ON l.item_type_id = t.id
        JOIN Cabinets c1 ON l.source_cabinet_id = c1.id
        JOIN Cabinets c2 ON l.target_cabinet_id = c2.id
        WHERE l.rotated_at = ?
        ORDER BY l.id ASC
      `, [todayTS]);
      
      // Squash logic: Group by batch identity and find net movement (Initial -> Final)
      const cabinetMap = new Map<number, string>();
      const allCabs = await db.getAllAsync<any>('SELECT id, name FROM Cabinets');
      allCabs.forEach(c => cabinetMap.set(c.id, c.name));

      const squashedMap = new Map<string, any>();
      
      for (const log of logs) {
        const key = `${log.item_type_id}-${log.quantity}-${log.size}-${log.expiry_month}-${log.expiry_year}`;
        
        if (!squashedMap.has(key)) {
          squashedMap.set(key, {
            ...log,
            initialSourceId: log.source_cabinet_id,
            finalTargetId: log.target_cabinet_id,
            initialSourceName: log.source_name,
            finalTargetName: log.target_name
          });
        } else {
          const existing = squashedMap.get(key);
          // Update final target to the latest log's target
          existing.finalTargetId = log.target_cabinet_id;
          existing.finalTargetName = log.target_name;
        }
      }

      // Filter out net-zero movements and format for display
      const finalRows = Array.from(squashedMap.values())
        .filter(row => row.initialSourceId !== row.finalTargetId)
        .map(row => ({
          type_name: row.type_name,
          source_name: row.initialSourceName,
          target_name: row.finalTargetName,
          quantity: row.quantity,
          size: row.size,
          expiry_month: row.expiry_month,
          expiry_year: row.expiry_year,
          unit_type: row.unit_type
        }));
      
      setDailyLog(finalRows.reverse()); // Latest movements first in UI
      setShowDailyLog(true);
    } catch (err) {
      console.error('Failed to fetch daily log:', err);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [rotationFilter, activeTab]));

  const formatQtyStr = (qty: number, unit: string) => {
    if (unit === 'weight') {
      if (qty >= 1000) return `${(qty/1000).toFixed(qty%1000===0?0:1)}kg`;
      return `${Math.round(qty)}g`;
    }
    if (unit === 'volume') {
      if (qty >= 1000) return `${(qty/1000).toFixed(qty%1000===0?0:1)}l`;
      return `${Math.round(qty)}ml`;
    }
    const val = Math.floor(qty);
    return `${val} ${val === 1 ? 'unit' : 'units'}`;
  };

  const calculateDeficitInfo = (target: number | null, current: number, unit: string, defSize: number) => {
    if (target === null) return null;
    const diff = target - current;
    if (diff <= 0) return null;
    const items = Math.ceil(diff / defSize);
    return {
      physical: formatQtyStr(diff, unit),
      items,
      suggestion: `${items} x ${formatQtyStr(defSize, unit)}`
    };
  };

  const handleShare = async () => {
    if (data.length === 0) return;

    const dateStr = new Date().toLocaleDateString();

    // Fetch default recipient
    const emailRes = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', 'logistics_email');
    const recipient = emailRes?.value || '';


    let textBody = "War Cabinet Restocking Report\n";
    textBody += "Date: " + dateStr + "\n\n";

    data.forEach(cat => {
      textBody += `=== ${cat.title.toUpperCase()} ===\n\n`;
      cat.data.forEach((item: any) => {
        const effectiveUnit = item.default_size ? item.unit_type : 'unit';
        const minI = calculateDeficitInfo(item.target_min_total, item.total_stored, effectiveUnit, item.def_size_val);
        const maxI = calculateDeficitInfo(item.target_max_total, item.total_stored, effectiveUnit, item.def_size_val);
        const currentLabel = item.default_size ? formatQtyStr(item.total_stored, item.unit_type) : `${item.total_stored} ${item.total_stored === 1 ? 'unit' : 'units'}`;
        
        textBody += `• ${item.type_name}\n`;
        textBody += `  Current Stock: ${currentLabel}\n`;
        textBody += "  Required Purchase:\n";
        
        if (minI) {
          textBody += `    MIN: ${minI.physical}${item.default_size ? ` (${minI.suggestion})` : ''}\n`;
        }
        if (maxI) {
          textBody += `    MAX: ${maxI.physical}${item.default_size ? ` (${maxI.suggestion})` : ''}\n`;
        }
        textBody += "\n";
      });
    });

    textBody += "System-generated logistical intel for inventory replenishment.";

    try {
      const isMailAvailable = await MailComposer.isAvailableAsync();
      if (isMailAvailable) {
        await MailComposer.composeAsync({
          subject: 'war cabinet shopping list',
          body: textBody,
          recipients: recipient ? [recipient] : undefined,
          isHtml: false, // Reverting to plain text as per user request for simplicity/cleanup
        });
      } else {
        await Share.share({
          message: textBody,
          title: 'war cabinet shopping list'
        });
      }
    } catch (error) {
      console.log('Sharing failed:', error);
      await Share.share({ message: textBody });
    }
  };

  const renderItem = ({ item: cat }: any) => (
    <View style={styles.catGroup}>
      <View style={[styles.catHeader, cat.isFreezer && { borderBottomColor: '#1e3a5f' }]}>
        <MaterialCommunityIcons name={cat.isFreezer ? 'snowflake' : 'label-outline'} size={16} color={cat.isFreezer ? '#60a5fa' : '#3b82f6'} style={{marginRight: 8}} />
        <Text style={[styles.catTitle, cat.isFreezer && { color: '#60a5fa' }]}>{cat.title.toUpperCase()}</Text>
      </View>
      {cat.data.map((item: any) => {
        if (cat.isFreezer) {
          // Freezer batch row
          const overdue = item.remaining <= 0;
          return (
            <View key={`freeze-${item.batch_id}`} style={[styles.resupplyRow, { borderLeftWidth: 3, borderLeftColor: overdue ? '#b91c1c' : '#fde047' }]}>
              <View style={{flex: 1}}>
                <Text style={[styles.itemName, { color: overdue ? '#ef4444' : '#f8fafc' }]}>{item.type_name}</Text>
                <Text style={styles.itemMeta}>{item.cab_name} · {item.quantity} × {item.size ? item.size + (item.unit_type === 'weight' ? 'g' : item.unit_type === 'volume' ? 'ml' : '') : 'unit'}</Text>
                <Text style={{color: '#60a5fa', fontSize: 11, marginTop: 2}}>Frozen {item.age_months} {item.age_months === 1 ? 'month' : 'months'} ago</Text>
              </View>
              <View style={styles.deficitCol}>
                <View style={[styles.badge, {borderColor: overdue ? '#b91c1c' : '#fde047'}]}>
                  <Text style={[styles.badgeText, {color: overdue ? '#b91c1c' : '#fde047'}]}>
                    {overdue ? `OVERDUE ${Math.abs(item.remaining)}mo` : `${item.remaining}mo LEFT`}
                  </Text>
                </View>
              </View>
            </View>
          );
        }

        const effectiveUnit = item.default_size ? item.unit_type : 'unit';
        const minI = calculateDeficitInfo(item.target_min_total, item.total_stored, effectiveUnit, item.def_size_val);
        const maxI = calculateDeficitInfo(item.target_max_total, item.total_stored, effectiveUnit, item.def_size_val);

        return (
          <View key={item.type_id} style={styles.resupplyRow} testID={`resupply-row-${item.type_id}`}>
            <View style={{flex: 1}}>
              <Text style={[styles.itemName, item.is_critical && {color: '#ef4444'}]}>{item.type_name}</Text>
              <Text style={styles.itemMeta} testID={`stored-text-${item.type_id}`}>Current Stock: {item.default_size ? formatQtyStr(item.total_stored, item.unit_type) : `${item.total_stored} ${item.total_stored === 1 ? 'unit' : 'units'}`}</Text>
              {item.default_size && (
                <Text style={{color: '#94a3b8', fontSize: 10, marginTop: 2, fontStyle: 'italic'}}>
                   Suggested Unit Size: {item.default_size}
                </Text>
              )}
            </View>
            <View style={styles.deficitCol}>
              {minI && (
                <View style={[styles.badge, {borderColor: '#ef4444'}]} testID={`min-deficit-${item.type_id}`}>
                  <Text style={[styles.badgeText, {color: '#ef4444'}]}>MIN {minI.physical}</Text>
                  {item.default_size && <Text style={{fontSize: 9, color: '#ef4444'}}>({minI.suggestion})</Text>}
                </View>
              )}
              {maxI && (
                <View style={[styles.badge, {borderColor: '#3b82f6', marginTop: 4}]} testID={`max-deficit-${item.type_id}`}>
                  <Text style={[styles.badgeText, {color: '#3b82f6'}]}>MAX {maxI.physical}</Text>
                  {item.default_size && <Text style={{fontSize: 9, color: '#3b82f6'}}>({maxI.suggestion})</Text>}
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );

  const renderRotationItem = ({ item: cab }: any) => {
    const isCollapsed = collapsedCabinets.has(cab.title);
    
    // Format minDays metric for collapsed view
    let minDaysLabel = "";
    if (cab.metrics.minDays < 0) {
       const absDays = Math.abs(cab.metrics.minDays);
       const val = Math.ceil((absDays/30.44)*2)/2;
       minDaysLabel = absDays >= 30 
         ? `OVERDUE ${val} ${val === 1 ? 'MONTH' : 'MONTHS'}` 
         : `OVERDUE ${absDays} ${absDays === 1 ? 'DAY' : 'DAYS'}`;
    } else if (cab.metrics.minDays === 0) {
       minDaysLabel = "DUE TODAY";
    } else {
       const val = Math.ceil((cab.metrics.minDays/30.44)*2)/2;
       minDaysLabel = cab.metrics.minDays < 30 
         ? `DUE ${cab.metrics.minDays} ${cab.metrics.minDays === 1 ? 'DAY' : 'DAYS'}` 
         : `DUE ${val} ${val === 1 ? 'MONTH' : 'MONTHS'}`;
    }

    return (
      <View style={styles.catGroup}>
        <TouchableOpacity 
          style={[styles.catHeader, {borderBottomColor: '#fbbf2433', justifyContent: 'space-between'}]}
          onPress={() => {
             const next = new Set(collapsedCabinets);
             if (next.has(cab.title)) next.delete(cab.title);
             else next.add(cab.title);
             setCollapsedCabinets(next);
          }}
        >
          <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
            <MaterialCommunityIcons name={isCollapsed ? "chevron-right" : "chevron-down"} size={18} color="#fbbf24" style={{marginRight: 6}} />
            <Text style={[styles.catTitle, {color: '#fbbf24'}]}>{cab.title.toUpperCase()}</Text>
            {cab.metrics.targetName && (
              <View style={{flexDirection: 'row', alignItems: 'center', marginLeft: 8}}>
                <MaterialCommunityIcons name="arrow-right" size={12} color="#fbbf24" style={{opacity: 0.7}} />
                <Text style={{color: '#fbbf24', fontSize: 10, fontWeight: 'bold', marginLeft: 4, opacity: 0.8}}>{cab.metrics.targetName.toUpperCase()}</Text>
              </View>
            )}
            {isCollapsed && (
              <Text style={{color: '#94a3b8', fontSize: 10, marginLeft: 12, fontWeight: 'bold'}}>
                {cab.metrics.count} {cab.metrics.count === 1 ? 'ITEM' : 'ITEMS'} · {minDaysLabel}
              </Text>
            )}
          </View>
          <View style={{backgroundColor: '#fbbf2433', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1, borderColor: '#fbbf2466'}}>
            <Text style={{color: '#fbbf24', fontSize: 8, fontWeight: 'bold'}}>{cab.metrics.interval}M CYCLE</Text>
          </View>
        </TouchableOpacity>

        {!isCollapsed && cab.data.map((item: any) => {
          const isSelected = selectedBatches.has(item.id);
          const overrideId = selectedBatches.get(item.id);
          const targetId = overrideId || item.default_rotation_cabinet_id;
          const targetCab = cabinets.find(c => c.id === targetId);
          
          return (
            <TouchableOpacity 
              key={`rot-${item.id}`} 
              style={[styles.resupplyRow, isSelected && {backgroundColor: '#1e293b', borderColor: '#fbbf24', borderWidth: 1}]}
              onPress={() => {
                const next = new Map(selectedBatches);
                if (next.has(item.id)) next.delete(item.id);
                else next.set(item.id, item.default_rotation_cabinet_id || null);
                setSelectedBatches(next);
              }}
            >
              <View style={{flex: 1}}>
                <Text style={[styles.itemName, item.remainingDays <= 0 && {color: '#ef4444'}]}>{item.type_name}</Text>
                <Text style={styles.itemMeta}>
                  {item.quantity} × {formatQtyStr(parseFloat(item.size) || 0, item.unit_type)}
                  {item.expiry_month && ` · Exp: ${item.expiry_month.toString().padStart(2, '0')}/${item.expiry_year}`}
                </Text>
                <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 4}}>
                  <Text style={{color: '#94a3b8', fontSize: 11}}>
                    Last Rotated: {item.last_rotated_at 
                      ? `${item.last_rotated_at % 100}/${Math.floor((item.last_rotated_at % 10000) / 100).toString().padStart(2, '0')}/${Math.floor(item.last_rotated_at / 10000)}` 
                      : 'NEVER'}
                  </Text>
                </View>
              </View>
              <View style={styles.deficitCol}>
                {isSelected ? (
                  <TouchableOpacity 
                    onPress={() => setShowTargetModal(item.id)}
                    style={{backgroundColor: '#fbbf2433', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: targetId === item.cabinet_id ? '#ef4444' : '#fbbf2466', flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28}}
                  >
                    <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 4}}>
                      <Text style={{color: targetId === item.cabinet_id ? '#ef4444' : '#fbbf24', fontSize: 10, fontWeight: 'bold'}}>ROTATE TO:</Text>
                      <Text style={{color: targetId === item.cabinet_id ? '#ef4444' : '#fbbf24', fontSize: targetId === item.cabinet_id ? 9 : 11, fontWeight: 'bold'}} numberOfLines={1}>
                        {targetId === item.cabinet_id ? 'PICK DESTINATION' : targetCab?.name || 'PICK DESTINATION'}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-down" size={14} color={targetId === item.cabinet_id ? '#ef4444' : '#fbbf24'} />
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.badge, {borderColor: item.remainingDays <= 0 ? '#ef4444' : '#fbbf24', minHeight: 28, justifyContent: 'center'}]}>
                    <Text style={[styles.badgeText, {color: item.remainingDays <= 0 ? '#ef4444' : '#fbbf24'}]}>
                      {item.remainingDays < 0 ? (() => {
                        const absDays = Math.abs(item.remainingDays);
                        const val = Math.ceil((absDays/30.44)*2)/2;
                        return absDays >= 30 
                          ? `OVERDUE ${val} ${val === 1 ? 'MONTH' : 'MONTHS'}`
                          : `OVERDUE ${absDays} ${absDays === 1 ? 'DAY' : 'DAYS'}`;
                      })() : item.remainingDays === 0 ? (
                        "DUE TODAY"
                      ) : (() => {
                        const val = Math.ceil((item.remainingDays/30.44)*2)/2;
                        return item.remainingDays < 30 
                          ? `DUE ${item.remainingDays} ${item.remainingDays === 1 ? 'DAY' : 'DAYS'}` 
                          : `DUE ${val} ${val === 1 ? 'MONTH' : 'MONTHS'}`;
                      })()}
                    </Text>
                  </View>
                )}
                <MaterialCommunityIcons 
                  name={isSelected ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"} 
                  size={22} 
                  color={isSelected ? "#fbbf24" : "#334155"} 
                  style={{marginTop: 8}} 
                />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerColumn}>
        {/* ROW 1: COMMANDS */}
        <View style={styles.headerTopRow}>
          <View style={styles.headerSideCol}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <MaterialCommunityIcons name="arrow-left" size={20} color="#f8fafc" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.headerCenterCol}>
            <View style={{ paddingLeft: 12 }}>
              <Text style={styles.title}>Quartermaster</Text>
            </View>
          </View>

          <View style={[styles.headerSideCol, { alignItems: 'flex-end', width: 100 }]}>
            {activeTab === 'resupply' && data.length > 0 && (
              <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
                <Text style={styles.shareBtnText}>SHARE</Text>
              </TouchableOpacity>
            )}
            {activeTab === 'rotation' && (
              <TouchableOpacity 
                style={[styles.shareBtn, {backgroundColor: '#fbbf24'}]} 
                onPress={fetchDailyLog}
              >
                <Text style={[styles.shareBtnText, {color: '#0f172a'}]}>SUMMARY</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ROW 2: SCOPE */}
        <View style={styles.headerSubRow}>
          <View style={styles.headerSideCol} />
          <View style={styles.headerCenterCol}>
            <View style={{ paddingLeft: 12 }}>
              <Text style={styles.subtitle}>{activeTab === 'resupply' ? 'Low stocks shopping list' : 'Tactical movement roster'}</Text>
            </View>
          </View>
          <View style={[styles.headerSideCol, { width: 60 }]} />
        </View>

        <View style={{flexDirection: 'row', backgroundColor: '#0f172a', padding: 4, marginHorizontal: 16, marginBottom: 12, borderRadius: 10}}>
          <TouchableOpacity 
            style={[{flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8}, activeTab === 'resupply' && {backgroundColor: '#1e293b'}]}
            onPress={() => setActiveTab('resupply')}
          >
            <Text style={{color: activeTab === 'resupply' ? '#3b82f6' : '#64748b', fontSize: 11, fontWeight: 'bold'}}>RESUPPLY</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[{flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8}, activeTab === 'rotation' && {backgroundColor: '#1e293b'}]}
            onPress={() => { if (checkEntitlement('STOCK_ROTATION')) setActiveTab('rotation'); }}
          >
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
              <MaterialCommunityIcons name="cached" size={14} color={activeTab === 'rotation' ? '#fbbf24' : '#64748b'} />
              <Text style={{color: activeTab === 'rotation' ? '#fbbf24' : '#64748b', fontSize: 11, fontWeight: 'bold'}}>ROTATION</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : (
        <View style={{flex: 1}}>
          {activeTab === 'rotation' && (
            <View style={{flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16, gap: 8, alignItems: 'center'}}>
              <Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold'}}>URGENCY:</Text>
              <TouchableOpacity 
                style={[{paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#334155'}, rotationFilter === '3m' && {backgroundColor: '#fbbf24', borderColor: '#fbbf24'}]}
                onPress={() => setRotationFilter('3m')}
              >
                <Text style={{color: rotationFilter === '3m' ? '#0f172a' : '#94a3b8', fontSize: 10, fontWeight: 'bold'}}>3 MONTHS</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[{paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#334155'}, rotationFilter === '1m' && {backgroundColor: '#ef4444', borderColor: '#ef4444'}]}
                onPress={() => setRotationFilter('1m')}
              >
                <Text style={{color: rotationFilter === '1m' ? '#f8fafc' : '#94a3b8', fontSize: 10, fontWeight: 'bold'}}>THIS MONTH</Text>
              </TouchableOpacity>
            </View>
          )}

          <FlatList
            data={activeTab === 'resupply' ? data : rotationData}
            keyExtractor={item => item.title}
            renderItem={activeTab === 'resupply' ? renderItem : renderRotationItem}
            contentContainerStyle={{padding: 16, paddingBottom: 100}}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="check-decagram" size={64} color="#1e293b" />
              <Text style={styles.emptyTitle}>War-Footing Maintained</Text>
              <Text style={styles.emptyText}>
                {activeTab === 'resupply' 
                  ? 'All tracked stockpiles are at or above their designated thresholds.' 
                  : 'No items currently require tactical rotation in this cycle.'}
              </Text>
            </View>
          }
          ListHeaderComponent={
            <View style={styles.emailFooter}>
              <Text style={styles.emailFooterLabel}>STRATEGIC BRIEFING RECIPIENT</Text>
              <TextInput
                style={styles.emailInput}
                value={logisticsEmail}
                onChangeText={async (val) => {
                  setLogisticsEmail(val);
                  await db.runAsync('INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)', 'logistics_email', val);
                }}
                placeholder="Pre-fill email for sharing (optional)"
                placeholderTextColor="#475569"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          }

        />

        {activeTab === 'rotation' && selectedBatches.size > 0 && (() => {
          // Check for any deficient items in the selection
          const allItems = rotationData.flatMap(g => g.data);
          let hasDeficiency = false;
          for (const [id, targetId] of selectedBatches.entries()) {
            const item = allItems.find(i => i.id === id);
            if (!item) continue;
            const finalT = targetId || item.default_rotation_cabinet_id;
            if (!finalT || finalT === item.cabinet_id) {
              hasDeficiency = true;
              break;
            }
          }

          return (
            <View style={{position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#0f172a', borderTopWidth: 2, borderTopColor: hasDeficiency ? '#ef444433' : '#fbbf2433', padding: 16, paddingBottom: Platform.OS === 'ios' ? 36 : 20, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.5, shadowRadius: 15, elevation: 25}}>
              <TouchableOpacity 
                style={{backgroundColor: hasDeficiency ? '#334155' : '#fbbf24', paddingVertical: 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: hasDeficiency ? '#000' : '#fbbf24', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8}}
                onPress={handleMarkRotated}
                disabled={hasDeficiency}
              >
                <MaterialCommunityIcons name={hasDeficiency ? "alert-circle-outline" : "cached"} size={24} color={hasDeficiency ? "#94a3b8" : "#0f172a"} />
                <Text style={{color: hasDeficiency ? "#94a3b8" : "#0f172a", fontWeight: 'bold', fontSize: 17, marginLeft: 10}}>
                  {hasDeficiency ? 'DESTINATION REQUIRED' : `COMPLETE ROTATION (${selectedBatches.size})`}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })()}

        <Modal visible={showTargetModal !== null} transparent animationType="fade">
          <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20}}>
            <View style={{backgroundColor: '#1e293b', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#334155'}}>
              <Text style={{color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 20}}>SELECT DESTINATION</Text>
              {cabinets.filter(c => {
                const currentGroup = rotationData.find(g => g.data.some((i: any) => i.id === showTargetModal));
                const currentItem = currentGroup?.data.find((i: any) => i.id === showTargetModal);
                return c.id !== currentItem?.cabinet_id;
              }).map(cab => {
                const currentGroup = rotationData.find(g => g.data.some((i: any) => i.id === showTargetModal));
                const currentItem = currentGroup?.data.find((i: any) => i.id === showTargetModal);
                const isDefault = cab.id === currentItem?.default_rotation_cabinet_id;
                
                return (
                  <TouchableOpacity 
                    key={cab.id}
                    style={{paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#334155', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}
                    onPress={() => {
                      const next = new Map(selectedBatches);
                      next.set(showTargetModal!, cab.id);
                      setSelectedBatches(next);
                      setShowTargetModal(null);
                    }}
                  >
                    <Text style={{color: isDefault ? '#fbbf24' : 'white', fontWeight: isDefault ? 'bold' : 'normal'}}>{cab.name}</Text>
                    {isDefault && <Text style={{color: '#fbbf24', fontSize: 8, fontWeight: 'bold'}}>DEFAULT</Text>}
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity 
                style={{marginTop: 20, paddingVertical: 12, backgroundColor: '#334155', borderRadius: 8, alignItems: 'center'}}
                onPress={() => setShowTargetModal(null)}
              >
                <Text style={{color: 'white', fontWeight: 'bold'}}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* DAILY LOG MODAL */}
        <Modal visible={showDailyLog} transparent animationType="slide">
          <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 20}}>
            <View style={{backgroundColor: '#1e293b', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#fbbf2433', maxHeight: '80%'}}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                <View>
                  <Text style={{color: 'white', fontSize: 18, fontWeight: 'bold'}}>MISSION SUMMARY</Text>
                  <Text style={{color: '#94a3b8', fontSize: 10, fontWeight: 'bold'}}>ROTATIONS COMPLETED TODAY</Text>
                </View>
                <TouchableOpacity onPress={() => setShowDailyLog(false)}>
                  <MaterialCommunityIcons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>

              <FlatList
                data={dailyLog}
                keyExtractor={(_, index) => `log-${index}`}
                renderItem={({ item }) => (
                  <View style={{paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#334155'}}>
                    <Text style={{color: 'white', fontWeight: 'bold'}}>{item.type_name}</Text>
                    <Text style={{color: '#94a3b8', fontSize: 10, marginTop: 2}}>
                      {item.quantity} × {formatQtyStr(parseFloat(item.size) || 0, item.unit_type)}
                      {item.expiry_month && ` · Exp: ${item.expiry_month.toString().padStart(2, '0')}/${item.expiry_year}`}
                    </Text>
                    <View style={{flexDirection: 'row', marginTop: 8, alignItems: 'center', gap: 6}}>
                      <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#334155'}}>
                        <Text style={{color: '#64748b', fontSize: 9, fontWeight: 'bold'}}>{item.source_name.toUpperCase()}</Text>
                      </View>
                      <MaterialCommunityIcons name="arrow-right" size={12} color="#fbbf24" />
                      <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#fbbf241a', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#fbbf2433'}}>
                        <Text style={{color: '#fbbf24', fontSize: 9, fontWeight: 'bold'}}>{item.target_name.toUpperCase()}</Text>
                      </View>
                    </View>
                  </View>
                )}
                ListEmptyComponent={
                  <View style={{padding: 40, alignItems: 'center'}}>
                    <MaterialCommunityIcons name="clipboard-text-outline" size={48} color="#334155" />
                    <Text style={{color: '#64748b', textAlign: 'center', marginTop: 12}}>No rotations have been logged today.</Text>
                  </View>
                }
              />

              <TouchableOpacity 
                style={{marginTop: 20, paddingVertical: 16, backgroundColor: '#fbbf24', borderRadius: 12, alignItems: 'center'}}
                onPress={() => setShowDailyLog(false)}
              >
                <Text style={{color: '#0f172a', fontWeight: 'bold'}}>DISMISS</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    )}
  </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  headerColumn: { 
    backgroundColor: '#1e293b', 
    paddingTop: Platform.OS === 'ios' ? 40 : 10, 
    borderBottomWidth: 1, 
    borderBottomColor: '#334155' 
  },
  headerTopRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 16,
    marginBottom: 2
  },
  headerSubRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8
  },
  headerSideCol: { width: 32 },
  headerCenterCol: { flex: 1 },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155', borderRadius: 16 },
  title: { color: '#f8fafc', fontSize: 24, fontWeight: 'bold' },
  subtitle: { color: '#94a3b8', fontSize: 11, textAlign: 'left' },
  shareBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3b82f6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  shareBtnText: { color: 'white', fontWeight: 'bold', fontSize: 11 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  catGroup: { marginBottom: 24 },
  catHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#334155', paddingBottom: 6 },
  catTitle: { color: '#3b82f6', fontSize: 12, fontWeight: 'bold' },
  resupplyRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 8 },
  itemName: { color: '#f8fafc', fontSize: 16, fontWeight: 'bold' },
  itemMeta: { color: '#cbd5e1', fontSize: 13, marginTop: 2 },
  deficitCol: { alignItems: 'flex-end' },
  badge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyTitle: { color: '#f8fafc', fontSize: 20, fontWeight: 'bold', marginTop: 16 },
  emptyText: { color: '#94a3b8', fontSize: 14, textAlign: 'center', marginTop: 8, paddingHorizontal: 40 },
  emailFooter: { marginBottom: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  emailFooterLabel: { color: '#64748b', fontSize: 10, fontWeight: 'bold', marginBottom: 6, paddingLeft: 4 },
  emailInput: { backgroundColor: '#1e293b', color: '#f8fafc', borderRadius: 8, padding: 12, fontSize: 14, borderWidth: 1, borderColor: '#334155' },
  miniChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  miniChipActive: {
    backgroundColor: '#fbbf2422',
    borderColor: '#fbbf24',
  },
  miniChipText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  miniChipTextActive: {
    color: '#fbbf24',
  },
});
