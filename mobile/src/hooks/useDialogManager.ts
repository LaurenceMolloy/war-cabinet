import { useState, useRef } from 'react';
import * as Speech from 'expo-speech';
import { Vibration } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { VOICE_TRIGGERS, filterByTextIncludes, getSimilarity } from '../services/VoiceSearchEngine';

export type InterrogationPhase = 'IDLE' | 'PRODUCT' | 'SIZE' | 'BRAND' | 'RANGE' | 'MONTH' | 'YEAR' | 'QUANTITY_CHECK' | 'DISCOVERY_START' | 'DONE';

interface MatchEvidence {
  field: 'name' | 'brand' | 'range' | 'size';
  token: string;
  confidence: number;
}

export interface VoiceSearchResult {
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
}

interface UseDialogManagerProps {
  callsign: string;
  setSessionActive: (active: boolean) => void;
  setResults: (results: VoiceSearchResult[]) => void;
  startListening: () => void;
  isSpeakingRef: React.MutableRefObject<boolean>;
  interrogationBufferRef: React.MutableRefObject<string>;
  recordVerified: (item: VoiceSearchResult) => Promise<void>;
  recordAdjustment: (item: VoiceSearchResult, found: number) => Promise<void>;
  recordDiscovery: (itemTypeId: number, quantity: number, discoveryIntel: any) => Promise<void>;
  recordMIA: (item: VoiceSearchResult) => Promise<void>;
}

export function useDialogManager({
  callsign,
  setSessionActive,
  setResults,
  startListening,
  isSpeakingRef,
  interrogationBufferRef,
  recordVerified,
  recordAdjustment,
  recordDiscovery,
  recordMIA,
}: UseDialogManagerProps) {
  const [phase, setPhase] = useState<InterrogationPhase>('IDLE');
  const [candidates, setCandidates] = useState<VoiceSearchResult[]>([]);
  const [interrogationHistory, setInterrogationHistory] = useState<string[]>([]);
  
  const confirmedItem = useRef<VoiceSearchResult | null>(null);
  const [isDiscoveryMode, setIsDiscoveryMode] = useState(false);
  const discoveryIntel = useRef<{ brand?: string, range?: string, size?: string, month?: number, year?: number }>({});
  const retryCount = useRef(0);

  const handleRestartMission = () => {
    setPhase('IDLE');
    setSessionActive(false);
    setResults([]);
    setCandidates([]);
    setInterrogationHistory(prev => [...prev, `MISSION RESTART: STANDING BY...`]);
    interrogationBufferRef.current = '';
    confirmedItem.current = null;
    setIsDiscoveryMode(false);
    discoveryIntel.current = {};
    Vibration.vibrate([0, 50, 50, 50]);
    
    setSessionActive(true);
    isSpeakingRef.current = true;
    ExpoSpeechRecognitionModule.stop();
    Speech.speak('Restarting. What product?', { 
      rate: 1.0,
      onDone: () => {
        isSpeakingRef.current = false;
        Vibration.vibrate(50); startListening();
      }
    });
  };

  const _speakQuestion = (text: string, nextPhase: InterrogationPhase) => {
    setPhase(nextPhase);
    interrogationBufferRef.current = '';
    setInterrogationHistory(prev => [...prev, `Buddy: ${text} (say answer then OVER)`]);
    isSpeakingRef.current = true;
    ExpoSpeechRecognitionModule.stop();
    Speech.speak(text, {
      rate: 1.0,
      onDone: () => {
        isSpeakingRef.current = false;
        Vibration.vibrate(50); startListening();
      }
    });
  };

  const askQuestion = (text: string, nextPhase: InterrogationPhase) => {
    retryCount.current = 0;
    _speakQuestion(text, nextPhase);
  };

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
    const list = options.length === 1
      ? options[0]
      : options.slice(0, -1).join(', ') + ', and ' + options[options.length - 1];
    const prompt = `I have ${list}. Which would you like?`;
    setInterrogationHistory(prev => [...prev, `Buddy (options): ${list}`]);
    isSpeakingRef.current = true;
    ExpoSpeechRecognitionModule.stop();
    Speech.speak(prompt, {
      rate: 1.0,
      onDone: () => {
        isSpeakingRef.current = false;
        Vibration.vibrate(50);
        startListening();
      }
    });
  };

  const parseMonth = (text: string): number | null => {
    const months = {
      january: 1, jan: 1,
      february: 2, feb: 2,
      march: 3, mar: 3,
      april: 4, apr: 4,
      may: 5,
      june: 6, jun: 6,
      july: 7, jul: 7,
      august: 8, aug: 8,
      september: 9, sep: 9, sept: 9,
      october: 10, oct: 10,
      november: 11, nov: 11,
      december: 12, dec: 12
    };
    for (const [key, val] of Object.entries(months)) {
      if (text.includes(key)) return val;
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
      confirmedItem.current = item;
      setPhase('QUANTITY_CHECK');
      setSessionActive(true);
      setResults([item]);
      interrogationBufferRef.current = '';
      askQuestion(`Understood. How many of this new batch of ${item.name} have you found?`, 'QUANTITY_CHECK');
      return;
    }

    if (item.quantity > 1) {
      confirmedItem.current = item;
      setPhase('QUANTITY_CHECK');
      setSessionActive(true);
      setResults([item]);
      interrogationBufferRef.current = '';
      const countQuestion = `Confirmed. ${spec} I have ${item.quantity} on record. How many have you found?`;
      setInterrogationHistory(prev => [...prev, `Buddy: ${spec} — Expected count: ${item.quantity}`]);
      isSpeakingRef.current = true;
      ExpoSpeechRecognitionModule.stop();
      Speech.speak(countQuestion, {
        rate: 1.0,
        onDone: () => {
          isSpeakingRef.current = false;
          Vibration.vibrate(50);
          startListening();
        }
      });
    } else {
      setPhase('DONE');
      setSessionActive(false);
      setResults([item]);
      await recordVerified(item);
      Speech.speak(`Confirmed. ${spec} Audit complete, ${callsign}.`, { rate: 1.0 });
      Vibration.vibrate([0, 100, 50, 100]);
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
      } else if (variations.year) {
        nextPhase = 'YEAR';
        question = "What expiry year?";
      } else {
        finalizeAudit(currentCandidates[0]);
        return;
      }
    }

    if (nextPhase === phase || nextPhase === 'PRODUCT') {
      setPhase(nextPhase);
      setInterrogationHistory(prev => [...prev, `Buddy: Disambiguating options.`]);
      speakOptions(nextPhase, currentCandidates);
    } else {
      askQuestion(question, nextPhase);
    }
  };

  const handleInterrogationResponse = async (text: string) => {
    const val = text.toLowerCase();
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

    const resultsWithEvidence = filtered.map(f => ({
      ...f,
      evidence: [...f.evidence, { field: phase.toLowerCase() as any, token: text, confidence: 1.0 }]
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

  const handleQuantityCheck = async (text: string) => {
    const item = confirmedItem.current;
    if (!item) return;

    const parseSpokenNumber = (raw: string): number | null => {
      const lower = raw.toLowerCase().trim();
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
      await recordDiscovery(item.item_type_id, found, discoveryIntel.current);
      Speech.speak(`New recruitment dossier filed for ${item.name}. Standing by for HQ authorization, ${callsign}.`, { rate: 1.0 });
      confirmedItem.current = null;
      setIsDiscoveryMode(false);
      discoveryIntel.current = {};
      setPhase('DONE');
      setSessionActive(false);
      return;
    }

    if (found === item.quantity) {
      await recordVerified(item);
      Speech.speak(`Inventory confirmed. ${callsign}.`, { rate: 1.0 });
    } else {
      await recordAdjustment(item, found);
      Speech.speak(`Discrepancy noted. Expected ${item.quantity}, reported ${found}. Intelligence logged for human review, ${callsign}.`, { rate: 1.0 });
    }
    confirmedItem.current = null;
  };

  const handleMIA = async () => {
    if (!confirmedItem.current) return;
    const item = confirmedItem.current;
    
    setInterrogationHistory(prev => [...prev, "User: MISSING"]);
    
    await recordMIA(item);
    
    Speech.speak(`Confirmed. Sector updated. Batch recorded as PENDING MISSING, ${callsign}. Standing by for HQ verification.`, { rate: 1.0 });
    Vibration.vibrate([0, 150, 100, 150]);
    
    confirmedItem.current = null;
    setPhase('DONE');
    setSessionActive(false);
  };

  return {
    phase,
    setPhase,
    candidates,
    setCandidates,
    interrogationHistory,
    setInterrogationHistory,
    isDiscoveryMode,
    setIsDiscoveryMode,
    confirmedItem,
    handleRestartMission,
    handleInterrogationResponse,
    handleQuantityCheck,
    handleMIA,
    beginInterrogation,
    speakOptions,
    askQuestion,
  };
}
