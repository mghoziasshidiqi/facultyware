var express = require("express");
var router = express.Router();
const ctrl = require("../controllers/kerjasamaIAController");
const { isAuthenticated } = require("../middlewares/auth");

// Semua route memerlukan autentikasi login
router.use(isAuthenticated);

// ─── Web Routes ──────────────────────────────────────────────────────────────
router.get("/", ctrl.index);                          // Daftar IA (search + filter mitra)
router.get("/create", ctrl.createForm);               // Form tambah IA
router.post("/create", ...ctrl.createStore);          // Simpan IA baru
router.get("/update/:id", ctrl.updateForm);           // Form edit IA
router.post("/update/:id", ...ctrl.updateStore);      // Simpan perubahan IA
router.post("/delete/:id", ctrl.deleteIA);            // Hapus data IA
router.get("/download/:id", ctrl.downloadDoc);        // Download lampiran PDF
router.get("/import", ctrl.importPage);               // Halaman import
router.post("/import", ...ctrl.importProcess);        // Proses import CSV/Excel
router.get("/export/pdf", ctrl.exportPdf);            // Export PDF

// ─── API Routes ──────────────────────────────────────────────────────────────
router.get("/api/:id", ctrl.apiDetail);               // Detail IA dalam JSON
router.post("/api/:id/upload", ...ctrl.apiUploadDoc); // Upload dokumen via API

module.exports = router;
