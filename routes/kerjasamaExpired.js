var express = require("express");
var router = express.Router();
const ctrl = require("../controllers/kerjasamaExpiredController");
const { isAuthenticated } = require("../middlewares/auth");

// Semua route memerlukan autentikasi login
router.use(isAuthenticated);

// ─── Web Routes (Halaman Antarmuka) ─────────────────────────────────────────
router.get("/", ctrl.index);                     // Tampilan tabel & statistik utama
router.get("/import", ctrl.importPage);           // Halaman form upload Excel/CSV
router.post("/import", ...ctrl.importProcess);    // Proses unggah & parsing library xlsx
router.get("/export/pdf", ctrl.exportPdf);       // Cetak laporan PDF via pdfkit
router.get("/:id/renew", ctrl.renewForm);         // Form perpanjangan manual
router.post("/:id/renew", ctrl.renewStore);       // Simpan data perpanjangan
router.post("/:id/renew/cancel", ctrl.renewCancel); // Batalkan perpanjangan (Soft Delete)

// ─── API Routes (Format JSON) ────────────────────────────────────────────────
router.get("/api/count", ctrl.apiExpiredCount);   // Endpoint data statistik JSON
router.patch("/api/:id/status", ctrl.apiUpdateStatus); // Update status cepat via API

module.exports = router;