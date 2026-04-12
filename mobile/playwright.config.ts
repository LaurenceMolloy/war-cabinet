import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  workers: 1, // Keep single-threaded for database isolation safety 
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8081',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // We only need Chromium to test the universal Expo Web logic
  ],

  // Automatically start the Expo web dev server before testing
/*
  webServer: {
    command: 'npx cross-env CI=1 npx expo start --web',
    url: 'http://localhost:8081',
    reuseExistingServer: true,
  },
*/
});
