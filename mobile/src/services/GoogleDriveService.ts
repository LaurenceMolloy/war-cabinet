import * as SecureStore from 'expo-secure-store';

const CLIENT_ID_WEB = '649377265049-br0c6diva1ng3rcqlm8dlovl392i2vmk.apps.googleusercontent.com';

// Drive Scopes
const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/drive.appdata', // Hidden sandbox folder
];

export interface GoogleUser {
  email: string;
  name: string;
  picture?: string;
}

export const GOOGLE_AUTH_CONFIG = {
  clientId: CLIENT_ID_WEB,
  scopes: SCOPES,
};

export class GoogleDriveService {
  private static async getAccessToken(): Promise<string | null> {
    return await SecureStore.getItemAsync('google_access_token');
  }

  static async saveTokens(accessToken: string, refreshToken?: string) {
    await SecureStore.setItemAsync('google_access_token', accessToken);
    if (refreshToken) {
      await SecureStore.setItemAsync('google_refresh_token', refreshToken);
    }
  }

  static async logout() {
    await SecureStore.deleteItemAsync('google_access_token');
    await SecureStore.deleteItemAsync('google_refresh_token');
  }

  static async isAuthenticated(): Promise<boolean> {
    const token = await this.getAccessToken();
    return !!token;
  }
}
