import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform, Linking, Vibration, Image, Modal, Animated, Easing, PanResponder } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { useSpeechRecognitionEvent, ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import * as Speech from 'expo-speech';
import { Database } from '../database';
import { VoiceDAL } from '../database/Voice';
import { normalizePhrase } from '../services/VoiceSearchEngine';
import { styles } from '../styles/audit_intel.styles';
import { useVoiceEngine } from '../hooks/useVoiceEngine';
import { useAuditStaging } from '../hooks/useAuditStaging';
import { useDialogManager, VoiceSearchResult } from '../hooks/useDialogManager';

/**
 * VOICE INTEL POC: ACOUSTIC-TO-SEMANTIC MAPPING
 * 
 * PURPOSE: Prove that token-based intersection scoring can accurately 
 * map fluid speech to structured database records.
 * 
 * RULES OF ENGAGEMENT:
 * 1. STANDALONE: This file contains its own interrogation state machine.
 * 2. INTEGRATED DAL: Uses the production Database DAL for audit persistence.
 * 3. TRANSPARENCY: UI shows "Match Evidence" for debugging.
 */

export default function VoiceIntelPoCScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const AUDIT_SESSION_WINDOW = 72 * 60 * 60 * 1000;

  const [results, setResults] = useState<VoiceSearchResult[]>([]);
  const [sessionActive, setSessionActive] = useState(false);
  const [normalizedTranscript, setNormalizedTranscript] = useState('');
  const [cabinets, setCabinets] = useState<{id: string, name: string}[]>([]);
  const [selectedCabinetId, setSelectedCabinetId] = useState<string | null>(null);
  const [callsign, setCallsign] = useState<'SIR' | "MA'AM" | 'COMMANDER'>('COMMANDER');
  const [remainingTargets, setRemainingTargets] = useState<any[]>([]);
  const [bountyTargets, setBountyTargets] = useState<any[]>([]);
  const [adjustingItem, setAdjustingItem] = useState<any | null>(null);
  const [adjustingQty, setAdjustingQty] = useState<number>(1);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [categoryProgress, setCategoryProgress] = useState<Record<string, { total: number, audited: number }>>({});
  
  const {
    briefing,
    pendingChanges,
    stageRevision,
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
  } = useAuditStaging(db, selectedCabinetId);

  const interrogationBuffer = React.useRef<string>('');
  const isSpeaking = React.useRef(false);
  const [knownVocab, setKnownVocab] = useState<string[]>([]);
  const engineActionsRef = React.useRef<{startListening: () => void} | null>(null);

  const dialogManager = useDialogManager({
    callsign,
    setSessionActive,
    setResults,
    startListening: () => engineActionsRef.current?.startListening(),
    isSpeakingRef: isSpeaking,
    interrogationBufferRef: interrogationBuffer,
    recordVerified,
    recordAdjustment,
    recordDiscovery,
    recordMIA,
  });

  const { 
    phase, 
    candidates, 
    interrogationHistory, 
    isDiscoveryMode, 
    handleRestartMission,
    beginInterrogation,
    setIsDiscoveryMode,
    setPhase,
    askQuestion
  } = dialogManager;

  const [isBriefingExpanded, setIsBriefingExpanded] = useState(false);
  const mainScrollRef = React.useRef<ScrollView>(null);

  useEffect(() => {
    if (results.length > 0 && isBriefingExpanded) {
      setIsBriefingExpanded(false);
    }
  }, [results.length]);

  useEffect(() => {

    const fetchVocab = async () => {
      try {
        const vocab = await VoiceDAL.getVoiceVocabulary(db);
        setKnownVocab(vocab);
        console.log('Lexical Snapper: Vocabulary loaded (' + vocab.length + ' terms)');
      } catch (e) {
        console.error('Vocab fetch failed', e);
      }
    };

    const fetchCabinets = async () => {
      try {
        const sorted = await VoiceDAL.getVoiceCabinets(db);
        setCabinets(sorted);
      } catch (e) {
        console.error('Cabinet fetch failed', e);
      }
    };

    fetchVocab();
    fetchCabinets();
  }, [db]);

  const lastCabinetIdRef = React.useRef<string | null>(null);

  const loadRemainingTargets = useCallback(async () => {
    const cabinetChanged = lastCabinetIdRef.current !== selectedCabinetId;
    lastCabinetIdRef.current = selectedCabinetId;

    if (!selectedCabinetId) {
      if (cabinetChanged) {
        // Preemptive clear only during actual view transition to avoid format clash ghosting
        setRemainingTargets([]);
        setBountyTargets([]);
        setCategoryProgress({});
      }
      
      const globalBounties = await VoiceDAL.getTopAuditBounties(db, null, 5);
      setBountyTargets(globalBounties);
      return;
    }
    
    const sessionWindow = Date.now() - AUDIT_SESSION_WINDOW;
    const targets = await VoiceDAL.getUnauditedBatches(db, selectedCabinetId, sessionWindow);
    const bounties = await VoiceDAL.getTopAuditBounties(db, selectedCabinetId, 3);
    
    // Set them together to minimize render cycles
    setRemainingTargets(targets);
    setBountyTargets(bounties);

    try {
      const progressList = await VoiceDAL.getCategoryCompletion(db, selectedCabinetId, sessionWindow);
      const progressMap: Record<string, { total: number, audited: number }> = {};
      for (const row of progressList) {
        progressMap[row.category_name] = { total: row.total, audited: row.audited };
      }
      setCategoryProgress(progressMap);
    } catch (e) {
      console.error('Failed to load category progress stats', e);
    }
  }, [db, selectedCabinetId]);

  useEffect(() => {
    loadRemainingTargets();
  }, [loadRemainingTargets, briefing, stageRevision]);

  const {
    isListening,
    partialText,
    finalTranscript,
    errorMessage,
    recognitionService,
    onDeviceAvailable,
    startListening,
    stopListening,
    triggerDownload,
    setPartialText,
    setFinalTranscript,
  } = useVoiceEngine({
    phase: dialogManager.phase,
    sessionActive,
    setSessionActive,
    isSpeakingRef: isSpeaking,
    interrogationBufferRef: interrogationBuffer,
    onWakeWord: () => {
      Speech.speak('What product?', { 
        rate: 1.0,
        onDone: () => {
          isSpeaking.current = false;
          Vibration.vibrate(50);
          engineActionsRef.current?.startListening();
        }
      });
    },
    onAbandon: () => {
      dialogManager.setPhase('IDLE');
      setSessionActive(false);
      Speech.speak('Audit abandoned.', { rate: 1.0 });
    },
    onOptions: () => {
      dialogManager.speakOptions(dialogManager.phase, dialogManager.candidates);
    },
    onRestart: () => dialogManager.handleRestartMission(),
    onComplete: () => handleEndMission(),
    onMIA: () => dialogManager.handleMIA(),
    onTerminate: async (answer: string) => {
      if (dialogManager.phase === 'QUANTITY_CHECK') {
        await dialogManager.handleQuantityCheck(answer);
      } else {
        await dialogManager.handleInterrogationResponse(answer);
      }
    },
    onInitialPayload: (text: string) => processInitialPayload(text),
  });

  useEffect(() => {
    engineActionsRef.current = { startListening };
  }, [startListening]);

  const normalizePhraseFn = (rawText: string) => normalizePhrase(rawText, knownVocab);

  const processInitialPayload = async (rawText: string) => {
    try {
      setIsProcessing(true);
      
      // Normalize and find base tokens
      const normalized = normalizePhraseFn(rawText);
      setNormalizedTranscript(normalized);
      const tokens = normalized.split(' ').filter(t => t.length > 1 && t !== 'OVER');

      if (tokens.length === 0) {
        Speech.speak("Intelligence payload empty. Standing down.", { rate: 1.0 });
        return;
      }

      const rows = await VoiceDAL.searchInventory(db, tokens);
      
      // 2. INITIAL SCORING
      const scored = rows.map(row => {
        let score = 0;
        const evidence: MatchEvidence[] = [];
        tokens.forEach(token => {
          if (row.name.toLowerCase().includes(token)) {
            score += 1.5;
            evidence.push({ field: 'name', token, confidence: 1.0 });
          }
          if (row.brand?.toLowerCase().includes(token)) {
            score += 1.0;
            evidence.push({ field: 'brand', token, confidence: 1.0 });
          }
        });
        if (selectedCabinetId && (String(row.cabinet_id) === String(selectedCabinetId) || String(row.default_cabinet_id) === String(selectedCabinetId))) {
          score *= 2.0;
        }
        
        return { ...row, score, evidence };
      }).filter(r => {
        if (r.score <= 0) return false;
        // Strictly constrain match candidates to the active cabinet sector if one is selected
        if (selectedCabinetId) {
          return String(r.cabinet_id) === String(selectedCabinetId) || 
                 String(r.default_cabinet_id) === String(selectedCabinetId);
        }
        return true;
      }).sort((a, b) => b.score - a.score);

      if (scored.length === 0) {
        Speech.speak("No tactical matches found.", { rate: 1.0 });
        dialogManager.setPhase('IDLE');
        return;
      }

      dialogManager.setCandidates(scored);
      setResults(scored);
      dialogManager.beginInterrogation(scored);
    } catch (err) {
      console.error(err);
    } finally {
setIsProcessing(false);
    }
  };


  const handleEndMission = async () => {
    if (!selectedCabinetId) return;
    
    dialogManager.setPhase('IDLE');
    setSessionActive(false);
    Vibration.vibrate([0, 100, 50, 100, 50, 200]);

    const count = await sweepSector();
    Speech.speak(`Sector sweep complete, ${callsign}. Identified ${count} untouched items. All logged as PENDING MISSING for your final review at HQ.`, { rate: 1.0 });
    
    dialogManager.setInterrogationHistory(prev => [...prev, `MISSION COMPLETE: ${count} UNTOUCHED ITEMS LOGGED AS MIA`]);
  };

  const handleAuthorizeAll = async () => {
    await authorizeAll();
    setSelectedCabinetId(null);
  };

  const handleDiscardChange = async (id: string) => {
    await discardChange(id);
  };

  const handleResetAudit = async () => {
    await resetAudit();
  };



  const handleScrollToTargets = () => {
    mainScrollRef.current?.scrollToEnd({ animated: true });
  };

  const handleClearSearch = () => {
    setResults([]);
    setFinalTranscript('');
    setPartialText('');
    setPhase('IDLE');
    setIsDiscoveryMode(false);
  };

  const renderPendingModal = () => (
    <Modal
      visible={isReviewVisible}
      animationType="slide"
      transparent={true}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.reviewModalContainer}>
          <View style={styles.reviewHeader}>
            <Text style={styles.reviewTitle}>LOGISTICS AUTHORIZATION</Text>
            <TouchableOpacity onPress={() => setIsReviewVisible(false)}>
              <MaterialCommunityIcons name="close" size={24} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.reviewList}>
            {pendingChanges.length === 0 ? (
              <View style={styles.emptyReview}>
                <MaterialCommunityIcons name="check-all" size={48} color="#1e293b" />
                <Text style={styles.emptyReviewText}>NO PENDING CHANGES IN SECTOR</Text>
              </View>
            ) : (
              pendingChanges.map(change => {
                const intel = JSON.parse(change.proposed_intel);
                const isNew = change.change_type === 'NEW';
                const isMIA = change.change_type === 'MIA';
                const isVerify = change.change_type === 'VERIFY';
                const isAdjust = change.change_type === 'ADJUST';

                const cardColor = isNew || isVerify ? '#10b981' : isMIA ? '#ef4444' : '#fbbf24';

                return (
                  <View key={change.id} style={styles.reviewCard}>
                    <View style={[
                      styles.reviewTypeIndicator, 
                      { backgroundColor: cardColor }
                    ]} />
                    <View style={styles.reviewCardContent}>
                      <Text style={styles.reviewProductName}>{change.name}</Text>
                      <Text style={styles.reviewDetail}>
                        Cabinet: {change.cabinet_name || 'Unknown'}
                      </Text>
                      <Text style={styles.reviewDetail}>
                        Brand: {isNew && intel.brand ? intel.brand : (change.brand || 'No Brand')}
                      </Text>
                      <Text style={styles.reviewDetail}>
                        Range: {isNew && intel.range ? intel.range : (change.product_range || 'No Range')}
                      </Text>
                      <Text style={styles.reviewDetail}>
                        Size: {isNew && intel.size ? intel.size : (change.size || 'STD')}{change.unit_type === 'weight' ? 'g' : (change.unit_type === 'volume' ? 'ml' : '')}
                      </Text>
                      <Text style={styles.reviewDetail}>
                        Expiry: {(isNew && intel.month) || change.expiry_month ? `${(isNew && intel.month) || change.expiry_month}/${(isNew && intel.year) || change.expiry_year}` : 'No Date'}
                      </Text>
                      
                      {isNew && (
                        <Text style={[styles.reviewDetail, { color: '#10b981', fontWeight: 'bold', marginTop: 4 }]}>
                          NEW RECRUIT: +{intel.quantity} units
                        </Text>
                      )}
                      
                      {!isNew && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 12 }}>
                          <Text style={[styles.reviewDetail, { color: cardColor, fontWeight: 'bold' }]}>
                            {isVerify ? 'MATCHED' : (isMIA ? 'MISSING' : 'EXPECTED')}: {change.current_qty}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#334155', borderRadius: 8 }}>
                            <TouchableOpacity 
                              style={{ padding: 8 }}
                              onPress={() => updatePendingQuantity(change.id, Math.max(0, intel.quantity - 1), change.current_qty)}
                            >
                              <MaterialCommunityIcons name="minus" size={20} color="#94a3b8" />
                            </TouchableOpacity>
                            <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold', paddingHorizontal: 12 }}>
                              {intel.quantity}
                            </Text>
                            <TouchableOpacity 
                              style={{ padding: 8 }}
                              onPress={() => updatePendingQuantity(change.id, intel.quantity + 1, change.current_qty)}
                            >
                              <MaterialCommunityIcons name="plus" size={20} color="#94a3b8" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity 
                      style={styles.discardButton}
                      onPress={() => handleDiscardChange(change.id)}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </ScrollView>

          <View style={styles.reviewFooter}>
            <TouchableOpacity 
              style={[styles.footerButton, styles.cancelButton]}
              onPress={() => setIsReviewVisible(false)}
            >
              <Text style={styles.footerButtonText}>CLOSE</Text>
            </TouchableOpacity>
            
            {pendingChanges.length > 0 && (
              <TouchableOpacity 
                style={[styles.footerButton, styles.authorizeButton]}
                onPress={handleAuthorizeAll}
                disabled={isProcessing}
              >
                <Text style={styles.footerButtonText}>AUTHORIZE ALL</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );

  const handleOpenAdjustQty = (item: any) => {
    setAdjustingItem(item);
    setAdjustingQty(item.quantity);
  };

  const renderAdjustModal = () => {
    if (!adjustingItem) return null;
    
    return (
      <Modal
        visible={!!adjustingItem}
        transparent
        animationType="fade"
        onRequestClose={() => setAdjustingItem(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={{ 
            backgroundColor: '#0f172a', 
            borderRadius: 16, 
            borderWidth: 1, 
            borderColor: '#3b82f6', 
            padding: 24,
            width: '100%',
            maxWidth: 320,
            alignSelf: 'center',
            shadowColor: '#3b82f6',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.25,
            shadowRadius: 16,
            elevation: 10
          }}>
            <Text style={{ color: '#64748b', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 8, textAlign: 'center' }}>
              MANUAL QUANTITY ADJUSTMENT
            </Text>
            
            <Text style={{ color: '#f8fafc', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 }}>
              {adjustingItem.name}
            </Text>
            
            <Text style={{ color: '#94a3b8', fontSize: 11, textAlign: 'center', marginBottom: 20 }}>
              {adjustingItem.brand || 'NO BRAND'} • {adjustingItem.size || 'STD'}{adjustingItem.unit_type === 'weight' ? 'g' : (adjustingItem.unit_type === 'volume' ? 'ml' : '')}
            </Text>
            
            {/* Minus, Number, Plus Controls */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 24 }}>
              <TouchableOpacity 
                onPress={() => setAdjustingQty(prev => Math.max(0, prev - 1))}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: '#1e293b',
                  borderWidth: 1,
                  borderColor: '#334155',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <MaterialCommunityIcons name="minus" size={24} color="#f8fafc" />
              </TouchableOpacity>
              
              <Text style={{ color: '#3b82f6', fontSize: 36, fontWeight: '900', minWidth: 48, textAlign: 'center' }}>
                {adjustingQty}
              </Text>
              
              <TouchableOpacity 
                onPress={() => setAdjustingQty(prev => prev + 1)}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: '#1e293b',
                  borderWidth: 1,
                  borderColor: '#334155',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <MaterialCommunityIcons name="plus" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>
            
            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity 
                onPress={() => setAdjustingItem(null)}
                style={{
                  flex: 1,
                  backgroundColor: '#1e293b',
                  paddingVertical: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#334155',
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>CANCEL</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={async () => {
                  const qty = adjustingQty;
                  const item = adjustingItem;
                  setAdjustingItem(null);
                  if (qty === 0) {
                    await recordMIA(item);
                  } else if (qty === item.quantity) {
                    await recordVerified(item);
                  } else {
                    await recordAdjustment(item, qty);
                  }
                  Vibration.vibrate([0, 50, 50, 50]);
                }}
                style={{
                  flex: 1,
                  backgroundColor: '#3b82f6',
                  paddingVertical: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#60a5fa',
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: 'bold' }}>CONFIRM</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderBriefingModal = () => (
    <Modal
      visible={isBriefingExpanded}
      animationType="slide"
      transparent={true}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.reviewModalContainer}>
          <View style={styles.reviewHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialCommunityIcons name="shield" size={20} color="#fbbf24" />
              <Text style={styles.reviewTitle}>MISSION BRIEFING</Text>
            </View>
            <TouchableOpacity onPress={() => setIsBriefingExpanded(false)}>
              <MaterialCommunityIcons name="close" size={24} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ paddingHorizontal: 20, paddingTop: 10 }}>
            {briefing && (
              <>
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ color: '#475569', fontSize: 10, fontWeight: 'bold' }}>ACTIVE WINDOW:</Text>
                  <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold', marginTop: 4 }}>{briefing.windowStart} (ACTIVE CABINET CYCLE)</Text>
                </View>

                <View style={styles.briefingMetrics}>
                  <View style={styles.metricBlock}>
                    <Text style={styles.metricVal}>{briefing.counts.total}</Text>
                    <Text style={styles.metricLabel}>TARGET BATCHES</Text>
                  </View>
                  <View style={styles.metricBlock}>
                    <Text style={[styles.metricVal, { color: briefing.percents.complete >= 100 ? '#10b981' : '#fbbf24' }]}>
                      {Math.round(briefing.percents.complete)}%
                    </Text>
                    <Text style={styles.metricLabel}>COMPLETION</Text>
                  </View>
                </View>

                {briefing.isExempt ? (
                  <View style={{ backgroundColor: '#1e293b', padding: 12, borderRadius: 6, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#334155', borderStyle: 'dashed' }}>
                    <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>NO ACTIVE MANEUVER SCHEDULE</Text>
                  </View>
                ) : (
                  <View style={[styles.progressBarBg, { marginBottom: 16 }]}>
                    <View style={[styles.progressBarFill, { width: `${briefing.percents.complete}%`, backgroundColor: briefing.percents.complete >= 100 ? '#10b981' : '#fbbf24' }]} />
                  </View>
                )}
                
                <View style={[styles.integrityRow, { flexDirection: 'column', gap: 6, alignItems: 'flex-start', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#1e293b', marginBottom: 20 }]}>
                  <Text style={[styles.integrityLabel, { marginBottom: 4 }]}>INTEL INTEGRITY BREAKDOWN:</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                    <Text style={[styles.integrityStat, { color: '#10b981', fontWeight: 'bold' }]}>VERIFIED: {Math.round(briefing.percents.verified)}%</Text>
                    <Text style={[styles.integrityStat, { color: '#fbbf24', fontWeight: 'bold' }]}>ADJUSTED: {Math.round(briefing.percents.adjusted)}%</Text>
                    <Text style={[styles.integrityStat, { color: '#c084fc', fontWeight: 'bold' }]}>PENDING: {Math.round(briefing.percents.pending)}%</Text>
                    <Text style={[styles.integrityStat, { color: '#3b82f6', fontWeight: 'bold' }]}>NEW BATCHES: {Math.round(briefing.percents.new)}%</Text>
                    <Text style={[styles.integrityStat, { color: '#ef4444', fontWeight: 'bold' }]}>MIA (MISSING): {Math.round(briefing.percents.mia)}%</Text>
                  </View>
                </View>

                <View style={{ gap: 12 }}>
                  <Text style={{ color: '#64748b', fontSize: 10, fontWeight: 'bold' }}>TACTICAL ACTIONS:</Text>

                  {pendingChanges.length > 0 && (
                    <TouchableOpacity 
                      onPress={() => {
                        setIsBriefingExpanded(false);
                        setIsReviewVisible(true);
                      }} 
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#c084fc22', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#c084fc55' }}
                    >
                      <MaterialCommunityIcons name="clipboard-check" size={16} color="#c084fc" />
                      <Text style={{ color: '#c084fc', fontSize: 11, fontWeight: 'bold' }}>REVIEW & AUTHORIZE ({pendingChanges.length})</Text>
                    </TouchableOpacity>
                  )}

                  {!briefing.isExempt && (
                    <TouchableOpacity 
                      onPress={() => {
                        setIsBriefingExpanded(false);
                        handleResetAudit();
                      }} 
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#ef444422', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ef444455' }}
                    >
                      <MaterialCommunityIcons name="refresh" size={16} color="#ef4444" />
                      <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: 'bold' }}>RESTART CABINET AUDIT</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </ScrollView>

          <View style={styles.reviewFooter}>
            <TouchableOpacity 
              style={[styles.footerButton, styles.cancelButton]}
              onPress={() => setIsBriefingExpanded(false)}
            >
              <Text style={styles.footerButtonText}>CLOSE BRIEFING</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={28} color="#3b82f6" />
        </TouchableOpacity>
        <Text style={styles.title}>AUDIT INTEL</Text>
        {selectedCabinetId && briefing ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity 
              onPress={() => setIsBriefingExpanded(true)}
              style={{ 
                backgroundColor: briefing.percents.complete >= 100 ? '#10b98122' : '#fbbf2422', 
                height: 28,
                paddingHorizontal: 8, 
                borderRadius: 14, 
                borderWidth: 1, 
                borderColor: briefing.percents.complete >= 100 ? '#10b98144' : '#fbbf2444', 
                flexDirection: 'row', 
                alignItems: 'center', 
                gap: 4 
              }}
            >
              <MaterialCommunityIcons 
                name="shield-check" 
                size={12} 
                color={briefing.percents.complete >= 100 ? '#10b981' : '#fbbf24'} 
              />
              <Text style={{ 
                color: briefing.percents.complete >= 100 ? '#10b981' : '#fbbf24', 
                fontSize: 10, 
                fontWeight: '900' 
              }}>
                {Math.round(briefing.percents.complete)}%
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={isListening ? stopListening : startListening}
              style={{ 
                backgroundColor: isListening ? '#ef444422' : '#1e293b', 
                width: 28,
                height: 28,
                borderRadius: 14, 
                borderWidth: 1, 
                borderColor: isListening ? '#ef4444' : '#334155', 
                justifyContent: 'center', 
                alignItems: 'center'
              }}
            >
              <MaterialCommunityIcons 
                name={isListening ? "stop" : "microphone"} 
                size={14} 
                color={isListening ? '#ef4444' : '#94a3b8'} 
              />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ width: 62 }} />
        )}
      </View>

      <ScrollView 
        ref={mainScrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        stickyHeaderIndices={[1]}
      >
        <View style={styles.cabinetFilterContainer}>
          <Text style={styles.filterLabel}>ACTIVE SECTOR:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cabinetScroll}>
            <TouchableOpacity 
              style={[styles.cabinetChip, !selectedCabinetId && styles.cabinetChipActive]}
              onPress={() => setSelectedCabinetId(null)}
            >
              <Text style={[styles.cabinetChipText, !selectedCabinetId && styles.cabinetChipTextActive]}>ALL SECTORS</Text>
            </TouchableOpacity>
            {cabinets.map(cab => (
              <TouchableOpacity 
                key={cab.id} 
                style={[styles.cabinetChip, selectedCabinetId === cab.id && styles.cabinetChipActive]}
                onPress={() => setSelectedCabinetId(cab.id)}
              >
                <Text style={[styles.cabinetChipText, selectedCabinetId === cab.id && styles.cabinetChipTextActive]}>{cab.name.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>


            

        {(isListening || phase !== 'IDLE' || finalTranscript !== '' || partialText !== '') && (
          <View style={styles.monitor}>
          <View style={styles.monitorTop}>
            <View style={styles.statusRow}>
              <View style={[styles.statusIndicator, { backgroundColor: sessionActive ? '#10b981' : '#475569' }]} />
              <Text style={[styles.statusText, { color: sessionActive ? '#10b981' : '#475569' }]}>
                {sessionActive ? 'ACTIVE' : 'READY'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity onPress={handleRestartMission} style={styles.inlineRestartBtn}>
                <MaterialCommunityIcons name="refresh" size={12} color="#94a3b8" />
                <Text style={styles.inlineRestartText}>RESET DIALOG</Text>
              </TouchableOpacity>
              <Text style={styles.hint}>SAY "OVER" TO SEARCH</Text>
            </View>
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={styles.transcript} numberOfLines={2}>
              {isListening ? partialText : (finalTranscript || 'WAITING...')}
            </Text>
          </View>
          
          {normalizedTranscript !== '' && (
            <View style={styles.normalizedContainer}>
              <MaterialCommunityIcons name="check-all" size={12} color="#10b981" />
              <Text style={styles.normalizedText}>
                {normalizedTranscript.toUpperCase()}
              </Text>
            </View>
          )}

          {errorMessage && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* Contextual Callsign Selector inside Speech Box */}
          <View style={{ 
            flexDirection: 'row', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            borderTopWidth: 1, 
            borderTopColor: '#1e293b', 
            paddingTop: 12, 
            marginTop: 12 
          }}>
            <Text style={{ color: '#64748b', fontSize: 8, fontWeight: '900', letterSpacing: 0.5 }}>
              CALLSIGN PROTOCOL:
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {['SIR', 'MA\'AM', 'COMMANDER'].map(r => (
                <TouchableOpacity 
                  key={r} 
                  onPress={() => setCallsign(r as any)}
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 4,
                    backgroundColor: callsign === r ? '#3b82f6' : '#1e293b',
                    borderWidth: 1,
                    borderColor: callsign === r ? '#60a5fa' : '#334155'
                  }}
                >
                  <Text style={{ 
                    color: callsign === r ? '#ffffff' : '#94a3b8', 
                    fontSize: 8, 
                    fontWeight: '900' 
                  }}>
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {onDeviceAvailable === false && (
            <TouchableOpacity 
              onPress={triggerDownload} 
              style={{
                backgroundColor: 'rgba(251, 191, 36, 0.1)',
                paddingVertical: 8,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: '#fbbf24',
                marginTop: 10,
                alignItems: 'center'
              }}
            >
              <Text style={{ color: '#fbbf24', fontSize: 8, fontWeight: '900', letterSpacing: 0.5 }}>
                DOWNLOAD OFFLINE VOICE MODEL
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

        {renderPendingModal()}
        {renderBriefingModal()}
        {renderAdjustModal()}



        <View style={styles.resultsContainer}>
          {isProcessing ? (
            <>
              <Text style={styles.sectionTitle}>ANALYZING ACOUSTICS...</Text>
              <ActivityIndicator color="#fbbf24" style={{ margin: 20 }} />
            </>
          ) : results.length > 0 || (phase !== 'IDLE' && phase !== 'DONE') ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
                  {phase !== 'IDLE' && phase !== 'DONE' ? `REFINING INTELLIGENCE (${results.length} REMAINING)` : 'TACTICAL MATCHES'}
                </Text>
                <TouchableOpacity 
                  onPress={handleClearSearch}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1e293b', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#334155' }}
                >
                  <MaterialCommunityIcons name="close-circle" size={12} color="#fbbf24" />
                  <Text style={{ color: '#fbbf24', fontSize: 8, fontWeight: '900', letterSpacing: 0.5 }}>DISMISS</Text>
                </TouchableOpacity>
              </View>
              {results.map((item, idx) => (
                <TouchableOpacity key={idx} style={styles.resultCard} onPress={() => beginInterrogation([item])}>
                  <View style={styles.scoreBadge}>
                    <Text style={styles.scoreVal}>{item.score.toFixed(1)}</Text>
                    <Text style={styles.scoreLabel}>SCORE</Text>
                  </View>

                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <Text style={styles.cardSub}>
                      {item.brand || 'NO BRAND'} • {item.product_range || 'GENERAL RANGE'}
                    </Text>
                    <View style={styles.facetRow}>
                      <Text style={styles.cardQty}>{item.quantity} × {item.size || 'STD'}</Text>
                      <Text style={styles.dateLabel}>EXP: {item.expiry_month}/{item.expiry_year}</Text>
                    </View>

                    {item.last_audited_at && (Date.now() - item.last_audited_at < 24 * 60 * 60 * 1000) && (
                      <View style={styles.auditedBadge}>
                        <MaterialCommunityIcons name={item.last_audit_outcome === 'VERIFIED' ? "check-decagram" : "alert-rhombus"} size={12} color={item.last_audit_outcome === 'VERIFIED' ? "#22c55e" : "#fbbf24"} />
                        <Text style={[styles.auditedText, { color: item.last_audit_outcome === 'VERIFIED' ? "#22c55e" : "#fbbf24" }]}>
                          {item.last_audit_outcome === 'VERIFIED' ? 'SECURED' : 'PENDING REVIEW'}
                        </Text>
                      </View>
                    )}
                    
                    <View style={styles.evidenceContainer}>
                      <Text style={styles.evidenceHeader}>MATCH EVIDENCE:</Text>
                      <View style={styles.evidenceGrid}>
                        {item.evidence.map((ev, eIdx) => (
                          <View key={eIdx} style={styles.evidenceBadge}>
                            <Text style={styles.evidenceText}>{ev.field.toUpperCase()}: {ev.token}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>

                  <View style={styles.cardImageContainer}>
                    {item.batch_image || item.product_image ? (
                      <Image 
                        source={{ uri: item.batch_image || item.product_image || '' }} 
                        style={styles.cardImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.imageFallback}>
                        <MaterialCommunityIcons name="package-variant-closed" size={24} color="#1e293b" />
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </>
          ) : finalTranscript !== '' && results.length === 0 ? (
            <View style={styles.noMatch}>
              <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#475569" />
              <Text style={styles.noMatchText}>NO TACTICAL MATCHES FOUND</Text>
              
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                <TouchableOpacity 
                  style={[styles.discoveryBtn, { marginTop: 0, flex: 1 }]}
                  onPress={() => {
                    setIsDiscoveryMode(true);
                    setPhase('BRAND');
                    setSessionActive(true);
                    askQuestion('Initiating discovery. What brand is this batch?', 'BRAND');
                  }}
                >
                  <MaterialCommunityIcons name="plus-circle" size={16} color="#fbbf24" />
                  <Text style={[styles.discoveryBtnText, { fontSize: 10 }]}>RECRUIT NEW</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.discoveryBtn, { marginTop: 0, flex: 1, borderColor: '#475569' }]}
                  onPress={handleClearSearch}
                >
                  <MaterialCommunityIcons name="arrow-left" size={16} color="#94a3b8" />
                  <Text style={[styles.discoveryBtnText, { color: '#94a3b8', fontSize: 10 }]}>RETURN</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : selectedCabinetId ? (
            <>
              {bountyTargets.length > 0 && (
                <View style={{ marginBottom: 24 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <MaterialCommunityIcons name="target" size={20} color="#f59e0b" />
                    <Text style={[styles.sectionTitle, { color: '#f59e0b', marginBottom: 0 }]}>
                      BOUNTY HUNT: TOP {bountyTargets.length} STALEST TARGETS
                    </Text>
                  </View>
                  {bountyTargets.map((item, idx) => (
                    <AuditTargetCard
                      key={`bounty-${item.id || idx}`}
                      item={item}
                      onVerify={recordVerified}
                      onMIA={recordMIA}
                      onAdjustQty={() => {
                        setAdjustingItem(item);
                        setAdjustingQty(item.quantity || 1);
                      }}
                    />
                  ))}
                </View>
              )}

              <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>
                REMAINING TARGETS ({remainingTargets.length})
              </Text>

              <View style={{ 
                backgroundColor: '#0f172a',
                borderWidth: 1,
                borderColor: '#33415544',
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 8,
                marginBottom: 16,
                gap: 4
              }}>
                <Text style={{ color: '#94a3b8', fontSize: 10, fontWeight: '600', textAlign: 'center' }}>
                  <Text style={{ color: '#10b981', fontWeight: 'bold' }}>✓</Text> or swipe right to verify
                </Text>
                <Text style={{ color: '#94a3b8', fontSize: 10, fontWeight: '600', textAlign: 'center' }}>
                  <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>✗</Text> or swipe left to MIA
                </Text>
                <Text style={{ color: '#94a3b8', fontSize: 10, fontWeight: '600', textAlign: 'center' }}>
                  Tap the <Text style={{ color: '#3b82f6', fontWeight: 'bold' }}>blue count</Text> to adjust quantities
                </Text>
              </View>
              {remainingTargets.length === 0 ? (
                <View style={{ alignItems: 'center', padding: 40, gap: 12 }}>
                  <MaterialCommunityIcons name="shield-check" size={48} color="#10b981" />
                  <Text style={{ color: '#10b981', fontWeight: 'bold', fontSize: 14 }}>ALL TARGETS SECURED</Text>
                  <Text style={{ color: '#64748b', fontSize: 11, textAlign: 'center' }}>
                    Say "OVER AND OUT" to finalize your sector report.
                  </Text>
                </View>
              ) : (
                (() => {
                  const getBatchExpiryValue = (b: any) => {
                    if (!b.expiry_year || !b.expiry_month) return Infinity;
                    return b.expiry_year * 100 + b.expiry_month;
                  };

                  const getCategorySoonestExpiry = (categoryItems: any[]) => {
                    if (categoryItems.length === 0) return Infinity;
                    return Math.min(...categoryItems.map(getBatchExpiryValue));
                  };

                  // 1. Group the target batches by Category name
                  const groups: Record<string, any[]> = {};
                  for (const target of remainingTargets) {
                    const cat = target.category_name || 'GENERAL CATEGORY';
                    if (!groups[cat]) groups[cat] = [];
                    groups[cat].push(target);
                  }

                  // 2. Sort categories based on their soonest expiring product
                  const sortedCategories = Object.entries(groups).sort(([catA, itemsA], [catB, itemsB]) => {
                    const expA = getCategorySoonestExpiry(itemsA);
                    const expB = getCategorySoonestExpiry(itemsB);
                    if (expA !== expB) return expA - expB;
                    return catA.localeCompare(catB);
                  });

                  return sortedCategories.map(([cat, items]) => {
                    const isCollapsed = !!collapsedCategories[cat];
                    
                    // Dynamic Database-Backed Completion %
                    const progress = categoryProgress[cat];
                    const completionPercent = progress && progress.total > 0
                      ? Math.round((progress.audited / progress.total) * 100)
                      : 0;

                    // 3. Group and sort product batches inside this category
                    // Group items by product name
                    const productGroups: Record<string, any[]> = {};
                    for (const batch of items) {
                      const pName = batch.name;
                      if (!productGroups[pName]) productGroups[pName] = [];
                      productGroups[pName].push(batch);
                    }

                    // Sort individual batches within each product grouping by expiry soonest first
                    for (const pName in productGroups) {
                      productGroups[pName].sort((a, b) => getBatchExpiryValue(a) - getBatchExpiryValue(b));
                    }

                    // Find soonest expiry per product group to sort the product groupings themselves
                    const getProductSoonestExpiry = (pName: string) => {
                      const pBatches = productGroups[pName];
                      if (pBatches.length === 0) return Infinity;
                      return getBatchExpiryValue(pBatches[0]);
                    };

                    // Sort the product names by their soonest expiring batch
                    const sortedProductNames = Object.keys(productGroups).sort((pA, pB) => {
                      const expA = getProductSoonestExpiry(pA);
                      const expB = getProductSoonestExpiry(pB);
                      if (expA !== expB) return expA - expB;
                      return pA.localeCompare(pB);
                    });

                    // Flatten back into a single ordered list of batches
                    const sortedCategoryBatches: any[] = [];
                    for (const pName of sortedProductNames) {
                      sortedCategoryBatches.push(...productGroups[pName]);
                    }

                    return (
                      <View key={cat} style={{ marginBottom: 20 }}>
                        <TouchableOpacity 
                          onPress={() => {
                            setCollapsedCategories(prev => ({
                              ...prev,
                              [cat]: !prev[cat]
                            }));
                          }}
                          activeOpacity={0.7}
                          style={{ 
                            flexDirection: 'row', 
                            alignItems: 'center', 
                            justifyContent: 'space-between',
                            marginBottom: 10, 
                            borderBottomWidth: 1, 
                            borderBottomColor: '#1e293b', 
                            paddingBottom: 6 
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <MaterialCommunityIcons name="cube-outline" size={16} color="#fbbf24" />
                            <Text style={{ 
                              color: '#fbbf24', 
                              fontSize: 13, 
                              fontWeight: '900', 
                              letterSpacing: 1.5, 
                              textTransform: 'uppercase' 
                            }}>
                              {cat}
                            </Text>
                            <View style={{ 
                              backgroundColor: '#1e293b', 
                              paddingHorizontal: 8, 
                              paddingVertical: 2, 
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: '#334155'
                            }}>
                              <Text style={{ color: '#94a3b8', fontSize: 9, fontWeight: 'bold' }}>
                                {items.length} {items.length === 1 ? 'TARGET' : 'TARGETS'}
                              </Text>
                            </View>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ 
                              color: completionPercent >= 100 ? '#22c55e' : '#64748b', 
                              fontSize: 12, 
                              fontWeight: '900',
                            }}>
                              {completionPercent}%
                            </Text>
                            
                            <MaterialCommunityIcons 
                              name={isCollapsed ? "chevron-right" : "chevron-down"} 
                              size={18} 
                              color="#64748b" 
                            />
                          </View>
                        </TouchableOpacity>

                        {!isCollapsed && sortedCategoryBatches.map((item, idx) => (
                          <AuditTargetCard
                            key={item.id || idx}
                            item={item}
                            onVerify={recordVerified}
                            onMIA={recordMIA}
                            onAdjustQty={handleOpenAdjustQty}
                          />
                        ))}
                      </View>
                    );
                  });
                })()
              )}
            </>
          ) : (
            <View style={{ paddingBottom: 40 }}>
              {bountyTargets.length > 0 ? (
                <View style={{ marginBottom: 24, paddingHorizontal: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <MaterialCommunityIcons name="target" size={20} color="#f59e0b" />
                    <Text style={[styles.sectionTitle, { color: '#f59e0b', marginBottom: 0 }]}>
                      ALL-ESTATE BOUNTY HUNT: TOP {bountyTargets.length} TARGETS
                    </Text>
                  </View>
                  {bountyTargets.map((item, idx) => (
                    <AuditTargetCard
                      key={`global-bounty-${item.id || idx}`}
                      item={item}
                      onVerify={recordVerified}
                      onMIA={recordMIA}
                      showCabinet={true}
                      onAdjustQty={() => {
                        setAdjustingItem(item);
                        setAdjustingQty(item.quantity || 1);
                      }}
                    />
                  ))}
                </View>
              ) : (
                <View style={{ alignItems: 'center', padding: 40 }}>
                  <MaterialCommunityIcons name="office-building" size={48} color="#475569" />
                  <Text style={{ color: '#475569', fontSize: 12, fontWeight: 'bold', marginTop: 12, textAlign: 'center' }}>
                    SELECT CABINET TO BEGIN AUDIT RECON
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>


      </ScrollView>

      {pendingChanges.length > 0 && (
        <View style={{ position: 'absolute', bottom: 30, left: 20, right: 20, alignItems: 'center' }}>
          <TouchableOpacity 
            onPress={() => setIsReviewVisible(true)}
            style={{ 
              backgroundColor: '#c084fc', 
              paddingHorizontal: 24, 
              paddingVertical: 14, 
              borderRadius: 28, 
              flexDirection: 'row', 
              alignItems: 'center', 
              gap: 8,
              elevation: 8,
              shadowColor: '#c084fc',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 6,
              borderWidth: 1,
              borderColor: '#d8b4fe'
            }}
          >
            <MaterialCommunityIcons name="clipboard-check" size={20} color="#000000" />
            <Text style={{ color: '#000000', fontSize: 13, fontWeight: '900', letterSpacing: 1 }}>
              AUTHORIZE AUDIT ({pendingChanges.length} CHANGES)
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

function AuditTargetCard({ 
  item, 
  onVerify, 
  onMIA, 
  onAdjustQty,
  showCabinet 
}: { 
  item: any, 
  onVerify: (item: any) => Promise<void>, 
  onMIA: (item: any) => Promise<void>, 
  onAdjustQty: (item: any) => void,
  showCabinet?: boolean
}) {
  // Helper to format last audited age and calculate visual color impact
  const getAuditAgeDetails = () => {
    const auditTime = item.last_audited_at 
      ? item.last_audited_at 
      : new Date(item.entry_year, item.entry_month - 1, item.entry_day || 1).getTime();
      
    const diffMs = Date.now() - auditTime;
    const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    
    let ageText = '';
    let statusColor = '#94a3b8'; // Default grey
    
    if (diffDays === 0) {
      ageText = 'Today';
      statusColor = '#059669'; // Deep Green (Emerald 600)
    } else if (diffDays === 1) {
      ageText = 'Yesterday';
      statusColor = '#059669'; // Deep Green
    } else if (diffDays <= 7) {
      ageText = `${diffDays}d ago`;
      statusColor = '#059669'; // Deep Green
    } else if (diffDays <= 30) {
      ageText = `${diffDays}d ago`;
      statusColor = '#22c55e'; // Standard Green (0-1 month) — matches app-wide expiry/readiness green
    } else if (diffDays <= 60) {
      ageText = `${diffDays}d ago`;
      statusColor = '#fde047'; // Yellow (1-2 months) — matches expiry system's 4-7 month yellow
    } else if (diffDays <= 90) {
      ageText = `${diffDays}d ago`;
      statusColor = '#fbbf24'; // Amber (2-3 months) — matches readiness system's near-miss amber
    } else if (diffDays <= 180) {
      ageText = `${diffDays}d ago`;
      statusColor = '#ef4444'; // Stale Red (3-6 months)
    } else {
      ageText = `${diffDays}d ago`;
      statusColor = '#991b1b'; // Deep Crimson Red (6+ months)
    }
    
    return { ageText, statusColor };
  };

  const { ageText, statusColor } = getAuditAgeDetails();

  const [action, setAction] = useState<'IDLE' | 'VERIFIED' | 'MIA'>('IDLE');
  
  // ValueXY for tracking swipe position
  const position = React.useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  useEffect(() => {
    setAction('IDLE');
    position.setValue({ x: 0, y: 0 });
  }, [item.id]);

  const forceSwipe = (direction: 'right' | 'left') => {
    const x = direction === 'right' ? 500 : -500;
    setAction(direction === 'right' ? 'VERIFIED' : 'MIA');
    Animated.timing(position, {
      toValue: { x, y: 0 },
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      if (direction === 'right') {
        onVerify(item);
      } else {
        onMIA(item);
      }
    });
  };

  const resetPosition = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
    }).start();
  };

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Intercept only when horizontal swipe gesture is dominant and has minimum movement
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderMove: (evt, gestureState) => {
        position.setValue({ x: gestureState.dx, y: 0 });
      },
      onPanResponderRelease: (evt, gestureState) => {
        const SWIPE_THRESHOLD = 120;
        if (gestureState.dx > SWIPE_THRESHOLD) {
          forceSwipe('right');
        } else if (gestureState.dx < -SWIPE_THRESHOLD) {
          forceSwipe('left');
        } else {
          resetPosition();
        }
      }
    })
  ).current;

  const handleVerify = () => {
    forceSwipe('right');
  };

  const handleMIA = () => {
    forceSwipe('left');
  };

  const getCardStyle = () => {
    if (action === 'VERIFIED') {
      return {
        backgroundColor: 'rgba(6, 78, 59, 0.55)',
        borderColor: '#10b981',
      };
    }
    if (action === 'MIA') {
      return {
        backgroundColor: 'rgba(69, 10, 10, 0.55)',
        borderColor: '#ef4444',
      };
    }
    return {};
  };

  // Interpolate opacity based on drag displacement
  const opacityAnim = position.x.interpolate({
    inputRange: [-300, 0, 300],
    outputRange: [0.2, 1, 0.2],
    extrapolate: 'clamp'
  });

  return (
    <Animated.View 
      {...panResponder.panHandlers}
      style={[
        styles.resultCard, 
        { 
          flexDirection: 'column',
          marginBottom: 8, 
          paddingRight: 6,
          transform: [{ translateX: position.x }],
          opacity: opacityAnim
        },
        getCardStyle()
      ]}
    >
      {showCabinet && item.cabinet_name && (
        <View style={{ backgroundColor: '#1e293b', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, alignSelf: 'stretch', marginBottom: 4 }}>
          <Text style={{ color: '#94a3b8', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', textAlign: 'center', letterSpacing: 1 }}>
            CABINET: {item.cabinet_name}
          </Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', width: '100%', alignItems: 'stretch' }}>
        <View style={{ flex: 1, flexDirection: 'row', gap: 12, alignItems: 'stretch' }}>
          {/* Left Badge, Size, & Expiry Stack (Narrower & Pure Metric View) */}
        <View style={{ flexDirection: 'column', alignItems: 'center', width: 48, justifyContent: 'space-between' }}>
          {/* Expected Count (Adjustable Numeral) */}
          <TouchableOpacity 
            onPress={(e) => {
              e.stopPropagation(); // Prevents triggering any gesture handles
              onAdjustQty(item);
            }}
            activeOpacity={0.7}
            style={{ 
              backgroundColor: '#3b82f6', 
              width: '100%', 
              paddingVertical: 6, 
              borderRadius: 6,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '900' }}>
              {item.quantity}
            </Text>
          </TouchableOpacity>

          <View style={{ gap: 4, width: '100%' }}>
            {/* Size Badge */}
            <View style={{ 
              backgroundColor: '#0f172a', 
              borderWidth: 1, 
              borderColor: '#3b82f644', 
              borderRadius: 6, 
              paddingHorizontal: 2, 
              paddingVertical: 4,
              width: '100%',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Text style={{ 
                color: '#3b82f6', 
                fontSize: 11, 
                fontWeight: '900', 
                textAlign: 'center'
              }}>
                {item.size || 'STD'}{item.unit_type === 'weight' ? 'g' : (item.unit_type === 'volume' ? 'ml' : '')}
              </Text>
            </View>

            {/* Expiry Badge */}
            {item.expiry_month && item.expiry_year && (
              <View style={{ 
                backgroundColor: '#1e293b', 
                borderWidth: 1, 
                borderColor: '#fbbf2444', 
                borderRadius: 6, 
                paddingHorizontal: 2, 
                paddingVertical: 4,
                width: '100%',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Text style={{ 
                  color: '#fbbf24', 
                  fontSize: 11, 
                  fontWeight: '900', 
                  textAlign: 'center'
                }}>
                  {String(item.expiry_month).padStart(2, '0')}/{String(item.expiry_year).slice(-2)}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={[styles.cardInfo, { justifyContent: 'space-between' }]}>
          {/* Top block: identity — flex:1 pushes audit row to bottom */}
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
            
            <Text style={{ color: '#fde047', fontSize: 10, fontWeight: '700', marginTop: 2 }}>
              {item.brand ? item.brand.toUpperCase() : 'NO BRAND'}
            </Text>
            
            {item.product_range ? (
              <Text style={{ color: '#fbbf24', fontSize: 10, fontWeight: '500', marginTop: 2 }}>
                {item.product_range}
              </Text>
            ) : null}
            
            {item.batch_intel ? (
              <Text style={{ color: '#94a3b8', fontSize: 9, fontStyle: 'italic', marginTop: 3 }} numberOfLines={1}>
                {item.batch_intel}
              </Text>
            ) : null}
          </View>

          {/* Bottom badge: audit age — aligns with expiry badge in left column */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            marginBottom: 2,
            backgroundColor: '#0f172a',
            borderWidth: 1,
            borderColor: `${statusColor}44`,
            borderRadius: 6,
            paddingHorizontal: 6,
            paddingVertical: 3,
            alignSelf: 'flex-start',
          }}>
            <MaterialCommunityIcons name="clock-outline" size={14} color={statusColor} />
            <Text style={{ color: statusColor, fontSize: 11, fontWeight: '900' }}>
              {ageText}
            </Text>
          </View>
        </View>

        <View style={{ justifyContent: 'center' }}>
          <View style={styles.cardImageContainer}>
            {item.batch_image || item.product_image ? (
              <Image 
                source={{ uri: item.batch_image || item.product_image || '' }} 
                style={styles.cardImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.imageFallback}>
                <MaterialCommunityIcons name="package-variant-closed" size={24} color="#1e293b" />
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Tactile Manual Quick Actions */}
      <View style={{ flexDirection: 'column', gap: 6, justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: '#1e293b', paddingLeft: 10, marginLeft: 4 }}>
        <TouchableOpacity 
          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#064e3b', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#10b98144' }}
          onPress={handleVerify}
        >
          <MaterialCommunityIcons name="check" size={18} color="#10b981" />
        </TouchableOpacity>
        <TouchableOpacity 
          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#450a0a', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#ef444444' }}
          onPress={handleMIA}
        >
          <MaterialCommunityIcons name="close" size={18} color="#ef4444" />
        </TouchableOpacity>
      </View>
      </View>
    </Animated.View>
  );
}


