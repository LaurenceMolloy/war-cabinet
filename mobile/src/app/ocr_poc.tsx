import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Dimensions, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

// IMPORTANT: This PoC requires a text recognition library.
// For this experiment, we are using 'react-native-mlkit-ocr'.
import MlkitOcr from 'react-native-mlkit-ocr'; 

const { width, height } = Dimensions.get('window');

export default function OCRExpiryPoC() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const [scannedResult, setScannedResult] = useState<{ raw: string; parsed: string } | null>(null);
  const [cameraLayout, setCameraLayout] = useState<{ width: number, height: number } | null>(null);
  const cameraRef = useRef<any>(null);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Camera access required for OCR experiment.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>GRANT PERMISSION</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const parseExpiryDate = (text: string) => {
    const formatYear = (y: string) => (y.length === 2 ? '20' + y : y);
    const monthsMap: { [key: string]: string } = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    };

    const monthPattern = '(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*';

    // 1. First, check for unambiguous Text Months (Jan, February etc.)
    // Check Month Day Year first
    const mdy = new RegExp(`\\b${monthPattern}[./\\-\\s,]+\\d{1,2}[./\\-\\s,]+(\\d{2,4})\\b`, 'i');
    let tMatch = text.match(mdy);
    if (tMatch) return `${monthsMap[tMatch[1].toUpperCase().substring(0, 3)]}/${formatYear(tMatch[2])}`;

    // Check [Day] Month Year
    const dmy = new RegExp(`\\b(?:\\d{1,2}[./\\-\\s,]+)?${monthPattern}[./\\-\\s,]+(\\d{2,4})\\b`, 'i');
    tMatch = text.match(dmy);
    if (tMatch) return `${monthsMap[tMatch[1].toUpperCase().substring(0, 3)]}/${formatYear(tMatch[2])}`;

    // 2. Generic Numeric Pattern: \d{2}.?\d{2}.?\d{2,4}
    // Constraints: d1 <= 31, d2 <= 31, year prefix 20 or 21 if 4-digit
    const genericNumeric = /\b(\d{2})[./\-\s]?(\d{2})[./\-\s]?(\d{2,4})\b/g;
    const matches = Array.from(text.matchAll(genericNumeric));
    
    for (const m of matches) {
      const d1 = parseInt(m[1]);
      const d2 = parseInt(m[2]);
      const yearStr = m[3];
      const yearPrefix = yearStr.length === 4 ? yearStr.substring(0, 2) : '';
      
      const isYearValid = yearStr.length === 2 || (yearPrefix === '20' || yearPrefix === '21');
      
      if (d1 <= 31 && d2 <= 31 && isYearValid) {
        // Presume second pair is month (UK format)
        return `${m[2]}/${formatYear(yearStr)}`;
      }
    }

    return null;
  };

  const handleScan = async () => {
    if (!cameraRef.current || isScanning) return;
    
    setIsScanning(true);
    setScannedResult(null);

    try {
      // 1. Capture a frame
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      // 2. Perform OCR on the full image
      let detectedText = "";
      try {
        const result = await MlkitOcr.detectFromUri(photo.uri);
        
        // 3. Filter results to the viewfinder box if layout is known
        if (cameraLayout && result.length > 0) {
          const viewfinderWidth = width * 0.47;
          const viewfinderHeight = 67;
          
          const originX = (cameraLayout.width - viewfinderWidth) / 2;
          const originY = (cameraLayout.height - viewfinderHeight) / 2;
          
          // Map viewfinder to image coordinates
          const scaleX = photo.width / cameraLayout.width;
          const scaleY = photo.height / cameraLayout.height;

          const imgBox = {
            left: originX * scaleX,
            top: originY * scaleY,
            right: (originX + viewfinderWidth) * scaleX,
            bottom: (originY + viewfinderHeight) * scaleY,
          };

          // Keep blocks whose center point is within our guide box
          const filteredBlocks = result.filter(block => {
            const { bounding } = block;
            if (!bounding) return true; // Fallback if no bounding box
            
            const centerX = bounding.left + bounding.width / 2;
            const centerY = bounding.top + bounding.height / 2;
            
            return (
              centerX >= imgBox.left && 
              centerX <= imgBox.right && 
              centerY >= imgBox.top && 
              centerY <= imgBox.bottom
            );
          });

          detectedText = filteredBlocks.map(block => block.text).join(' ').replace(/\n/g, ' ');
        } else {
          detectedText = result.map(block => block.text).join(' ').replace(/\n/g, ' ');
        }

      } catch (ocrErr) {
        console.log("OCR Library not available or failed, falling back to simulation.");
        detectedText = "BEST BEFORE 12/26 (SIMULATED)";
      }
      
      const parsed = parseExpiryDate(detectedText);

      setScannedResult({
        raw: detectedText,
        parsed: parsed || "NO DATE DETECTED"
      });

    } catch (error) {
      console.error(error);
      Alert.alert("Scan Error", "Logistical intel failed to resolve.");
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={28} color="#f8fafc" />
        </TouchableOpacity>
        <Text style={styles.title}>EXPIRY SCANNER PoC</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setCameraLayout({ width, height });
          }}
        >
          <View style={styles.viewfinderContainer}>
             <View style={styles.viewfinder}>
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
             </View>
             <Text style={styles.instruction}>ALIGN PRINTED EXPIRY DATE IN BOX</Text>
          </View>
        </CameraView>
      </View>

      <View style={styles.resultPanel}>
        {isScanning ? (
          <View style={styles.scanningContainer}>
            <ActivityIndicator color="#3b82f6" size="large" />
            <Text style={styles.scanningText}>PROCESSING OPTICAL INTEL...</Text>
          </View>
        ) : scannedResult ? (
          <View style={styles.scannedInfo}>
            <Text style={styles.label}>RAW TEXT DETECTED:</Text>
            <Text style={styles.rawText}>"{scannedResult.raw}"</Text>
            
            <View style={styles.parsedContainer}>
              <Text style={styles.label}>PARSED LOGISTICAL DATE:</Text>
              <Text style={[styles.parsedDate, scannedResult.parsed === "NO DATE DETECTED" && { color: '#ef4444' }]}>
                {scannedResult.parsed}
              </Text>
            </View>

            <TouchableOpacity style={styles.resetButton} onPress={() => setScannedResult(null)}>
              <Text style={styles.resetButtonText}>SCAN AGAIN</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.scanButton} onPress={handleScan}>
            <MaterialCommunityIcons name="camera" size={32} color="#0f172a" />
            <Text style={styles.scanButtonText}>CAPTURE DATE</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          EXPERIMENTAL MODULE: Standalone PoC for reliability testing. 
          No database interaction.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  title: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
    marginHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  camera: {
    flex: 1,
  },
  viewfinderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  viewfinder: {
    width: width * 0.47,
    height: 67,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#3b82f6',
    borderWidth: 3,
  },
  topLeft: { top: -2, left: -2, borderBottomWidth: 0, borderRightWidth: 0 },
  topRight: { top: -2, right: -2, borderBottomWidth: 0, borderLeftWidth: 0 },
  bottomLeft: { bottom: -2, left: -2, borderTopWidth: 0, borderRightWidth: 0 },
  bottomRight: { bottom: -2, right: -2, borderTopWidth: 0, borderLeftWidth: 0 },
  instruction: {
    color: '#fff',
    marginTop: 20,
    fontSize: 12,
    fontWeight: 'bold',
    opacity: 0.8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  resultPanel: {
    padding: 24,
    minHeight: 180,
    justifyContent: 'center',
  },
  scanButton: {
    backgroundColor: '#3b82f6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 12,
  },
  scanButtonText: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: 'bold',
  },
  scanningContainer: {
    alignItems: 'center',
    gap: 12,
  },
  scanningText: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: 'bold',
  },
  scannedInfo: {
    gap: 8,
  },
  label: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: 'bold',
  },
  rawText: {
    color: '#64748b',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    backgroundColor: '#0f172a',
    padding: 8,
    borderRadius: 6,
    opacity: 0.7,
  },
  parsedContainer: {
    marginTop: 8,
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3b82f633',
  },
  parsedDate: {
    color: '#3b82f6',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 4,
  },
  resetButton: {
    marginTop: 12,
    alignSelf: 'center',
  },
  resetButtonText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  disclaimer: {
    paddingBottom: 20,
    paddingHorizontal: 30,
  },
  disclaimerText: {
    color: '#475569',
    fontSize: 10,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  text: {
    color: '#fff',
    textAlign: 'center',
    marginTop: 100,
  },
  button: {
    backgroundColor: '#3b82f6',
    padding: 15,
    margin: 20,
    borderRadius: 10,
  },
  buttonText: {
    color: '#0f172a',
    textAlign: 'center',
    fontWeight: 'bold',
  },
});
