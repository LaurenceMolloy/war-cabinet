import { Platform, Alert, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';/**
 * Visual Supply Verification Service
 * Handles image capture and processing with fallbacks for development.
 */

// Asset-based mocks from the user's pre-shot library.
// Optimized for two tactical profiles: 'standard' (300px/40%) and 'hq' (600px/70%).
const MOCK_LIBRARY = [
  {
    id: '3188',
    standard: require('../../assets/visual_audit/1000003188_s300_q40.jpg'),
    hq: require('../../assets/visual_audit/1000003188_s600_q70.jpg'),
  },
  {
    id: '3705',
    standard: require('../../assets/visual_audit/1000003705_s300_q40.jpg'),
    hq: require('../../assets/visual_audit/1000003705_s600_q70.jpg'),
  },
  {
    id: '3718',
    standard: require('../../assets/visual_audit/1000003718_s300_q40.jpg'),
    hq: require('../../assets/visual_audit/1000003718_s600_q70.jpg'),
  },
  {
    id: '3816',
    standard: require('../../assets/visual_audit/1000003816_s300_q40.jpg'),
    hq: require('../../assets/visual_audit/1000003816_s600_q70.jpg'),
  },
  {
    id: '3880',
    standard: require('../../assets/visual_audit/1000003880_s300_q40.jpg'),
    hq: require('../../assets/visual_audit/1000003880_s600_q70.jpg'),
  },
  {
    id: '4248',
    standard: require('../../assets/visual_audit/1000004248_s300_q40.jpg'),
    hq: require('../../assets/visual_audit/1000004248_s600_q70.jpg'),
  },
  {
    id: '143123',
    standard: require('../../assets/visual_audit/20260412_143123_s300_q40.jpg'),
    hq: require('../../assets/visual_audit/20260412_143123_s600_q70.jpg'),
  }
];

export type VisualProfile = 'standard' | 'hq';

export const VisualSupplyService = {
  profile: 'standard' as VisualProfile,

  setProfile(p: VisualProfile) {
    this.profile = p;
    console.log(`[VisualSupply] Profile set to: ${p}`);
  },

  resolveAsset(asset: any): string | null {
    if (typeof Image.resolveAssetSource === 'function') {
      const resolved = Image.resolveAssetSource(asset);
      return resolved?.uri || null;
    }
    return asset?.uri || asset;
  },

  /**
   * Captures a photo using the device camera and processes it for tactical profiles.
   * Falls back to the mock library on the web or if the device has no camera (e.g. simulators).
   */
  async capturePhotoDetailed(): Promise<{id: string, standard: string, hq: string} | null> {
    if (Platform.OS === 'web') {
      console.log('[VisualSupply] Web platform detected. Falling back to mock camera.');
      return this._generateMockAsset();
    }

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera access is required to capture tactical intel.');
        return null;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8, // Base high quality capture
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const capturedUri = result.assets[0].uri;
        const newId = `asset_${Date.now()}`;
        
        console.log(`[VisualSupply] Real camera capture successful for asset ${newId}`);
        // For now, mapping both profiles to the captured image. 
        // ImagePicker compresses down to quality: 0.8. We can refine multi-step scaling later.
        return { id: newId, standard: capturedUri, hq: capturedUri };
      }
    } catch (e) {
      console.log('[VisualSupply] Camera launch failed (likely simulator). Falling back to mock camera.', e);
      return this._generateMockAsset();
    }

    return null;
  },

  /**
   * Generates a mock asset from the static library.
   * Used as a fallback for web and simulators.
   */
  _generateMockAsset(): {id: string, standard: string, hq: string} | null {
    const item = MOCK_LIBRARY[Math.floor(Math.random() * MOCK_LIBRARY.length)];
    const standard = this.resolveAsset(item.standard);
    const hq = this.resolveAsset(item.hq);
    console.log(`[VisualSupply] Mock dual-stream processing complete for asset ${item.id}.`);
    return (standard && hq) ? { id: item.id, standard, hq } : null;
  },

  /**
   * Returns the URI for a specific profile of an existing tactical image.
   * PRODUCTION NOTE: This will return null if the profile was discarded during finalization.
   */
  getUriForProfile(id: string, p: VisualProfile): string | null {
    const item = MOCK_LIBRARY.find(i => i.id === id);
    if (!item) return null;
    return this.resolveAsset(item[p]);
  },

  /**
   * Checks if a specific tactical profile exists on disk for an asset.
   * Useful for UI to know if 'upscaling' is possible without a re-capture.
   */
  isProfileAvailable(id: string, p: VisualProfile): boolean {
    const item = MOCK_LIBRARY.find(i => i.id === id);
    if (!item) return false;
    
    // SIMULATION: If it's a mock, it's always available.
    // PRODUCTION: return FileSystem.exists(`${STORAGE_DIR}/${id}_${p}.jpg`);
    return true; 
  },

  /**
   * "Bakes" the tactical choice.
   * PRODUCTION: Deletes the source/unused fidelity profiles and moves the chosen one to permanent storage.
   */
  async finalizeTacticalAsset(id: string, chosenProfile: VisualProfile): Promise<void> {
    console.log(`[VisualSupply] BAKING ASSET ${id}: Persisting ${chosenProfile}, PURGING unused fidelity data.`);
    // PRODUCTION:
    // const otherProfile = chosenProfile === 'hq' ? 'standard' : 'hq';
    // await FileSystem.deleteAsync(`${TEMP_DIR}/${id}_${otherProfile}.jpg`);
    // await FileSystem.moveAsync(`${TEMP_DIR}/${id}_${chosenProfile}.jpg`, `${PERM_DIR}/${id}.jpg`);
  },

  // Compatibility stubs for existing sandbox UI
  simulatedQuality: 40,
  setSimulatedQuality(q: number) {
    this.setProfile(q > 50 ? 'hq' : 'standard');
  }
};
