const db = require('../lib/db');

async function seed() {
  try {
    console.log('🌱 Memulai seeding data kerjasama...\n');

    // ─── 1. Insert Partners (Mitra) ─────────────────────────────────────────
    const [existingPartners] = await db.query('SELECT COUNT(*) AS total FROM partners');
    if (existingPartners[0].total > 0) {
      console.log('⏭  Tabel partners sudah ada data, skip insert partners.');
    } else {
      await db.query(`
        INSERT INTO partners (name, type, address, email, phone, description, created_at, updated_at) VALUES
        ('Universitas Gadjah Mada', 'university', 'Jl. Grafika No.2, Yogyakarta 55281', 'kerjasama@ugm.ac.id', '0274-647-XXX', 'Universitas negeri terkemuka di Indonesia', NOW(), NOW()),
        ('Institut Teknologi Bandung', 'university', 'Jl. Ganesha No.10, Bandung 40132', 'kerjasama@itb.ac.id', '022-250-XXXX', 'Institut teknologi terbaik di Indonesia', NOW(), NOW()),
        ('PT Telkom Indonesia', 'company', 'Jl. Japati No.1, Bandung 40133', 'csr@telkom.co.id', '022-452-XXXX', 'Perusahaan telekomunikasi BUMN Indonesia', NOW(), NOW()),
        ('Pemerintah Kota Bandung', 'government', 'Jl. Wastukancana No.2, Bandung 40117', 'humas@bandung.go.id', '022-420-XXXX', 'Pemerintah Daerah Kota Bandung', NOW(), NOW()),
        ('Toyota Astra Motor', 'company', 'Jl. Yos Sudarso, Jakarta Utara 14350', 'csr@toyota.astra.co.id', '021-650-XXXX', 'Perusahaan otomotif terkemuka di Indonesia', NOW(), NOW())
      `);
      console.log('✅ 5 data partners berhasil diinsert.');
    }

    // Ambil ID partners
    const [partners] = await db.query('SELECT id, name FROM partners LIMIT 5');
    if (partners.length === 0) {
      throw new Error('Tidak ada data partners ditemukan!');
    }

    // ─── 2. Insert Partnerships (Kerjasama Induk) ───────────────────────────
    const [existingPartnerships] = await db.query('SELECT COUNT(*) AS total FROM partnerships');
    if (existingPartnerships[0].total > 0) {
      console.log('⏭  Tabel partnerships sudah ada data, skip insert partnerships.');
    } else {
      const p = partners;
      await db.query(`
        INSERT INTO partnerships (partner_id, title, document_number, document_type, start_date, end_date, status, created_at, updated_at) VALUES
        (?, 'MoA Kerjasama Akademik dan Riset', 'MoA-001/2024', 'moa', '2024-01-15', '2026-01-14', 'active', NOW(), NOW()),
        (?, 'PKS Pertukaran Mahasiswa dan Dosen', 'PKS-002/2024', 'pks', '2024-03-01', '2026-02-28', 'active', NOW(), NOW()),
        (?, 'MoA Pengembangan SDM dan Magang', 'MoA-003/2023', 'moa', '2023-06-01', '2025-05-31', 'active', NOW(), NOW()),
        (?, 'PKS Tri Dharma Perguruan Tinggi', 'PKS-004/2024', 'pks', '2024-07-01', '2026-06-30', 'active', NOW(), NOW()),
        (?, 'MoA Riset Bersama Teknologi Otomotif', 'MoA-005/2024', 'moa', '2024-09-01', '2026-08-31', 'active', NOW(), NOW())
      `, [p[0].id, p[1] ? p[1].id : p[0].id, p[2] ? p[2].id : p[0].id, p[3] ? p[3].id : p[0].id, p[4] ? p[4].id : p[0].id]);
      console.log('✅ 5 data partnerships berhasil diinsert.');
    }

    // Ambil ID partnerships
    const [partnerships] = await db.query('SELECT id, title FROM partnerships LIMIT 5');
    if (partnerships.length === 0) {
      throw new Error('Tidak ada data partnerships ditemukan!');
    }

    // ─── 3. Insert Partnership Implementations (Program Implementasi) ────────
    const [existingImpl] = await db.query('SELECT COUNT(*) AS total FROM partnership_implementations');
    if (existingImpl[0].total > 0) {
      console.log('⏭  Tabel partnership_implementations sudah ada data, skip insert.');
    } else {
      const ps = partnerships;
      const p0 = ps[0].id;
      const p1 = ps[1] ? ps[1].id : p0;
      const p2 = ps[2] ? ps[2].id : p0;
      const p3 = ps[3] ? ps[3].id : p0;
      const p4 = ps[4] ? ps[4].id : p0;

      await db.query(`
        INSERT INTO partnership_implementations (partnership_id, title, description, start_date, end_date, status, created_at, updated_at) VALUES
        (?, 'Program Pertukaran Dosen 2024', 'Program kunjungan dan pengajaran dosen tamu antar institusi', '2024-02-01', '2024-12-31', 'ongoing', NOW(), NOW()),
        (?, 'Joint Research Kecerdasan Buatan', 'Riset bersama di bidang AI dan machine learning', '2024-04-01', '2025-03-31', 'ongoing', NOW(), NOW()),
        (?, 'Program Magang Industri Batch 1', 'Program magang mahasiswa di lingkungan industri telekomunikasi', '2024-06-01', '2024-08-31', 'completed', NOW(), NOW()),
        (?, 'Program Kuliah Kerja Nyata (KKN)', 'Program pengabdian masyarakat mahasiswa di wilayah pemerintah kota', '2024-07-15', '2024-09-15', 'ongoing', NOW(), NOW()),
        (?, 'Workshop Teknologi Otomotif', 'Pelatihan dan workshop teknologi kendaraan terkini', '2024-10-01', '2025-03-31', 'planned', NOW(), NOW()),
        (?, 'Seminar Nasional Bersama', 'Penyelenggaraan seminar nasional kolaborasi dua institusi', '2024-08-01', '2024-08-31', 'completed', NOW(), NOW()),
        (?, 'Pengembangan Kurikulum Berbasis Industri', 'Program penyusunan kurikulum yang relevan dengan kebutuhan industri', '2024-05-01', '2025-04-30', 'ongoing', NOW(), NOW())
      `, [p0, p1, p2, p3, p4, p0, p1]);
      console.log('✅ 7 data partnership_implementations berhasil diinsert.');
    }

    console.log('\n✅ Seeding selesai! Sekarang coba buka halaman Tambah IA.');
    console.log('   Dropdown "Kerjasama Induk" dan "Program Implementasi" seharusnya sudah terisi.\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error saat seeding:', err.message);
    console.error(err);
    process.exit(1);
  }
}

seed();
