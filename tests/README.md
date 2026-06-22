# Testing — Facultyware (Playwright)

## Setup sebelum menjalankan test

1. **Database & seed data**
   Pastikan MySQL/MariaDB sudah jalan dan schema `facultyware.sql` sudah diimport.
   Lalu jalankan seed agar dropdown kerjasama & implementasi terisi:
   ```bash
   node scripts/seed_kerjasama.js
   ```

2. **Jalankan aplikasi**
   ```bash
   npm start
   # atau: npm run dev
   ```
   Aplikasi harus tersedia di `http://localhost:3000` sebelum test dijalankan
   (Playwright **tidak** auto-start server — `webServer` belum dikonfigurasi
   di `playwright.config.js`).

3. **Kredensial login admin**
   Username: `admin`
   Password: `admin123`
   (Bukan `password` — sempat salah ditulis di beberapa test sebelumnya.)

## Menjalankan test

```bash
npm test              # semua test, headless
npm run test:ui       # mode UI interaktif
npm run test:report   # lihat report HTML run terakhir
```

## Ringkasan perbaikan yang sudah dilakukan

| File | Masalah | Perbaikan |
|---|---|---|
| `global-setup.js`, `01-auth.spec.js` | Password admin yang dipakai di test (`password`) tidak cocok dengan hash di database. Password sebenarnya `admin123`. | Disesuaikan ke `admin123`. |
| `playwright.config.js` | Project `auth-setup` diset `storageState: undefined` agar tanpa session — tapi Playwright men-skip nilai `undefined` saat merge config, jadi tetap fallback ke `storageState` milik top-level `use` (session admin tersimpan). Akibatnya semua test auth (termasuk test "redirect ke login jika belum login") berjalan dalam keadaan **sudah login**. | Diganti jadi `storageState: { cookies: [], origins: [] }` — objek kosong yang benar-benar mengosongkan session, bukan `undefined`. |
| `02-kerjasama-master.spec.js`, `03-kerjasama-ia.spec.js`, `04-kerjasama-expired.spec.js` | Test export PDF memakai kombinasi `page.waitForEvent('download')` + `page.goto()` + fallback `page.evaluate(fetch(...))` dengan URL relatif — rapuh dan gagal dengan `Failed to parse URL`. | Disederhanakan memakai `page.request.get(url)` (APIRequestContext bawaan Playwright), otomatis ikut cookie session, langsung cek `status()` dan `content-type`. |
| `03-kerjasama-ia.spec.js` | Form "Tambah IA" memfilter opsi `partnership_impl_id` lewat JS sesuai `partnership_id` yang dipilih. Test memilih opsi impl dengan `{ index: 1 }` (index DOM statis), padahal setelah filter jalan, index itu bisa jatuh ke opsi yang **disabled** → `selectOption` timeout menunggu opsi "enabled". | Diganti ambil `value` dari opsi pertama yang **tidak disabled** (`option:not([disabled]):not([value=""])`), baru pilih berdasarkan value tersebut. |
| `03-kerjasama-ia.spec.js` | `document_number` IA test (`IA-TEST-001/2025`) sama persis di setiap run, dan aplikasi belum punya fitur hapus IA dari UI, jadi data uji menumpuk seiring waktu. | `document_number` dibuat unik per run pakai timestamp (`IA-TEST-${Date.now()}/2025`), supaya tidak terlihat seperti duplikat persis dan tetap bisa dikenali untuk dibersihkan manual lewat database bila perlu. |
| `04-kerjasama-expired.spec.js` | Test mengharapkan field `expired` dan `nearExpiry` langsung di root JSON, padahal endpoint sebenarnya mengembalikan `{ success, data: { expired, soon_expired, active, threshold_days } }`. | Assertion disesuaikan dengan struktur JSON yang sebenarnya dikembalikan controller. |

Semua perbaikan di atas sudah diverifikasi dengan menjalankan ulang seluruh
suite (39 test) dua kali berturut-turut secara end-to-end (server Express +
MySQL nyata) — hasilnya **39/39 passed** dan idempoten (bisa dijalankan
berulang tanpa konflik data).

## Catatan / keterbatasan yang diketahui

- **Tidak ada fitur hapus IA** dari sisi aplikasi (route maupun UI), jadi data
  test "tambah IA baru berhasil" akan terus menumpuk di tabel
  `implementation_arrangements` setiap kali test dijalankan. Ini bukan bug
  test, tapi keterbatasan aplikasi. Bersihkan manual lewat database jika
  diperlukan:
  ```sql
  DELETE FROM implementation_arrangements WHERE title = 'Test IA Playwright 2025';
  ```
- `playwright.config.js` belum mengonfigurasi opsi `webServer`, jadi pastikan
  `npm start` sudah jalan secara manual sebelum `npm test`.
