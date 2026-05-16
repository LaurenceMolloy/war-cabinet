import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform, Linking, Vibration, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { useSpeechRecognitionEvent, ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import * as Speech from 'expo-speech';
import { Database } from '../database';

const VOICE_TRIGGERS = {
  WAKE: 'CHECK',
  TERMINATE: 'OVER',
  SKIP: 'PASS',
  ABANDON: 'QUIT',
  OPTIONS: 'OPTIONS',
  MIA: 'MISSING',
  RESTART: 'START OVER',
  COMPLETE: 'MISSION COMPLETE'
};

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

interface MatchEvidence {
  field: 'name' | 'brand' | 'range' | 'size';
  token: string;
  confidence: number;
}

interface VoiceSearchResult {
  id: number;
  item_type_id: number;
  name: string;
  brand: string | null;
  product_range: string | null;
  size: string | null;
  quantity: number;
  score: number;
  evidence: MatchEvidence[];
  expiry_month: number | null;
  expiry_year: number | null;
  unit_type: string | null;
  batch_image: string | null;
  product_image: string | null;
  last_audited_at: number | null;
  last_audit_outcome: string | null;
}

export default function VoiceIntelPoCScreen() {
  const db = useSQLiteContext();
  const router = useRouter();

  const [isListening, setIsListening] = useState(false);
  const [partialText, setPartialText] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [results, setResults] = useState<VoiceSearchResult[]>([]);
  const isManualStop = React.useRef(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [normalizedTranscript, setNormalizedTranscript] = useState('');
  const [cabinets, setCabinets] = useState<{id: string, name: string}[]>([]);
  const [selectedCabinetId, setSelectedCabinetId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [callsign, setCallsign] = useState<'SIR' | "MA'AM" | 'COMMANDER'>('COMMANDER');
  const [briefing, setBriefing] = useState<any>(null);

  // --- INTERROGATION STATE ---
  type InterrogationPhase = 'IDLE' | 'PRODUCT' | 'SIZE' | 'BRAND' | 'RANGE' | 'MONTH' | 'YEAR' | 'QUANTITY_CHECK' | 'DISCOVERY_START' | 'DONE';
  const [phase, setPhase] = useState<InterrogationPhase>('IDLE');
  const [candidates, setCandidates] = useState<VoiceSearchResult[]>([]);
  const [interrogationHistory, setInterrogationHistory] = useState<string[]>([]);
  const interrogationBuffer = React.useRef<string>('');
  const confirmedItem = React.useRef<VoiceSearchResult | null>(null);
  const isSpeaking = React.useRef(false);
  
  // NEW: Discovery Mode State
  const [isDiscoveryMode, setIsDiscoveryMode] = useState(false);
  const discoveryIntel = React.useRef<{ brand?: string, range?: string, size?: string, month?: number, year?: number }>({});
  const [pendingChanges, setPendingChanges] = useState<any[]>([]);
  const [isReviewVisible, setIsReviewVisible] = useState(false);
  const retryCount = React.useRef(0); // Tracks failed attempts per question (max 3)
  const [recognitionService, setRecognitionService] = useState<string>('Detecting...');
  const [onDeviceAvailable, setOnDeviceAvailable] = useState<boolean | null>(null);
  const [knownVocab, setKnownVocab] = useState<string[]>([]);
  const handleRestartMission = () => {
    setPhase('IDLE');
    setSessionActive(false);
    setResults([]);
    setCandidates([]);
    setInterrogationHistory(prev => [...prev, `MISSION RESTART: STANDING BY...`]);
    interrogationBuffer.current = '';
    confirmedItem.current = null;
    setIsDiscoveryMode(false);
    discoveryIntel.current = {};
    Vibration.vibrate([0, 50, 50, 50]);
    
    // Auto-trigger "What product?" if we want it to act like a mid-process CHECK
    setSessionActive(true);
    isSpeaking.current = true;
    ExpoSpeechRecognitionModule.stop();
    Speech.speak('Restarting. What product?', { 
      rate: 1.0,
      onDone: () => {
        isSpeaking.current = false;
        Vibration.vibrate(50); startListening();
      }
    });
  };

  const [isBriefingExpanded, setIsBriefingExpanded] = useState(false);
  const mainScrollRef = React.useRef<ScrollView>(null);

  useEffect(() => {
    if (results.length > 0 && isBriefingExpanded) {
      setIsBriefingExpanded(false);
    }
  }, [results.length]);

  useEffect(() => {
    const checkServices = async () => {
      if (Platform.OS === 'android') {
        try {
          const defaultService = await ExpoSpeechRecognitionModule.getDefaultRecognitionService();
          setRecognitionService(defaultService.packageName);
          
          const locales = await ExpoSpeechRecognitionModule.getSupportedLocales({
            allowNetwork: true,
          });
          const enGB = locales.locales.find(l => l.identifier === 'en-GB');
          setOnDeviceAvailable(enGB?.onDeviceRecognitionAvailable || false);
        } catch (e) {
          console.error("Failed to query speech services", e);
        }
      } else {
        setRecognitionService('Apple Speech');
        setOnDeviceAvailable(true);
      }
    };

    const fetchVocab = async () => {
      try {
        const rows = await db.getAllAsync<{val: string}>(`
          SELECT DISTINCT name as val FROM ItemTypes
          UNION
          SELECT DISTINCT default_supplier as val FROM ItemTypes WHERE default_supplier IS NOT NULL
        `);
        const rawVocab = rows.map(r => r.val.toLowerCase().replace(/['’]/g, ""));
        // Tokenize the vocabulary: we want to know every individual word that is "valid"
        const tokenizedVocab = rawVocab.flatMap(v => v.split(/\s+/).filter(t => t.length > 2));
        setKnownVocab(Array.from(new Set([...rawVocab, ...tokenizedVocab])));
        console.log("Lexical Snapper: Vocabulary loaded (" + tokenizedVocab.length + " individual terms)");
      } catch (e) {
        console.error("Vocab fetch failed", e);
      }
    };

    const fetchCabinets = async () => {
      try {
        const rows = await db.getAllAsync<any>(`
          SELECT id, name, audit_interval_months, audit_day_of_month 
          FROM Cabinets 
          ORDER BY name ASC
        `);
        
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentDay = now.getDate();

        const sorted = rows.map(cab => {
          const interval = cab.audit_interval_months || 3;
          const day = cab.audit_day_of_month || 1;

          let targetMonth = currentMonth;
          while ((targetMonth - 1) % interval !== 0 || (targetMonth === currentMonth && day < currentDay)) {
              targetMonth++;
          }
          
          let targetYear = currentYear;
          while (targetMonth > 12) { targetMonth -= 12; targetYear += 1; }

          const nextAudit = new Date(targetYear, targetMonth - 1, day);
          const daysToAudit = Math.ceil((nextAudit.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          return { ...cab, daysToAudit };
        }).sort((a, b) => {
          if (a.daysToAudit !== b.daysToAudit) return a.daysToAudit - b.daysToAudit;
          return a.name.localeCompare(b.name);
        });

        setCabinets(sorted);
      } catch (e) {
        console.error("Cabinet fetch failed", e);
      }
    };

    checkServices();
    fetchVocab();
    fetchCabinets();
  }, [db]);

  useEffect(() => {
    const loadData = async () => {
      const [briefingData, pendingData] = await Promise.all([
        Database.Inventory.getAuditBriefing(db, selectedCabinetId),
        Database.Inventory.getPendingChanges(db)
      ]);
      setBriefing(briefingData);
      setPendingChanges(pendingData);
    };
    loadData();
  }, [db, selectedCabinetId, results]);

  const triggerDownload = async () => {
    if (Platform.OS === 'android') {
      try {
        await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({
          lang: 'en-GB',
        });
        Alert.alert('DOWNLOAD TRIGGERED', 'The system is downloading the en-GB offline model. Please check your notification bar.');
      } catch (e) {
        console.error("Download trigger failed", e);
        Alert.alert(
          'OFFLINE SETUP REQUIRED', 
          'The automated trigger failed. Please install manually:\n\n' +
          'OPTION 1 (Recommended):\n' +
          'Settings > General management > Keyboard list and default > Google voice typing > Offline speech recognition\n\n' +
          'OPTION 2:\n' +
          'Settings > Security and privacy > More privacy settings > Android System Intelligence > On-device recognition'
        );
      }
    }
  };

  // MODERN EVENT HANDLING
  useSpeechRecognitionEvent("start", () => {
    setIsListening(true);
    setErrorMessage(null);
  });
  useSpeechRecognitionEvent("end", () => setIsListening(false));
  useSpeechRecognitionEvent("error", (event) => {
    // Only auto-restart if we haven't manually stopped or processed a match
    if (event.error === 'no-speech' || event.error === 'client') {
      if (isProcessing || isManualStop.current || isSpeaking.current) return; 
      
      // During active interrogation, use a longer resurrection gap to avoid strobe
      const delay = (phase !== 'IDLE' && phase !== 'DONE') ? 1500 : 500;
      console.log(`VOICE: ${event.error} error detected, cycling listener in ${delay}ms...`);
      setTimeout(() => {
        startListening();
      }, delay);
      return;
    }
    console.error(event.error, event.message);
    setErrorMessage(`${event.error.toUpperCase()}: ${event.message}`);
    setIsListening(false);
  });
  
  useSpeechRecognitionEvent("result", async (event) => {
    // Scan all results for the wake word to ensure we catch it immediately in continuous mode
    const fullTranscript = event.results.map(r => r.transcript).join(' ').toUpperCase();
    const latestResult = event.results[event.results.length - 1];
    const text = latestResult?.transcript || '';
    setPartialText(text);
    
    const currentText = text.toUpperCase().replace(/[.,!]/g, '').trim();
    console.log(`VOICE [Stream]: "${currentText}" (Full: ${fullTranscript.length} chars)`);
    
    if (fullTranscript) {
      // STAGE 1: WAITING FOR WAKE WORD
      if (!sessionActive && phase === 'IDLE') {
        if (fullTranscript.includes(VOICE_TRIGGERS.WAKE)) {
          console.log(`WAKE WORD DETECTED: ${VOICE_TRIGGERS.WAKE}`);
          setSessionActive(true);
          setFinalTranscript('');
          setPartialText('');
          Vibration.vibrate(100);
          
          isSpeaking.current = true;
          // Simultaneous stop/speak for faster response
          ExpoSpeechRecognitionModule.stop();
          Speech.speak('What product?', { 
            rate: 1.0,
            onDone: () => {
              isSpeaking.current = false;
              Vibration.vibrate(50); startListening();
            }
          });
          return;
        }
      }

      if (currentText) {
        // INTERROGATION PHASE: Bypass sessionActive — Buddy is actively questioning
        if (phase !== 'IDLE' && phase !== 'DONE') {

          // ABANDON AUDIT: Immediately kill the process
          if (currentText.includes(VOICE_TRIGGERS.ABANDON) && event.isFinal) {
            console.log(`ABANDONING AUDIT`);
            setPhase('IDLE');
            setSessionActive(false);
            interrogationBuffer.current = '';
            Speech.speak('Audit abandoned.', { rate: 1.0 });
            return;
          }

          // OPTIONS PLEASE: Read back available choices for the current question
          if (currentText.includes(VOICE_TRIGGERS.OPTIONS) && event.isFinal) {
            console.log(`OPTIONS: phase="${phase}" candidates=${candidates.length} isSpeaking=${isSpeaking.current}`);
            interrogationBuffer.current = '';
            if (!isSpeaking.current) speakOptions(phase, candidates);
            return;
          }

          // START OVER: Mid-process mission reset
          if (currentText.includes(VOICE_TRIGGERS.RESTART) && event.isFinal) {
            console.log(`RESTARTING MISSION VIA VOICE`);
            handleRestartMission();
            return;
          }

          // MISSION COMPLETE: End sector sweep and flag untouched items as MIA
          if (currentText.includes(VOICE_TRIGGERS.COMPLETE) && event.isFinal) {
            console.log(`FINISHING MISSION`);
            handleEndMission();
            return;
          }

          if ((currentText.endsWith(VOICE_TRIGGERS.TERMINATE) || currentText.includes(` ${VOICE_TRIGGERS.TERMINATE}`)) && event.isFinal) {
            const regex = new RegExp(`\\s?${VOICE_TRIGGERS.TERMINATE}\\s?`, 'gi');
            const currentAnswer = currentText.replace(regex, '').trim();
            // OR logic: use currentAnswer if non-empty, else fall back to buffer — prevents "TWO TWO" duplication
            const fullAnswer = (currentAnswer || interrogationBuffer.current).trim();
            interrogationBuffer.current = '';
            console.log(`QUANTITY ANSWER: "${fullAnswer}"`);
            Vibration.vibrate([0, 70, 50, 70]);
            ExpoSpeechRecognitionModule.stop();
            if (phase === 'QUANTITY_CHECK') {
              await handleQuantityCheck(fullAnswer);
            } else {
              await handleInterrogationResponse(fullAnswer);
            }
            return;
          }
          // Accumulate ALL results (interim + final) into buffer to catch short words like "two"
          if (currentText) {
            interrogationBuffer.current = currentText; // Use latest full transcript, not append
            console.log(`INTERROGATION BUFFER: "${interrogationBuffer.current}"`);
          }
          return;
        }

        // STAGE 2: MISSION RECORDING (WAITING FOR TERMINATE)
        else {
          if (currentText.toUpperCase().includes(VOICE_TRIGGERS.TERMINATE) && event.isFinal) {
            // Initial payload sign-off
            setSessionActive(false);
            setFinalTranscript(currentText);
            Vibration.vibrate([0, 70, 50, 70]);
            ExpoSpeechRecognitionModule.stop();
            processInitialPayload(currentText);
            return;
          }

          if (currentText.toUpperCase().includes(VOICE_TRIGGERS.MIA) && confirmedItem.current) {
            console.log("VOICE: MIA command detected.");
            handleMIA();
            return;
          }
        }
      }
    }

    // INTERROGATION INTERCEPTION — now handled via OVER above, not on isFinal

    if (event.isFinal) {
      console.log(`VOICE [Final]: "${currentText}" (Session Active: ${sessionActive})`);
    }
  });

  const startListening = useCallback(async () => {
    try {
      isManualStop.current = false;
      // Reset interrogation buffer at mic start to purge any TTS audio contamination
      if (phase !== 'IDLE' && phase !== 'DONE') {
        interrogationBuffer.current = '';
      }
      if (!sessionActive) {
        setResults([]);
        setFinalTranscript('');
        setNormalizedTranscript('');
        setPartialText('');
      }
      
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!result.granted) {
        Alert.alert('PERMISSION DENIED', 'Microphone access is required.');
        return;
      }

      ExpoSpeechRecognitionModule.start({
        lang: 'en-GB',
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: false, // Relaxed for wider device compatibility
      });
    } catch (e) {
      console.error(e);
    }
  }, [sessionActive]);

  const stopListening = async () => {
    try {
      isManualStop.current = true;
      await ExpoSpeechRecognitionModule.stop();
    } catch (e) {
      console.error(e);
    }
  };

  const normalizePhrase = (rawText: string) => {
    const cleanText = rawText.toLowerCase()
      .replace('over', '')
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "") 
      .replace(/['’]/g, "") 
      .trim();
      
    const rawTokens = cleanText.split(/\s+/).filter(t => t.length > 2);
    const STOP_WORDS = new Set(['and', 'the', 'with', 'for', 'from', 'but', 'nor', 'yet', 'per', 'off']);

    return rawTokens.map(token => {
      if (knownVocab.includes(token)) return token;
      if (STOP_WORDS.has(token)) return token; 
      
      let bestMatch = token;
      let minDistance = token.length <= 4 ? 2 : 3; 
      
      knownVocab.forEach(word => {
        let distance = 0;
        const len1 = token.length;
        const len2 = word.length;
        const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
        for (let i = 0; i <= len1; i++) matrix[i][0] = i;
        for (let j = 0; j <= len2; j++) matrix[0][j] = j;
        for (let i = 1; i <= len1; i++) {
          for (let j = 1; j <= len2; j++) {
            const cost = token[i - 1] === word[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
          }
        }
        distance = matrix[len1][len2];
        if (distance < minDistance) {
          minDistance = distance;
          bestMatch = word;
        }
      });
      return bestMatch;
    }).join(' ');
  };

  const processInitialPayload = async (rawText: string) => {
    try {
      setIsProcessing(true);
      
      // Normalize and find base tokens
      const normalized = normalizePhrase(rawText);
      setNormalizedTranscript(normalized);
      const tokens = normalized.split(' ').filter(t => t.length > 1 && t !== 'OVER');

      if (tokens.length === 0) {
        Speech.speak("Intelligence payload empty. Standing down.", { rate: 1.0 });
        return;
      }

      // 1. FETCH INITIAL CANDIDATES (Top 500)
      const placeholders = tokens.map(() => "(it.name LIKE ? OR COALESCE(inv.supplier, it.default_supplier) LIKE ?)").join(' AND ');
      const params = tokens.flatMap(t => [`%${t}%`, `%${t}%`]);

      const query = `
        SELECT 
          inv.id, inv.item_type_id, inv.quantity, inv.size, inv.cabinet_id, inv.expiry_month, inv.expiry_year,
          it.name, it.default_cabinet_id, it.unit_type,
          COALESCE(inv.supplier, it.default_supplier) as brand,
          COALESCE(inv.product_range, it.default_product_range) as product_range,
          inv.image_uri as batch_image,
          it.image_uri as product_image,
          inv.last_audited_at,
          inv.last_audit_outcome
        FROM Inventory inv
        JOIN ItemTypes it ON inv.item_type_id = it.id
        WHERE inv.quantity > 0 AND (${placeholders})
        ORDER BY inv.id DESC
        LIMIT 500
      `;

      const rows = await db.getAllAsync<VoiceSearchResult>(query, params);
      
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
        // SECONDARY RECON: Search ItemTypes for a potential new discovery
        const itQuery = `SELECT id, name, default_supplier as brand, default_product_range as product_range, unit_type FROM ItemTypes WHERE ${tokens.map(() => "name LIKE ?").join(' AND ')} LIMIT 5`;
        const itParams = tokens.map(t => `%${t}%`);
        const itRows = await db.getAllAsync<any>(itQuery, itParams);

        if (itRows.length > 0) {
          setIsDiscoveryMode(true);
          discoveryIntel.current = {};
          const itCandidates = itRows.map(r => ({ ...r, id: 0, item_type_id: r.id, score: 10, evidence: [], quantity: 0, expiry_month: null, expiry_year: null }));
          setCandidates(itCandidates);
          setResults(itCandidates);
          
          if (itCandidates.length === 1) {
            setPhase('DISCOVERY_START');
            askQuestion(`No existing batches found for ${itCandidates[0].name}. Is this a new discovery?`, 'DISCOVERY_START');
          } else {
            setPhase('PRODUCT');
            askQuestion(`I found multiple product types but no active batches. Which one are you recruiting?`, 'PRODUCT');
          }
        } else {
          Speech.speak("No tactical matches found in inventory or product master.", { rate: 1.0 });
          setPhase('IDLE');
        }
        return;
      }

      if (scored.length === 1) {
        finalizeAudit(scored[0]);
      } else {
        // ENTER INTERROGATION MODE
        setCandidates(scored);
        setResults(scored); // Fix: set initial results for UI
        beginInterrogation(scored);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const beginInterrogation = (currentCandidates: VoiceSearchResult[]) => {
    if (!isDiscoveryMode && currentCandidates.length === 1) {
      finalizeAudit(currentCandidates[0]);
      return;
    }
    
    let nextPhase: InterrogationPhase | null = null;
    let question = "";

    if (isDiscoveryMode) {
      // SEQUENTIAL DISCOVERY PATH: Gather everything missing
      if (!discoveryIntel.current.brand) {
        nextPhase = 'BRAND';
        question = "What brand?";
      } else if (!discoveryIntel.current.range) {
        nextPhase = 'RANGE';
        question = "What product range? (Say GENERAL if none)";
      } else if (!discoveryIntel.current.size) {
        const unit = currentCandidates[0].unit_type === 'weight' ? 'grammes' : 
                     currentCandidates[0].unit_type === 'volume' ? 'millilitres' : 'units';
        nextPhase = 'SIZE';
        question = `What size in ${unit}?`;
      } else if (phase !== 'QUANTITY_CHECK' && phase !== 'MONTH' && phase !== 'YEAR') {
        // We've gathered BRAND, RANGE, SIZE. Now we need QUANTITY.
        // We reuse QUANTITY_CHECK phase.
        confirmedItem.current = currentCandidates[0];
        setPhase('QUANTITY_CHECK');
        askQuestion(`Understood. How many of this new batch have you found?`, 'QUANTITY_CHECK');
        return;
      } else if (!discoveryIntel.current.month) {
        nextPhase = 'MONTH';
        question = "What expiry month?";
      } else {
        nextPhase = 'YEAR';
        question = "What expiry year?";
      }
    } else {
      // Determine the first gap that varies across candidates
      const variations = {
        name: new Set(currentCandidates.map(c => c.name?.toLowerCase().trim())).size > 1,
        size: new Set(currentCandidates.map(c => c.size?.toString().toLowerCase().trim())).size > 1,
        brand: new Set(currentCandidates.map(c => c.brand?.toLowerCase().trim())).size > 1,
        range: new Set(currentCandidates.map(c => c.product_range?.toLowerCase().trim())).size > 1,
        month: new Set(currentCandidates.map(c => c.expiry_month)).size > 1,
        year: new Set(currentCandidates.map(c => c.expiry_year)).size > 1,
      };

      if (variations.name) {
        nextPhase = 'PRODUCT';
        question = "Which product?";
      } else if (variations.size) {
        const unit = currentCandidates[0].unit_type === 'weight' ? 'grammes' : 
                     currentCandidates[0].unit_type === 'volume' ? 'millilitres' : 'units';
        nextPhase = 'SIZE';
        question = `What size in ${unit}?`;
      } else if (variations.brand) {
        nextPhase = 'BRAND';
        question = "What brand?";
      } else if (variations.range) {
        nextPhase = 'RANGE';
        question = "What product range?";
      } else if (variations.month) {
        nextPhase = 'MONTH';
        question = "What expiry month?";
      } else {
        nextPhase = 'YEAR';
        question = "What expiry year?";
      }
    }

    // Anti-Loop Guard: If the user answered but it was too vague to clear the phase 
    // (e.g. "Aldi" leaving both "Aldi Premium" and "Aldi Everyday"), automatically read options.
    // ALSO: If the phase is PRODUCT, automatically read options to disambiguate base matches.
    if (nextPhase === phase || nextPhase === 'PRODUCT') {
      setPhase(nextPhase);
      setInterrogationHistory(prev => [...prev, `Buddy: Disambiguating options.`]);
      speakOptions(nextPhase, currentCandidates);
    } else {
      askQuestion(question, nextPhase);
    }
  };

  // --- DRY OPTIONS HELPER ---
  // Extracts distinct, speakable values from candidates for any interrogation phase.
  const getOptionsForPhase = (currentPhase: InterrogationPhase, currentCandidates: VoiceSearchResult[]): string[] => {
    const monthNames = ["January","February","March","April","May","June",
                        "July","August","September","October","November","December"];
    const distinct = (arr: (string | null | undefined)[]) =>
      [...new Set(arr.filter(Boolean))].map(v => String(v));

    switch (currentPhase) {
      case 'PRODUCT': return distinct(currentCandidates.map(c => c.name));
      case 'SIZE': {
        const unit = currentCandidates[0]?.unit_type === 'weight' ? 'grammes' : 
                     currentCandidates[0]?.unit_type === 'volume' ? 'millilitres' : 'units';
        return distinct(currentCandidates.map(c => `${c.size} ${unit}`));
      }
      case 'BRAND':  return distinct(currentCandidates.map(c => c.brand));
      case 'RANGE':  return distinct(currentCandidates.map(c => c.product_range));
      case 'MONTH':  return distinct(currentCandidates.map(c =>
                       c.expiry_month ? monthNames[c.expiry_month - 1] : null));
      case 'YEAR':   return distinct(currentCandidates.map(c =>
                       c.expiry_year ? String(c.expiry_year) : null));
      default:       return [];
    }
  };

  const speakOptions = (currentPhase: InterrogationPhase, currentCandidates: VoiceSearchResult[]) => {
    const options = getOptionsForPhase(currentPhase, currentCandidates);
    if (options.length === 0) {
      askQuestion('No options available.', currentPhase);
      return;
    }
    // Natural language list
    const list = options.length === 1
      ? options[0]
      : options.slice(0, -1).join(', ') + ', and ' + options[options.length - 1];
    const prompt = `I have ${list}. Which would you like?`;
    setInterrogationHistory(prev => [...prev, `Buddy (options): ${list}`]);
    isSpeaking.current = true;
    ExpoSpeechRecognitionModule.stop();
    Speech.speak(prompt, {
      rate: 1.0,
      onDone: () => {
        isSpeaking.current = false;
        Vibration.vibrate(50);
        startListening();
      }
    });
  };

  // Core speech function — does NOT reset retry counter (used for retries)
  const _speakQuestion = (text: string, nextPhase: InterrogationPhase) => {
    setPhase(nextPhase);
    interrogationBuffer.current = '';
    setInterrogationHistory(prev => [...prev, `Buddy: ${text} (say answer then OVER)`]);
    isSpeaking.current = true;
    ExpoSpeechRecognitionModule.stop();
    Speech.speak(text, {
      rate: 1.0,
      onDone: () => {
        isSpeaking.current = false;
        Vibration.vibrate(50); startListening();
      }
    });
  };

  // New question — resets retry counter
  const askQuestion = (text: string, nextPhase: InterrogationPhase) => {
    retryCount.current = 0;
    _speakQuestion(text, nextPhase);
  };

  // DRY retry handler — used by ALL interrogation phases and quantity check
  const handleNoMatch = (retryPrompt: string) => {
    retryCount.current += 1;
    if (retryCount.current < 3) {
      const remaining = 3 - retryCount.current;
      _speakQuestion(
        `Sorry, I didn't catch that. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining. ${retryPrompt}`,
        phase
      );
    } else {
      retryCount.current = 0;
      setPhase('IDLE');
      setSessionActive(false);
      Speech.speak(`Audit abandoned after 3 attempts, ${callsign}.`, { rate: 1.0 });
    }
  };

  // Sørensen–Dice coefficient for robust phonetic/fuzzy string matching
  const getSimilarity = (first: string, second: string) => {
    first = first.replace(/\s+/g, '').toLowerCase();
    second = second.replace(/\s+/g, '').toLowerCase();
    if (!first.length && !second.length) return 1;
    if (!first.length || !second.length) return 0;
    if (first === second) return 1;
    if (first.length === 1 && second.length === 1) return 0;
    if (first.length < 2 || second.length < 2) return 0;

    const firstBigrams = new Map();
    for (let i = 0; i < first.length - 1; i++) {
      const bigram = first.substring(i, i + 2);
      firstBigrams.set(bigram, (firstBigrams.get(bigram) || 0) + 1);
    }

    let intersectionSize = 0;
    for (let i = 0; i < second.length - 1; i++) {
      const bigram = second.substring(i, i + 2);
      const count = firstBigrams.get(bigram);
      if (count && count > 0) {
        firstBigrams.set(bigram, count - 1);
        intersectionSize++;
      }
    }

    return (2.0 * intersectionSize) / (first.length + second.length - 2);
  };

  const filterByTextIncludes = (
    cands: VoiceSearchResult[], 
    fieldExtractor: (c: VoiceSearchResult) => string | null | undefined, 
    spokenText: string
  ) => {
    return cands.filter(c => {
      const fieldVal = fieldExtractor(c)?.toLowerCase().trim();
      if (!fieldVal) return false;
      if (fieldVal.includes(spokenText) || spokenText.includes(fieldVal)) return true;
      // Fallback: 40% bigram overlap covers terrible voice transcriptions (e.g. "basmati" -> "bass matty")
      return getSimilarity(spokenText, fieldVal) > 0.4;
    });
  };

  const handleInterrogationResponse = async (text: string) => {
    const val = text.toLowerCase().trim();
    setInterrogationHistory(prev => [...prev, `User: ${text}`]);
    
    if (phase === 'DISCOVERY_START') {
      if (val.includes('yes') || val.includes('yep') || val.includes('correct')) {
        setInterrogationHistory(prev => [...prev, "Buddy: Initiating recruitment dossier."]);
        beginInterrogation(candidates);
      } else {
        setInterrogationHistory(prev => [...prev, "Buddy: Recruitment aborted."]);
        handleRestartMission();
      }
      return;
    }

    if (isDiscoveryMode) {
      // In Discovery Mode, we populate discoveryIntel instead of filtering candidates
      if (phase === 'BRAND') {
        discoveryIntel.current.brand = text.toUpperCase();
      } else if (phase === 'RANGE') {
        discoveryIntel.current.range = text.toUpperCase() === 'GENERAL' ? 'GENERAL' : text.toUpperCase();
      } else if (phase === 'SIZE') {
        discoveryIntel.current.size = text.replace(/[^0-9.]/g, '');
      } else if (phase === 'MONTH') {
        const monthNum = parseMonth(val);
        if (monthNum) discoveryIntel.current.month = monthNum;
        else { handleNoMatch('What expiry month?'); return; }
      } else if (phase === 'YEAR') {
        const yearNum = val.length === 2 ? Number(`20${val}`) : Number(val);
        if (!isNaN(yearNum)) discoveryIntel.current.year = yearNum;
        else { handleNoMatch('What expiry year?'); return; }
      }
      
      // Continue to next field
      beginInterrogation(candidates);
      return;
    }

    let filtered = candidates;

    if (val === VOICE_TRIGGERS.SKIP.toLowerCase()) {
      filtered = candidates.filter(c => {
        if (phase === 'PRODUCT') return !c.name;
        if (phase === 'SIZE') return !c.size;
        if (phase === 'BRAND') return !c.brand;
        if (phase === 'RANGE') return !c.product_range;
        if (phase === 'MONTH') return !c.expiry_month;
        if (phase === 'YEAR') return !c.expiry_year;
        return true;
      });
    } else if (phase === 'PRODUCT') {
      filtered = filterByTextIncludes(candidates, c => c.name, val);
    } else if (phase === 'SIZE') {
      filtered = filterByTextIncludes(candidates, c => String(c.size), val);
    } else if (phase === 'BRAND') {
      filtered = filterByTextIncludes(candidates, c => c.brand, val);
    } else if (phase === 'RANGE') {
      filtered = filterByTextIncludes(candidates, c => c.product_range, val);
    } else if (phase === 'MONTH') {
      const monthNum = parseMonth(val);
      filtered = candidates.filter(c => Number(c.expiry_month) === monthNum);
    } else if (phase === 'YEAR') {
      const yearNum = val.length === 2 ? Number(`20${val}`) : Number(val);
      filtered = candidates.filter(c => Number(c.expiry_year) === yearNum);
    }

    // Preserve evidence across filtering
    const resultsWithEvidence = filtered.map(f => ({
      ...f,
      evidence: [...f.evidence, { field: 'size' as any, token: text, confidence: 1.0 }]
    }));

    if (filtered.length === 1) {
      await finalizeAudit(filtered[0]);
    } else if (filtered.length === 0) {
      handleNoMatch('Please try again.');
    } else {
      setCandidates(resultsWithEvidence);
      setResults(resultsWithEvidence); 
      beginInterrogation(resultsWithEvidence);
    }
  };

  const parseMonth = (val: string): number | null => {
    const months: Record<string, number> = { 
      jan: 1, january: 1, one: 1, won: 1,
      feb: 2, february: 2, two: 2, to: 2, too: 2,
      mar: 3, march: 3, three: 3, free: 3,
      apr: 4, april: 4, four: 4, for: 4, fore: 4,
      may: 5, five: 5,
      jun: 6, june: 6, six: 6,
      jul: 7, july: 7, seven: 7,
      aug: 8, august: 8, eight: 8, ate: 8,
      sep: 9, sept: 9, september: 9, nine: 9,
      oct: 10, october: 10, ten: 10,
      nov: 11, november: 11, eleven: 11,
      dec: 12, december: 12, twelve: 12
    };
    
    let monthNum = parseInt(val, 10);
    if (isNaN(monthNum)) {
      for (const [mName, mVal] of Object.entries(months)) {
        if (new RegExp(`\\b${mName}\\b`).test(val)) {
          monthNum = mVal;
          return monthNum;
        }
      }
    } else if (monthNum >= 1 && monthNum <= 12) {
      return monthNum;
    }
    return null;
  };

  const finalizeAudit = async (item: VoiceSearchResult) => {
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const monthName = item.expiry_month ? monthNames[item.expiry_month - 1] : "No Date";
    const date = item.expiry_year ? `${monthName} ${item.expiry_year}` : "No Date";
    const sizeVal = parseFloat(String(item.size).replace(/[^0-9.]/g, '')) || 0;
    let unitVerbal = "";
    if (item.unit_type === 'weight') unitVerbal = "grammes";
    else if (item.unit_type === 'volume') unitVerbal = "millilitres";
    
    const spec = `${item.brand || ''} ${item.name}, ${sizeVal} ${unitVerbal}. Expiry: ${date}.`;

    if (isDiscoveryMode) {
      // For discovery, we skip straight to "How many?" but we need to pass thegathered intel
      confirmedItem.current = item;
      setPhase('QUANTITY_CHECK');
      setSessionActive(true);
      setResults([item]);
      interrogationBuffer.current = '';
      askQuestion(`Understood. How many of this new batch of ${item.name} have you found?`, 'QUANTITY_CHECK');
      return;
    }

    if (item.quantity > 1) {
      // Enter quantity audit phase — keep sessionActive=true so mic guard works
      confirmedItem.current = item;
      setPhase('QUANTITY_CHECK');
      setSessionActive(true);
      setResults([item]);
      interrogationBuffer.current = '';
      const countQuestion = `Confirmed. ${spec} I have ${item.quantity} on record. How many have you found?`;
      setInterrogationHistory(prev => [...prev, `Buddy: ${spec} — Expected count: ${item.quantity}`]);
      // Mic Discipline: stop before speaking, restart after onDone
      isSpeaking.current = true;
      ExpoSpeechRecognitionModule.stop();
      Speech.speak(countQuestion, {
        rate: 1.0,
        onDone: () => {
          isSpeaking.current = false;
          Vibration.vibrate(50);
          startListening();
        }
      });
    } else {
      // Single item — just confirm and close
      setPhase('DONE');
      setSessionActive(false);
      setResults([item]);
      await Database.Inventory.markAudited(db, item.id, 'VERIFIED');
      Speech.speak(`Confirmed. ${spec} Audit complete, ${callsign}.`, { rate: 1.0 });
      Vibration.vibrate([0, 100, 50, 100]);
      
      const updatedBriefing = await Database.Inventory.getAuditBriefing(db, selectedCabinetId);
      setBriefing(updatedBriefing);
    }
  };

  const handleQuantityCheck = async (text: string) => {
    const item = confirmedItem.current;
    if (!item) return;

    // Full 0-100 spoken number parser
    const parseSpokenNumber = (raw: string): number | null => {
      const lower = raw.toLowerCase().trim();
      
      // Direct digit parse first
      const direct = parseInt(lower, 10);
      if (!isNaN(direct) && direct >= 0 && direct <= 100) return direct;

      const ones: Record<string, number> = {
        zero: 0, nought: 0, oh: 0,
        one: 1, won: 1,
        two: 2, to: 2, too: 2,
        three: 3, free: 3,
        four: 4, for: 4, fore: 4,
        five: 5, six: 6, seven: 7, eight: 8, ate: 8,
        nine: 9, ten: 10,
        eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
        sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19
      };
      const tens: Record<string, number> = {
        twenty: 20, thirty: 30, forty: 40, fifty: 50,
        sixty: 60, seventy: 70, eighty: 80, ninety: 90
      };

      if (ones[lower] !== undefined) return ones[lower];
      if (tens[lower] !== undefined) return tens[lower];
      if (lower === 'hundred' || lower === 'a hundred' || lower === 'one hundred') return 100;

      // Compound: "twenty one", "thirty five" etc.
      const parts = lower.split(/[\s-]+/);
      if (parts.length === 2) {
        const tenPart = tens[parts[0]];
        const onePart = ones[parts[1]];
        if (tenPart !== undefined && onePart !== undefined && onePart < 20) {
          return tenPart + onePart;
        }
      }
      return null;
    };

    const lower = text.toLowerCase().trim();
    const found = parseSpokenNumber(lower);

    setPhase('DONE');
    setSessionActive(false);
    Vibration.vibrate([0, 100, 50, 100]);

    if (found === null || found < 0 || found > 100) {
      handleNoMatch('How many have you found?');
      return;
    }

    setInterrogationHistory(prev => [...prev, `User: Found ${found}`]);

    if (isDiscoveryMode) {
      await Database.Inventory.proposeNewDiscovery(db, item.item_type_id, selectedCabinetId || '', {
        quantity: found,
        ...discoveryIntel.current
      });
      Speech.speak(`New recruitment dossier filed for ${item.name}. Standing by for HQ authorization, ${callsign}.`, { rate: 1.0 });
      confirmedItem.current = null;
      setIsDiscoveryMode(false);
      discoveryIntel.current = {};
      setPhase('DONE');
      setSessionActive(false);
      
      const [updatedBriefing, updatedPending] = await Promise.all([
        Database.Inventory.getAuditBriefing(db, selectedCabinetId),
        Database.Inventory.getPendingChanges(db)
      ]);
      setBriefing(updatedBriefing);
      setPendingChanges(updatedPending);
      return;
    }

    if (found === item.quantity) {
      await Database.Inventory.markAudited(db, item.id, 'VERIFIED');
      await Database.Inventory.clearPendingChanges(db, item.id);
      Speech.speak(`Inventory confirmed. ${callsign}.`, { rate: 1.0 });
    } else {
      await Database.Inventory.proposeAdjustment(db, item.id, item.item_type_id, found);
      Speech.speak(`Discrepancy noted. Expected ${item.quantity}, reported ${found}. Intelligence logged for human review, ${callsign}.`, { rate: 1.0 });
    }
    confirmedItem.current = null;
    const [updatedBriefing, updatedPending] = await Promise.all([
      Database.Inventory.getAuditBriefing(db, selectedCabinetId),
      Database.Inventory.getPendingChanges(db)
    ]);
    setBriefing(updatedBriefing);
    setPendingChanges(updatedPending);
  };

  const handleMIA = async () => {
    if (!confirmedItem.current) return;
    const item = confirmedItem.current;
    
    setInterrogationHistory(prev => [...prev, "User: MISSING"]);
    
    await Database.Inventory.proposeMIA(db, item.id, item.item_type_id);
    
    Speech.speak(`Confirmed. Sector updated. Batch recorded as PENDING MISSING, ${callsign}. Standing by for HQ verification.`, { rate: 1.0 });
    Vibration.vibrate([0, 150, 100, 150]);
    
    confirmedItem.current = null;
    setPhase('DONE');
    setSessionActive(false);
    
    const updatedBriefing = await Database.Inventory.getAuditBriefing(db, selectedCabinetId);
    setBriefing(updatedBriefing);
  };


  const handleEndMission = async () => {
    if (!selectedCabinetId) return;
    
    setIsProcessing(true);
    setPhase('IDLE');
    setSessionActive(false);
    Vibration.vibrate([0, 100, 50, 100, 50, 200]);

    // Find all items in this cabinet NOT audited in the last 24h
    const sessionWindow = Date.now() - 24 * 60 * 60 * 1000;
    const query = `
      SELECT inv.id, inv.item_type_id, inv.quantity, it.name 
      FROM Inventory inv
      JOIN ItemTypes it ON inv.item_type_id = it.id
      WHERE inv.cabinet_id = ? AND inv.quantity > 0 
      AND (inv.last_audited_at IS NULL OR inv.last_audited_at < ?)
    `;
    const params = [selectedCabinetId, sessionWindow];
    const untouched = await db.getAllAsync<any>(query, params);

    for (const item of untouched) {
      await Database.Inventory.proposeMIA(db, item.id, item.item_type_id);
    }

    const count = untouched.length;
    Speech.speak(`Sector sweep complete, ${callsign}. Identified ${count} untouched items. All logged as PENDING MISSING for your final review at HQ.`, { rate: 1.0 });
    
    setInterrogationHistory(prev => [...prev, `MISSION COMPLETE: ${count} UNTOUCHED ITEMS LOGGED AS MIA`]);
    
    const updatedBriefing = await Database.Inventory.getAuditBriefing(db, selectedCabinetId);
    const updatedPending = await Database.Inventory.getPendingChanges(db);
    setBriefing(updatedBriefing);
    setPendingChanges(updatedPending);
    setIsProcessing(false);
  };

  const refreshPending = async () => {
    const data = await Database.Inventory.getPendingChanges(db);
    setPendingChanges(data);
  };

  const handleAuthorizeAll = async () => {
    setIsProcessing(true);
    for (const change of pendingChanges) {
      await Database.Inventory.commitPendingChange(db, change.id);
    }
    await refreshPending();
    const updatedBriefing = await Database.Inventory.getAuditBriefing(db, selectedCabinetId);
    setBriefing(updatedBriefing);
    setIsReviewVisible(false);
    setIsProcessing(false);
    Speech.speak("All tactical updates authorized. Master records synchronized.", { rate: 1.0 });
  };

  const handleResetAudit = async () => {
    if (!selectedCabinetId) return;
    Alert.alert(
      "RESET MISSION DATA",
      "This will clear the audit status for ALL batches in this sector. This cannot be undone. Confirm recalibration?",
      [
        { text: "CANCEL", style: "cancel" },
        { 
          text: "RESET", 
          style: "destructive", 
          onPress: async () => {
            await Database.Inventory.resetCabinetAudit(db, selectedCabinetId);
            const data = await Database.Inventory.getAuditBriefing(db, selectedCabinetId);
            setBriefing(data);
            Vibration.vibrate(200);
          }
        }
      ]
    );
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
                const isAdjust = change.change_type === 'ADJUST';

                return (
                  <View key={change.id} style={styles.reviewCard}>
                    <View style={[
                      styles.reviewTypeIndicator, 
                      { backgroundColor: isNew ? '#10b981' : isMIA ? '#ef4444' : '#fbbf24' }
                    ]} />
                    <View style={styles.reviewCardContent}>
                      <Text style={styles.reviewProductName}>{change.name}</Text>
                      
                      {isNew && (
                        <Text style={styles.reviewDetail}>
                          RECRUITING: {intel.brand} {intel.range} - {intel.size}{change.unit_type === 'weight' ? 'g' : 'ml'} ({intel.quantity} units)
                        </Text>
                      )}
                      {isMIA && (
                        <Text style={styles.reviewDetail}>
                          MISSING: Removed {change.current_qty} units from record.
                        </Text>
                      )}
                      {isAdjust && (
                        <Text style={styles.reviewDetail}>
                          ADJUST: {change.current_qty} → {intel.quantity} units.
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity 
                      style={styles.discardButton}
                      onPress={async () => {
                        await Database.Inventory.discardPendingChange(db, change.id);
                        await refreshPending();
                      }}
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
                   <View />
                   {!briefing.isExempt && (
                      <TouchableOpacity onPress={handleResetAudit} style={styles.resetBtn}>
                        <MaterialCommunityIcons name="refresh" size={14} color="#ef4444" />
                        <Text style={styles.resetBtnText}>RESET</Text>
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
                    <Text style={styles.metricLabel}>READINESS</Text>
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
                  <Text style={styles.integrityLabel}>INTEL INTEGRITY</Text>
                  <Text style={[styles.integrityStat, { color: '#fbbf24' }]}>VERIFIED: {Math.round(briefing.percents.verified)}%</Text>
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
                  <>
                    {item.last_audit_outcome === 'VERIFIED' ? (
                      <View style={styles.auditedBadge}>
                        <MaterialCommunityIcons name="check-decagram" size={12} color="#10b981" />
                        <Text style={styles.auditedText}>SECURED</Text>
                      </View>
                    ) : (item.last_audit_outcome === 'ADJUSTED' || item.last_audit_outcome === 'PENDING' || item.last_audit_outcome === 'MIA') ? (
                      <View style={[styles.auditedBadge, { borderBottomColor: '#fbbf24' }]}>
                        <MaterialCommunityIcons name="alert-rhombus" size={12} color="#fbbf24" />
                        <Text style={[styles.auditedText, { color: '#fbbf24' }]}>PENDING REVIEW</Text>
                      </View>
                    ) : null}
                  </>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  backBtn: { padding: 4 },
  title: { color: '#f8fafc', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  
  cabinetFilterContainer: { marginBottom: 16, paddingHorizontal: 4 },
  filterLabel: { color: '#64748b', fontSize: 8, fontWeight: '900', letterSpacing: 1, marginBottom: 8, marginLeft: 12 },
  cabinetScroll: { paddingHorizontal: 8, gap: 8 },
  cabinetChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  cabinetChipActive: { backgroundColor: '#3b82f6', borderColor: '#60a5fa' },
  cabinetChipText: { color: '#94a3b8', fontSize: 10, fontWeight: 'bold' },
  cabinetChipTextActive: { color: '#ffffff' },
  
  monitor: { backgroundColor: '#0f172a', marginHorizontal: 16, marginBottom: 16, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#1e293b' },
  monitorTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  transcript: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold', minHeight: 44, lineHeight: 22 },
  hint: { color: '#475569', fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  downloadBtn: { backgroundColor: '#fbbf2422', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fbbf24' },
  downloadText: { color: '#fbbf24', fontSize: 10, fontWeight: '900', textAlign: 'center' },

  fabContainer: { position: 'absolute', bottom: 40, right: 30 },
  micBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4.65 },
  micBtnActive: { backgroundColor: '#ef4444', transform: [{ scale: 1.1 }] },

  resultsScroll: { flex: 1, paddingHorizontal: 16 },
  sectionTitle: { color: '#64748b', fontSize: 10, fontWeight: 'bold', letterSpacing: 1, marginBottom: 12 },
  
  resultCard: { backgroundColor: '#0f172a', borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: '#1e293b' },
  scoreBadge: { width: 64, height: 52, borderRadius: 8, backgroundColor: '#fbbf24', justifyContent: 'center', alignItems: 'center' },
  scoreVal: { color: '#0f172a', fontSize: 16, fontWeight: '900' },
  scoreLabel: { color: '#0f172a', fontSize: 9, fontWeight: '900' },
  
  cardInfo: { flex: 1 },
  cardTitle: { color: '#f8fafc', fontSize: 15, fontWeight: 'bold', marginBottom: 2 },
  cardSub: { color: '#94a3b8', fontSize: 11, marginBottom: 2 },
  cardQty: { color: '#3b82f6', fontSize: 12, fontWeight: 'bold', marginBottom: 8 },
  
  auditedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, marginBottom: 8 },
  auditedText: { color: '#10b981', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  
  cardImageContainer: { width: 64, height: 64, borderRadius: 8, overflow: 'hidden', backgroundColor: '#020617', borderWidth: 1, borderColor: '#1e293b' },
  cardImage: { width: '100%', height: '100%' },
  imageFallback: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  
  evidenceContainer: { borderTopWidth: 1, borderTopColor: '#1e293b', paddingTop: 8 },
  evidenceHeader: { color: '#475569', fontSize: 7, fontWeight: 'bold', marginBottom: 4 },
  evidenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  evidenceBadge: { backgroundColor: 'rgba(59, 130, 246, 0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.3)' },
  evidenceText: { color: '#3b82f6', fontSize: 8, fontWeight: 'bold' },

  noMatch: { alignItems: 'center', padding: 40, gap: 16 },
  noMatchText: { color: '#475569', fontSize: 12, fontWeight: 'bold' },

  errorBanner: { marginTop: 8, padding: 6, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 6 },
  errorText: { color: '#ef4444', fontSize: 9, fontWeight: 'bold' },

  normalizedContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4, 
    marginTop: 8, 
    paddingTop: 8, 
    borderTopWidth: 1, 
    borderTopColor: '#1e293b' 
  },
  normalizedText: { color: '#10b981', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  
  statusText: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },

  inlineRestartBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1e293b', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#334155' },
  inlineRestartText: { color: '#94a3b8', fontSize: 8, fontWeight: 'bold' },
  
  historyContainer: { backgroundColor: '#1e293b', padding: 12, borderRadius: 8, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#3b82f6' },
  historyText: { fontSize: 9, fontWeight: 'bold', marginBottom: 4 },
  buddyText: { color: '#3b82f6' },
  userText: { color: '#10b981' },

  facetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateLabel: { color: '#fbbf24', fontSize: 10, fontWeight: '900' },

  briefingCard: { backgroundColor: '#0f172a', marginHorizontal: 16, marginBottom: 16, padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#1e293b', borderLeftWidth: 4, borderLeftColor: '#fbbf24' },
  briefingHeader: { flexDirection: 'column', alignItems: 'flex-start', marginBottom: 20 },
  briefingTitle: { color: '#fbbf24', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  windowLabel: { color: '#475569', fontSize: 11, fontWeight: 'bold' },
  briefingMetrics: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 },
  metricBlock: { alignItems: 'center' },
  metricVal: { color: '#f8fafc', fontSize: 24, fontWeight: '900' },
  metricLabel: { color: '#64748b', fontSize: 10, fontWeight: 'bold', marginTop: 4 },
  progressBarBg: { height: 8, backgroundColor: '#1e293b', borderRadius: 4, marginBottom: 16 },
  progressBarFill: { height: '100%', backgroundColor: '#fbbf24', borderRadius: 4 },
  integrityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, borderTopWidth: 1, borderTopColor: '#1e293b', paddingTop: 16 },
  integrityLabel: { color: '#475569', fontSize: 11, fontWeight: 'bold', width: '100%', marginBottom: 6 },
  integrityStat: { fontSize: 11, fontWeight: '900' },

  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#450a0a', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: '#ef444433' },
  resetBtnText: { color: '#ef4444', fontSize: 10, fontWeight: '900' },

  rankContainer: { paddingHorizontal: 16, marginBottom: 16 },
  rankRow: { flexDirection: 'row', gap: 8 },
  rankBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  rankBtnActive: { backgroundColor: '#3b82f6', borderColor: '#60a5fa' },
  rankText: { color: '#94a3b8', fontSize: 8, fontWeight: '900' },
  rankTextActive: { color: '#ffffff' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.9)',
    justifyContent: 'center',
    padding: 20,
  },
  reviewModalContainer: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    maxHeight: '80%',
    overflow: 'hidden',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  reviewTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  reviewList: {
    padding: 15,
  },
  reviewCard: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    marginBottom: 10,
    overflow: 'hidden',
    alignItems: 'center',
  },
  reviewTypeIndicator: {
    width: 6,
    height: '100%',
  },
  reviewCardContent: {
    flex: 1,
    padding: 12,
  },
  reviewProductName: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  reviewDetail: {
    color: '#94a3b8',
    fontSize: 12,
  },
  discardButton: {
    padding: 12,
  },
  reviewFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    gap: 12,
  },
  footerButton: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  cancelButton: {
    backgroundColor: '#334155',
  },
  authorizeButton: {
    backgroundColor: '#10b981',
  },
  emptyReview: {
    alignItems: 'center',
    padding: 40,
  },
  emptyReviewText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 12,
  },
});
