import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform, Linking, Vibration } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { useSpeechRecognitionEvent, ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import * as Speech from 'expo-speech';

/**
 * VOICE INTEL POC: ACOUSTIC-TO-SEMANTIC MAPPING
 * 
 * PURPOSE: Prove that token-based intersection scoring can accurately 
 * map fluid speech to structured database records.
 * 
 * RULES OF ENGAGEMENT:
 * 1. STANDALONE: This file contains all its own logic.
 * 2. NO PRODUCTION DAL: SQL queries are inlined here.
 * 3. TRANSPARENCY: UI shows "Match Evidence" for debugging.
 */

interface MatchEvidence {
  field: 'name' | 'brand' | 'range' | 'size';
  token: string;
  confidence: number;
}

interface VoiceSearchResult {
  id: number;
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

  // --- INTERROGATION STATE ---
  type InterrogationPhase = 'IDLE' | 'SIZE' | 'BRAND' | 'RANGE' | 'MONTH' | 'YEAR' | 'QUANTITY_CHECK' | 'DONE';
  const [phase, setPhase] = useState<InterrogationPhase>('IDLE');
  const [candidates, setCandidates] = useState<VoiceSearchResult[]>([]);
  const [interrogationHistory, setInterrogationHistory] = useState<string[]>([]);
  const interrogationBuffer = React.useRef<string>('');
  const confirmedItem = React.useRef<VoiceSearchResult | null>(null);
  const isSpeaking = React.useRef(false); // Blocks mic resurrection while TTS is active
  const [recognitionService, setRecognitionService] = useState<string>('Detecting...');
  const [onDeviceAvailable, setOnDeviceAvailable] = useState<boolean | null>(null);
  const [knownVocab, setKnownVocab] = useState<string[]>([]);

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
        const rows = await db.getAllAsync<{id: string, name: string}>('SELECT id, name FROM Cabinets ORDER BY name ASC');
        setCabinets(rows);
      } catch (e) {
        console.error("Cabinet fetch failed", e);
      }
    };

    checkServices();
    fetchVocab();
    fetchCabinets();
  }, [db]);

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
  
  useSpeechRecognitionEvent("result", (event) => {
    const latestResult = event.results[event.results.length - 1];
    const text = latestResult?.transcript || '';
    setPartialText(text);
    
    const currentText = text.toUpperCase().replace(/[.,!]/g, '').trim();
    
    if (currentText) {
      // INTERROGATION PHASE: Bypass sessionActive — Buddy is actively questioning
      if (phase !== 'IDLE' && phase !== 'DONE') {
        if (currentText.endsWith('OVER') || currentText.includes(' OVER')) {
          const currentAnswer = currentText.replace(/\s?OVER\s?/gi, '').trim();
          // OR logic: use currentAnswer if non-empty, else fall back to buffer — prevents "TWO TWO" duplication
          const fullAnswer = (currentAnswer || interrogationBuffer.current).trim();
          interrogationBuffer.current = '';
          console.log(`QUANTITY ANSWER: "${fullAnswer}"`);
          Vibration.vibrate([0, 70, 50, 70]);
          ExpoSpeechRecognitionModule.stop();
          if (phase === 'QUANTITY_CHECK') {
            handleQuantityCheck(fullAnswer);
          } else {
            handleInterrogationResponse(fullAnswer);
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

      // STAGE 1: WAITING FOR WAKE WORD "CHECK"
      if (!sessionActive) {
        if (currentText.includes('CHECK')) {
          setSessionActive(true);
          setFinalTranscript('');
          setPartialText('');
          Vibration.vibrate(100);
          Speech.speak('Got it', { rate: 1.0 }); 
          return;
        }
      } 
      // STAGE 2: MISSION RECORDING (WAITING FOR OVER)
      else {
        if (currentText.endsWith('OVER') || currentText.includes(' OVER')) {
          // Initial payload sign-off
          setSessionActive(false);
          setFinalTranscript(text);
          Vibration.vibrate([0, 70, 50, 70]);
          ExpoSpeechRecognitionModule.stop();
          processInitialPayload(text);
          return;
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
        continuous: true, // Modern hardware handles continuous comms better
        requiresOnDeviceRecognition: true, // Air-gapped / Tactical reliability
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
          inv.id, inv.quantity, inv.size, inv.cabinet_id, inv.expiry_month, inv.expiry_year,
          it.name, it.default_cabinet_id, it.unit_type,
          COALESCE(inv.supplier, it.default_supplier) as brand,
          COALESCE(inv.product_range, it.default_product_range) as product_range
        FROM Inventory inv
        JOIN ItemTypes it ON inv.item_type_id = it.id
        WHERE ${placeholders}
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
        Speech.speak("No tactical matches found.", { rate: 1.0 });
        setPhase('IDLE');
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
    // Determine the first gap that varies across candidates
    const variations = {
      size: new Set(currentCandidates.map(c => c.size)).size > 1,
      brand: new Set(currentCandidates.map(c => c.brand)).size > 1,
      range: new Set(currentCandidates.map(c => c.product_range)).size > 1,
      month: new Set(currentCandidates.map(c => c.expiry_month)).size > 1,
      year: new Set(currentCandidates.map(c => c.expiry_year)).size > 1,
    };

    if (variations.size) {
      const unit = currentCandidates[0].unit_type === 'weight' ? 'grammes' : 
                   currentCandidates[0].unit_type === 'volume' ? 'millilitres' : 'units';
      askQuestion(`What size in ${unit}?`, 'SIZE');
    } else if (variations.brand) {
      askQuestion("What brand?", 'BRAND');
    } else if (variations.range) {
      askQuestion("What product range?", 'RANGE');
    } else if (variations.month) {
      askQuestion("What expiry month?", 'MONTH');
    } else {
      // If only years vary
      askQuestion("What expiry year?", 'YEAR');
    }
  };

  const askQuestion = (text: string, nextPhase: InterrogationPhase) => {
    setPhase(nextPhase);
    interrogationBuffer.current = '';
    setInterrogationHistory(prev => [...prev, `Buddy: ${text} (say answer then OVER)`]);
    // Mic Discipline: stop before speaking, restart after onDone
    isSpeaking.current = true;
    ExpoSpeechRecognitionModule.stop();
    Speech.speak(text, { 
      rate: 1.0,
      onDone: () => {
        isSpeaking.current = false;
        setTimeout(() => {
          Vibration.vibrate(50);
          startListening();
        }, 300);
      }
    });
  };

  const handleInterrogationResponse = (text: string) => {
    const val = text.toLowerCase();
    setInterrogationHistory(prev => [...prev, `User: ${text}`]);
    
    let filtered = candidates;
    if (phase === 'SIZE') {
      filtered = candidates.filter(c => String(c.size).includes(val) || val.includes(String(c.size)));
    } else if (phase === 'BRAND') {
      filtered = candidates.filter(c => c.brand?.toLowerCase().includes(val) || val.includes(c.brand?.toLowerCase() || ''));
    } else if (phase === 'MONTH') {
      // Basic month mapping for POC
      const months: Record<string, number> = { 
        january: 1, feb: 2, march: 3, april: 4, may: 5, june: 6, 
        july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 
      };
      const monthNum = months[val] || parseInt(val, 10);
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
      finalizeAudit(filtered[0]);
    } else if (filtered.length === 0) {
      Speech.speak("Intelligence lost. No matching facets found.", { rate: 1.0 });
      setPhase('IDLE');
    } else {
      setCandidates(resultsWithEvidence);
      setResults(resultsWithEvidence); 
      beginInterrogation(resultsWithEvidence);
    }
  };

  const finalizeAudit = (item: VoiceSearchResult) => {
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
          setTimeout(() => {
            Vibration.vibrate(50);
            startListening();
          }, 300);
        }
      });
    } else {
      // Single item — just confirm and close
      setPhase('DONE');
      setSessionActive(false);
      setResults([item]);
      Speech.speak(`Confirmed. ${spec} Audit complete, ${callsign}.`, { rate: 1.0 });
      Vibration.vibrate([0, 100, 50, 100]);
    }
  };

  const handleQuantityCheck = (text: string) => {
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
      Speech.speak(`Could not understand the count. Audit incomplete, ${callsign}.`, { rate: 1.0 });
      return;
    }

    setInterrogationHistory(prev => [...prev, `User: Found ${found}`]);

    if (found === item.quantity) {
      Speech.speak(`Inventory confirmed. ${callsign}.`, { rate: 1.0 });
    } else {
      Speech.speak(`Discrepancy. Expected ${item.quantity}, found ${found}. Logged for review, ${callsign}.`, { rate: 1.0 });
    }
    confirmedItem.current = null;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={28} color="#3b82f6" />
        </TouchableOpacity>
        <Text style={styles.title}>VOICE INTEL LAB</Text>
        <View style={{ width: 28 }} />
      </View>

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
              <Text style={[styles.cabinetChipText, selectedCabinetId === cab.id && styles.cabinetChipTextActive]}>
                {cab.name.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.rankContainer}>
        <Text style={styles.filterLabel}>CALLSIGN:</Text>
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

      <View style={styles.monitor}>
        <View style={styles.monitorTop}>
          <View style={styles.statusRow}>
            <View style={[styles.statusIndicator, { backgroundColor: sessionActive ? '#10b981' : '#475569' }]} />
            <Text style={[styles.statusText, { color: sessionActive ? '#10b981' : '#475569' }]}>
              {sessionActive ? 'ACTIVE' : 'READY'}
            </Text>
          </View>
          <Text style={styles.hint}>SAY "OVER" TO SEARCH</Text>
        </View>

        <Text style={styles.transcript} numberOfLines={2}>
          {isListening ? partialText : (finalTranscript || 'WAITING...')}
        </Text>
        
        {normalizedTranscript !== '' && (
          <View style={styles.normalizedContainer}>
            <MaterialCommunityIcons name="check-all" size={10} color="#10b981" />
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


      <ScrollView style={styles.resultsScroll} contentContainerStyle={{ paddingBottom: 100 }}>
        {phase !== 'IDLE' && phase !== 'DONE' && (
          <View style={styles.historyContainer}>
            {interrogationHistory.map((h, i) => (
              <Text key={i} style={[styles.historyText, h.startsWith('Buddy') ? styles.buddyText : styles.userText]}>
                {h.toUpperCase()}
              </Text>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>
          {phase !== 'IDLE' && phase !== 'DONE' ? `REFINING INTELLIGENCE (${results.length} REMAINING)` : 
           isProcessing ? 'ANALYZING ACOUSTICS...' : 'TACTICAL MATCHES'}
        </Text>
        
        {isProcessing && <ActivityIndicator color="#fbbf24" style={{ margin: 20 }} />}

        {results.map((item, idx) => (
          <View key={idx} style={styles.resultCard}>
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
          </View>
        ))}

        {results.length === 0 && !isProcessing && finalTranscript !== '' && (
          <View style={styles.noMatch}>
            <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#475569" />
            <Text style={styles.noMatchText}>NO TACTICAL MATCHES FOUND</Text>
          </View>
        )}
      </ScrollView>

      {/* FLOATING ACTION MIC */}
      <View style={styles.fabContainer}>
        <TouchableOpacity 
          onPress={isListening ? stopListening : startListening} 
          style={[styles.micBtn, isListening && styles.micBtnActive]}
        >
          <MaterialCommunityIcons name={isListening ? "stop" : "microphone"} size={32} color="white" />
        </TouchableOpacity>
        
        {onDeviceAvailable === false && (
          <View style={styles.fabInfo}>
            <TouchableOpacity onPress={triggerDownload} style={styles.downloadBtn}>
              <Text style={styles.downloadText}>DOWNLOAD OFFLINE MODEL</Text>
            </TouchableOpacity>
          </View>
        )}
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

  fabContainer: { position: 'absolute', bottom: 30, right: 20, alignItems: 'flex-end', gap: 12 },
  micBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4 },
  micBtnActive: { backgroundColor: '#ef4444' },
  fabInfo: { backgroundColor: '#0f172a', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#1e293b' },

  resultsScroll: { flex: 1, paddingHorizontal: 16 },
  sectionTitle: { color: '#64748b', fontSize: 10, fontWeight: 'bold', letterSpacing: 1, marginBottom: 12 },
  
  resultCard: { backgroundColor: '#0f172a', borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: '#1e293b' },
  scoreBadge: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#fbbf24', justifyContent: 'center', alignItems: 'center' },
  scoreVal: { color: '#0f172a', fontSize: 18, fontWeight: '900' },
  scoreLabel: { color: '#0f172a', fontSize: 6, fontWeight: 'bold' },
  
  cardInfo: { flex: 1 },
  cardTitle: { color: '#f8fafc', fontSize: 15, fontWeight: 'bold', marginBottom: 2 },
  cardSub: { color: '#94a3b8', fontSize: 11, marginBottom: 2 },
  cardQty: { color: '#3b82f6', fontSize: 12, fontWeight: 'bold', marginBottom: 8 },
  
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

  historyContainer: { backgroundColor: '#1e293b', padding: 12, borderRadius: 8, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#3b82f6' },
  historyText: { fontSize: 9, fontWeight: 'bold', marginBottom: 4 },
  buddyText: { color: '#3b82f6' },
  userText: { color: '#10b981' },

  facetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateLabel: { color: '#fbbf24', fontSize: 10, fontWeight: '900' },

  rankContainer: { paddingHorizontal: 16, marginBottom: 16 },
  rankRow: { flexDirection: 'row', gap: 8 },
  rankBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  rankBtnActive: { backgroundColor: '#3b82f6', borderColor: '#60a5fa' },
  rankText: { color: '#94a3b8', fontSize: 8, fontWeight: '900' },
  rankTextActive: { color: '#ffffff' }
});
