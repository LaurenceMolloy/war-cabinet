import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ScrollView, StyleSheet, Alert, Switch, Platform, Modal, KeyboardAvoidingView, ActivityIndicator, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { BackupService, BackupMetadata, BACKUP_MANIFEST_VERSION } from '../services/BackupService';
import { GoogleDriveService, GOOGLE_AUTH_CONFIG } from '../services/GoogleDriveService';
import { CURRENT_SCHEMA_VERSION, markModified, logTacticalAction } from '../db/sqlite';
import { useBilling } from '../context/BillingContext';
import SUPPLIERS_DATA from '../data/suppliers.json';
import BRANDS_DATA from '../data/brands.json';
import { Database } from '../database';
import { CabinetFormModal } from '../components/CabinetFormModal';
import { CommandLedgerView } from '../components/CommandLedgerView';

export default function CatalogScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const flatListRef = useRef<FlatList>(null);
  const { isPremium, hasFullAccess, checkEntitlement, isTrialActive, trialLabel, requestPurchase, isSergeanOrAbove, isGeneralOrAbove, isCadet, isPrivate, graduateEarly, limits, isSergeant, isGeneral } = useBilling();
  const [categories, setCategories] = useState<any[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemDefaultSize, setNewItemDefaultSize] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('weight');
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [editingCatIsMessHall, setEditingCatIsMessHall] = useState(true);
  const [editingTypeId, setEditingTypeId] = useState<number | null>(null);
  const [editingTypeName, setEditingTypeName] = useState('');
  const [editingTypeDefaultSize, setEditingTypeDefaultSize] = useState('');
  const [editingTypeUnit, setEditingTypeUnit] = useState('weight');
  const [editingTypeDefaultCabinet, setEditingTypeDefaultCabinet] = useState<number | null>(null);
  const [editingTypeMinStock, setEditingTypeMinStock] = useState('');
  const [editingTypeMaxStock, setEditingTypeMaxStock] = useState('');
  const [editingTypeSupplier, setEditingTypeSupplier] = useState('');
  const [editingTypeRange, setEditingTypeRange] = useState('');
  const [editingTypeCategoryId, setEditingTypeCategoryId] = useState<number | null>(null);
  const [newItemSupplier, setNewItemSupplier] = useState('');
  const [newItemRange, setNewItemRange] = useState('');

  const [newItemMinStock, setNewItemMinStock] = useState('');
  const [newItemMaxStock, setNewItemMaxStock] = useState('');
  const [newItemDefaultCabinet, setNewItemDefaultCabinet] = useState<number | null>(null);
  
  const [supplierVocabulary, setSupplierVocabulary] = useState<string[]>([]);
  const [rangeVocabulary, setRangeVocabulary] = useState<string[]>([]);
  const [supplierCounts, setSupplierCounts] = useState<Record<string, number>>({});
  const [rangeCounts, setRangeCounts] = useState<Record<string, number>>({});
  const [suggestedTypeAheadSuppliers, setSuggestedTypeAheadSuppliers] = useState<string[]>([]);
  const [suggestedTypeAheadRanges, setSuggestedTypeAheadRanges] = useState<string[]>([]);

  const [cabinets, setCabinets] = useState<any[]>([]);
  const [showCabinetModal, setShowCabinetModal] = useState(false);
  const [selectedCabinetForEdit, setSelectedCabinetForEdit] = useState<any>(null);
  
  const params = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState<'catalog' | 'cabinets' | 'system' | 'backups' | 'rank'>('catalog');

  useEffect(() => {
    if (params.tab === 'rank') {
      setActiveTab('rank');
    }
  }, [params.tab]);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [logisticsEmail, setLogisticsEmail] = useState('');
  const [mirrorUri, setMirrorUri] = useState<string | null>(null);
  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [bunker, setBunker] = useState<BackupMetadata | null>(null);
  const [totalItemCount, setTotalItemCount] = useState(0);
  const [schemaVersion, setSchemaVersion] = useState('0');
  const [minReqCount, setMinReqCount] = useState(0);
  const [maxReqCount, setMaxReqCount] = useState(0);
  const [freezerItemCount, setFreezerItemCount] = useState(0);
  const [freezerCabCount, setFreezerCabCount] = useState(0);
  const [expandedCatId, setExpandedCatId] = useState<number | null>(null);
  const [newItemFreezeMonths, setNewItemFreezeMonths] = useState('');
  const [editingTypeFreezeMonths, setEditingTypeFreezeMonths] = useState('');
  const [showInlineAddCabinet, setShowInlineAddCabinet] = useState(false);
  const [inlineCabContext, setInlineCabContext] = useState<'new_item' | 'edit_item'>('new_item');
  const [inlineCabName, setInlineCabName] = useState('');
  const [inlineCabLoc, setInlineCabLoc] = useState('');
  const [inlineCabType, setInlineCabType] = useState<'standard' | 'freezer'>('standard');

  const [cloudBackupEnabled, setCloudBackupEnabled] = useState(false);
  const [cloudSchedule, setCloudSchedule] = useState('Daily');
  const [cloudAccount, setCloudAccount] = useState('');
  const [cloudLastSync, setCloudLastSync] = useState('');
  const [cloudLastStatus, setCloudLastStatus] = useState('');


  const [showCloudConsentModal, setShowCloudConsentModal] = useState(false);
  const [showRestoreSourceModal, setShowRestoreSourceModal] = useState(false);
  const [showMissionLogs, setShowMissionLogs] = useState(false);
  const [missionLogs, setMissionLogs] = useState<any[]>([]);
  const [missionDelta, setMissionDelta] = useState<{units: number, batches: number, types: number, categories: number, cabinets: number} | null>(null);
  const [isBunkerLedger, setIsBunkerLedger] = useState(false);
  const [currentCensus, setCurrentCensus] = useState<{
    units: number;
    batches: number;
    types: number;
    categories: number;
    cabinets: number;
  } | null>(null);
  
  
  /**
   * THE OAUTH POST-MORTEM (For Posterity)
   * 
   * We spent considerable effort attempting to use Expo's 'AuthSession' and 'Google' 
   * browser-based hooks with the Expo Proxy (auth.expo.io). 
   * 
   * WHY IT FAILED:
   * 1. Google's modern security policies for 'Web' client types often reject 
   *    redirects to mobile browsers if they suspect the client is a native app.
   * 2. The Expo Proxy is finicky with Dev Clients that haven't been 'Published' 
   *    to the Expo dashboard, leading to silent 'Something went wrong' errors.
   * 3. Case-sensitivity in Expo usernames (@DummyMolloy vs @dummymolloy) and 
   *    dead Project IDs in app.json added layers of handshake failure.
   * 
   * THE SOLUTION:
   * We migrated to the '@react-native-google-signin/google-signin' Native SDK.
   * It bypasses the browser/proxy entirely by talking directly to Google Play 
   * Services on the device. This is the industrial-grade standard for Android.
   */
  // Initialize Native Google Sign-In
  useEffect(() => {
    GoogleSignin.configure({
      webClientId: '649377265049-br0c6diva1ng3rcqlm8dlovl392i2vmk.apps.googleusercontent.com',
      offlineAccess: true,
      forceCodeForRefreshToken: true,
      scopes: GOOGLE_AUTH_CONFIG.scopes,
    });

    // Try silent sign-in to restore session (Native Only)
    const initAuth = async () => {
      if (Platform.OS === 'web') return;
      try {
        const user = await GoogleSignin.signInSilently();
        if (user) {
          console.log('[DRIVE] Session restored for:', user.user.email);
          setCloudAccount(user.user.email);
          setCloudBackupEnabled(true);
          setCloudLastStatus('Success (Connected)');
        }
      } catch (e) {
        console.log('[DRIVE] No active session found.');
      }
    };
    initAuth();
  }, []);

  const handleGoogleAuth = async () => {
    console.log('[DRIVE] Triggering Native SDK Auth...');
    try {
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      
      if (tokens.accessToken) {
        console.log('[DRIVE] Success! Token acquired via Native SDK.');
        await handleEnableCloudSyncWithToken(tokens.accessToken);
      }
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log('[DRIVE] Auth Cancelled by user');
      } else if (error.code === statusCodes.IN_PROGRESS) {
        console.log('[DRIVE] Auth already in progress');
      } else {
        console.error('[DRIVE] Native Auth Error:', error);
        Alert.alert('Auth Error', 'Failed to connect to Google Drive.');
      }
    }
  };

  const [showNoteModal, setShowNoteModal] = useState(false);
  const [tacticalNote, setTacticalNote] = useState('');
  const [currentActivity, setCurrentActivity] = useState('');
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState('');
  const [selectedBackup, setSelectedBackup] = useState<BackupMetadata | null>(null);

  const handleManualBackup = async () => {
    if (!checkEntitlement('BACKUPS')) return;
    const res = await db.getFirstAsync<{value: string}>("SELECT value FROM Settings WHERE key = 'last_activity_log'");
    setCurrentActivity(res?.value || 'No operational changes recorded');
    setShowNoteModal(true);
  };

  const executeManualSnapshot = async (note: string = "") => {
    try {
      setShowNoteModal(false);
      setCloudLastStatus('Mirroring...');
      const backup = await BackupService.createBackup(db, note || 'Manual Snapshot');
      if (backup) {
        await load();
        
        // Mirror to cloud if enabled
        const tokens = await GoogleSignin.getTokens();
        if (cloudBackupEnabled && tokens.accessToken) {
           const content = await BackupService.readLocalBackup(backup.jsonUri);
           await BackupService.uploadToCloud(tokens.accessToken, JSON.parse(content));
           setCloudLastStatus('Success (Mirrored)');
        }
        
        setTacticalNote('');
        Alert.alert('Snapshot Captured', note ? `Archive marked as: ${note}` : 'Tactical snapshot stored in rolling archive.');
      }
    } catch (error) {
      console.error('Manual snapshot failed:', error);
      Alert.alert('Error', 'Failed to capture tactical snapshot.');
    }
  };

  const handleEnableCloudSyncWithToken = async (accessToken: string, refreshToken?: string) => {
    try {
      // Save tokens
      await GoogleDriveService.saveTokens(accessToken, refreshToken);
      
      // Fetch user info
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const user = await userInfoResponse.json();

      setCloudAccount(user.email);
      setCloudBackupEnabled(true);
      setCloudLastStatus('Success (Connected)');
      const ts = new Date().toLocaleString();
      setCloudLastSync(ts);
      
      await db.runAsync('INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)', ['cloud_backup_enabled', '1']);
      await db.runAsync('INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)', ['cloud_account', user.email]);
      await db.runAsync('INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)', ['cloud_last_status', 'Success (Connected)']);
      await db.runAsync('INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)', ['cloud_last_sync', ts]);
      
      Alert.alert('Cloud Mirroring Active', `Successfully connected as ${user.email}`);
    } catch (error) {
      console.error('Failed to enable cloud sync:', error);
      Alert.alert('Error', 'Failed to connect to Google Drive');
    }
  };

  const handleManualMirror = async () => {
    try {
      const tokens = await GoogleSignin.getTokens();
      if (!tokens.accessToken) {
        Alert.alert('Not Connected', 'Please connect to Google Drive first.');
        return;
      }

      setCloudLastStatus('Mirroring...');
      
      // 1. Create a fresh JSON snapshot
      const backup = await BackupService.createBackup(db, true);
      if (!backup) throw new Error('Failed to create local snapshot');
      
      await db.runAsync('DELETE FROM TacticalLogs');

      // 2. Read the snapshot content
      const content = await BackupService.readLocalBackup(backup.jsonUri);
      const jsonData = JSON.parse(content);

      // 3. Upload to cloud
      await BackupService.uploadToCloud(tokens.accessToken, jsonData);
      
      const ts = new Date().toLocaleString();
      setCloudLastSync(ts);
      setCloudLastStatus('Success (Mirrored)');
      await db.runAsync('UPDATE Settings SET value = ? WHERE key = ?', ['Success (Mirrored)', 'cloud_last_status']);
      await db.runAsync('UPDATE Settings SET value = ? WHERE key = ?', [ts, 'cloud_last_sync']);
      
      Alert.alert('Mirror Success', 'Your inventory is now securely mirrored in the cloud.');
    } catch (error) {
      console.error('[DRIVE] Manual mirror failed:', error);
      setCloudLastStatus('Mirror Failed');
      Alert.alert('Mirror Failed', 'Could not push data to cloud. Check your connection.');
    }
  };

  const handleCloudRestore = async () => {
    try {
      const tokens = await GoogleSignin.getTokens();
      if (!tokens.accessToken) {
        Alert.alert('Not Connected', 'Connect to Google to access cloud mirrors.');
        return;
      }

      setCloudLastStatus('Fetching...');
      const files = await BackupService.listCloudBackups(tokens.accessToken);
      
      if (files.length === 0) {
        Alert.alert('No Mirrors Found', 'You do not have any cloud mirrors saved yet.');
        return;
      }

      // Pick the latest
      const latest = files[0];
      
      Alert.alert(
        'Restore from Cloud',
        `Found mirror from ${new Date(latest.createdTime).toLocaleString()}. This will replace ALL current data. Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'RESTORE', 
            style: 'destructive',
            onPress: async () => {
              const jsonData = await BackupService.downloadFromCloud(tokens.accessToken, latest.id);
              await BackupService.restore(db, jsonData);
              Alert.alert('Restored', 'Intelligence data successfully mirrored from cloud.');
              // Trigger a refresh
              router.replace('/catalog');
            }
          }
        ]
      );
    } catch (error) {
      console.error('[DRIVE] Cloud restore failed:', error);
      Alert.alert('Restore Failed', 'Could not retrieve data from Google Drive.');
    } finally {
      setCloudLastStatus('Success (Connected)');
    }
  };

  const fetchMissionLogs = async () => {
    setIsBunkerLedger(false);
    // Use temporal look-back: show logs since the absolute latest archive
    const latestBackupTs = backups.length > 0 ? backups[0].timestamp : 0;
    const logs = await db.getAllAsync('SELECT * FROM TacticalLogs WHERE timestamp > ? ORDER BY timestamp DESC LIMIT 100', [latestBackupTs]);
    setMissionLogs(logs);

    if (currentCensus && backups.length > 0 && backups[0].counts) {
      const b = backups[0].counts;
      setMissionDelta({
        units: currentCensus.units - b.units,
        batches: currentCensus.batches - b.batches,
        types: currentCensus.types - b.types,
        categories: currentCensus.categories - b.categories,
        cabinets: currentCensus.cabinets - b.cabinets
      });
    } else {
      // If no baseline backup exists, we cannot calculate drift. Do not diff from empty.
      setMissionDelta(null);
    }

    setShowMissionLogs(true);
  };

  const load = async () => {
    const rows = await db.getAllAsync(`
      SELECT c.id as cat_id, c.name as cat_name, c.is_mess_hall as cat_is_mess_hall, i.id as type_id, i.name as type_name, i.unit_type as type_unit, i.is_favorite, i.interaction_count, i.default_size as type_default_size,
             i.min_stock_level, i.max_stock_level, i.freeze_months, i.default_cabinet_id, i.default_supplier, i.default_product_range,
             (SELECT COUNT(*) FROM Inventory v WHERE v.item_type_id = i.id) as type_stock_count,
             EXISTS(SELECT 1 FROM Inventory v JOIN Cabinets cab ON v.cabinet_id = cab.id WHERE v.item_type_id = i.id AND cab.cabinet_type = 'freezer') as in_freezer
      FROM Categories c
      LEFT JOIN ItemTypes i ON c.id = i.category_id
      ORDER BY c.name, i.name
    `);

    const grouped = rows.reduce((acc: any, row: any) => {
      let cat = acc.find((c: any) => c.id === row.cat_id);
      if (!cat) {
        cat = { id: row.cat_id, name: row.cat_name, is_mess_hall: row.cat_is_mess_hall === 1, types: [] };
        acc.push(cat);
      }
      if (row.type_id) {
        cat.types.push({ 
            id: row.type_id, 
            name: row.type_name, 
            unit_type: row.type_unit || 'weight', 
            is_favorite: row.is_favorite || 0,
            interaction_count: row.interaction_count || 0,
            default_size: row.type_default_size || '',
            stock_count: row.type_stock_count || 0,
            min_stock: row.min_stock_level,
            max_stock: row.max_stock_level,
            freeze_months: row.freeze_months ?? null,
            in_freezer: row.in_freezer === 1,
            default_cabinet_id: row.default_cabinet_id,
            default_supplier: row.default_supplier || '',
            default_product_range: row.default_product_range || '',
        });
      }
      return acc;
    }, []);

    setCategories(grouped as any[]);

    const uniqueItemCount = rows.filter((r: any) => r.type_id !== null).length;
    setTotalItemCount(uniqueItemCount);

    setMinReqCount(rows.filter((r: any) => r.type_id !== null && r.min_stock_level !== null).length);
    setMaxReqCount(rows.filter((r: any) => r.type_id !== null && r.max_stock_level !== null).length);
    const cabRows = await Database.Cabinets.getAll(db);

    setFreezerItemCount(rows.filter((r: any) => {
        if (r.type_id === null) return false;
        if (r.freeze_months !== null || r.in_freezer === 1) return true;
        const defaultCab = cabRows.find((c: any) => c.id === r.default_cabinet_id);
        return defaultCab?.cabinet_type === 'freezer';
    }).length);
    setCabinets(cabRows);
    setFreezerCabCount(cabRows.filter((c: any) => c.cabinet_type === 'freezer').length);

    const setRes = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', ['month_brief_enabled']);
    setAlertsEnabled(setRes?.value === '1');

    const backupRes = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', ['auto_backup_enabled']);
    setAutoBackupEnabled(backupRes?.value === '1');

    const cbeRes = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', ['cloud_backup_enabled']);
    setCloudBackupEnabled(cbeRes?.value === '1');
    const cschRes = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', ['cloud_schedule']);
    setCloudSchedule(cschRes?.value || 'Daily');
    const caccRes = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', ['cloud_account']);
    setCloudAccount(caccRes?.value || '');
    const clsRes = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', ['cloud_last_sync']);
    setCloudLastSync(clsRes?.value || '');
    const cltRes = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', ['cloud_last_status']);
    setCloudLastStatus(cltRes?.value || '');

    const schemaRes = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', ['schema_version']);
    setSchemaVersion(schemaRes?.value || '0');

    const mirrorRes = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', ['persistence_mirror_uri']);
    setMirrorUri(mirrorRes?.value || null);

    const emailRes = await db.getFirstAsync<{value: string}>('SELECT value FROM Settings WHERE key = ?', ['logistics_email']);
    setLogisticsEmail(emailRes?.value || '');

    const { backups: bList, bunker: bnk } = await BackupService.loadBackups();
    setBackups(bList);
    setBunker(bnk);

    // Compute Current Census (Standardized)
    const invCountRes = await db.getAllAsync<{q: any}>('SELECT quantity as q FROM Inventory');
    setCurrentCensus({
      units: invCountRes.reduce((sum, r) => sum + Number(r.q || 0), 0),
      batches: invCountRes.length,
      types: uniqueItemCount,
      categories: grouped.length,
      cabinets: cabRows.length
    });

    // Load Vocabulary
    try {
      const dbSuppliers = await db.getAllAsync<{default_supplier: string}>("SELECT DISTINCT default_supplier FROM ItemTypes WHERE default_supplier IS NOT NULL AND default_supplier != ''");
      const invSuppliers = await db.getAllAsync<{supplier: string}>("SELECT DISTINCT supplier FROM Inventory WHERE supplier IS NOT NULL AND supplier != ''");
      
      const rawVocabulary = [
        ...Object.keys(SUPPLIERS_DATA),
        ...Object.keys(BRANDS_DATA),
        ...dbSuppliers.map(s => s.default_supplier),
        ...invSuppliers.map(s => s.supplier)
      ];

      const normalized = new Map<string, string>();
      rawVocabulary.forEach(v => {
        if (!v) return;
        const key = v.trim().toLowerCase();
        if (!normalized.has(key)) {
          normalized.set(key, v.trim());
        }
      });
      setSupplierVocabulary(Array.from(normalized.values()).sort());

      // Fetch Supplier Usage Counts
      const sStats = await db.getAllAsync<{val: string, total: number}>(`
        SELECT val, SUM(count) as total FROM (
          SELECT supplier as val, COUNT(*) as count FROM Inventory WHERE supplier IS NOT NULL AND supplier != '' GROUP BY supplier
          UNION ALL
          SELECT default_supplier as val, COUNT(*) as count FROM ItemTypes WHERE default_supplier IS NOT NULL AND default_supplier != '' GROUP BY default_supplier
        ) GROUP BY val
      `);
      const sMap: Record<string, number> = {};
      sStats.forEach(s => { sMap[s.val.toLowerCase()] = s.total; });
      setSupplierCounts(sMap);

      const dbRanges = await db.getAllAsync<{default_product_range: string}>("SELECT DISTINCT default_product_range FROM ItemTypes WHERE default_product_range IS NOT NULL AND default_product_range != ''");
      const invRanges = await db.getAllAsync<{product_range: string}>("SELECT DISTINCT product_range FROM Inventory WHERE product_range IS NOT NULL AND product_range != ''");
      
      const rawR = [
        ...dbRanges.map(r => r.default_product_range),
        ...invRanges.map(r => r.product_range)
      ];
      const normalizedR = new Map<string, string>();
      rawR.forEach(v => {
        if (!v) return;
        const key = v.trim().toLowerCase();
        if (!normalizedR.has(key)) normalizedR.set(key, v.trim());
      });
      setRangeVocabulary(Array.from(normalizedR.values()).sort());

      // Fetch Range Usage Counts
      const rStats = await db.getAllAsync<{val: string, total: number}>(`
        SELECT val, SUM(count) as total FROM (
          SELECT product_range as val, COUNT(*) as count FROM Inventory WHERE product_range IS NOT NULL AND product_range != '' GROUP BY product_range
          UNION ALL
          SELECT default_product_range as val, COUNT(*) as count FROM ItemTypes WHERE default_product_range IS NOT NULL AND default_product_range != '' GROUP BY default_product_range
        ) GROUP BY val
      `);
      const rMap: Record<string, number> = {};
      rStats.forEach(r => { rMap[r.val.toLowerCase()] = r.total; });
      setRangeCounts(rMap);
    } catch (e) {
      console.error("Failed to load vocabulary", e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );


  const updateSupplierSuggestions = (val: string) => {
    if (val.trim().length > 0) {
      const matches = supplierVocabulary
        .filter(s => s.toLowerCase().includes(val.toLowerCase()))
        .sort((a, b) => {
          const aLower = a.toLowerCase();
          const bLower = b.toLowerCase();
          const aStart = aLower.startsWith(val.toLowerCase());
          const bStart = bLower.startsWith(val.toLowerCase());
          if (aStart && !bStart) return -1;
          if (!aStart && bStart) return 1;

          const aCount = supplierCounts[aLower] || 0;
          const bCount = supplierCounts[bLower] || 0;
          if (aCount !== bCount) return bCount - aCount;

          return a.localeCompare(b);
        })
        .slice(0, 3);
      setSuggestedTypeAheadSuppliers(matches);
    } else {
      setSuggestedTypeAheadSuppliers([]);
    }
  };

  const updateRangeSuggestions = (val: string) => {
    if (val.trim().length > 0) {
      const matches = rangeVocabulary
        .filter(r => r.toLowerCase().includes(val.toLowerCase()))
        .sort((a, b) => {
          const aLower = a.toLowerCase();
          const bLower = b.toLowerCase();
          const aStart = aLower.startsWith(val.toLowerCase());
          const bStart = bLower.startsWith(val.toLowerCase());
          if (aStart && !bStart) return -1;
          if (!aStart && bStart) return 1;

          const aCount = rangeCounts[aLower] || 0;
          const bCount = rangeCounts[bLower] || 0;
          if (aCount !== bCount) return bCount - aCount;

          return r.localeCompare(b);
        })
        .slice(0, 3);
      setSuggestedTypeAheadRanges(matches);
    } else {
      setSuggestedTypeAheadRanges([]);
    }
  };



  const handlePurgeVocabulary = async (val: string, type: 'supplier' | 'range') => {
    // Instant UI feedback: surgically remove from all active states
    if (type === 'supplier') {
      setSuggestedTypeAheadSuppliers(prev => prev.filter(item => item !== val));
      setSupplierVocabulary(prev => prev.filter(s => s !== val));
    } else {
      setSuggestedTypeAheadRanges(prev => prev.filter(item => item !== val));
      setRangeVocabulary(prev => prev.filter(r => r !== val));
    }

    // Background Database Cleanup
    try {
      if (type === 'supplier') {
        await db.runAsync("UPDATE ItemTypes SET default_supplier = NULL WHERE default_supplier = ?", [val]);
        await db.runAsync("UPDATE Inventory SET supplier = NULL WHERE supplier = ?", [val]);
      } else {
        await db.runAsync("UPDATE ItemTypes SET default_product_range = NULL WHERE default_product_range = ?", [val]);
        await db.runAsync("UPDATE Inventory SET product_range = NULL WHERE product_range = ?", [val]);
      }
      load(); // Sync full state in background
    } catch (e) {
      console.error("Purge failed in background", e);
    }
  };


  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;

    if (categories.length >= limits.categories && !hasFullAccess) {
      checkEntitlement('CATEGORY_LIMIT');
      return;
    }

    const res = await db.runAsync('INSERT INTO Categories (name, icon, is_mess_hall) VALUES (?, ?, ?)', [newCatName, 'box', 1]);
    await logTacticalAction(db, 'ADD', 'CATEGORY', Number(res.lastInsertRowId), newCatName);
    setNewCatName('');
    load();
  };

  const handleAddItemType = async (catId: number) => {
    if (!newItemName.trim() || selectedCat !== catId) return;

    if (totalItemCount >= limits.items && !hasFullAccess) {
      checkEntitlement('ITEM_LIMIT');
      return;
    }

    let finalDefaultSize = null;
    const rawNumber = newItemDefaultSize.replace(/[^0-9.]/g, '');
    if (rawNumber) finalDefaultSize = rawNumber;

    if (newItemMinStock && newItemMaxStock && parseInt(newItemMaxStock) < parseInt(newItemMinStock)) {
      Alert.alert('Logistics Error', 'Max target must be greater than or equal to Min threshold.');
      return;
    }

    if (newItemFreezeMonths && !hasFullAccess) {
      if (freezerItemCount >= limits.freezer_items) {
        checkEntitlement('FREEZER_LIMIT');
        return;
      }
    }

    const res = await db.runAsync('INSERT INTO ItemTypes (category_id, name, unit_type, default_size, min_stock_level, max_stock_level, freeze_months, default_cabinet_id, default_supplier, default_product_range) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        catId, newItemName, newItemUnit, finalDefaultSize, 
        newItemMinStock ? parseInt(newItemMinStock) : null,
        newItemMaxStock ? parseInt(newItemMaxStock) : null,
        newItemFreezeMonths ? parseInt(newItemFreezeMonths) : null,
        newItemDefaultCabinet,
        newItemSupplier || null,
        newItemRange || null
    ]);
    await logTacticalAction(db, 'ADD', 'ITEM_TYPE', Number(res.lastInsertRowId), newItemName);
    setNewItemName('');
    setNewItemDefaultSize('');
    setSelectedCat(null);
    setNewItemUnit('weight');
    setNewItemMinStock('');
    setNewItemMaxStock('');
    setNewItemFreezeMonths('');
    setNewItemSupplier('');
    setNewItemRange('');
    setNewItemDefaultCabinet(null);
    load();
  };

  const handleDeleteItemType = async (typeId: number) => {
    const count = await db.getFirstAsync<{c: number}>('SELECT COUNT(*) as c FROM Inventory WHERE item_type_id = ?', [typeId]);
    if (count && count.c > 0) {
      Alert.alert('Cannot Delete', 'This item type has stock. Please delete the stock first.');
      return;
    }
    const typeNameRes = await db.getFirstAsync<{name: string}>('SELECT name FROM ItemTypes WHERE id = ?', [typeId]);
    await db.runAsync('DELETE FROM ItemTypes WHERE id = ?', [typeId]);
    await logTacticalAction(db, 'DELETE', 'ITEM_TYPE', typeId, typeNameRes?.name || 'Unknown');
    load();
  };

  const handleUpdateCategory = async (catId: number) => {
    if (!editingCatName.trim()) {
      setEditingCatId(null);
      return;
    }
    const old = categories.find(c => c.id === catId);
    const diff: any = {};
    if (old) {
       const norm = (v: any) => (v === null || v === undefined || v === '') ? null : v;
       if (norm(old.name) !== norm(editingCatName)) diff.name = editingCatName;
       if (old.is_mess_hall !== editingCatIsMessHall) diff.mess_hall = editingCatIsMessHall;
    }
    await db.runAsync('UPDATE Categories SET name = ?, is_mess_hall = ? WHERE id = ?', [editingCatName, editingCatIsMessHall ? 1 : 0, catId]);
    await logTacticalAction(db, 'UPDATE', 'CATEGORY', catId, editingCatName, Object.keys(diff).length > 0 ? JSON.stringify(diff) : null);
    setEditingCatId(null);
    load();
  };

  const handleDeleteCabinet = async (cabId: number, hasStock: boolean) => {
    try {
      await Database.Cabinets.delete(db, cabId);
      load();
    } catch (e: any) {
      Alert.alert('Deployment Error', e.message);
    }
  };

  const handleCreateInlineCabinet = async () => {
    if (!inlineCabName.trim()) return;

    if (cabinets.length >= limits.cabinets && !hasFullAccess) {
      checkEntitlement('CABINET_LIMIT');
      return;
    }
    if (inlineCabType === 'freezer' && freezerCabCount >= limits.freezer_cabs && !hasFullAccess) {
      checkEntitlement('FREEZER_CABINET_LIMIT');
      return;
    }
    const res = await db.runAsync('INSERT INTO Cabinets (name, location, cabinet_type) VALUES (?, ?, ?)', [inlineCabName.trim(), inlineCabLoc.trim(), inlineCabType]);
    const newCabId = res.lastInsertRowId;
    await logTacticalAction(db, 'ADD', 'CABINET', Number(newCabId), inlineCabName.trim());
    
    setShowInlineAddCabinet(false);
    setInlineCabName('');
    setInlineCabLoc('');
    setInlineCabType('standard');
    
    if (inlineCabContext === 'new_item') {
       setNewItemDefaultCabinet(Number(newCabId));
    } else {
       setEditingTypeDefaultCabinet(Number(newCabId));
    }
    load();
  };

  const toggleAlerts = async (val: boolean) => {
    setAlertsEnabled(val);
    await db.runAsync('UPDATE Settings SET value = ? WHERE key = ?', [val ? '1' : '0', 'month_brief_enabled']);
    load();
  };

  const toggleAutoBackup = async (val: boolean) => {
    setAutoBackupEnabled(val);
    await db.runAsync('UPDATE Settings SET value = ? WHERE key = ?', [val ? '1' : '0', 'auto_backup_enabled']);
    load();
  };

  const handleToggleCloudBackup = async (val: boolean) => {
    if (val) {
      if (!cloudAccount) {
        setShowCloudConsentModal(true);
      } else {
        setCloudBackupEnabled(true);
        await db.runAsync('UPDATE Settings SET value = ? WHERE key = ?', ['1', 'cloud_backup_enabled']);
      }
    } else {
      setCloudBackupEnabled(false);
      await db.runAsync('UPDATE Settings SET value = ? WHERE key = ?', ['0', 'cloud_backup_enabled']);
    }
  };

  const handleEnableCloudSync = async () => {
    setShowCloudConsentModal(false);
    await handleGoogleAuth();
  };

  const handleDisconnectCloud = async () => {
    Alert.alert(
      'Disconnect Google Drive',
      'This will stop automated cloud backups and remove your account connection from this device. Local data will remain intact.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'DISCONNECT', 
          style: 'destructive',
          onPress: async () => {
            setCloudAccount('');
            setCloudBackupEnabled(false);
            setCloudLastStatus('Disconnected');
            
            if (Platform.OS !== 'web') {
              try {
                await GoogleSignin.signOut();
                await GoogleSignin.revokeAccess();
              } catch (e) {
                console.log('[DRIVE] SignOut error:', e);
              }
            }
            
            await GoogleDriveService.logout();
            await db.runAsync("UPDATE Settings SET value = '0' WHERE key = 'cloud_backup_enabled'");
            await db.runAsync("DELETE FROM Settings WHERE key = 'cloud_account'");
            await db.runAsync("DELETE FROM Settings WHERE key = 'cloud_last_sync'");
            await db.runAsync("DELETE FROM Settings WHERE key = 'cloud_last_status'");
            
            load();
          }
        }
      ]
    );
  };


  const handleLocalRestore = async (item: BackupMetadata) => {
    Alert.alert(
      'Tactical Recovery',
      `Recover system from snapshot: ${item.name.replace('war-cabinet-backup-', '')}?\n\nThis will OVERWRITE all current data.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'RESTORE', 
          style: 'destructive',
          onPress: async () => {
            try {
              const content = await BackupService.readLocalBackup(item.uri);
              const data = JSON.parse(content);
              const success = await BackupService.restore(db, data);
              if (success) {
                Alert.alert('Success', 'System state recovered.');
                load();
              }
            } catch (e: any) {
              Alert.alert('Restore Failed', e.message || 'Corrupt snapshot.');
            }
          }
        }
      ]
    );
  };

  const handlePersistentMirrorSetup = async () => {
    const uri = await BackupService.pickPersistentFolder(db);
    if (uri) {
        Alert.alert('Mirroring Active', 'Automated shadow copies will now be mirrored to your chosen folder.');
        load();
    }
  };

  const handleToggleMirror = async (val: boolean) => {
    if (val) {
      await handlePersistentMirrorSetup();
    } else {
      await db.runAsync('UPDATE Settings SET value = ? WHERE key = ?', ['', 'persistence_mirror_uri']);
      load();
    }
  };

  const handleRestore = async () => {
    if (!checkEntitlement('BACKUPS')) return;
    Alert.alert(
      'System Recovery',
      'This will WIPE all current stock and restore from the selected file. This action cannot be undone. Proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'SELECT FILE', 
          onPress: async () => {
            try {
              const success = await BackupService.pickAndRestore(db);
              if (success) {
                Alert.alert('Restore Complete', 'System state has been successfully recovered.');
                load();
              }
            } catch (e: any) {
              Alert.alert('Restore Failed', e.message || 'Invalid or corrupt backup file.');
            }
          } 
        }
      ]
    );
  };

  const handleUpdateItemType = async (typeId: number) => {
    if (!editingTypeName.trim()) {
      setEditingTypeId(null);
      return;
    }

    let finalDefaultSize = null;
    const rawNumber = editingTypeDefaultSize.replace(/[^0-9.]/g, '');
    if (rawNumber) finalDefaultSize = rawNumber;

    if (editingTypeMinStock && editingTypeMaxStock && parseInt(editingTypeMaxStock) < parseInt(editingTypeMinStock)) {
      Alert.alert('Logistics Error', 'Max target must be greater than or equal to Min threshold.');
      return;
    }

    const isNowFreezer = !!editingTypeFreezeMonths || cabinets.find(c => c.id === Number(editingTypeDefaultCabinet))?.cabinet_type === 'freezer';

    if (isNowFreezer && !hasFullAccess) {
      // Find the existing item to see if it was ALREADY a freezer item
      let wasFreezer = false;
      categories.forEach(c => {
        const found = c.types.find((t: any) => t.id === typeId);
        if (found) {
            const defaultCab = cabinets.find(cab => cab.id === found.default_cabinet_id);
            if (found.freeze_months !== null || found.in_freezer || defaultCab?.cabinet_type === 'freezer') {
                wasFreezer = true;
            }
        }
      });

      if (!wasFreezer) {
        if (freezerItemCount >= limits.freezer_items) {
          checkEntitlement('FREEZER_LIMIT');
          return;
        }
      }
    }

    const old = await db.getFirstAsync<any>('SELECT * FROM ItemTypes WHERE id = ?', [typeId]);
    const diff: any = {};
    if (old) {
       const norm = (v: any) => (v === null || v === undefined || v === '') ? null : v;
       if (norm(old.name) !== norm(editingTypeName)) diff.name = editingTypeName;
       if (norm(old.category_id) !== norm(editingTypeCategoryId)) diff.category = editingTypeCategoryId;
       if (norm(old.unit_type) !== norm(editingTypeUnit)) diff.unit = editingTypeUnit;
       if (norm(old.default_size) !== norm(finalDefaultSize)) diff.size = finalDefaultSize;
       if (norm(old.default_cabinet_id) !== norm(editingTypeDefaultCabinet)) diff.cabinet = editingTypeDefaultCabinet;
       if (norm(old.min_stock_level) !== norm(editingTypeMinStock ? parseInt(editingTypeMinStock) : null)) diff.min_stock = editingTypeMinStock;
       if (norm(old.max_stock_level) !== norm(editingTypeMaxStock ? parseInt(editingTypeMaxStock) : null)) diff.max_stock = editingTypeMaxStock;
       if (norm(old.freeze_months) !== norm(editingTypeFreezeMonths ? parseInt(editingTypeFreezeMonths) : null)) diff.freeze_months = editingTypeFreezeMonths;
       if (norm(old.default_supplier) !== norm(editingTypeSupplier)) diff.supplier = editingTypeSupplier;
       if (norm(old.default_product_range) !== norm(editingTypeRange)) diff.range = editingTypeRange;
    }

    await db.runAsync('UPDATE ItemTypes SET name = ?, category_id = ?, unit_type = ?, default_size = ?, default_cabinet_id = ?, min_stock_level = ?, max_stock_level = ?, freeze_months = ?, default_supplier = ?, default_product_range = ? WHERE id = ?', [
        editingTypeName, editingTypeCategoryId, editingTypeUnit, finalDefaultSize, editingTypeDefaultCabinet,
        editingTypeMinStock ? parseInt(editingTypeMinStock) : null,
        editingTypeMaxStock ? parseInt(editingTypeMaxStock) : null,
        editingTypeFreezeMonths ? parseInt(editingTypeFreezeMonths) : null,
        editingTypeSupplier || null,
        editingTypeRange || null,
        typeId
    ]);
    await logTacticalAction(db, 'UPDATE', 'ITEM_TYPE', typeId, editingTypeName, Object.keys(diff).length > 0 ? JSON.stringify(diff) : null);
    if (editingTypeCategoryId) {
      setExpandedCatId(editingTypeCategoryId);
      const index = categories.findIndex(c => c.id === editingTypeCategoryId);
      if (index !== -1) {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
        }, 150);
      }
    }
    setEditingTypeId(null);
    setEditingTypeFreezeMonths('');
    setEditingTypeSupplier('');
    setEditingTypeRange('');
    load();
  };

  const toggleMessHall = async (cat: any) => {
    const newVal = !cat.is_mess_hall;
    await db.runAsync('UPDATE Categories SET is_mess_hall = ? WHERE id = ?', [newVal ? 1 : 0, cat.id]);
    load();
  };

  const toggleFavorite = async (typeId: number, current: number) => {
    await db.runAsync('UPDATE ItemTypes SET is_favorite = ? WHERE id = ?', current === 1 ? 0 : 1, typeId);
    load();
  };

  const handleDeleteCategory = async (catId: number, hasTypes: boolean) => {
    if (hasTypes) return;
    const catNameRes = await db.getFirstAsync<{name: string}>('SELECT name FROM Categories WHERE id = ?', [catId]);
    await db.runAsync('DELETE FROM Categories WHERE id = ?', catId);
    await logTacticalAction(db, 'DELETE', 'CATEGORY', catId, catNameRes?.name || 'Unknown');
    load();
  };

  const toggleCategory = (id: number) => {
    setExpandedCatId(prev => (prev === id ? null : id));
    if (expandedCatId !== id) {
      const index = categories.findIndex(c => c.id === id);
      if (index !== -1) {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
        }, 150);
      }
    }
  };

  const renderCategory = ({ item: cat }: any) => {
    const isExpanded = expandedCatId === cat.id;
    const favoriteCount = cat.types.filter((t: any) => t.is_favorite).length;
    const targetsSet = cat.types.filter((t: any) => t.min_stock !== null || t.max_stock !== null).length;

    return (
      <View style={styles.catCard}>
        <TouchableOpacity 
          onPress={() => toggleCategory(cat.id)}
          style={[styles.catHeader, {flexDirection: 'column', alignItems: 'stretch'}]}
          activeOpacity={0.7}
          testID={`category-header-${cat.name.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {/* TOP ROW: TITLE AND ACTIONS */}
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
            <View style={{flex: 1, marginRight: 10}}>
              {editingCatId === cat.id ? (
                <View style={{flexDirection: 'row', alignItems: 'center', height: 40}}>
                  <TextInput 
                    style={[styles.catTitleInput, {flex: 1}]} 
                    value={editingCatName} 
                    onChangeText={setEditingCatName} 
                    autoFocus
                  />
                  <TouchableOpacity onPress={() => handleUpdateCategory(cat.id)} style={styles.saveActionBtn}>
                    <MaterialCommunityIcons name="check" size={20} color="white" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingCatId(null)} style={{marginLeft: 8}}>
                    <MaterialCommunityIcons name="close" size={20} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{height: 40, justifyContent: 'center'}}>
                  <Text style={styles.catTitle} numberOfLines={1}>{cat.name}</Text>
                </View>
              )}
            </View>

            <View style={styles.catActions}>
              {editingCatId !== cat.id && (
                <>
                  <TouchableOpacity onPress={() => { setEditingCatId(cat.id); setEditingCatName(cat.name); setEditingCatIsMessHall(cat.is_mess_hall); }} style={{marginRight: 12}}>
                    <MaterialCommunityIcons name="pencil" size={20} color="#3b82f6" />
                  </TouchableOpacity>
                  <TouchableOpacity disabled={cat.types.length > 0} onPress={() => handleDeleteCategory(cat.id, cat.types.length > 0)} style={{marginRight: 12}}>
                    <MaterialCommunityIcons name="delete" size={20} color={cat.types.length > 0 ? "#334155" : "#ef4444"} />
                  </TouchableOpacity>
                </>
              )}
              <MaterialCommunityIcons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={24} color="#64748b" />
            </View>
          </View>

          {/* BOTTOM ROW: METRICS & MESS HALL TOGGLE (ALWAYS VISIBLE) */}
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8}}>
            <View style={{flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', flex: 1}}>
              <Text style={{color: '#94a3b8', fontSize: 10, fontWeight: 'bold'}}>{cat.types.length} {cat.types.length === 1 ? 'ITEM' : 'ITEMS'}</Text>
              {favoriteCount > 0 && (
                <>
                  <Text style={{color: '#334155', marginHorizontal: 4}}>•</Text>
                  <MaterialCommunityIcons name="star" size={10} color="#eab308" />
                  <Text style={{color: '#94a3b8', fontSize: 10, fontWeight: 'bold', marginLeft: 2}}>
                    {favoriteCount}
                  </Text>
                </>
              )}
              {targetsSet > 0 && (
                <>
                  <Text style={{color: '#334155', marginHorizontal: 4}}>•</Text>
                  <Text style={{color: '#94a3b8', fontSize: 10, fontWeight: 'bold'}}>{targetsSet} TARGETS</Text>
                </>
              )}
            </View>

            <TouchableOpacity 
              activeOpacity={1} 
              onPress={(e) => { e.stopPropagation(); }} // Prevent expansion toggle when playing with the switch
              style={{flexDirection: 'row', alignItems: 'center'}}
            >
              <Switch 
                value={cat.is_mess_hall} 
                onValueChange={() => toggleMessHall(cat)}
                trackColor={{ false: "#334155", true: "#3b82f6" }}
                thumbColor={cat.is_mess_hall ? "#ffffff" : "#94a3b8"}
                style={Platform.OS === 'ios' ? { transform: [{ scaleX: .6 }, { scaleY: .6 }] } : { transform: [{ scaleX: .8 }, { scaleY: .8 }] }}
              />
              <Text style={{color: cat.is_mess_hall ? '#3b82f6' : '#475569', fontSize: 9, fontWeight: 'bold', marginLeft: 2}}>MESS HALL</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>


        {isExpanded && (
          <View style={{marginTop: 10}}>
            {cat.types.map((type: any) => (
              <View key={type.id} style={styles.typeRow} testID={`type-row-${type.name.toLowerCase().replace(/\s+/g, '-')}`}>
                {editingTypeId === type.id ? (
                  <View style={{flexDirection: 'column', padding: 12, backgroundColor: '#0f172a', borderRadius: 10, marginTop: 8}}>
                    <View style={styles.formSection}>
                      <Text style={styles.miniLabel}>NAME <Text style={{color: '#f43f5e'}}>*</Text></Text>
                      <TextInput style={styles.inputSmall} value={editingTypeName} onChangeText={setEditingTypeName} placeholder="Item Name" placeholderTextColor="#64748b" />
                    </View>

                    <View style={styles.formSection}>
                      <Text style={styles.miniLabel}>CATEGORY <Text style={{color: '#f43f5e'}}>*</Text></Text>
                      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
                        {categories.map(c => (
                          <TouchableOpacity
                            key={c.id}
                            style={[styles.chip, editingTypeCategoryId === c.id && styles.chipActive]}
                            onPress={() => setEditingTypeCategoryId(c.id)}
                          >
                            <Text style={[styles.chipText, editingTypeCategoryId === c.id && styles.chipTextActive]}>{c.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <View style={styles.formSection}>
                      <Text style={styles.miniLabel}>UNIT <Text style={{color: '#f43f5e'}}>*</Text></Text>
                      <View style={styles.unitChipRowMini}>
                        <TouchableOpacity style={[styles.unitChip, editingTypeUnit === 'weight' && styles.unitChipActive]} onPress={() => setEditingTypeUnit('weight')}><Text style={[styles.unitChipText, editingTypeUnit === 'weight' && styles.unitChipTextActive]}>Weight</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.unitChip, editingTypeUnit === 'volume' && styles.unitChipActive]} onPress={() => setEditingTypeUnit('volume')}><Text style={[styles.unitChipText, editingTypeUnit === 'volume' && styles.unitChipTextActive]}>Volume</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.unitChip, editingTypeUnit === 'count' && styles.unitChipActive]} onPress={() => setEditingTypeUnit('count')}><Text style={[styles.unitChipText, editingTypeUnit === 'count' && styles.unitChipTextActive]}>Count</Text></TouchableOpacity>
                      </View>
                    </View>

                    <View style={{ backgroundColor: '#1e293b', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#334155', marginBottom: 16 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#0f172a' }}>
                        <MaterialCommunityIcons name="target" size={16} color="#fb923c" />
                        <Text style={{ flex: 1, color: '#94a3b8', fontSize: 11, fontStyle: 'italic', lineHeight: 16 }}>
                          <Text style={{fontWeight: 'bold', color: '#cbd5e1', fontStyle: 'normal'}}>QUARTERMASTER: </Text>
                          Set optional thresholds for stock alerts and restocking reports. Leave blank if you don't track stock levels for this item.
                        </Text>
                      </View>

                      <View style={{flexDirection: 'row', gap: 10}}>
                          <View style={{flex: 1}}>
                            <Text style={styles.miniLabel}>MIN STOCK</Text>
                            <TextInput style={styles.inputSmall} value={editingTypeMinStock} onChangeText={setEditingTypeMinStock} keyboardType="numeric" placeholder="Min" placeholderTextColor="#64748b" />
                          </View>
                          <View style={{flex: 1}}>
                            <Text style={styles.miniLabel}>MAX STOCK</Text>
                            <TextInput style={styles.inputSmall} value={editingTypeMaxStock} onChangeText={setEditingTypeMaxStock} keyboardType="numeric" placeholder="Max" placeholderTextColor="#64748b" />
                          </View>
                      </View>
                    </View>

                    <View style={{ backgroundColor: '#1e293b', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#334155', marginBottom: 16 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#0f172a' }}>
                        <MaterialCommunityIcons name="information-outline" size={16} color="#60a5fa" />
                        <Text style={{ flex: 1, color: '#94a3b8', fontSize: 11, fontStyle: 'italic', lineHeight: 16 }}>
                          <Text style={{fontWeight: 'bold', color: '#cbd5e1', fontStyle: 'normal'}}>PRO TIP: </Text>
                          Setting defaults below is optional, but pre-fills your forms to ensure frictionless batch entry in the heat of the moment.
                        </Text>
                      </View>

                    <View style={{flexDirection: 'row', gap: 10, marginBottom: 12}}>
                        <View style={{flex: 1}}>
                          <Text style={styles.miniLabel}>DEFAULT SIZE ({editingTypeUnit === 'volume' ? 'ml' : editingTypeUnit === 'weight' ? 'g' : 'Units'})</Text>
                          <TextInput style={styles.inputSmall} value={editingTypeDefaultSize} onChangeText={setEditingTypeDefaultSize} keyboardType="numeric" placeholder="Size / Qty" placeholderTextColor="#64748b" />
                        </View>
                        <View style={{flex: 1}}>
                          <Text style={[styles.miniLabel, {color: '#60a5fa'}]}>❄ FREEZE (M)</Text>
                          <TextInput style={[styles.inputSmall, {borderColor: '#1e3a5f'}]} value={editingTypeFreezeMonths} onChangeText={setEditingTypeFreezeMonths} keyboardType="numeric" placeholder="e.g. 6" placeholderTextColor="#475569" testID="edit-item-freeze-months-input" />
                        </View>
                    </View>

                    <View style={{ marginBottom: 8 }}>
                      <Text style={styles.miniLabel}>DEFAULT BRAND / SUPPLIER</Text>
                      <TextInput 
                        style={styles.inputSmall} 
                        value={editingTypeSupplier} 
                        onChangeText={(val) => {
                          setEditingTypeSupplier(val);
                          updateSupplierSuggestions(val);
                        }} 
                        placeholder="Heinz, Nestle, Tesco, Walmart..." 
                        placeholderTextColor="#64748b" 
                      />
                      <View style={{ height: 26, justifyContent: 'flex-start', alignItems: 'center', marginTop: 4, flexDirection: 'row' }}>
                        {suggestedTypeAheadSuppliers.length > 0 && editingTypeSupplier.length > 0 && (
                          <View style={{ flexDirection: 'row', gap: 4 }}>
                            {suggestedTypeAheadSuppliers.slice(0, 3).map(s => {
                              const isCore = Object.keys(SUPPLIERS_DATA).some(k => k.toLowerCase() === s.toLowerCase()) || 
                                             Object.keys(BRANDS_DATA).some(k => k.toLowerCase() === s.toLowerCase());
                              return (
                                <View key={s} style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingLeft: 6, paddingRight: isCore ? 6 : 4, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}>
                                  <TouchableOpacity onPress={() => { setEditingTypeSupplier(s); setSuggestedTypeAheadSuppliers([]); }}>
                                    <Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>{s.toUpperCase()}</Text>
                                  </TouchableOpacity>
                                  {!isCore && (
                                    <TouchableOpacity 
                                      onPress={() => handlePurgeVocabulary(s, 'supplier')}
                                      hitSlop={{top: 20, bottom: 20, left: 20, right: 20}}
                                      style={{padding: 2}}
                                    >
                                      <MaterialCommunityIcons name="trash-can-outline" size={14} color="#f43f5e" />
                                    </TouchableOpacity>
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={{ marginBottom: 8 }}>
                      <Text style={styles.miniLabel}>DEFAULT RANGE</Text>
                      <TextInput 
                        style={styles.inputSmall} 
                        value={editingTypeRange} 
                        onChangeText={(val) => {
                          setEditingTypeRange(val);
                          updateRangeSuggestions(val);
                        }} 
                        placeholder="e.g. Finest" 
                        placeholderTextColor="#64748b" 
                      />
                      <View style={{ height: 26, justifyContent: 'flex-start', alignItems: 'center', marginTop: 4, flexDirection: 'row' }}>
                        {suggestedTypeAheadRanges.length > 0 && editingTypeRange.length > 0 && (
                          <View style={{ flexDirection: 'row', gap: 4 }}>
                            {suggestedTypeAheadRanges.slice(0, 3).map(r => (
                              <View key={r} style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingLeft: 6, paddingRight: 4, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}>
                                <TouchableOpacity onPress={() => { setEditingTypeRange(r); setSuggestedTypeAheadRanges([]); }}>
                                  <Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>{r.toUpperCase()}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                  onPress={() => handlePurgeVocabulary(r, 'range')}
                                  hitSlop={{top: 20, bottom: 20, left: 20, right: 20}}
                                  style={{padding: 2}}
                                >
                                  <MaterialCommunityIcons name="trash-can-outline" size={14} color="#f43f5e" />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={styles.formSection}>
                        <Text style={styles.miniLabel}>DEFAULT CABINET</Text>
                        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8}}>
                            <TouchableOpacity 
                              key="none" 
                              style={[styles.chip, !editingTypeDefaultCabinet && styles.chipActive]} 
                              onPress={() => setEditingTypeDefaultCabinet(null)}
                            >
                              <Text style={[styles.chipText, !editingTypeDefaultCabinet && styles.chipTextActive]}>No Default</Text>
                            </TouchableOpacity>
                            {cabinets.map(cab => (
                                <TouchableOpacity 
                                  key={cab.id} 
                                  style={[styles.chip, editingTypeDefaultCabinet === cab.id && styles.chipActive]} 
                                  onPress={() => setEditingTypeDefaultCabinet(cab.id)}
                                >
                                    <Text style={[styles.chipText, editingTypeDefaultCabinet === cab.id && styles.chipTextActive]}>{cab.cabinet_type === 'freezer' ? '❄ ' : ''}{cab.name}</Text>
                                </TouchableOpacity>
                            ))}
                            <TouchableOpacity 
                              style={[styles.chip, { borderColor: '#3b82f6', borderWidth: 1, backgroundColor: '#0f172a' }]} 
                              onPress={() => { setInlineCabContext('edit_item'); setShowInlineAddCabinet(true); }}
                            >
                                <Text style={[styles.chipText, { color: '#3b82f6' }]}>+ NEW CABINET</Text>
                            </TouchableOpacity>
                        </View>
                        {cabinets.some(c => c.cabinet_type === 'freezer') && (
                            <Text style={{ color: '#64748b', fontSize: 11, fontStyle: 'italic', marginTop: -2, marginBottom: 4 }}>❄ Designated Freezer Cabinet</Text>
                        )}
                    </View>
                    </View>


                    <TouchableOpacity onPress={() => handleUpdateItemType(type.id)} style={[styles.addSaveBtnFull, { marginTop: 16 }]}><Text style={styles.addSaveText}>SAVE CHANGES</Text></TouchableOpacity>
                    <TouchableOpacity style={{marginTop: 12, alignItems: 'center'}} onPress={() => setEditingTypeId(null)}><Text style={{color: '#64748b', fontSize: 12, fontWeight: 'bold'}}>CANCEL</Text></TouchableOpacity>
                  </View>
                ) : (
                  <View style={{flexDirection: 'column', width: '100%'}}>
                    <View style={{flexDirection: 'row', alignItems: 'center', width: '100%'}}>
                      <TouchableOpacity onPress={() => toggleFavorite(type.id, type.is_favorite)} style={{marginRight: 12}}>
                        <MaterialCommunityIcons name={type.is_favorite ? "star" : "star-outline"} size={24} color={type.is_favorite ? "#eab308" : "#334155"} />
                      </TouchableOpacity>
                      <Text style={styles.typeText}>{type.name}</Text>
                      <View style={styles.catActions}>
                        <TouchableOpacity onPress={async () => { setEditingTypeId(type.id); setEditingTypeName(type.name); setEditingTypeUnit(type.unit_type || 'weight'); setEditingTypeDefaultSize(type.default_size || ''); setEditingTypeMinStock(type.min_stock !== null ? type.min_stock.toString() : ''); setEditingTypeMaxStock(type.max_stock !== null ? type.max_stock.toString() : ''); setEditingTypeFreezeMonths(type.freeze_months !== null && type.freeze_months !== undefined ? type.freeze_months.toString() : ''); setEditingTypeDefaultCabinet(type.default_cabinet_id || null); setEditingTypeSupplier(type.default_supplier || ''); setEditingTypeRange(type.default_product_range || ''); setEditingTypeCategoryId(cat.id); }} style={{marginRight: 10, marginTop: 4}} testID={`edit-type-btn-${type.name.toLowerCase().replace(/\s+/g, '-')}`}><MaterialCommunityIcons name="pencil" size={20} color="#3b82f6" /></TouchableOpacity>
                        <TouchableOpacity disabled={type.stock_count > 0} onPress={() => handleDeleteItemType(type.id)} style={{marginTop: 4}}><MaterialCommunityIcons name="delete" size={20} color={type.stock_count > 0 ? "#334155" : "#ef4444"} /></TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.statBadgeRow}>
                      <View style={styles.statBadge}><MaterialCommunityIcons name={type.unit_type === 'volume' ? 'water' : type.unit_type === 'weight' ? 'scale-balance' : 'numeric-1-box-outline'} size={12} color="#94a3b8" /><Text style={styles.statBadgeText}>{type.unit_type || 'count'}</Text></View>
                      {type.default_size ? (
                        <View style={styles.statBadge}>
                          <MaterialCommunityIcons name="package-variant-closed" size={12} color="#94a3b8" />
                          <Text style={styles.statBadgeText}>
                            {type.default_size}{type.unit_type === 'weight' ? 'g' : type.unit_type === 'volume' ? 'ml' : ''}
                          </Text>
                        </View>
                      ) : null}
                      {(type.min_stock !== null || type.max_stock !== null) ? (
                        <View style={styles.statBadge}>
                          <MaterialCommunityIcons name="target" size={12} color="#94a3b8" />
                          <Text style={styles.statBadgeText}>
                            {type.min_stock !== null ? type.min_stock : '—'} / {type.max_stock !== null ? type.max_stock : '—'}
                          </Text>
                        </View>
                      ) : null}
                      {type.freeze_months ? (
                        <View style={[styles.statBadge, {backgroundColor: '#1d4ed8', borderColor: '#3b82f6'}]}>
                          <MaterialCommunityIcons name="snowflake" size={12} color="white" />
                          <Text style={[styles.statBadgeText, {color: 'white'}]}>{type.freeze_months}M</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                )}
              </View>
            ))}
            {selectedCat === cat.id ? (
              <View style={[styles.newTypeContainer, { padding: 12 }]}>
                <View style={styles.formSection}>
                  <Text style={styles.miniLabel}>NAME <Text style={{color: '#f43f5e'}}>*</Text></Text>
                  <TextInput style={styles.inputSmall} value={newItemName} onChangeText={setNewItemName} placeholder="Item Name" placeholderTextColor="#64748b" testID="new-item-name-input" />
                </View>

                <View style={styles.formSection}>
                   <Text style={styles.miniLabel}>UNIT <Text style={{color: '#f43f5e'}}>*</Text></Text>
                   <View style={styles.unitChipRowMini}>
                     <TouchableOpacity style={[styles.unitChip, newItemUnit === 'weight' && styles.unitChipActive]} onPress={() => setNewItemUnit('weight')} testID="unit-selector-weight"><Text style={[styles.unitChipText, newItemUnit === 'weight' && styles.unitChipTextActive]}>Weight</Text></TouchableOpacity>
                     <TouchableOpacity style={[styles.unitChip, newItemUnit === 'volume' && styles.unitChipActive]} onPress={() => setNewItemUnit('volume')} testID="unit-selector-volume"><Text style={[styles.unitChipText, newItemUnit === 'volume' && styles.unitChipTextActive]}>Volume</Text></TouchableOpacity>
                     <TouchableOpacity style={[styles.unitChip, newItemUnit === 'count' && styles.unitChipActive]} onPress={() => setNewItemUnit('count')} testID="unit-selector-count"><Text style={[styles.unitChipText, newItemUnit === 'count' && styles.unitChipTextActive]}>Count</Text></TouchableOpacity>
                   </View>
                </View>

                <View style={{ backgroundColor: '#1e293b', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#334155', marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#0f172a' }}>
                    <MaterialCommunityIcons name="target" size={16} color="#fb923c" />
                    <Text style={{ flex: 1, color: '#94a3b8', fontSize: 11, fontStyle: 'italic', lineHeight: 16 }}>
                      <Text style={{fontWeight: 'bold', color: '#cbd5e1', fontStyle: 'normal'}}>QUARTERMASTER: </Text>
                      Set optional thresholds for stock alerts and restocking reports. Leave blank if you don't track stock levels for this item.
                    </Text>
                  </View>

                  <View style={{flexDirection: 'row', gap: 10}}>
                      <View style={{flex: 1}}>
                        <Text style={styles.miniLabel}>MIN STOCK</Text>
                        <TextInput style={styles.inputSmall} value={newItemMinStock} onChangeText={setNewItemMinStock} keyboardType="numeric" placeholder="Min" placeholderTextColor="#64748b" />
                      </View>
                      <View style={{flex: 1}}>
                        <Text style={styles.miniLabel}>MAX STOCK</Text>
                        <TextInput style={styles.inputSmall} value={newItemMaxStock} onChangeText={setNewItemMaxStock} keyboardType="numeric" placeholder="Max" placeholderTextColor="#64748b" />
                      </View>
                  </View>
                </View>

                <View style={{ backgroundColor: '#1e293b', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#334155', marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#0f172a' }}>
                    <MaterialCommunityIcons name="information-outline" size={16} color="#60a5fa" />
                    <Text style={{ flex: 1, color: '#94a3b8', fontSize: 11, fontStyle: 'italic', lineHeight: 16 }}>
                      <Text style={{fontWeight: 'bold', color: '#cbd5e1', fontStyle: 'normal'}}>PRO TIP: </Text>
                      Setting defaults below is optional, but pre-fills your forms to ensure frictionless batch entry in the heat of the moment.
                    </Text>
                  </View>

                <View style={{flexDirection: 'row', gap: 10, marginBottom: 12}}>
                    <View style={{flex: 1}}>
                      <Text style={styles.miniLabel}>DEFAULT SIZE ({newItemUnit === 'volume' ? 'ml' : newItemUnit === 'weight' ? 'g' : 'Units'})</Text>
                      <TextInput style={styles.inputSmall} value={newItemDefaultSize} onChangeText={setNewItemDefaultSize} keyboardType="numeric" placeholder="Size / Qty" placeholderTextColor="#64748b" testID="new-item-default-size-input" />
                    </View>
                    <View style={{flex: 1}}>
                      <Text style={[styles.miniLabel, {color: '#60a5fa'}]}>❄ FREEZE (M)</Text>
                      <TextInput style={[styles.inputSmall, {borderColor: '#1e3a5f'}]} value={newItemFreezeMonths} onChangeText={setNewItemFreezeMonths} keyboardType="numeric" placeholder="e.g. 6" placeholderTextColor="#475569" testID="new-item-freeze-months-input" />
                    </View>
                </View>

                <View style={{ marginBottom: 8 }}>
                  <Text style={styles.miniLabel}>DEFAULT BRAND / SUPPLIER</Text>
                  <TextInput 
                    style={styles.inputSmall} 
                    value={newItemSupplier} 
                    onChangeText={(val) => {
                      setNewItemSupplier(val);
                      updateSupplierSuggestions(val);
                    }} 
                    placeholder="Heinz, Nestle, Tesco, Walmart..." 
                    placeholderTextColor="#64748b" 
                  />
                  <View style={{ height: 26, justifyContent: 'flex-start', alignItems: 'center', marginTop: 4, flexDirection: 'row' }}>
                    {suggestedTypeAheadSuppliers.length > 0 && newItemSupplier.length > 0 && (
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        {suggestedTypeAheadSuppliers.slice(0, 3).map(s => {
                          const isCore = Object.keys(SUPPLIERS_DATA).some(k => k.toLowerCase() === s.toLowerCase()) || 
                                         Object.keys(BRANDS_DATA).some(k => k.toLowerCase() === s.toLowerCase());
                          return (
                            <View key={s} style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingLeft: 6, paddingRight: isCore ? 6 : 4, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}>
                              <TouchableOpacity onPress={() => { setNewItemSupplier(s); setSuggestedTypeAheadSuppliers([]); }}>
                                <Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>{s.toUpperCase()}</Text>
                              </TouchableOpacity>
                              {!isCore && (
                                <TouchableOpacity 
                                  onPress={() => handlePurgeVocabulary(s, 'supplier')} 
                                  hitSlop={{top: 20, bottom: 20, left: 20, right: 20}}
                                  style={{padding: 2}}
                                >
                                  <MaterialCommunityIcons name="trash-can-outline" size={14} color="#f43f5e" />
                                </TouchableOpacity>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </View>

                <View style={{ marginBottom: 8 }}>
                  <Text style={styles.miniLabel}>DEFAULT RANGE</Text>
                  <TextInput 
                    style={styles.inputSmall} 
                    value={newItemRange} 
                    onChangeText={(val) => {
                      setNewItemRange(val);
                      updateRangeSuggestions(val);
                    }} 
                    placeholder="e.g. Finest" 
                    placeholderTextColor="#64748b" 
                  />
                  <View style={{ height: 26, justifyContent: 'flex-start', alignItems: 'center', marginTop: 4, flexDirection: 'row' }}>
                    {suggestedTypeAheadRanges.length > 0 && newItemRange.length > 0 && (
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        {suggestedTypeAheadRanges.slice(0, 3).map(r => (
                          <View key={r} style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingLeft: 6, paddingRight: 4, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#334155', gap: 4}}>
                            <TouchableOpacity onPress={() => { setNewItemRange(r); setSuggestedTypeAheadRanges([]); }}>
                              <Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>{r.toUpperCase()}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                              onPress={() => handlePurgeVocabulary(r, 'range')}
                              hitSlop={{top: 20, bottom: 20, left: 20, right: 20}}
                              style={{padding: 2}}
                            >
                              <MaterialCommunityIcons name="trash-can-outline" size={14} color="#f43f5e" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.formSection}>
                    <Text style={styles.miniLabel}>DEFAULT CABINET</Text>
                    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8}}>
                        <TouchableOpacity 
                          key="none" 
                          style={[styles.chip, !newItemDefaultCabinet && styles.chipActive]} 
                          onPress={() => setNewItemDefaultCabinet(null)}
                        >
                          <Text style={[styles.chipText, !newItemDefaultCabinet && styles.chipTextActive]}>No Default</Text>
                        </TouchableOpacity>
                        {cabinets.map(cab => (
                            <TouchableOpacity 
                              key={cab.id} 
                              style={[styles.chip, newItemDefaultCabinet === cab.id && styles.chipActive]} 
                              onPress={() => setNewItemDefaultCabinet(cab.id)}
                            >
                                <Text style={[styles.chipText, newItemDefaultCabinet === cab.id && styles.chipTextActive]}>{cab.cabinet_type === 'freezer' ? '❄ ' : ''}{cab.name}</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity 
                          style={[styles.chip, { borderColor: '#3b82f6', borderWidth: 1, backgroundColor: '#0f172a' }]} 
                          onPress={() => { setInlineCabContext('new_item'); setShowInlineAddCabinet(true); }}
                        >
                            <Text style={[styles.chipText, { color: '#3b82f6' }]}>+ NEW CABINET</Text>
                        </TouchableOpacity>
                    </View>
                    {cabinets.some(c => c.cabinet_type === 'freezer') && (
                        <Text style={{ color: '#64748b', fontSize: 11, fontStyle: 'italic', marginTop: -2, marginBottom: 4 }}>❄ Designated Freezer Cabinet</Text>
                    )}
                </View>
                </View>



                <TouchableOpacity onPress={() => handleAddItemType(cat.id)} style={[styles.addSaveBtnFull, { marginTop: 16 }]} testID="submit-item-type-btn"><Text style={styles.addSaveText}>DEPLOY ITEM</Text></TouchableOpacity>
                <TouchableOpacity style={{marginTop: 12, alignItems: 'center'}} onPress={() => setSelectedCat(null)}><Text style={{color: '#64748b', fontSize: 12, fontWeight: 'bold'}}>CANCEL</Text></TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.addNewBtn} onPress={() => setSelectedCat(cat.id)} testID={`expand-add-item-${cat.name.toLowerCase().replace(/\s+/g, '-')}`}>
                <Text style={styles.addNewText}>+ Add Item Type</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderCabinet = ({ item: cab }: any) => {
    return (
      <View style={styles.catCard}>
        <View style={styles.catHeader}>
          <View style={{flexDirection: 'row', flex: 1, justifyContent: 'space-between'}}>
            <View>
              <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
                <Text style={styles.catTitle}>{cab.name}</Text>
                {!!cab.rotation_interval_months && (
                  <View style={{backgroundColor: '#fbbf2433', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1, borderColor: '#fbbf2466'}}>
                    <Text style={{color: '#fbbf24', fontSize: 8, fontWeight: 'bold'}}>{cab.rotation_interval_months}M CYCLE</Text>
                  </View>
                )}
              </View>
              <Text style={{color: '#64748b', fontSize: 13}}>{cab.location || 'No Location'}</Text>
              <View style={{flexDirection:'row',alignItems:'center',gap:8,marginTop:3}}>
                {cab.cabinet_type === 'freezer' && (
                  <View style={{flexDirection:'row',alignItems:'center',gap:4}}>
                    <MaterialCommunityIcons name="snowflake" size={11} color="#60a5fa" />
                    <Text style={{color:'#60a5fa',fontSize:11,fontWeight:'bold'}}>FREEZER</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.catActions}>
              <TouchableOpacity 
                onPress={() => { 
                  setSelectedCabinetForEdit(cab);
                  setShowCabinetModal(true);
                }} 
                style={{marginRight: 10}} 
                testID={`edit-cab-btn-${cab.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <MaterialCommunityIcons name="pencil" size={20} color="#3b82f6" />
              </TouchableOpacity>
              <TouchableOpacity disabled={cab.stock_count > 0} onPress={() => handleDeleteCabinet(cab.id, cab.stock_count > 0)}>
                <MaterialCommunityIcons name="delete" size={20} color={cab.stock_count > 0 ? "#334155" : "#ef4444"} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.back()} style={styles.backBtn} testID="back-btn">
          <MaterialCommunityIcons name="arrow-left" size={24} color="#f8fafc" />
        </TouchableOpacity>
        <View style={{flex: 1, marginLeft: 16}}>
          <Text style={styles.title}>Recon & Logistics</Text>
          <Text style={styles.headerSubtitle}>Catalog & Site Configuration</Text>
        </View>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity accessibilityRole="tab" style={[styles.tab, activeTab === 'catalog' && styles.tabActive]} onPress={() => setActiveTab('catalog')} testID="tab-catalog"><Text style={[styles.tabText, activeTab === 'catalog' && styles.tabTextActive]}>CATALOG</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="tab" style={[styles.tab, activeTab === 'cabinets' && styles.tabActive]} onPress={() => setActiveTab('cabinets')} testID="tab-cabinets"><Text style={[styles.tabText, activeTab === 'cabinets' && styles.tabTextActive]}>CABINETS</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="tab" style={[styles.tab, activeTab === 'rank' && styles.tabActive]} onPress={() => setActiveTab('rank')} testID="tab-rank"><Text style={[styles.tabText, activeTab === 'rank' && styles.tabTextActive]}>RANK</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="tab" style={[styles.tab, activeTab === 'system' && styles.tabActive]} onPress={() => setActiveTab('system')} testID="tab-system"><Text style={[styles.tabText, activeTab === 'system' && styles.tabTextActive]}>STOCK ALERTS</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="tab" style={[styles.tab, activeTab === 'backups' && styles.tabActive]} onPress={() => { if (checkEntitlement('BACKUPS')) setActiveTab('backups'); }} testID="tab-backups"><Text style={[styles.tabText, activeTab === 'backups' && styles.tabTextActive]}>BACKUPS</Text></TouchableOpacity>
      </View>

      {activeTab === 'catalog' ? (
        <FlatList 
          ref={flatListRef}
          data={categories} 
          keyExtractor={i => i.id.toString()} 
          renderItem={renderCategory} 
          onScrollToIndexFailed={info => {
            const wait = new Promise(resolve => setTimeout(resolve, 500));
            wait.then(() => {
              flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0 });
            });
          }}
          ListHeaderComponent={(
            <View>
              {/* Metrics Panel */}
              <View style={styles.metricsPanel}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricVal}>{categories.length}</Text>
                  <Text style={styles.metricLabel}>CATEGORIES</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricVal}>{totalItemCount}</Text>
                  <Text style={styles.metricLabel}>ITEMS</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={[styles.metricVal, minReqCount === 0 && {color: '#ef4444'}]}>{minReqCount}</Text>
                  <Text style={styles.metricLabel}>MIN TARGETS</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={[styles.metricVal, maxReqCount === 0 && {color: '#5b21b6'}]}>{maxReqCount}</Text>
                  <Text style={styles.metricLabel}>MAX TARGETS</Text>
                </View>
              </View>

              {minReqCount === 0 && (
                <View style={styles.advisoryWarning}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#fbbf24" style={{marginRight: 8}} />
                  <Text style={styles.advisoryText}>No minimum desired stock levels have been set. Configure some minimum thresholds below to enable Quartermaster low stock reports and alerts.</Text>
                </View>
              )}

              <View style={styles.newCatBlock}>
                <Text style={styles.label}>New Category</Text>
                <View style={styles.newRow}>
                  <TextInput style={styles.inputMedium} value={newCatName} onChangeText={setNewCatName} placeholder="Category Name" placeholderTextColor="#64748b" testID="new-cat-input" />
                  <TouchableOpacity onPress={handleAddCategory} style={styles.addSaveBtnLarge} testID="create-cat-btn"><Text style={styles.addSaveTextLarge}>CREATE</Text></TouchableOpacity>
                </View>
              </View>
            </View>
          )} />
      ) : activeTab === 'cabinets' ? (
        <FlatList data={cabinets} keyExtractor={i => i.id.toString()} renderItem={renderCabinet} ListHeaderComponent={(
            <View style={{ paddingVertical: 10, alignItems: 'center' }}>
              <TouchableOpacity 
                style={[styles.addSaveBtnFull, { backgroundColor: '#1e293b', borderColor: '#3b82f6', borderWidth: 1, height: 50 }]} 
                onPress={() => {
                  setSelectedCabinetForEdit(null);
                  setShowCabinetModal(true);
                }}
                testID='deploy-new-cabinet-btn'
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <MaterialCommunityIcons name='plus-circle' size={20} color='#3b82f6' />
                  <Text style={[styles.addSaveText, { color: '#3b82f6' }]}>DEPLOY NEW CABINET</Text>
                </View>
              </TouchableOpacity>
            </View>
            )} />
      ) : activeTab === 'system' ? (
        <View style={{padding: 10}}>
          <View style={styles.prefRow}>
            <View style={{flex: 1}}><Text style={styles.prefTitle}>Monthly Stock Alerts</Text><Text style={styles.prefSub}>Receive a notification on the 1st of every month with expiry counts.</Text></View>
            <Switch
              value={autoBackupEnabled}
              onValueChange={(val) => { if (!checkEntitlement('ALERTS')) return; toggleAutoBackup(val); }}
              trackColor={{ false: "#334155", true: "#22c55e" }}
              thumbColor={autoBackupEnabled ? "#f8fafc" : "#94a3b8"}
            />
          </View>
          <View style={{marginTop: 40}}><TouchableOpacity style={styles.testBtn} onPress={async () => {
            if (!checkEntitlement('ALERTS')) return;
            const { testStockAlert } = await import('../services/notifications');
            await testStockAlert(db);
            Alert.alert('System Armed', 'A test alert has been dispatched.');
          }}><MaterialCommunityIcons name="bell-ring" size={24} color="white" /><Text style={styles.testBtnText}>TEST STOCK ALERT</Text></TouchableOpacity></View>
<TouchableOpacity testID="debug-purge-db" style={{ backgroundColor: '#ef4444', padding: 16, borderRadius: 12, marginTop: 40, alignItems: 'center' }} onPress={async () => {try {await db.runAsync('DELETE FROM Inventory');await db.runAsync('DELETE FROM ItemTypes');await db.runAsync('DELETE FROM Categories');await db.runAsync('DELETE FROM Settings');await SecureStore.deleteItemAsync('google_access_token');await SecureStore.deleteItemAsync('google_refresh_token');if (typeof window !== 'undefined') window.location.reload();} catch (e) {console.error("Purge Error:", e);}}}><Text style={{fontSize: 14, color: 'white', fontWeight: 'bold'}}>DEVELOPER: WIPE SYSTEM & LICENSE</Text></TouchableOpacity>
        </View>
      ) : activeTab === 'backups' ? (
        <ScrollView style={{padding: 10, flex: 1}} contentContainerStyle={{paddingBottom: 60}}>
          {/* UNIFIED DATA SOVEREIGNTY COMMAND */}
          <View style={{backgroundColor: '#0f172a', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#334155', marginBottom: 20}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16}}>
              <View style={{backgroundColor: '#1e293b', padding: 8, borderRadius: 8}}>
                <MaterialCommunityIcons name="shield-lock" size={24} color="#fbbf24" />
              </View>
              <View>
                <Text style={[styles.prefTitle, {fontSize: 16}]}>Data Sovereignty Command</Text>
                <Text style={styles.prefSub}>Automated redundancy & recovery</Text>
              </View>
            </View>

            {/* AUTOMATION TRIGGER (THE WHEN) */}
            <View style={[styles.prefRow, {marginBottom: 16, backgroundColor: '#1e293b', padding: 12, borderRadius: 8}]}>
              <View style={{flex: 1}}>
                <Text style={[styles.prefTitle, {fontSize: 14}]}>Rolling Hourly Archive</Text>
                <Text style={styles.prefSub}>Snapshot on change (last 5 kept)</Text>
              </View>
              <Switch 
                value={autoBackupEnabled} 
                onValueChange={toggleAutoBackup} 
                trackColor={{ false: "#334155", true: "#22c55e" }} 
                thumbColor={autoBackupEnabled ? "#f8fafc" : "#94a3b8"} 
              />
            </View>

            {/* DOCTRINE DESTINATION (THE WHERE) */}
            <Text style={{color: '#94a3b8', fontSize: 11, fontWeight: 'bold', marginBottom: 8, marginLeft: 2}}>MIRRORING DOCTRINE</Text>
            <View style={[styles.doctrineToggle, {width: '100%', marginBottom: 16}]}>
              <TouchableOpacity 
                style={[
                  styles.doctrineOption, 
                  (!cloudBackupEnabled && !mirrorUri) && {backgroundColor: '#ef4444', borderColor: '#ef4444'}
                ]}
                onPress={async () => {
                  setCloudBackupEnabled(false);
                  setMirrorUri(null);
                  await db.runAsync("UPDATE Settings SET value = '0' WHERE key = 'cloud_backup_enabled'");
                  await db.runAsync("UPDATE Settings SET value = '' WHERE key = 'persistence_mirror_uri'");
                }}
              >
                <Text style={[styles.doctrineText, (!cloudBackupEnabled && !mirrorUri) && {color: 'white', fontWeight: 'bold'}]}>NONE</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[
                  styles.doctrineOption, 
                  (!!mirrorUri && !cloudBackupEnabled) && {backgroundColor: '#fbbf24', borderColor: '#fbbf24'}
                ]}
                onPress={handlePersistentMirrorSetup}
              >
                <Text style={[styles.doctrineText, (!!mirrorUri && !cloudBackupEnabled) && {color: '#0f172a', fontWeight: 'bold'}]}>LOCAL</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[
                  styles.doctrineOption, 
                  cloudBackupEnabled && {backgroundColor: '#22c55e', borderColor: '#22c55e'}
                ]}
                onPress={() => setShowCloudConsentModal(true)}
              >
                <Text style={[styles.doctrineText, cloudBackupEnabled && {color: 'white', fontWeight: 'bold'}]}>CLOUD</Text>
              </TouchableOpacity>
            </View>

            {/* INTELLIGENCE BRIEFING */}
            <View style={{backgroundColor: '#1e293b', padding: 12, borderRadius: 8, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: (!cloudBackupEnabled && !mirrorUri) ? '#ef4444' : (!!mirrorUri ? '#fbbf24' : '#22c55e')}}>
              {(!cloudBackupEnabled && !mirrorUri) && (
                <>
                  <Text style={{color: '#ef4444', fontSize: 11, fontWeight: 'bold', marginBottom: 4, letterSpacing: 1}}>⚠️ DANGER: ISOLATED STATE</Text>
                  <Text style={{color: '#94a3b8', fontSize: 12, lineHeight: 18}}>Logistical intelligence is confined to app memory. Total loss occurs if app is corrupted or deleted.</Text>
                </>
              )}
              {(!!mirrorUri && !cloudBackupEnabled) && (
                <>
                  <Text style={{color: '#fbbf24', fontSize: 11, fontWeight: 'bold', marginBottom: 4, letterSpacing: 1}}>⚠️ CAUTION: SHADOW MIRROR</Text>
                  <Text style={{color: '#94a3b8', fontSize: 12, lineHeight: 18}}>Data is mirrored to persistent storage. Safe from app deletion, but vulnerable to device loss or theft.</Text>
                  <Text style={{color: '#64748b', fontSize: 10, marginTop: 6, fontStyle: 'italic'}}>Destination: {mirrorUri.split('%3A').pop()}</Text>
                </>
              )}
              {cloudBackupEnabled && (
                <>
                  <Text style={{color: '#22c55e', fontSize: 11, fontWeight: 'bold', marginBottom: 4, letterSpacing: 1}}>🛡️ FORTIFIED: HIGH COMMAND</Text>
                  <Text style={{color: '#94a3b8', fontSize: 12, lineHeight: 18}}>Encrypted mirrors are pushed to Google Drive. Fully redundant across all devices.</Text>
                  <Text style={{color: '#64748b', fontSize: 10, marginTop: 6, fontStyle: 'italic'}}>Linked: {cloudAccount}</Text>
                </>
              )}
            </View>

            {/* MANUAL CONTROLS */}
            <View style={{flexDirection: 'row', gap: 8}}>
              <TouchableOpacity style={[styles.actionBtn, {flex: 1, backgroundColor: '#3b82f6', paddingHorizontal: 4}]} onPress={handleManualBackup}>
                <Text style={[styles.actionBtnText, {fontSize: 11}]} numberOfLines={1} adjustsFontSizeToFit>SNAPSHOT</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, {flex: 1, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#3b82f6', paddingHorizontal: 4}]} onPress={fetchMissionLogs}>
                <Text style={[styles.actionBtnText, {color: '#3b82f6', fontSize: 11}]} numberOfLines={1} adjustsFontSizeToFit>MISSION LOGS</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, {flex: 1, backgroundColor: '#ef4444', paddingHorizontal: 4}]} onPress={() => setShowRestoreSourceModal(true)}>
                <Text style={[styles.actionBtnText, {fontSize: 11}]} numberOfLines={1} adjustsFontSizeToFit>RECOVERY</Text>
              </TouchableOpacity>
            </View>
          </View>

          {cloudBackupEnabled && (
             <View style={{backgroundColor: '#0f172a', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#3b82f6', marginBottom: 16, marginHorizontal: 16}}>
               <Text style={{color: '#60a5fa', fontSize: 10, fontWeight: 'bold', letterSpacing: 1, marginBottom: 12}}>GOOGLE DRIVE TELEMETRY DASHBOARD</Text>
               <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center'}}>
                  <Text style={{color: '#94a3b8', fontSize: 13}}>Account</Text>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
                    <MaterialCommunityIcons name="account-circle" size={14} color="#f8fafc" />
                    <Text style={{color: '#f8fafc', fontSize: 13, fontWeight: 'bold'}}>{cloudAccount || 'Disconnected'}</Text>
                  </View>
               </View>
               <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center'}}>
                  <Text style={{color: '#94a3b8', fontSize: 13}}>Schedule Target</Text>
                  <TouchableOpacity 
                    onPress={async () => {
                       const next = cloudSchedule === 'Daily' ? 'Weekly' : (cloudSchedule === 'Weekly' ? 'Monthly' : 'Daily');
                       setCloudSchedule(next);
                       await db.runAsync('INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)', ['cloud_schedule', next]);
                    }}
                    style={{backgroundColor: '#1e293b', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#334155'}}
                  >
                    <Text style={{color: '#3b82f6', fontSize: 12, fontWeight: 'bold'}}>{cloudSchedule.toUpperCase()}</Text>
                  </TouchableOpacity>
               </View>
               <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8}}>
                  <Text style={{color: '#94a3b8', fontSize: 13}}>Last Successful Sync</Text>
                  <Text style={{color: '#f8fafc', fontSize: 13, fontWeight: 'bold'}}>{cloudLastSync || 'Never'}</Text>
               </View>
               <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                  <Text style={{color: '#94a3b8', fontSize: 13}}>Last Status</Text>
                  <Text style={{color: cloudLastStatus.includes('Success') ? '#22c55e' : (cloudLastStatus.includes('Failed') ? '#ef4444' : '#64748b'), fontSize: 13, fontWeight: 'bold'}}>{cloudLastStatus || 'N/A'}</Text>
               </View>

               <TouchableOpacity 
                 onPress={handleDisconnectCloud}
                 style={{marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#1e293b', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6}}
               >
                 <MaterialCommunityIcons name="logout" size={14} color="#ef4444" />
                 <Text style={{color: '#ef4444', fontSize: 11, fontWeight: 'bold'}}>DISCONNECT ACCOUNT</Text>
               </TouchableOpacity>
             </View>
          )}

          {bunker && (
            <View style={{marginBottom: 24}}>
              <Text style={[styles.label, {color: '#fbbf24'}]}>🛡️ THE BUNKER</Text>
              <Text style={{color: '#64748b', fontSize: 11, marginTop: -8, marginBottom: 12, lineHeight: 16}}>
                Your strategic reserve. This state is immune to automatic rotation. Tap the <MaterialCommunityIcons name="pin" size={12} color="#fbbf24" /> icon on any archive below to fortify it.
              </Text>
              <View style={[styles.backupItem, {backgroundColor: '#0f2744', borderColor: '#fbbf24', borderWidth: 2}]}>
                <View style={{flex: 1}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4}}>
                    <Text style={[styles.backupName, {color: '#f8fafc'}]}>{new Date(bunker.timestamp).toLocaleDateString()}</Text>
                    <View style={{backgroundColor: '#fbbf24', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4}}>
                      <Text style={{color: '#0f172a', fontSize: 10, fontWeight: 'bold'}}>{new Date(bunker.timestamp).toLocaleTimeString()}</Text>
                    </View>
                    {bunker.version && (
                      <View style={{backgroundColor: '#0f2744', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#fbbf24'}}>
                        <Text style={{color: '#fbbf24', fontSize: 10, fontWeight: 'bold'}}>v{bunker.version}</Text>
                      </View>
                    )}
                  </View>
                  
                  {bunker.note ? (
                    <Text style={{color: '#fbbf24', fontSize: 13, fontWeight: 'bold', marginBottom: 2}}>{bunker.note.toUpperCase()}</Text>
                  ) : null}
                  
                  <Text style={[styles.backupMeta, {color: '#94a3b8'}]}>{bunker.summary || 'Census data unavailable'}</Text>
                  
                  {bunker.logCount !== undefined ? (
                    <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4}}>
                      <MaterialCommunityIcons name="delta" size={12} color={bunker.logCount > 0 ? "#fbbf24" : "#94a3b8"} />
                      <Text style={{color: bunker.logCount > 0 ? '#fbbf24' : '#94a3b8', fontSize: 11, fontWeight: 'bold'}}>
                        {bunker.logCount > 0 ? `${bunker.logCount} OPERATIONS CAPTURED` : `0 CHANGES CAPTURED`}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>
                  <TouchableOpacity 
                    onPress={() => { setSelectedActivity(bunker.lastAction || ''); setSelectedBackup(bunker); setShowActivityModal(true); }}
                    style={{backgroundColor: '#1e293b', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#fbbf24'}}
                  >
                    <MaterialCommunityIcons name="information-outline" size={20} color="#fbbf24" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, marginTop: 10}}>
            <Text style={{color: '#94a3b8', fontSize: 16}}>Local Snapshot Archive (Rolling 5)</Text>
            <TouchableOpacity onPress={() => Alert.alert("System Archive Protocol", "The auto-archiver enforces a 1-hour cooldown between snapshots to prevent database flooding.\n\nFurthermore, the system will only capture a snapshot if you actively visit the main inventory screen AFTER the 1-hour threshold has passed AND a logistical change has occurred since the last archive.\n\nThis ensures that archives only capture deliberate operational drift rather than background noise.")}>
              <MaterialCommunityIcons name="information" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>
          
          {/* ─── TACTICAL DELTA BRIEFING ─── */}
          {currentCensus && backups.length > 0 && backups[0].counts && (
            <View style={{ marginBottom: 20, backgroundColor: '#000', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1e293b' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <MaterialCommunityIcons name="delta" size={18} color="#3b82f6" />
                <Text style={{ color: '#f8fafc', fontSize: 13, fontWeight: 'bold', letterSpacing: 1 }}>DELTA (SINCE LAST SNAPSHOT)</Text>
              </View>
              
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {[
                  { label: 'UNITS', val: currentCensus.units - backups[0].counts.units },
                  { label: 'BATCHES', val: currentCensus.batches - backups[0].counts.batches },
                  { label: 'TYPES', val: currentCensus.types - backups[0].counts.types },
                  { label: 'CATEGORIES', val: currentCensus.categories - backups[0].counts.categories },
                  { label: 'CABINETS', val: currentCensus.cabinets - backups[0].counts.cabinets },
                ].map((d, idx) => {
                  if (d.val === 0) return null;
                  return (
                    <View key={idx} style={{ backgroundColor: '#0f172a', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: d.val > 0 ? '#22c55e44' : '#ef444444', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <MaterialCommunityIcons 
                        name={d.val > 0 ? "plus-circle" : "minus-circle"} 
                        size={12} 
                        color={d.val > 0 ? "#22c55e" : "#ef4444"} 
                      />
                      <Text style={{ color: d.val > 0 ? "#22c55e" : "#ef4444", fontSize: 11, fontWeight: 'bold' }}>
                        {Math.abs(d.val)} {d.label}
                      </Text>
                    </View>
                  );
                })}
                {/* Check for general updates if counts are identical */}
                {(() => {
                   const hasNumericChange = (currentCensus.units - backups[0].counts.units) !== 0 ||
                                            (currentCensus.batches - backups[0].counts.batches) !== 0 ||
                                            (currentCensus.types - backups[0].counts.types) !== 0 ||
                                            (currentCensus.categories - backups[0].counts.categories) !== 0 ||
                                            (currentCensus.cabinets - backups[0].counts.cabinets) !== 0;
                   
                   // Fallback: If no numeric change but "last modified" is newer than backup
                   // We don't have the exact mod time easily here without another DB call, 
                   // but we can assume if no numeric changes, it's either "UNCHANGED" or "UPDATED (CONTENT)"
                   if (!hasNumericChange) {
                     return (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
                          <MaterialCommunityIcons name="check-decagram" size={14} color="#64748b" />
                          <Text style={{ color: '#64748b', fontSize: 12, fontStyle: 'italic' }}>NO LOGISTICAL DRIFT DETECTED</Text>
                        </View>
                     );
                   }
                   return null;
                })()}
              </View>
            </View>
          )}

          {backups.length === 0 ? (
            <Text style={{color: '#64748b', textAlign: 'center', marginTop: 20}}>No backups recorded yet.</Text>
          ) : (
            backups.slice(0, 5).map(item => (
              <View key={item.name} style={styles.backupItem}>
                <View style={{flex: 1}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4}}>
                    <Text style={styles.backupName}>{new Date(item.timestamp).toLocaleDateString()}</Text>
                    <View style={{backgroundColor: '#0f172a', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#334155'}}>
                      <Text style={{color: '#94a3b8', fontSize: 10, fontWeight: 'bold'}}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
                    </View>
                    {item.version && (
                      <View style={{backgroundColor: '#1e293b', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#64748b'}}>
                        <Text style={{color: '#cbd5e1', fontSize: 10, fontWeight: 'bold'}}>v{item.version}</Text>
                      </View>
                    )}
                  </View>
                  
                  {item.note ? (
                    <Text style={{color: '#fbbf24', fontSize: 13, fontWeight: 'bold', marginBottom: 2}}>{item.note.toUpperCase()}</Text>
                  ) : null}
                  
                  <Text style={styles.backupMeta}>{item.summary || 'Census data unavailable'}</Text>
                  
                  {item.logCount !== undefined ? (
                    <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4}}>
                      <MaterialCommunityIcons name="delta" size={12} color={item.logCount > 0 ? "#3b82f6" : "#94a3b8"} />
                      <Text style={{color: item.logCount > 0 ? '#3b82f6' : '#94a3b8', fontSize: 11, fontWeight: 'bold'}}>
                        {item.logCount > 0 ? `${item.logCount} OPERATIONS CAPTURED` : `0 CHANGES CAPTURED`}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>
                  <TouchableOpacity 
                    onPress={() => { setSelectedActivity(item.lastAction || ''); setSelectedBackup(item); setShowActivityModal(true); }}
                    style={{backgroundColor: '#1e293b', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#334155'}}
                  >
                    <MaterialCommunityIcons name="information-outline" size={20} color="#3b82f6" />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={async () => {
                      const success = await BackupService.fortifyToBunker(item);
                      if (success) load();
                    }}
                    style={[styles.shareBtn, {backgroundColor: '#1e293b', borderColor: '#fbbf24', borderWidth: 1}]}
                  >
                    <MaterialCommunityIcons name="pin" size={20} color="#fbbf24" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

            <View style={{marginTop: 20, backgroundColor: '#0f172a', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#334155', marginBottom: 20}}>
              <Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold', letterSpacing: 1, marginBottom: 12}}>STRATEGIC BUILD MANIFEST</Text>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8}}>
                <Text style={{color: '#94a3b8', fontSize: 12}}>Database Schema</Text>
                <Text style={{color: '#f8fafc', fontSize: 12, fontWeight: 'bold'}}>v{schemaVersion}</Text>
              </View>
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                <Text style={{color: '#94a3b8', fontSize: 12}}>Backup Manifest</Text>
                <Text style={{color: '#f8fafc', fontSize: 12, fontWeight: 'bold'}}>v{BACKUP_MANIFEST_VERSION}</Text>
              </View>
            </View>

            <CommandLedgerView />
        </ScrollView>
      ) : activeTab === 'rank' ? (
        <ScrollView style={{padding: 16}} contentContainerStyle={{paddingBottom: 40}}>
          <View style={[styles.promoHeader, { marginBottom: 24 }]}>
              <MaterialCommunityIcons name="medal-outline" size={32} color="#fbbf24" style={{ marginBottom: 8 }} />
              <Text style={styles.promoTitle}>SERVICE PROMOTION CENTRE</Text>
              <Text style={styles.promoSub}>Advance your rank to unlock advanced strategic command & logistics.</Text>
          </View>

          {/* ACTIVE STATUS HEADER (CADET ONLY) */}
          {isCadet && (
            <View style={[styles.tierCard, styles.tierCardActive, { backgroundColor: '#0f172a', marginBottom: 24, borderLeftWidth: 4, borderLeftColor: '#fbbf24' }]}>
              <View style={styles.tierStatusRow}>
                <Text style={[styles.tierCardRank, { color: '#fbbf24' }]}>RANK: CADET (IN TRAINING)</Text>
                <View style={[styles.activeRankBadge, { backgroundColor: '#fbbf24' }]}><Text style={[styles.activeRankText, { color: '#000' }]}>CURRENT</Text></View>
              </View>
              <Text style={[styles.tierPrice, { color: '#fbbf24', marginTop: 8 }]}>HIGH-COMMAND INTEL ACTIVE</Text>
              <Text style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>
                Your 7-day tactical evaluation is underway. Full AI &amp; Alerts enabled.
                Scale limited: 2 Cabinets · 4 Categories · 12 Items. Freezer trial: 1 Cabinet · 3 Item types.
              </Text>
              <View style={styles.trialBadge}>
                <Text style={styles.trialBadgeText}>{trialLabel.toUpperCase()} REMAINING</Text>
              </View>
            </View>
          )}

          {/* PRIVATE TIER (The First Promotion) */}
          <View style={[styles.tierCard, isPrivate && styles.tierCardActive]}>
            <View style={styles.tierStatusRow}>
              <Text style={styles.tierCardRank}>RANK: PRIVATE</Text>
              {isPrivate && <View style={styles.activeRankBadge}><Text style={styles.activeRankText}>CURRENT</Text></View>}
            </View>
            <Text style={styles.tierPrice}>FREE — ENLISTED STATUS</Text>
            <View style={styles.featureItem}><MaterialCommunityIcons name="check" size={16} color="#22c55e" /><Text style={styles.featureText}>4 Cabinets · 8 Categories · 24 Items</Text></View>
            <View style={styles.featureItem}><MaterialCommunityIcons name="close-circle" size={16} color="#475569" /><Text style={styles.featureText}>No AI recipes, no alerts, no freezer logistics</Text></View>
            
            {isCadet && (
              <TouchableOpacity 
                style={[styles.upgradeBtn, { backgroundColor: '#334155', marginTop: 16 }]} 
                onPress={graduateEarly}
              >
                <Text style={styles.upgradeBtnText}>GRADUATE EARLY TO PRIVATE</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* SERGEANT TIER */}
          <View style={[styles.tierCard, isSergeant && styles.tierCardActive, { borderColor: '#3b82f6' }]}>
            <View style={styles.tierStatusRow}>
              <Text style={[styles.tierCardRank, { color: '#60a5fa' }]}>RANK: SERGEANT</Text>
              {isSergeant && <View style={[styles.activeRankBadge, { backgroundColor: '#3b82f6' }]}><Text style={styles.activeRankText}>CURRENT</Text></View>}
            </View>
            <Text style={[styles.tierPrice, { color: '#60a5fa' }]}>£2.99 — ONE-TIME LICENCE</Text>
            <View style={styles.featureItem}><MaterialCommunityIcons name="infinity" size={16} color="#60a5fa" /><Text style={styles.featureText}>Unlimited cabinets, categories & items</Text></View>
            <View style={styles.featureItem}><MaterialCommunityIcons name="snowflake" size={16} color="#60a5fa" /><Text style={styles.featureText}>Full freezer logistics — age-based tracking</Text></View>
            <View style={styles.featureItem}><MaterialCommunityIcons name="truck-delivery" size={16} color="#60a5fa" /><Text style={styles.featureText}>The Quartermaster — low-stock reports & sharing</Text></View>
            {!isSergeanOrAbove && (
              <TouchableOpacity style={[styles.upgradeBtn, { backgroundColor: '#3b82f6' }]} onPress={() => requestPurchase('SERGEANT')}>
                <Text style={styles.upgradeBtnText}>COMMISSION SERGEANT RANK</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* GENERAL TIER */}
          <View style={[styles.tierCard, isGeneral && styles.tierCardActive, { borderColor: '#fbbf24' }]}>
            <View style={styles.tierStatusRow}>
              <Text style={[styles.tierCardRank, { color: '#fbbf24' }]}>RANK: GENERAL</Text>
              {isGeneral && <View style={[styles.activeRankBadge, { backgroundColor: '#fbbf24' }]}><Text style={[styles.activeRankText, { color: '#000' }]}>CURRENT</Text></View>}
            </View>
            <Text style={[styles.tierPrice, { color: '#fbbf24' }]}>£1.49/MONTH · £9.99/YEAR — HIGH COMMAND</Text>
            <Text style={{ color: '#64748b', fontSize: 11, fontStyle: 'italic', marginBottom: 8 }}>Everything in Sergeant, plus:</Text>
            <View style={styles.featureItem}><MaterialCommunityIcons name="bell-ring" size={16} color="#fbbf24" /><Text style={styles.featureText}>Automated low-stock & expiry alerts</Text></View>
            <View style={styles.featureItem}><MaterialCommunityIcons name="chef-hat" size={16} color="#fbbf24" /><Text style={styles.featureText}>The Mess Hall — waste-conscious AI recipes</Text></View>
            <View style={styles.featureItem}><MaterialCommunityIcons name="file-sync" size={16} color="#fbbf24" /><Text style={styles.featureText}>Automated backups & disaster recovery</Text></View>
            {!isGeneralOrAbove && (
              <TouchableOpacity style={[styles.upgradeBtn, { backgroundColor: '#fbbf24' }]} onPress={() => requestPurchase('GENERAL')}>
                <Text style={[styles.upgradeBtnText, { color: '#000' }]}>ASSUME HIGH COMMAND — £1.49/MO</Text>
              </TouchableOpacity>
            )}
          </View>

          {__DEV__ && (
            <TouchableOpacity 
              style={{ backgroundColor: '#ef4444', padding: 16, borderRadius: 8, marginTop: 24, alignItems: 'center' }} 
              onPress={async () => {
                await db.runAsync('DELETE FROM Settings WHERE key = ?', 'license_key');
                await db.runAsync('DELETE FROM Settings WHERE key = ?', 'license_key_general');
                await db.runAsync('DELETE FROM Settings WHERE key = ?', 'license_key_sergeant');
                Alert.alert('Demoted', 'Licenses revoked. Completely reload the app to reflect as Cadet.');
              }}
            >
              <Text style={{ color: 'white', fontWeight: 'bold' }}>DEVELOPER DEMOTE (CLEAR LICENSES)</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.promoFooter}>Sergeant is a one-time licence. General is a monthly or annual subscription — cancel any time. All upgrades are permanent to this device.</Text>

          {/* ALLIED OPERATIONS (REESTIT) */}
          <View style={{ borderTopWidth: 1, borderTopColor: '#1e293b', marginTop: 32, paddingTop: 32 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 }}>
              <MaterialCommunityIcons name="shield-account" size={20} color="#6366f1" />
              <Text style={{ color: '#818cf8', fontWeight: 'bold', letterSpacing: 1, fontSize: 13 }}>PERSONNEL DISPATCH (SISTER SERVICE)</Text>
            </View>
            
            <View style={[styles.tierCard, { borderColor: '#4f46e5', borderLeftWidth: 4, borderLeftColor: '#6366f1', padding: 20 }]}>
              <View style={styles.tierStatusRow}>
                <Text style={{ color: '#f8fafc', fontSize: 18, fontWeight: 'bold' }}>REESTIT: R&R INTEL</Text>
                <View style={{ backgroundColor: '#4f46e5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ color: 'white', fontSize: 8, fontWeight: 'bold' }}>FROM THE DEVELOPER</Text>
                </View>
              </View>
              <Text style={{ color: '#94a3b8', fontSize: 13, marginTop: 8, lineHeight: 20 }}>
                From the same tactical lab that built the War Cabinet. Reestit provides pithy, AI-driven summaries of holiday rental reviews. Know the strengths and pitfalls of your retreat before you deploy.
              </Text>
              <TouchableOpacity 
                style={[styles.upgradeBtn, { backgroundColor: '#6366f1', marginTop: 20 }]} 
                onPress={() => Linking.openURL('https://reestit.com')}
              >
                <MaterialCommunityIcons name="launch" size={18} color="white" style={{ position: 'absolute', left: 16 }} />
                <Text style={styles.upgradeBtnText}>EXPLORE REESTIT INTEL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

      ) : null}

      <>
        {/* RESTORE SOURCE MODAL */}
        <Modal visible={showRestoreSourceModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>SELECT INTELLIGENCE SOURCE</Text>
              <Text style={{color: '#94a3b8', fontSize: 13, marginBottom: 20, textAlign: 'center'}}>Where would you like to restore from?</Text>

              <TouchableOpacity 
                style={[styles.saveButton, {backgroundColor: '#fbbf24', marginTop: 10, flexDirection: 'row', justifyContent: 'center', gap: 10}]} 
                onPress={() => {
                  setShowRestoreSourceModal(false);
                  handleCloudRestore();
                }}
              >
                <MaterialCommunityIcons name="google-drive" size={20} color="#000" />
                <Text style={[styles.saveText, {color: '#000'}]}>GOOGLE DRIVE MIRROR</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.saveButton, {backgroundColor: '#3b82f6', marginTop: 12, flexDirection: 'row', justifyContent: 'center', gap: 10}]} 
                onPress={() => {
                  setShowRestoreSourceModal(false);
                  setTimeout(handleRestore, 300); // Standard local open wrapper
                }}
              >
                <MaterialCommunityIcons name="folder-open" size={20} color="white" />
                <Text style={styles.saveText}>LOCAL DEVICE ARCHIVE</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalClose} onPress={() => setShowRestoreSourceModal(false)}>
                <Text style={styles.modalCloseText}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* CLOUD CONSENT MODAL (HIGH COMMAND AUTHORIZATION) */}
        <Modal visible={showCloudConsentModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, {backgroundColor: '#0f172a', borderColor: cloudBackupEnabled ? '#22c55e' : '#334155', borderWidth: 2}]}>
              <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12}}>
                <View style={{backgroundColor: cloudBackupEnabled ? '#064e3b' : '#1e293b', padding: 10, borderRadius: 12}}>
                  <MaterialCommunityIcons name={cloudBackupEnabled ? "shield-check" : "shield-sync"} size={32} color={cloudBackupEnabled ? "#22c55e" : "#3b82f6"} />
                </View>
                <View style={{flex: 1}}>
                  <Text style={[styles.modalTitle, {marginBottom: 0, textAlign: 'left', fontSize: 18}]}>High Command Mirroring</Text>
                  <Text style={{color: '#64748b', fontSize: 12, fontWeight: 'bold'}}>CLOUD REDUNDANCY PROTOCOL</Text>
                </View>
              </View>

              <View style={{backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 20}}>
                <Text style={{color: '#cbd5e1', fontSize: 13, lineHeight: 20, marginBottom: 12}}>
                  Authorize a secure, real-time mirror of your logistical intelligence to your private Google Drive.
                </Text>
                
                <View style={{gap: 10}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                    <MaterialCommunityIcons name="eye-off" size={16} color="#3b82f6" />
                    <Text style={{color: '#94a3b8', fontSize: 12}}>Private, invisible application folder</Text>
                  </View>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                    <MaterialCommunityIcons name="lock-outline" size={16} color="#3b82f6" />
                    <Text style={{color: '#94a3b8', fontSize: 12}}>Encrypted end-to-end transport</Text>
                  </View>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                    <MaterialCommunityIcons name="cellphone-arrow-down" size={16} color="#3b82f6" />
                    <Text style={{color: '#94a3b8', fontSize: 12}}>Instant cross-device restoration</Text>
                  </View>
                </View>
              </View>

              {cloudBackupEnabled ? (
                <View style={{backgroundColor: '#064e3b', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#059669', marginBottom: 20}}>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                    <Text style={{color: '#34d399', fontSize: 11, fontWeight: 'bold'}}>CONNECTION ESTABLISHED</Text>
                    <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: '#34d399'}} />
                  </View>
                  <Text style={{color: '#f8fafc', fontSize: 14, fontWeight: 'bold'}}>{cloudAccount}</Text>
                  <Text style={{color: '#6ee7b7', fontSize: 12, marginTop: 4}}>Status: Fully Synchronized</Text>
                </View>
              ) : (
                <TouchableOpacity 
                  style={{backgroundColor: '#22c55e', padding: 16, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 20}}
                  onPress={handleGoogleAuth}
                >
                  <MaterialCommunityIcons name="google" size={20} color="white" />
                  <Text style={{color: 'white', fontWeight: 'bold', fontSize: 15}}>AUTHORIZE HIGH COMMAND</Text>
                </TouchableOpacity>
              )}

              <View style={{flexDirection: 'row', gap: 12}}>
                {cloudBackupEnabled ? (
                  <>
                    <TouchableOpacity style={{flex: 1, backgroundColor: '#1e293b', padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ef4444'}} onPress={handleDisconnectCloud}>
                      <Text style={{color: '#ef4444', fontWeight: 'bold', fontSize: 12}}>DISCONNECT</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{flex: 1, backgroundColor: '#334155', padding: 14, borderRadius: 10, alignItems: 'center'}} onPress={() => setShowCloudConsentModal(false)}>
                      <Text style={{color: 'white', fontWeight: 'bold', fontSize: 12}}>CLOSE</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity style={{flex: 1, backgroundColor: '#1e293b', padding: 14, borderRadius: 10, alignItems: 'center'}} onPress={() => setShowCloudConsentModal(false)}>
                      <Text style={{color: '#94a3b8', fontWeight: 'bold', fontSize: 12}}>ABORT</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </View>
        </Modal>

        {/* TACTICAL NOTE MODAL */}
        <Modal visible={showNoteModal} transparent animationType="fade">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, {backgroundColor: '#0f172a', borderColor: '#3b82f6', borderWidth: 2}]}>
                <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12}}>
                  <View style={{backgroundColor: '#1e293b', padding: 10, borderRadius: 12}}>
                    <MaterialCommunityIcons name="tag-text-outline" size={28} color="#3b82f6" />
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={[styles.modalTitle, {marginBottom: 0, textAlign: 'left', fontSize: 18}]}>Archive Metadata</Text>
                    <Text style={{color: '#64748b', fontSize: 12, fontWeight: 'bold'}}>MARK THIS TACTICAL SNAPSHOT</Text>
                  </View>
                </View>
                
                <View style={{backgroundColor: '#1e293b', padding: 12, borderRadius: 10, marginBottom: 20, borderWidth: 1, borderColor: '#334155'}}>
                  <Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold', marginBottom: 4, letterSpacing: 1}}>FINAL PRE-SNAPSHOT EVENT</Text>
                  <Text style={{color: '#3b82f6', fontSize: 13, fontStyle: 'italic'}}>{currentActivity}</Text>
                </View>

                <View style={{marginBottom: 20}}>
                  <Text style={styles.miniLabel}>TACTICAL NOTE</Text>
                  <TextInput 
                    style={{
                      backgroundColor: '#0f172a', 
                      color: '#f8fafc', 
                      borderRadius: 8, 
                      padding: 12, 
                      fontSize: 15, 
                      borderWidth: 1, 
                      borderColor: '#3b82f6',
                      minHeight: 100, 
                      textAlignVertical: 'top'
                    }}
                    placeholder="e.g. Pre-Experiment / Shopping Trip"
                    placeholderTextColor="#64748b"
                    value={tacticalNote}
                    onChangeText={setTacticalNote}
                    multiline
                    autoFocus
                  />
                </View>

                <View style={{flexDirection: 'row', gap: 12}}>
                  <TouchableOpacity style={{flex: 1, backgroundColor: '#1e293b', padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#334155'}} onPress={() => setShowNoteModal(false)}>
                    <Text style={{color: '#94a3b8', fontWeight: 'bold', fontSize: 13}}>CANCEL</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{flex: 2, backgroundColor: '#3b82f6', padding: 14, borderRadius: 10, alignItems: 'center'}} onPress={() => executeManualSnapshot(tacticalNote)}>
                    <Text style={{color: 'white', fontWeight: 'bold', fontSize: 13}}>CAPTURE SNAPSHOT</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* INLINE ADD CABINET MODAL */}
        <Modal visible={showInlineAddCabinet} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>NEW STORAGE CABINET</Text>
              
              <View style={{ marginBottom: 16, width: '100%' }}>
                <Text style={styles.miniLabel}>CABINET NAME</Text>
                <TextInput style={styles.inputSmall} value={inlineCabName} onChangeText={setInlineCabName} placeholder="e.g. Garage Freezer" placeholderTextColor="#64748b" autoFocus />
              </View>

              <View style={{ marginBottom: 16, width: '100%' }}>
                <Text style={styles.miniLabel}>LOCATION</Text>
                <TextInput style={styles.inputSmall} value={inlineCabLoc} onChangeText={setInlineCabLoc} placeholder="e.g. Garage" placeholderTextColor="#64748b" />
              </View>

              <View style={{ marginBottom: 24, width: '100%' }}>
                <Text style={styles.miniLabel}>CABINET TYPE</Text>
                <View style={styles.unitChipRowMini}>
                  <TouchableOpacity style={[styles.unitChip, inlineCabType === 'standard' && styles.unitChipActive]} onPress={() => setInlineCabType('standard')}><Text style={[styles.unitChipText, inlineCabType === 'standard' && styles.unitChipTextActive]}>Standard</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.unitChip, inlineCabType === 'freezer' && styles.unitChipActive]} onPress={() => { if (inlineCabType === 'freezer') setInlineCabType('standard'); else if (checkEntitlement('FREEZER')) setInlineCabType('freezer'); }}><Text style={[styles.unitChipText, inlineCabType === 'freezer' && styles.unitChipTextActive]}>Freezer</Text></TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity style={styles.saveButton} onPress={handleCreateInlineCabinet}>
                <Text style={styles.saveText}>CREATE CABINET</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalClose} onPress={() => setShowInlineAddCabinet(false)}>
                <Text style={styles.modalCloseText}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
        
        {/* OPERATIONAL HISTORY MODAL */}
        <Modal visible={showActivityModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, {backgroundColor: '#0f172a', borderColor: '#3b82f6', borderWidth: 2, padding: 24}]}>
              <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12}}>
                <View style={{backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: 12, borderRadius: 14}}>
                  <MaterialCommunityIcons name="history" size={32} color="#3b82f6" />
                </View>
                <View style={{flex: 1}}>
                  <Text style={[styles.modalTitle, {marginBottom: 0, textAlign: 'left', fontSize: 18}]}>Pre-Snapshot Event</Text>
                  <Text style={{color: '#64748b', fontSize: 11, fontWeight: 'bold', letterSpacing: 1}}>FINAL LOGGED CHANGE</Text>
                </View>
              </View>

              <View style={{backgroundColor: '#1e293b', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#334155', marginBottom: 12}}>
                <Text style={{color: '#f8fafc', fontSize: 15, lineHeight: 22, fontStyle: 'italic', textAlign: 'center'}}>
                  "{selectedActivity}"
                </Text>
              </View>

              <Text style={{color: '#64748b', fontSize: 11, fontStyle: 'italic', textAlign: 'center', marginBottom: 24, paddingHorizontal: 10}}>
                This event represents the final operational activity recorded on the database prior to the creation of this archive.
              </Text>

              <TouchableOpacity 
                style={{backgroundColor: '#1e293b', padding: 14, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#fbbf24', marginBottom: 16}} 
                onPress={async () => {
                   if (selectedBackup && selectedBackup.uri) {
                     try {
                       const content = await BackupService.readLocalBackup(selectedBackup.uri);
                       const parsed = JSON.parse(content);
                       if (parsed.tables && parsed.tables.TacticalLogs && parsed.tables.TacticalLogs.length > 0) {
                         setShowActivityModal(false);
                          const idx = backups.findIndex(b => b.uri === selectedBackup.uri);
                          const c = selectedBackup.counts;
                          const isBunker = idx === -1;
                          setIsBunkerLedger(isBunker);
                          const prevBackup = isBunker ? null : backups.find(b => b.timestamp < selectedBackup.timestamp && b.counts);
                          const prev = prevBackup?.counts;

                          if (prev && c) {
                            // Regular snapshot: diff against the one that was immediately prior in time
                            setMissionDelta({
                              units: c.units - prev.units,
                              batches: c.batches - prev.batches,
                              types: c.types - prev.types,
                              categories: c.categories - prev.categories,
                              cabinets: c.cabinets - prev.cabinets
                            });
                          } else if (isBunker && c && backups.length > 0 && backups[0].counts) {
                            // Bunker: drift FROM pinned baseline TO latest system state
                            const latest = backups[0].counts;
                            setMissionDelta({
                              units: latest.units - c.units,
                              batches: latest.batches - c.batches,
                              types: latest.types - c.types,
                              categories: latest.categories - c.categories,
                              cabinets: latest.cabinets - c.cabinets
                            });
                          } else {
                            setMissionDelta(null);
                          }

                          const prevTs = prevBackup ? prevBackup.timestamp : 0;
                          const filteredLogs = parsed.tables.TacticalLogs.filter((l: any) => l.timestamp > prevTs);
                          setMissionLogs([...filteredLogs].sort((a: any, b: any) => b.timestamp - a.timestamp));
                          setShowMissionLogs(true);
                       } else {
                         Alert.alert("No Logs", "This archive predates the tactical logging engine or has no logs.");
                       }
                     } catch (e) {
                       Alert.alert("Error", "Could not read archive data.");
                     }
                   }
                }}
              >
                <MaterialCommunityIcons name="text-box-search-outline" size={18} color="#fbbf24" />
                <Text style={{color: '#fbbf24', fontWeight: 'bold', fontSize: 13}}>VIEW ARCHIVED LOGS</Text>
              </TouchableOpacity>

              <View style={{flexDirection: 'row', gap: 12, marginBottom: 16}}>
                <TouchableOpacity 
                  style={{flex: 1, backgroundColor: '#ef4444', padding: 14, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8}} 
                  onPress={() => { setShowActivityModal(false); if (selectedBackup) handleLocalRestore(selectedBackup); }}
                >
                  <MaterialCommunityIcons name="backup-restore" size={18} color="white" />
                  <Text style={{color: 'white', fontWeight: 'bold', fontSize: 13}}>RESTORE</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{flex: 1, backgroundColor: '#1e293b', padding: 14, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#334155'}} 
                  onPress={() => { if (selectedBackup) BackupService.shareBackup(selectedBackup.uri); }}
                >
                  <MaterialCommunityIcons name="share-variant" size={18} color="#3b82f6" />
                  <Text style={{color: '#3b82f6', fontWeight: 'bold', fontSize: 13}}>SHARE</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity 
                style={{backgroundColor: '#3b82f6', padding: 16, borderRadius: 12, alignItems: 'center'}} 
                onPress={() => setShowActivityModal(false)}
              >
                <Text style={{color: 'white', fontWeight: 'bold', fontSize: 14}}>CLOSE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </>

      {/* ─── MISSION LOGS MODAL ─── */}
      <Modal visible={showMissionLogs} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%', padding: 0 }]}>
            <View style={{ padding: 20, backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <MaterialCommunityIcons name="clipboard-pulse-outline" size={24} color="#3b82f6" />
                  <Text style={{ color: '#f8fafc', fontSize: 18, fontWeight: 'bold' }}>Command Ledger</Text>
                </View>
                <TouchableOpacity onPress={() => setShowMissionLogs(false)}>
                  <MaterialCommunityIcons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>
              {isBunkerLedger ? (
                <View style={{ gap: 6 }}>
                  <Text style={{ color: '#94a3b8', fontSize: 12, lineHeight: 18 }}>
                    Operations below were captured when this snapshot was pinned.
                  </Text>
                  <Text style={{ color: '#fbbf24', fontSize: 11, lineHeight: 16 }}>
                    Entity counts show how far the current system has drifted from this pinned baseline.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 2 }}>
                  <Text style={{ color: '#94a3b8', fontSize: 12, lineHeight: 18 }}>
                    A record of everything that changed since the last snapshot.
                  </Text>
                  {missionDelta && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: '#64748b', fontSize: 10, fontWeight: 'bold' }}>
                        COMPARED TO: {missionLogs.length > 0 ? (backups.find(b => b.timestamp < selectedBackup?.timestamp)?.name || 'NONE') : 'NONE'}
                      </Text>
                      <View style={{ backgroundColor: '#1e293b', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 }}>
                        <Text style={{ color: '#94a3b8', fontSize: 8, fontWeight: 'bold' }}>POOL: {backups.length}</Text>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* TACTICAL METRICS PANEL */}
              <View style={{ marginTop: 16 }}>
                <View style={{ width: '100%', backgroundColor: '#0f172a', paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#3b82f6', marginBottom: 6 }}>
                  <Text style={{ color: '#f8fafc', fontSize: 18, fontWeight: 'bold' }}>{missionLogs.length}</Text>
                  <Text style={{ color: '#64748b', fontSize: 8.5, fontWeight: 'bold', marginTop: 4, letterSpacing: 1 }}>TOTAL OPERATIONS</Text>
                </View>

                {/* STRUCTURAL ENTITIES */}
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                  {[
                    { label: 'CABINETS', key: 'cabinets' },
                    { label: 'CATEGORIES', key: 'categories' },
                    { label: 'ITEM TYPES', key: 'types' }
                  ].map((metric, idx) => {
                    let displayVal = '-';
                    let color = '#64748b'; // default slate
                    
                    if (missionDelta) {
                      const net = (missionDelta as any)[metric.key] || 0;
                      if (net > 0) {
                        displayVal = `+${net}`;
                        color = '#34d399'; // green for growth
                      } else if (net < 0) {
                        displayVal = `${net}`;
                        color = '#f87171'; // red for depletion
                      } else {
                        displayVal = '0';
                        color = '#64748b';
                      }
                    }

                    return (
                      <View key={idx} style={{ 
                        flex: 1, 
                        backgroundColor: '#0f172a', 
                        paddingVertical: 10, 
                        borderRadius: 8, 
                        alignItems: 'center', 
                        borderWidth: 1, 
                        borderColor: '#334155' 
                      }}>
                        <Text style={{ color: color, fontSize: 16, fontWeight: 'bold' }}>{displayVal}</Text>
                        <Text style={{ color: '#94a3b8', fontSize: 8, fontWeight: 'bold', marginTop: 4, letterSpacing: 0.5 }}>{metric.label}</Text>
                      </View>
                    )
                  })}
                </View>

                {/* PHYSICAL ENTITIES */}
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[
                    { label: 'BATCHES', key: 'batches' },
                    { label: 'UNITS', key: 'units' }
                  ].map((metric, idx) => {
                    let displayVal = '-';
                    let color = '#64748b';
                    
                    if (missionDelta) {
                      const net = (missionDelta as any)[metric.key] || 0;
                      if (net > 0) {
                        displayVal = `+${net}`;
                        color = '#34d399';
                      } else if (net < 0) {
                        displayVal = `${net}`;
                        color = '#f87171';
                      } else {
                        displayVal = '0';
                        color = '#64748b';
                      }
                    }

                    return (
                      <View key={idx} style={{ 
                        flex: 1, 
                        backgroundColor: '#0f172a', 
                        paddingVertical: 10, 
                        borderRadius: 8, 
                        alignItems: 'center', 
                        borderWidth: 1, 
                        borderColor: '#334155' 
                      }}>
                        <Text style={{ color: color, fontSize: 16, fontWeight: 'bold' }}>{displayVal}</Text>
                        <Text style={{ color: '#94a3b8', fontSize: 8, fontWeight: 'bold', marginTop: 4, letterSpacing: 0.5 }}>{metric.label}</Text>
                      </View>
                    )
                  })}
                </View>
              </View>
            </View>
            
            <FlatList
              data={missionLogs}
              keyExtractor={item => item.id.toString()}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <View style={{ marginBottom: 12, backgroundColor: '#0f172a', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#1e293b' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ color: '#f8fafc', fontSize: 14, fontWeight: 'bold', flex: 1 }} numberOfLines={1}>{item.entity_name}</Text>
                    <Text style={{ color: '#64748b', fontSize: 10 }}>{new Date(item.timestamp).toLocaleString()}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ 
                      backgroundColor: 
                        item.action_type === 'ADD' ? '#065f46' : 
                        item.action_type === 'DELETE' ? '#7f1d1d' : 
                        item.action_type === 'MOVE' ? '#1e3a8a' : 
                        item.action_type === 'UPDATE' ? '#b45309' :
                        '#1e293b', 
                      paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 
                    }}>
                      <Text style={{ color: 'white', fontSize: 9, fontWeight: 'bold' }}>{item.action_type}</Text>
                    </View>
                    <Text style={{ color: '#94a3b8', fontSize: 10, fontWeight: 'bold' }}>{item.entity_type}</Text>
                    {item.action_type === 'UPDATE' && item.details && (() => {
                      let keyText = '';
                      try {
                        const parsed = JSON.parse(item.details);
                        const keys = Object.keys(parsed);
                        if (keys.length === 1) keyText = keys[0].replace(/_/g, ' ').toUpperCase();
                        else if (keys.length > 1) keyText = 'MULTIPLE';
                      } catch(e) {
                        keyText = 'DATA';
                      }
                      return keyText ? (
                        <>
                          <Text style={{ color: '#475569', fontSize: 10 }}>•</Text>
                          <Text style={{ color: '#cbd5e1', fontSize: 9, fontWeight: 'bold' }}>{keyText}</Text>
                        </>
                      ) : null;
                    })()}
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <MaterialCommunityIcons name="clipboard-off-outline" size={48} color="#1e293b" />
                  <Text style={{ color: '#64748b', marginTop: 12, textAlign: 'center' }}>No tactical actions recorded in this deployment.</Text>
                </View>
              }
            />
            
            <TouchableOpacity 
              style={{ padding: 16, backgroundColor: '#0f172a', borderTopWidth: 1, borderTopColor: '#1e293b' }} 
              onPress={() => setShowMissionLogs(false)}
            >
              <Text style={{ color: '#3b82f6', fontWeight: 'bold', textAlign: 'center' }}>CLOSE COMMAND LEDGER</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <CabinetFormModal 
        visible={showCabinetModal}
        initialData={selectedCabinetForEdit}
        allCabinets={cabinets}
        onSuccess={() => {
          setShowCabinetModal(false);
          load();
        }}
        onCancel={() => setShowCabinetModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  headerRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#1e293b', 
    paddingTop: Platform.OS === 'ios' ? 40 : 10, 
    paddingBottom: 15, 
    paddingHorizontal: 16, 
    borderBottomWidth: 1, 
    borderBottomColor: '#334155', 
    marginBottom: 0 
  },
  title: { fontSize: 24, color: '#f8fafc', fontWeight: 'bold' },
  headerSubtitle: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
  backBtn: { padding: 10, backgroundColor: '#334155', borderRadius: 24 },
  tabRow: { flexDirection: 'row', marginTop: 16, marginBottom: 20, marginHorizontal: 16, backgroundColor: '#1e293b', borderRadius: 8, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  tabActive: { backgroundColor: '#3b82f6' },
  feedbackText: { color: '#3b82f6', fontWeight: 'bold', fontSize: 13, letterSpacing: 1 },
  tabText: { color: '#64748b', fontWeight: 'bold', fontSize: 11, letterSpacing: 0.2 },
  tabTextActive: { color: 'white' },
  label: { color: '#94a3b8', fontSize: 16, marginBottom: 8, marginTop: 10, marginHorizontal: 16 },
  formLabel: { color: '#94a3b8', fontSize: 16, marginBottom: 12, marginTop: 12, marginHorizontal: 16 },
  prefRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', padding: 20, borderRadius: 12, marginBottom: 12, marginHorizontal: 16, borderWidth: 1, borderColor: '#334155' },
  prefTitle: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold' },
  prefSub: { color: '#94a3b8', fontSize: 13, marginTop: 4 },
  testBtn: { backgroundColor: '#3b82f6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 12, gap: 10, marginHorizontal: 16, marginTop: 10 },
  testBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  newCatBlock: { marginHorizontal: 16, marginBottom: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  newRow: { flexDirection: 'row', alignItems: 'center' },
  inputMedium: { flex: 1, backgroundColor: '#0f172a', color: '#f8fafc', borderRadius: 8, padding: 12, fontSize: 16, borderWidth: 1, borderColor: '#334155', marginRight: 10 },
  addSaveBtnLarge: { backgroundColor: '#3b82f6', padding: 14, borderRadius: 8 },
  addSaveTextLarge: { color: 'white', fontWeight: 'bold' },
  inputSmall: { flex: 1, backgroundColor: '#0f172a', color: '#f8fafc', borderRadius: 6, padding: 8, fontSize: 14, borderWidth: 1, borderColor: '#334155' },
  addSaveBtn: { backgroundColor: '#22c55e', padding: 10, borderRadius: 6 },
  addSaveText: { color: 'white', fontWeight: '600', fontSize: 12 },
  catCard: { marginHorizontal: 16, backgroundColor: '#1e293b', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, marginBottom: 12 },
  catTitle: { color: '#e2e8f0', fontSize: 18, fontWeight: 'bold', lineHeight: 24 },
  catTitleInput: { 
    backgroundColor: '#0f172a', 
    color: '#f8fafc', 
    borderRadius: 6, 
    paddingHorizontal: 10, 
    paddingVertical: 0,
    fontSize: 16, 
    fontWeight: 'bold',
    borderWidth: 1, 
    borderColor: '#3b82f6',
    height: 36
  },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catActions: { flexDirection: 'row', alignItems: 'center' },
  saveActionBtn: { backgroundColor: '#22c55e', padding: 8, borderRadius: 6, marginLeft: 8, height: 36, width: 36, alignItems: 'center', justifyContent: 'center' },
  typeRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#334155' },
  typeText: { color: '#cbd5e1', fontSize: 15, flex: 1 },
  addNewBtn: { marginTop: 12 },
  addNewText: { color: '#3b82f6', fontWeight: '600' },
  newTypeContainer: { marginTop: 12, backgroundColor: '#0f172a', padding: 10, paddingTop: 0, borderRadius: 8 },
  addSaveBtnFull: { backgroundColor: '#22c55e', padding: 12, borderRadius: 6, alignItems: 'center', marginTop: 10 },
  unitChipRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  unitChipRowMini: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  unitChip: { flex: 1, paddingVertical: 6, marginHorizontal: 2, alignItems: 'center', borderRadius: 6, backgroundColor: '#1e293b' },
  unitChipActive: { backgroundColor: '#3b82f6' },
  unitChipText: { color: '#64748b', fontSize: 12, fontWeight: 'bold' },
  unitChipTextActive: { color: 'white' },
  chip: { backgroundColor: '#334155', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, marginRight: 8 },
  chipActive: { backgroundColor: '#3b82f6' },
  chipText: { color: '#cbd5e1', fontWeight: 'bold' },
  chipTextActive: { color: 'white' },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 24, marginTop: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 10, gap: 8 },
  actionBtnText: { color: 'white', fontWeight: 'bold', fontSize: 13 },
  backupItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', padding: 16, borderRadius: 10, marginBottom: 8 },
  backupName: { color: '#f8fafc', fontSize: 14, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontWeight: 'bold' },
  backupMeta: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  shareBtn: { backgroundColor: '#334155', padding: 10, borderRadius: 8 },
  statBadgeRow: { flexDirection: 'row', marginLeft: 36, marginTop: 4, flexWrap: 'wrap', gap: 5 },
  statBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#0f172a', 
    paddingHorizontal: 7, 
    paddingVertical: 2, 
    borderRadius: 4, 
    borderWidth: 1, 
    borderColor: '#334155' 
  },
  statBadgeText: { color: '#94a3b8', fontSize: 10, fontWeight: 'bold', marginLeft: 4, textTransform: 'uppercase' },
  metricsPanel: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 16 },
  metricCard: { flex: 1, backgroundColor: '#1e293b', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center' },
  metricVal: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold' },
  metricLabel: { color: '#64748b', fontSize: 8.5, fontWeight: 'bold', marginTop: 4, letterSpacing: 0.5, textAlign: 'center' },
  advisoryWarning: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1c1200', borderLeftWidth: 4, borderLeftColor: '#fbbf24', padding: 12, marginHorizontal: 16, marginBottom: 20 },
  advisoryText: { flex: 1, color: '#fbbf24', fontSize: 12, fontWeight: 'bold', fontStyle: 'italic' },
  lockOverlay: { 
    backgroundColor: '#0f172a', 
    borderWidth: 1, 
    borderColor: '#334155', 
    borderStyle: 'dashed', 
    padding: 20, 
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center',
    gap: 8,
    marginTop: 8
  },
  lockText: { color: '#fbbf24', fontSize: 10, fontWeight: 'bold', textAlign: 'center' },
  promoHeader: { alignItems: 'center', backgroundColor: '#1e293b', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#334155' },
  promoTitle: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold', letterSpacing: 1 },
  promoSub: { color: '#94a3b8', fontSize: 12, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  tierCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
  tierCardActive: { backgroundColor: '#1e293b', borderColor: '#22c55e', borderLeftWidth: 4 },
  tierStatusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  tierCardRank: { color: '#94a3b8', fontSize: 13, fontWeight: 'bold', letterSpacing: 1 },
  activeRankBadge: { backgroundColor: '#22c55e', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  activeRankText: { color: 'white', fontSize: 9, fontWeight: 'bold' },
  tierPrice: { fontSize: 13, fontWeight: 'bold', marginBottom: 16, marginTop: 4 },
  featureItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  featureText: { color: '#cbd5e1', fontSize: 12, fontWeight: '500' },
  upgradeBtn: { padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  upgradeBtnText: { color: 'white', fontWeight: 'bold', fontSize: 13, letterSpacing: 0.5 },
  lockedNote: { marginTop: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#334155' },
  lockedNoteText: { color: '#64748b', fontSize: 11, fontStyle: 'italic' },
  promoFooter: { color: '#94a3b8', fontSize: 11, textAlign: 'center', marginTop: 10, lineHeight: 16 },
  miniLabel: { color: '#cbd5e1', fontSize: 12, fontWeight: 'bold', marginBottom: 4, paddingLeft: 4, textTransform: 'uppercase' },
  doctrineToggle: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 3,
    width: 160,
    borderWidth: 1,
    borderColor: '#334155',
  },
  doctrineOption: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  doctrineOptionActive: {
    backgroundColor: '#fbbf24',
  },
  doctrineText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  doctrineTextActive: {
    color: '#000000',
  },
  formSection: { marginBottom: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1e293b', borderRadius: 16, padding: 24, maxHeight: '80%' },
  modalTitle: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  modalClose: { marginTop: 20, padding: 15, alignItems: 'center' },
  modalCloseText: { color: '#ef4444', fontWeight: 'bold', letterSpacing: 1 },
  saveButton: { backgroundColor: '#22c55e', padding: 18, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  saveText: { color: 'white', fontWeight: 'bold', fontSize: 18 }
});


