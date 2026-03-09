-- schema.sql
-- Jalankan: npx wrangler d1 execute pmb-man1-tasik --file=schema.sql --remote

CREATE TABLE IF NOT EXISTS admins (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  username    TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL,
  nama_lengkap TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pendaftar (
  id                          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  created_at                  TEXT DEFAULT (datetime('now')),
  no_pendaftaran              TEXT,
  ruang_tes                   TEXT,
  status_kelulusan            TEXT DEFAULT 'PENDING',  -- PENDING | DITERIMA | TIDAK DITERIMA
  status_verifikasi           INTEGER,                 -- NULL=pending, 1=diterima, 0=ditolak
  jalur                       TEXT NOT NULL,           -- REGULER | PRESTASI
  nisn                        TEXT NOT NULL,
  nik                         TEXT NOT NULL,
  nama_lengkap                TEXT NOT NULL,
  jenis_kelamin               TEXT,
  tempat_lahir                TEXT,
  tanggal_lahir               TEXT,
  ukuran_baju                 TEXT,
  agama                       TEXT DEFAULT 'Islam',
  jumlah_saudara              INTEGER,
  anak_ke                     INTEGER,
  status_anak                 TEXT,
  provinsi                    TEXT,
  kabupaten_kota              TEXT,
  kecamatan                   TEXT,
  desa_kelurahan              TEXT,
  rt                          TEXT,
  rw                          TEXT,
  alamat_lengkap              TEXT,
  kode_pos                    TEXT,
  no_kk                       TEXT,
  nama_ayah                   TEXT,
  nik_ayah                    TEXT,
  tempat_lahir_ayah           TEXT,
  tanggal_lahir_ayah          TEXT,
  status_ayah                 TEXT,
  pendidikan_ayah             TEXT,
  pekerjaan_ayah              TEXT,
  penghasilan_ayah            REAL,
  nama_ibu                    TEXT,
  nik_ibu                     TEXT,
  tempat_lahir_ibu            TEXT,
  tanggal_lahir_ibu           TEXT,
  status_ibu                  TEXT,
  pendidikan_ibu              TEXT,
  pekerjaan_ibu               TEXT,
  penghasilan_ibu             REAL,
  no_telepon_ortu             TEXT,
  nama_wali                   TEXT,
  nik_wali                    TEXT,
  tempat_lahir_wali           TEXT,
  tanggal_lahir_wali          TEXT,
  pendidikan_wali             TEXT,
  pekerjaan_wali              TEXT,
  penghasilan_wali            REAL,
  no_telepon_wali             TEXT,
  asal_sekolah                TEXT,
  npsn_sekolah                TEXT,
  status_sekolah              TEXT,
  alamat_sekolah              TEXT,
  pilihan_pesantren           TEXT,
  foto_url                    TEXT,
  scan_kk_url                 TEXT,
  scan_akta_url               TEXT,
  scan_kelakuan_baik_url      TEXT,
  scan_ktp_ortu_url           TEXT,
  scan_sertifikat_prestasi_url TEXT,
  scan_rapor_url              TEXT,
  tanggal_tes                 TEXT,
  sesi_tes                    TEXT
);

CREATE TABLE IF NOT EXISTS prestasi (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  pendaftar_id    TEXT,
  kategori        TEXT,
  nama_lomba      TEXT,
  penyelenggara   TEXT,
  tingkat         TEXT,
  tahun_perolehan TEXT,
  FOREIGN KEY (pendaftar_id) REFERENCES pendaftar(id)
);

CREATE TABLE IF NOT EXISTS pengaturan (
  key       TEXT PRIMARY KEY,
  value     TEXT,
  is_active INTEGER DEFAULT 1
);

-- Data awal pengaturan
INSERT OR IGNORE INTO pengaturan (key, value) VALUES
  ('TANGGAL_PENGUMUMAN_PRESTASI', '2026-04-18T00:00:00'),
  ('TANGGAL_PENGUMUMAN_REGULER',  '2026-05-25T00:00:00'),
  ('PMB_OPEN',                    'true');

-- Admin default (password: admin123 — ganti setelah deploy!)
INSERT OR IGNORE INTO admins (username, password, nama_lengkap) VALUES
  ('admin', 'admin123', 'Administrator');