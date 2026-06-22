/**
 * Helper: login ke aplikasi sebagai admin.
 * Simpan storage state ke file agar tidak perlu login ulang tiap test.
 */
const { expect } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

const STORAGE_FILE = path.join(__dirname, "../.auth/admin.json");

/**
 * Login fresh dan simpan cookies ke file.
 * Panggil sekali di global setup atau test pertama.
 * @param {import('@playwright/test').Page} page
 */
async function loginAsAdmin(page) {
  await page.goto("/login");

  await page.fill('input[name="username"]', "admin");
  await page.fill('input[name="password"]', "password");

  await page.click('button[type="submit"]');

  await page.waitForTimeout(3000);

}

/**
 * Login dan simpan storage state ke file untuk dipakai test lain.
 * @param {import('@playwright/test').Browser} browser
 */
async function saveAuthState(browser) {
  const dir = path.dirname(STORAGE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAsAdmin(page);
  await context.storageState({ path: STORAGE_FILE });
  await context.close();
}

module.exports = { loginAsAdmin, saveAuthState, STORAGE_FILE };
