const db = require("../lib/db");
const PDFDocument = require("pdfkit");
const XLSX = require("xlsx");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ─── Multer: upload dokumen lampiran IA ──────────────────────────────────────
const docUploadDir = path.join(__dirname, "../uploads/ia_documents");
if (!fs.existsSync(docUploadDir)) fs.mkdirSync(docUploadDir, { recursive: true });

const importUploadDir = path.join(__dirname, "../uploads/ia_import");
if (!fs.existsSync(importUploadDir)) fs.mkdirSync(importUploadDir, { recursive: true });

// Storage untuk dokumen lampiran (PDF)
const docStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, docUploadDir),
  filename: (req, file, cb) =>
    cb(null, `ia_doc_${Date.now()}${path.extname(file.originalname)}`),
});
const docFileFilter = (req, file, cb) => {
  const allowed = [".pdf", ".doc", ".docx"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) return cb(null, true);
  cb(new Error("Hanya file PDF atau Word yang diizinkan untuk lampiran"));
};
const uploadDoc = multer({
  storage: docStorage,
  fileFilter: docFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Storage untuk import CSV/Excel
const importStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, importUploadDir),
  filename: (req, file, cb) =>
    cb(null, `import_ia_${Date.now()}${path.extname(file.originalname)}`),
});
const importFileFilter = (req, file, cb) => {
  const allowed = [".csv", ".xlsx", ".xls"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) return cb(null, true);
  cb(new Error("Hanya file CSV atau Excel yang diizinkan"));
};
const uploadImport = multer({
  storage: importStorage,
  fileFilter: importFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ─── 1. Index: Daftar IA dengan search & filter mitra ────────────────────────
const index = async (req, res, next) => {
  try {
    const search = req.query.search || "";
    const partnerFilter = req.query.partner_id || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    let whereClauses = ["1=1"];
    let params = [];

    if (search) {
      whereClauses.push(`(ia.title LIKE ? OR ia.description LIKE ? OR ia.document_number LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (partnerFilter) {
      whereClauses.push(`p.partner_id = ?`);
      params.push(partnerFilter);
    }

    const whereSQL = whereClauses.join(" AND ");

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM implementation_arrangements ia
       JOIN partnerships p ON ia.partnership_id = p.id
       JOIN partners pt ON p.partner_id = pt.id
       WHERE ${whereSQL}`,
      params
    );

    const [rows] = await db.query(
      `SELECT ia.id, ia.title, ia.description, ia.document_number, ia.document_file,
              ia.start_date, ia.end_date, ia.created_at,
              p.title AS partnership_title, p.partner_id,
              pt.name AS partner_name
       FROM implementation_arrangements ia
       JOIN partnerships p ON ia.partnership_id = p.id
       JOIN partners pt ON p.partner_id = pt.id
       WHERE ${whereSQL}
       ORDER BY ia.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [partners] = await db.query(
      `SELECT DISTINCT pt.id, pt.name
       FROM partners pt
       JOIN partnerships p ON p.partner_id = pt.id
       JOIN implementation_arrangements ia ON ia.partnership_id = p.id
       ORDER BY pt.name ASC`
    );

    const totalPages = Math.ceil(total / limit);

    res.render("kerjasama/ia/index", {
      title: "Implementation Arrangement (IA)",
      iaList: rows,
      partners,
      search,
      partnerFilter,
      currentPage: page,
      totalPages,
      total,
      user: req.session.username,
    });
  } catch (err) {
    next(err);
  }
};

// ─── 2. Form tambah IA ────────────────────────────────────────────────────────
const createForm = async (req, res, next) => {
  try {
    const [partnerships] = await db.query(
      `SELECT p.id, p.title, pt.name AS partner_name
       FROM partnerships p
       JOIN partners pt ON p.partner_id = pt.id
       WHERE p.status = 'active'
       ORDER BY p.title ASC`
    );
    const [implList] = await db.query(
      `SELECT pi.id, pi.partnership_id, pi.title, p.title AS partnership_title
       FROM partnership_implementations pi
       JOIN partnerships p ON pi.partnership_id = p.id
       ORDER BY pi.title ASC`
    );
    res.render("kerjasama/ia/form", {
      title: "Tambah Implementation Arrangement",
      ia: null,
      partnerships,
      implList,
      errors: [],
      user: req.session.username,
    });
  } catch (err) {
    next(err);
  }
};

// ─── 3. Simpan IA baru ────────────────────────────────────────────────────────
const createStore = [
  uploadDoc.single("document_file"),
  async (req, res, next) => {
    try {
      const { partnership_id, partnership_impl_id, title, description, document_number, start_date, end_date } = req.body;

      // Validasi server-side
      const errors = [];
      if (!partnership_id) errors.push("Kerjasama induk wajib dipilih");
      if (!partnership_impl_id) errors.push("Program implementasi wajib dipilih");
      if (!title || title.trim() === "") errors.push("Judul kegiatan wajib diisi");
      if (!start_date) errors.push("Tanggal mulai wajib diisi");
      if (start_date && end_date && start_date > end_date) errors.push("Tanggal akhir harus setelah tanggal mulai");

      if (errors.length > 0) {
        if (req.file) fs.unlinkSync(req.file.path);
        const [partnerships] = await db.query(
          `SELECT p.id, p.title, pt.name AS partner_name FROM partnerships p JOIN partners pt ON p.partner_id = pt.id WHERE p.status = 'active' ORDER BY p.title ASC`
        );
        const [implList] = await db.query(
          `SELECT pi.id, pi.partnership_id, pi.title, p.title AS partnership_title FROM partnership_implementations pi JOIN partnerships p ON pi.partnership_id = p.id ORDER BY pi.title ASC`
        );
        return res.render("kerjasama/ia/form", {
          title: "Tambah Implementation Arrangement",
          ia: req.body,
          partnerships,
          implList,
          errors,
          user: req.session.username,
        });
      }

      const documentFile = req.file ? req.file.filename : null;

      await db.query(
        `INSERT INTO implementation_arrangements 
         (partnership_id, partnership_impl_id, title, description, document_number, document_file, start_date, end_date, partnership_implementation_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          partnership_id,
          partnership_impl_id,
          title.trim(),
          description || null,
          document_number ? document_number.trim() : null,
          documentFile,
          start_date,
          end_date || null,
          partnership_impl_id, // partnership_implementation_id = sama dengan partnership_impl_id
        ]
      );

      res.redirect("/kerjasama/ia?success=Data+IA+berhasil+ditambahkan");
    } catch (err) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      next(err);
    }
  },
];

// ─── 4. Form update deskripsi IA ─────────────────────────────────────────────
const updateForm = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[ia]] = await db.query(
      `SELECT ia.*, p.title AS partnership_title, pt.name AS partner_name
       FROM implementation_arrangements ia
       JOIN partnerships p ON ia.partnership_id = p.id
       JOIN partners pt ON p.partner_id = pt.id
       WHERE ia.id = ?`,
      [id]
    );

    if (!ia) return res.redirect("/kerjasama/ia?error=Data+tidak+ditemukan");

    const [partnerships] = await db.query(
      `SELECT p.id, p.title, pt.name AS partner_name FROM partnerships p JOIN partners pt ON p.partner_id = pt.id WHERE p.status = 'active' ORDER BY p.title ASC`
    );
    const [implList] = await db.query(
      `SELECT pi.id, pi.partnership_id, pi.title, p.title AS partnership_title FROM partnership_implementations pi JOIN partnerships p ON pi.partnership_id = p.id ORDER BY pi.title ASC`
    );

    res.render("kerjasama/ia/form", {
      title: "Edit Implementation Arrangement",
      ia,
      partnerships,
      implList,
      errors: [],
      user: req.session.username,
    });
  } catch (err) {
    next(err);
  }
};

// ─── 5. Simpan update IA ─────────────────────────────────────────────────────
const updateStore = [
  uploadDoc.single("document_file"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { partnership_id, partnership_impl_id, title, description, document_number, start_date, end_date } = req.body;

      const errors = [];
      if (!partnership_id) errors.push("Kerjasama induk wajib dipilih");
      if (!partnership_impl_id) errors.push("Program implementasi wajib dipilih");
      if (!title || title.trim() === "") errors.push("Judul kegiatan wajib diisi");
      if (!start_date) errors.push("Tanggal mulai wajib diisi");
      if (start_date && end_date && start_date > end_date) errors.push("Tanggal akhir harus setelah tanggal mulai");

      if (errors.length > 0) {
        if (req.file) fs.unlinkSync(req.file.path);
        const [[ia]] = await db.query(`SELECT * FROM implementation_arrangements WHERE id = ?`, [id]);
        const [partnerships] = await db.query(
          `SELECT p.id, p.title, pt.name AS partner_name FROM partnerships p JOIN partners pt ON p.partner_id = pt.id WHERE p.status = 'active' ORDER BY p.title ASC`
        );
        const [implList] = await db.query(
          `SELECT pi.id, pi.partnership_id, pi.title, p.title AS partnership_title FROM partnership_implementations pi JOIN partnerships p ON pi.partnership_id = p.id ORDER BY pi.title ASC`
        );
        return res.render("kerjasama/ia/form", {
          title: "Edit Implementation Arrangement",
          ia: { ...ia, ...req.body },
          partnerships,
          implList,
          errors,
          user: req.session.username,
        });
      }

      // Cek apakah ada file baru
      let documentFile = null;
      if (req.file) {
        // Hapus file lama kalau ada
        const [[oldIa]] = await db.query(`SELECT document_file FROM implementation_arrangements WHERE id = ?`, [id]);
        if (oldIa && oldIa.document_file) {
          const oldPath = path.join(docUploadDir, oldIa.document_file);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        documentFile = req.file.filename;
      }

      const updateQuery = documentFile
        ? `UPDATE implementation_arrangements SET partnership_id=?, partnership_impl_id=?, title=?, description=?, document_number=?, document_file=?, start_date=?, end_date=?, partnership_implementation_id=?, updated_at=NOW() WHERE id=?`
        : `UPDATE implementation_arrangements SET partnership_id=?, partnership_impl_id=?, title=?, description=?, document_number=?, start_date=?, end_date=?, partnership_implementation_id=?, updated_at=NOW() WHERE id=?`;

      const updateParams = documentFile
        ? [partnership_id, partnership_impl_id, title.trim(), description || null, document_number ? document_number.trim() : null, documentFile, start_date, end_date || null, partnership_impl_id, id]
        : [partnership_id, partnership_impl_id, title.trim(), description || null, document_number ? document_number.trim() : null, start_date, end_date || null, partnership_impl_id, id];

      await db.query(updateQuery, updateParams);

      res.redirect("/kerjasama/ia?success=Data+IA+berhasil+diperbarui");
    } catch (err) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      next(err);
    }
  },
];

// ─── 6. Download dokumen lampiran ────────────────────────────────────────────
const downloadDoc = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[ia]] = await db.query(
      `SELECT document_file, title FROM implementation_arrangements WHERE id = ?`,
      [id]
    );

    if (!ia || !ia.document_file) {
      return res.status(404).render("error", {
        message: "Dokumen lampiran tidak ditemukan",
        error: { status: 404, stack: "" },
      });
    }

    const filePath = path.join(docUploadDir, ia.document_file);
    if (!fs.existsSync(filePath)) {
      return res.status(404).render("error", {
        message: "File tidak ditemukan di server",
        error: { status: 404, stack: "" },
      });
    }

    const ext = path.extname(ia.document_file);
    const downloadName = `IA_${ia.title.replace(/[^a-zA-Z0-9]/g, "_")}${ext}`;
    res.download(filePath, downloadName);
  } catch (err) {
    next(err);
  }
};

// ─── 7. Export PDF ─────────────────────────────────────────────────────────
const exportPdf = async (req, res, next) => {
  try {
    const search = req.query.search || "";
    const partnerFilter = req.query.partner_id || "";

    let whereClauses = ["1=1"];
    let params = [];

    if (search) {
      whereClauses.push(`(ia.title LIKE ? OR ia.document_number LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }
    if (partnerFilter) {
      whereClauses.push(`p.partner_id = ?`);
      params.push(partnerFilter);
    }

    const [rows] = await db.query(
      `SELECT ia.title, ia.document_number, ia.description, ia.start_date, ia.end_date, ia.document_file,
              p.title AS partnership_title, pt.name AS partner_name
       FROM implementation_arrangements ia
       JOIN partnerships p ON ia.partnership_id = p.id
       JOIN partners pt ON p.partner_id = pt.id
       WHERE ${whereClauses.join(" AND ")}
       ORDER BY ia.created_at DESC`,
      params
    );

    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="IA_Export_${Date.now()}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(16).font("Helvetica-Bold").text("Data Implementation Arrangement (IA)", { align: "center" });
    doc.fontSize(10).font("Helvetica").text(`Dicetak: ${new Date().toLocaleDateString("id-ID")}`, { align: "center" });
    doc.moveDown(1.5);

    // Tabel header
    const colX = [40, 210, 350, 460, 560, 650];
    const colW = [165, 135, 105, 95, 85, 100];
    const headers = ["Judul Kegiatan", "Kerjasama Induk", "No. Dokumen", "Tgl Mulai", "Tgl Akhir", "Mitra"];

    let y = doc.y;
    doc.fontSize(9).font("Helvetica-Bold");
    headers.forEach((h, i) => doc.text(h, colX[i], y, { width: colW[i] }));
    doc.moveDown(0.4);
    const lineY = doc.y;
    doc.moveTo(40, lineY).lineTo(760, lineY).stroke();
    doc.moveDown(0.4);

    doc.font("Helvetica").fontSize(8);
    let currentY = doc.y;

    rows.forEach((row) => {
      if (currentY > 500) { doc.addPage(); currentY = 50; }
      const tglMulai = row.start_date ? new Date(row.start_date).toLocaleDateString("id-ID") : "-";
      const tglAkhir = row.end_date ? new Date(row.end_date).toLocaleDateString("id-ID") : "-";

      const h0 = doc.heightOfString(row.title || "-", { width: colW[0] });
      const h1 = doc.heightOfString(row.partnership_title || "-", { width: colW[1] });
      const rowH = Math.max(h0, h1, 16);

      doc.text(row.title || "-", colX[0], currentY, { width: colW[0] });
      doc.text(row.partnership_title || "-", colX[1], currentY, { width: colW[1] });
      doc.text(row.document_number || "-", colX[2], currentY, { width: colW[2] });
      doc.text(tglMulai, colX[3], currentY, { width: colW[3] });
      doc.text(tglAkhir, colX[4], currentY, { width: colW[4] });
      doc.text(row.partner_name || "-", colX[5], currentY, { width: colW[5] });

      currentY += rowH + 8;
    });

    doc.end();
  } catch (err) {
    next(err);
  }
};

// ─── 8. Halaman Import ────────────────────────────────────────────────────────
const importPage = (req, res) => {
  res.render("kerjasama/ia/import", {
    title: "Import Data IA",
    errors: [],
    user: req.session.username,
  });
};

// ─── 9. Proses Import CSV/Excel ───────────────────────────────────────────────
const importProcess = [
  uploadImport.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.render("kerjasama/ia/import", {
          title: "Import Data IA",
          errors: ["File wajib diunggah"],
          user: req.session.username,
        });
      }

      const workbook = XLSX.readFile(req.file.path, { cellDates: true, dateNF: "yyyy-mm-dd" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      fs.unlinkSync(req.file.path);

      const errors = [];
      let successCount = 0;

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = i + 2;

        const partnershipId = row["partnership_id"];
        const partnershipImplId = row["partnership_impl_id"];
        const title = row["title"];
        const description = row["description"] || null;
        const documentNumber = row["document_number"] || null;
        let startDate = row["start_date"];
        let endDate = row["end_date"] || null;

        if (!partnershipId || !partnershipImplId || !title || !startDate) {
          errors.push(`Baris ${rowNum}: Kolom partnership_id, partnership_impl_id, title, start_date wajib diisi`);
          continue;
        }

        // Normalisasi tanggal Excel serial
        const normalizeDate = (d) => {
          if (typeof d === "number") return new Date((d - 25569) * 86400 * 1000).toISOString().split("T")[0];
          if (d instanceof Date) return d.toISOString().split("T")[0];
          return String(d).trim();
        };
        startDate = normalizeDate(startDate);
        if (endDate) endDate = normalizeDate(endDate);

        // Validasi referensi
        const [[partnership]] = await db.query(`SELECT id FROM partnerships WHERE id = ?`, [partnershipId]);
        if (!partnership) {
          errors.push(`Baris ${rowNum}: Kerjasama dengan ID ${partnershipId} tidak ditemukan`);
          continue;
        }

        const [[impl]] = await db.query(`SELECT id FROM partnership_implementations WHERE id = ?`, [partnershipImplId]);
        if (!impl) {
          errors.push(`Baris ${rowNum}: Program implementasi dengan ID ${partnershipImplId} tidak ditemukan`);
          continue;
        }

        await db.query(
          `INSERT INTO implementation_arrangements 
           (partnership_id, partnership_impl_id, title, description, document_number, start_date, end_date, partnership_implementation_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [partnershipId, partnershipImplId, String(title).trim(), description, documentNumber, startDate, endDate || null, partnershipImplId]
        );
        successCount++;
      }

      res.render("kerjasama/ia/import", {
        title: "Import Data IA",
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

// ─── API: Detail IA dalam JSON ────────────────────────────────────────────────
const apiDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[ia]] = await db.query(
      `SELECT ia.id, ia.title, ia.description, ia.document_number, ia.document_file,
              ia.start_date, ia.end_date, ia.created_at, ia.updated_at,
              p.id AS partnership_id, p.title AS partnership_title,
              pt.id AS partner_id, pt.name AS partner_name,
              pi.id AS impl_id, pi.title AS impl_title, pi.status AS impl_status
       FROM implementation_arrangements ia
       JOIN partnerships p ON ia.partnership_id = p.id
       JOIN partners pt ON p.partner_id = pt.id
       JOIN partnership_implementations pi ON ia.partnership_impl_id = pi.id
       WHERE ia.id = ?`,
      [id]
    );

    if (!ia) {
      return res.status(404).json({ success: false, message: "Data IA tidak ditemukan" });
    }

    res.json({ success: true, data: ia });
  } catch (err) {
    next(err);
  }
};

// ─── API: Upload dokumen IA via endpoint ──────────────────────────────────────
const apiUploadDoc = [
  uploadDoc.single("document_file"),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!req.file) {
        return res.status(400).json({ success: false, message: "File dokumen wajib diunggah" });
      }

      const [[ia]] = await db.query(`SELECT id, document_file FROM implementation_arrangements WHERE id = ?`, [id]);
      if (!ia) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ success: false, message: "Data IA tidak ditemukan" });
      }

      // Hapus file lama
      if (ia.document_file) {
        const oldPath = path.join(docUploadDir, ia.document_file);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      await db.query(
        `UPDATE implementation_arrangements SET document_file = ?, updated_at = NOW() WHERE id = ?`,
        [req.file.filename, id]
      );

      res.json({
        success: true,
        message: "Dokumen berhasil diunggah",
        data: { id, filename: req.file.filename },
      });
    } catch (err) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      next(err);
    }
  },
];

module.exports = {
  index,
  createForm,
  createStore,
  updateForm,
  updateStore,
  downloadDoc,
  exportPdf,
  importPage,
  importProcess,
  apiDetail,
  apiUploadDoc,
};
