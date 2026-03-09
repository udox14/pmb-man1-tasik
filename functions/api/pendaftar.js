// functions/api/pendaftar.js
// GET  /api/pendaftar?id=xxx    — ambil data satu pendaftar (untuk dashboard siswa)
// POST /api/pendaftar           — submit pendaftaran baru

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return Response.json({ error: 'ID diperlukan.' }, { status: 400, headers: CORS });
  }

  try {
    const data = await env.DB.prepare(
      'SELECT * FROM pendaftar WHERE id = ?'
    ).bind(id).first();

    if (!data) {
      return Response.json({ error: 'Data tidak ditemukan.' }, { status: 404, headers: CORS });
    }

    // Konversi status_verifikasi integer ke boolean/null sesuai behaviour lama
    data.status_verifikasi = data.status_verifikasi === null
      ? null
      : data.status_verifikasi === 1;

    return Response.json(data, { headers: CORS });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();

    // Generate no_pendaftaran format 2627XXX — berurutan
    // 26 = tahun masuk, 27 = tahun lulus, XXX = nomor urut 3 digit
    const countRow = await env.DB.prepare(
      'SELECT COUNT(*) as total FROM pendaftar'
    ).first();
    const urut = (countRow.total || 0) + 1;
    const no_pendaftaran = `2627${String(urut).padStart(3, '0')}`;

    const id = crypto.randomUUID();

    await env.DB.prepare(`
      INSERT INTO pendaftar (
        id, no_pendaftaran, jalur, nisn, nik, nama_lengkap, jenis_kelamin,
        tempat_lahir, tanggal_lahir, ukuran_baju, agama, jumlah_saudara, anak_ke, status_anak,
        provinsi, kabupaten_kota, kecamatan, desa_kelurahan, rt, rw, alamat_lengkap, kode_pos,
        no_kk,
        nama_ayah, nik_ayah, tempat_lahir_ayah, tanggal_lahir_ayah, status_ayah,
        pendidikan_ayah, pekerjaan_ayah, penghasilan_ayah,
        nama_ibu, nik_ibu, tempat_lahir_ibu, tanggal_lahir_ibu, status_ibu,
        pendidikan_ibu, pekerjaan_ibu, penghasilan_ibu,
        no_telepon_ortu,
        nama_wali, nik_wali, tempat_lahir_wali, tanggal_lahir_wali,
        pendidikan_wali, pekerjaan_wali, penghasilan_wali, no_telepon_wali,
        asal_sekolah, npsn_sekolah, status_sekolah, alamat_sekolah, pilihan_pesantren,
        foto_url, scan_kk_url, scan_akta_url, scan_kelakuan_baik_url,
        scan_ktp_ortu_url, scan_sertifikat_prestasi_url, scan_rapor_url
      ) VALUES (
        ?,?,?,?,?,?,?,
        ?,?,?,?,?,?,?,
        ?,?,?,?,?,?,?,?,
        ?,
        ?,?,?,?,?,?,?,?,
        ?,?,?,?,?,?,?,?,
        ?,
        ?,?,?,?,?,?,?,?,
        ?,?,?,?,?,
        ?,?,?,?,?,?,?
      )
    `).bind(
      id, no_pendaftaran, body.jalur, body.nisn, body.nik, body.nama_lengkap, body.jenis_kelamin,
      body.tempat_lahir, body.tanggal_lahir, body.ukuran_baju, body.agama ?? 'Islam',
      body.jumlah_saudara, body.anak_ke, body.status_anak,
      body.provinsi, body.kabupaten_kota, body.kecamatan, body.desa_kelurahan,
      body.rt, body.rw, body.alamat_lengkap, body.kode_pos,
      body.no_kk,
      body.nama_ayah, body.nik_ayah, body.tempat_lahir_ayah ?? null, body.tanggal_lahir_ayah ?? null,
      body.status_ayah ?? null, body.pendidikan_ayah, body.pekerjaan_ayah, body.penghasilan_ayah ?? null,
      body.nama_ibu, body.nik_ibu, body.tempat_lahir_ibu ?? null, body.tanggal_lahir_ibu ?? null,
      body.status_ibu ?? null, body.pendidikan_ibu, body.pekerjaan_ibu, body.penghasilan_ibu ?? null,
      body.no_telepon_ortu,
      body.nama_wali ?? null, body.nik_wali ?? null, body.tempat_lahir_wali ?? null,
      body.tanggal_lahir_wali ?? null, body.pendidikan_wali ?? null,
      body.pekerjaan_wali ?? null, body.penghasilan_wali ?? null, body.no_telepon_wali ?? null,
      body.asal_sekolah, body.npsn_sekolah, body.status_sekolah, body.alamat_sekolah, body.pilihan_pesantren,
      body.foto_url ?? null, body.scan_kk_url ?? null, body.scan_akta_url ?? null,
      body.scan_kelakuan_baik_url ?? null, body.scan_ktp_ortu_url ?? null,
      body.scan_sertifikat_prestasi_url ?? null, body.scan_rapor_url ?? null
    ).run();

    const inserted = await env.DB.prepare(
      'SELECT * FROM pendaftar WHERE id = ?'
    ).bind(id).first();

    return Response.json(inserted, { status: 201, headers: CORS });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}