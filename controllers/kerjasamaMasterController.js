const db = require("../lib/db");
const PDFDocument = require("pdfkit");
const XLSX = require("xlsx");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ─── Multer setup untuk import CSV/Excel ────────────────────────────────────
const uploadDir = path.join(__dirname, "../uploads/kerjasama_master");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, `import_master_${Date.now()}${path.extname(file.originalname)}`),
});

const fileFilter = (req, file, cb) => {
  const allowed = [".csv", ".xlsx", ".xls"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) return cb(null, true);
  cb(new Error("Hanya file CSV atau Excel yang diizinkan"));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// ─── 1. Read (Tampilkan Daftar Kerjasama) ───────────────────────────────────
const index = async (req, res, next) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    let whereSQL = "1=1";
    let params = [];

    if (search) {
      whereSQL += ` AND (p.title LIKE ? OR pt.name LIKE ? OR p.document_number LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM partnerships p JOIN partners pt ON p.partner_id = pt.id WHERE ${whereSQL}`,
      params
    );

    const [rows] = await db.query(
      `SELECT p.id, p.partner_id, p.title, p.document_number, p.document_type, p.start_date, p.end_date, p.created_at, p.updated_at, pt.name AS partner_name,
              CASE 
                WHEN p.status = 'terminated' THEN 'terminated'
                WHEN NOW() > p.end_date THEN 'expired'
                ELSE 'active'
              END AS status
       FROM partnerships p 
       JOIN partners pt ON p.partner_id = pt.id 
       WHERE ${whereSQL} 
       ORDER BY p.created_at DESC 
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const totalPages = Math.ceil(total / limit);

    res.render("kerjasama/master/index", {
      title: "Data Master Kerjasama",
      partnerships: rows,
      search,
      currentPage: page,
      totalPages,
      total,
      user: req.session.username,
    });
  } catch (err) {
    next(err);
  }
};

// ─── 2. Create (Form & Proses Simpan) ───────────────────────────────────────
const createForm = async (req, res, next) => {
  try {
    const [partners] = await db.query(`SELECT id, name FROM partners ORDER BY name ASC`);
    res.render("kerjasama/master/form", {
      title: "Tambah Kerjasama Baru",
      partnership: null,
      partners,
      errors: [],
      user: req.session.username,
    });
  } catch (err) {
    next(err);
  }
};

const createStore = async (req, res, next) => {
  try {
    let { partner_id, title, document_number, document_type, start_date, end_date, status } = req.body;

    document_type = document_type ? document_type.trim().toLowerCase() : 'mou';

    await db.query(
      `INSERT INTO partnerships (partner_id, title, document_number, document_type, start_date, end_date, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [partner_id, title, document_number.trim(), document_type, start_date, end_date, status || 'active']
    );

    res.redirect("/kerjasama/master?success=Data+berhasil+ditambahkan");
  } catch (err) {
    next(err);
  }
};

// ─── 3. Update (Form & Proses Edit) ─────────────────────────────────────────
const updateForm = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[partnership]] = await db.query(`SELECT * FROM partnerships WHERE id = ?`, [id]);
    const [partners] = await db.query(`SELECT id, name FROM partners ORDER BY name ASC`);

    if (!partnership) return res.redirect("/kerjasama/master?error=Data+tidak+ditemukan");

    res.render("kerjasama/master/form", {
      title: "Edit Kerjasama",
      partnership,
      partners,
      errors: [],
      user: req.session.username,
    });
  } catch (err) {
    next(err);
  }
};

const updateStore = async (req, res, next) => {
  try {
    const { id } = req.params;
    let { partner_id, title, document_number, document_type, start_date, end_date, status } = req.body;

    document_type = document_type ? document_type.trim().toLowerCase() : 'mou';

    await db.query(
      `UPDATE partnerships 
       SET partner_id=?, title=?, document_number=?, document_type=?, start_date=?, end_date=?, status=?, updated_at=NOW() 
       WHERE id=?`,
      [partner_id, title, document_number.trim(), document_type, start_date, end_date, status, id]
    );

    res.redirect("/kerjasama/master?success=Data+berhasil+diperbarui");
  } catch (err) {
    next(err);
  }
};

// ─── 4. Delete (Hapus Data) ─────────────────────────────────────────────────
const deleteData = async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM partnerships WHERE id = ?`, [id]);
    res.redirect("/kerjasama/master?success=Data+berhasil+dihapus");
  } catch (err) {
    next(err);
  }
};

// ─── 5. Export PDF (Menggunakan Tata Letak Landscape & Rapih) ────────────────
const exportPdf = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT p.title, p.document_number, p.start_date, p.end_date, pt.name AS partner_name,
              CASE 
                WHEN p.status = 'terminated' THEN 'terminated'
                WHEN NOW() > p.end_date THEN 'expired'
                ELSE 'active'
              END AS status
       FROM partnerships p 
       JOIN partners pt ON p.partner_id = pt.id 
       ORDER BY p.created_at DESC`
    );

    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Data_Master_Kerjasama_${Date.now()}.pdf"`);
    doc.pipe(res);

    doc.fontSize(16).font("Helvetica-Bold").text("Data Master Kerjasama", { align: "center" });
    doc.fontSize(10).font("Helvetica").text(`Dicetak: ${new Date().toLocaleDateString("id-ID")}`, { align: "center" });
    doc.moveDown(1.5);

    const tableTop = doc.y;
    const colX = [40, 240, 410, 560, 630, 700];
    const colWidths = [190, 160, 140, 65, 65, 60];
    const headers = ["Judul Kerjasama", "Mitra", "No. Dokumen", "Mulai", "Akhir", "Status"];
    
    doc.fontSize(10).font("Helvetica-Bold");
    headers.forEach((h, i) => {
      doc.text(h, colX[i], tableTop, { width: colWidths[i], align: "left" });
    });
    
    doc.moveDown(0.5);
    const lineY = doc.y;
    doc.moveTo(40, lineY).lineTo(760, lineY).stroke();
    doc.moveDown(0.5);

    doc.font("Helvetica").fontSize(9);
    let currentY = doc.y;

    rows.forEach((row) => {
      if (currentY > 500) {
        doc.addPage();
        currentY = 50;
      }

      const tglMulai = row.start_date ? new Date(row.start_date).toLocaleDateString("id-ID") : "-";
      const tglAkhir = row.end_date ? new Date(row.end_date).toLocaleDateString("id-ID") : "-";
      let statusTxt = String(row.status).toUpperCase();

      const titleHeight = doc.heightOfString(row.title || "-", { width: colWidths[0] });
      const partnerHeight = doc.heightOfString(row.partner_name || "-", { width: colWidths[1] });
      const docHeight = doc.heightOfString(row.document_number || "-", { width: colWidths[2] });
      const rowHeight = Math.max(titleHeight, partnerHeight, docHeight, 20);

      doc.text(row.title || "-", colX[0], currentY, { width: colWidths[0] });
      doc.text(row.partner_name || "-", colX[1], currentY, { width: colWidths[1] });
      doc.text(row.document_number || "-", colX[2], currentY, { width: colWidths[2] });
      doc.text(tglMulai, colX[3], currentY, { width: colWidths[3] });
      doc.text(tglAkhir, colX[4], currentY, { width: colWidths[4] });
      doc.text(statusTxt, colX[5], currentY, { width: colWidths[5] });

      currentY += rowHeight + 8;
    });

    doc.end();
  } catch (err) {
    next(err);
  }
};

// ─── 6. Import Excel/CSV (Insert Data Baru) ─────────────────────────────────
const importPage = (req, res) => {
  res.render("kerjasama/master/import", {
    title: "Import Master Kerjasama",
    errors: [],
    user: req.session.username,
  });
};

const importProcess = [
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.render("kerjasama/master/import", { title: "Import Master Kerjasama", errors: ["File wajib diunggah"], user: req.session.username });
      }

      // Perbaikan pembacaan workbook: Pastikan file dibaca dari jalur path multermbukan string teks kosong
      let workbook;
      if (req.file.buffer) {
        workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true, dateNF: 'yyyy-mm-dd' });
      } else if (req.file.path && fs.existsSync(req.file.path)) {
        workbook = XLSX.readFile(req.file.path, { cellDates: true, dateNF: 'yyyy-mm-dd' });
      } else {
        throw new Error("Gagal memproses file input fisik.");
      }

      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

      const errors = [];
      let successCount = 0;

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = i + 2;

        const partnerId = row["partner_id"];
        const title = row["title"];
        const docNumber = row["document_number"];
        let docType = row["document_type"] ? String(row["document_type"]).trim().toLowerCase() : "mou";
        let startDate = row["start_date"];
        let endDate = row["end_date"];
        const status = row["status"] || "active";

        if (!partnerId || !title || !docNumber || !startDate || !endDate) {
          errors.push(`Baris ${rowNum}: Data tidak lengkap (partner_id, title, document_number, start_date, end_date wajib).`);
          continue;
        }

        if (typeof startDate === 'number') {
          startDate = new Date((startDate - 25569) * 86400 * 1000).toISOString().split('T')[0];
        } else if (startDate instanceof Date) {
          startDate = startDate.toISOString().split('T')[0];
        }

        if (typeof endDate === 'number') {
          endDate = new Date((endDate - 25569) * 86400 * 1000).toISOString().split('T')[0];
        } else if (endDate instanceof Date) {
          endDate = endDate.toISOString().split('T')[0];
        }

        await db.query(
          `INSERT INTO partnerships (partner_id, title, document_number, document_type, start_date, end_date, status, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [partnerId, title, String(docNumber).trim(), docType, startDate, endDate, status]
        );
        successCount++;
      }

      res.render("kerjasama/master/import", { title: "Import Master Kerjasama", errors, successCount, user: req.session.username });
    } catch (err) {
      if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      next(err);
    }
  },
];

// ─── 7. API: Output JSON ────────────────────────────────────────────────────
const apiList = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT p.id, p.title, p.document_number, p.start_date, p.end_date, pt.name AS partner_name,
              CASE 
                WHEN p.status = 'terminated' THEN 'terminated'
                WHEN NOW() > p.end_date THEN 'expired'
                ELSE 'active'
              END AS status
       FROM partnerships p 
       JOIN partners pt ON p.partner_id = pt.id 
       ORDER BY p.created_at DESC`
    );
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  index,
  createForm,
  createStore,
  updateForm,
  updateStore,
  deleteData,
  exportPdf,
  importPage,
  importProcess,
  apiList,
};