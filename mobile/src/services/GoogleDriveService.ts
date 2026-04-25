import { GoogleSignin } from '@react-native-google-signin/google-signin';

const CLIENT_ID_WEB = '649377265049-br0c6diva1ng3rcqlm8dlovl392i2vmk.apps.googleusercontent.com';

export const GOOGLE_AUTH_CONFIG = {
  webClientId: CLIENT_ID_WEB,
  offlineAccess: true,
  scopes: [
    'https://www.googleapis.com/auth/drive.appdata', // Hidden sandbox folder
  ],
};

export class GoogleDriveService {
  static async getAccessToken(): Promise<string | null> {
    try {
      // Defensive check for native module availability
      if (!GoogleSignin?.isSignedIn) {
        console.log('[DRIVE] Native GoogleSignin module not yet initialized.');
        return null;
      }
      
      const isSignedIn = await GoogleSignin.isSignedIn();
      if (!isSignedIn) return null;
      
      const tokens = await GoogleSignin.getTokens();
      return tokens.accessToken;
    } catch (e) {
      console.error('[DRIVE] Failed to get native access token:', e);
      return null;
    }
  }

  static async logout() {
    try {
      await GoogleSignin.signOut();
    } catch (e) {
      console.error('[DRIVE] Sign out error:', e);
    }
  }

  static async isAuthenticated(): Promise<boolean> {
    try {
      return await GoogleSignin.isSignedIn();
    } catch (e) {
      return false;
    }
  }
}
