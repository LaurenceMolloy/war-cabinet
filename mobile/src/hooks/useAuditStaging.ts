import { useState, useEffect } from 'react';
import { Database } from '../database';
import { VoiceDAL } from '../database/Voice';
import { SQLiteDatabase } from 'expo-sqlite';
import * as Speech from 'expo-speech';
import { Vibration, Alert, Platform } from 'react-native';

export function useAuditStaging(db: SQLiteDatabase, selectedCabinetId: string | null) {
  const [briefing, setBriefing] = useState<any>(null);
  const [pendingChanges, setPendingChanges] = useState<any[]>([]);
  const [isReviewVisible, setIsReviewVisible] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      if (!selectedCabinetId) {
        setBriefing(null);
        setPendingChanges([]);
        return;
      }
      // Clear zombie records before we start
      await db.execAsync('DELETE FROM AuditPendingChanges');
      const [briefingData, pendingData] = await Promise.all([
        Database.Inventory.getAuditBriefing(db, selectedCabinetId),
        Database.Inventory.getPendingChanges(db)
      ]);
      setBriefing(briefingData);
      setPendingChanges(pendingData);
    };
    loadData();
  }, [db, selectedCabinetId]);

  const updateStats = async () => {
    const pendingData = await Database.Inventory.getPendingChanges(db);
    setPendingChanges(pendingData);
    
    if (selectedCabinetId) {
      const updatedBriefing = await Database.Inventory.getAuditBriefing(db, selectedCabinetId);
      setBriefing(updatedBriefing);
    }
  };

  const refreshPending = async () => {
    const data = await Database.Inventory.getPendingChanges(db);
    setPendingChanges(data);
  };

  const recordVerified = async (item: any) => {
    await Database.Inventory.markAudited(db, item.id, 'VERIFIED');
    await Database.Inventory.clearPendingChanges(db, item.id);
    await updateStats();
  };

  const recordAdjustment = async (item: any, found: number) => {
    await Database.Inventory.proposeAdjustment(db, item.id, item.item_type_id, found);
    await updateStats();
  };

  const recordDiscovery = async (itemTypeId: number, quantity: number, discoveryIntel: any) => {
    await Database.Inventory.proposeNewDiscovery(db, itemTypeId, selectedCabinetId, {
      quantity,
      ...discoveryIntel
    });
    await updateStats();
  };

  const recordMIA = async (item: any) => {
    await Database.Inventory.proposeMIA(db, item.id, item.item_type_id);
    await updateStats();
  };

  const sweepSector = async () => {
    if (!selectedCabinetId) return 0;
    setIsProcessing(true);
    const sessionWindow = Date.now() - 72 * 60 * 60 * 1000;
    const untouched = await VoiceDAL.getUnauditedBatches(db, selectedCabinetId, sessionWindow);

    for (const item of untouched) {
      await Database.Inventory.proposeMIA(db, item.id, item.item_type_id);
    }
    await updateStats();
    setIsReviewVisible(true);
    setIsProcessing(false);
    return untouched.length;
  };

  const authorizeAll = async () => {
    setIsProcessing(true);
    for (const change of pendingChanges) {
      await Database.Inventory.commitPendingChange(db, change.id);
    }
    await updateStats();
    setIsReviewVisible(false);
    setIsProcessing(false);
    Speech.speak("All tactical updates authorized. Master records synchronized.", { rate: 1.0 });
  };

  const discardChange = async (id: string) => {
    await Database.Inventory.discardPendingChange(db, id);
    await refreshPending();
  };

  const updatePendingQuantity = async (changeId: number, newQty: number, currentQty: number) => {
    await Database.Inventory.updatePendingQuantity(db, changeId, newQty, currentQty);
    await refreshPending();
  };

  const resetAudit = async () => {
    if (!selectedCabinetId) return;
    const title = "RESTART AUDIT MISSION";
    const msg = "WARNING: This will completely wipe all audit progress, verify timestamps, and discard ALL pending changes for this cabinet. This cannot be undone. Are you sure you want to start from scratch?";

    const performReset = async () => {
      await Database.Inventory.resetCabinetAudit(db, selectedCabinetId);
      const data = await Database.Inventory.getAuditBriefing(db, selectedCabinetId);
      setBriefing(data);
      Vibration.vibrate(200);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${msg}`)) {
        await performReset();
      }
    } else {
      Alert.alert(
        title,
        msg,
        [
          { text: "CANCEL", style: "cancel" },
          { 
            text: "RESTART FROM SCRATCH", 
            style: "destructive", 
            onPress: performReset
          }
        ]
      );
    }
  };

  return {
    briefing,
    pendingChanges,
    isReviewVisible,
    setIsReviewVisible,
    isProcessing,
    setIsProcessing,
    recordVerified,
    recordAdjustment,
    recordDiscovery,
    recordMIA,
    sweepSector,
    authorizeAll,
    discardChange,
    updatePendingQuantity,
    resetAudit
  };
}
