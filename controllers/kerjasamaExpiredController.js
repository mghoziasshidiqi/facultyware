const db = require("../lib/db");
const PDFDocument = require("pdfkit");
const XLSX = require("xlsx");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ─── Multer setup untuk import CSV/Excel ────────────────────────────────────
const uploadDir = path.join(__dirname, "../uploads/kerjasama");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, `import_${Date.now()}${path.extname(file.originalname)}`),
});

const fileFilter = (req, file, cb) => {
  const allowed = [".csv", ".xlsx", ".xls"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) return cb(null, true);
  cb(new Error("Hanya file CSV atau Excel yang diizinkan"));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// ─── Helper: hitung threshold expired (dalam hari) ──────────────────────────
const EXPIRY_THRESHOLD_DAYS = 90; // tampilkan kerjasama yang akan expired dalam 90 hari

// ─── 1. Dashboard statistik & daftar kerjasama akan expired ─────────────────
const index = async (req, res, next) => {
  try {
    const search = req.query.search || "";
    const yearFrom = req.query.year_from || "";
    const yearTo = req.query.year_to || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    // Statistik dashboard
    const [[stats]] = await db.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired,
        SUM(CASE WHEN status = 'terminated' THEN 1 ELSE 0 END) AS terminated_count,
        SUM(CASE WHEN status = 'active' AND end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY) THEN 1 ELSE 0 END) AS soon_expired
      FROM partnerships
    `, [EXPIRY_THRESHOLD_DAYS]);

    // Bangun kondisi WHERE untuk daftar
    let whereClauses = [
      `(p.status = 'expired' OR (p.status = 'active' AND p.end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)))`
    ];
    let params = [EXPIRY_THRESHOLD_DAYS];

    if (search) {
      whereClauses.push(`(p.title LIKE ? OR pt.name LIKE ? OR p.document_number LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (yearFrom) {
      whereClauses.push(`YEAR(p.end_date) >= ?`);
      params.push(yearFrom);
    }
    if (yearTo) {
      whereClauses.push(`YEAR(p.end_date) <= ?`);
      params.push(yearTo);
    }

    const whereSQL = whereClauses.join(" AND ");

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM partnerships p
       JOIN partners pt ON p.partner_id = pt.id
       WHERE ${whereSQL}`,
      params
    );

    const [rows] = await db.query(
      `SELECT p.*, pt.name AS partner_name, pt.type AS partner_type,
              DATEDIFF(p.end_date, CURDATE()) AS days_remaining,
              pr.id AS renewal_id, pr.new_document_number, pr.renewed_at, pr.cancelled_at
       FROM partnerships p
       JOIN partners pt ON p.partner_id = pt.id
       LEFT JOIN partnership_renewals pr ON pr.partnership_id = p.id AND pr.cancelled_at IS NULL
       WHERE ${whereSQL}
       ORDER BY p.end_date ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const totalPages = Math.ceil(total / limit);

    res.render("kerjasama/expired/index", {
      title: "Kerjasama Expired & Akan Expired",
      partnerships: rows,
      stats,
      search,
      yearFrom,
      yearTo,
      currentPage: page,
      totalPages,
      total,
      user: req.session.username,
    });
  } catch (err) {
    next(err);
  }
};

// ─── 2. Form tambah perpanjangan ─────────────────────────────────────────────
const renewForm = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[partnership]] = await db.query(
      `SELECT p.*, pt.name AS partner_name
       FROM partnerships p
       JOIN partners pt ON p.partner_id = pt.id
       WHERE p.id = ?`,
      [id]
    );

    if (!partnership) {
      return res.status(404).render("error", {
        message: "Data kerjasama tidak ditemukan",
        error: { status: 404, stack: "" },
      });
    }

    // Cek apakah sudah ada perpanjangan aktif
    const [[existingRenewal]] = await db.query(
      `SELECT * FROM partnership_renewals WHERE partnership_id = ? AND cancelled_at IS NULL`,
      [id]
    );

    res.render("kerjasama/expired/renew", {
      title: "Perpanjangan Kerjasama",
      partnership,
      existingRenewal: existingRenewal || null,
      errors: [],
      user: req.session.username,
    });
  } catch (err) {
    next(err);
  }
};

// ─── 3. Simpan perpanjangan ───────────────────────────────────────────────────
const renewStore = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { new_document_number, new_start_date, new_end_date, notes } = req.body;

    // Validasi server-side
    const errors = [];
    if (!new_document_number || new_document_number.trim() === "") {
      errors.push("Nomor surat baru wajib diisi");
    }
    if (!new_start_date) errors.push("Tanggal mulai baru wajib diisi");
    if (!new_end_date) errors.push("Tanggal akhir baru wajib diisi");
    if (new_start_date && new_end_date && new_start_date >= new_end_date) {
      errors.push("Tanggal akhir harus setelah tanggal mulai");
    }

    if (errors.length > 0) {
      const [[partnership]] = await db.query(
        `SELECT p.*, pt.name AS partner_name FROM partnerships p JOIN partners pt ON p.partner_id = pt.id WHERE p.id = ?`,
        [id]
      );
      const [[existingRenewal]] = await db.query(
        `SELECT * FROM partnership_renewals WHERE partnership_id = ? AND cancelled_at IS NULL`,
        [id]
      );
      return res.render("kerjasama/expired/renew", {
        title: "Perpanjangan Kerjasama",
        partnership,
        existingRenewal: existingRenewal || null,
        errors,
        user: req.session.username,
      });
    }

    // Cek duplikat nomor surat
    const [[dup]] = await db.query(
      `SELECT id FROM partnership_renewals WHERE new_document_number = ? AND partnership_id != ?`,
      [new_document_number.trim(), id]
    );
    if (dup) {
      const [[partnership]] = await db.query(
        `SELECT p.*, pt.name AS partner_name FROM partnerships p JOIN partners pt ON p.partner_id = pt.id WHERE p.id = ?`,
        [id]
      );
      return res.render("kerjasama/expired/renew", {
        title: "Perpanjangan Kerjasama",
        partnership,
        existingRenewal: null,
        errors: ["Nomor surat tersebut sudah digunakan"],
        user: req.session.username,
      });
    }

    // Batalkan perpanjangan lama jika ada
    await db.query(
      `UPDATE partnership_renewals SET cancelled_at = NOW() WHERE partnership_id = ? AND cancelled_at IS NULL`,
      [id]
    );

    // Simpan perpanjangan baru
    await db.query(
      `INSERT INTO partnership_renewals (partnership_id, new_document_number, new_start_date, new_end_date, notes, renewed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
      [id, new_document_number.trim(), new_start_date, new_end_date, notes || null]
    );

    // Update status & tanggal di tabel partnerships
    await db.query(
      `UPDATE partnerships SET status = 'active', start_date = ?, end_date = ?, document_number = ?, updated_at = NOW() WHERE id = ?`,
      [new_start_date, new_end_date, new_document_number.trim(), id]
    );

    res.redirect("/kerjasama/expired?success=Perpanjangan+kerjasama+berhasil+disimpan");
  } catch (err) {
    next(err);
  }
};

// ─── 4. Batalkan perpanjangan ─────────────────────────────────────────────────
const renewCancel = async (req, res, next) => {
  try {
    const { id } = req.params; // partnership id

    const [[renewal]] = await db.query(
      `SELECT * FROM partnership_renewals WHERE partnership_id = ? AND cancelled_at IS NULL`,
      [id]
    );

    if (!renewal) {
      return res.redirect(`/kerjasama/expired?error=Tidak+ada+perpanjangan+aktif`);
    }

    // Batalkan perpanjangan
    await db.query(
      `UPDATE partnership_renewals SET cancelled_at = NOW(), updated_at = NOW() WHERE id = ?`,
      [renewal.id]
    );

    // Kembalikan data kerjasama ke sebelum perpanjangan
    await db.query(
      `UPDATE partnerships SET status = 'expired', updated_at = NOW() WHERE id = ?`,
      [id]
    );

    res.redirect("/kerjasama/expired?success=Perpanjangan+berhasil+dibatalkan");
  } catch (err) {
    next(err);
  }
};

// ─── 5. Export PDF ────────────────────────────────────────────────────────────
const exportPdf = async (req, res, next) => {
  try {
    const search = req.query.search || "";
    const yearFrom = req.query.year_from || "";
    const yearTo = req.query.year_to || "";

    let whereClauses = [
      `(p.status = 'expired' OR (p.status = 'active' AND p.end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)))`
    ];
    let params = [EXPIRY_THRESHOLD_DAYS];

    if (search) {
      whereClauses.push(`(p.title LIKE ? OR pt.name LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }
    if (yearFrom) { whereClauses.push(`YEAR(p.end_date) >= ?`); params.push(yearFrom); }
    if (yearTo) { whereClauses.push(`YEAR(p.end_date) <= ?`); params.push(yearTo); }

    const [rows] = await db.query(
      `SELECT p.title, p.document_number, p.document_type, p.start_date, p.end_date, p.status,
              pt.name AS partner_name, DATEDIFF(p.end_date, CURDATE()) AS days_remaining
       FROM partnerships p
       JOIN partners pt ON p.partner_id = pt.id
       WHERE ${whereClauses.join(" AND ")}
       ORDER BY p.end_date ASC`,
      params
    );

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="kerjasama_expired_${Date.now()}.pdf"`
    );
    doc.pipe(res);

    // Header
    doc.fontSize(16).font("Helvetica-Bold").text("Daftar Kerjasama Expired / Akan Expired", { align: "center" });
    doc.fontSize(10).font("Helvetica").text(`Dicetak: ${new Date().toLocaleDateString("id-ID")}`, { align: "center" });
    doc.moveDown();

    // Tabel header
    const colX = [40, 180, 290, 360, 430, 490];
    const headers = ["Judul", "Mitra", "No. Dokumen", "Mulai", "Akhir", "Status"];
    doc.fontSize(9).font("Helvetica-Bold");
    headers.forEach((h, i) => doc.text(h, colX[i], doc.y, { width: colX[i + 1] ? colX[i + 1] - colX[i] - 4 : 80, continued: i < headers.length - 1 }));
    doc.moveDown(0.3);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.3);

    // Baris data
    doc.font("Helvetica").fontSize(8);
    rows.forEach((row) => {
      const y = doc.y;
      if (y > 750) { doc.addPage(); }
      const cols = [
        row.title.substring(0, 22),
        row.partner_name.substring(0, 18),
        row.document_number,
        row.start_date ? new Date(row.start_date).toLocaleDateString("id-ID") : "-",
        row.end_date ? new Date(row.end_date).toLocaleDateString("id-ID") : "-",
        row.status,
      ];
      cols.forEach((c, i) =>
        doc.text(String(c), colX[i], doc.y, { width: colX[i + 1] ? colX[i + 1] - colX[i] - 4 : 80, continued: i < cols.length - 1 })
      );
      doc.moveDown(0.4);
    });

    doc.end();
  } catch (err) {
    next(err);
  }
};

// ─── 6. Import CSV/Excel ──────────────────────────────────────────────────────
const importPage = (req, res) => {
  res.render("kerjasama/expired/import", {
    title: "Import Perpanjangan Kerjasama",
    errors: [],
    user: req.session.username,
  });
};

const importProcess = [
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.render("kerjasama/expired/import", {
          title: "Import Perpanjangan Kerjasama",
          errors: ["File wajib diunggah"],
          user: req.session.username,
        });
      }

      const workbook = XLSX.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      // Hapus file sementara
      fs.unlinkSync(req.file.path);

      const errors = [];
      let successCount = 0;

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = i + 2;

        const partnershipId = row["partnership_id"] || row["ID Kerjasama"];
        const newDocNumber = row["new_document_number"] || row["Nomor Surat Baru"];
        const newStartDate = row["new_start_date"] || row["Tanggal Mulai Baru"];
        const newEndDate = row["new_end_date"] || row["Tanggal Akhir Baru"];
        const notes = row["notes"] || row["Catatan"] || null;

        if (!partnershipId || !newDocNumber || !newStartDate || !newEndDate) {
          errors.push(`Baris ${rowNum}: Data tidak lengkap (partnership_id, new_document_number, new_start_date, new_end_date wajib diisi)`);
          continue;
        }

        // Cek partnership ada
        const [[partnership]] = await db.query(`SELECT id FROM partnerships WHERE id = ?`, [partnershipId]);
        if (!partnership) {
          errors.push(`Baris ${rowNum}: Kerjasama dengan ID ${partnershipId} tidak ditemukan`);
          continue;
        }

        // Batalkan perpanjangan lama
        await db.query(
          `UPDATE partnership_renewals SET cancelled_at = NOW() WHERE partnership_id = ? AND cancelled_at IS NULL`,
          [partnershipId]
        );

        // Simpan perpanjangan baru
        await db.query(
          `INSERT INTO partnership_renewals (partnership_id, new_document_number, new_start_date, new_end_date, notes, renewed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
          [partnershipId, String(newDocNumber).trim(), newStartDate, newEndDate, notes]
        );

        // Update partnerships
        await db.query(
          `UPDATE partnerships SET status = 'active', start_date = ?, end_date = ?, document_number = ?, updated_at = NOW() WHERE id = ?`,
          [newStartDate, newEndDate, String(newDocNumber).trim(), partnershipId]
        );

        successCount++;
      }

      res.render("kerjasama/expired/import", {
        title: "Import Perpanjangan Kerjasama",
        errors,
        successCount,
        user: req.session.username,
      });
    } catch (err) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      next(err);
    }
  },
];

// ─── 7. API: jumlah kerjasama akan expired ────────────────────────────────────
const apiExpiredCount = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || EXPIRY_THRESHOLD_DAYS;

    const [[result]] = await db.query(
      `SELECT
        SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired_count,
        SUM(CASE WHEN status = 'active' AND end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY) THEN 1 ELSE 0 END) AS soon_expired_count,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count
       FROM partnerships`,
      [days]
    );

    res.json({
      success: true,
      data: {
        expired: result.expired_count || 0,
        soon_expired: result.soon_expired_count || 0,
        active: result.active_count || 0,
        threshold_days: days,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── 8. API: update status kerjasama ─────────────────────────────────────────
const apiUpdateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ["active", "expired", "terminated"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: "Status tidak valid. Gunakan: active, expired, terminated" });
    }

    const [[partnership]] = await db.query(`SELECT id FROM partnerships WHERE id = ?`, [id]);
    if (!partnership) {
      return res.status(404).json({ success: false, message: "Kerjasama tidak ditemukan" });
    }

    await db.query(`UPDATE partnerships SET status = ?, updated_at = NOW() WHERE id = ?`, [status, id]);

    res.json({ success: true, message: `Status kerjasama berhasil diubah menjadi '${status}'`, data: { id, status } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  index,
  renewForm,
  renewStore,
  renewCancel,
  exportPdf,
  importPage,
  importProcess,
  apiExpiredCount,
  apiUpdateStatus,
};
