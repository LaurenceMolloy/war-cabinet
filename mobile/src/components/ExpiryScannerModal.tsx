import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Dimensions, Platform, Modal } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MlkitOcr from 'react-native-mlkit-ocr';
import { OCRExpiryService } from '../services/OCRExpiryService';

const { width, height } = Dimensions.get('window');

interface ExpiryScannerModalProps {
  isVisible: boolean;
  onClose: () => void;
  onResult: (month: string, year: string) => void;
}

export const ExpiryScannerModal: React.FC<ExpiryScannerModalProps> = ({ isVisible, onClose, onResult }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const [cameraLayout, setCameraLayout] = useState<{ width: number, height: number } | null>(null);
  const cameraRef = useRef<any>(null);

  if (!isVisible) return null;

  if (!permission) {
    return null;
  }

  if (!permission.granted) {
    return (
      <Modal visible={isVisible} animationType="slide" transparent={false}>
        <View style={styles.container}>
           <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={28} color="#f8fafc" />
            </TouchableOpacity>
            <Text style={styles.title}>CAMERA ACCESS</Text>
            <View style={{ width: 28 }} />
          </View>
          <View style={styles.permissionContent}>
            <MaterialCommunityIcons name="camera-off" size={64} color="#64748b" />
            <Text style={styles.text}>Camera access required for OCR scanning.</Text>
            <TouchableOpacity style={styles.button} onPress={requestPermission}>
              <Text style={styles.buttonText}>GRANT PERMISSION</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  const handleScan = async () => {
    if (!cameraRef.current || isScanning) return;
    
    setIsScanning(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      let detectedText = "";
      try {
        const result = await MlkitOcr.detectFromUri(photo.uri);
        
        if (cameraLayout && result.length > 0) {
          const viewfinderWidth = width * 0.7;
          const viewfinderHeight = 80;
          
          const originX = (cameraLayout.width - viewfinderWidth) / 2;
          const originY = (cameraLayout.height - viewfinderHeight) / 2;
          
          const scaleX = photo.width / cameraLayout.width;
          const scaleY = photo.height / cameraLayout.height;

          const imgBox = {
            left: originX * scaleX,
            top: originY * scaleY,
            right: (originX + viewfinderWidth) * scaleX,
            bottom: (originY + viewfinderHeight) * scaleY,
          };

          const filteredBlocks = result.filter(block => {
            const { bounding } = block;
            if (!bounding) return true;
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
        console.log("OCR Library failed", ocrErr);
        Alert.alert("OCR Error", "Optical recognition failed to initialize.");
        return;
      }
      
      const parsed = OCRExpiryService.parseExpiryDate(detectedText);

      if (parsed) {
        onResult(parsed.month, parsed.year);
        onClose();
      } else {
        Alert.alert(
          "No Date Found", 
          "Could not reliably extract an expiry date from this image. Please try again or enter manually.",
          [{ text: "OK", onPress: onClose }]
        );
      }

    } catch (error) {
      console.error(error);
      Alert.alert("Scan Error", "Logistical intel failed to resolve.");
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <Modal visible={isVisible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <MaterialCommunityIcons name="close" size={28} color="#f8fafc" />
          </TouchableOpacity>
          <Text style={styles.title}>EXPIRY SCANNER</Text>
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

        <View style={styles.footer}>
          {isScanning ? (
            <View style={styles.scanningContainer}>
              <ActivityIndicator color="#3b82f6" size="large" />
              <Text style={styles.scanningText}>PROCESSING OPTICAL INTEL...</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.scanButton} onPress={handleScan}>
              <MaterialCommunityIcons name="camera" size={32} color="#0f172a" />
              <Text style={styles.scanButtonText}>CAPTURE DATE</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

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
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  title: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  permissionContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 20,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  viewfinderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  viewfinder: {
    width: width * 0.7,
    height: 80,
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
    marginTop: 24,
    fontSize: 12,
    fontWeight: 'bold',
    opacity: 0.8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    textAlign: 'center',
  },
  footer: {
    padding: 30,
    backgroundColor: '#020617',
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
  text: {
    color: '#94a3b8',
    textAlign: 'center',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#0f172a',
    fontWeight: 'bold',
  },
});
