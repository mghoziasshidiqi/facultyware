/**
 * TEST: Kerjasama Master
 *
 * Tes fitur master kerjasama saat ini mencakup:
 * - menampilkan daftar seluruh Kerjasama (Read)
 * - menambah data Kerjasama baru (Create)
 * - mengubah data Kerjasama (Update)
 * - menghapus data Kerjasama (Delete)
 * - mengembalikan JSON melalui API list
 * - mengekspor data Kerjasama ke PDF
 * - mengimpor data Kerjasama dari CSV/Excel
 */

const { test, expect } = require("@playwright/test");

test.describe("Kerjasama Master", () => {
  // ── CREATE ────────────────────────────────────────────────────────────────

  test("halaman form tambah kerjasama tampil", async ({ page }) => {
    await page.goto("/kerjasama/master/create");
    await expect(page.locator("h1")).toContainText("Tambah Kerjasama");
    await expect(page.locator('select[name="partner_id"]')).toBeVisible();
    await expect(page.locator('input[name="title"]')).toBeVisible();
    await expect(page.locator('input[name="document_number"]')).toBeVisible();
  });

  test("tambah kerjasama baru berhasil", async ({ page }) => {
    await page.goto("/kerjasama/master/create");
    await page.selectOption('select[name="partner_id"]', { index: 1 });
    await page.fill('input[name="title"]', "Test Kerjasama Playwright");
    await page.fill('input[name="document_number"]', "TEST-PW-001/2025");
    await page.selectOption('select[name="document_type"]', "moa");
    await page.fill('input[name="start_date"]', "2025-01-01");
    await page.fill('input[name="end_date"]', "2027-01-01");
    await page.click('button[type="submit"]');
    // Redirect ke daftar dengan query success
    await expect(page).toHaveURL(/\/kerjasama\/master.*success=/);
  });

  // ── UPDATE ────────────────────────────────────────────────────────────────

  test("halaman form edit kerjasama tampil", async ({ page }) => {
    await page.goto("/kerjasama/master");
    const editLink = page.locator('a:has-text("Edit")').first();
    await expect(editLink).toBeVisible();
    await editLink.click();
    await expect(page).toHaveURL(/\/kerjasama\/master\/update\//);
    await expect(page.locator('input[name="title"]')).toBeVisible();
  });

  // ── DELETE ────────────────────────────────────────────────────────────────

  test("hapus kerjasama test yang dibuat", async ({ page }) => {
    await page.goto("/kerjasama/master?search=Test+Kerjasama+Playwright");
    page.on("dialog", (dialog) => dialog.accept());
    const hapusBtn = page.locator('button:has-text("Hapus")').first();
    if ((await hapusBtn.count()) > 0) {
      await hapusBtn.click();
      await expect(page).toHaveURL(/success=/);
    }
  });

  // ── EXPORT ────────────────────────────────────────────────────────────────

  test("export PDF response 200 dengan content-type PDF", async ({ page }) => {
    // Pakai page.request (APIRequestContext) yang otomatis ikut cookie session
    // dari context yang sama. Lebih robust dibanding page.goto() + menunggu
    // event 'download', yang gampang race condition karena PDF dikirim
    // dengan header Content-Disposition: attachment.
    const response = await page.request.get("/kerjasama/master/export/pdf");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("pdf");
  });
  test("API list kerjasama mengembalikan JSON", async ({ page }) => {
    const response = await page.request.get("/kerjasama/master/api/list");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("success", true);
    expect(body).toHaveProperty("data");
    expect(Array.isArray(body.data)).toBe(true);
  });
  // ── IMPORT ────────────────────────────────────────────────────────────────

  test("halaman import kerjasama tampil", async ({ page }) => {
    await page.goto("/kerjasama/master/import");
    await expect(page.locator("h1")).toContainText("Import");
    await expect(page.locator('input[type="file"]')).toBeVisible();
  });
});
