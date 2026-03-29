# War Cabinet: Cellar Inventory App - Installation Guide

These instructions are specifically tailored for Windows development environments. The application has been built using React Native with Expo and SQLite for local persistence.

## System Prerequisites
**IMPORTANT:** Your current environment uses **Node.js v16.17.0**. Expo SDK strictly requires at least **Node v18.13.0**. 

1. Please update your Node.js to LTS (v20 is recommended): 
   - Download the Windows Installer (.msi) from [nodejs.org](https://nodejs.org/) and run it.
2. Install the Expo CLI globally (optional, but convenient): 
   - `npm install -g expo-cli`

## How To Run and Test on Laptop

Instead of running a heavy Android Studio emulator, Expo lets you test your logic directly within your web browser (or the Expo Go app on your phone).

1. Open your terminal and navigate to the `mobile` project folder:
   ```cmd
   cd C:\Users\Laurence Molloy\Desktop\GIT\Personal_Github\war-cabinet\mobile
   ```

2. Install dependencies (if not already done):
   ```cmd
   npm install --legacy-peer-deps
   ```

3. Start the Expo development server:
   ```cmd
   npx expo start
   ```

4. **Testing Methods**:
   * **In Browser**: Press the \`w\` key in the terminal to launch the web preview. The UI will render locally.
   * **On Phone**: Install the **Expo Go** app from the Google Play Store. Scan the QR code given in the terminal using the Expo Go app.

## Production APK Deployment

When you're ready to "green light" the final version and install the app standalone on your Android device (no Expo app needed):

1. **EAS Build Setup**:
   ```cmd
   npm install -g eas-cli
   eas login
   eas build:configure
   ```

2. **Generate Native APK**:
   ```cmd
   eas build -p android --profile preview
   ```
   *Note: Ensure an `eas.json` configuration is setup for a local `.apk` format build (not `.aab` for Play Store). Add this to `eas.json`:*
   ```json
   "build": {
     "preview": {
       "android": { "buildType": "apk" }
     }
   }
   ```

3. **Install on Phone**: Download the resulting `.apk` file from your Expo dashboard to your mobile device, turn on "Install from Unknown Sources" and install it directly.

## Data Backup Process

The app utilizes `expo-sqlite` and stores the `warcabinet.db` database inside the internal app storage. Since local SQLite files are secure to the application sandbox, to manually backup you can connect your phone via MTP, or future improvements can add a File-System export tool button to the main Application settings. 
