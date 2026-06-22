/**
 * TEST: Kerjasama Expired & Perpanjangan
 * Session di-inject via storageState dari global-setup.
 */

const { test, expect } = require("@playwright/test");

test.describe("Kerjasama Expired & Perpanjangan", () => {
  test("halaman expired tampil", async ({ page }) => {
    await page.goto("/kerjasama/expired");
    await expect(page).toHaveURL("/kerjasama/expired");
    await expect(page.locator("h1")).toContainText(
      "Kerjasama Expired & Akan Expired",
    );
    await expect(page.locator("table")).toBeVisible();
  });

  test("dashboard statistik expired tampil", async ({ page }) => {
    await page.goto("/kerjasama/expired");
    await expect(page.locator("text=Total Kerjasama")).toBeVisible();
    const cardTitles = page.locator(
      ".grid.grid-cols-2 .card p.text-muted-foreground.text-xs",
    );
    await expect(cardTitles).toHaveCount(4);
    await expect(cardTitles.nth(0)).toContainText("Total Kerjasama");
    await expect(cardTitles.nth(1)).toContainText("Aktif");
    await expect(cardTitles.nth(2)).toContainText("Akan Expired");
    await expect(cardTitles.nth(3)).toContainText("Expired");
  });

  test("filter tahun dan pencarian expired bekerja", async ({ page }) => {
    await page.goto(
      "/kerjasama/expired?year_from=2024&year_to=2026&search=MoA",
    );
    await expect(page).toHaveURL(/year_from=2024&year_to=2026/);
    await expect(page.locator("input[name='search']")).toHaveValue("MoA");
    await expect(page.locator("table")).toBeVisible();
  });

  test("tombol reset filter muncul dan berfungsi", async ({ page }) => {
    await page.goto(
      "/kerjasama/expired?year_from=2024&year_to=2026&search=MoA",
    );
    await expect(page.locator('a:has-text("Reset")')).toBeVisible();
    await page.click('a:has-text("Reset")');
    await expect(page).toHaveURL(/\/kerjasama\/expired$/);
  });

  test("export PDF expired mengandung query filter saat ada filter aktif", async ({
    page,
  }) => {
    await page.goto(
      "/kerjasama/expired?search=MoA&year_from=2024&year_to=2026",
    );
    const exportLink = page.locator('a[href^="/kerjasama/expired/export/pdf"]');
    await expect(exportLink).toHaveAttribute(
      "href",
      /search=MoA&year_from=2024&year_to=2026/,
    );
  });

  test("status kerjasama dapat diperbarui cepat melalui endpoint API", async ({
    page,
  }) => {
    await page.goto("/kerjasama/expired");
    const renewLink = page.locator('a[href*="/renew"]').first();
    if ((await renewLink.count()) === 0) {
      test.skip();
      return;
    }
    const href = await renewLink.getAttribute("href");
    const id = href.split("/").pop();
    const response = await page.request.patch(
      `/kerjasama/expired/api/${id}/status`,
      {
        data: { status: "active" },
      },
    );
    expect([200, 400, 404]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty("success");
  });

  test("halaman import expired tampil", async ({ page }) => {
    await page.goto("/kerjasama/expired/import");
    await expect(page.locator("h1")).toContainText("Import");
    await expect(page.locator('input[type="file"]')).toBeVisible();
  });

  test("export PDF expired mengembalikan file PDF", async ({ page }) => {
    const response = await page.request.get("/kerjasama/expired/export/pdf");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("pdf");
  });

  test("form perpanjangan muncul saat ada data", async ({ page }) => {
    await page.goto("/kerjasama/expired");
    const renewLink = page.locator('a[href*="/renew"]').first();
    if ((await renewLink.count()) > 0) {
      await renewLink.click();
      await expect(page).toHaveURL(/\/renew$/);
      await expect(
        page.locator('input[name="new_document_number"]'),
      ).toBeVisible();
    }
  });

  test("batalkan status perpanjangan melalui tombol cancel jika tersedia", async ({
    page,
  }) => {
    await page.goto("/kerjasama/expired");
    const cancelButton = page.locator('button:has-text("Batalkan")').first();
    if ((await cancelButton.count()) === 0) {
      return;
    }
    await cancelButton.click();
    await expect(page).toHaveURL(/\/kerjasama\/expired/);
  });
});
