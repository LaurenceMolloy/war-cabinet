import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform, Linking, Vibration, Image, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { useSpeechRecognitionEvent, ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import * as Speech from 'expo-speech';
import { Database } from '../database';
import { VoiceDAL } from '../database/Voice';
import { normalizePhrase } from '../services/VoiceSearchEngine';
import { styles } from '../styles/voice_intel.styles';
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
  const [isTargetsVisible, setIsTargetsVisible] = useState(false);
  const [remainingTargets, setRemainingTargets] = useState<any[]>([]);
  
  const {
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
      }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);

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



  const handleShowTargets = async () => {
    if (!selectedCabinetId) return;
    const sessionWindow = Date.now() - AUDIT_SESSION_WINDOW;
    const targets = await VoiceDAL.getUnauditedBatches(db, selectedCabinetId, sessionWindow);
    setRemainingTargets(targets);
    setIsTargetsVisible(true);
  };

  const renderTargetsModal = () => (
    <Modal
      visible={isTargetsVisible}
      animationType="slide"
      transparent={true}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.reviewModalContainer}>
          <View style={styles.reviewHeader}>
            <Text style={styles.reviewTitle}>REMAINING TARGETS</Text>
            <TouchableOpacity onPress={() => setIsTargetsVisible(false)}>
              <MaterialCommunityIcons name="close" size={24} color="#94a3b8" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.reviewScroll}>
            {remainingTargets.length === 0 ? (
              <Text style={{color: '#94a3b8', textAlign: 'center', marginTop: 20}}>All targets secured.</Text>
            ) : (
              remainingTargets.map((item, idx) => (
                <View key={idx} style={styles.reviewItem}>
                  <View style={{flex: 1}}>
                    <Text style={styles.reviewItemTitle}>{item.name.toUpperCase()}</Text>
                    <Text style={styles.reviewItemSubtitle}>EXPECTED QUANTITY: {item.quantity}</Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={28} color="#3b82f6" />
        </TouchableOpacity>
        <Text style={styles.title}>VOICE INTEL LAB</Text>
        <View style={{ width: 28 }} />
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

        {briefing && (
          <View style={styles.briefingCard}>
            <TouchableOpacity 
              style={styles.briefingHeader} 
              onPress={() => setIsBriefingExpanded(!isBriefingExpanded)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons name="shield-check" size={16} color={briefing.percents.complete >= 100 ? '#10b981' : '#fbbf24'} />
                <Text style={styles.briefingTitle}>MISSION BRIEFING</Text>
                {!isBriefingExpanded && (
                  <View style={{ backgroundColor: '#fbbf2433', paddingHorizontal: 6, borderRadius: 4, marginLeft: 8 }}>
                    <Text style={{ color: '#fbbf24', fontSize: 10, fontWeight: '900' }}>{Math.round(briefing.percents.complete)}% READY</Text>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {isBriefingExpanded && <Text style={styles.windowLabel}>WINDOW: {briefing.windowStart}</Text>}
                <MaterialCommunityIcons name={isBriefingExpanded ? "chevron-up" : "chevron-down"} size={20} color="#475569" />
              </View>
            </TouchableOpacity>
            
            {isBriefingExpanded && (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: -8 }}>
                   <View style={{ flexDirection: 'row', gap: 8 }}>
                     <TouchableOpacity onPress={handleShowTargets} style={styles.resetBtn}>
                       <MaterialCommunityIcons name="target" size={14} color="#3b82f6" />
                       <Text style={[styles.resetBtnText, { color: '#3b82f6' }]}>TARGETS</Text>
                     </TouchableOpacity>

                     {pendingChanges.length > 0 && (
                       <TouchableOpacity onPress={() => setIsReviewVisible(true)} style={[styles.resetBtn, { borderColor: '#c084fc' }]}>
                         <MaterialCommunityIcons name="clipboard-check" size={14} color="#c084fc" />
                         <Text style={[styles.resetBtnText, { color: '#c084fc' }]}>REVIEW ({pendingChanges.length})</Text>
                       </TouchableOpacity>
                     )}
                   </View>

                   {!briefing.isExempt && (
                      <TouchableOpacity onPress={handleResetAudit} style={styles.resetBtn}>
                        <MaterialCommunityIcons name="refresh" size={14} color="#ef4444" />
                        <Text style={styles.resetBtnText}>RESTART</Text>
                      </TouchableOpacity>
                    )}
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
                    <Text style={{ color: '#64748b', fontSize: 14, fontWeight: '900', letterSpacing: 1 }}>NO ACTIVE MANEUVER SCHEDULE</Text>
                  </View>
                ) : (
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${briefing.percents.complete}%` }]} />
                  </View>
                )}
                
                <View style={styles.integrityRow}>
                  <Text style={styles.integrityLabel}>INTEL BREAKDOWN</Text>
                  <Text style={[styles.integrityStat, { color: '#fbbf24' }]}>VER: {Math.round(briefing.percents.verified)}%</Text>
                  <Text style={[styles.integrityStat, { color: '#f97316' }]}>ADJ: {Math.round(briefing.percents.adjusted)}%</Text>
                  <Text style={[styles.integrityStat, { color: '#c084fc' }]}>PND: {Math.round(briefing.percents.pending)}%</Text>
                  <Text style={[styles.integrityStat, { color: '#3b82f6' }]}>NEW: {Math.round(briefing.percents.new)}%</Text>
                  <Text style={[styles.integrityStat, { color: '#ef4444' }]}>MIA: {Math.round(briefing.percents.mia)}%</Text>
                </View>
              </>
            )}
          </View>
        )}

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
                <Text style={styles.inlineRestartText}>RESTART</Text>
              </TouchableOpacity>
              <Text style={styles.hint}>SAY "OVER" TO SEARCH</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={styles.transcript} numberOfLines={2}>
              {isListening ? partialText : (finalTranscript || 'WAITING...')}
            </Text>
            
            <TouchableOpacity 
              style={[styles.statusButton, { backgroundColor: '#1e293b', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }]} 
              onPress={() => setIsReviewVisible(true)}
            >
              <MaterialCommunityIcons name="clipboard-check-outline" size={16} color="#fbbf24" />
              <Text style={{ color: '#fbbf24', fontSize: 9, fontWeight: '900' }}>
                REVIEW ({pendingChanges.length})
              </Text>
            </TouchableOpacity>
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
        </View>

        {renderPendingModal()}
        {renderTargetsModal()}

        {interrogationHistory.length > 0 && (
          <View style={styles.historyContainer}>
            {interrogationHistory.map((h, i) => (
              <Text key={i} style={[styles.historyText, h.startsWith('Buddy') ? styles.buddyText : styles.userText]}>
                {h.toUpperCase()}
              </Text>
            ))}
          </View>
        )}

        <View style={styles.resultsContainer}>
          <Text style={styles.sectionTitle}>
            {phase !== 'IDLE' && phase !== 'DONE' ? `REFINING INTELLIGENCE (${results.length} REMAINING)` : 
             isProcessing ? 'ANALYZING ACOUSTICS...' : 'TACTICAL MATCHES'}
          </Text>
          
          {isProcessing && <ActivityIndicator color="#fbbf24" style={{ margin: 20 }} />}

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
                    <MaterialCommunityIcons name={item.last_audit_outcome === 'VERIFIED' ? "check-decagram" : "alert-rhombus"} size={12} color={item.last_audit_outcome === 'VERIFIED' ? "#10b981" : "#fbbf24"} />
                    <Text style={[styles.auditedText, { color: item.last_audit_outcome === 'VERIFIED' ? "#10b981" : "#fbbf24" }]}>
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

          {results.length === 0 && !isProcessing && finalTranscript !== '' && (
            <View style={styles.noMatch}>
              <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#475569" />
              <Text style={styles.noMatchText}>NO TACTICAL MATCHES FOUND</Text>
              
              <TouchableOpacity 
                style={styles.discoveryBtn}
                onPress={() => {
                  setIsDiscoveryMode(true);
                  setPhase('BRAND');
                  setSessionActive(true);
                  askQuestion('Initiating discovery. What brand is this batch?', 'BRAND');
                }}
              >
                <MaterialCommunityIcons name="plus-circle" size={20} color="#fbbf24" />
                <Text style={styles.discoveryBtnText}>RECRUIT NEW BATCH</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.rankContainer}>
          <Text style={styles.filterLabel}>CALLSIGN PROTOCOL:</Text>
          <View style={styles.rankRow}>
            {['SIR', 'MA\'AM', 'COMMANDER'].map(r => (
              <TouchableOpacity 
                key={r} 
                onPress={() => setCallsign(r as any)}
                style={[styles.rankBtn, callsign === r && styles.rankBtnActive]}
              >
                <Text style={[styles.rankText, callsign === r && styles.rankTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {onDeviceAvailable === false && (
          <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
            <TouchableOpacity onPress={triggerDownload} style={styles.downloadBtn}>
              <Text style={styles.downloadText}>DOWNLOAD OFFLINE MODEL</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <View style={styles.fabContainer}>
        <TouchableOpacity 
          onPress={isListening ? stopListening : startListening} 
          style={[styles.micBtn, isListening && styles.micBtnActive]}
        >
          <MaterialCommunityIcons name={isListening ? "stop" : "microphone"} size={32} color="white" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}


