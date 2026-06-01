var express = require("express");
var router = express.Router();
const ctrl = require("../controllers/kerjasamaExpiredController");
const { isAuthenticated } = require("../middlewares/auth");
// const { checkPermission } = require("../middlewares/acl"); // aktifkan setelah setup ACL

// Semua route memerlukan autentikasi
router.use(isAuthenticated);

// ─── Web Routes ──────────────────────────────────────────────────────────────
router.get("/", ctrl.index);
router.get("/export/pdf", ctrl.exportPdf);
router.get("/import", ctrl.importPage);
router.post("/import", ...ctrl.importProcess);
router.get("/:id/renew", ctrl.renewForm);
router.post("/:id/renew", ctrl.renewStore);
router.post("/:id/renew/cancel", ctrl.renewCancel);

// ─── API Routes ──────────────────────────────────────────────────────────────
router.get("/api/count", ctrl.apiExpiredCount);
router.patch("/api/:id/status", ctrl.apiUpdateStatus);

module.exports = router;
