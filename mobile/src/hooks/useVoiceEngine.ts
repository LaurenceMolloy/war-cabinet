import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform, Alert, Vibration } from 'react-native';
import { useSpeechRecognitionEvent, ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import * as Speech from 'expo-speech';
import { VOICE_TRIGGERS, normaliseStreamText } from '../services/VoiceSearchEngine';

export interface UseVoiceEngineProps {
  phase: string;
  sessionActive: boolean;
  setSessionActive: (active: boolean) => void;
  isSpeakingRef: React.MutableRefObject<boolean>;
  interrogationBufferRef: React.MutableRefObject<string>;
  
  // Callbacks for business logic
  onWakeWord: () => void;
  onAbandon: () => void;
  onOptions: () => void;
  onRestart: () => void;
  onComplete: () => void;
  onMIA: () => void;
  onTerminate: (answer: string) => void;
  onInitialPayload: (text: string) => void;
}

export function useVoiceEngine({
  phase,
  sessionActive,
  setSessionActive,
  isSpeakingRef,
  interrogationBufferRef,
  onWakeWord,
  onAbandon,
  onOptions,
  onRestart,
  onComplete,
  onMIA,
  onTerminate,
  onInitialPayload,
}: UseVoiceEngineProps) {
  const [isListening, setIsListening] = useState(false);
  const [partialText, setPartialText] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const [recognitionService, setRecognitionService] = useState<string>('Detecting...');
  const [onDeviceAvailable, setOnDeviceAvailable] = useState<boolean | null>(null);
  
  const isManualStop = useRef(false);

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
    checkServices();
  }, []);

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

  const startListening = useCallback(async () => {
    try {
      isManualStop.current = false;
      // Reset interrogation buffer at mic start to purge any TTS audio contamination
      if (phase !== 'IDLE' && phase !== 'DONE') {
        interrogationBufferRef.current = '';
      }
      if (!sessionActive) {
        setFinalTranscript('');
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
        requiresOnDeviceRecognition: false,
      });
    } catch (e) {
      console.error(e);
    }
  }, [phase, sessionActive, interrogationBufferRef]);

  const stopListening = async () => {
    try {
      isManualStop.current = true;
      await ExpoSpeechRecognitionModule.stop();
    } catch (e) {
      console.error(e);
    }
  };

  useSpeechRecognitionEvent("start", () => {
    setIsListening(true);
    setErrorMessage(null);
  });
  
  useSpeechRecognitionEvent("end", () => setIsListening(false));
  
  useSpeechRecognitionEvent("error", (event) => {
    // Only auto-restart if we haven't manually stopped or processed a match
    if (event.error === 'no-speech' || event.error === 'client') {
      // NOTE: isProcessing from parent would normally block here. We'll assume if phase is valid, we're good.
      // But to be safe, if we aren't manual stopping and not speaking, we restart.
      if (isManualStop.current || isSpeakingRef.current) return; 
      
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
    
    const currentText = normaliseStreamText(text);
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
          isSpeakingRef.current = true;
          ExpoSpeechRecognitionModule.stop();
          onWakeWord();
          return;
        }
      }

      if (currentText) {
        // INTERROGATION PHASE: Bypass sessionActive — Buddy is actively questioning
        if (phase !== 'IDLE' && phase !== 'DONE') {

          // ABANDON AUDIT: Immediately kill the process
          if (currentText.includes(VOICE_TRIGGERS.ABANDON) && event.isFinal) {
            console.log(`ABANDONING AUDIT`);
            interrogationBufferRef.current = '';
            onAbandon();
            return;
          }

          // OPTIONS PLEASE: Read back available choices for the current question
          if (currentText.includes(VOICE_TRIGGERS.OPTIONS) && event.isFinal) {
            console.log(`OPTIONS: phase="${phase}" isSpeaking=${isSpeakingRef.current}`);
            interrogationBufferRef.current = '';
            if (!isSpeakingRef.current) onOptions();
            return;
          }

          // START OVER: Mid-process mission reset
          if (currentText.includes(VOICE_TRIGGERS.RESTART) && event.isFinal) {
            console.log(`RESTARTING MISSION VIA VOICE`);
            onRestart();
            return;
          }

          // MISSION COMPLETE: End sector sweep and flag untouched items as MIA
          if (currentText.includes(VOICE_TRIGGERS.COMPLETE) && event.isFinal) {
            console.log(`FINISHING MISSION`);
            onComplete();
            return;
          }

          if ((currentText.endsWith(VOICE_TRIGGERS.TERMINATE) || currentText.includes(` ${VOICE_TRIGGERS.TERMINATE}`)) && event.isFinal) {
            const regex = new RegExp(`\\s?${VOICE_TRIGGERS.TERMINATE}\\s?`, 'gi');
            const currentAnswer = currentText.replace(regex, '').trim();
            // OR logic: use currentAnswer if non-empty, else fall back to buffer — prevents "TWO TWO" duplication
            const fullAnswer = (currentAnswer || interrogationBufferRef.current).trim();
            interrogationBufferRef.current = '';
            console.log(`QUANTITY ANSWER: "${fullAnswer}"`);
            Vibration.vibrate([0, 70, 50, 70]);
            ExpoSpeechRecognitionModule.stop();
            onTerminate(fullAnswer);
            return;
          }
          // Accumulate ALL results (interim + final) into buffer to catch short words like "two"
          if (currentText) {
            interrogationBufferRef.current = currentText; // Use latest full transcript, not append
            console.log(`INTERROGATION BUFFER: "${interrogationBufferRef.current}"`);
          }
          return;
        }

        // STAGE 2: MISSION RECORDING (WAITING FOR TERMINATE)
        else {
          // MISSION COMPLETE: End sector sweep
          if (currentText.includes(VOICE_TRIGGERS.COMPLETE) && event.isFinal) {
            console.log(`FINISHING MISSION FROM IDLE`);
            onComplete();
            return;
          }

          if (currentText.toUpperCase().includes(VOICE_TRIGGERS.TERMINATE) && event.isFinal) {
            // Initial payload sign-off
            setSessionActive(false);
            setFinalTranscript(currentText);
            Vibration.vibrate([0, 70, 50, 70]);
            ExpoSpeechRecognitionModule.stop();
            onInitialPayload(currentText);
            return;
          }

          if (currentText.toUpperCase().includes(VOICE_TRIGGERS.MIA)) {
            // Only fire MIA if event is final or we just caught it in interim
            console.log("VOICE: MIA command detected.");
            onMIA();
            return;
          }
        }
      }
    }

    if (event.isFinal) {
      console.log(`VOICE [Final]: "${currentText}" (Session Active: ${sessionActive})`);
    }
  });

  return {
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
  };
}
