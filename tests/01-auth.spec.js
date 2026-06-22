/**
 * TEST: Autentikasi (Login & Logout)
 */

const { test, expect } = require("@playwright/test");
const { loginAsAdmin } = require("./helpers/auth");

test.describe("Autentikasi", () => {
  test("halaman login tampil dengan benar", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("redirect ke login jika belum login", async ({ page }) => {
    await page.goto("/kerjasama/master");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login gagal dengan kredensial salah", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="username"]', "admin");
    await page.fill('input[name="password"]', "salah123");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/login/);
  });

  test("login berhasil dengan kredensial benar", async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("logout berhasil dan redirect ke login", async ({ page }) => {
  // sudah login dari storageState
  await page.goto("/logout");

  await expect(page).toHaveURL(/\/login/);

  await page.goto("/kerjasama/master");
  await expect(page).toHaveURL(/\/login/);
});
});
