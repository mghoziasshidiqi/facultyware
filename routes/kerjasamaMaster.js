var express = require("express");
var router = express.Router();
const ctrl = require("../controllers/kerjasamaMasterController");
const { isAuthenticated } = require("../middlewares/auth");

// Semua route memerlukan autentikasi login
router.use(isAuthenticated);

// ─── Web Routes (Halaman Antarmuka) ─────────────────────────────────────────
router.get("/", ctrl.index);                     // (Read) Tampilan daftar seluruh kerjasama
router.get("/create", ctrl.createForm);          // Halaman form tambah data baru
router.post("/create", ctrl.createStore);        // (Create) Proses simpan data baru
router.get("/update/:id", ctrl.updateForm);      // Halaman form edit data
router.post("/update/:id", ctrl.updateStore);    // (Update) Proses simpan editan
router.post("/delete/:id", ctrl.deleteData);     // (Delete) Proses hapus data (permanen/soft delete)
router.get("/import", ctrl.importPage);          // Halaman form upload Excel/CSV
router.post("/import", ...ctrl.importProcess);   // (Import) Proses unggah & parsing data
router.get("/export/pdf", ctrl.exportPdf);       // (Export) Cetak laporan PDF via pdfkit

// ─── API Routes (Format JSON) ────────────────────────────────────────────────
router.get("/api/list", ctrl.apiList);           // (API JSON) Output data mentah daftar kerjasama

module.exports = router;