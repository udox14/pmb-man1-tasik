// functions/api/pendaftar-edit.js
// POST /api/pendaftar-edit — siswa update data sendiri
// Body: { id, ...fields } — hanya field yang dikirim yang diupdate

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

// Field yang boleh diupdate oleh siswa (bukan status verifikasi/kelulusan)
const ALLOWED_FIELDS = [
  'nik', 'nama_lengkap', 'jenis_kelamin', 'tempat_lahir', 'tanggal_lahir',
  'ukuran_baju', 'jumlah_saudara', 'anak_ke', 'status_anak',
  'provinsi', 'kabupaten_kota', 'kecamatan', 'desa_kelurahan',
  'rt', 'rw', 'alamat_lengkap', 'kode_pos', 'no_kk',
  'nama_ayah', 'nik_ayah', 'pendidikan_ayah', 'pekerjaan_ayah', 'penghasilan_ayah',
  'nama_ibu', 'nik_ibu', 'pendidikan_ibu', 'pekerjaan_ibu', 'penghasilan_ibu',
  'no_telepon_ortu',
  'asal_sekolah', 'npsn_sekolah', 'status_sekolah', 'alamat_sekolah', 'pilihan_pesantren',
  // URL berkas (untuk upload ulang)
  'foto_url', 'scan_kk_url', 'scan_akta_url', 'scan_kelakuan_baik_url',
  'scan_ktp_ortu_url', 'scan_sertifikat_prestasi_url', 'scan_rapor_url',
  // URL dokumen daftar ulang (hanya untuk yang DITERIMA)
  'daftar_ulang_pesantren_url', 'daftar_ulang_tertib_url',
];

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { id, ...fields } = body;

    if (!id) {
      return Response.json({ error: 'ID pendaftar diperlukan.' }, { status: 400, headers: CORS });
    }

    // Pastikan pendaftar dengan id ini ada
    const existing = await env.DB.prepare(
      'SELECT id FROM pendaftar WHERE id = ?'
    ).bind(id).first();

    if (!existing) {
      return Response.json({ error: 'Data tidak ditemukan.' }, { status: 404, headers: CORS });
    }

    // Filter hanya field yang diizinkan
    const updateFields = Object.entries(fields)
      .filter(([key]) => ALLOWED_FIELDS.includes(key));

    if (updateFields.length === 0) {
      return Response.json({ error: 'Tidak ada field yang valid untuk diupdate.' }, { status: 400, headers: CORS });
    }

    // Build query dinamis
    const setClauses = updateFields.map(([key]) => `${key} = ?`).join(', ');
    const values = updateFields.map(([, val]) => val);
    values.push(id);

    await env.DB.prepare(
      `UPDATE pendaftar SET ${setClauses} WHERE id = ?`
    ).bind(...values).run();

    // Return data terbaru
    const updated = await env.DB.prepare(
      'SELECT * FROM pendaftar WHERE id = ?'
    ).bind(id).first();

    updated.status_verifikasi = updated.status_verifikasi === null
      ? null
      : updated.status_verifikasi === 1;

    return Response.json({ success: true, data: updated }, { headers: CORS });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}