/**
 * Global setup: login sekali dan simpan session state ke file.
 */
const { chromium, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';
const STORAGE_FILE = path.join(__dirname, '.auth/admin.json');

module.exports = async () => {
  // Pastikan folder .auth ada
  const dir = path.dirname(STORAGE_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: BASE_URL
  });

  const page = await context.newPage();

  await page.goto('/login');

  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'password');

  await page.click('button[type="submit"]');

  // tunggu request selesai
  await page.waitForLoadState('networkidle');

  // verifikasi login berhasil
  await expect(page).toHaveURL(/\/home/, {
    timeout: 15000
  });

  // simpan session
  await context.storageState({
    path: STORAGE_FILE
  });

  console.log('✓ Session admin tersimpan ke', STORAGE_FILE);

  await browser.close();
};