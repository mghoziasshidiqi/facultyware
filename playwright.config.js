// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const STORAGE_FILE = path.join(__dirname, 'tests/.auth/admin.json');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 15000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  globalSetup: './tests/global-setup.js',

  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
    // Pakai session yang sudah disimpan (kecuali test auth)
    storageState: STORAGE_FILE,
    viewport: { width: 1280, height: 800 }, // layar cukup besar agar sidebar tidak collapse
  },

  projects: [
    {
      // Project khusus auth — tanpa storageState
      // PENTING: pakai object kosong { cookies: [], origins: [] }, BUKAN `undefined`.
      // Jika diset `undefined`, Playwright akan fallback ke storageState milik
      // top-level `use` (STORAGE_FILE) sehingga test auth tetap login otomatis.
      name: 'auth-setup',
      testMatch: '**/01-auth.spec.js',
      use: {
        ...devices['Desktop Chrome'],
        storageState: { cookies: [], origins: [] },
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      // Semua test lain — pakai session yang tersimpan
      name: 'chromium',
      testIgnore: '**/01-auth.spec.js',
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_FILE,
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
});
