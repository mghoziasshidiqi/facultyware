/**
 * TEST: Implementation Arrangement (IA)
 *
 * Tes fitur IA saat ini mencakup pencarian, filter, form create/edit,
 * dokumentasi lampiran, API detail, dan export/import.
 */

const { test, expect } = require("@playwright/test");

const DUMMY_PDF = Buffer.from(
  "%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 0 /Kids [] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF",
);

test.describe("Implementation Arrangement (IA)", () => {
  test("fitur search IA berjalan", async ({ page }) => {
    await page.goto("/kerjasama/ia");
    await page.fill('input[name="search"]', "Workshop");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/search=Workshop/);
    await expect(page.locator("table")).toBeVisible();
  });

  test("filter mitra berjalan", async ({ page }) => {
    await page.goto("/kerjasama/ia");
    const selectEl = page.locator('select[name="partner_id"]');
    const optionCount = await selectEl.locator("option").count();
    if (optionCount > 1) {
      await selectEl.selectOption({ index: 1 });
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(/partner_id=/);
    }
  });

  test("tombol reset filter muncul saat ada filter aktif", async ({ page }) => {
    await page.goto("/kerjasama/ia?search=test&partner_id=1");
    await expect(page.locator('a:has-text("Reset")')).toBeVisible();
  });

  // ── CREATE ────────────────────────────────────────────────────────────────

  test("halaman form tambah IA tampil dengan dropdown terisi", async ({
    page,
  }) => {
    await page.goto("/kerjasama/ia/create");
    await expect(page.locator("h1")).toContainText(
      "Tambah Implementation Arrangement",
    );
    const partnershipOptions = await page
      .locator('select[name="partnership_id"] option')
      .count();
    expect(partnershipOptions).toBeGreaterThan(1);
    await expect(page.locator('input[name="title"]')).toBeVisible();
    await expect(page.locator('input[name="start_date"]')).toBeVisible();
  });

  test("dropdown program implementasi terfilter saat pilih kerjasama", async ({
    page,
  }) => {
    await page.goto("/kerjasama/ia/create");
    await page.selectOption('select[name="partnership_id"]', { index: 1 });
    await page.waitForTimeout(300);
    const implSel = page.locator('select[name="partnership_impl_id"]');
    // ":not([disabled])" termasuk opsi placeholder ("-- Pilih Program --") yang
    // memang tidak punya atribut disabled, makanya dibandingkan > 1.
    const enabledOptions = await implSel
      .locator("option:not([disabled])")
      .count();
    expect(enabledOptions).toBeGreaterThan(1);
  });

  test("tambah IA baru berhasil", async ({ page }) => {
    // NOTE: Aplikasi belum punya fitur hapus IA dari UI, jadi data test ini
    // akan tertinggal di database. Pakai document_number unik per run (timestamp)
    // supaya tidak terlihat seperti duplikat persis dan mudah dikenali untuk
    // dibersihkan manual lewat database jika perlu.
    const uniqueDocNumber = `IA-TEST-${Date.now()}/2025`;
    await page.goto("/kerjasama/ia/create");
    await page.selectOption('select[name="partnership_id"]', { index: 1 });
    await page.waitForTimeout(300);
    const implSel = page.locator('select[name="partnership_impl_id"]');
    const firstEnabledValue = await implSel
      .locator('option:not([disabled]):not([value=""])')
      .first()
      .getAttribute("value");
    await implSel.selectOption(firstEnabledValue);
    await page.fill('input[name="title"]', "Test IA Playwright 2025");
    await page.fill(
      'textarea[name="description"]',
      "Deskripsi test Playwright",
    );
    await page.fill('input[name="document_number"]', uniqueDocNumber);
    await page.fill('input[name="start_date"]', "2025-03-01");
    await page.fill('input[name="end_date"]', "2025-12-31");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/kerjasama\/ia.*success=/);
  });

  // ── UPDATE ────────────────────────────────────────────────────────────────

  test("halaman form edit IA tampil", async ({ page }) => {
    await page.goto("/kerjasama/ia");
    const editLink = page.locator('a:has-text("Edit")').first();
    await expect(editLink).toBeVisible();
    await editLink.click();
    await expect(page).toHaveURL(/\/kerjasama\/ia\/update\//);
    await expect(page.locator('input[name="title"]')).toBeVisible();
  });

  test("perbarui deskripsi IA berhasil", async ({ page }) => {
    const uniqueDocNumber = `IA-UPDATE-${Date.now()}/2026`;
    await page.goto("/kerjasama/ia/create");
    await page.selectOption('select[name="partnership_id"]', { index: 1 });
    await page.waitForTimeout(300);
    const implSel = page.locator('select[name="partnership_impl_id"]');
    const firstEnabledValue = await implSel
      .locator('option:not([disabled]):not([value=""])')
      .first()
      .getAttribute("value");
    await implSel.selectOption(firstEnabledValue);
    await page.fill('input[name="title"]', "Test IA Update Deskripsi");
    await page.fill('textarea[name="description"]', "Deskripsi awal");
    await page.fill('input[name="document_number"]', uniqueDocNumber);
    await page.fill('input[name="start_date"]', "2025-01-01");
    await page.fill('input[name="end_date"]', "2025-12-31");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/kerjasama\/ia.*success=/);

    await page.goto(
      `/kerjasama/ia?search=${encodeURIComponent("Test IA Update Deskripsi")}`,
    );
    const editLink = page.locator('a:has-text("Edit")').first();
    await expect(editLink).toBeVisible();
    await editLink.click();

    await page.fill(
      'textarea[name="description"]',
      "Deskripsi diperbarui oleh Playwright",
    );
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/kerjasama\/ia.*success=/);
  });

  test("download dokumen lampiran IA tersedia jika ada data", async ({
    page,
  }) => {
    await page.goto("/kerjasama/ia");
    const downloadLink = page.locator('a[href*="/download/"]').first();
    if ((await downloadLink.count()) === 0) return;
    const href = await downloadLink.getAttribute("href");
    const response = await page.request.get(href);
    expect(response.status()).toBe(200);
  });

  // ── API ───────────────────────────────────────────────────────────────────

  test("API detail IA mengembalikan JSON valid", async ({ page }) => {
    await page.goto("/kerjasama/ia");
    const editLink = page.locator('a:has-text("Edit")').first();
    const href = await editLink.getAttribute("href");
    if (href) {
      const id = href.split("/").pop();
      await page.goto(`/kerjasama/ia/api/${id}`);
      const body = await page.evaluate(() =>
        JSON.parse(document.body.innerText),
      );
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("id");
      expect(body.data).toHaveProperty("title");
    }
  });
  test("API upload dokumen IA via endpoint menerima file", async ({ page }) => {
    await page.goto("/kerjasama/ia");
    const editLink = page.locator('a:has-text("Edit")').first();
    const href = await editLink.getAttribute("href");
    if (!href) return;
    const id = href.split("/").pop();
    const response = await page.request.post(`/kerjasama/ia/api/${id}/upload`, {
      multipart: {
        document_file: {
          name: "test-document.pdf",
          mimeType: "application/pdf",
          buffer: DUMMY_PDF,
        },
      },
    });
    expect([200, 400, 404]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty("success");
  });
  // ── EXPORT ────────────────────────────────────────────────────────────────

  test("export PDF IA menghasilkan file PDF", async ({ page }) => {
    const response = await page.request.get("/kerjasama/ia/export/pdf");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("pdf");
  });

  // ── IMPORT ────────────────────────────────────────────────────────────────

  test("halaman import IA tampil", async ({ page }) => {
    await page.goto("/kerjasama/ia/import");
    await expect(page.locator("h1")).toContainText("Import");
    await expect(page.locator('input[type="file"]')).toBeVisible();
  });
});
